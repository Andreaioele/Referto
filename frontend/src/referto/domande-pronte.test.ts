import { describe, expect, it } from 'vitest'
import { domandePronte } from './domande-pronte'

const valore = (esame: string, fuori: boolean) => ({ esame, risultato: '1', unita: 'mg/dL', riferimento: '0 – 2', fuori })

describe('domandePronte', () => {
  it("chiede dell'ultimo valore fuori intervallo", () => {
    const referto = {
      titolo: 'Esami',
      data: '1 ottobre 2026',
      testo: '…',
      valori: [valore('Glicemia', true), valore('Emoglobina', false), valore('Colesterolo LDL', true)],
    }
    expect(domandePronte(referto)).toEqual(['Cosa vuol dire «Colesterolo LDL»?', 'Cosa posso chiedere al medico?'])
  })

  it('senza valori fuori intervallo o senza referto chiede una spiegazione più semplice', () => {
    expect(domandePronte({ titolo: 'Visita', data: '1 ottobre 2026', testo: '…' })[0]).toBe('Me lo spieghi più semplice?')
    expect(domandePronte()).toEqual(['Me lo spieghi più semplice?', 'Cosa posso chiedere al medico?'])
  })
})
