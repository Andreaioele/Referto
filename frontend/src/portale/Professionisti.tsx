import { Icona } from '../Icona'
import { RigaStruttura } from '../referto/StruttureVicine'
import { paziente, SEDE_STUDIO, STUDIO, visite } from './dati'
import { dataLunga } from './date'
import { comeStruttura } from './distanza'
import { CercaDaiReferti, ElencoPrenotazioni } from './MieiLuoghi'
import { usePrenotazioni } from './prenotazioni'

/** Chi ha fatto le visite dello studio ma non è una persona (laboratorio, punto prelievi). */
const NON_PERSONE = /laboratorio|punto prelievi/i

/**
 * "I miei professionisti": solo i medici con cui hai fatto o prenotato una
 * visita. Il medico di famiglia, i medici delle visite dello studio e i
 * professionisti prenotati dalla ricerca in "I miei documenti".
 */
export function Professionisti() {
  const prenotazioni = usePrenotazioni().filter((p) => p.categoria === 'professionisti')
  const medici = new Map<string, { specialita: string; visite: typeof visite }>()
  for (const v of visite.filter((v) => !NON_PERSONE.test(v.medico))) {
    const voce = medici.get(v.medico) ?? { specialita: v.specialita, visite: [] }
    voce.visite.push(v)
    medici.set(v.medico, voce)
  }

  return (
    <>
      <div className="titolo-pagina">
        <h1>I miei professionisti</h1>
        <p className="tenue">I medici con cui hai fatto o prenotato una visita.</p>
      </div>

      <section className="scheda scheda-messaggio" aria-labelledby="titolo-mio-medico">
        <span className="icona-tonda">
          <Icona nome="stetoscopio" dimensione={22} />
        </span>
        <div>
          <h2 id="titolo-mio-medico">Il tuo medico di famiglia</h2>
          <p>
            <strong>{paziente.medico.nome}</strong>
          </p>
          <p className="tenue">{paziente.medico.orari}. È il primo a cui chiedere per ogni referto.</p>
        </div>
      </section>

      <section className="scheda" aria-labelledby="titolo-medici-visite">
        <div className="scheda-testa">
          <h2 id="titolo-medici-visite">Le tue visite allo studio</h2>
        </div>
        <ul className="strutture-elenco">
          {[...medici].map(([nome, { specialita, visite: sue }]) => {
            const prossima = sue.filter((v) => v.giorni >= 0).sort((a, b) => a.giorni - b.giorni)[0]
            const ultima = sue.filter((v) => v.giorni < 0).sort((a, b) => b.giorni - a.giorni)[0]
            const nota = [
              prossima && `Prossima visita: ${dataLunga(prossima.giorni)}`,
              ultima && `ultima visita: ${dataLunga(ultima.giorni)}`,
            ]
              .filter(Boolean)
              .join('; ')
            return (
              <RigaStruttura
                key={nome}
                struttura={comeStruttura({
                  id: `medico-${nome}`,
                  tipo: 'studio-medico',
                  nome,
                  professione: specialita,
                  indirizzo: `${STUDIO}, ${SEDE_STUDIO.indirizzo}`,
                  lat: SEDE_STUDIO.lat,
                  lon: SEDE_STUDIO.lon,
                  telefono: SEDE_STUDIO.telefono,
                })}
                nota={`${nota}.`}
              />
            )
          })}
        </ul>
      </section>

      <section className="scheda" aria-labelledby="titolo-professionisti-prenotati">
        <div className="scheda-testa">
          <h2 id="titolo-professionisti-prenotati">Prenotati da te</h2>
        </div>
        {prenotazioni.length > 0 ? (
          <ElencoPrenotazioni prenotazioni={prenotazioni} />
        ) : (
          <p className="tenue">Non hai ancora prenotato con altri professionisti.</p>
        )}
        <CercaDaiReferti cosa="professionisti" />
      </section>
    </>
  )
}
