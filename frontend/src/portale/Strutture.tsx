import { CercaDaiReferti, ElencoPrenotazioni } from './MieiLuoghi'
import { usePrenotazioni } from './prenotazioni'
import { SchedaStudio } from './SchedaStudio'

/**
 * "Le mie strutture": solo i luoghi dove hai fatto o prenotato una visita. Lo
 * studio del portale (card con le visite, `SchedaStudio`) e le strutture
 * prenotate dalla ricerca in "I miei documenti" (Cerca strutture -> Prenota una visita).
 */
export function Strutture() {
  const prenotazioni = usePrenotazioni().filter((p) => p.categoria === 'strutture')

  return (
    <>
      <div className="titolo-pagina">
        <h1>Le mie strutture</h1>
        <p className="tenue">I luoghi dove hai fatto o prenotato una visita.</p>
      </div>

      <section className="scheda studio-scheda" aria-label="Le tue visite">
        <SchedaStudio />
      </section>

      <section className="scheda" aria-labelledby="titolo-prenotate">
        <div className="scheda-testa">
          <h2 id="titolo-prenotate">Prenotate da te</h2>
        </div>
        {prenotazioni.length > 0 ? (
          <ElencoPrenotazioni prenotazioni={prenotazioni} />
        ) : (
          <p className="tenue">Non hai ancora prenotato in altre strutture.</p>
        )}
        <CercaDaiReferti cosa="strutture" />
      </section>
    </>
  )
}
