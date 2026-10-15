import type { TraceMotore, TurnoStoria } from './archivio-chat';
import type { EventoChat } from './evolus.client';

export interface OpzioniChiedi {
  /**
   * Referto, spiegazione e domande già fatte, letti dall'archivio: il motore
   * li usa al posto della propria memoria e non rispiega il referto.
   */
  storia?: TurnoStoria[];
  /** Raccoglie i dati tecnici della generazione (modello, tempi, strumenti). */
  trace?: TraceMotore;
}

/**
 * Chi risponde alla chat (Mother agent): su Evolus (EvolusClient) o
 * ricostruito nel backend (MotherDiretto). Si sceglie con MOTORE_CHAT; la
 * chat e le domande sui foglietti usano questa classe come token di Nest.
 */
export abstract class MotoreChat {
  /** Nome per i log e per /api/salute. */
  abstract readonly nome: string;

  abstract configurato(): boolean;

  /** Motore, modello e prompt: cambia quando cambia il modo di spiegare, e con lei la cache. */
  abstract versione(): string;

  /** Risposta in streaming: pezzi di testo, poi "fine" (con la conversazione) o "errore". */
  abstract chiedi(
    messaggio: string,
    conversazione: string | undefined,
    segnale: AbortSignal,
    opzioni?: OpzioniChiedi,
  ): AsyncGenerator<EventoChat>;
}
