import type { RefertoDaSpiegare } from './tipi'
import { componi, t } from '../lingua/lingua'

export interface DomandaPronta {
  /** Il testo del pulsante, nella lingua scelta. */
  mostra: string
  /** Il testo mandato al Mother agent: sempre in italiano, la lingua in cui riconosce le domande. */
  invia: string
}

function pronta(italiano: string, valori?: Record<string, string>): DomandaPronta {
  return { mostra: t(italiano, valori), invia: componi(italiano, valori) }
}

/** Domande pronte: brevi, sul referto aperto. */
export function domandePronte(referto?: RefertoDaSpiegare): DomandaPronta[] {
  const fuori = referto?.valori?.filter((v) => v.fuori) ?? []
  const prima = fuori.length > 0 ? pronta('Cosa vuol dire «{esame}»?', { esame: fuori[fuori.length - 1].esame }) : pronta('Me lo spieghi più semplice?')
  return [prima, pronta('Devo preoccuparmi?')]
}
