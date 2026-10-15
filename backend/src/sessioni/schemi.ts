import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as SchemaMongoose, Types } from 'mongoose';

/* ── Utente ── */

@Schema({ timestamps: true, collection: 'utenti' })
export class Utente {
  @Prop({ required: true, minlength: 2, maxlength: 30 })
  nickname: string;
}

export type UtenteDocument = HydratedDocument<Utente>;
export const UtenteSchema = SchemaFactory.createForClass(Utente);

/* ── Spiegazione in cache: una per utente, referto (impronta) e versione del motore ── */

@Schema({ timestamps: true, collection: 'spiegazioni' })
export class Spiegazione {
  @Prop({ type: Types.ObjectId, ref: 'Utente', required: true })
  utente: Types.ObjectId;

  /** SHA-256 del testo del referto con gli spazi normalizzati: il referto non si salva qui. */
  @Prop({ required: true })
  hash: string;

  /** Motore, modello e impronta del prompt: se cambiano, la spiegazione si rigenera. */
  @Prop({ required: true })
  versione: string;

  @Prop({ required: true })
  testo: string;

  /** Quante volte è stata restituita dalla cache. */
  @Prop({ default: 0 })
  usi: number;

  @Prop()
  ultimo_uso?: Date;
}

export type SpiegazioneDocument = HydratedDocument<Spiegazione>;
export const SpiegazioneSchema = SchemaFactory.createForClass(Spiegazione);
SpiegazioneSchema.index({ utente: 1, hash: 1, versione: 1 }, { unique: true });

/* ── Trace di una generazione (anche errori, interruzioni e risposte dalla cache) ── */

@Schema({ _id: false })
export class ChiamataToolDoc {
  @Prop({ required: true })
  nome: string;

  @Prop({ type: SchemaMongoose.Types.Mixed })
  parametri?: unknown;

  @Prop({ type: SchemaMongoose.Types.Mixed })
  risposta?: unknown;

  @Prop()
  durata_ms: number;

  @Prop()
  errore?: string;
}

export const ChiamataToolSchema = SchemaFactory.createForClass(ChiamataToolDoc);

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'trace' })
export class Trace {
  @Prop({ type: Types.ObjectId, ref: 'Utente', required: true, index: true })
  utente: Types.ObjectId;

  /** Assente se la spiegazione non è riuscita (nessuna conversazione creata). */
  @Prop({ type: Types.ObjectId, ref: 'Conversazione', index: true })
  conversazione?: Types.ObjectId;

  @Prop({ required: true, enum: ['spiegazione', 'classificazione', 'domanda'] })
  tipo: string;

  @Prop({ required: true, enum: ['ok', 'errore', 'interrotta'] })
  esito: string;

  @Prop({ default: false })
  da_cache: boolean;

  @Prop({ required: true })
  motore: string;

  @Prop()
  versione: string;

  @Prop()
  modello?: string;

  @Prop({ type: [String], default: [] })
  modelli_provati: string[];

  @Prop({ default: 0 })
  giri: number;

  @Prop()
  durata_ms: number;

  @Prop()
  primo_testo_ms?: number;

  @Prop()
  token_input?: number;

  @Prop()
  token_output?: number;

  @Prop({ type: [ChiamataToolSchema], default: [] })
  chiamate_tool: ChiamataToolDoc[];

  /** Esito tecnico (stato HTTP, timeout), mai il contenuto. */
  @Prop()
  errore?: string;

  @Prop()
  lunghezza_messaggio: number;

  @Prop()
  lunghezza_risposta: number;
}

export type TraceDocument = HydratedDocument<Trace> & { createdAt: Date };
export const TraceSchema = SchemaFactory.createForClass(Trace);

/* ── Conversazione: un referto spiegato e le domande successive ── */

@Schema({ _id: false })
export class RefertoDoc {
  @Prop({ required: true })
  testo: string;

  @Prop({ required: true })
  hash: string;
}

export const RefertoSchema = SchemaFactory.createForClass(RefertoDoc);

@Schema({ _id: false })
export class SpiegazioneConversazioneDoc {
  @Prop({ required: true })
  testo: string;

  /** La spiegazione in cache da cui viene (o che ha creato). */
  @Prop({ type: Types.ObjectId, ref: 'Spiegazione' })
  cache?: Types.ObjectId;

  @Prop({ default: false })
  da_cache: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Trace' })
  trace?: Types.ObjectId;
}

export const SpiegazioneConversazioneSchema = SchemaFactory.createForClass(SpiegazioneConversazioneDoc);

@Schema({ timestamps: true })
export class TurnoDoc {
  @Prop({ required: true })
  messaggio: string;

  @Prop({ required: true })
  risposta: string;

  @Prop({ type: Types.ObjectId, ref: 'Trace' })
  trace?: Types.ObjectId;
}

export type TurnoDocument = HydratedDocument<TurnoDoc> & { createdAt: Date };
export const TurnoSchema = SchemaFactory.createForClass(TurnoDoc);

@Schema({ timestamps: true, collection: 'conversazioni' })
export class Conversazione {
  @Prop({ type: Types.ObjectId, ref: 'Utente', required: true, index: true })
  utente: Types.ObjectId;

  /** L'esame della riga ARGOMENTO della spiegazione. */
  @Prop({ default: '' })
  titolo: string;

  /** L'area della riga ARGOMENTO (per esempio Cardiologia). */
  @Prop()
  area?: string;

  @Prop({ type: RefertoSchema, required: true })
  referto: RefertoDoc;

  @Prop({ type: SpiegazioneConversazioneSchema, required: true })
  spiegazione: SpiegazioneConversazioneDoc;

  /** Conversazione del motore da continuare (Evolus); il motore diretto usa la storia salvata. */
  @Prop()
  conversazione_motore?: string;

  /** Le domande successive alla spiegazione, con le risposte. */
  @Prop({ type: [TurnoSchema], default: [] })
  turni: TurnoDocument[];
}

export type ConversazioneDocument = HydratedDocument<Conversazione> & {
  createdAt: Date;
  updatedAt: Date;
};
export const ConversazioneSchema = SchemaFactory.createForClass(Conversazione);
