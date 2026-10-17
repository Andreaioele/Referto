import { CercaDaiReferti, ElencoPrenotazioni } from './MieiLuoghi'
import { usePrenotazioni } from './prenotazioni'
import { SchedaStudio } from './SchedaStudio'
import { t } from '../lingua/lingua'

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
        <h1>{t('Le mie strutture')}</h1>
        <p className="tenue">{t('I luoghi dove hai fatto o prenotato una visita.')}</p>
      </div>

      <section className="scheda studio-scheda" aria-label={t('Le tue visite')}>
        <SchedaStudio />
      </section>

      <section className="scheda" aria-labelledby="titolo-prenotate">
        <div className="scheda-testa">
          <h2 id="titolo-prenotate">{t('Prenotate da te')}</h2>
        </div>
        {prenotazioni.length > 0 ? (
          <ElencoPrenotazioni prenotazioni={prenotazioni} />
        ) : (
          <p className="tenue">{t('Non hai ancora prenotato in altre strutture.')}</p>
        )}
        <CercaDaiReferti cosa="strutture" />
      </section>
    </>
  )
}
