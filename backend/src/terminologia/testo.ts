/**
 * Normalizzazione e radice delle parole, uguali a quelle dello script che costruisce il glossario
 * (resources/glossario/costruisci_glossario_strati.py): se cambiano lì, le chiavi del glossario non
 * corrispondono più e vanno cambiate anche qui.
 */

/** Minuscolo, senza accenti, solo lettere e cifre separate da spazi. */
export function normalizza(testo: string): string {
  const senzaAccenti = testo.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
  return (senzaAccenti.match(/[a-z0-9]+/g) ?? []).join(' ');
}

/** Radice leggera per singolare e plurale: "polmoni" e "polmone" → "polmon", "reni" e "rene" → "ren". */
export function radice(parola: string): string {
  if (parola.length < 4 || !'aeiou'.includes(parola.at(-1) as string)) return parola;
  const senzaVocale = parola.slice(0, -1);
  return senzaVocale.endsWith('ch') || senzaVocale.endsWith('gh') ? senzaVocale.slice(0, -1) : senzaVocale;
}

/** La chiave con cui un termine è nell'indice del glossario. */
export function chiave(testo: string): string {
  return normalizza(testo).split(' ').filter(Boolean).map(radice).join(' ');
}
