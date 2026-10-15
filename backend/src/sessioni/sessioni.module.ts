import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArchivioInMemoria } from './archivio-memoria';
import { ArchivioMongo } from './archivio-mongo';
import { ARCHIVIO_SESSIONI } from './archivio-sessioni';
import { Sessione, SessioneSchema, Utente, UtenteSchema } from './schemi';
import { SessioniController } from './sessioni.controller';
import { SessioniService } from './sessioni.service';

/**
 * Storico delle sessioni. `conMongo()` è quello del backend (caricato solo se
 * c'è MONGODB_URI, vedi app.module.ts); `inMemoria()` serve ai test.
 */
@Module({})
export class SessioniModule {
  static conMongo(): DynamicModule {
    return {
      module: SessioniModule,
      imports: [
        MongooseModule.forFeature([
          { name: Utente.name, schema: UtenteSchema },
          { name: Sessione.name, schema: SessioneSchema },
        ]),
      ],
      controllers: [SessioniController],
      providers: [SessioniService, { provide: ARCHIVIO_SESSIONI, useClass: ArchivioMongo }],
      exports: [SessioniService],
    };
  }

  static inMemoria(): DynamicModule {
    return {
      module: SessioniModule,
      controllers: [SessioniController],
      providers: [SessioniService, { provide: ARCHIVIO_SESSIONI, useValue: new ArchivioInMemoria() }],
      exports: [SessioniService],
    };
  }
}
