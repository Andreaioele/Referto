import { useCallback, useMemo, useState } from 'react'
import { ContestoAzioni, type Azioni } from './azioni'
import { usePercorso } from './percorsi'
import type { Documento } from './portale/dati'
import { farmacoDaLeggere, refertoDaSpiegare } from './portale/perReferto'
import { Documenti } from './portale/Documenti'
import { Home } from './portale/Home'
import { Prescrizioni } from './portale/Prescrizioni'
import { Profilo } from './portale/Profilo'
import { Struttura } from './portale/Struttura'
import { Visite } from './portale/Visite'
import { VisualizzaDocumento } from './portale/VisualizzaDocumento'
import { LettoreFoglietto } from './referto/LettoreFoglietto'
import type { FarmacoDaLeggere, RefertoDaSpiegare } from './referto/tipi'
import { WidgetReferto } from './referto/WidgetReferto'

const CHIAVE_CONSENSO = 'referto-attivo'

function consensoSalvato(): boolean {
  try {
    return window.localStorage.getItem(CHIAVE_CONSENSO) !== 'no'
  } catch {
    return true
  }
}

/** Finestra aperta sopra il portale: al massimo una alla volta. */
type Finestra =
  | { tipo: 'widget'; referto?: RefertoDaSpiegare }
  | { tipo: 'foglietto'; farmaco: FarmacoDaLeggere }
  | { tipo: 'documento'; documento: Documento }
  | null

/**
 * Portale dimostrativo di uno studio medico con Referto integrato come widget:
 * le pagine del portale chiedono le azioni (spiega, foglietto, documento) e
 * qui si apre la finestra giusta.
 */
function App() {
  const percorso = usePercorso()
  const [finestra, setFinestra] = useState<Finestra>(null)
  const [refertoAttivo, setRefertoAttivo] = useState(consensoSalvato)

  const cambiaConsenso = useCallback((attivo: boolean) => {
    setRefertoAttivo(attivo)
    try {
      window.localStorage.setItem(CHIAVE_CONSENSO, attivo ? 'si' : 'no')
    } catch {
      // senza localStorage la scelta vale fino alla chiusura della pagina
    }
  }, [])

  const azioni = useMemo<Azioni>(
    () => ({
      refertoAttivo,
      // Qui il portale passa a Referto solo il referto o il farmaco scelto, nei tipi di Referto.
      spiega: (documento) => setFinestra({ tipo: 'widget', referto: documento && refertoDaSpiegare(documento) }),
      apriFoglietto: (farmaco) => {
        const daLeggere = farmacoDaLeggere(farmaco)
        if (daLeggere) setFinestra({ tipo: 'foglietto', farmaco: daLeggere })
      },
      apriDocumento: (documento) => setFinestra({ tipo: 'documento', documento }),
    }),
    [refertoAttivo],
  )
  const chiudi = useCallback(() => setFinestra(null), [])

  let pagina
  switch (percorso.replace(/\/+$/, '') || '/') {
    case '/visite':
      pagina = <Visite />
      break
    case '/documenti':
      pagina = <Documenti />
      break
    case '/prescrizioni':
      pagina = <Prescrizioni />
      break
    case '/dati':
      pagina = <Profilo refertoAttivo={refertoAttivo} onCambiaReferto={cambiaConsenso} />
      break
    default:
      pagina = <Home />
  }

  return (
    <ContestoAzioni.Provider value={azioni}>
      <Struttura percorso={percorso}>{pagina}</Struttura>
      {finestra?.tipo === 'widget' && <WidgetReferto referto={finestra.referto} onChiudi={chiudi} />}
      {finestra?.tipo === 'foglietto' && <LettoreFoglietto farmaco={finestra.farmaco} onChiudi={chiudi} />}
      {finestra?.tipo === 'documento' && <VisualizzaDocumento documento={finestra.documento} onChiudi={chiudi} />}
    </ContestoAzioni.Provider>
  )
}

export default App
