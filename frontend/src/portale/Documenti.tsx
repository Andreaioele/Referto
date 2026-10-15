import { useState } from 'react'
import { Icona } from '../Icona'
import { documenti, type Documento } from './dati'
import { RigaDocumento } from './elementi'

const FILTRI: Array<{ valore: 'tutti' | Documento['tipo']; nome: string }> = [
  { valore: 'tutti', nome: 'Tutti' },
  { valore: 'referto', nome: 'Referti' },
  { valore: 'ricetta', nome: 'Ricette' },
  { valore: 'fattura', nome: 'Fatture' },
]

export function Documenti() {
  const [filtro, setFiltro] = useState<(typeof FILTRI)[number]['valore']>('tutti')
  const elenco = documenti.filter((d) => filtro === 'tutti' || d.tipo === filtro)
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

      <section className="gruppo-corpo" aria-label="Documenti">
        {elenco.length === 0 ? (
          <p className="riga tenue">Nessun documento di questo tipo.</p>
        ) : (
          elenco.map((documento) => <RigaDocumento key={documento.id} documento={documento} />)
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
          parole semplici solo ciò che è scritto nel referto: non fa diagnosi e non sostituisce il medico.
        </p>
      </details>
    </>
  )
}
