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
  /** Giorno e ora scelti sul calendario di prova ("2026-10-20T10:00"), se scelti. */
  quando?: string
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

/**
 * Struttura scelta in "I miei documenti" con "Prenota una visita": la pagina
 * /prenota la apre subito sul calendario. Vale una volta sola.
 */
let sceltaInAttesa: { refertoId: string; categoria: Categoria; struttura: StrutturaVicina } | null = null

export function preparaPrenotazione(scelta: { refertoId: string; categoria: Categoria; struttura: StrutturaVicina }): void {
  sceltaInAttesa = scelta
}

export function prendiPrenotazioneInAttesa(refertoId: string | null) {
  const scelta = sceltaInAttesa && sceltaInAttesa.refertoId === refertoId ? sceltaInAttesa : null
  sceltaInAttesa = null
  return scelta
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
