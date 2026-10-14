import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ChatController } from './chat.controller';
import { EvolusClient } from './evolus.client';

@Module({
  // Limite predefinito, ridefinito sulla rotta con @Throttle: 10 messaggi al minuto per IP.
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
  controllers: [ChatController],
  providers: [EvolusClient],
})
export class ChatModule {}
