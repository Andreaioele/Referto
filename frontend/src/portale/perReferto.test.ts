import { describe, expect, it } from 'vitest'
import { documento, farmaci, type Documento } from './dati'
import { dataLunga, giornoEData } from './date'
import { casaDelPaziente, farmacoDaLeggere, refertoDaSpiegare } from './perReferto'

describe('refertoDaSpiegare', () => {
  it('passa a Referto testo, valori e note del referto, con date già scritte e la visita futura risolta', () => {
    const sangue = documento('d-sangue')!
    const referto = refertoDaSpiegare(sangue)!
    expect(referto.id).toBe('d-sangue')
    expect(referto.doveAndare).toBe('/documenti?referto=d-sangue&cerca=strutture')
    expect(referto.aChiChiedere).toBe('/documenti?referto=d-sangue&cerca=professionisti')
    expect(referto.classificazione).toEqual({ esame: 'Esami del sangue', area: 'Laboratorio analisi' })
    expect(referto.titolo).toBe('Esami del sangue')
    expect(referto.data).toBe(dataLunga(-12))
    expect(referto.testo).toBe(sangue.referto!.testo)
    expect(referto.valori).toHaveLength(8)
    expect(referto.noteMedico).toContain('Ricontrollo del profilo lipidico')
    expect(referto.visitaCollegata).toEqual({
      titolo: 'Visita cardiologica di controllo',
      quando: giornoEData(8),
      href: '/visite',
    })
  })

  it('non passa una visita collegata già fatta', () => {
    const conVisitaPassata: Documento = {
      ...documento('d-sangue')!,
      referto: { ...documento('d-sangue')!.referto!, visitaCollegata: 'v-ecg' },
    }
    expect(refertoDaSpiegare(conVisitaPassata)!.visitaCollegata).toBeUndefined()
  })

  it('non passa nulla per un documento che non è un referto', () => {
    const fattura: Documento = { id: 'x', tipo: 'fattura', titolo: 'Fattura', giorni: -1, autore: 'Studio' }
    expect(refertoDaSpiegare(fattura)).toBeUndefined()
  })
})

describe('casaDelPaziente', () => {
  it('è a Milano, dentro la città: da qui partono le distanze di "Le mie strutture"', () => {
    const casa = casaDelPaziente()
    expect(casa.indirizzo).toBe('Viale Monza 140')
    expect(casa.lat).toBeGreaterThan(45.38)
    expect(casa.lat).toBeLessThan(45.54)
    expect(casa.lon).toBeGreaterThan(9.04)
    expect(casa.lon).toBeLessThan(9.28)
  })
})

describe('farmacoDaLeggere', () => {
  it('passa codice AIFA, confezione, nomi e dose scritta dal medico', () => {
    const triatec = farmaci.find((f) => f.id === 'f-triatec')!
    expect(farmacoDaLeggere(triatec)).toEqual({
      codiceAifa: '027161',
      confezione: '5 mg compresse',
      nome: 'Triatec',
      descrizione: triatec.nome,
      doseScritta: triatec.dose,
    })
  })

  it('non passa un farmaco che non è nel prontuario AIFA', () => {
    const senzaAifa = farmaci.find((f) => !f.aifa)!
    expect(farmacoDaLeggere(senzaAifa)).toBeUndefined()
  })
})
