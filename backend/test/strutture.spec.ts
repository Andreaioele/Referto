import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';
import { AREE, areaDaEtichetta } from '../src/strutture/aree';
import type { FileStrutture, Struttura } from '../src/strutture/strutture.types';
import { StruttureService } from '../src/strutture/strutture.service';

/** Viale Monza 140: la casa della paziente della demo. */
const CASA = { lat: 45.5041, lon: 9.2225 };

describe('aree della classificazione', () => {
  it('riconosce tutte e sole le aree che il Mother agent può scrivere (data/prompt-mother.md)', () => {
    const prompt = readFileSync(config.promptMother, 'utf-8');
    const elenco = /scritta esattamente come in questo elenco:\s*([\s\S]*?)\.\n/.exec(prompt)?.[1] ?? '';
    const etichette = elenco.split(',').map((e) => e.replace(/\s+/g, ' ').trim());
    expect(etichette).toHaveLength(19);
    for (const etichetta of etichette) expect(areaDaEtichetta(etichetta)?.etichetta).toBe(etichetta);
    expect(AREE.map((a) => a.etichetta).sort()).toEqual([...etichette].sort());
  });

  it('accetta maiuscole, spazi e id; rifiuta le aree fuori elenco', () => {
    expect(areaDaEtichetta('  CARDIOLOGIA ')?.id).toBe('cardiologia');
    expect(areaDaEtichetta('medicina-generale')?.id).toBe('medicina-generale');
    expect(areaDaEtichetta('Astrologia')).toBeNull();
  });
});

describe('data/strutture-milano.json', () => {
  const file = JSON.parse(readFileSync(config.strutture, 'utf-8')) as FileStrutture;

  it('ha le strutture di Milano, dentro la città, con le fonti', () => {
    expect(file.citta).toBe('Milano');
    expect(file.strutture.length).toBeGreaterThan(1500);
    for (const s of file.strutture) {
      expect(s.lat).toBeGreaterThan(45.38);
      expect(s.lat).toBeLessThan(45.54);
      expect(s.lon).toBeGreaterThan(9.04);
      expect(s.lon).toBeLessThan(9.28);
      expect(s.nome.trim()).not.toBe('');
      expect(s.indirizzo.trim()).not.toBe('');
    }
    const tipi = new Set(file.strutture.map((s) => s.tipo));
    for (const tipo of ['ospedale', 'medico-di-famiglia', 'pediatra', 'studio-medico', 'farmacia', 'consultorio', 'ambulatorio', 'laboratorio']) {
      expect(tipi.has(tipo as Struttura['tipo'])).toBe(true);
    }
    expect(file.fonti.length).toBeGreaterThanOrEqual(11);
    expect(new Set(file.strutture.map((s) => s.fonte))).toEqual(new Set(['comune-milano', 'openstreetmap', 'overture']));
    for (const fonte of file.fonti) expect(fonte.licenza).toBeTruthy();
  });

  it('non contiene dati personali che non servono (date di nascita dei medici)', () => {
    const testo = readFileSync(config.strutture, 'utf-8');
    expect(testo).not.toMatch(/dataNascita|codice_regionale/);
  });

  it('da Overture tiene solo luoghi sanitari: niente dentisti, farmacie, osteopati, laboratori non medici', () => {
    const overture = file.strutture.filter((s) => s.fonte === 'overture');
    expect(overture.length).toBeGreaterThan(3000);
    for (const s of overture) {
      expect(s.nome).not.toMatch(/dent|odont|osteopat|omeopat|farmaci|revision|restaur/i);
      expect(['studio-medico', 'ambulatorio', 'laboratorio']).toContain(s.tipo);
      expect(s.nome.length).toBeLessThanOrEqual(80);
      if (s.telefono) expect(s.telefono).toMatch(/^\+39 \d{6,}$/);
    }
  });

  it('ogni area ha almeno una struttura e almeno un professionista, e gli ospedali hanno nomi interi', () => {
    const servizio = new StruttureService(config.strutture);
    for (const area of AREE) {
      expect(servizio.perArea(area, CASA.lat, CASA.lon, 3, 'strutture').gruppi.length).toBeGreaterThan(0);
      expect(servizio.perArea(area, CASA.lat, CASA.lon, 3, 'professionisti').gruppi.length).toBeGreaterThan(0);
    }
    const ospedali = file.strutture.filter((s) => s.tipo === 'ospedale');
    expect(ospedali.map((o) => o.nome)).toEqual(expect.arrayContaining(['Ospedale Niguarda', 'Ospedale San Raffaele']));
  });
});

describe('StruttureService', () => {
  const struttura = (id: string, tipo: Struttura['tipo'], aree: string[], lat: number): Struttura => ({
    id,
    tipo,
    nome: id,
    aree,
    indirizzo: `Via ${id}`,
    lat,
    lon: 9.2,
    fonte: 'comune-milano',
  });
  const percorso = join(mkdtempSync(join(tmpdir(), 'strutture-')), 'strutture.json');
  writeFileSync(
    percorso,
    JSON.stringify({
      citta: 'Milano',
      generato: '2026-10-15',
      fonti: [{ nome: 'prova', url: 'https://example.org', licenza: 'CC0' }],
      strutture: [
        struttura('cardio-lontano', 'ambulatorio', ['cardiologia'], 45.5),
        struttura('cardio-vicino', 'ambulatorio', ['cardiologia'], 45.41),
        struttura('ospedale-cardio', 'ospedale', ['cardiologia'], 45.42),
        struttura('ospedale-senza', 'ospedale', ['ortopedia'], 45.43),
        struttura('medico', 'medico-di-famiglia', ['medicina-generale'], 45.401),
        struttura('farmacia', 'farmacia', [], 45.402),
        struttura('lab', 'laboratorio', ['laboratorio'], 45.44),
        struttura('studio-cardio', 'studio-medico', ['cardiologia'], 45.405),
      ],
    } satisfies FileStrutture),
  );
  const servizio = new StruttureService(percorso);
  const area = (id: string) => AREE.find((a) => a.id === id)!;

  it("per area: prima chi se ne occupa, poi gli ospedali con il reparto, ognuno dal più vicino", () => {
    const { gruppi } = servizio.perArea(area('cardiologia'), 45.4, 9.2, 5);
    expect(gruppi.map((g) => g.id)).toEqual(['specialisti', 'ospedali']);
    // Gli studi dei professionisti non sono strutture.
    expect(gruppi[0].strutture.map((s) => s.id)).toEqual(['cardio-vicino', 'cardio-lontano']);
    expect(gruppi[1].strutture.map((s) => s.id)).toEqual(['ospedale-cardio']);
    expect(gruppi[0].strutture[0].distanzaKm).toBe(1.1);
  });

  it('professionisti: gli studi medici dell’area e, per medicina generale, i medici di famiglia; mai tra le strutture', () => {
    const cardio = servizio.perArea(area('cardiologia'), 45.4, 9.2, 5, 'professionisti').gruppi;
    expect(cardio.map((g) => [g.id, g.strutture.map((s) => s.id)])).toEqual([['specialisti', ['studio-cardio']]]);
    const generale = servizio.perArea(area('medicina-generale'), 45.4, 9.2, 5, 'professionisti').gruppi;
    expect(generale.find((g) => g.id === 'medici')?.strutture.map((s) => s.id)).toEqual(['medico']);
    const strutture = servizio.perArea(area('cardiologia'), 45.4, 9.2, 5, 'strutture').gruppi.flatMap((g) => g.strutture);
    expect(strutture.map((s) => s.tipo)).not.toContain('studio-medico');
    expect(servizio.perArea(area('medicina-generale'), 45.4, 9.2, 5).gruppi.map((g) => g.id)).not.toContain('medici');
  });

  it('radiologia e laboratorio portano a tutti gli ospedali', () => {
    const laboratorio = servizio.perArea(area('laboratorio'), 45.4, 9.2, 5).gruppi;
    expect(laboratorio.find((g) => g.id === 'specialisti')?.strutture.map((s) => s.id)).toEqual(['lab']);
    expect(laboratorio.find((g) => g.id === 'ospedali')?.strutture.map((s) => s.id)).toEqual(['ospedale-cardio', 'ospedale-senza']);
  });

  it('rispetta il limite ma dice quante sono in tutto', () => {
    const [specialisti] = servizio.perArea(area('cardiologia'), 45.4, 9.2, 1).gruppi;
    expect(specialisti).toMatchObject({ totale: 2 });
    expect(specialisti.strutture).toHaveLength(1);
  });

  it('per tipo: solo quel tipo, dal più vicino', () => {
    expect(servizio.perTipo('farmacia', 45.4, 9.2, 5).strutture.map((s) => s.id)).toEqual(['farmacia']);
  });
});

describe('API /api/strutture', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configuraApp(modulo.createNestApplication());
    await app.init();
  });

  afterEach(() => {
    config.chiaveApi = '';
  });

  afterAll(async () => {
    await app.close();
  });

  it("cerca per l'area scritta dal Mother agent, anche con la chiave API attiva (rotta pubblica)", async () => {
    config.chiaveApi = 'segreto-di-prova';
    const risposta = await request(app.getHttpServer())
      .get('/api/strutture')
      .query({ area: 'Cardiologia', lat: CASA.lat, lon: CASA.lon, limite: 3 })
      .expect(200);
    expect(risposta.body.area).toEqual({ id: 'cardiologia', etichetta: 'Cardiologia', reparto: 'cardiologia' });
    const ospedali = risposta.body.gruppi.find((g: { id: string }) => g.id === 'ospedali');
    expect(ospedali.strutture).toHaveLength(3);
    const distanze = ospedali.strutture.map((s: { distanzaKm: number }) => s.distanzaKm);
    expect(distanze).toEqual([...distanze].sort((a, b) => a - b));
  });

  it('con categoria=professionisti restituisce medici e studi, e rifiuta categorie sconosciute', async () => {
    const risposta = await request(app.getHttpServer())
      .get('/api/strutture')
      .query({ area: 'Medicina generale', categoria: 'professionisti', lat: CASA.lat, lon: CASA.lon, limite: 2 })
      .expect(200);
    const tipi = risposta.body.gruppi.flatMap((g: { strutture: Array<{ tipo: string }> }) => g.strutture.map((s) => s.tipo));
    expect(tipi.length).toBeGreaterThan(0);
    for (const tipo of tipi) expect(['studio-medico', 'medico-di-famiglia', 'pediatra']).toContain(tipo);
    await request(app.getHttpServer()).get('/api/strutture').query({ area: 'Cardiologia', categoria: 'altro' }).expect(400);
  });

  it('cerca per tipo', async () => {
    const risposta = await request(app.getHttpServer()).get('/api/strutture').query({ tipo: 'farmacia', limite: 2 }).expect(200);
    expect(risposta.body).toMatchObject({ tipo: 'farmacia', totale: 422 });
    expect(risposta.body.strutture).toHaveLength(2);
  });

  it('rifiuta area sconosciuta, tipo sconosciuto, nessun criterio e punti fuori Milano', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/strutture').query({ area: 'Astrologia' }).expect(400);
    await request(server).get('/api/strutture').query({ tipo: 'dentista' }).expect(400);
    await request(server).get('/api/strutture').expect(400);
    await request(server).get('/api/strutture').query({ area: 'Cardiologia', lat: 41.9, lon: 12.5 }).expect(400);
  });

  it('elenca le aree con fonti e data dei dati', async () => {
    const risposta = await request(app.getHttpServer()).get('/api/strutture/aree').expect(200);
    expect(risposta.body.aree).toHaveLength(19);
    expect(risposta.body).toMatchObject({ citta: 'Milano', generato: expect.any(String) });
    expect(risposta.body.fonti.length).toBeGreaterThan(0);
  });
});
