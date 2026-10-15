import { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';
import { SessioniModule } from '../src/sessioni/sessioni.module';

/**
 * Le stesse prove per ogni archivio: in memoria sempre, MongoDB solo se c'è
 * MONGODB_URI (allora passano dal backend completo, come in produzione).
 */
const archivi: Array<[string, () => Promise<INestApplication<App>>]> = [
  ['in memoria', () => avvia(SessioniModule.inMemoria())],
];
if (config.mongoUri) archivi.push(['MongoDB', () => avvia(AppModule)]);

async function avvia(modulo: Type | DynamicModule): Promise<INestApplication<App>> {
  const compilato = await Test.createTestingModule({ imports: [modulo] }).compile();
  const app = configuraApp(compilato.createNestApplication()) as INestApplication<App>;
  await app.init();
  return app;
}

describe.each(archivi)('Sessioni (%s)', (_nome, crea) => {
  let app: INestApplication<App>;
  let server: App;
  let utenteId: string;
  let altroUtenteId: string;
  let sessioneId: string;
  const daEliminare: string[] = [];

  beforeAll(async () => {
    app = await crea();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    for (const id of daEliminare) {
      await request(server).delete(`/api/sessioni/${id}`).set('x-utente-id', utenteId);
    }
    await app.close();
  });

  it('crea un utente', async () => {
    const res = await request(server).post('/api/sessioni/utenti').send({ nickname: 'Test Referto' }).expect(201);
    expect(res.body).toEqual({ id: expect.stringMatching(/^[0-9a-f]{24}$/), nickname: 'Test Referto' });
    utenteId = res.body.id;
    altroUtenteId = (await request(server).post('/api/sessioni/utenti').send({ nickname: 'Altra persona' })).body.id;
  });

  it("recupera l'utente creato", async () => {
    const res = await request(server).get(`/api/sessioni/utenti/${utenteId}`).expect(200);
    expect(res.body).toEqual({ id: utenteId, nickname: 'Test Referto' });
  });

  it('risponde 404 per un utente che non esiste o con un id non valido', async () => {
    await request(server).get('/api/sessioni/utenti/000000000000000000000000').expect(404);
    await request(server).get('/api/sessioni/utenti/non-valido').expect(404);
  });

  it('rifiuta un nickname troppo corto', async () => {
    await request(server).post('/api/sessioni/utenti').send({ nickname: 'A' }).expect(400);
  });

  it('crea una sessione di chat', async () => {
    const res = await request(server)
      .post('/api/sessioni')
      .set('x-utente-id', utenteId)
      .send({ titolo: 'Referto di cardiologia' })
      .expect(201);
    expect(res.body).toEqual({ id: expect.any(String), titolo: 'Referto di cardiologia' });
    sessioneId = res.body.id;
    daEliminare.push(sessioneId);
  });

  it('salva un turno nella sessione', async () => {
    const res = await request(server)
      .post(`/api/sessioni/${sessioneId}/turni`)
      .set('x-utente-id', utenteId)
      .send({
        messaggio: 'Spiegami questo referto cardiologico',
        risposta: 'Il referto indica un elettrocardiogramma nella norma.',
        metadati: { branca: 'cardiologia' },
      })
      .expect(201);
    expect(res.body).toEqual({ n_turni: 1 });
  });

  it('recupera la sessione con i turni', async () => {
    const res = await request(server).get(`/api/sessioni/${sessioneId}`).set('x-utente-id', utenteId).expect(200);
    expect(res.body).toMatchObject({ id: sessioneId, titolo: 'Referto di cardiologia', creata: expect.any(String) });
    expect(res.body.turni).toEqual([
      {
        messaggio: 'Spiegami questo referto cardiologico',
        risposta: 'Il referto indica un elettrocardiogramma nella norma.',
        timestamp: expect.any(String),
        metadati: { branca: 'cardiologia' },
      },
    ]);
  });

  it('una sessione senza titolo prende la prima domanda (al massimo 100 caratteri), poi non cambia', async () => {
    const creata = await request(server).post('/api/sessioni').set('x-utente-id', utenteId).send({}).expect(201);
    daEliminare.push(creata.body.id);
    expect(creata.body.titolo).toBe('');
    const domanda = `Cosa vuol dire colesterolo LDL alto? ${'x'.repeat(120)}`;
    for (const messaggio of [domanda, 'Seconda domanda']) {
      await request(server)
        .post(`/api/sessioni/${creata.body.id}/turni`)
        .set('x-utente-id', utenteId)
        .send({ messaggio, risposta: 'Risposta' })
        .expect(201);
    }
    const res = await request(server).get(`/api/sessioni/${creata.body.id}`).set('x-utente-id', utenteId).expect(200);
    expect(res.body.titolo).toBe(domanda.slice(0, 100));
    expect(res.body.turni).toHaveLength(2);
  });

  it("elenca le sessioni dell'utente, dalla modificata più di recente", async () => {
    const res = await request(server).get('/api/sessioni').set('x-utente-id', utenteId).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({
      id: daEliminare[1],
      titolo: expect.stringMatching(/^Cosa vuol dire colesterolo LDL alto\?/),
      creata: expect.any(String),
      n_turni: 2,
      anteprima: 'Risposta',
    });
    expect(res.body[1]).toMatchObject({ id: sessioneId, n_turni: 1, anteprima: expect.stringContaining('elettrocardiogramma') });
  });

  it('non mostra le sessioni agli altri utenti', async () => {
    const res = await request(server).get('/api/sessioni').set('x-utente-id', altroUtenteId).expect(200);
    expect(res.body).toEqual([]);
  });

  it('rifiuta richieste senza X-Utente-Id', async () => {
    await request(server).get('/api/sessioni').expect(401);
    await request(server).post('/api/sessioni').send({}).expect(401);
  });

  it('risponde 404 a un altro utente, sia in lettura sia in scrittura, e per id non validi', async () => {
    await request(server).get(`/api/sessioni/${sessioneId}`).set('x-utente-id', altroUtenteId).expect(404);
    await request(server)
      .post(`/api/sessioni/${sessioneId}/turni`)
      .set('x-utente-id', altroUtenteId)
      .send({ messaggio: 'm', risposta: 'r' })
      .expect(404);
    await request(server).delete(`/api/sessioni/${sessioneId}`).set('x-utente-id', altroUtenteId).expect(404);
    await request(server).get(`/api/sessioni/${sessioneId}`).set('x-utente-id', '000000000000000000000000').expect(404);
    await request(server).get('/api/sessioni/non-valido').set('x-utente-id', utenteId).expect(404);
  });

  it('elimina la sessione', async () => {
    await request(server).delete(`/api/sessioni/${sessioneId}`).set('x-utente-id', utenteId).expect(200, { eliminata: true });
    await request(server).get(`/api/sessioni/${sessioneId}`).set('x-utente-id', utenteId).expect(404);
    daEliminare.splice(daEliminare.indexOf(sessioneId), 1);
  });
});

describe('Sessioni senza MONGODB_URI', () => {
  it('il backend non espone le rotte /api/sessioni', async () => {
    if (config.mongoUri) return;
    const app = await avvia(AppModule);
    await request(app.getHttpServer()).post('/api/sessioni/utenti').send({ nickname: 'Test Referto' }).expect(404);
    await app.close();
  });
});
