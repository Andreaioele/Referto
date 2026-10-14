import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { configuraApp } from './crea-app';

async function avvia(): Promise<void> {
  const app = configuraApp(await NestFactory.create(AppModule));
  const logger = new Logger('ServizioFarmaci');
  if (!config.chiaveApi) {
    logger.warn('CHIAVE_API non impostata: il servizio risponde senza chiave (solo per lo sviluppo locale).');
  }
  await app.listen(config.porta, '0.0.0.0');
  logger.log(`In ascolto sulla porta ${config.porta}, documentazione su /api/docs`);
}

void avvia();
