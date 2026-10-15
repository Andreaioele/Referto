import { useState } from 'react'
import { useAzioni } from '../azioni'
import { Collegamento } from '../Collegamento'
import { Icona } from '../Icona'
import type { Categoria, StrutturaVicina } from '../referto/cliente'
import { StruttureDelReferto } from '../referto/StruttureVicine'
import { documenti } from './dati'
import { casaDelPaziente, refertoDaSpiegare } from './perReferto'
import { prendiPrenotazioneInAttesa } from './prenotazioni'
import { SceltaOrario } from './SceltaOrario'

/**
 * "Prenota una visita" (demo): 1. scegli un referto; 2. Referto mostra subito
 * strutture e professionisti della sua area (classificazione già fatta), dal
 * più vicino a casa; 3. scegli giorno e ora sul calendario di prova, poi
 * "Chiama" o "Email". Strutture e professionisti sono reali, il calendario no.
 */
export function Prenota() {
  const { refertoAttivo } = useAzioni()
  const casa = casaDelPaziente()
  const referti = documenti.flatMap((d) => {
    const referto = refertoDaSpiegare(d)
    return referto ? [referto] : []
  })
  const [refertoId, setRefertoId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('referto'))
  const [scelta, setScelta] = useState<{ struttura: StrutturaVicina; categoria: Categoria } | null>(() =>
    prendiPrenotazioneInAttesa(new URLSearchParams(window.location.search).get('referto')),
  )
  const referto = referti.find((r) => r.id === refertoId)

  const scegli = (categoria: Categoria) => ({
    prenotate: new Set<string>(),
    etichetta: 'Scegli l’orario',
    onPrenota: (struttura: StrutturaVicina) => {
      setScelta({ struttura, categoria })
      window.setTimeout(() => document.getElementById('passo-orario')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    },
  })

  return (
    <>
      <div className="titolo-pagina">
        <h1>Prenota una visita</h1>
        <p className="tenue">Scegli un referto: ti mostriamo strutture e medici adatti vicino a casa, poi giorno e ora.</p>
      </div>

      {!refertoAttivo ? (
        <section className="scheda">
          <p>
            Per prenotare a partire dai tuoi referti attiva Referto in <Collegamento href="/dati">I miei dati</Collegamento>.
          </p>
        </section>
      ) : (
        <>
          <section className="scheda" aria-labelledby="passo-referto">
            <div className="scheda-testa">
              <h2 id="passo-referto">1. Per quale referto?</h2>
            </div>
            <div className="prenota-referti" role="group" aria-label="Referto">
              {referti.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={r.id === refertoId}
                  onClick={() => {
                    setRefertoId(r.id)
                    setScelta(null)
                  }}
                >
                  <Icona nome="documento" dimensione={22} />
                  <span>
                    <strong>{r.titolo}</strong>
                    <span className="tenue piccolo">
                      {r.data}
                      {r.classificazione ? ` · ${r.classificazione.area}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {referto && (
            <section className="scheda" aria-labelledby="passo-dove">
              <div className="scheda-testa">
                <h2 id="passo-dove">2. Dove o con chi</h2>
              </div>
              <h3>Professionisti</h3>
              <StruttureDelReferto key={`p-${referto.id}`} referto={referto} casa={casa} categoria="professionisti" prenotabile={scegli('professionisti')} />
              <h3>Strutture</h3>
              <StruttureDelReferto key={`s-${referto.id}`} referto={referto} casa={casa} categoria="strutture" prenotabile={scegli('strutture')} />
            </section>
          )}

          {referto && scelta && (
            <section className="scheda" id="passo-orario" aria-labelledby="titolo-orario">
              <h2 className="nascosto">3. Giorno e ora</h2>
              <SceltaOrario
                key={scelta.struttura.id}
                struttura={scelta.struttura}
                referto={referto}
                categoria={scelta.categoria}
                onChiudi={() => setScelta(null)}
              />
            </section>
          )}
        </>
      )}
    </>
  )
}
