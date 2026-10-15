import { Logger } from '@nestjs/common';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Prodotto } from '../farmaci/prontuario.types';
import { FogliettoNonDisponibile, type FonteFoglietti, type PdfFoglietto } from './fonte-foglietti';

const MASSIMO_IN_MEMORIA = 30;
const ATTESA_AIFA_MS = 30_000;

/**
 * Fogli illustrativi scaricati dal sito AIFA (`foglietto_url` del prontuario).
 * Ogni foglio si scarica una sola volta: le richieste contemporanee aspettano
 * lo stesso download, un download fallito non resta in memoria e oltre
 * MASSIMO_IN_MEMORIA fogli si toglie il più vecchio. `scarica` si passa nei
 * test; nel modulo si crea con `useFactory` (fetch di Node).
 */
export class FonteAifa implements FonteFoglietti {
  // Solo esiti tecnici: codice del farmaco, pagine, durata.
  private readonly logger = new Logger('FonteAifa');
  private readonly letti = new Map<string, Promise<PdfFoglietto>>();

  constructor(private readonly scarica: typeof fetch = (...argomenti) => fetch(...argomenti)) {}

  leggi(farmaco: Prodotto): Promise<PdfFoglietto> {
    let lettura = this.letti.get(farmaco.cod);
    if (!lettura) {
      lettura = this.scaricaEdEstrai(farmaco);
      lettura.catch(() => this.letti.delete(farmaco.cod));
      this.letti.set(farmaco.cod, lettura);
      if (this.letti.size > MASSIMO_IN_MEMORIA) this.letti.delete(this.letti.keys().next().value as string);
    }
    return lettura;
  }

  private async scaricaEdEstrai(farmaco: Prodotto): Promise<PdfFoglietto> {
    const inizio = Date.now();
    let pdf: Uint8Array;
    try {
      const risposta = await this.scarica(farmaco.foglietto_url, { signal: AbortSignal.timeout(ATTESA_AIFA_MS) });
      pdf = new Uint8Array(await risposta.arrayBuffer());
      if (!risposta.ok || !èPdf(pdf)) throw new Error(`HTTP ${risposta.status}`);
    } catch (errore) {
      this.logger.warn(`Foglietto ${farmaco.cod} non scaricato da AIFA: ${(errore as Error).message}`);
      throw new FogliettoNonDisponibile((errore as Error).message);
    }
    // pdf.js si prende il buffer che riceve: gli si passa una copia.
    const documento = await getDocumentProxy(pdf.slice());
    const { totalPages, text } = await extractText(documento, { mergePages: false });
    this.logger.log(`Foglietto ${farmaco.cod}: ${totalPages} pagine, ${Date.now() - inizio} ms`);
    return { pdf, pagine: totalPages, testo: text };
  }
}

function èPdf(dati: Uint8Array): boolean {
  return dati.length > 4 && String.fromCharCode(...dati.slice(0, 4)) === '%PDF';
}
