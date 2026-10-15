import { useState } from 'react'
import { Icona } from '../Icona'
import type { Categoria, StrutturaVicina } from '../referto/cliente'
import type { RefertoDaSpiegare } from '../referto/tipi'
import { giorniDisponibili, giornoLeggibile, quandoIso } from './calendario'
import { paziente } from './dati'
import { prenota, usePrenotazioni } from './prenotazioni'

/**
 * Scelta del giorno e dell'orario per una struttura o un professionista, sul
 * calendario di prova; poi "Chiama" ed "Email" per prenotare davvero, e la
 * conferma dimostrativa che la mette in "Le mie strutture" o "I miei professionisti".
 */
export function SceltaOrario({
  struttura,
  referto,
  categoria,
  onChiudi,
}: {
  struttura: StrutturaVicina
  referto: RefertoDaSpiegare
  categoria: Categoria
  onChiudi: () => void
}) {
  const giorni = giorniDisponibili()
  const [giorno, setGiorno] = useState(0)
  const [ora, setOra] = useState<string | null>(null)
  const prenotata = usePrenotazioni().find((p) => p.categoria === categoria && p.struttura.id === struttura.id)
  const scelta = ora ? `${giornoLeggibile(giorni[giorno].data)} alle ${ora}` : null
  const telefono = struttura.telefono?.replace(/[^\d+]/g, '')
  const testoEmail = [
    'Buongiorno,',
    '',
    `vorrei prenotare una visita${scelta ? ` per ${scelta}` : ''}${referto.classificazione ? ` (${referto.classificazione.area.toLowerCase()})` : ''}.`,
    `Ho un referto di «${referto.titolo}» del ${referto.data}.`,
    '',
    'Grazie,',
    `${paziente.nome} ${paziente.cognome}`,
    paziente.telefono,
  ].join('\n')
  const email = `mailto:?subject=${encodeURIComponent(`Richiesta di visita: ${struttura.nome}`)}&body=${encodeURIComponent(testoEmail)}`

  return (
    <section className="prenota-orario" aria-labelledby="titolo-orario">
      <div className="scheda-testa">
        <h3 id="titolo-orario">Scegli giorno e ora: {struttura.nome}</h3>
        <button type="button" className="bottone-leggero bottone-piccolo" onClick={onChiudi}>
          Cambia scelta
        </button>
      </div>
      <p className="tenue piccolo">Calendario di prova: gli orari non sono quelli reali della struttura.</p>

      <div className="filtri prenota-giorni" role="group" aria-label="Giorno">
        {giorni.map((g, i) => (
          <button
            key={g.data.toISOString()}
            type="button"
            aria-pressed={i === giorno}
            onClick={() => {
              setGiorno(i)
              setOra(null)
            }}
          >
            {g.data.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
          </button>
        ))}
      </div>

      <div className="prenota-orari" role="group" aria-label={`Orari di ${giornoLeggibile(giorni[giorno].data)}`}>
        {giorni[giorno].orari.map((o) => (
          <button key={o.ora} type="button" disabled={!o.libero} aria-pressed={o.ora === ora} onClick={() => setOra(o.ora)}>
            {o.ora}
            {!o.libero && <span className="nascosto"> (occupato)</span>}
          </button>
        ))}
      </div>

      {scelta && (
        <div className="prenota-riepilogo">
          <p>
            Hai scelto <strong>{scelta}</strong>. Per prenotare chiama o scrivi alla struttura.
          </p>
          <div className="azioni">
            {telefono ? (
              <a className="bottone" href={`tel:${telefono}`}>
                <Icona nome="telefono" dimensione={20} />
                Chiama
              </a>
            ) : (
              <span className="tenue piccolo">Telefono non disponibile</span>
            )}
            <a className="bottone-leggero" href={email}>
              <Icona nome="invia" dimensione={20} />
              Email
            </a>
            {prenotata ? (
              <span className="pastiglia pastiglia-chiara">Già nelle tue {categoria === 'strutture' ? 'strutture' : 'prenotazioni'}</span>
            ) : (
              <button
                type="button"
                className="bottone-leggero"
                onClick={() =>
                  prenota({
                    categoria,
                    struttura,
                    refertoId: referto.id,
                    refertoTitolo: referto.titolo,
                    area: referto.classificazione?.area,
                    quando: quandoIso(giorni[giorno].data, ora!),
                  })
                }
              >
                Segna come prenotata
              </button>
            )}
          </div>
          <p className="tenue piccolo">
            Demo: "Segna come prenotata" non avvisa la struttura, mette solo la visita in{' '}
            {categoria === 'strutture' ? '«Le mie strutture»' : '«I miei professionisti»'}.
          </p>
        </div>
      )}
    </section>
  )
}
