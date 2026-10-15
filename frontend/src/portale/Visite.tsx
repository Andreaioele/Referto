import { useState } from 'react'
import { Icona } from '../Icona'
import { prossimeVisite, visiteFatte } from './dati'
import { Commutatore, SchedaVisita } from './elementi'

export function Visite() {
  const [scheda, setScheda] = useState<'prossime' | 'fatte'>('prossime')
  const elenco = scheda === 'prossime' ? prossimeVisite : visiteFatte
  return (
    <>
      <div className="titolo-pagina">
        <h1>Le mie visite</h1>
        <p className="tenue">Gli appuntamenti prenotati allo studio e quelli già fatti.</p>
      </div>
      <Commutatore
        etichetta="Quali visite vedere"
        scelta={scheda}
        onScegli={setScheda}
        voci={[
          { valore: 'prossime', nome: `Prossime (${prossimeVisite.length})` },
          { valore: 'fatte', nome: `Già fatte (${visiteFatte.length})` },
        ]}
      />
      <div className="elenco-schede">
        {elenco.map((visita, indice) => (
          <SchedaVisita key={visita.id} visita={visita} inEvidenza={scheda === 'prossime' && indice === 0} />
        ))}
      </div>
      <button type="button" className="bottone solo-telefono">
        <Icona nome="piu" dimensione={22} />
        Prenota una visita
      </button>
    </>
  )
}
