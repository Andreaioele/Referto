import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { FarmaciModule } from '../farmaci/farmaci.module';
import { FogliettiController } from './foglietti.controller';
import { FogliettiService } from './foglietti.service';
import { FONTE_FOGLIETTI } from './fonte-foglietti';
import { FonteAifa } from './fonte-aifa';

@Module({
  imports: [FarmaciModule, ChatModule],
  controllers: [FogliettiController],
  providers: [FogliettiService, { provide: FONTE_FOGLIETTI, useFactory: () => new FonteAifa() }],
})
export class FogliettiModule {}
