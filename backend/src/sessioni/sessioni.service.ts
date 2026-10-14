import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sessione, SessioneDocument, Utente, UtenteDocument } from './schemi';

@Injectable()
export class SessioniService {
  constructor(
    @InjectModel(Utente.name) private readonly utenteModel: Model<UtenteDocument>,
    @InjectModel(Sessione.name) private readonly sessioneModel: Model<SessioneDocument>,
  ) {}

  /* ── Utenti ── */

  async creaUtente(nickname: string): Promise<UtenteDocument> {
    return this.utenteModel.create({ nickname });
  }

  async trovaUtente(id: string): Promise<UtenteDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Utente non trovato');
    const utente = await this.utenteModel.findById(id).exec();
    if (!utente) throw new NotFoundException('Utente non trovato');
    return utente;
  }

  /* ── Sessioni ── */

  async creaSessione(utenteId: string, titolo?: string): Promise<SessioneDocument> {
    await this.trovaUtente(utenteId);
    return this.sessioneModel.create({
      utente: new Types.ObjectId(utenteId),
      titolo: titolo ?? '',
    });
  }

  async listaSessioni(utenteId: string): Promise<SessioneDocument[]> {
    await this.trovaUtente(utenteId);
    return this.sessioneModel
      .find({ utente: new Types.ObjectId(utenteId) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async dettaglioSessione(utenteId: string, sessioneId: string): Promise<SessioneDocument> {
    const sessione = await this.trovaSessioneDiUtente(utenteId, sessioneId);
    return sessione;
  }

  async eliminaSessione(utenteId: string, sessioneId: string): Promise<void> {
    const sessione = await this.trovaSessioneDiUtente(utenteId, sessioneId);
    await sessione.deleteOne();
  }

  /* ── Turni ── */

  async salvaTurno(
    utenteId: string,
    sessioneId: string,
    turno: { messaggio: string; risposta: string; conversazione_evolus?: string; metadati?: Record<string, unknown> },
  ): Promise<SessioneDocument> {
    const sessione = await this.trovaSessioneDiUtente(utenteId, sessioneId);
    sessione.turni.push({ ...turno, timestamp: new Date() });
    if (!sessione.titolo && turno.messaggio) {
      sessione.titolo = turno.messaggio.slice(0, 100);
    }
    return sessione.save();
  }

  /* ── Helper ── */

  private async trovaSessioneDiUtente(utenteId: string, sessioneId: string): Promise<SessioneDocument> {
    await this.trovaUtente(utenteId);
    if (!Types.ObjectId.isValid(sessioneId)) throw new NotFoundException('Sessione non trovata');
    const sessione = await this.sessioneModel.findById(sessioneId).exec();
    if (!sessione || sessione.utente.toString() !== utenteId) {
      throw new NotFoundException('Sessione non trovata');
    }
    return sessione;
  }
}
