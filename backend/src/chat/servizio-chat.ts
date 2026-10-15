import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ArchivioChat, nuovaTraceMotore, type TraceGenerazione, type TraceMotore } from './archivio-chat';
import type { EventoChat } from './evolus.client';
import { MotoreChat } from './motore-chat';

/** Id di una conversazione salvata in MongoDB (ObjectId); gli altri sono conversazioni del motore. */
const ID_ARCHIVIO = /^[0-9a-f]{24}$/i;
const CONVERSAZIONE_PERSA = 'Questa conversazione non è più disponibile. Riapri il referto per ricominciare.';
const ERRORE_GENERICO = 'Il servizio di spiegazione non ha risposto. Riprova tra qualche minuto.';
/**
 * Tempo massimo di una spiegazione, che continua anche se il browser chiude:
 * sotto i 300 secondi di una funzione Vercel, sopra i 20 + 90 secondi di attesa
 * dei due modelli del motore diretto più lo streaming.
 */
const DURATA_MASSIMA_SPIEGAZIONE_MS = 240_000;

/** Impronta del referto: lo stesso testo, anche incollato con spazi o a capo diversi, dà la stessa impronta. */
export function improntaReferto(testo: string): string {
  return createHash('sha256').update(testo.replace(/\s+/g, ' ').trim()).digest('hex');
}

export interface RichiestaChat {
  messaggio: string;
  conversazione?: string;
  /** Al browser serve solo la riga ARGOMENTO: la spiegazione va in cache, ma non nasce una conversazione. */
  classificazione?: boolean;
  /** Intestazione X-Utente-Id, se il browser la manda. */
  utente?: string;
}

type EventoFine = Extract<EventoChat, { tipo: 'fine' }>;

/**
 * La chat sopra il motore. Con l'archivio (MongoDB):
 * - il primo messaggio è il referto: se lo stesso utente lo ha già fatto
 *   spiegare si restituisce la spiegazione salvata, senza chiamare il modello;
 *   altrimenti la si genera fino in fondo e la si salva, anche se il browser
 *   chiude prima (come fa la classificazione dopo la riga ARGOMENTO);
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

  async *rispondi({ messaggio, conversazione, classificazione, utente }: RichiestaChat, segnale: AbortSignal): AsyncGenerator<EventoChat> {
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
    else yield* this.spiegazione(archivio, idUtente, messaggio, classificazione ? 'classificazione' : 'spiegazione', segnale);
  }

  private async *spiegazione(
    archivio: ArchivioChat,
    utente: string,
    referto: string,
    tipo: 'spiegazione' | 'classificazione',
    segnale: AbortSignal,
  ): AsyncGenerator<EventoChat> {
    const inizio = Date.now();
    const hash = improntaReferto(referto);
    const versione = this.motore.versione();
    // La conversazione serve solo a chi poi fa domande: non alla classificazione, né a un browser che ha già chiuso.
    const serveConversazione = () => tipo === 'spiegazione' && !segnale.aborted;

    const inCache = await this.prova('cerca spiegazione', () => archivio.cercaSpiegazione(utente, hash, versione));
    if (inCache) {
      yield { tipo: 'testo', testo: inCache.testo };
      const trace = this.trace(nuovaTraceMotore(this.motore.nome), {
        tipo, esito: 'ok', da_cache: true, versione, inizio, messaggio: referto, risposta: inCache.testo,
      });
      const id = serveConversazione()
        ? await this.prova('nuova conversazione', () => archivio.nuovaConversazione({ utente, referto, hash, spiegazione: inCache, trace }))
        : await this.prova('salva trace', () => archivio.salvaTrace({ utente, trace })).then(() => null);
      yield { tipo: 'fine', conversazione: id, da_cache: true };
      return;
    }

    // La generazione non dipende dal browser (solo da un tempo massimo): se chiude a metà
    // si legge il resto senza mandarlo, così la spiegazione finisce comunque in cache.
    const traceMotore = nuovaTraceMotore(this.motore.nome);
    const limite = AbortSignal.timeout(DURATA_MASSIMA_SPIEGAZIONE_MS);
    const flusso = this.motore.chiedi(referto, undefined, limite, { trace: traceMotore });
    let testo = '';
    let conclusa = false;
    let fine: EventoFine | null = null;
    let errore = false;
    let conversazione: string | null = null;
    const leggi = async (): Promise<EventoChat | null> => {
      const passo = await flusso.next();
      if (passo.done) {
        conclusa = true;
        return null;
      }
      const evento = passo.value;
      if (evento.tipo === 'testo') testo += evento.testo;
      else if (evento.tipo === 'fine') fine = evento;
      else errore = true;
      return evento;
    };

    try {
      while (!segnale.aborted) {
        const evento = await leggi();
        if (!evento) break;
        if (evento.tipo !== 'fine') yield evento;
      }
    } finally {
      // Si arriva qui anche quando il browser chiude: la generazione continua fino alla fine.
      try {
        while (!conclusa) await leggi();
      } catch (motivo) {
        // I motori non lanciano (danno "errore"): se succede lo stesso, resta la trace.
        traceMotore.errore ??= (motivo as Error).name;
      }
      if (!fine && !errore && limite.aborted) traceMotore.errore ??= `oltre ${DURATA_MASSIMA_SPIEGAZIONE_MS / 1000} secondi`;
      const esito: TraceGenerazione['esito'] = fine ? 'ok' : errore || limite.aborted ? 'errore' : 'interrotta';
      const trace = this.trace(traceMotore, { tipo, esito, da_cache: false, versione, inizio, messaggio: referto, risposta: testo });
      const spiegazione = fine ? await this.prova('salva spiegazione', () => archivio.salvaSpiegazione({ utente, hash, versione, testo })) : null;
      if (spiegazione && serveConversazione()) {
        const motore = (fine as EventoFine | null)?.conversazione ?? undefined;
        conversazione = await this.prova('nuova conversazione', () =>
          archivio.nuovaConversazione({ utente, referto, hash, spiegazione: { id: spiegazione, testo }, conversazioneMotore: motore, trace }),
        );
      } else {
        await this.prova('salva trace', () => archivio.salvaTrace({ utente, trace }));
      }
    }

    if (segnale.aborted) return;
    const finale = fine as EventoFine | null;
    if (finale) {
      // Se l'archivio non ha salvato, la conversazione resta quella del motore: le domande continuano lo stesso.
      yield { tipo: 'fine', conversazione: conversazione ?? (tipo === 'spiegazione' ? finale.conversazione : null), da_cache: false };
    } else if (!errore) {
      yield { tipo: 'errore', messaggio: ERRORE_GENERICO };
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
