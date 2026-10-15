import { RigaStruttura } from '../referto/StruttureVicine'
import { prossimeVisite, SEDE_STUDIO, STUDIO, visiteFatte } from './dati'
import { dataLunga } from './date'
import { comeStruttura } from './distanza'
import { CercaDaiReferti, ElencoPrenotazioni } from './MieiLuoghi'
import { usePrenotazioni } from './prenotazioni'

/**
 * "Le mie strutture": solo i luoghi dove hai fatto o prenotato una visita. Lo
 * studio del portale (dalle visite) e le strutture prenotate dalla ricerca in
 * "I miei documenti" (Cerca strutture -> Prenota una visita).
 */
export function Strutture() {
  const prenotazioni = usePrenotazioni().filter((p) => p.categoria === 'strutture')
  const prossima = prossimeVisite[0]
  const ultima = visiteFatte[0]
  const nota = [
    prossima && `Prossima visita: ${prossima.titolo.toLowerCase()}, ${dataLunga(prossima.giorni)}`,
    ultima && `ultima: ${ultima.titolo.toLowerCase()}, ${dataLunga(ultima.giorni)}`,
  ]
    .filter(Boolean)
    .join('; ')

  return (
    <>
      <div className="titolo-pagina">
        <h1>Le mie strutture</h1>
        <p className="tenue">I luoghi dove hai fatto o prenotato una visita.</p>
      </div>

      <section className="scheda" aria-labelledby="titolo-studio">
        <div className="scheda-testa">
          <h2 id="titolo-studio">Le tue visite</h2>
        </div>
        <ul className="strutture-elenco">
          <RigaStruttura
            struttura={comeStruttura({
              id: 'studio',
              tipo: 'ambulatorio',
              nome: STUDIO,
              indirizzo: SEDE_STUDIO.indirizzo,
              lat: SEDE_STUDIO.lat,
              lon: SEDE_STUDIO.lon,
              telefono: SEDE_STUDIO.telefono,
            })}
            nota={`${prossimeVisite.length + visiteFatte.length} visite. ${nota}.`}
          />
        </ul>
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
