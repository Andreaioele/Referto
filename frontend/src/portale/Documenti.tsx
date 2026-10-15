import { useState } from 'react'
import { useAzioni } from '../azioni'
import { Icona } from '../Icona'
import type { Categoria, StrutturaVicina } from '../referto/cliente'
import { StruttureDelReferto } from '../referto/StruttureVicine'
import { documenti, type Documento } from './dati'
import { RigaDocumento } from './elementi'
import { casaDelPaziente, refertoDaSpiegare } from './perReferto'
import { naviga } from '../percorsi'
import { preparaPrenotazione, usePrenotazioni } from './prenotazioni'

const FILTRI: Array<{ valore: 'tutti' | Documento['tipo']; nome: string }> = [
  { valore: 'tutti', nome: 'Tutti' },
  { valore: 'referto', nome: 'Referti' },
  { valore: 'ricetta', nome: 'Ricette' },
  { valore: 'fattura', nome: 'Fatture' },
]

/** Ricerca aperta su un referto: arriva anche dal widget (?referto=id&cerca=strutture). */
function ricercaRichiesta(): { id: string; categoria: Categoria } | null {
  const parametri = new URLSearchParams(window.location.search)
  const id = parametri.get('referto')
  const cerca = parametri.get('cerca')
  return id && (cerca === 'strutture' || cerca === 'professionisti') ? { id, categoria: cerca } : null
}

export function Documenti() {
  const { refertoAttivo } = useAzioni()
  const [filtro, setFiltro] = useState<(typeof FILTRI)[number]['valore']>(() => (ricercaRichiesta() ? 'referto' : 'tutti'))
  const [ricerca, setRicerca] = useState(ricercaRichiesta)
  const prenotazioni = usePrenotazioni()
  const elenco = documenti.filter((d) => filtro === 'tutti' || d.tipo === filtro)
  const casa = casaDelPaziente()

  function apri(id: string, categoria: Categoria) {
    setRicerca(ricerca?.id === id && ricerca.categoria === categoria ? null : { id, categoria })
  }

  return (
    <>
      <div className="titolo-pagina titolo-con-azione">
        <div>
          <h1>I miei documenti</h1>
          <p className="tenue">Referti, ricette e fatture dello studio, sempre a portata di mano.</p>
        </div>
        <button type="button" className="bottone-leggero solo-computer">
          <Icona nome="carica" dimensione={20} />
          Carica un documento
        </button>
      </div>

      <div className="filtri" role="group" aria-label="Quali documenti vedere">
        {FILTRI.map((voce) => (
          <button key={voce.valore} type="button" aria-pressed={voce.valore === filtro} onClick={() => setFiltro(voce.valore)}>
            {voce.nome}
          </button>
        ))}
      </div>

      <section className="scheda scheda-elenco" aria-label="Documenti">
        {elenco.length === 0 ? (
          <p className="tenue">Nessun documento di questo tipo.</p>
        ) : (
          elenco.map((documento) => {
            const referto = refertoAttivo ? refertoDaSpiegare(documento) : undefined
            const aperta = referto && ricerca?.id === documento.id ? ricerca.categoria : null
            return (
              <div key={documento.id}>
                <RigaDocumento
                  documento={documento}
                  extra={
                    referto && (
                      <>
                        <button
                          type="button"
                          className="bottone-leggero"
                          aria-expanded={aperta === 'strutture'}
                          onClick={() => apri(documento.id, 'strutture')}
                        >
                          <Icona nome="luogo" dimensione={20} />
                          Cerca strutture
                        </button>
                        <button
                          type="button"
                          className="bottone-leggero"
                          aria-expanded={aperta === 'professionisti'}
                          onClick={() => apri(documento.id, 'professionisti')}
                        >
                          <Icona nome="stetoscopio" dimensione={20} />
                          Cerca professionisti
                        </button>
                      </>
                    )
                  }
                />
                {referto && aperta && (
                  <StruttureDelReferto
                    key={aperta}
                    referto={referto}
                    casa={casa}
                    categoria={aperta}
                    prenotabile={{
                      prenotate: new Set(prenotazioni.filter((p) => p.categoria === aperta).map((p) => p.struttura.id)),
                      // Porta al calendario di "Prenota una visita" con la struttura già scelta.
                      onPrenota: (struttura: StrutturaVicina) => {
                        preparaPrenotazione({ refertoId: referto.id, categoria: aperta, struttura })
                        naviga(`/prenota?referto=${encodeURIComponent(referto.id)}`)
                      },
                    }}
                  />
                )}
              </div>
            )
          })
        )}
      </section>

      <button type="button" className="bottone-leggero solo-telefono">
        <Icona nome="carica" dimensione={20} />
        Carica un documento
      </button>

      <details className="scheda dettagli">
        <summary>Che cos'è «Spiegamelo»?</summary>
        <p>
          Accanto a ogni referto c'è il pulsante «Spiegamelo» di Referto, un servizio collegato al portale. Spiega con
          parole semplici solo ciò che è scritto nel referto: non fa diagnosi e non sostituisce il medico. Con «Cerca
          strutture» e «Cerca professionisti» trovi dove andare vicino a casa e puoi prenotare una visita.
        </p>
      </details>
    </>
  )
}
