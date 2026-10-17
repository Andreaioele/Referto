import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { config } from '../config';
import { problemaTraduzione } from './verifica';

/** Lingua di arrivo: "en" per le risposte di Referto, "it" per le domande scritte in inglese. */
export type LinguaArrivo = 'en' | 'it';

export interface Traduzione {
  testo: string;
  /** false: la traduzione non c'è o non ha passato il controllo, `testo` è l'originale. */
  tradotto: boolean;
}

const ATTESA_MS = 30_000;
const SOVRACCARICO = new Set([429, 502, 503, 504]);
const MASSIMO_IN_MEMORIA = 500;

class ErroreModello extends Error {
  constructor(readonly stato: number) {
    super(`HTTP ${stato}`);
  }
}

/**
 * Traduzioni dell'interfaccia in inglese: le risposte del Mother agent (che
 * scrive sempre in italiano) e del foglietto verso l'inglese, le domande
 * scritte in inglese verso l'italiano. Non tocca il Mother agent: traduce il
 * testo dopo che lui l'ha scritto, con lo stesso modello (AMD Token Factory) e
 * un prompt solo di traduzione (data/prompt-traduzione-*.md).
 *
 * Ogni traduzione verso l'inglese passa il controllo deterministico di
 * `verifica.ts` (stessi numeri, citazioni identiche); se non lo passa si
 * riprova una volta, poi si restituisce l'originale con `tradotto: false`.
 * Le traduzioni riuscite restano in memoria (stesso testo, stessa traduzione).
 * Nei log solo esiti tecnici, mai i testi.
 */
@Injectable()
export class TraduttoreService {
  private readonly logger = new Logger('Traduzione');
  private readonly prompt: Partial<Record<LinguaArrivo, string>> = {};
  private readonly memoria = new Map<string, string>();

  configurato(): boolean {
    return Boolean(config.modello.apiKey);
  }

  async traduci(testi: string[], lingua: LinguaArrivo, segnale?: AbortSignal): Promise<Traduzione[]> {
    return Promise.all(testi.map((testo) => this.traduciUno(testo, lingua, segnale)));
  }

  private async traduciUno(testo: string, lingua: LinguaArrivo, segnale?: AbortSignal): Promise<Traduzione> {
    if (!testo.trim()) return { testo, tradotto: false };
    const chiave = `${lingua}\n${testo}`;
    const salvata = this.memoria.get(chiave);
    if (salvata !== undefined) return { testo: salvata, tradotto: true };

    for (let tentativo = 1; tentativo <= 2; tentativo++) {
      let traduzione: string;
      try {
        traduzione = await this.chiediAlModello(testo, lingua, segnale);
      } catch (errore) {
        if (segnale?.aborted) throw errore;
        this.logger.warn(`Traduzione verso ${lingua} non riuscita: ${(errore as Error).message}`);
        return { testo, tradotto: false };
      }
      // Lo stesso controllo vale per le domande verso l'italiano: numeri e citazioni della persona restano quelli.
      const problema = problemaTraduzione(testo, traduzione);
      if (!problema) {
        this.ricorda(chiave, traduzione);
        return { testo: traduzione, tradotto: true };
      }
      this.logger.warn(`Traduzione verso ${lingua} scartata (${problema}), tentativo ${tentativo}`);
    }
    return { testo, tradotto: false };
  }

  private async chiediAlModello(testo: string, lingua: LinguaArrivo, segnale?: AbortSignal): Promise<string> {
    try {
      return await this.chiamata(config.modello.nome, testo, lingua, segnale);
    } catch (errore) {
      // Primo modello sovraccarico o lento: si prova la riserva, come fa il Mother diretto.
      const sovraccarico = errore instanceof ErroreModello && SOVRACCARICO.has(errore.stato);
      if (segnale?.aborted || !(sovraccarico || (errore as Error).name === 'TimeoutError')) throw errore;
      return this.chiamata(config.modello.riserva, testo, lingua, segnale);
    }
  }

  private async chiamata(modello: string, testo: string, lingua: LinguaArrivo, segnale?: AbortSignal): Promise<string> {
    const limite = AbortSignal.timeout(ATTESA_MS);
    const risposta = await fetch(`${config.modello.apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.modello.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modello,
        messages: [
          { role: 'system', content: this.promptPer(lingua) },
          { role: 'user', content: testo },
        ],
        stream: false,
        temperature: 0,
        max_tokens: 2000,
      }),
      signal: segnale ? AbortSignal.any([segnale, limite]) : limite,
    });
    if (!risposta.ok) throw new ErroreModello(risposta.status);
    const dati = (await risposta.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    return pulisci(dati.choices?.[0]?.message?.content ?? '');
  }

  private promptPer(lingua: LinguaArrivo): string {
    this.prompt[lingua] ??= readFileSync(lingua === 'en' ? config.promptTraduzione.en : config.promptTraduzione.it, 'utf8').trim();
    return this.prompt[lingua];
  }

  private ricorda(chiave: string, traduzione: string): void {
    this.memoria.delete(chiave);
    this.memoria.set(chiave, traduzione);
    if (this.memoria.size > MASSIMO_IN_MEMORIA) this.memoria.delete(this.memoria.keys().next().value as string);
  }
}

/** Toglie ragionamenti (<think>…</think>), righe di markup DSML e virgolette messe intorno a tutto il testo. */
export function pulisci(testo: string): string {
  const senzaRagionamento = testo.replace(/<think>[\s\S]*?<\/think>/g, '');
  const righe = senzaRagionamento.split('\n').filter((riga) => !/^\s*<\/?｜dsml｜/i.test(riga));
  return righe
    .join('\n')
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim();
}
