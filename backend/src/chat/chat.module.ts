import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { config } from '../config';
import { FarmaciModule } from '../farmaci/farmaci.module';
import { ChatController } from './chat.controller';
import { EvolusClient } from './evolus.client';
import { MotherDiretto } from './mother-diretto';
import { MotoreChat } from './motore-chat';

@Module({
  // Limite predefinito, ridefinito sulla rotta con @Throttle: 10 messaggi al minuto per IP.
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]), FarmaciModule],
  controllers: [ChatController],
  providers: [
    EvolusClient,
    MotherDiretto,
    // MOTORE_CHAT=diretto usa il Mother agent ricostruito nel backend, altrimenti Evolus.
    {
      provide: MotoreChat,
      useFactory: (evolus: EvolusClient, diretto: MotherDiretto) => (config.motoreChat === 'diretto' ? diretto : evolus),
      inject: [EvolusClient, MotherDiretto],
    },
  ],
  // Lo usa anche il modulo foglietti per le domande sul foglio illustrativo.
  exports: [MotoreChat],
})
export class ChatModule {}
