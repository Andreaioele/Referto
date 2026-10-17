import type { PDFDocumentProxy } from 'pdfjs-dist'
import { apriPdf } from './pdf'
import { t } from '../lingua/lingua'

/**
 * Client di Referto verso il backend (sempre su /api: Vite in sviluppo, Vercel
 * in produzione). Restituisce dati ed errori già pronti per la persona: chi lo
 * usa non legge stati HTTP né flussi SSE.
 */

/** Errore già scritto per la persona (nella lingua scelta), da mostrare così com'è. */
export class ErroreServizio extends Error {}

const NON_DISPONIBILE = () => t('Il servizio non è disponibile in questo momento. Riprova tra poco.')
const INTERROTTO = () => t('Collegamento interrotto. Riprova tra poco.')
const RISPOSTA_INTERROTTA = () => t('La risposta si è interrotta. Riprova tra poco.')
const FOGLIETTO_NON_DISPONIBILE = () => t('Il foglietto illustrativo non è disponibile in questo momento. Riprova tra poco.')

/** Il messaggio per la persona per ogni stato HTTP, secondo cosa stava facendo. */
function messaggioPerStato(stato: number, attivita: 'spiegazione' | 'foglietto'): string {
  if (stato === 429) {
    return attivita === 'spiegazione'
      ? t('Hai inviato molti messaggi di seguito. Aspetta un minuto e riprova.')
      : t('Hai fatto molte domande di seguito. Aspetta un minuto e riprova.')
  }
  if (attivita === 'foglietto' && stato === 404) return t('Questo farmaco non è nella banca dati AIFA.')
  if (attivita === 'foglietto' && stato === 502) return FOGLIETTO_NON_DISPONIBILE()
  return NON_DISPONIBILE()
}

function interrotta(segnale?: AbortSignal): boolean {
  return Boolean(segnale?.aborted)
}

/* ── Stato del backend ── */

export interface StatoBackend {
  stato: string
  fonte: string
  aggiornato: string
  farmaci: number
  codici_atc: number
}

export async function statoBackend(segnale?: AbortSignal): Promise<StatoBackend> {
  const risposta = await fetch('/api/salute', { signal: segnale })
  if (!risposta.ok) throw new Error(`Il backend ha risposto ${risposta.status}`)
  return (await risposta.json()) as StatoBackend
}

/* ── Spiegazione (Mother agent, POST /api/chat in streaming) ── */

export type EventoChat =
  | { tipo: 'testo'; testo: string }
  /** da_cache: spiegazione già preparata per questo referto, restituita senza rigenerarla. */
  | { tipo: 'fine'; conversazione: string | null; da_cache?: boolean }
  | { tipo: 'errore'; messaggio: string }

/**
 * Manda il messaggio al Mother agent e passa a `suEvento` i pezzi di testo man
 * mano che arrivano. Garanzia: la risposta finisce sempre con un solo evento
 * "fine" oppure "errore" (anche se la rete cade o il flusso si chiude prima),
 * tranne quando `segnale` la annulla: allora non arriva più nulla. Non lancia mai.
 * Con `classificazione` il backend sa che serve solo la riga ARGOMENTO: finisce
 * comunque la spiegazione e la salva, ma non apre una conversazione.
 */
export async function spiega(
  messaggio: string,
  conversazione: string | null,
  suEvento: (evento: EventoChat) => void,
  segnale: AbortSignal,
  { classificazione = false }: { classificazione?: boolean } = {},
): Promise<void> {
  const errore = (testo: string) => {
    if (!interrotta(segnale)) suEvento({ tipo: 'errore', messaggio: testo })
  }
  let risposta: Response
  try {
    risposta = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(conversazione ? { messaggio, conversazione } : classificazione ? { messaggio, classificazione } : { messaggio }),
      signal: segnale,
    })
  } catch {
    return errore(INTERROTTO())
  }
  if (!risposta.ok || !risposta.body) return errore(messaggioPerStato(risposta.status, 'spiegazione'))

  const lettore = risposta.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ''
  try {
    for (;;) {
      const { value, done } = await lettore.read()
      if (done) break
      resto += value
      const righe = resto.split('\n')
      resto = righe.pop() ?? ''
      for (const riga of righe) {
        const evento = leggiRiga(riga)
        if (!evento || interrotta(segnale)) continue
        suEvento(evento)
        if (evento.tipo !== 'testo') {
          void lettore.cancel()
          return
        }
      }
    }
  } catch {
    return errore(INTERROTTO())
  }
  errore(RISPOSTA_INTERROTTA())
}

/** Evento di una riga "data: {...}" del flusso; null per commenti e righe non valide. */
function leggiRiga(riga: string): EventoChat | null {
  if (!riga.startsWith('data: ')) return null
  try {
    return JSON.parse(riga.slice(6)) as EventoChat
  } catch {
    return null
  }
}

/* ── Foglietti illustrativi AIFA ── */

export interface SezioneFoglietto {
  numero: number
  titolo: string
  pagina: number
}

export interface InfoFoglietto {
  cod: string
  nome: string
  ditta: string
  principio_attivo: string
  url_aifa: string
  pagine: number
  /** Intestazione del foglio scelto: un PDF AIFA può contenere un foglio per ogni formulazione. */
  titolo_foglio: string
  sezioni: SezioneFoglietto[]
}

export interface BranoFoglietto {
  sezione: number
  titolo: string
  pagina: number
  testo: string
}

export interface RispostaFoglietto {
  risposta: string
  sezione: number | null
  trovata: boolean
  origine: 'agente' | 'foglietto' | 'nessuna'
  brani: BranoFoglietto[]
}

/** PDF ufficiale AIFA servito dal backend (stesso dominio: niente blocchi del browser). */
export function urlPdfFoglietto(cod: string): string {
  return `/api/foglietti/${encodeURIComponent(cod)}/pdf`
}

/**
 * Dati del foglio (sezioni e pagine) e PDF già aperto. `forma` è la confezione
 * prescritta: sceglie il foglio giusto quando il PDF ne ha più di uno. Lancia
 * ErroreServizio; se una delle due parti fallisce, il PDF eventualmente aperto
 * viene chiuso. Chi chiama chiude il PDF quando non serve più.
 */
export async function apriFoglietto(
  cod: string,
  forma: string,
  segnale?: AbortSignal,
): Promise<{ info: InfoFoglietto; pdf: PDFDocumentProxy }> {
  const [info, pdf] = await Promise.allSettled([infoFoglietto(cod, forma, segnale), apriPdf(urlPdfFoglietto(cod))])
  if (info.status === 'fulfilled' && pdf.status === 'fulfilled') return { info: info.value, pdf: pdf.value }
  if (pdf.status === 'fulfilled') void pdf.value.destroy()
  const motivo = info.status === 'rejected' ? info.reason : (pdf as PromiseRejectedResult).reason
  if (interrotta(segnale)) throw motivo
  throw motivo instanceof ErroreServizio ? motivo : new ErroreServizio(FOGLIETTO_NON_DISPONIBILE())
}

async function infoFoglietto(cod: string, forma: string, segnale?: AbortSignal): Promise<InfoFoglietto> {
  const parametri = new URLSearchParams({ forma })
  const risposta = await fetch(`/api/foglietti/${encodeURIComponent(cod)}?${parametri}`, { signal: segnale })
  if (!risposta.ok) throw new ErroreServizio(messaggioPerStato(risposta.status, 'foglietto'))
  return (await risposta.json()) as InfoFoglietto
}

/** Risposta alla domanda usando solo il foglio. Lancia ErroreServizio (o l'errore di annullamento se `segnale` è annullato). */
export async function chiediAlFoglietto(
  cod: string,
  domanda: string,
  forma: string,
  segnale?: AbortSignal,
): Promise<RispostaFoglietto> {
  let risposta: Response
  try {
    risposta = await fetch(`/api/foglietti/${encodeURIComponent(cod)}/domande`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domanda, forma }),
      signal: segnale,
    })
  } catch (motivo) {
    if (interrotta(segnale)) throw motivo
    throw new ErroreServizio(INTERROTTO())
  }
  if (!risposta.ok) throw new ErroreServizio(messaggioPerStato(risposta.status, 'foglietto'))
  return (await risposta.json()) as RispostaFoglietto
}

/* ── Classificazione del referto (Mother agent) ── */

/** Di che cosa parla il referto, come lo scrive il Mother agent nella riga ARGOMENTO. */
export interface Classificazione {
  esame: string
  area: string
}

const AREA_NON_CAPITA = () => t('Non sono riuscito a capire di che area è il referto. Puoi sceglierla tu qui sotto.')

/**
 * Chiede al Mother agent di leggere il referto e si ferma appena arriva la riga
 * "ARGOMENTO: esame · area" (è la prima della risposta): serve solo la
 * classificazione, non tutta la spiegazione. Lancia ErroreServizio se la riga
 * non arriva; l'errore di annullamento se `segnale` è annullato.
 */
export async function classifica(testo: string, segnale?: AbortSignal): Promise<Classificazione> {
  const interno = new AbortController()
  const annulla = () => interno.abort()
  segnale?.addEventListener('abort', annulla)
  let letto = ''
  let errore: string | null = null
  let trovata: (c: Classificazione | null) => void = () => undefined
  const pronta = new Promise<Classificazione | null>((risolvi) => (trovata = risolvi))
  // Si risponde appena la riga ARGOMENTO è completa: il resto della spiegazione non serve.
  void spiega(
    testo,
    null,
    (evento) => {
      if (evento.tipo === 'testo') {
        letto += evento.testo
        const argomento = /ARGOMENTO:\s*(.+?)\s*·\s*([^\n]+)\n/.exec(letto)
        if (argomento) {
          trovata({ esame: argomento[1].trim(), area: argomento[2].trim() })
          interno.abort()
        }
      } else if (evento.tipo === 'errore') errore = evento.messaggio
    },
    interno.signal,
    { classificazione: true },
  ).then(() => {
    // Flusso finito senza "a capo" dopo la riga: vale la riga com'è.
    const argomento = /ARGOMENTO:\s*(.+?)\s*·\s*([^\n]+)/.exec(letto)
    trovata(argomento ? { esame: argomento[1].trim(), area: argomento[2].trim() } : null)
  })
  try {
    const risultato = await Promise.race([
      pronta,
      new Promise<null>((risolvi) => segnale?.addEventListener('abort', () => risolvi(null))),
    ])
    if (segnale?.aborted) throw new DOMException('Classificazione annullata', 'AbortError')
    if (risultato) return risultato
    throw new ErroreServizio(errore ?? AREA_NON_CAPITA())
  } finally {
    segnale?.removeEventListener('abort', annulla)
  }
}

/* ── Strutture di Milano ── */

export type TipoStruttura =
  | 'ospedale'
  | 'casa-di-cura'
  | 'ambulatorio'
  | 'laboratorio'
  | 'medico-di-famiglia'
  | 'pediatra'
  | 'studio-medico'
  | 'farmacia'
  | 'consultorio'
  | 'riabilitazione'
  | 'dipendenze'
  | 'centro-trasfusionale'

export interface StrutturaVicina {
  id: string
  tipo: TipoStruttura
  nome: string
  /** Quando non è un medico: "Fisioterapista", "Psicoterapeuta". */
  professione?: string
  aree: string[]
  reparti?: string[]
  indirizzo: string
  cap?: string
  municipio?: string
  quartiere?: string
  lat: number
  lon: number
  telefono?: string
  sito?: string
  orari?: string
  altreSedi?: Array<{ indirizzo: string; lat: number; lon: number }>
  fonte: 'comune-milano' | 'openstreetmap' | 'overture'
  /** In linea d'aria dal punto di partenza. */
  distanzaKm: number
}

export interface GruppoStrutture {
  id: 'specialisti' | 'medici' | 'ospedali'
  totale: number
  strutture: StrutturaVicina[]
}

export interface AreaStrutture {
  id: string
  etichetta: string
  /** Per le frasi: "Chiedi del reparto di ..." */
  reparto: string
}

export interface InfoStrutture {
  aree: AreaStrutture[]
  citta: string
  generato: string
  totale: number
  fonti: Array<{ nome: string; url: string; licenza: string; aggiornato?: string }>
}

interface Punto {
  lat: number
  lon: number
}

async function getStrutture<T>(parametri: Record<string, string | number>, segnale?: AbortSignal): Promise<T> {
  const query = new URLSearchParams(Object.entries(parametri).map(([k, v]) => [k, String(v)]))
  let risposta: Response
  try {
    risposta = await fetch(`/api/strutture?${query}`, { signal: segnale })
  } catch (motivo) {
    if (interrotta(segnale)) throw motivo
    throw new ErroreServizio(INTERROTTO())
  }
  if (!risposta.ok) throw new ErroreServizio(NON_DISPONIBILE())
  return (await risposta.json()) as T
}

/** "strutture": luoghi (ospedali, ambulatori, laboratori...); "professionisti": medici e studi. */
export type Categoria = 'strutture' | 'professionisti'

/** Strutture o professionisti per l'area del referto (anche scritta come la scrive il Mother agent), per gruppo, dal più vicino. */
export function struttureDellArea(
  area: string,
  da: Punto,
  limite: number,
  segnale?: AbortSignal,
  categoria: Categoria = 'strutture',
): Promise<{ area: AreaStrutture; gruppi: GruppoStrutture[] }> {
  return getStrutture({ area, categoria, lat: da.lat, lon: da.lon, limite }, segnale)
}

/** Le strutture di un tipo (es. farmacie), dalla più vicina. */
export function struttureDelTipo(tipo: TipoStruttura, da: Punto, limite: number, segnale?: AbortSignal): Promise<GruppoStrutture> {
  return getStrutture({ tipo, lat: da.lat, lon: da.lon, limite }, segnale)
}

/** Le aree della classificazione, con fonti e data dei dati. */
export async function infoStrutture(segnale?: AbortSignal): Promise<InfoStrutture> {
  let risposta: Response
  try {
    risposta = await fetch('/api/strutture/aree', { signal: segnale })
  } catch (motivo) {
    if (interrotta(segnale)) throw motivo
    throw new ErroreServizio(INTERROTTO())
  }
  if (!risposta.ok) throw new ErroreServizio(NON_DISPONIBILE())
  return (await risposta.json()) as InfoStrutture
}

/* ── Traduzione per l'interfaccia in inglese (POST /api/traduzione) ── */

export interface Traduzione {
  testo: string
  /** false: la traduzione non c'è o non ha passato il controllo del backend, `testo` è l'originale. */
  tradotto: boolean
}

const traduzioniFatte = new Map<string, Traduzione>()

/**
 * Traduce i testi nella lingua data: le risposte del Mother agent (sempre in
 * italiano) verso l'inglese, le domande scritte in inglese verso l'italiano.
 * Prima i testi fissi che il frontend conosce già (`en.ts`, deterministici),
 * poi il backend. Non lancia mai, tranne quando `segnale` annulla: se il
 * servizio non risponde restituisce gli originali con `tradotto: false`.
 */
export async function traduci(testi: string[], lingua: 'en' | 'it', segnale?: AbortSignal): Promise<Traduzione[]> {
  const risultati: Array<Traduzione | undefined> = testi.map((testo) => {
    if (!testo.trim()) return { testo, tradotto: true }
    if (lingua === 'en' && testoFisso(testo)) return { testo: testoFisso(testo)!, tradotto: true }
    return traduzioniFatte.get(`${lingua}\n${testo}`)
  })
  const mancanti = testi.filter((_, i) => !risultati[i])
  for (let inizio = 0; inizio < mancanti.length; inizio += 8) {
    const gruppo = mancanti.slice(inizio, inizio + 8)
    let tradotti: Traduzione[]
    try {
      const risposta = await fetch('/api/traduzione', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testi: gruppo, lingua }),
        signal: segnale,
      })
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`)
      tradotti = ((await risposta.json()) as { traduzioni: Traduzione[] }).traduzioni
    } catch (motivo) {
      if (interrotta(segnale)) throw motivo
      tradotti = gruppo.map((testo) => ({ testo, tradotto: false }))
    }
    gruppo.forEach((testo, i) => {
      const traduzione = tradotti[i] ?? { testo, tradotto: false }
      if (traduzione.tradotto) traduzioniFatte.set(`${lingua}\n${testo}`, traduzione)
      risultati[testi.indexOf(testo)] = traduzione
    })
  }
  return testi.map((testo, i) => risultati[i] ?? { testo, tradotto: false })
}

/** La traduzione di un testo fisso (errori, risposte senza modello), se il frontend la conosce. */
function testoFisso(testo: string): string | undefined {
  const tradotto = t(testo.trim())
  return tradotto !== testo.trim() ? tradotto : undefined
}

/** Solo per i test. */
export function dimenticaTraduzioni(): void {
  traduzioniFatte.clear()
}
