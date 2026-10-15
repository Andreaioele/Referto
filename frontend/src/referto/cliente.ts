import type { PDFDocumentProxy } from 'pdfjs-dist'
import { apriPdf } from './pdf'

/**
 * Client di Referto verso il backend (sempre su /api: Vite in sviluppo, Vercel
 * in produzione). Restituisce dati ed errori già pronti per la persona: chi lo
 * usa non legge stati HTTP né flussi SSE.
 */

/** Errore già scritto per la persona, da mostrare così com'è. */
export class ErroreServizio extends Error {}

const NON_DISPONIBILE = 'Il servizio non è disponibile in questo momento. Riprova tra poco.'
const INTERROTTO = 'Collegamento interrotto. Riprova tra poco.'
const RISPOSTA_INTERROTTA = 'La risposta si è interrotta. Riprova tra poco.'
const FOGLIETTO_NON_DISPONIBILE = 'Il foglietto illustrativo non è disponibile in questo momento. Riprova tra poco.'

/** Il messaggio per la persona per ogni stato HTTP, secondo cosa stava facendo. */
function messaggioPerStato(stato: number, attivita: 'spiegazione' | 'foglietto'): string {
  if (stato === 429) {
    return attivita === 'spiegazione'
      ? 'Hai inviato molti messaggi di seguito. Aspetta un minuto e riprova.'
      : 'Hai fatto molte domande di seguito. Aspetta un minuto e riprova.'
  }
  if (attivita === 'foglietto' && stato === 404) return 'Questo farmaco non è nella banca dati AIFA.'
  if (attivita === 'foglietto' && stato === 502) return FOGLIETTO_NON_DISPONIBILE
  return NON_DISPONIBILE
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
  | { tipo: 'fine'; conversazione: string | null }
  | { tipo: 'errore'; messaggio: string }

/**
 * Manda il messaggio al Mother agent e passa a `suEvento` i pezzi di testo man
 * mano che arrivano. Garanzia: la risposta finisce sempre con un solo evento
 * "fine" oppure "errore" (anche se la rete cade o il flusso si chiude prima),
 * tranne quando `segnale` la annulla: allora non arriva più nulla. Non lancia mai.
 */
export async function spiega(
  messaggio: string,
  conversazione: string | null,
  suEvento: (evento: EventoChat) => void,
  segnale: AbortSignal,
): Promise<void> {
  const errore = (testo: string) => {
    if (!interrotta(segnale)) suEvento({ tipo: 'errore', messaggio: testo })
  }
  let risposta: Response
  try {
    risposta = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(conversazione ? { messaggio, conversazione } : { messaggio }),
      signal: segnale,
    })
  } catch {
    return errore(INTERROTTO)
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
    return errore(INTERROTTO)
  }
  errore(RISPOSTA_INTERROTTA)
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
  throw motivo instanceof ErroreServizio ? motivo : new ErroreServizio(FOGLIETTO_NON_DISPONIBILE)
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
    throw new ErroreServizio(INTERROTTO)
  }
  if (!risposta.ok) throw new ErroreServizio(messaggioPerStato(risposta.status, 'foglietto'))
  return (await risposta.json()) as RispostaFoglietto
}
