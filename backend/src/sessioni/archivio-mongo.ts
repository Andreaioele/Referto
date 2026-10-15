import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ArchivioSessioni, SessioneSalvata, TurnoSalvato, UtenteSalvato } from './archivio-sessioni';
import { Sessione, SessioneDocument, Utente, UtenteDocument } from './schemi';

/** Archivio su MongoDB (database Referto, collezioni `utenti` e `sessioni`). */
@Injectable()
export class ArchivioMongo implements ArchivioSessioni {
  constructor(
    @InjectModel(Utente.name) private readonly utenteModel: Model<UtenteDocument>,
    @InjectModel(Sessione.name) private readonly sessioneModel: Model<SessioneDocument>,
  ) {}

  async creaUtente(nickname: string): Promise<UtenteSalvato> {
    return utente(await this.utenteModel.create({ nickname }));
  }

  async trovaUtente(id: string): Promise<UtenteSalvato | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const trovato = await this.utenteModel.findById(id).exec();
    return trovato ? utente(trovato) : null;
  }

  async creaSessione(utenteId: string, titolo: string): Promise<SessioneSalvata> {
    return sessione(await this.sessioneModel.create({ utente: new Types.ObjectId(utenteId), titolo }));
  }

  async sessioniDi(utenteId: string): Promise<SessioneSalvata[]> {
    const trovate = await this.sessioneModel
      .find({ utente: new Types.ObjectId(utenteId) })
      .sort({ updatedAt: -1 })
      .exec();
    return trovate.map(sessione);
  }

  async trovaSessione(id: string): Promise<SessioneSalvata | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const trovata = await this.sessioneModel.findById(id).exec();
    return trovata ? sessione(trovata) : null;
  }

  async aggiungiTurno(sessioneId: string, turno: TurnoSalvato, titolo?: string): Promise<SessioneSalvata> {
    const documento = await this.sessioneModel.findById(sessioneId).exec();
    if (!documento) throw new NotFoundException('Sessione non trovata');
    documento.turni.push(turno);
    if (titolo !== undefined) documento.titolo = titolo;
    return sessione(await documento.save());
  }

  async eliminaSessione(id: string): Promise<void> {
    await this.sessioneModel.findByIdAndDelete(id).exec();
  }
}

function utente(documento: UtenteDocument): UtenteSalvato {
  return { id: documento._id.toString(), nickname: documento.nickname };
}

function sessione(documento: SessioneDocument): SessioneSalvata {
  return {
    id: documento._id.toString(),
    utenteId: documento.utente.toString(),
    titolo: documento.titolo,
    creata: documento.createdAt,
    aggiornata: documento.updatedAt,
    turni: documento.turni.map(({ messaggio, risposta, timestamp, conversazione_evolus, metadati }) => ({
      messaggio,
      risposta,
      timestamp,
      conversazione_evolus,
      metadati,
    })),
  };
}
