import { Test } from '@nestjs/testing';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChatModule } from '../src/chat/chat.module';
import type { EventoChat } from '../src/chat/evolus.client';
import { MotherDiretto } from '../src/chat/mother-diretto';
import { config } from '../src/config';

/** Risposta in streaming come quella di /chat/completions (righe "data:" e [DONE]). */
function streaming(...pezzi: unknown[]): Response {
  const encoder = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const pezzo of pezzi) controller.enqueue(encoder.encode(`data: ${JSON.stringify(pezzo)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(corpo, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const testo = (contenuto: string) => ({ choices: [{ delta: { content: contenuto } }] });

async function eventi(generatore: AsyncGenerator<EventoChat>): Promise<EventoChat[]> {
  const tutti: EventoChat[] = [];
  for await (const evento of generatore) tutti.push(evento);
  return tutti;
}

describe('MotherDiretto', () => {
  let mother: MotherDiretto;
  const fetchOriginale = global.fetch;
  const modelloOriginale = { ...config.modello };
  let corpi: Array<Record<string, unknown>>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [ChatModule] }).compile();
    mother = modulo.get(MotherDiretto);
  });

  beforeEach(() => {
    corpi = [];
    Object.assign(config.modello, { apiKey: 'chiave-di-prova', nome: 'DeepSeek-V4.1-Flash', riserva: 'DeepSeek-V4-Flash' });
  });

  afterEach(() => {
    global.fetch = fetchOriginale;
    Object.assign(config.modello, modelloOriginale);
  });

  function rispondi(...risposte: Response[]) {
    global.fetch = jest.fn(async (_url: string, opzioni: RequestInit) => {
      corpi.push(JSON.parse(String(opzioni.body)));
      return risposte.shift() as Response;
    }) as unknown as typeof fetch;
  }

  it('usa il prompt del Mother agent ed esegue cercaFarmaci sul prontuario locale', async () => {
    rispondi(
      streaming({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, id: 'c1', function: { name: 'cercaFarmaci', arguments: '{"farmaci":[{"nome":"Cardio' } }],
            },
          },
        ],
      }, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'aspirin 100 mg"}],"limite_alternative":0}' } }] }, finish_reason: 'tool_calls' }] }),
      streaming(testo('ARGOMENTO: Visita cardiologica · Cardiologia\n'), testo('SINTESI\n…')),
    );

    const risultato = await eventi(mother.chiedi('Terapia: Cardioaspirin 100 mg', undefined, new AbortController().signal));

    expect(risultato.filter((e) => e.tipo === 'testo').map((e) => (e as { testo: string }).testo).join('')).toBe(
      'ARGOMENTO: Visita cardiologica · Cardiologia\nSINTESI\n…',
    );
    expect(risultato.at(-1)).toMatchObject({ tipo: 'fine' });
    const [primo, secondo] = corpi as Array<{ model: string; messages: Array<{ role: string; content: string }>; tools?: unknown }>;
    expect(primo.model).toBe('DeepSeek-V4.1-Flash');
    expect(primo.messages[0].content).toContain('Sei Referto');
    expect(primo.tools).toBeDefined();
    const strumento = JSON.parse(secondo.messages.find((m) => m.role === 'tool')?.content ?? '{}');
    expect(strumento.risultati[0]).toMatchObject({ nome: 'Cardioaspirin 100 mg', trovato: true });
  });

  it('se il modello è sovraccarico riprova con quello di riserva', async () => {
    rispondi(new Response('', { status: 502 }), streaming(testo('Risposta')));
    const risultato = await eventi(mother.chiedi('Ciao', undefined, new AbortController().signal));
    expect(corpi.map((c) => c.model)).toEqual(['DeepSeek-V4.1-Flash', 'DeepSeek-V4-Flash']);
    expect(risultato.at(-1)).toMatchObject({ tipo: 'fine' });
  });

  it('continua la conversazione con i messaggi precedenti', async () => {
    rispondi(streaming(testo('Prima risposta')), streaming(testo('Seconda risposta')));
    const prima = await eventi(mother.chiedi('Referto di prova', undefined, new AbortController().signal));
    const conversazione = (prima.at(-1) as { conversazione: string }).conversazione;
    await eventi(mother.chiedi('Domanda successiva', conversazione, new AbortController().signal));
    const messaggi = (corpi[1] as { messages: Array<{ role: string; content: string }> }).messages;
    expect(messaggi.map((m) => [m.role, m.content])).toEqual([
      ['system', expect.stringContaining('Sei Referto')],
      ['user', 'Referto di prova'],
      ['assistant', 'Prima risposta'],
      ['user', 'Domanda successiva'],
    ]);
  });

  it('su errore del modello manda un messaggio già scritto per la persona', async () => {
    rispondi(new Response('', { status: 500 }));
    const risultato = await eventi(mother.chiedi('Ciao', undefined, new AbortController().signal));
    expect(risultato).toEqual([{ tipo: 'errore', messaggio: expect.stringContaining('non ha risposto') }]);
  });

  it('ha lo stesso prompt del Mother agent su Evolus', () => {
    const originale = join(__dirname, '..', '..', 'resources', 'evolus', 'agenti', 'mother.md');
    if (!existsSync(originale)) return; // fuori dal repository completo (per esempio su Vercel) non si controlla
    const corpo = readFileSync(originale, 'utf8').split('---\n').slice(2).join('---\n').trim();
    expect(readFileSync(config.promptMother, 'utf8').trim()).toBe(corpo);
  });
});
