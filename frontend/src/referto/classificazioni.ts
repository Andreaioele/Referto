import { useSyncExternalStore } from 'react'
import type { Classificazione } from './cliente'

/**
 * Le classificazioni dei referti già letti dal Mother agent, per identificativo
 * del referto: così "Le mie strutture" non richiama il modello per un referto
 * già spiegato nel widget. Restano nella scheda del browser (sessionStorage) e
 * spariscono alla chiusura.
 */
const CHIAVE = 'referto-classificazioni'
const ascoltatori = new Set<() => void>()
let memoria: Record<string, Classificazione> = leggi()

function leggi(): Record<string, Classificazione> {
  try {
    return JSON.parse(window.sessionStorage.getItem(CHIAVE) ?? '{}') as Record<string, Classificazione>
  } catch {
    return {}
  }
}

export function salvaClassificazione(idReferto: string, classificazione: Classificazione): void {
  const attuale = memoria[idReferto]
  if (attuale?.area === classificazione.area && attuale.esame === classificazione.esame) return
  memoria = { ...memoria, [idReferto]: classificazione }
  try {
    window.sessionStorage.setItem(CHIAVE, JSON.stringify(memoria))
  } catch {
    // senza sessionStorage la classificazione vale finché la pagina resta aperta
  }
  ascoltatori.forEach((avvisa) => avvisa())
}

/** La classificazione del referto, se è già stata fatta; si aggiorna da sola quando arriva. */
export function useClassificazione(idReferto: string | undefined): Classificazione | undefined {
  return useSyncExternalStore(
    (avvisa) => {
      ascoltatori.add(avvisa)
      return () => ascoltatori.delete(avvisa)
    },
    () => (idReferto ? memoria[idReferto] : undefined),
  )
}

/** Solo per i test. */
export function dimenticaClassificazioni(): void {
  memoria = {}
  try {
    window.sessionStorage.removeItem(CHIAVE)
  } catch {
    // niente
  }
  ascoltatori.forEach((avvisa) => avvisa())
}
