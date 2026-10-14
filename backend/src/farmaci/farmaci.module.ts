import { Module } from '@nestjs/common';
import { config } from '../config';
import { FarmaciController } from './farmaci.controller';
import { PERCORSI_DATI, ProntuarioService } from './prontuario.service';

@Module({
  controllers: [FarmaciController],
  providers: [
    { provide: PERCORSI_DATI, useValue: { prontuario: config.prontuario, normalizzazione: config.normalizzazione, atc: config.atc } },
    ProntuarioService,
  ],
  exports: [ProntuarioService],
})
export class FarmaciModule {}
