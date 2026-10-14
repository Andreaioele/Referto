import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sessione, SessioneSchema, Utente, UtenteSchema } from './schemi';
import { SessioniController } from './sessioni.controller';
import { SessioniService } from './sessioni.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Utente.name, schema: UtenteSchema },
      { name: Sessione.name, schema: SessioneSchema },
    ]),
  ],
  controllers: [SessioniController],
  providers: [SessioniService],
  exports: [SessioniService],
})
export class SessioniModule {}
