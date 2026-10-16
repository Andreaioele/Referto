import { Collegamento } from '../Collegamento'
import { Icona } from '../Icona'
import { RigaStruttura } from '../referto/StruttureVicine'
import { annullaPrenotazione, type Prenotazione } from './prenotazioni'
import { locale, t } from '../lingua/lingua'

/** Le prenotazioni fatte dalla ricerca, con la data e il referto da cui sono partite. */
export function ElencoPrenotazioni({ prenotazioni }: { prenotazioni: Prenotazione[] }) {
  if (prenotazioni.length === 0) return null
  return (
    <ul className="strutture-elenco">
      {prenotazioni.map((p) => (
        <RigaStruttura
          key={p.id}
          struttura={p.struttura}
          nota={
            p.quando
              ? t('Visita {giorno} alle {ora}, per il referto «{referto}».', {
                  giorno: new Date(p.quando).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }),
                  ora: p.quando.slice(11, 16),
                  referto: t(p.refertoTitolo),
                })
              : t('Visita richiesta il {giorno}, per il referto «{referto}».', {
                  giorno: new Date(p.richiesta).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }),
                  referto: t(p.refertoTitolo),
                })
          }
          azioni={
            <button type="button" className="bottone-leggero" onClick={() => annullaPrenotazione(p.id)}>
              {t('Annulla la prenotazione')}
            </button>
          }
        />
      ))}
    </ul>
  )
}

/** Invito a cercare dai referti, quando la sezione è vuota o in fondo all'elenco. */
export function CercaDaiReferti({ cosa }: { cosa: 'strutture' | 'professionisti' }) {
  return (
    <p className="strutture-casa">
      <Icona nome="documento" dimensione={20} />
      {t('Per trovarne altre vicino a casa apri un referto in')}{' '}
      <Collegamento href="/documenti">{t('I miei documenti')}</Collegamento>{' '}
      {t('e scegli «{azione}».', { azione: t(cosa === 'strutture' ? 'Cerca strutture' : 'Cerca professionisti') })}
    </p>
  )
}

