import { useCallback, useEffect, useRef, useState } from 'react'
import { spiega } from './cliente'

export interface Messaggio {
  autore: 'persona' | 'referto'
  testo: string
  errore?: boolean
  /** Il testo del referto mandato dal portale: non si ripete a schermo. */
  nascosto?: boolean
}

/** Un errore non cancella la parte di risposta già arrivata: la segue. */
function segnalaErrore(risposta: Messaggio, messaggio: string): Messaggio {
  return risposta.testo
    ? { ...risposta, testo: `${risposta.testo}\n\n(${messaggio})`, errore: true }
    : { ...risposta, testo: messaggio, errore: true }
}

/** Conversazione con il Mother agent (POST /api/chat): la prima domanda è il referto, le altre lo continuano. */
export function useChat() {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [inCorso, setInCorso] = useState(false)
  const conversazione = useRef<string | null>(null)
  const controllo = useRef<AbortController | null>(null)

  useEffect(() => () => controllo.current?.abort(), [])

  const invia = useCallback(async (testo: string, opzioni: { nascosto?: boolean } = {}) => {
    const aggiornaRisposta = (modifica: (risposta: Messaggio) => Messaggio) =>
      setMessaggi((attuali) => [...attuali.slice(0, -1), modifica(attuali[attuali.length - 1])])

    controllo.current?.abort()
    const segnale = (controllo.current = new AbortController()).signal
    setInCorso(true)
    setMessaggi((attuali) => [...attuali, { autore: 'persona', testo, nascosto: opzioni.nascosto }, { autore: 'referto', testo: '' }])
    // spiega() finisce sempre con "fine" o "errore" (rete caduta, flusso interrotto compresi).
    await spiega(
      testo,
      conversazione.current,
      (evento) => {
        if (evento.tipo === 'testo') aggiornaRisposta((r) => ({ ...r, testo: r.testo + evento.testo }))
        else if (evento.tipo === 'fine') conversazione.current = evento.conversazione
        else aggiornaRisposta((r) => segnalaErrore(r, evento.messaggio))
      },
      segnale,
    )
    if (!segnale.aborted) setInCorso(false)
  }, [])

  const azzera = useCallback(() => {
    controllo.current?.abort()
    conversazione.current = null
    setMessaggi([])
    setInCorso(false)
  }, [])

  return { messaggi, inCorso, invia, azzera }
}
