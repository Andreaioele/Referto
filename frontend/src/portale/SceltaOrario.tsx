import { useState } from 'react'
import { Icona } from '../Icona'
import type { Categoria, StrutturaVicina } from '../referto/cliente'
import type { RefertoDaSpiegare } from '../referto/tipi'
import { giorniDisponibili, giornoLeggibile, quandoIso } from './calendario'
import { paziente } from './dati'
import { prenota, usePrenotazioni } from './prenotazioni'

/**
 * Prenotazione con una struttura o un professionista (demo), in uno di tre modi
 * a scelta: "Scegli una data" (calendario di prova, poi "Prenota": la visita va
 * in "Le mie strutture" o "I miei professionisti"), "Chiama" (telefono vero
 * della struttura) o "Email" (apre la posta con la richiesta già scritta).
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
  const [calendario, setCalendario] = useState(false)
  const [giorno, setGiorno] = useState(0)
  const [ora, setOra] = useState<string | null>(null)
  const prenotata = usePrenotazioni().find((p) => p.categoria === categoria && p.struttura.id === struttura.id)
  const scelta = ora ? `${giornoLeggibile(giorni[giorno].data)} alle ${ora}` : null
  const telefono = struttura.telefono?.replace(/[^\d+]/g, '')
  const sezione = categoria === 'strutture' ? '«Le mie strutture»' : '«I miei professionisti»'
  const testoEmail = [
    'Buongiorno,',
    '',
    `vorrei prenotare una visita${referto.classificazione ? ` (${referto.classificazione.area.toLowerCase()})` : ''}.`,
    `Ho un referto di «${referto.titolo}» del ${referto.data}. Mi potete indicare i giorni disponibili?`,
    '',
    'Grazie,',
    `${paziente.nome} ${paziente.cognome}`,
    paziente.telefono,
  ].join('\n')
  const email = `mailto:?subject=${encodeURIComponent(`Richiesta di visita: ${struttura.nome}`)}&body=${encodeURIComponent(testoEmail)}`

  return (
    <section className="prenota-orario" aria-labelledby="titolo-orario">
      <div className="scheda-testa">
        <h3 id="titolo-orario">Come vuoi prenotare con {struttura.nome}?</h3>
        <button type="button" className="bottone-leggero bottone-piccolo" onClick={onChiudi}>
          Cambia scelta
        </button>
      </div>

      <div className="azioni prenota-modi">
        <button type="button" className="bottone" aria-expanded={calendario} onClick={() => setCalendario(true)}>
          <Icona nome="calendario" dimensione={20} />
          Scegli una data
        </button>
        {telefono ? (
          <a className="bottone-leggero" href={`tel:${telefono}`}>
            <Icona nome="telefono" dimensione={20} />
            Chiama
          </a>
        ) : (
          <span className="bottone-leggero prenota-non-disponibile" aria-disabled="true">
            <Icona nome="telefono" dimensione={20} />
            Telefono non disponibile
          </span>
        )}
        <a className="bottone-leggero" href={email}>
          <Icona nome="invia" dimensione={20} />
          Email
        </a>
      </div>
      <p className="tenue piccolo">"Email" apre la tua posta con la richiesta già scritta: aggiungi tu l'indirizzo della struttura.</p>

      {calendario && (
        <>
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
              {prenotata ? (
                <p>
                  <strong>Prenotata.</strong> La trovi in {sezione}.
                </p>
              ) : (
                <>
                  <p>
                    Hai scelto <strong>{scelta}</strong>.
                  </p>
                  <div className="azioni">
                    <button
                      type="button"
                      className="bottone"
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
                      Prenota
                    </button>
                  </div>
                  <p className="tenue piccolo">Demo: la prenotazione non arriva alla struttura, la trovi solo in {sezione}.</p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
