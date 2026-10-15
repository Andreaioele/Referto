import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArchivioChat } from '../chat/archivio-chat';
import {
  Conversazione,
  ConversazioneSchema,
  Spiegazione,
  SpiegazioneSchema,
  Trace,
  TraceSchema,
  Utente,
  UtenteSchema,
} from './schemi';
import { SessioniController } from './sessioni.controller';
import { SessioniService } from './sessioni.service';

/**
 * Caricato solo con MONGODB_URI. È globale perché la chat trovi l'ArchivioChat
 * senza importare questo modulo: senza database la chat non salva nulla.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Utente.name, schema: UtenteSchema },
      { name: Conversazione.name, schema: ConversazioneSchema },
      { name: Spiegazione.name, schema: SpiegazioneSchema },
      { name: Trace.name, schema: TraceSchema },
    ]),
  ],
  controllers: [SessioniController],
  providers: [SessioniService, { provide: ArchivioChat, useExisting: SessioniService }],
  exports: [SessioniService, ArchivioChat],
})
export class SessioniModule {}
