import { chiaveInn, normalizza, Normalizzatore, parole } from '../src/farmaci/normalizzazione';
import dati from '../../farmaci/normalizzazione.json';

describe('normalizzazione', () => {
  it('toglie accenti e punteggiatura come normalize() in Python', () => {
    // Valori presi da normalize() di farmaci_referti.py: la barra unisce solo numeri.
    expect(normalizza('Lévothyroxine 2,5 mg/die!')).toBe('levothyroxine 2,5 mg die');
    expect(normalizza('Augmentin 875/125 mg')).toBe('augmentin 875/125 mg');
    expect(normalizza('  ')).toBe('');
    expect(parole('')).toEqual([]);
  });

  it('avvicina grafie inglesi e italiane dello stesso principio attivo', () => {
    expect(chiaveInn('metformin')).toBe(chiaveInn('metformina'));
    expect(chiaveInn('levothyroxine')).toBe(chiaveInn('levotiroxina'));
    expect(chiaveInn('naproxen')).toBe(chiaveInn('naprossene'));
  });

  it('ignora i sali e conosce i marchi esteri', () => {
    const normalizzatore = new Normalizzatore(dati);
    expect(normalizzatore.chiavePrincipioAttivo('METFORMINA CLORIDRATO')).toBe(
      normalizzatore.chiavePrincipioAttivo('metformin'),
    );
    expect(normalizzatore.etichettaPrincipioAttivo('AMOXICILLINA TRIIDRATO/ACIDO CLAVULANICO')).toBe(
      'amoxicillina + acido clavulanico',
    );
    expect(normalizzatore.aliasDi('Motrin')).toBe('ibuprofene');
  });
});
