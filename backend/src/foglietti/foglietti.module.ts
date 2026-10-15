import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { FarmaciModule } from '../farmaci/farmaci.module';
import { FogliettiController } from './foglietti.controller';
import { FogliettiService } from './foglietti.service';

@Module({
  imports: [FarmaciModule, ChatModule],
  controllers: [FogliettiController],
  providers: [FogliettiService],
})
export class FogliettiModule {}
