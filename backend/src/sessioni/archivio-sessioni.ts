/**
 * Dove si salvano utenti, sessioni e turni. `SessioniService` tiene le regole
 * (la sessione è dell'utente, il titolo viene dalla prima domanda); l'archivio
 * salva e ritrova soltanto. In produzione è MongoDB (`ArchivioMongo`), nei test
 * la memoria (`ArchivioInMemoria`).
 */

export interface UtenteSalvato {
  id: string;
  nickname: string;
}

export interface TurnoSalvato {
  messaggio: string;
  risposta: string;
  timestamp: Date;
  conversazione_evolus?: string;
  metadati?: Record<string, unknown>;
}

export interface SessioneSalvata {
  id: string;
  utenteId: string;
  titolo: string;
  creata: Date;
  aggiornata: Date;
  turni: TurnoSalvato[];
}

export interface ArchivioSessioni {
  creaUtente(nickname: string): Promise<UtenteSalvato>;
  /** null anche per un id che l'archivio non sa leggere. */
  trovaUtente(id: string): Promise<UtenteSalvato | null>;
  creaSessione(utenteId: string, titolo: string): Promise<SessioneSalvata>;
  /** Le sessioni dell'utente, dalla modificata più di recente. */
  sessioniDi(utenteId: string): Promise<SessioneSalvata[]>;
  /** null anche per un id che l'archivio non sa leggere. */
  trovaSessione(id: string): Promise<SessioneSalvata | null>;
  /** Aggiunge il turno e, se indicato, cambia il titolo; restituisce la sessione aggiornata. */
  aggiungiTurno(sessioneId: string, turno: TurnoSalvato, titolo?: string): Promise<SessioneSalvata>;
  eliminaSessione(id: string): Promise<void>;
}

export const ARCHIVIO_SESSIONI = Symbol('ARCHIVIO_SESSIONI');
