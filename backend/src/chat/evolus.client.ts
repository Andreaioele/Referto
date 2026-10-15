import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';
import type { TurnoStoria } from './archivio-chat';
import { MotoreChat, type OpzioniChiedi } from './motore-chat';

/** Evento della chat inviato al browser, già semplificato rispetto a quelli di Evolus. */
export type EventoChat =
  | { tipo: 'testo'; testo: string }
  | { tipo: 'fine'; conversazione: string | null; da_cache?: boolean }
  | { tipo: 'errore'; messaggio: string };

/** Riga "data:" di /ask-stream di Evolus: pezzi di testo e, alla fine, isComplete. */
interface EventoEvolus {
  content?: string;
  isComplete?: boolean;
  error?: string;
  conversationId?: string;
}

const MESSAGGI_ERRORE: Record<number, string> = {
  401: 'Il servizio di spiegazione non è configurato correttamente.',
  422: 'Il servizio di spiegazione è sovraccarico. Riprova tra qualche minuto.',
  429: 'Il servizio di spiegazione è sovraccarico. Riprova tra qualche minuto.',
};
const ERRORE_GENERICO = 'Il servizio di spiegazione non ha risposto. Riprova tra qualche minuto.';

/** Inoltra i messaggi al Mother agent di Evolus (endpoint /ask-stream) e ne legge la risposta in streaming. */
@Injectable()
export class EvolusClient extends MotoreChat {
  readonly nome = 'evolus';

  // Solo esiti tecnici (stato HTTP, codice d'errore, durata): mai il contenuto dei messaggi.
  private readonly logger = new Logger('Evolus');

  configurato(): boolean {
    return Boolean(config.evolus.apiKey && config.evolus.applicationId && config.evolus.agentId);
  }

  /** Il prompt vive su Evolus: la versione è l'agente. */
  versione(): string {
    return `evolus/${config.evolus.agentId}`;
  }

  async *chiedi(
    messaggio: string,
    conversazione: string | undefined,
    segnale: AbortSignal,
    { storia, trace }: OpzioniChiedi = {},
  ): AsyncGenerator<EventoChat> {
    const { apiBase, apiKey, applicationId, agentId } = config.evolus;
    const inizio = Date.now();
    const secondi = () => Math.round((Date.now() - inizio) / 1000);
    // Una conversazione Evolus ricorda già tutto; senza (spiegazione presa dalla cache) la storia va nel messaggio.
    const contenuto = !conversazione && storia?.length ? messaggioConStoria(storia, messaggio) : messaggio;
    if (trace) {
      trace.modello = `agente ${agentId}`;
      trace.modelli_provati.push(trace.modello);
      trace.giri = 1;
    }
    let risposta: Response;
    try {
      risposta = await fetch(`${apiBase}/agents/${agentId}/ask-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'X-ApiKey': apiKey,
          'X-Application-Id': applicationId,
        },
        // "content" è il campo che Evolus legge; "conversationId" continua la stessa conversazione.
        body: JSON.stringify(conversazione ? { content: contenuto, conversationId: conversazione } : { content: contenuto }),
        signal: segnale,
      });
    } catch (errore) {
      if (!segnale.aborted) {
        this.logger.warn(`Evolus non raggiungibile: ${(errore as Error).name}`);
        if (trace) trace.errore = `non raggiungibile: ${(errore as Error).name}`;
        yield { tipo: 'errore', messaggio: ERRORE_GENERICO };
      }
      return;
    }
    if (!risposta.ok || !risposta.body) {
      this.logger.warn(`Evolus ha risposto HTTP ${risposta.status}`);
      if (trace) trace.errore = `HTTP ${risposta.status}`;
      yield { tipo: 'errore', messaggio: MESSAGGI_ERRORE[risposta.status] ?? ERRORE_GENERICO };
      return;
    }

    let conversazioneFinale: string | null = conversazione ?? null;
    for await (const dati of righeDati(risposta.body)) {
      let evento: EventoEvolus;
      try {
        evento = JSON.parse(dati) as EventoEvolus;
      } catch {
        continue;
      }
      if (evento.content) {
        if (trace && trace.primo_testo_ms === undefined) trace.primo_testo_ms = Date.now() - inizio;
        yield { tipo: 'testo', testo: evento.content };
      }
      if (evento.conversationId) conversazioneFinale = evento.conversationId;
      if (evento.isComplete) {
        if (evento.error) {
          this.logger.warn(`Evolus ha chiuso con errore "${evento.error}" dopo ${secondi()}s`);
          if (trace) trace.errore = evento.error;
        }
        yield evento.error
          ? { tipo: 'errore', messaggio: ERRORE_GENERICO }
          : { tipo: 'fine', conversazione: conversazioneFinale };
        return;
      }
    }
    if (!segnale.aborted) {
      this.logger.warn(`Evolus ha chiuso il flusso senza concluderlo dopo ${secondi()}s`);
      if (trace) trace.errore = 'flusso chiuso senza conclusione';
      yield { tipo: 'errore', messaggio: ERRORE_GENERICO };
    }
  }
}

/**
 * Il referto con la spiegazione già data e le domande precedenti, in un solo
 * messaggio: serve quando la spiegazione viene dalla cache e su Evolus non
 * c'è una conversazione da continuare.
 */
export function messaggioConStoria(storia: TurnoStoria[], domanda: string): string {
  const [referto, ...domande] = storia;
  const parti = [
    'Il referto qui sotto è già stato spiegato: non spiegarlo di nuovo. Rispondi solo alla DOMANDA, ' +
      'usando il referto e la spiegazione già data.',
    `REFERTO:\n${referto.domanda}`,
    `SPIEGAZIONE GIÀ DATA:\n${referto.risposta}`,
    ...domande.map((turno) => `DOMANDA PRECEDENTE:\n${turno.domanda}\n\nRISPOSTA DATA:\n${turno.risposta}`),
    `DOMANDA:\n${domanda}`,
  ];
  return parti.join('\n\n');
}

/**
 * Contenuto delle righe "data:" di un flusso Server-Sent Events. Le righe di
 * commento (": keep-alive") vengono saltate; una riga può arrivare spezzata
 * in più pezzi di rete.
 */
export async function* righeDati(flusso: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let resto = '';
  for await (const pezzo of flusso as unknown as AsyncIterable<Uint8Array>) {
    resto += decoder.decode(pezzo, { stream: true });
    const righe = resto.split(/\r?\n/);
    resto = righe.pop() ?? '';
    for (const riga of righe) {
      if (riga.startsWith('data:')) yield riga.slice(5).trimStart();
    }
  }
  resto += decoder.decode();
  if (resto.startsWith('data:')) yield resto.slice(5).trimStart();
}
