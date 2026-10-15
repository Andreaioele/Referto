import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { messaggioConStoria, righeDati } from '../src/chat/evolus.client';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';

/** Flusso SSE come lo manda Evolus, spezzato in pezzi arbitrari. */
function flusso(...pezzi: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const pezzo of pezzi) controller.enqueue(encoder.encode(pezzo));
      controller.close();
    },
  });
}

/** Eventi "data:" della risposta del backend. */
function eventi(testo: string): unknown[] {
  return testo
    .split('\n')
    .filter((riga) => riga.startsWith('data: '))
    .map((riga) => JSON.parse(riga.slice(6)));
}

describe('righeDati', () => {
  it('ricompone le righe spezzate e salta i commenti', async () => {
    const righe: string[] = [];
    for await (const riga of righeDati(flusso(': keep-alive\n\nda', 'ta: {"content":"Ci', 'ao"}\n\ndata: {"isComplete":true}'))) {
      righe.push(riga);
    }
    expect(righe).toEqual(['{"content":"Ciao"}', '{"isComplete":true}']);
  });
});

describe('messaggioConStoria', () => {
  it('mette referto, spiegazione e domande precedenti prima della domanda', () => {
    const testo = messaggioConStoria(
      [
        { domanda: 'RX torace', risposta: 'SINTESI\nNiente di rilevante.' },
        { domanda: 'Cosa vuol dire?', risposta: 'Che è normale.' },
      ],
      'E il cuore?',
    );
    expect(testo).toContain('non spiegarlo di nuovo');
    expect(testo.indexOf('REFERTO:\nRX torace')).toBeLessThan(testo.indexOf('SPIEGAZIONE GIÀ DATA:\nSINTESI'));
    expect(testo).toContain('DOMANDA PRECEDENTE:\nCosa vuol dire?\n\nRISPOSTA DATA:\nChe è normale.');
    expect(testo.endsWith('DOMANDA:\nE il cuore?')).toBe(true);
  });
});

describe('POST /api/chat', () => {
  let app: INestApplication<App>;
  const fetchOriginale = global.fetch;
  const evolusOriginale = { ...config.evolus };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configuraApp(modulo.createNestApplication());
    await app.init();
  });

  beforeEach(() => {
    Object.assign(config.evolus, { apiKey: 'chiave-di-prova', applicationId: 'app-di-prova' });
  });

  afterEach(() => {
    global.fetch = fetchOriginale;
    Object.assign(config.evolus, evolusOriginale);
    config.chiaveApi = '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('inoltra il messaggio al Mother agent e ritrasmette la risposta in streaming', async () => {
    const chiamate: Array<[string, RequestInit]> = [];
    global.fetch = jest.fn(async (url: string, opzioni: RequestInit) => {
      chiamate.push([url, opzioni]);
      return new Response(
        flusso(
          ': keep-alive\n\n',
          'data: {"content":"SINTESI\\n"}\n\n',
          'data: {"content":"Il referto descrive…"}\n\n',
          'data: {"isComplete":true,"conversationId":"7aadfbcc-9213-44b0-8f9a-775c1bfc4e3b"}\n\n',
        ),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }) as unknown as typeof fetch;
    // Anche con CHIAVE_API impostata la chat resta aperta al browser.
    config.chiaveApi = 'segreto-di-prova';

    const risposta = await request(app.getHttpServer())
      .post('/api/chat')
      .send({ messaggio: 'RX TORACE. Paziente in terapia con Cardioaspirin.' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    expect(eventi(risposta.text)).toEqual([
      { tipo: 'testo', testo: 'SINTESI\n' },
      { tipo: 'testo', testo: 'Il referto descrive…' },
      { tipo: 'fine', conversazione: '7aadfbcc-9213-44b0-8f9a-775c1bfc4e3b' },
    ]);
    const [url, opzioni] = chiamate[0];
    expect(url).toBe(`${config.evolus.apiBase}/agents/${config.evolus.agentId}/ask-stream`);
    expect(JSON.parse(opzioni.body as string)).toEqual({ content: 'RX TORACE. Paziente in terapia con Cardioaspirin.' });
    expect((opzioni.headers as Record<string, string>)['X-ApiKey']).toBe('chiave-di-prova');
  });

  it('continua la conversazione indicata', async () => {
    const corpi: unknown[] = [];
    global.fetch = jest.fn(async (_url: string, opzioni: RequestInit) => {
      corpi.push(JSON.parse(opzioni.body as string));
      return new Response(flusso('data: {"content":"Sì."}\n\ndata: {"isComplete":true}\n\n'), { status: 200 });
    }) as unknown as typeof fetch;
    const conversazione = '7aadfbcc-9213-44b0-8f9a-775c1bfc4e3b';
    const risposta = await request(app.getHttpServer())
      .post('/api/chat')
      .send({ messaggio: 'E il nodulo?', conversazione })
      .expect(200);
    expect(corpi[0]).toEqual({ content: 'E il nodulo?', conversationId: conversazione });
    expect(eventi(risposta.text).at(-1)).toEqual({ tipo: 'fine', conversazione });
  });

  it('traduce in un messaggio chiaro i limiti di Evolus e la fine senza risposta', async () => {
    global.fetch = jest.fn(async () => new Response('{"errorCode":"own_models.rate_limited"}', { status: 422 })) as unknown as typeof fetch;
    let risposta = await request(app.getHttpServer()).post('/api/chat').send({ messaggio: 'Ciao' }).expect(200);
    expect(eventi(risposta.text)).toEqual([
      { tipo: 'errore', messaggio: 'Il servizio di spiegazione è sovraccarico. Riprova tra qualche minuto.' },
    ]);

    global.fetch = jest.fn(async () => new Response(flusso('data: {"isComplete":true,"error":"common.unexpected"}\n\n'), { status: 200 })) as unknown as typeof fetch;
    risposta = await request(app.getHttpServer()).post('/api/chat').send({ messaggio: 'Ciao' }).expect(200);
    expect(eventi(risposta.text)).toEqual([
      { tipo: 'errore', messaggio: 'Il servizio di spiegazione non ha risposto. Riprova tra qualche minuto.' },
    ]);
  });

  it('rifiuta messaggi vuoti, troppo lunghi o con campi in più', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await request(app.getHttpServer()).post('/api/chat').send({ messaggio: '' }).expect(400);
    await request(app.getHttpServer()).post('/api/chat').send({ messaggio: 'x'.repeat(30001) }).expect(400);
    await request(app.getHttpServer()).post('/api/chat').send({ messaggio: 'Ciao', conversazione: 'non-un-uuid' }).expect(400);
    await request(app.getHttpServer()).post('/api/chat').send({ messaggio: 'Ciao', altro: 1 }).expect(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('risponde 503 se le credenziali di Evolus non sono configurate', async () => {
    Object.assign(config.evolus, { apiKey: '' });
    await request(app.getHttpServer()).post('/api/chat').send({ messaggio: 'Ciao' }).expect(503);
  });

  it('limita i messaggi per indirizzo IP', async () => {
    global.fetch = jest.fn(async () => new Response(flusso('data: {"isComplete":true}\n\n'), { status: 200 })) as unknown as typeof fetch;
    const invia = () =>
      request(app.getHttpServer()).post('/api/chat').set('x-real-ip', '203.0.113.7').send({ messaggio: 'Ciao' });
    for (let i = 0; i < 10; i++) await invia().expect(200);
    await invia().expect(429);
    await request(app.getHttpServer()).post('/api/chat').set('x-real-ip', '203.0.113.8').send({ messaggio: 'Ciao' }).expect(200);
  });
});
