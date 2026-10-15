import { Module } from '@nestjs/common';
import { config } from '../config';
import { FILE_GLOSSARIO, GlossarioService } from './glossario.service';
import { TerminologiaController } from './terminologia.controller';

@Module({
  controllers: [TerminologiaController],
  providers: [{ provide: FILE_GLOSSARIO, useValue: config.glossario }, GlossarioService],
  // Lo usa il Mother agent ricostruito nel backend per lo strumento cercaTermine.
  exports: [GlossarioService],
})
export class TerminologiaModule {}
