/** Chiamate al backend: sempre su /api, inoltrato al backend da Vite (sviluppo) o da Vercel. */

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

/** Errore già scritto per la persona, da mostrare così com'è. */
export class ErroreServizio extends Error {}

function erroreDaStato(stato: number): ErroreServizio {
  if (stato === 429) return new ErroreServizio('Hai fatto molte domande di seguito. Aspetta un minuto e riprova.')
  if (stato === 404) return new ErroreServizio('Questo farmaco non è nella banca dati AIFA.')
  if (stato === 502) return new ErroreServizio('Il foglietto illustrativo non è disponibile in questo momento. Riprova tra poco.')
  return new ErroreServizio('Il servizio non è disponibile in questo momento. Riprova tra poco.')
}

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

/** `forma` è la confezione prescritta: serve a scegliere il foglio giusto quando il PDF ne ha più di uno. */
export async function infoFoglietto(cod: string, forma: string, segnale?: AbortSignal): Promise<InfoFoglietto> {
  const parametri = new URLSearchParams({ forma })
  const risposta = await fetch(`/api/foglietti/${encodeURIComponent(cod)}?${parametri}`, { signal: segnale })
  if (!risposta.ok) throw erroreDaStato(risposta.status)
  return (await risposta.json()) as InfoFoglietto
}

/** PDF ufficiale AIFA servito dal backend (stesso dominio: niente blocchi del browser). */
export function urlPdfFoglietto(cod: string): string {
  return `/api/foglietti/${encodeURIComponent(cod)}/pdf`
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

export async function domandaFoglietto(
  cod: string,
  domanda: string,
  forma: string,
  segnale?: AbortSignal,
): Promise<RispostaFoglietto> {
  const risposta = await fetch(`/api/foglietti/${encodeURIComponent(cod)}/domande`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domanda, forma }),
    signal: segnale,
  })
  if (!risposta.ok) throw erroreDaStato(risposta.status)
  return (await risposta.json()) as RispostaFoglietto
}
