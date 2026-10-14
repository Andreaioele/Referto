import { useEffect, useRef, useState, type FormEvent } from 'react'
import { inviaMessaggio } from './servizio-chat'

interface Messaggio {
  autore: 'persona' | 'referto'
  testo: string
  errore?: boolean
}

const LUNGHEZZA_MASSIMA = 30000

/** Un errore non cancella la parte di risposta già arrivata: la segue. */
function segnalaErrore(risposta: Messaggio, messaggio: string): Messaggio {
  return risposta.testo
    ? { ...risposta, testo: `${risposta.testo}\n\n(${messaggio})`, errore: true }
    : { ...risposta, testo: messaggio, errore: true }
}

export function Chat() {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [bozza, setBozza] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const conversazione = useRef<string | null>(null)
  const controllo = useRef<AbortController | null>(null)
  const fine = useRef<HTMLDivElement>(null)

  useEffect(
    () => () => {
      controllo.current?.abort()
    },
    [],
  )
  useEffect(() => {
    // Corpo a blocchi: scrollIntoView può restituire una Promise, che React non accetta come pulizia.
    fine.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messaggi])

  /** Aggiorna l'ultimo messaggio (la risposta in arrivo). */
  function aggiornaRisposta(modifica: (risposta: Messaggio) => Messaggio) {
    setMessaggi((attuali) => [...attuali.slice(0, -1), modifica(attuali[attuali.length - 1])])
  }

  async function invia(evento: FormEvent) {
    evento.preventDefault()
    const testo = bozza.trim()
    if (!testo || inCorso) return
    setBozza('')
    setInCorso(true)
    setMessaggi((attuali) => [...attuali, { autore: 'persona', testo }, { autore: 'referto', testo: '' }])
    controllo.current = new AbortController()
    let concluso = false
    try {
      await inviaMessaggio(
        testo,
        conversazione.current,
        (e) => {
          if (e.tipo === 'testo') aggiornaRisposta((r) => ({ ...r, testo: r.testo + e.testo }))
          else if (e.tipo === 'fine') {
            concluso = true
            conversazione.current = e.conversazione
          } else {
            concluso = true
            aggiornaRisposta((r) => segnalaErrore(r, e.messaggio))
          }
        },
        controllo.current.signal,
      )
      if (!concluso) aggiornaRisposta((r) => segnalaErrore(r, 'La risposta si è interrotta. Riprova tra poco.'))
    } catch {
      if (!controllo.current.signal.aborted) {
        aggiornaRisposta((r) => segnalaErrore(r, 'Collegamento interrotto. Riprova tra poco.'))
      }
    } finally {
      setInCorso(false)
    }
  }

  function nuovaConversazione() {
    controllo.current?.abort()
    conversazione.current = null
    setMessaggi([])
    setBozza('')
    setInCorso(false)
  }

  return (
    <section className="scheda chat" aria-label="Spiegami un referto">
      <h2>Spiegami un referto</h2>
      <p className="avviso">
        Incolla il testo del referto oppure fai una domanda. Prima togli nome, codice fiscale e indirizzo.
      </p>

      {messaggi.length > 0 && (
        <div className="messaggi" aria-live="polite">
          {messaggi.map((messaggio, indice) => (
            <div key={indice} className={`messaggio messaggio-${messaggio.autore}${messaggio.errore ? ' messaggio-errore' : ''}`}>
              <div className="messaggio-autore">{messaggio.autore === 'persona' ? 'Tu' : 'Referto'}</div>
              <div className="messaggio-testo">
                {messaggio.testo.trimStart() || 'Sto leggendo il referto… può servire un minuto.'}
              </div>
            </div>
          ))}
          <div ref={fine} />
        </div>
      )}

      <form onSubmit={invia} className="chat-modulo">
        <label htmlFor="messaggio" className="nascosto">
          Testo del referto o domanda
        </label>
        <textarea
          id="messaggio"
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          maxLength={LUNGHEZZA_MASSIMA}
          rows={messaggi.length > 0 ? 3 : 8}
          placeholder={messaggi.length > 0 ? 'Fai una domanda sul referto…' : 'Incolla qui il testo del referto…'}
          disabled={inCorso}
        />
        <div className="chat-azioni">
          <button type="submit" disabled={inCorso || !bozza.trim()}>
            {inCorso ? 'Attendi…' : messaggi.length > 0 ? 'Invia' : 'Spiegami il referto'}
          </button>
          {messaggi.length > 0 && (
            <button type="button" className="secondario" onClick={nuovaConversazione}>
              Nuovo referto
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
