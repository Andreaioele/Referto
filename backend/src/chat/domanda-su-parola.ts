import { normalizza, radice } from '../terminologia/testo';

/** Domande su che cosa vuol dire una parola: "Cos'è…", "Cosa vuol dire…", "Che cosa significa…". */
const DOMANDA_SU_PAROLA =
  /\b(cos(\s+|\s*'\s*)e|che\s+cosa\s+(e|sono|significa|vuol(e)?\s+dire|indica)|cosa\s+(vuol(e)?\s+dire|significa|indica|sono)|che\s+vuol(e)?\s+dire|significato\s+di)\b/;

/** Parole della domanda che non dicono di quale termine si parla. */
const PAROLE_VUOTE = new Set(
  (
    "cos cosa che e ed vuol vuole dire significa significato indica sono il lo la i gli le l un una uno un' di del dello " +
    'della dei degli delle d a al allo alla ai agli alle in nel nello nella nei negli nelle su sul sulla per con da dal ' +
    'dalla mi me ti te ci ce si se puoi potresti spiegare spieghi spiegami dimmi sai ma allora quindi invece poi pure ' +
    'anche e ancora questo questa questi queste quello quella quelli quelle quel parola parole termine termini sigla ' +
    'sigle scritto scritta scritte referto mio mia miei mie tuo tua qui li la c ce vuo ok grazie scusa bene esattamente ' +
    'come esempio intende intendi intendete medico dottore dottoressa'
  ).split(' '),
);

function normalizzaDomanda(messaggio: string): string {
  return messaggio.replace(/[’`]/g, "'");
}

export function domandaSuParola(messaggio: string): boolean {
  const testo = normalizzaDomanda(messaggio).toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
  return DOMANDA_SU_PAROLA.test(testo);
}

/** Le parole della domanda che indicano il termine chiesto ("E il lobo inferiore cos'è?" → lobo, inferiore). */
export function paroleChieste(messaggio: string): string[] {
  return normalizza(normalizzaDomanda(messaggio))
    .split(' ')
    .filter((parola) => parola.length > 1 && !PAROLE_VUOTE.has(parola) && !/^\d+$/.test(parola));
}

/**
 * Se il termine chiesto compare nel referto o nella conversazione (al singolare o al plurale). Senza parole
 * riconoscibili ("Cosa vuol dire?") si considera in tema: la domanda riprende la risposta precedente.
 */
export function parolaNellaConversazione(messaggio: string, testi: string[]): boolean {
  const chieste = paroleChieste(messaggio);
  if (chieste.length === 0) return true;
  const presenti = new Set(testi.flatMap((testo) => normalizza(testo).split(' ').map(radice)));
  return chieste.some((parola) => presenti.has(radice(parola)));
}
