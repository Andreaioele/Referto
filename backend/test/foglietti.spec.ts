import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';
import { FogliettiService, interpreta, NON_TROVATA } from '../src/foglietti/foglietti.service';
import { scegliBrani, trovaSezioni } from '../src/foglietti/sezioni';

// Foglio illustrativo di prova con la struttura dei PDF AIFA (testo inventato).
const PAGINE = [
  [
    'Documento reso disponibile da AIFA il 19/06/2021Esula dalla competenza',
    '1/3',
    'Foglio illustrativo: Informazioni per l’utilizzatore',
    'PROVAMED 5 mg compresse',
    'Contenuto di questo foglio:',
    '1. Cos’è PROVAMED e a cosa serve',
    '2. Cosa deve sapere prima di prendere PROVAMED',
    '3. Come prendere PROVAMED',
    '4. Possibili effetti indesiderati',
    '5. Come conservare PROVAMED',
    '6. Contenuto della confezione e altre informazioni',
    '1. Cos’è PROVAMED e a cosa serve',
    'PROVAMED contiene una sostanza di prova usata per',
    'abbassare la pressione del sangue.',
  ].join('\n'),
  [
    '2/3',
    '2. Cosa deve sapere prima di prendere PROVAMED',
    'Altri medicinali e PROVAMED',
    'Informi il medico se sta assumendo altri medicinali.',
    'PROVAMED con cibo e alcool',
    'Bere alcool può farle venire le vertigini.',
    '3. Come prendere PROVAMED',
    'Prenda una compressa al giorno.',
    'Se dimentica di prendere PROVAMED',
    'Non prenda una dose doppia per compensare la dimenticanza della dose.',
  ].join('\n'),
  [
    '3/3',
    '4. Possibili effetti indesiderati',
    'Come tutti i medicinali, può causare effetti indesiderati.',
    '5. Come conservare PROVAMED',
    'Conservare a temperatura inferiore a 25 °C.',
    '6. Contenuto della confezione e altre informazioni',
    'Ogni compressa contiene 5 mg di sostanza di prova.',
    'Le informazioni seguenti sono destinate esclusivamente agli operatori sanitari',
    'Testo per i medici.',
  ].join('\n'),
];

describe('trovaSezioni', () => {
  it('trova le sei sezioni dopo l’indice, con pagina e testo senza intestazioni AIFA', () => {
    const { titolo, sezioni } = trovaSezioni(PAGINE);
    expect(titolo).toBe('PROVAMED 5 mg compresse');
    expect(sezioni.map(({ numero, pagina }) => [numero, pagina])).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
      [5, 3],
      [6, 3],
    ]);
    expect(sezioni[0].titolo).toBe('Cos’è PROVAMED e a cosa serve');
    expect(sezioni[0].testo).toBe('PROVAMED contiene una sostanza di prova usata per abbassare la pressione del sangue.');
    expect(sezioni[1].testo).not.toContain('2/3');
    expect(sezioni[5].testo).not.toContain('operatori sanitari');
  });

  it('in un PDF con più fogli sceglie quello della formulazione prescritta', () => {
    const gocce = PAGINE.map((pagina) =>
      pagina.replace('PROVAMED 5 mg compresse', 'PROVAMED 10.000 U.I./ml gocce orali').replace('5 mg di sostanza', '10.000 U.I.'),
    );
    const pdf = [...PAGINE, ...gocce];
    expect(trovaSezioni(pdf).titolo).toBe('PROVAMED 5 mg compresse');
    const scelto = trovaSezioni(pdf, '10.000 U.I./ml gocce orali');
    expect(scelto.titolo).toBe('PROVAMED 10.000 U.I./ml gocce orali');
    expect(scelto.sezioni[0].pagina).toBe(4);
    expect(scelto.sezioni[5].testo).toContain('10.000 U.I.');
  });

  it('restituisce un elenco vuoto se il PDF non ha l’indice standard', () => {
    expect(trovaSezioni(['Un documento qualsiasi'])).toEqual({ titolo: '', sezioni: [] });
  });
});

describe('scegliBrani', () => {
  const { sezioni } = trovaSezioni(PAGINE);

  it('sceglie i brani della sezione che risponde', () => {
    expect(scegliBrani(sezioni, 'Cosa faccio se dimentico una dose?', 'PROVAMED')[0]).toMatchObject({ sezione: 3 });
    expect(scegliBrani(sezioni, 'Posso bere alcool?', 'PROVAMED')[0]).toMatchObject({ sezione: 2 });
    expect(scegliBrani(sezioni, 'Come si conserva?', 'PROVAMED')[0]).toMatchObject({ sezione: 5 });
  });

  it('non sceglie nulla se la domanda non c’entra con il foglio', () => {
    expect(scegliBrani(sezioni, 'Quanto costa?', 'PROVAMED')).toEqual([]);
  });
});

describe('interpreta', () => {
  const brani = scegliBrani(trovaSezioni(PAGINE).sezioni, 'Se dimentico una dose?', 'PROVAMED');

  it('toglie la riga SEZIONE e la frase di chiusura e tiene la sezione citata se è tra i brani', () => {
    const esito = interpreta(
      'Il foglietto dice di non prendere una dose doppia.\nSEZIONE: 3\n\nQuesta è una spiegazione automatica e può contenere errori.',
      brani,
    );
    expect(esito).toEqual({
      risposta: 'Il foglietto dice di non prendere una dose doppia.',
      sezione: 3,
      trovata: true,
      origine: 'agente',
    });
  });

  it('usa la sezione del primo brano se l’agente ne cita una che non gli è stata data', () => {
    expect(interpreta('Risposta.\nSEZIONE: 6', brani).sezione).toBe(brani[0].sezione);
  });

  it('riconosce NON_TROVATO', () => {
    expect(interpreta('NON_TROVATO', brani)).toMatchObject({ risposta: NON_TROVATA, trovata: false, sezione: null });
  });
});

describe('API /api/foglietti', () => {
  let app: INestApplication<App>;
  const fetchOriginale = global.fetch;
  const evolusOriginale = { ...config.evolus };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configuraApp(modulo.createNestApplication());
    await app.init();
  });

  afterEach(() => {
    global.fetch = fetchOriginale;
    Object.assign(config.evolus, evolusOriginale);
    config.chiaveApi = '';
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('risponde 404 per un codice che non è nel prontuario, anche con la chiave API attiva', async () => {
    config.chiaveApi = 'segreto-di-prova';
    await request(app.getHttpServer()).get('/api/foglietti/999999').expect(404);
    await request(app.getHttpServer()).get('/api/foglietti/abc/pdf').expect(404);
  });

  it('risponde 502 se AIFA non restituisce il PDF', async () => {
    global.fetch = jest.fn(async () => new Response('errore', { status: 500 })) as unknown as typeof fetch;
    await request(app.getHttpServer()).get('/api/foglietti/027161').expect(502);
  });

  it('valida la domanda', async () => {
    await request(app.getHttpServer()).post('/api/foglietti/027161/domande').send({ domanda: '' }).expect(400);
    await request(app.getHttpServer())
      .post('/api/foglietti/027161/domande')
      .send({ domanda: 'Come si conserva?', referto: 'testo' })
      .expect(400);
  });

  it('se l’agente va in timeout risponde con il brano del foglio invece di dare errore', async () => {
    Object.assign(config.evolus, { apiKey: 'chiave-di-prova', applicationId: 'app-di-prova' });
    const servizio = app.get(FogliettiService);
    jest.spyOn(servizio, 'foglietto').mockImplementation(async () => ({
      farmaco: { nome: 'PROVAMED' } as never,
      pdf: new Uint8Array(),
      pagine: 3,
      testo: PAGINE,
    }));
    global.fetch = jest.fn(async () => {
      const flusso = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
        },
      });
      return new Response(flusso, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }) as unknown as typeof fetch;
    const risposta = await request(app.getHttpServer())
      .post('/api/foglietti/027161/domande')
      .send({ domanda: 'Come si conserva?' })
      .expect(200);
    expect(risposta.body).toMatchObject({ sezione: 5, trovata: true, origine: 'foglietto' });
  });

  it('senza agente configurato risponde con il brano del foglio (riserva deterministica)', async () => {
    Object.assign(config.evolus, { apiKey: '', applicationId: '' });
    const servizio = app.get(FogliettiService);
    jest.spyOn(servizio, 'foglietto').mockImplementation(async () => ({
      farmaco: { nome: 'PROVAMED' } as never,
      pdf: new Uint8Array(),
      pagine: 3,
      testo: PAGINE,
    }));
    const risposta = await request(app.getHttpServer())
      .post('/api/foglietti/027161/domande')
      .send({ domanda: 'Come si conserva?' })
      .expect(200);
    expect(risposta.body).toMatchObject({ sezione: 5, trovata: true, origine: 'foglietto' });
    expect(risposta.body.risposta).toContain('Conservare a temperatura inferiore a 25 °C.');
  });
});
