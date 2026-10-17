import { useEffect, useState } from 'react'
import { useLingua } from '../lingua/lingua'
import { traduci, type Traduzione } from './cliente'

export type StatoTraduzione = { pronta: false } | { pronta: true; testi: Traduzione[] }

/**
 * I testi di Referto (scritti in italiano dal Mother agent o dal foglietto)
 * nella lingua dell'interfaccia. In italiano sono subito pronti così come sono;
 * in inglese si traducono quando `completi` è vero (la risposta è finita), e
 * fino ad allora `pronta` è false.
 */
export function useTraduzione(testi: string[], completi = true): StatoTraduzione {
  const lingua = useLingua()
  const chiave = JSON.stringify(testi)
  const [fatta, setFatta] = useState<{ chiave: string; testi: Traduzione[] } | null>(null)

  useEffect(() => {
    if (lingua === 'it' || !completi) return
    const controllo = new AbortController()
    const daTradurre = JSON.parse(chiave) as string[]
    traduci(daTradurre, 'en', controllo.signal).then(
      (tradotti) => setFatta({ chiave, testi: tradotti }),
      () => undefined,
    )
    return () => controllo.abort()
  }, [lingua, chiave, completi])

  if (lingua === 'it') return { pronta: true, testi: testi.map((testo) => ({ testo, tradotto: true })) }
  return fatta?.chiave === chiave ? { pronta: true, testi: fatta.testi } : { pronta: false }
}

/** La domanda scritta dalla persona come la riceve il Mother agent: in italiano (se la traduzione non riesce, com'è). */
export async function domandaPerReferto(domanda: string, lingua: 'it' | 'en', segnale?: AbortSignal): Promise<string> {
  if (lingua === 'it') return domanda
  const [italiano] = await traduci([domanda], 'it', segnale)
  return italiano.tradotto ? italiano.testo : domanda
}
