import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/* ── Turno (sotto-documento di Sessione) ── */

@Schema({ _id: false, timestamps: false })
export class Turno {
  @Prop({ required: true })
  messaggio: string;

  @Prop({ required: true })
  risposta: string;

  @Prop({ default: () => new Date() })
  timestamp: Date;

  @Prop()
  conversazione_evolus?: string;

  @Prop({ type: Object })
  metadati?: Record<string, unknown>;
}

export const TurnoSchema = SchemaFactory.createForClass(Turno);

/* ── Utente ── */

@Schema({ timestamps: true, collection: 'utenti' })
export class Utente {
  @Prop({ required: true, minlength: 2, maxlength: 30 })
  nickname: string;
}

export type UtenteDocument = HydratedDocument<Utente>;
export const UtenteSchema = SchemaFactory.createForClass(Utente);

/* ── Sessione ── */

@Schema({ timestamps: true, collection: 'sessioni' })
export class Sessione {
  @Prop({ type: Types.ObjectId, ref: 'Utente', required: true, index: true })
  utente: Types.ObjectId;

  @Prop({ default: '' })
  titolo: string;

  @Prop({ type: [TurnoSchema], default: [] })
  turni: Turno[];
}

export type SessioneDocument = HydratedDocument<Sessione> & { createdAt: Date; updatedAt: Date };
export const SessioneSchema = SchemaFactory.createForClass(Sessione);
