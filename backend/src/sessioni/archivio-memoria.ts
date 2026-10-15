import { NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ArchivioSessioni, SessioneSalvata, TurnoSalvato, UtenteSalvato } from './archivio-sessioni';

/**
 * Archivio in memoria, per i test: stesse regole di ArchivioMongo (id di 24
 * caratteri esadecimali, sessioni dalla più recente), niente database.
 */
export class ArchivioInMemoria implements ArchivioSessioni {
  private readonly utenti = new Map<string, UtenteSalvato>();
  private readonly sessioni = new Map<string, SessioneSalvata>();
  private orologio = 0;

  async creaUtente(nickname: string): Promise<UtenteSalvato> {
    const utente = { id: nuovoId(), nickname };
    this.utenti.set(utente.id, utente);
    return { ...utente };
  }

  async trovaUtente(id: string): Promise<UtenteSalvato | null> {
    const utente = this.utenti.get(id);
    return utente ? { ...utente } : null;
  }

  async creaSessione(utenteId: string, titolo: string): Promise<SessioneSalvata> {
    const adesso = this.adesso();
    const sessione = { id: nuovoId(), utenteId, titolo, creata: adesso, aggiornata: adesso, turni: [] };
    this.sessioni.set(sessione.id, sessione);
    return copia(sessione);
  }

  async sessioniDi(utenteId: string): Promise<SessioneSalvata[]> {
    return [...this.sessioni.values()]
      .filter((sessione) => sessione.utenteId === utenteId)
      .sort((a, b) => b.aggiornata.getTime() - a.aggiornata.getTime())
      .map(copia);
  }

  async trovaSessione(id: string): Promise<SessioneSalvata | null> {
    const sessione = this.sessioni.get(id);
    return sessione ? copia(sessione) : null;
  }

  async aggiungiTurno(sessioneId: string, turno: TurnoSalvato, titolo?: string): Promise<SessioneSalvata> {
    const sessione = this.sessioni.get(sessioneId);
    if (!sessione) throw new NotFoundException('Sessione non trovata');
    sessione.turni.push({ ...turno });
    if (titolo !== undefined) sessione.titolo = titolo;
    sessione.aggiornata = this.adesso();
    return copia(sessione);
  }

  async eliminaSessione(id: string): Promise<void> {
    this.sessioni.delete(id);
  }

  /** Date sempre crescenti, così l'ordine "dalla più recente" non dipende dal millisecondo. */
  private adesso(): Date {
    this.orologio = Math.max(this.orologio + 1, Date.now());
    return new Date(this.orologio);
  }
}

function nuovoId(): string {
  return randomBytes(12).toString('hex');
}

function copia(sessione: SessioneSalvata): SessioneSalvata {
  return { ...sessione, turni: sessione.turni.map((turno) => ({ ...turno })) };
}
