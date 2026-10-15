import { ArchivioChat } from '../src/chat/archivio-chat';
import type { EventoChat } from '../src/chat/evolus.client';
import { MotoreChat } from '../src/chat/motore-chat';
import { improntaReferto, ServizioChat } from '../src/chat/servizio-chat';

class MotoreFinto extends MotoreChat {
  readonly nome = 'finto';
  chiamate: Array<{ messaggio: string; conversazione?: string }> = [];
  configurato = () => true;
  versione = () => 'finto/1';
  async *chiedi(messaggio: string, conversazione: string | undefined): AsyncGenerator<EventoChat> {
    this.chiamate.push({ messaggio, conversazione });
    yield { tipo: 'testo', testo: 'Spiegazione' };
    yield { tipo: 'fine', conversazione: 'c0ffee00-0000-4000-8000-000000000000' };
  }
}

/** Un archivio con MongoDB irraggiungibile: ogni operazione fallisce. */
const archivioGuasto = new Proxy({} as ArchivioChat, {
  get: () => () => Promise.reject(new Error('MongoServerSelectionError')),
});

async function eventi(generatore: AsyncGenerator<EventoChat>): Promise<EventoChat[]> {
  const tutti: EventoChat[] = [];
  for await (const evento of generatore) tutti.push(evento);
  return tutti;
}

describe('ServizioChat', () => {
  const segnale = new AbortController().signal;

  it('senza archivio passa tutto al motore', async () => {
    const motore = new MotoreFinto();
    const risultato = await eventi(new ServizioChat(motore).rispondi({ messaggio: 'Referto' }, segnale));
    expect(risultato.at(-1)).toEqual({ tipo: 'fine', conversazione: 'c0ffee00-0000-4000-8000-000000000000' });
  });

  it('se MongoDB non risponde la chat funziona lo stesso', async () => {
    const motore = new MotoreFinto();
    const servizio = new ServizioChat(motore, archivioGuasto);
    jest.spyOn((servizio as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);

    const spiegazione = await eventi(servizio.rispondi({ messaggio: 'Referto' }, segnale));
    expect(spiegazione).toEqual([{ tipo: 'testo', testo: 'Spiegazione' }, { tipo: 'fine', conversazione: expect.any(String) }]);

    // Una conversazione del motore (non salvata) si continua con il motore.
    const conversazione = 'c0ffee00-0000-4000-8000-000000000000';
    await eventi(servizio.rispondi({ messaggio: 'Domanda', conversazione }, segnale));
    expect(motore.chiamate.at(-1)).toEqual({ messaggio: 'Domanda', conversazione });
  });

  it("l'impronta ignora spazi e a capo", () => {
    expect(improntaReferto(' ECG:\n ritmo   sinusale ')).toBe(improntaReferto('ECG: ritmo sinusale'));
    expect(improntaReferto('ECG: ritmo sinusale')).not.toBe(improntaReferto('ECG: ritmo non sinusale'));
  });
});
