import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ArchivioChat, nuovaTraceMotore, type TraceGenerazione, type TraceMotore } from './archivio-chat';
import type { EventoChat } from './evolus.client';
import { MotoreChat } from './motore-chat';

/** Id di una conversazione salvata in MongoDB (ObjectId); gli altri sono conversazioni del motore. */
const ID_ARCHIVIO = /^[0-9a-f]{24}$/i;
const CONVERSAZIONE_PERSA = 'Questa conversazione non è più disponibile. Riapri il referto per ricominciare.';

/** Impronta del referto: lo stesso testo, anche incollato con spazi o a capo diversi, dà la stessa impronta. */
export function improntaReferto(testo: string): string {
  return createHash('sha256').update(testo.replace(/\s+/g, ' ').trim()).digest('hex');
}

export interface RichiestaChat {
  messaggio: string;
  conversazione?: string;
  /** Intestazione X-Utente-Id, se il browser la manda. */
  utente?: string;
}

/**
 * La chat sopra il motore. Con l'archivio (MongoDB):
 * - il primo messaggio è il referto: se lo stesso utente lo ha già fatto
 *   spiegare si restituisce la spiegazione salvata, senza chiamare il modello;
 * - le domande successive mandano al motore la storia salvata (referto,
 *   spiegazione, domande precedenti), così il referto non viene rispiegato;
 * - ogni generazione lascia una trace (anche gli errori e le risposte dalla cache).
 * Senza archivio, o se l'archivio non risponde, la chat va dritta al motore.
 */
@Injectable()
export class ServizioChat {
  // Solo esiti tecnici: mai il contenuto dei messaggi.
  private readonly logger = new Logger('Chat');

  constructor(
    private readonly motore: MotoreChat,
    @Optional() private readonly archivio?: ArchivioChat,
  ) {}

  configurato(): boolean {
    return this.motore.configurato();
  }

  async *rispondi({ messaggio, conversazione, utente }: RichiestaChat, segnale: AbortSignal): AsyncGenerator<EventoChat> {
    const archivio = this.archivio;
    if (!archivio || (conversazione && !ID_ARCHIVIO.test(conversazione))) {
      yield* this.motore.chiedi(messaggio, conversazione, segnale);
      return;
    }
    let idUtente: string;
    try {
      idUtente = await archivio.utente(utente);
    } catch (errore) {
      this.avvisa('utente', errore);
      yield* this.motore.chiedi(messaggio, undefined, segnale);
      return;
    }
    if (conversazione) yield* this.domanda(archivio, idUtente, conversazione, messaggio, segnale);
    else yield* this.spiegazione(archivio, idUtente, messaggio, segnale);
  }

  private async *spiegazione(archivio: ArchivioChat, utente: string, referto: string, segnale: AbortSignal): AsyncGenerator<EventoChat> {
    const inizio = Date.now();
    const hash = improntaReferto(referto);
    const versione = this.motore.versione();

    const inCache = await this.prova('cerca spiegazione', () => archivio.cercaSpiegazione(utente, hash, versione));
    if (inCache) {
      yield { tipo: 'testo', testo: inCache.testo };
      const trace = this.trace(nuovaTraceMotore(this.motore.nome), {
        tipo: 'spiegazione', esito: 'ok', da_cache: true, versione, inizio, messaggio: referto, risposta: inCache.testo,
      });
      const id = await this.prova('nuova conversazione', () =>
        archivio.nuovaConversazione({ utente, referto, hash, spiegazione: inCache, trace }),
      );
      yield { tipo: 'fine', conversazione: id, da_cache: true };
      return;
    }

    const traceMotore = nuovaTraceMotore(this.motore.nome);
    let testo = '';
    let esito: TraceGenerazione['esito'] = 'interrotta';
    try {
      for await (const evento of this.motore.chiedi(referto, undefined, segnale, { trace: traceMotore })) {
        if (evento.tipo === 'testo') {
          testo += evento.testo;
          yield evento;
        } else if (evento.tipo === 'errore') {
          esito = 'errore';
          yield evento;
        } else {
          esito = 'ok';
          const trace = this.trace(traceMotore, { tipo: 'spiegazione', esito, da_cache: false, versione, inizio, messaggio: referto, risposta: testo });
          const id = await this.prova('salva spiegazione', async () => {
            const spiegazione = await archivio.salvaSpiegazione({ utente, hash, versione, testo });
            return archivio.nuovaConversazione({
              utente, referto, hash, spiegazione: { id: spiegazione, testo }, conversazioneMotore: evento.conversazione ?? undefined, trace,
            });
          });
          // Senza archivio la conversazione resta quella del motore: le domande continuano lo stesso.
          yield { tipo: 'fine', conversazione: id ?? evento.conversazione, da_cache: false };
        }
      }
    } finally {
      if (esito !== 'ok') {
        const trace = this.trace(traceMotore, { tipo: 'spiegazione', esito, da_cache: false, versione, inizio, messaggio: referto, risposta: testo });
        await this.prova('salva trace', () => archivio.salvaTrace({ utente, trace }));
      }
    }
  }

  private async *domanda(
    archivio: ArchivioChat,
    utente: string,
    conversazione: string,
    messaggio: string,
    segnale: AbortSignal,
  ): AsyncGenerator<EventoChat> {
    const inizio = Date.now();
    const contesto = await this.prova('leggi conversazione', () => archivio.contesto(utente, conversazione));
    if (!contesto) {
      yield { tipo: 'errore', messaggio: CONVERSAZIONE_PERSA };
      return;
    }

    const versione = this.motore.versione();
    const traceMotore = nuovaTraceMotore(this.motore.nome);
    let testo = '';
    let esito: TraceGenerazione['esito'] = 'interrotta';
    const opzioni = { storia: contesto.storia, trace: traceMotore };
    try {
      for await (const evento of this.motore.chiedi(messaggio, contesto.conversazioneMotore, segnale, opzioni)) {
        if (evento.tipo === 'testo') {
          testo += evento.testo;
          yield evento;
        } else if (evento.tipo === 'errore') {
          esito = 'errore';
          yield evento;
        } else {
          esito = 'ok';
          const trace = this.trace(traceMotore, { tipo: 'domanda', esito, da_cache: false, versione, inizio, messaggio, risposta: testo });
          await this.prova('salva turno', () =>
            archivio.aggiungiTurno({
              utente, conversazione, messaggio, risposta: testo, conversazioneMotore: evento.conversazione ?? undefined, trace,
            }),
          );
          yield { tipo: 'fine', conversazione };
        }
      }
    } finally {
      if (esito !== 'ok') {
        const trace = this.trace(traceMotore, { tipo: 'domanda', esito, da_cache: false, versione, inizio, messaggio, risposta: testo });
        await this.prova('salva trace', () => archivio.salvaTrace({ utente, conversazione, trace }));
      }
    }
  }

  private trace(
    motore: TraceMotore,
    dati: Pick<TraceGenerazione, 'tipo' | 'esito' | 'da_cache' | 'versione'> & { inizio: number; messaggio: string; risposta: string },
  ): TraceGenerazione {
    const { inizio, messaggio, risposta, ...resto } = dati;
    return {
      ...motore,
      ...resto,
      durata_ms: Date.now() - inizio,
      lunghezza_messaggio: messaggio.length,
      lunghezza_risposta: risposta.length,
    };
  }

  /** L'archivio non deve mai fermare la chat: un suo errore si registra (senza contenuti) e si va avanti. */
  private async prova<T>(operazione: string, azione: () => Promise<T>): Promise<T | null> {
    try {
      return await azione();
    } catch (errore) {
      this.avvisa(operazione, errore);
      return null;
    }
  }

  private avvisa(operazione: string, errore: unknown): void {
    this.logger.warn(`Archivio non disponibile (${operazione}): ${(errore as Error).name}`);
  }
}
