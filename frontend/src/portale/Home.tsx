import { Icona } from '../Icona'
import { Collegamento } from '../Collegamento'
import { useAzioni } from '../azioni'
import { documenti, farmaci, messaggioStudio, paziente, prossimeVisite } from './dati'
import { dataLunga, oggiPerEsteso, saluto } from './date'
import { MarchioReferto } from './Struttura'
import { Gruppo, RigaDocumento, SchedaVisita } from './elementi'

/**
 * Home: prima le cose da fare (come «To Do» di MyChart e i messaggi della NHS App),
 * poi la prossima visita e gli ultimi documenti. Righe in gruppi, non schede.
 */
export function Home() {
  const { spiega, apriDocumento, refertoAttivo } = useAzioni()
  const nuovo = documenti.find((d) => d.nuovo && d.referto)
  const daRitirare = farmaci.filter((f) => f.stato === 'da ritirare')
  const prossima = prossimeVisite[0]
  const ultimi = documenti.slice(0, 3)

  return (
    <>
      <div className="titolo-pagina">
        <h1>
          {saluto()}, {paziente.nome}
        </h1>
        <p className="tenue">{oggiPerEsteso()}</p>
      </div>

      {(nuovo || daRitirare.length > 0) && (
        <Gruppo id="titolo-da-fare" titolo="Da fare" icona="campanella" prioritario>
          {nuovo && (
            <div className="riga avviso-referto">
              {refertoAttivo && <MarchioReferto grande />}
              <div className="avviso-referto-testo">
                <h3>È arrivato un nuovo referto</h3>
                <p className="tenue">
                  {nuovo.titolo} del {dataLunga(nuovo.giorni)}.{' '}
                  {refertoAttivo ? 'Puoi aprirlo oppure fartelo spiegare con parole semplici.' : 'Puoi aprirlo quando vuoi.'}
                </p>
              </div>
              <div className="azioni">
                <button type="button" className="bottone-leggero" onClick={() => apriDocumento(nuovo)}>
                  Apri il referto
                </button>
                {refertoAttivo && (
                  <button type="button" className="bottone bottone-referto" onClick={() => spiega(nuovo)}>
                    <MarchioReferto />
                    Fatti spiegare il referto
                  </button>
                )}
              </div>
            </div>
          )}
          {daRitirare.map((farmaco) => (
            <div key={farmaco.id} className="riga riga-semplice">
              <Icona nome="pillola" dimensione={24} />
              <div className="riga-testo">
                <h3>Ritira in farmacia: {farmaco.nome}</h3>
                <p className="tenue">
                  Prescritta da {farmaco.medico} il {dataLunga(farmaco.giorni)}
                </p>
              </div>
              <Collegamento className="bottone-leggero" href="/prescrizioni">
                Vedi la ricetta
              </Collegamento>
            </div>
          ))}
        </Gruppo>
      )}

      {prossima && (
        <Gruppo id="titolo-prossima" titolo="Prossima visita" icona="calendario" collegamento={{ href: '/visite', testo: 'Tutte le visite' }}>
          <SchedaVisita visita={prossima} inEvidenza nuda />
        </Gruppo>
      )}

      <button type="button" className="bottone solo-telefono">
        <Icona nome="piu" dimensione={22} />
        Prenota una visita
      </button>

      <Gruppo id="titolo-documenti" titolo="Ultimi documenti" icona="documento" collegamento={{ href: '/documenti', testo: 'Tutti i documenti' }}>
        {ultimi.map((documento) => (
          <RigaDocumento key={documento.id} documento={documento} compatta />
        ))}
      </Gruppo>

      <Gruppo id="titolo-messaggio" titolo="Dallo studio" icona="messaggio">
        <p className="riga messaggio-studio">{messaggioStudio}</p>
      </Gruppo>
    </>
  )
}
