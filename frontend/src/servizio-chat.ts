/** Chat con il Mother agent tramite il backend: POST /api/chat, risposta in Server-Sent Events. */

export type EventoChat =
  | { tipo: 'testo'; testo: string }
  | { tipo: 'fine'; conversazione: string | null }
  | { tipo: 'errore'; messaggio: string }

export async function inviaMessaggio(
  messaggio: string,
  conversazione: string | null,
  suEvento: (evento: EventoChat) => void,
  segnale: AbortSignal,
): Promise<void> {
  const risposta = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(conversazione ? { messaggio, conversazione } : { messaggio }),
    signal: segnale,
  })
  if (risposta.status === 429) {
    suEvento({ tipo: 'errore', messaggio: 'Hai inviato molti messaggi di seguito. Aspetta un minuto e riprova.' })
    return
  }
  if (!risposta.ok || !risposta.body) {
    suEvento({ tipo: 'errore', messaggio: 'Il servizio non è disponibile in questo momento. Riprova tra poco.' })
    return
  }

  const lettore = risposta.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ''
  for (;;) {
    const { value, done } = await lettore.read()
    if (done) break
    resto += value
    const righe = resto.split('\n')
    resto = righe.pop() ?? ''
    for (const riga of righe) {
      if (!riga.startsWith('data: ')) continue
      try {
        suEvento(JSON.parse(riga.slice(6)) as EventoChat)
      } catch {
        // riga incompleta o non valida: si ignora
      }
    }
  }
}
