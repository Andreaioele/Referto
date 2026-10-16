import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';
import { pulisci, TraduttoreService } from '../src/traduzione/traduttore.service';
import { numeri, problemaTraduzione } from '../src/traduzione/verifica';

/** Risposta del modello (non in streaming) con il testo dato. */
function rispostaModello(testo: string, stato = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: testo } }] }), { status: stato });
}

describe('Controllo della traduzione', () => {
  it('confronta i numeri senza separatori', () => {
    expect(numeri('Glicemia 108 mg/dL, intervallo 70 – 99, emoglobina 13,4')).toEqual(['108', '134', '70', '99']);
    expect(numeri('10.000 U.I.')).toEqual(numeri('10,000 IU'));
  });

  it('accetta una traduzione fedele', () => {
    expect(problemaTraduzione('La glicemia è 108 mg/dL, sopra 99.', 'Blood sugar is 108 mg/dL, above 99.')).toBeNull();
  });

  it('scarta un numero cambiato, tolto o aggiunto', () => {
    expect(problemaTraduzione('Il valore è 162 mg/dL.', 'The value is 126 mg/dL.')).toBe('numeri');
    expect(problemaTraduzione('Il valore è 162 mg/dL.', 'The value is high.')).toBe('numeri');
    expect(problemaTraduzione('Il valore è alto.', 'The value is high, above 116.')).toBe('numeri');
  });

  it('scarta una citazione dal referto non copiata identica', () => {
    expect(problemaTraduzione('Il medico scrive «ritmo sinusale».', 'The doctor writes "sinus rhythm".')).toBe('citazioni');
    expect(problemaTraduzione('Il medico scrive «ritmo sinusale».', 'The doctor writes «ritmo sinusale» (sinus rhythm).')).toBeNull();
  });

  it('scarta una traduzione vuota o troppo diversa di lunghezza', () => {
    expect(problemaTraduzione('Tutto nella norma.', '')).toBe('vuota');
    expect(problemaTraduzione('Tutto nella norma, nessun valore fuori intervallo da segnalare.', 'OK')).toBe('lunghezza');
  });

  it('pulisce ragionamento, markup DSML e virgolette intorno', () => {
    expect(pulisci('<think>ragiono</think>\n"Within normal limits."')).toBe('Within normal limits.');
    expect(pulisci('Line one.\n<｜DSML｜function_calls>\nLine two.')).toBe('Line one.\nLine two.');
  });
});

describe('TraduttoreService', () => {
  const fetchOriginale = global.fetch;
  const modelloOriginale = { ...config.modello };
  let traduttore: TraduttoreService;

  beforeEach(() => {
    Object.assign(config.modello, { apiKey: 'chiave-di-prova', nome: 'Primo', riserva: 'Riserva' });
    traduttore = new TraduttoreService();
  });

  afterEach(() => {
    global.fetch = fetchOriginale;
    Object.assign(config.modello, modelloOriginale);
  });

  it('traduce ogni pezzo con il prompt di traduzione e ricorda il risultato', async () => {
    const chiamate: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];
    global.fetch = jest.fn(async (_url: string, opzioni: RequestInit) => {
      const corpo = JSON.parse(String(opzioni.body));
      chiamate.push(corpo);
      return rispostaModello(corpo.messages[1].content === 'Uno.' ? 'One.' : 'Two.');
    }) as unknown as typeof fetch;

    expect(await traduttore.traduci(['Uno.', 'Due.'], 'en')).toEqual([
      { testo: 'One.', tradotto: true },
      { testo: 'Two.', tradotto: true },
    ]);
    expect(chiamate[0].model).toBe('Primo');
    expect(chiamate[0].messages[0].content).toContain('traduttore di Referto');
    // Lo stesso testo non richiama il modello.
    await traduttore.traduci(['Uno.'], 'en');
    expect(chiamate).toHaveLength(2);
  });

  it('se la traduzione cambia un numero riprova, poi restituisce l\'originale', async () => {
    const fetchFinto = jest.fn(async () => rispostaModello('The value is 126 mg/dL.'));
    global.fetch = fetchFinto as unknown as typeof fetch;
    expect(await traduttore.traduci(['Il valore è 162 mg/dL.'], 'en')).toEqual([{ testo: 'Il valore è 162 mg/dL.', tradotto: false }]);
    expect(fetchFinto).toHaveBeenCalledTimes(2);
  });

  it('con il primo modello sovraccarico usa la riserva', async () => {
    const modelli: string[] = [];
    global.fetch = jest.fn(async (_url: string, opzioni: RequestInit) => {
      const corpo = JSON.parse(String(opzioni.body));
      modelli.push(corpo.model);
      return corpo.model === 'Primo' ? rispostaModello('', 503) : rispostaModello('Within normal limits.');
    }) as unknown as typeof fetch;
    expect(await traduttore.traduci(['Nella norma.'], 'en')).toEqual([{ testo: 'Within normal limits.', tradotto: true }]);
    expect(modelli).toEqual(['Primo', 'Riserva']);
  });

  it('se il modello non risponde restituisce l\'originale', async () => {
    global.fetch = jest.fn(async () => rispostaModello('', 500)) as unknown as typeof fetch;
    expect(await traduttore.traduci(['Nella norma.'], 'en')).toEqual([{ testo: 'Nella norma.', tradotto: false }]);
  });
});

describe('POST /api/traduzione', () => {
  let app: INestApplication<App>;
  const fetchOriginale = global.fetch;
  const modelloOriginale = { ...config.modello };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configuraApp(modulo.createNestApplication());
    await app.init();
  });

  afterEach(() => {
    global.fetch = fetchOriginale;
    Object.assign(config.modello, modelloOriginale);
  });

  afterAll(async () => {
    await app.close();
  });

  it('è pubblica e restituisce le traduzioni', async () => {
    Object.assign(config.modello, { apiKey: 'chiave-di-prova' });
    global.fetch = jest.fn(async () => rispostaModello('Should I be worried?')) as unknown as typeof fetch;
    const risposta = await request(app.getHttpServer())
      .post('/api/traduzione')
      .send({ testi: ['Devo preoccuparmi?'], lingua: 'en' })
      .expect(200);
    expect(risposta.body).toEqual({ traduzioni: [{ testo: 'Should I be worried?', tradotto: true }] });
  });

  it('rifiuta una lingua sconosciuta o troppi pezzi', async () => {
    Object.assign(config.modello, { apiKey: 'chiave-di-prova' });
    await request(app.getHttpServer()).post('/api/traduzione').send({ testi: ['Ciao'], lingua: 'fr' }).expect(400);
    await request(app.getHttpServer())
      .post('/api/traduzione')
      .send({ testi: Array.from({ length: 9 }, () => 'x'), lingua: 'en' })
      .expect(400);
  });

  it('senza chiave del modello risponde 503', async () => {
    Object.assign(config.modello, { apiKey: '' });
    await request(app.getHttpServer()).post('/api/traduzione').send({ testi: ['Ciao'], lingua: 'en' }).expect(503);
  });
});

describe('Testi fissi del backend nell\'interfaccia in inglese', () => {
  it('quelli tradotti nel frontend (frontend/src/lingua/en.ts) sono ancora scritti così nel backend', () => {
    const { readFileSync, readdirSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { join } = jest.requireActual<typeof import('node:path')>('node:path');
    const cartella = join(__dirname, '..', 'src');
    const file = (readdirSync(cartella, { recursive: true }) as string[]).filter((nome) => nome.endsWith('.ts'));
    // Le stringhe spezzate con + su più righe si riuniscono.
    const codice = file
      .map((nome) => readFileSync(join(cartella, nome), 'utf8'))
      .join('\n')
      .replace(/['"]\s*\+\s*\n\s*['"]/g, '')
      .replace(/\\'/g, "'");
    const en = readFileSync(join(__dirname, '..', '..', 'frontend', 'src', 'lingua', 'en.ts'), 'utf8');
    const blocco = en.slice(en.indexOf('Testi fissi del backend'));
    const fissi = [...blocco.matchAll(/^ {2}("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1]) as string);
    expect(fissi.length).toBeGreaterThan(3);
    expect(fissi.filter((testo) => !codice.includes(testo))).toEqual([]);
  });
});
