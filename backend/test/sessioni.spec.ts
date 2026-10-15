import { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { Model } from 'mongoose';
import os from 'node:os';
import request from 'supertest';
import { App } from 'supertest/types';
import { ChatModule } from '../src/chat/chat.module';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';
import { Utente, UtenteDocument } from '../src/sessioni/schemi';
import { SessioniModule } from '../src/sessioni/sessioni.module';
import { ChiaveApiGuard } from '../src/sicurezza/chiave-api.guard';

/** Risposta in streaming come quella di /chat/completions. */
function streaming(...testi: string[]): Response {
  const encoder = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const testo of testi) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: testo } }] })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(corpo, { status: 200 });
}

function eventi(testo: string): Array<Record<string, unknown>> {
  return testo
    .split('\n')
    .filter((riga) => riga.startsWith('data: '))
    .map((riga) => JSON.parse(riga.slice(6)));
}

const REFERTO = 'ECG: ritmo sinusale, frequenza 72 bpm, asse normale.';
const SPIEGAZIONE = 'ARGOMENTO: Elettrocardiogramma · Cardiologia\nSINTESI\nIl cuore batte con un ritmo regolare.';

describe('Chat con MongoDB: cache delle spiegazioni, conversazioni e trace', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication<App>;
  let utenti: Model<UtenteDocument>;
  let corpi: Array<{ messages: Array<{ role: string; content: string }> }>;
  const fetchOriginale = global.fetch;
  const originali = { motore: config.motoreChat, modello: { ...config.modello }, chiave: config.chiaveApi };

  const chat = (corpo: Record<string, unknown>, utente?: string) => {
    const richiesta = request(app.getHttpServer()).post('/api/chat');
    if (utente) richiesta.set('X-Utente-Id', utente);
    return richiesta.send(corpo).expect(200);
  };

  function rispondi(...risposte: Response[]) {
    global.fetch = jest.fn(async (_url: string, opzioni: RequestInit) => {
      corpi.push(JSON.parse(String(opzioni.body)));
      return risposte.shift() as Response;
    }) as unknown as typeof fetch;
  }

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    config.motoreChat = 'diretto';
    Object.assign(config.modello, { apiKey: 'chiave-di-prova', nome: 'DeepSeek-V4.1-Flash', riserva: 'DeepSeek-V4-Flash' });
    const modulo = await Test.createTestingModule({
      imports: [
        // Il driver 7 carica "os" con import() dinamico, che jest non supporta senza --experimental-vm-modules.
        MongooseModule.forRoot(mongo.getUri(), { dbName: 'Referto', runtimeAdapters: { os } }),
        SessioniModule,
        ChatModule,
      ],
      providers: [
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) => new ChiaveApiGuard(reflector, () => config.chiaveApi),
          inject: [Reflector],
        },
      ],
    }).compile();
    app = configuraApp(modulo.createNestApplication());
    await app.init();
    utenti = modulo.get(getModelToken(Utente.name));
  }, 120_000);

  beforeEach(() => {
    corpi = [];
  });

  afterEach(() => {
    global.fetch = fetchOriginale;
    config.chiaveApi = '';
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
    config.motoreChat = originali.motore;
    Object.assign(config.modello, originali.modello);
    config.chiaveApi = originali.chiave;
  });

  it('salva la spiegazione e la restituisce dalla cache se lo stesso referto torna', async () => {
    rispondi(streaming('ARGOMENTO: Elettrocardiogramma · Cardiologia\n', 'SINTESI\nIl cuore batte con un ritmo regolare.'));
    const prima = eventi((await chat({ messaggio: REFERTO })).text);
    const finePrima = prima.at(-1) as { tipo: string; conversazione: string; da_cache: boolean };
    expect(finePrima).toMatchObject({ tipo: 'fine', da_cache: false });
    expect(finePrima.conversazione).toMatch(/^[0-9a-f]{24}$/);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Stesso referto con spazi e a capo diversi: nessuna chiamata al modello.
    global.fetch = jest.fn() as unknown as typeof fetch;
    const seconda = eventi((await chat({ messaggio: `  ${REFERTO.replace(/ /g, '\n')}  ` })).text);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(seconda[0]).toEqual({ tipo: 'testo', testo: SPIEGAZIONE });
    const fineSeconda = seconda.at(-1) as { conversazione: string };
    expect(seconda.at(-1)).toMatchObject({ tipo: 'fine', da_cache: true });
    expect(fineSeconda.conversazione).not.toBe(finePrima.conversazione);

    const lista = await request(app.getHttpServer()).get('/api/sessioni/conversazioni').expect(200);
    expect(lista.body.slice(0, 2)).toEqual([
      expect.objectContaining({ id: fineSeconda.conversazione, titolo: 'Elettrocardiogramma', area: 'Cardiologia', da_cache: true }),
      expect.objectContaining({ id: finePrima.conversazione, da_cache: false, domande: 0 }),
    ]);
  });

  it('risponde alle domande con la spiegazione salvata, senza rispiegare il referto', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const conversazione = (eventi((await chat({ messaggio: REFERTO })).text).at(-1) as { conversazione: string }).conversazione;

    rispondi(streaming('Vuol dire che il cuore batte regolare.'));
    const risposta = eventi((await chat({ messaggio: 'Cosa vuol dire ritmo sinusale?', conversazione })).text);
    expect(risposta.at(-1)).toEqual({ tipo: 'fine', conversazione });
    const messaggi = corpi[0].messages.map(({ role, content }) => ({ role, content }));
    expect(messaggi.slice(1)).toEqual([
      { role: 'user', content: REFERTO },
      { role: 'assistant', content: SPIEGAZIONE },
      { role: 'user', content: 'Cosa vuol dire ritmo sinusale?' },
    ]);

    // La seconda domanda porta anche la prima, letta dal database (nessuna memoria nel processo).
    rispondi(streaming('No, non lo dice.'));
    await chat({ messaggio: 'Il referto parla di farmaci?', conversazione });
    expect(corpi.at(-1)?.messages.slice(1).map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);

    const dettaglio = await request(app.getHttpServer()).get(`/api/sessioni/conversazioni/${conversazione}`).expect(200);
    expect(dettaglio.body).toMatchObject({
      referto: REFERTO,
      spiegazione: { testo: SPIEGAZIONE, da_cache: true },
      turni: [
        { messaggio: 'Cosa vuol dire ritmo sinusale?', risposta: 'Vuol dire che il cuore batte regolare.' },
        { messaggio: 'Il referto parla di farmaci?', risposta: 'No, non lo dice.' },
      ],
    });

    const trace = await request(app.getHttpServer()).get(`/api/sessioni/conversazioni/${conversazione}/trace`).expect(200);
    expect(trace.body).toEqual([
      expect.objectContaining({ tipo: 'spiegazione', esito: 'ok', da_cache: true, giri: 0, lunghezza_risposta: SPIEGAZIONE.length }),
      expect.objectContaining({ tipo: 'domanda', esito: 'ok', da_cache: false, motore: 'diretto', modello: 'DeepSeek-V4.1-Flash', giri: 1 }),
      expect.objectContaining({ tipo: 'domanda', esito: 'ok', modelli_provati: ['DeepSeek-V4.1-Flash'] }),
    ]);
    expect(trace.body[1].durata_ms).toEqual(expect.any(Number));
    expect(trace.body[1]).not.toHaveProperty('utente');
  });

  it('registra la trace di una spiegazione non riuscita e non la mette in cache', async () => {
    // Anche con CHIAVE_API impostata la chat resta aperta al browser.
    config.chiaveApi = 'segreto-di-prova';
    const referto = 'RX torace: non si osservano addensamenti.';
    rispondi(new Response('{}', { status: 500 }));
    expect(eventi((await chat({ messaggio: referto })).text).at(-1)).toMatchObject({ tipo: 'errore' });

    rispondi(streaming('ARGOMENTO: Radiografia del torace · Pneumologia\n'));
    const fine = eventi((await chat({ messaggio: referto })).text).at(-1);
    expect(fine).toMatchObject({ tipo: 'fine', da_cache: false });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('crea e ritrova gli utenti (login fake, aperto al browser)', async () => {
    config.chiaveApi = 'segreto-di-prova';
    const creato = await request(app.getHttpServer()).post('/api/sessioni/utenti').send({ nickname: 'Test Referto' }).expect(201);
    expect(creato.body).toEqual({ id: expect.stringMatching(/^[0-9a-f]{24}$/), nickname: 'Test Referto' });
    const trovato = await request(app.getHttpServer()).get(`/api/sessioni/utenti/${creato.body.id}`).expect(200);
    expect(trovato.body).toEqual(creato.body);
    await request(app.getHttpServer()).get('/api/sessioni/utenti/000000000000000000000000').expect(404);
    await request(app.getHttpServer()).get('/api/sessioni/utenti/non-valido').expect(404);
    await request(app.getHttpServer()).post('/api/sessioni/utenti').send({ nickname: 'A' }).expect(400);
  });

  it('tiene separati gli utenti: cache e conversazioni non si condividono', async () => {
    const altro = (await utenti.create({ nickname: 'Mario' }))._id.toString();
    rispondi(streaming(SPIEGAZIONE));
    const fine = eventi((await chat({ messaggio: REFERTO }, altro)).text).at(-1) as { conversazione: string; da_cache: boolean };
    expect(fine.da_cache).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // L'utente predefinito non vede né continua la conversazione di Mario.
    await request(app.getHttpServer()).get(`/api/sessioni/conversazioni/${fine.conversazione}`).expect(404);
    expect(eventi((await chat({ messaggio: 'E poi?', conversazione: fine.conversazione })).text)).toEqual([
      { tipo: 'errore', messaggio: 'Questa conversazione non è più disponibile. Riapri il referto per ricominciare.' },
    ]);

    const utente = await request(app.getHttpServer()).get('/api/sessioni/utente').set('X-Utente-Id', altro).expect(200);
    expect(utente.body).toEqual({ id: altro, nickname: 'Mario' });
    const lista = await request(app.getHttpServer()).get('/api/sessioni/conversazioni').set('X-Utente-Id', altro).expect(200);
    expect(lista.body.map((c: { id: string }) => c.id)).toEqual([fine.conversazione]);
  });

  it('rinomina ed elimina una conversazione con le sue trace', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const conversazione = (eventi((await chat({ messaggio: REFERTO })).text).at(-1) as { conversazione: string }).conversazione;
    const rinominata = await request(app.getHttpServer())
      .patch(`/api/sessioni/conversazioni/${conversazione}`)
      .send({ titolo: 'ECG di marzo' })
      .expect(200);
    expect(rinominata.body.titolo).toBe('ECG di marzo');

    await request(app.getHttpServer()).delete(`/api/sessioni/conversazioni/${conversazione}`).expect(200);
    await request(app.getHttpServer()).get(`/api/sessioni/conversazioni/${conversazione}`).expect(404);
    await request(app.getHttpServer()).get(`/api/sessioni/conversazioni/${conversazione}/trace`).expect(404);
  });

  it('chiede la chiave API per lo storico', async () => {
    config.chiaveApi = 'segreto-di-prova';
    await request(app.getHttpServer()).get('/api/sessioni/conversazioni').expect(401);
    await request(app.getHttpServer()).get('/api/sessioni/conversazioni').set('x-api-key', 'segreto-di-prova').expect(200);
  });
});

describe('Senza MONGODB_URI', () => {
  it('il backend non espone le rotte /api/sessioni e la chat non salva nulla', async () => {
    if (config.mongoUri) return;
    const { AppModule } = await import('../src/app.module');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = configuraApp(modulo.createNestApplication());
    await app.init();
    await request(app.getHttpServer()).post('/api/sessioni/utenti').send({ nickname: 'Test Referto' }).expect(404);
    await app.close();
  });
});
