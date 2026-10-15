import { Collegamento } from '../Collegamento'
import { Icona } from '../Icona'
import { RigaStruttura } from '../referto/StruttureVicine'
import { annullaPrenotazione, type Prenotazione } from './prenotazioni'

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
              ? `Visita ${new Date(p.quando).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} alle ${p.quando.slice(11, 16)}, per il referto «${p.refertoTitolo}».`
              : `Visita richiesta il ${new Date(p.richiesta).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}, per il referto «${p.refertoTitolo}».`
          }
          azioni={
            <button type="button" className="bottone-leggero" onClick={() => annullaPrenotazione(p.id)}>
              Annulla la prenotazione
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
      Per trovarne altre vicino a casa apri un referto in{' '}
      <Collegamento href="/documenti">I miei documenti</Collegamento> e scegli «Cerca {cosa}».
    </p>
  )
}

