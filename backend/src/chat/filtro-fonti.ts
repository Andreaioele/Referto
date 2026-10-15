/** Inizi di riga da trattenere finché la riga non è finita (in minuscolo). */
const PREFISSI = ['fonte:', '<｜dsml｜', '</｜dsml｜'];

/**
 * Toglie dalla risposta del modello le righe "Fonte: …" che non vengono da uno strumento chiamato nella
 * stessa domanda (una fonte citata deve essere verificabile, non inventata dal modello) e le righe di
 * markup DSML: chiamate a strumenti che DeepSeek a volte scrive come testo invece di farle.
 *
 * Lavora sullo streaming: trattiene l'inizio di ogni riga finché non è chiaro se è una riga "Fonte:",
 * e la lascia passare (o la toglie) quando la riga è finita.
 */
export class FiltroFonti {
  private readonly ammesse = new Set<string>();
  private riga = '';
  /** La riga corrente non è una riga "Fonte:" ed è già stata mandata. */
  private rigaLibera = false;

  /** Registra le fonti restituite da uno strumento (nomi e link), che da qui in poi si possono citare. */
  ammettiDa(strumento: string, risultato: string): void {
    if (strumento === 'cercaFarmaci') this.ammesse.add('AIFA');
    let dati: { risultati?: Array<{ fonte?: unknown; url?: unknown }> };
    try {
      dati = JSON.parse(risultato) as typeof dati;
    } catch {
      return;
    }
    for (const { fonte, url } of dati.risultati ?? []) {
      // "Wikipedia in italiano (CC BY-SA 4.0)" si può citare anche senza la licenza tra parentesi.
      if (typeof fonte === 'string' && fonte.trim()) this.ammesse.add(fonte.split(' (')[0].trim());
      if (typeof url === 'string' && url) this.ammesse.add(url);
    }
  }

  /** Il testo da mandare subito alla persona (può essere vuoto se una riga è in sospeso). */
  aggiungi(testo: string): string {
    let uscita = '';
    for (const carattere of testo) {
      if (this.rigaLibera) {
        uscita += carattere;
        if (carattere === '\n') this.rigaLibera = false;
        continue;
      }
      this.riga += carattere;
      if (carattere === '\n') {
        uscita += this.valuta(this.riga);
        this.riga = '';
        continue;
      }
      const inizio = this.riga.trimStart().toLowerCase();
      // Finché la riga può ancora diventare "Fonte:" o markup (o lo è) si aspetta la fine della riga.
      if (!inizio || PREFISSI.some((prefisso) => prefisso.startsWith(inizio) || inizio.startsWith(prefisso))) continue;
      uscita += this.riga;
      this.riga = '';
      this.rigaLibera = true;
    }
    return uscita;
  }

  /** Alla fine della risposta: l'ultima riga rimasta in sospeso. */
  fine(): string {
    const resto = this.valuta(this.riga);
    this.riga = '';
    this.rigaLibera = false;
    return resto;
  }

  private valuta(riga: string): string {
    const inizio = riga.trim().toLowerCase();
    if (inizio.startsWith('<｜dsml｜') || inizio.startsWith('</｜dsml｜')) return '';
    const fonte = inizio.startsWith('fonte:');
    return !fonte || [...this.ammesse].some((ammessa) => riga.includes(ammessa)) ? riga : '';
  }
}
