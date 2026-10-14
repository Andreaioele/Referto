/**
 * Normalizzazione dei nomi dei farmaci: porta in TypeScript le funzioni di
 * resources/farmaci_referti.py (normalize, inn_key, _component_keys,
 * _ingredient_label), con gli stessi dati di data/normalizzazione.json. App e servizio devono
 * riconoscere gli stessi nomi: i test di parità in test/ lo verificano.
 */

export interface DatiNormalizzazione {
  parole_sale: string[];
  alias: Record<string, string>;
}

/** Come `str.split()` di Python: spazi multipli e stringa vuota non producono parole vuote. */
export function parole(testo: string): string[] {
  return testo.split(/\s+/).filter(Boolean);
}

/** Minuscole, senza accenti, solo lettere e numeri (con decimali come "2.5" o "1/2"). */
export function normalizza(testo: string): string {
  const ascii = (testo || '').toLowerCase().normalize('NFKD').replace(/[^\x00-\x7f]/g, '');
  return (ascii.match(/[a-z0-9]+(?:[.,/][0-9]+)?/g) ?? []).join(' ');
}

/**
 * Chiave che avvicina grafie inglesi e italiane dello stesso principio attivo:
 * metformin / metformina, levothyroxine / levotiroxina, naproxen / naprossene.
 */
export function chiaveInn(nome: string): string {
  let chiave = normalizza(nome).replace(/[^a-z]/g, '');
  const sostituzioni: Array<[string, string]> = [
    ['ph', 'f'], ['th', 't'], ['ch', 'c'], ['y', 'i'], ['x', 'ss'], ['k', 'c'], ['h', ''],
  ];
  for (const [vecchio, nuovo] of sostituzioni) {
    chiave = chiave.split(vecchio).join(nuovo);
  }
  chiave = chiave.replace(/(.)\1+/g, '$1');
  return chiave.replace(/[aeiou]+$/, '');
}

export class Normalizzatore {
  private readonly sali: Set<string>;
  private readonly alias: Map<string, string>;

  constructor(dati: DatiNormalizzazione) {
    this.sali = new Set(dati.parole_sale);
    this.alias = new Map(Object.entries(dati.alias));
  }

  /** Principio attivo italiano per un nome inglese o un marchio estero ("Motrin" -> ibuprofene). */
  aliasDi(testo: string): string {
    return this.alias.get(normalizza(testo)) ?? '';
  }

  /** Chiavi di un componente: con e senza le parole del sale ("metformina cloridrato" -> "metformin"). */
  chiaviComponente(componente: string): string[] {
    const tutte = parole(normalizza(componente));
    const chiavi = [chiaveFrase(tutte)];
    const senzaSale = tutte.filter((parola) => !this.sali.has(parola));
    if (senzaSale.length > 0 && senzaSale.length !== tutte.length) {
      chiavi.push(chiaveFrase(senzaSale));
    }
    return chiavi.filter((chiave) => chiave.length >= 4);
  }

  /** Chiave di un principio attivo o di un'associazione ("amoxicillina/acido clavulanico"). */
  chiavePrincipioAttivo(principioAttivo: string): string {
    return principioAttivo
      .split('/')
      .flatMap((componente) => this.chiaviComponente(componente).slice(-1))
      .sort()
      .join('+');
  }

  /** Nome leggibile del principio attivo AIFA, senza sali: "IBUPROFENE SALE DI LISINA" -> "ibuprofene lisina". */
  etichettaPrincipioAttivo(principioAttivo: string): string {
    return principioAttivo
      .split('/')
      .map((componente) => {
        const tutte = parole(componente.toLowerCase());
        const senzaSale = tutte.filter((parola) => !this.sali.has(parola));
        return (senzaSale.length > 0 ? senzaSale : tutte).join(' ');
      })
      .join(' + ');
  }
}

/** Parola per parola: "insulin glargine" e "insulina glargine" -> "insulin glargin". */
function chiaveFrase(elenco: string[]): string {
  return elenco.map(chiaveInn).filter(Boolean).join(' ');
}
