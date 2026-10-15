import { createContext, useContext } from 'react'
import type { Documento, Farmaco } from './portale/dati'

/**
 * Azioni che le pagine del portale chiedono all'app. Le prime due sono il
 * punto di integrazione con Referto: il portale passa al widget solo il
 * documento o il farmaco che la persona ha scelto.
 */
export interface Azioni {
  /** Referto è attivo nel portale (consenso in "I miei dati"): se no, i pulsanti di Referto spariscono. */
  refertoAttivo: boolean
  /** Apre il widget Referto: con un documento lo spiega subito, senza documento chiede di incollare il testo. */
  spiega: (documento?: Documento) => void
  /** Apre il foglietto illustrativo AIFA del farmaco nel lettore di Referto. */
  apriFoglietto: (farmaco: Farmaco) => void
  /** Mostra il documento così com'è, nel visualizzatore del portale. */
  apriDocumento: (documento: Documento) => void
}

export const ContestoAzioni = createContext<Azioni>({
  refertoAttivo: true,
  spiega: () => undefined,
  apriFoglietto: () => undefined,
  apriDocumento: () => undefined,
})

export function useAzioni(): Azioni {
  return useContext(ContestoAzioni)
}
