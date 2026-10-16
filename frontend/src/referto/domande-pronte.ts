import type { RefertoDaSpiegare } from './tipi'
import { t } from '../lingua/lingua'

/** Domande pronte: brevi, sul referto aperto, nella lingua scelta. */
export function domandePronte(referto?: RefertoDaSpiegare): string[] {
  const fuori = referto?.valori?.filter((v) => v.fuori) ?? []
  const prima = fuori.length > 0 ? t('Cosa vuol dire «{esame}»?', { esame: fuori[fuori.length - 1].esame }) : t('Me lo spieghi più semplice?')
  return [prima, t('Devo preoccuparmi?')]
}
