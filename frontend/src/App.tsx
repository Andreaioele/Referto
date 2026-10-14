import { useEffect, useState } from 'react'
import { statoBackend, type StatoBackend } from './api'

type Collegamento =
  | { tipo: 'in corso' }
  | { tipo: 'ok'; dati: StatoBackend }
  | { tipo: 'errore'; messaggio: string }

function App() {
  const [collegamento, setCollegamento] = useState<Collegamento>({ tipo: 'in corso' })

  useEffect(() => {
    const controllo = new AbortController()
    statoBackend(controllo.signal)
      .then((dati) => setCollegamento({ tipo: 'ok', dati }))
      .catch((errore: unknown) => {
        if (controllo.signal.aborted) return
        setCollegamento({ tipo: 'errore', messaggio: errore instanceof Error ? errore.message : String(errore) })
      })
    return () => controllo.abort()
  }, [])

  return (
    <div className="pagina">
      <header className="marchio">
        <div className="marchio-segno" aria-hidden="true">R</div>
        <div>
          <h1>Referto</h1>
          <p>Capire un referto medico in parole semplici</p>
        </div>
      </header>

      <main>
        <section className="scheda">
          <h2>Nuova interfaccia in costruzione</h2>
          <p>
            Qui arriveranno, una alla volta, le funzioni dell'app attuale: la spiegazione del referto,
            le parole difficili, i farmaci e dove andare.
          </p>
        </section>

        <section className="scheda" aria-live="polite">
          <h2>Collegamento con il backend</h2>
          {collegamento.tipo === 'in corso' && <p>Controllo in corso…</p>}
          {collegamento.tipo === 'ok' && (
            <p className="esito esito-ok">
              Collegato. Prontuario AIFA aggiornato al {dataItaliana(collegamento.dati.aggiornato)}, con{' '}
              {collegamento.dati.farmaci.toLocaleString('it-IT')} farmaci.
            </p>
          )}
          {collegamento.tipo === 'errore' && (
            <p className="esito esito-errore">Il backend non risponde ({collegamento.messaggio}).</p>
          )}
        </section>
      </main>

      <footer>
        Referto non fa diagnosi e non sostituisce il medico: spiega soltanto ciò che è scritto nel referto.
      </footer>
    </div>
  )
}

/** "2026-10-13" -> "13 ottobre 2026" */
function dataItaliana(iso: string): string {
  const data = new Date(`${iso}T00:00:00`)
  return Number.isNaN(data.getTime())
    ? iso
    : data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default App
