import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { configuraApp } from '../src/crea-app';
import { GlossarioService } from '../src/terminologia/glossario.service';
import { chiave } from '../src/terminologia/testo';

describe('Terminologia', () => {
  let app: INestApplication<App>;
  let glossario: GlossarioService;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configuraApp(modulo.createNestApplication());
    await app.init();
    glossario = modulo.get(GlossarioService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('calcola le chiavi come lo script Python che costruisce il glossario', () => {
    // Valori di chiave() in resources/glossario/costruisci_glossario_strati.py.
    const attese: Record<string, string> = {
      Polmoni: 'polmon',
      'Opacità': 'opacit',
      'Versamenti pleurici': 'versament pleuric',
      cardiache: 'cardiac',
      'Colesterolo LDL': 'colesterol ldl',
      reni: 'ren',
      renio: 'reni',
      'Seni costo-frenici': 'sen cost frenic',
      HbA1c: 'hba1c',
      ipoecogena: 'ipoecogen',
      lobi: 'lob',
      Ecografia: 'ecografi',
      Lunghe: 'lung',
    };
    for (const [parola, attesa] of Object.entries(attese)) expect(chiave(parola)).toBe(attesa);
  });

  it('trova le voci al singolare e al plurale, dallo strato curato o da Wikidata', () => {
    const [consolidazioni, ldl, reni, inesistente] = glossario.cerca(['consolidazioni', 'colesterolo LDL', 'reni', 'zxqwv']);
    expect(consolidazioni).toMatchObject({ trovato: true, termine: 'consolidazione', lingua: 'it' });
    expect(consolidazioni.fonte).toBe('Glossario di Referto');
    expect(ldl).toMatchObject({ trovato: true, termine: 'colesterolo ldl' });
    expect(reni).toMatchObject({ trovato: true, termine: 'rene' });
    expect(reni.url).toMatch(/^https:\/\/(it\.wikipedia|www\.wikidata)\.org\//);
    expect(inesistente).toEqual({ richiesto: 'zxqwv', trovato: false });
  });

  it('una parola comune non diventa il termine con la stessa radice ("stato" non è la proteina STAT)', () => {
    expect(glossario.cerca(['stato'])[0].trovato).toBe(false);
    expect(glossario.trovaNelTesto('Lo stato del paziente è stabile.')).toEqual([]);
  });

  it('nel testo vince il termine più lungo, senza ripetizioni', () => {
    const trovati = glossario.trovaNelTesto('Versamento pleurico a destra. Versamenti pleurici invariati.');
    expect(trovati.map((t) => t.voce.nome)).toEqual(['versamento pleurico']);
  });

  it('POST /api/terminologia/cerca spiega le parole e rifiuta il testo del referto', async () => {
    const risposta = await request(app.getHttpServer())
      .post('/api/terminologia/cerca')
      .send({ termini: ['ipoecogena'] })
      .expect(200);
    expect(risposta.body.risultati[0]).toMatchObject({ richiesto: 'ipoecogena', trovato: true, termine: 'ipoecogeno' });
    expect(risposta.body.fonte.creato).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await request(app.getHttpServer()).post('/api/terminologia/cerca').send({ termini: [] }).expect(400);
    await request(app.getHttpServer())
      .post('/api/terminologia/cerca')
      .send({ termini: ['nodulo'], referto: 'testo del referto' })
      .expect(400);
    config.chiaveApi = 'segreto-di-prova';
    try {
      await request(app.getHttpServer()).post('/api/terminologia/cerca').send({ termini: ['nodulo'] }).expect(401);
    } finally {
      config.chiaveApi = '';
    }
  });
});
