import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ArchivioChat, type ContestoConversazione, type TraceGenerazione } from '../chat/archivio-chat';
import {
  Conversazione,
  ConversazioneDocument,
  Spiegazione,
  SpiegazioneDocument,
  Trace,
  TraceDocument,
  Utente,
  UtenteDocument,
} from './schemi';

/** L'utente di chi non si è identificato: per ora tutti (login fake). */
export const NICKNAME_PREDEFINITO = 'paziente';
const ARGOMENTO = /^ARGOMENTO:\s*(.+?)\s*·\s*(.+?)\s*$/m;

/**
 * Archivio della chat su MongoDB: spiegazioni in cache, conversazioni con le
 * domande e trace di ogni generazione, sempre legate a un utente.
 */
@Injectable()
export class SessioniService extends ArchivioChat {
  private utentePredefinito?: Promise<string>;

  constructor(
    @InjectModel(Utente.name) private readonly utenteModel: Model<UtenteDocument>,
    @InjectModel(Conversazione.name) private readonly convModel: Model<ConversazioneDocument>,
    @InjectModel(Spiegazione.name) private readonly spiegazioneModel: Model<SpiegazioneDocument>,
    @InjectModel(Trace.name) private readonly traceModel: Model<TraceDocument>,
  ) {
    super();
  }

  /* ── Utenti ── */

  async utente(richiesto?: string): Promise<string> {
    if (richiesto && Types.ObjectId.isValid(richiesto) && (await this.utenteModel.exists({ _id: richiesto }))) {
      return richiesto;
    }
    return this.predefinito();
  }

  /** Creato alla prima richiesta, non all'avvio: se MongoDB non risponde il resto del backend parte lo stesso. */
  private predefinito(): Promise<string> {
    this.utentePredefinito ??= this.utenteModel
      .findOneAndUpdate(
        { nickname: NICKNAME_PREDEFINITO },
        { $setOnInsert: { nickname: NICKNAME_PREDEFINITO } },
        { upsert: true, returnDocument: 'after' },
      )
      .exec()
      .then((utente) => utente._id.toString())
      .catch((errore: unknown) => {
        this.utentePredefinito = undefined;
        throw errore;
      });
    return this.utentePredefinito;
  }

  async nickname(utente: string): Promise<string> {
    const trovato = await this.utenteModel.findById(utente).exec();
    return trovato?.nickname ?? NICKNAME_PREDEFINITO;
  }

  /* ── ArchivioChat: cache, conversazioni e trace ── */

  async cercaSpiegazione(utente: string, hash: string, versione: string): Promise<{ id: string; testo: string } | null> {
    const trovata = await this.spiegazioneModel
      .findOneAndUpdate(
        { utente: new Types.ObjectId(utente), hash, versione },
        { $inc: { usi: 1 }, $set: { ultimo_uso: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    return trovata ? { id: trovata._id.toString(), testo: trovata.testo } : null;
  }

  async salvaSpiegazione({ utente, hash, versione, testo }: { utente: string; hash: string; versione: string; testo: string }): Promise<string> {
    const filtro = { utente: new Types.ObjectId(utente), hash, versione };
    try {
      const salvata = await this.spiegazioneModel
        .findOneAndUpdate(filtro, { $setOnInsert: { testo } }, { upsert: true, returnDocument: 'after' })
        .exec();
      return salvata._id.toString();
    } catch (errore) {
      // Due spiegazioni dello stesso referto finite insieme: vale quella salvata per prima.
      if ((errore as { code?: number }).code !== 11000) throw errore;
      const esistente = await this.spiegazioneModel.findOne(filtro).orFail().exec();
      return esistente._id.toString();
    }
  }

  async nuovaConversazione(dati: {
    utente: string;
    referto: string;
    hash: string;
    spiegazione: { id: string; testo: string };
    conversazioneMotore?: string;
    trace: TraceGenerazione;
  }): Promise<string> {
    const utente = new Types.ObjectId(dati.utente);
    const conversazione = new Types.ObjectId();
    const trace = await this.traceModel.create({ ...dati.trace, utente, conversazione });
    const argomento = ARGOMENTO.exec(dati.spiegazione.testo);
    await this.convModel.create({
      _id: conversazione,
      utente,
      titolo: argomento?.[1] ?? '',
      area: argomento?.[2],
      referto: { testo: dati.referto, hash: dati.hash },
      spiegazione: {
        testo: dati.spiegazione.testo,
        cache: new Types.ObjectId(dati.spiegazione.id),
        da_cache: dati.trace.da_cache,
        trace: trace._id,
      },
      conversazione_motore: dati.conversazioneMotore,
    });
    return conversazione.toString();
  }

  async contesto(utente: string, conversazione: string): Promise<ContestoConversazione | null> {
    const conv = await this.trovaDiUtente(utente, conversazione);
    if (!conv) return null;
    return {
      storia: [
        { domanda: conv.referto.testo, risposta: conv.spiegazione.testo },
        ...conv.turni.map((turno) => ({ domanda: turno.messaggio, risposta: turno.risposta })),
      ],
      conversazioneMotore: conv.conversazione_motore,
    };
  }

  async aggiungiTurno(dati: {
    utente: string;
    conversazione: string;
    messaggio: string;
    risposta: string;
    conversazioneMotore?: string;
    trace: TraceGenerazione;
  }): Promise<void> {
    const utente = new Types.ObjectId(dati.utente);
    const conversazione = new Types.ObjectId(dati.conversazione);
    const trace = await this.traceModel.create({ ...dati.trace, utente, conversazione });
    await this.convModel
      .updateOne(
        { _id: conversazione, utente },
        {
          $push: { turni: { messaggio: dati.messaggio, risposta: dati.risposta, trace: trace._id } },
          ...(dati.conversazioneMotore ? { $set: { conversazione_motore: dati.conversazioneMotore } } : {}),
        },
      )
      .exec();
  }

  async salvaTrace({ utente, conversazione, trace }: { utente: string; conversazione?: string; trace: TraceGenerazione }): Promise<void> {
    await this.traceModel.create({
      ...trace,
      utente: new Types.ObjectId(utente),
      ...(conversazione ? { conversazione: new Types.ObjectId(conversazione) } : {}),
    });
  }

  /* ── Storico (rotte /api/sessioni) ── */

  async listaConversazioni(utente: string): Promise<ConversazioneDocument[]> {
    return this.convModel
      .find({ utente: new Types.ObjectId(utente) })
      .select('-referto.testo -spiegazione.testo -turni.messaggio -turni.risposta')
      .sort({ updatedAt: -1 })
      .exec();
  }

  async dettaglioConversazione(utente: string, id: string): Promise<ConversazioneDocument> {
    return this.trovaOErrore(utente, id);
  }

  async traceConversazione(utente: string, id: string): Promise<Array<Trace & { _id: Types.ObjectId; createdAt: Date }>> {
    const conv = await this.trovaOErrore(utente, id);
    return this.traceModel
      .find({ conversazione: conv._id })
      .select('-__v')
      .sort({ createdAt: 1 })
      .lean<Array<Trace & { _id: Types.ObjectId; createdAt: Date }>>()
      .exec();
  }

  async rinominaConversazione(utente: string, id: string, titolo: string): Promise<ConversazioneDocument> {
    const conv = await this.trovaOErrore(utente, id);
    conv.titolo = titolo;
    return conv.save();
  }

  /** Elimina la conversazione e le sue trace; la spiegazione in cache (senza il referto) resta. */
  async eliminaConversazione(utente: string, id: string): Promise<void> {
    const conv = await this.trovaOErrore(utente, id);
    await this.traceModel.deleteMany({ conversazione: conv._id }).exec();
    await conv.deleteOne();
  }

  /* ── Helper ── */

  private async trovaDiUtente(utente: string, id: string): Promise<ConversazioneDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.convModel.findOne({ _id: new Types.ObjectId(id), utente: new Types.ObjectId(utente) }).exec();
  }

  private async trovaOErrore(utente: string, id: string): Promise<ConversazioneDocument> {
    const conv = await this.trovaDiUtente(utente, id);
    if (!conv) throw new NotFoundException('Conversazione non trovata');
    return conv;
  }
}
