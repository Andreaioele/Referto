import { Module } from '@nestjs/common';
import { config } from '../config';
import { StruttureController } from './strutture.controller';
import { FILE_STRUTTURE, StruttureService } from './strutture.service';

@Module({
  controllers: [StruttureController],
  providers: [{ provide: FILE_STRUTTURE, useValue: config.strutture }, StruttureService],
})
export class StruttureModule {}
