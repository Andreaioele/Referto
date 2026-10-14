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
