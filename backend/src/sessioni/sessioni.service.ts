import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ARCHIVIO_SESSIONI, type ArchivioSessioni, type SessioneSalvata, type UtenteSalvato } from './archivio-sessioni';

/** Lunghezza massima del titolo preso dalla prima domanda. */
const LUNGHEZZA_TITOLO = 100;

/**
 * Regole dello storico: ogni sessione appartiene a un utente e si legge solo
 * con il suo id; una sessione senza titolo prende la prima domanda. Il
 * salvataggio è dell'archivio (`ARCHIVIO_SESSIONI`).
 */
@Injectable()
export class SessioniService {
  constructor(@Inject(ARCHIVIO_SESSIONI) private readonly archivio: ArchivioSessioni) {}

  /* ── Utenti ── */

  creaUtente(nickname: string): Promise<UtenteSalvato> {
    return this.archivio.creaUtente(nickname);
  }

  async trovaUtente(id: string): Promise<UtenteSalvato> {
    const utente = await this.archivio.trovaUtente(id);
    if (!utente) throw new NotFoundException('Utente non trovato');
    return utente;
  }

  /* ── Sessioni ── */

  async creaSessione(utenteId: string, titolo?: string): Promise<SessioneSalvata> {
    await this.trovaUtente(utenteId);
    return this.archivio.creaSessione(utenteId, titolo ?? '');
  }

  async listaSessioni(utenteId: string): Promise<SessioneSalvata[]> {
    await this.trovaUtente(utenteId);
    return this.archivio.sessioniDi(utenteId);
  }

  dettaglioSessione(utenteId: string, sessioneId: string): Promise<SessioneSalvata> {
    return this.sessioneDiUtente(utenteId, sessioneId);
  }

  async eliminaSessione(utenteId: string, sessioneId: string): Promise<void> {
    await this.sessioneDiUtente(utenteId, sessioneId);
    await this.archivio.eliminaSessione(sessioneId);
  }

  /* ── Turni ── */

  async salvaTurno(
    utenteId: string,
    sessioneId: string,
    turno: { messaggio: string; risposta: string; conversazione_evolus?: string; metadati?: Record<string, unknown> },
  ): Promise<SessioneSalvata> {
    const sessione = await this.sessioneDiUtente(utenteId, sessioneId);
    const titolo = !sessione.titolo && turno.messaggio ? turno.messaggio.slice(0, LUNGHEZZA_TITOLO) : undefined;
    return this.archivio.aggiungiTurno(sessioneId, { ...turno, timestamp: new Date() }, titolo);
  }

  /* ── Helper ── */

  /** La sessione, solo se esiste ed è dell'utente: altrimenti 404 (non si dice se esiste per un altro). */
  private async sessioneDiUtente(utenteId: string, sessioneId: string): Promise<SessioneSalvata> {
    await this.trovaUtente(utenteId);
    const sessione = await this.archivio.trovaSessione(sessioneId);
    if (!sessione || sessione.utenteId !== utenteId) throw new NotFoundException('Sessione non trovata');
    return sessione;
  }
}
