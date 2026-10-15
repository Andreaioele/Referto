import type { RefertoDaSpiegare } from './tipi'

/** Domande pronte: brevi, sul referto aperto. */
export function domandePronte(referto?: RefertoDaSpiegare): string[] {
  const fuori = referto?.valori?.filter((v) => v.fuori) ?? []
  const prima = fuori.length > 0 ? `Cosa vuol dire «${fuori[fuori.length - 1].esame}»?` : 'Me lo spieghi più semplice?'
  return [prima, 'Cosa posso chiedere al medico?']
}
