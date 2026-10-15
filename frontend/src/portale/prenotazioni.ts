import { useSyncExternalStore } from 'react'
import type { Categoria, StrutturaVicina } from '../referto/cliente'

/**
 * Visite prenotate dalla ricerca di "I miei documenti" (demo: niente invio
 * reale, la prenotazione resta nel browser). Una struttura o un professionista
 * prenotato compare in "Le mie strutture" o in "I miei professionisti".
 */
export interface Prenotazione {
  id: string
  categoria: Categoria
  struttura: StrutturaVicina
  refertoId: string
  refertoTitolo: string
  area?: string
  /** Data della richiesta, ISO. */
  richiesta: string
}

const CHIAVE = 'portale-prenotazioni'
const ascoltatori = new Set<() => void>()
let elenco: Prenotazione[] = leggi()

function leggi(): Prenotazione[] {
  try {
    return JSON.parse(window.localStorage.getItem(CHIAVE) ?? '[]') as Prenotazione[]
  } catch {
    return []
  }
}

function salva(nuovo: Prenotazione[]): void {
  elenco = nuovo
  try {
    window.localStorage.setItem(CHIAVE, JSON.stringify(elenco))
  } catch {
    // senza localStorage la prenotazione vale finché la pagina resta aperta
  }
  ascoltatori.forEach((avvisa) => avvisa())
}

export function prenota(p: Omit<Prenotazione, 'id' | 'richiesta'>): void {
  if (elenco.some((x) => x.struttura.id === p.struttura.id && x.categoria === p.categoria)) return
  salva([...elenco, { ...p, id: `${p.categoria}-${p.struttura.id}`, richiesta: new Date().toISOString() }])
}

export function annullaPrenotazione(id: string): void {
  salva(elenco.filter((p) => p.id !== id))
}

export function usePrenotazioni(): Prenotazione[] {
  return useSyncExternalStore(
    (avvisa) => {
      ascoltatori.add(avvisa)
      return () => ascoltatori.delete(avvisa)
    },
    () => elenco,
  )
}
