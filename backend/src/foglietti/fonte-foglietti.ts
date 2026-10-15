import type { Prodotto } from '../farmaci/prontuario.types';

/** PDF del foglio illustrativo con il testo di ogni pagina. */
export interface PdfFoglietto {
  pdf: Uint8Array;
  pagine: number;
  testo: string[];
}

/**
 * Da dove arrivano i fogli illustrativi. In produzione è AIFA (`FonteAifa`:
 * download, estrazione del testo, memoria); nei test una fonte con pagine
 * scritte nel test. `FogliettiService` legge i fogli solo da qui.
 */
export interface FonteFoglietti {
  /** Il foglio del farmaco; lancia `FogliettoNonDisponibile` se la fonte non lo restituisce. */
  leggi(farmaco: Prodotto): Promise<PdfFoglietto>;
}

export const FONTE_FOGLIETTI = Symbol('FONTE_FOGLIETTI');

/** La fonte non ha restituito il foglio (rete, errore HTTP, file che non è un PDF). */
export class FogliettoNonDisponibile extends Error {}
