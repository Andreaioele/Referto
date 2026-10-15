import { Icona } from '../Icona'
import { Collegamento } from '../Collegamento'
import { useAzioni } from '../azioni'
import { documenti, messaggioStudio, paziente, prossimeVisite } from './dati'
import { dataLunga, oggiPerEsteso, saluto } from './date'
import { MarchioReferto } from './Struttura'
import { RigaDocumento, SchedaVisita } from './elementi'

export function Home() {
  const { spiega, apriDocumento, refertoAttivo } = useAzioni()
  const nuovo = documenti.find((d) => d.nuovo && d.referto)
  const prossima = prossimeVisite[0]
  const ultimi = documenti.slice(0, 3)

  return (
    <>
      <div className="titolo-pagina benvenuto">
        <p className="benvenuto-data">{oggiPerEsteso()}</p>
        <h1>
          {saluto()}, {paziente.nome}
        </h1>
      </div>

      {nuovo && (
        <section className="scheda avviso-referto" aria-labelledby="titolo-nuovo-referto">
          {refertoAttivo && <MarchioReferto grande />}
          <div className="avviso-referto-testo">
            <h2 id="titolo-nuovo-referto">È arrivato un nuovo referto</h2>
            <p>
              {nuovo.titolo} del {dataLunga(nuovo.giorni)}. {refertoAttivo ? 'Puoi aprirlo oppure fartelo spiegare in parole semplici.' : 'Puoi aprirlo quando vuoi.'}
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
        </section>
      )}

      {prossima && (
        <section className="scheda" aria-labelledby="titolo-prossima">
          <div className="scheda-testa">
            <h2 id="titolo-prossima">La prossima visita</h2>
            <Collegamento href="/visite" className="solo-computer">
              Vedi tutte le visite
            </Collegamento>
          </div>
          <SchedaVisita visita={prossima} inEvidenza nuda />
          <Collegamento href="/visite" className="solo-telefono collegamento-centrato">
            Vedi tutte le visite
          </Collegamento>
        </section>
      )}

      <button type="button" className="bottone solo-telefono">
        <Icona nome="piu" dimensione={22} />
        Prenota una visita
      </button>

      <section className="scheda" aria-labelledby="titolo-documenti">
        <div className="scheda-testa">
          <h2 id="titolo-documenti">Ultimi documenti</h2>
          <Collegamento href="/documenti" className="solo-computer">
            Vedi tutti i documenti
          </Collegamento>
        </div>
        <div className="elenco-documenti">
          {ultimi.map((documento) => (
            <RigaDocumento key={documento.id} documento={documento} compatta />
          ))}
        </div>
        <Collegamento href="/documenti" className="solo-telefono collegamento-centrato">
          Vedi tutti i documenti
        </Collegamento>
      </section>

      <section className="scheda scheda-messaggio">
        <span className="icona-tonda">
          <Icona nome="messaggio" dimensione={22} />
        </span>
        <div>
          <h3>Un messaggio dallo studio</h3>
          <p className="tenue">{messaggioStudio}</p>
        </div>
      </section>
    </>
  )
}
