import { useSyncExternalStore } from 'react'
import { INGLESE } from './en'

/**
 * Lingua dell'interfaccia, senza librerie. Il testo italiano scritto nel codice
 * è la chiave: `t('Le mie visite')` restituisce l'italiano o la sua traduzione
 * in `en.ts`. Vale anche per i dati del portale (`t(visita.titolo)`).
 *
 * La lingua è un valore unico per tutta la pagina (salvato in `localStorage`):
 * quando cambia, `App` ridisegna da capo tutto il portale, così anche le
 * funzioni fuori da React (date, testi delle strutture) leggono quella nuova.
 */

export type Lingua = 'it' | 'en'

export const LINGUE: Array<{ codice: Lingua; nome: string; breve: string }> = [
  { codice: 'it', nome: 'Italiano', breve: 'IT' },
  { codice: 'en', nome: 'English', breve: 'EN' },
]

const CHIAVE = 'referto-lingua'
const ascoltatori = new Set<() => void>()

function salvata(): Lingua {
  try {
    return window.localStorage.getItem(CHIAVE) === 'en' ? 'en' : 'it'
  } catch {
    return 'it'
  }
}

let corrente: Lingua = salvata()

export function lingua(): Lingua {
  return corrente
}

export function cambiaLingua(nuova: Lingua): void {
  if (nuova === corrente) return
  corrente = nuova
  try {
    window.localStorage.setItem(CHIAVE, nuova)
  } catch {
    // senza localStorage la scelta vale fino alla chiusura della pagina
  }
  aggiornaPagina()
  ascoltatori.forEach((avvisa) => avvisa())
}

/** La lingua scelta, aggiornata quando cambia (per i componenti React). */
export function useLingua(): Lingua {
  return useSyncExternalStore(
    (avvisa) => {
      ascoltatori.add(avvisa)
      return () => ascoltatori.delete(avvisa)
    },
    lingua,
  )
}

/** Codice per date e numeri (`toLocaleDateString`). */
export function locale(): string {
  return corrente === 'en' ? 'en-GB' : 'it-IT'
}

/**
 * Il testo nella lingua scelta. `{nome}` nel testo si sostituisce con
 * `valori.nome` (anche nella traduzione). Un testo senza traduzione resta in
 * italiano: il test di `en.test.ts` controlla che non ne manchino.
 */
export function t(italiano: string, valori?: Record<string, string | number>): string {
  const testo = corrente === 'en' ? (INGLESE[italiano] ?? italiano) : italiano
  return valori ? testo.replace(/\{(\w+)\}/g, (tutto, nome: string) => (nome in valori ? String(valori[nome]) : tutto)) : testo
}

/** Singolare o plurale secondo il numero (es. «Tra {n} giorno» / «Tra {n} giorni» in `date.ts`). */
export function quanti(n: number, uno: string, molti: string): string {
  return t(n === 1 ? uno : molti, { n })
}

/** Lingua e titolo della scheda del browser. */
function aggiornaPagina(): void {
  document.documentElement.lang = corrente
  document.title = `${t('Area paziente')} · Referto`
}

if (typeof document !== 'undefined') aggiornaPagina()
