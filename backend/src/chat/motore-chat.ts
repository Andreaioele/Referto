import type { EventoChat } from './evolus.client';

/**
 * Chi risponde alla chat (Mother agent): su Evolus (EvolusClient) o
 * ricostruito nel backend (MotherDiretto). Si sceglie con MOTORE_CHAT; la
 * chat e le domande sui foglietti usano questa classe come token di Nest.
 */
export abstract class MotoreChat {
  /** Nome per i log e per /api/salute. */
  abstract readonly nome: string;

  abstract configurato(): boolean;

  /** Risposta in streaming: pezzi di testo, poi "fine" (con la conversazione) o "errore". */
  abstract chiedi(messaggio: string, conversazione: string | undefined, segnale: AbortSignal): AsyncGenerator<EventoChat>;
}
