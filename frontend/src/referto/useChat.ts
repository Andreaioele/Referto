import { useCallback, useEffect, useRef, useState } from 'react'
import { spiega } from './cliente'

export interface Messaggio {
  autore: 'persona' | 'referto'
  testo: string
  errore?: boolean
  /** Il testo del referto mandato dal portale: non si ripete a schermo. */
  nascosto?: boolean
  /** Cosa si mostra a schermo, se diverso da ciò che si manda (domanda in inglese mandata in italiano). */
  mostra?: string
}

export interface OpzioniInvio {
  nascosto?: boolean
  /** Il testo da mostrare al posto di `testo` (es. la domanda pronta in inglese). */
  mostra?: string
  /** Prepara il messaggio da mandare partendo da `testo` (es. traduzione in italiano); la domanda si vede subito. */
  prepara?: (segnale: AbortSignal) => Promise<string>
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
  /** La spiegazione del referto è quella salvata dal backend (cache), non riscritta. */
  const [daCache, setDaCache] = useState(false)
  const conversazione = useRef<string | null>(null)
  const controllo = useRef<AbortController | null>(null)

  useEffect(() => () => controllo.current?.abort(), [])

  const invia = useCallback(async (testo: string, opzioni: OpzioniInvio = {}) => {
    const aggiornaRisposta = (modifica: (risposta: Messaggio) => Messaggio) =>
      setMessaggi((attuali) => [...attuali.slice(0, -1), modifica(attuali[attuali.length - 1])])

    controllo.current?.abort()
    const segnale = (controllo.current = new AbortController()).signal
    setInCorso(true)
    setMessaggi((attuali) => [
      ...attuali,
      { autore: 'persona', testo, nascosto: opzioni.nascosto, mostra: opzioni.mostra },
      { autore: 'referto', testo: '' },
    ])
    let messaggio = testo
    if (opzioni.prepara) {
      try {
        messaggio = await opzioni.prepara(segnale)
      } catch {
        return
      }
      if (segnale.aborted) return
    }
    // spiega() finisce sempre con "fine" o "errore" (rete caduta, flusso interrotto compresi).
    await spiega(
      messaggio,
      conversazione.current,
      (evento) => {
        if (evento.tipo === 'testo') aggiornaRisposta((r) => ({ ...r, testo: r.testo + evento.testo }))
        else if (evento.tipo === 'fine') {
          if (!conversazione.current) setDaCache(Boolean(evento.da_cache))
          conversazione.current = evento.conversazione
        }
        else aggiornaRisposta((r) => segnalaErrore(r, evento.messaggio))
      },
      segnale,
    )
    if (!segnale.aborted) setInCorso(false)
  }, [])

  const azzera = useCallback(() => {
    controllo.current?.abort()
    conversazione.current = null
    setDaCache(false)
    setMessaggi([])
    setInCorso(false)
  }, [])

  return { messaggi, inCorso, daCache, invia, azzera }
}
