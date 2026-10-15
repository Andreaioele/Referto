/**
 * Cosa il motore registra di una generazione: solo dati tecnici (modello,
 * tempi, token, strumenti chiamati), mai il testo del referto o della risposta.
 */
export interface TraceMotore {
  motore: string;
  /** Il modello che ha scritto la risposta (l'ultimo provato). */
  modello?: string;
  /** Tutti i modelli provati, in ordine: più di uno se è intervenuta la riserva. */
  modelli_provati: string[];
  /** Richieste al modello (una in più per ogni giro di strumenti). */
  giri: number;
  /** Millisecondi fino al primo pezzo di testo. */
  primo_testo_ms?: number;
  token_input?: number;
  token_output?: number;
  chiamate_tool: ChiamataToolTrace[];
  /** Esito tecnico (stato HTTP, timeout), mai il contenuto. */
  errore?: string;
}

export interface ChiamataToolTrace {
  nome: string;
  parametri?: unknown;
  risposta?: unknown;
  durata_ms: number;
  errore?: string;
}

export function nuovaTraceMotore(motore: string): TraceMotore {
  return { motore, modelli_provati: [], giri: 0, chiamate_tool: [] };
}

/** La trace completa di una generazione, come viene salvata. */
export interface TraceGenerazione extends TraceMotore {
  tipo: 'spiegazione' | 'domanda';
  esito: 'ok' | 'errore' | 'interrotta';
  /** Spiegazione restituita dalla cache, senza chiamare il modello. */
  da_cache: boolean;
  /** Motore, modello e prompt: una spiegazione in cache vale solo per la stessa versione. */
  versione: string;
  durata_ms: number;
  lunghezza_messaggio: number;
  lunghezza_risposta: number;
}

/** Una domanda già fatta e la sua risposta: il primo turno è il referto con la spiegazione. */
export interface TurnoStoria {
  domanda: string;
  risposta: string;
}

export interface ContestoConversazione {
  storia: TurnoStoria[];
  /** Conversazione del motore (Evolus) da continuare, se c'è. */
  conversazioneMotore?: string;
}

/**
 * Dove la chat salva spiegazioni, conversazioni e trace. Lo fornisce il
 * modulo sessioni (MongoDB) solo se MONGODB_URI è impostata: senza, la chat
 * funziona come prima e non salva nulla.
 */
export abstract class ArchivioChat {
  /** L'utente della richiesta: quello indicato se esiste, altrimenti l'utente predefinito. */
  abstract utente(richiesto?: string): Promise<string>;

  /** La spiegazione già generata per lo stesso referto, utente e versione. */
  abstract cercaSpiegazione(utente: string, hash: string, versione: string): Promise<{ id: string; testo: string } | null>;

  /** Salva la spiegazione in cache e ne restituisce l'id (quello esistente se c'è già). */
  abstract salvaSpiegazione(dati: { utente: string; hash: string; versione: string; testo: string }): Promise<string>;

  /** Crea la conversazione di un referto spiegato e ne salva la trace; restituisce l'id. */
  abstract nuovaConversazione(dati: {
    utente: string;
    referto: string;
    hash: string;
    spiegazione: { id: string; testo: string };
    conversazioneMotore?: string;
    trace: TraceGenerazione;
  }): Promise<string>;

  /** Referto, spiegazione e domande già fatte; null se la conversazione non è dell'utente. */
  abstract contesto(utente: string, conversazione: string): Promise<ContestoConversazione | null>;

  /** Aggiunge una domanda con la risposta alla conversazione e ne salva la trace. */
  abstract aggiungiTurno(dati: {
    utente: string;
    conversazione: string;
    messaggio: string;
    risposta: string;
    conversazioneMotore?: string;
    trace: TraceGenerazione;
  }): Promise<void>;

  /** Salva la trace di una generazione non riuscita (errore o interruzione). */
  abstract salvaTrace(dati: { utente: string; conversazione?: string; trace: TraceGenerazione }): Promise<void>;
}
