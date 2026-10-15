import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatModule } from './chat/chat.module';
import { config } from './config';
import { FarmaciModule } from './farmaci/farmaci.module';
import { FogliettiModule } from './foglietti/foglietti.module';
import { SaluteController } from './salute/salute.controller';
import { SessioniModule } from './sessioni/sessioni.module';
import { ChiaveApiGuard } from './sicurezza/chiave-api.guard';

const moduliOpzionali = config.mongoUri
  ? [MongooseModule.forRoot(config.mongoUri, { dbName: 'Referto' }), SessioniModule.conMongo()]
  : [];

@Module({
  imports: [FarmaciModule, ChatModule, FogliettiModule, ...moduliOpzionali],
  controllers: [SaluteController],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new ChiaveApiGuard(reflector, () => config.chiaveApi),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
