import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INTESTAZIONE_CHIAVE } from './sicurezza/chiave-api.guard';

/** Configurazione comune all'avvio e ai test end-to-end. */
export function configuraApp(app: INestApplication): INestApplication {
  // Tutte le rotte sotto /api: il frontend inoltra /api/* al backend (vercel.json del frontend).
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const documento = new DocumentBuilder()
    .setTitle('Referto - servizio farmaci')
    .setDescription(
      'Collega i nomi dei farmaci scritti in un referto al prontuario AIFA, in modo deterministico. ' +
        'Riceve solo nomi di farmaci, mai il testo del referto.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: INTESTAZIONE_CHIAVE }, 'chiave-api')
    .build();
  // /api/docs per leggerla, /api/docs-json per importarla negli strumenti degli agenti (OpenAPI).
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, documento));
  return app;
}
