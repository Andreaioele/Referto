import { afterEach, describe, expect, it } from 'vitest'
import { cambiaLingua } from '../lingua/lingua'
import { domandePronte } from './domande-pronte'

const valore = (esame: string, fuori: boolean) => ({ esame, risultato: '1', unita: 'mg/dL', riferimento: '0 – 2', fuori })
const referto = {
  id: 'r1',
  titolo: 'Esami',
  data: '1 ottobre 2026',
  testo: '…',
  valori: [valore('Glicemia', true), valore('Emoglobina', false), valore('Colesterolo LDL', true)],
}
const mostrate = (domande: ReturnType<typeof domandePronte>) => domande.map((d) => d.mostra)

afterEach(() => cambiaLingua('it'))

describe('domandePronte', () => {
  it("chiede dell'ultimo valore fuori intervallo", () => {
    expect(mostrate(domandePronte(referto))).toEqual(['Cosa vuol dire «Colesterolo LDL»?', 'Devo preoccuparmi?'])
  })

  it('senza valori fuori intervallo o senza referto chiede una spiegazione più semplice', () => {
    expect(domandePronte({ id: 'r2', titolo: 'Visita', data: '1 ottobre 2026', testo: '…' })[0].mostra).toBe('Me lo spieghi più semplice?')
    expect(mostrate(domandePronte())).toEqual(['Me lo spieghi più semplice?', 'Devo preoccuparmi?'])
  })

  it('in inglese mostra la domanda in inglese ma la manda in italiano', () => {
    cambiaLingua('en')
    expect(domandePronte(referto)).toEqual([
      { mostra: 'What does “Colesterolo LDL” mean?', invia: 'Cosa vuol dire «Colesterolo LDL»?' },
      { mostra: 'Should I be worried?', invia: 'Devo preoccuparmi?' },
    ])
  })
})
