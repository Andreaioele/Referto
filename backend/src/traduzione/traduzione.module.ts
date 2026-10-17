import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TraduzioneController } from './traduzione.controller';
import { TraduttoreService } from './traduttore.service';

@Module({
  // Limite per IP, ridefinito sulla rotta con @Throttle.
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
  controllers: [TraduzioneController],
  providers: [TraduttoreService],
})
export class TraduzioneModule {}
