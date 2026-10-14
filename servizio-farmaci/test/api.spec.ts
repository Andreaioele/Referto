import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';

describe('API', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configuraApp(modulo.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    config.chiaveApi = '';
  });

  it('POST /farmaci/cerca collega i nomi del referto al prontuario', async () => {
    const risposta = await request(app.getHttpServer())
      .post('/farmaci/cerca')
      .send({ farmaci: [{ nome: 'Cardioaspirin 100 mg' }, { nome: 'Zentrolax' }], limite_alternative: 0 })
      .expect(200);
    const [cardioaspirin, inesistente] = risposta.body.risultati;
    expect(cardioaspirin).toMatchObject({ trovato: true, corrispondenza: 'nome commerciale', alternative: [] });
    expect(cardioaspirin.farmaco.nome).toBe('CARDIOASPIRIN');
    expect(inesistente).toEqual({ nome: 'Zentrolax', trovato: false });
    expect(risposta.body.fonte.aggiornato).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rifiuta richieste non valide o con campi in più (per esempio il testo del referto)', async () => {
    await request(app.getHttpServer()).post('/farmaci/cerca').send({ farmaci: [] }).expect(400);
    await request(app.getHttpServer()).post('/farmaci/cerca').send({ farmaci: [{ nome: '' }] }).expect(400);
    await request(app.getHttpServer())
      .post('/farmaci/cerca')
      .send({ farmaci: [{ nome: 'Triatec' }], referto: 'testo del referto' })
      .expect(400);
  });

  it('GET /farmaci/:cod restituisce un farmaco o 404', async () => {
    const risposta = await request(app.getHttpServer()).get('/farmaci/024840').expect(200);
    expect(risposta.body.nome).toBe('CARDIOASPIRIN');
    await request(app.getHttpServer()).get('/farmaci/000000').expect(404);
  });

  it('con CHIAVE_API impostata chiede la chiave, tranne per /salute', async () => {
    config.chiaveApi = 'segreto-di-prova';
    const corpo = { farmaci: [{ nome: 'Triatec' }] };
    await request(app.getHttpServer()).post('/farmaci/cerca').send(corpo).expect(401);
    await request(app.getHttpServer()).post('/farmaci/cerca').set('x-api-key', 'sbagliata').send(corpo).expect(401);
    await request(app.getHttpServer())
      .post('/farmaci/cerca')
      .set('x-api-key', 'segreto-di-prova')
      .send(corpo)
      .expect(200);
    await request(app.getHttpServer()).get('/salute').expect(200);
  });

  it('pubblica la documentazione OpenAPI per gli agenti', async () => {
    const risposta = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(Object.keys(risposta.body.paths)).toEqual(
      expect.arrayContaining(['/farmaci/cerca', '/farmaci/{cod}', '/salute']),
    );
  });
});
