/**
 * Controllo deterministico di una traduzione: la traduzione la fa un modello,
 * quindi prima di mostrarla si verifica che non abbia toccato ciò che si può
 * controllare. Se il controllo non passa, la persona legge l'originale.
 */

/** Numeri del testo senza separatori: "13,4" e "13.4" sono lo stesso numero, "10.000" e "10,000" anche. */
export function numeri(testo: string): string[] {
  return [...testo.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/[.,]/g, '')).sort();
}

/** Le citazioni tra « », che restano identiche. */
export function citazioni(testo: string): string[] {
  return [...testo.matchAll(/«([^»]*)»/g)].map((m) => m[1].trim());
}

/** Il motivo per cui la traduzione non va mostrata, o null se va bene. */
export function problemaTraduzione(originale: string, traduzione: string): string | null {
  const tradotta = traduzione.trim();
  if (!tradotta) return 'vuota';
  const rapporto = tradotta.length / Math.max(1, originale.trim().length);
  if (rapporto < 0.4 || rapporto > 3) return 'lunghezza';
  // Gli stessi numeri, né uno in meno né uno in più: un numero cambiato o aggiunto è un fatto cambiato.
  if (numeri(originale).join(' ') !== numeri(tradotta).join(' ')) return 'numeri';
  for (const citazione of citazioni(originale)) {
    if (!tradotta.includes(citazione)) return 'citazioni';
  }
  return null;
}
