import { Collegamento } from '../Collegamento'
import { useState } from 'react'
import { Icona } from '../Icona'
import { prossimeVisite, visiteFatte } from './dati'
import { Commutatore, SchedaVisita } from './elementi'
import { t } from '../lingua/lingua'

export function Visite() {
  const [scheda, setScheda] = useState<'prossime' | 'fatte'>('prossime')
  const elenco = scheda === 'prossime' ? prossimeVisite : visiteFatte
  return (
    <>
      <div className="titolo-pagina">
        <h1>{t('Le mie visite')}</h1>
        <p className="tenue">{t('Gli appuntamenti prenotati allo studio e quelli già fatti.')}</p>
      </div>
      <Commutatore
        etichetta={t('Quali visite vedere')}
        scelta={scheda}
        onScegli={setScheda}
        voci={[
          { valore: 'prossime', nome: t('Prossime ({n})', { n: prossimeVisite.length }) },
          { valore: 'fatte', nome: t('Già fatte ({n})', { n: visiteFatte.length }) },
        ]}
      />
      <div className="elenco-schede">
        {elenco.map((visita, indice) => (
          <SchedaVisita key={visita.id} visita={visita} inEvidenza={scheda === 'prossime' && indice === 0} />
        ))}
      </div>
      <Collegamento href="/prenota" className="bottone solo-telefono">
        <Icona nome="piu" dimensione={22} />
        {t('Prenota una visita')}
      </Collegamento>
    </>
  )
}
