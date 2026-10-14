import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { config } from './config';
import { FarmaciModule } from './farmaci/farmaci.module';
import { SaluteController } from './salute/salute.controller';
import { ChiaveApiGuard } from './sicurezza/chiave-api.guard';

@Module({
  imports: [FarmaciModule],
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
