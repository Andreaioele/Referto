import { describe, expect, it } from 'vitest'
import { distanzaLeggibile, nessunRisultato, titoloGruppo } from './strutture-testi'

const area = (id: string, reparto: string) => ({ id, etichetta: reparto, reparto })

describe('distanzaLeggibile', () => {
  it('metri sotto il chilometro (arrotondati a 50, almeno 100), chilometri con la virgola sopra', () => {
    expect(distanzaLeggibile(0.04)).toBe('a 100 m da casa')
    expect(distanzaLeggibile(0.83)).toBe('a 850 m da casa')
    expect(distanzaLeggibile(1.3)).toBe('a 1,3 km da casa')
    expect(distanzaLeggibile(12)).toBe('a 12 km da casa')
  })
})

describe('titoloGruppo', () => {
  it('dice che cosa contiene il gruppo, con le parole della persona', () => {
    expect(titoloGruppo('specialisti', area('cardiologia', 'cardiologia'))).toBe('Si occupano di cardiologia')
    expect(titoloGruppo('ospedali', area('cardiologia', 'cardiologia'))).toBe('Ospedali con il reparto di cardiologia')
    expect(titoloGruppo('ospedali', area('radiologia', 'radiologia'))).toBe('Ospedali: chiedi del servizio di radiologia')
    expect(titoloGruppo('specialisti', area('laboratorio', 'laboratorio analisi'))).toBe('Laboratori di analisi')
    expect(titoloGruppo('medici', area('pediatria', 'pediatria'))).toBe('Pediatri vicino a casa')
    expect(titoloGruppo('medici', area('medicina-generale', 'medicina generale'))).toBe('Medici di famiglia vicino a casa')
    expect(titoloGruppo('specialisti', area('dermatologia', 'dermatologia'), 'professionisti')).toBe('Studi di dermatologia vicino a casa')
    expect(titoloGruppo('medici', area('pediatria', 'pediatria'), 'professionisti')).toBe('Pediatri vicino a casa')
  })

  it('senza risultati rimanda al medico di famiglia, con parole diverse per strutture e professionisti', () => {
    expect(nessunRisultato(area('oncologia', 'oncologia'), 'strutture')).toBe(
      'Nei dati di Milano non ci sono strutture di oncologia: il tuo medico di famiglia può dirti dove andare.',
    )
    expect(nessunRisultato(area('oncologia', 'oncologia'), 'professionisti')).toBe(
      'Nei dati di Milano non ci sono studi di oncologia: il tuo medico di famiglia può dirti a chi rivolgerti.',
    )
  })
})
