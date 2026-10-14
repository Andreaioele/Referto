import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';

const hasMongo = !!config.mongoUri;

(hasMongo ? describe : describe.skip)('Sessioni (MongoDB)', () => {
  let app: INestApplication<App>;
  let utenteId: string;
  let sessioneId: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configuraApp(modulo.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    if (utenteId && sessioneId) {
      await request(app.getHttpServer())
        .delete(`/api/sessioni/${sessioneId}`)
        .set('x-utente-id', utenteId);
    }
    await app.close();
  });

  it('crea un utente', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sessioni/utenti')
      .send({ nickname: 'Test Referto' })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.nickname).toBe('Test Referto');
    utenteId = res.body.id;
  });

  it('recupera l\'utente creato', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/sessioni/utenti/${utenteId}`)
      .expect(200);
    expect(res.body.nickname).toBe('Test Referto');
  });

  it('rifiuta un nickname troppo corto', async () => {
    await request(app.getHttpServer())
      .post('/api/sessioni/utenti')
      .send({ nickname: 'A' })
      .expect(400);
  });

  it('crea una sessione di chat', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sessioni')
      .set('x-utente-id', utenteId)
      .send({ titolo: 'Referto di cardiologia' })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.titolo).toBe('Referto di cardiologia');
    sessioneId = res.body.id;
  });

  it('salva un turno nella sessione', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/sessioni/${sessioneId}/turni`)
      .set('x-utente-id', utenteId)
      .send({
        messaggio: 'Spiegami questo referto cardiologico',
        risposta: 'Il referto indica un elettrocardiogramma nella norma.',
        metadati: { branca: 'cardiologia' },
      })
      .expect(201);
    expect(res.body.n_turni).toBe(1);
  });

  it('recupera la sessione con i turni', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/sessioni/${sessioneId}`)
      .set('x-utente-id', utenteId)
      .expect(200);
    expect(res.body.turni).toHaveLength(1);
    expect(res.body.turni[0].messaggio).toBe('Spiegami questo referto cardiologico');
    expect(res.body.turni[0].risposta).toContain('elettrocardiogramma');
  });

  it('elenca le sessioni dell\'utente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sessioni')
      .set('x-utente-id', utenteId)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const trovata = res.body.find((s: { id: string }) => s.id === sessioneId);
    expect(trovata).toBeDefined();
    expect(trovata.n_turni).toBe(1);
  });

  it('rifiuta richieste senza X-Utente-Id', async () => {
    await request(app.getHttpServer())
      .get('/api/sessioni')
      .expect(401);
  });

  it('rifiuta accesso a sessioni di un altro utente', async () => {
    await request(app.getHttpServer())
      .get(`/api/sessioni/${sessioneId}`)
      .set('x-utente-id', '000000000000000000000000')
      .expect(404);
  });

  it('elimina la sessione', async () => {
    await request(app.getHttpServer())
      .delete(`/api/sessioni/${sessioneId}`)
      .set('x-utente-id', utenteId)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/sessioni/${sessioneId}`)
      .set('x-utente-id', utenteId)
      .expect(404);

    sessioneId = '';
  });
});
