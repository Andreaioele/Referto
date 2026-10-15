import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from '../config';
import { cercaFarmaci } from '../farmaci/cerca-farmaci';
import { ProntuarioService } from '../farmaci/prontuario.service';
import { righeDati, type EventoChat } from './evolus.client';
import { MotoreChat } from './motore-chat';

/** Messaggio nel formato delle API compatibili OpenAI (/chat/completions). */
interface Messaggio {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ChiamataStrumento[];
  tool_call_id?: string;
}

interface ChiamataStrumento {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** Pezzo dello streaming: testo e, a pezzi, le chiamate agli strumenti. */
interface Delta {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
}

/** Lo strumento del Mother agent su Evolus (Web API "Referto-medicinali"), descritto per il modello. */
const STRUMENTI = [
  {
    type: 'function',
    function: {
      name: 'cercaFarmaci',
      description:
        'Passa SOLO i nomi dei farmaci esattamente come sono scritti nel referto (anche con il dosaggio), mai il ' +
        'testo del referto. Chiamala una sola volta con tutti i nomi insieme e con limite_alternative uguale a 0. ' +
        'Per ogni nome restituisce trovato e, se trovato, una descrizione pronta (che cos\'è il farmaco e la sua ' +
        'categoria ATC) da riportare così com\'è.',
      parameters: {
        type: 'object',
        properties: {
          farmaci: {
            type: 'array',
            description: 'Solo i nomi dei farmaci trovati nel referto, mai il testo del referto.',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string', description: 'Nome come è scritto nel referto, anche con il dosaggio.' },
                principio_attivo: { type: 'string', description: 'Principio attivo, se lo conosci.' },
              },
              required: ['nome'],
            },
          },
          limite_alternative: { type: 'integer', minimum: 0, maximum: 50 },
        },
        required: ['farmaci'],
      },
    },
  },
];

const SOVRACCARICO = new Set([429, 502, 503, 504]);
/** Codice usato quando il modello non inizia a rispondere entro config.modello.attesaPrimaRispostaMs (oggi V4.1 a volte dà 504 dopo un minuto). */
const SCADUTO = 504;
/** Il modello di riserva è l'ultima possibilità: lo si aspetta di più. */
const ATTESA_RISERVA_MS = 90_000;
const MASSIMO_GIRI = 3;
const MASSIMO_CONVERSAZIONI = 200;
const DURATA_CONVERSAZIONE_MS = 2 * 60 * 60 * 1000;
const ERRORE_GENERICO = 'Il servizio di spiegazione non ha risposto. Riprova tra qualche minuto.';
const ERRORE_SOVRACCARICO = 'Il servizio di spiegazione è sovraccarico. Riprova tra qualche minuto.';

class ErroreModello extends Error {
  constructor(readonly stato: number) {
    super(`HTTP ${stato}`);
  }
}

/**
 * Il Mother agent ricostruito nel backend, senza Evolus: stesso prompt
 * (data/prompt-mother.md, copia di resources/evolus/agenti/mother.md), stesso
 * modello (DeepSeek-V4.1-Flash su AMD Token Factory) e lo strumento
 * cercaFarmaci eseguito direttamente sul prontuario, senza passare dalla rete.
 *
 * Le conversazioni restano in memoria per due ore (al massimo 200): basta per
 * le domande successive nel widget; un riavvio del server le perde.
 */
@Injectable()
export class MotherDiretto extends MotoreChat {
  readonly nome = 'diretto';
  // Solo esiti tecnici: mai il contenuto dei messaggi.
  private readonly logger = new Logger('MotherDiretto');
  private readonly conversazioni = new Map<string, { messaggi: Messaggio[]; aggiornata: number }>();
  private promptLetto: string | null = null;

  constructor(private readonly prontuario: ProntuarioService) {
    super();
  }

  configurato(): boolean {
    return Boolean(config.modello.apiKey);
  }

  private prompt(): string {
    this.promptLetto ??= readFileSync(config.promptMother, 'utf8').trim();
    return this.promptLetto;
  }

  async *chiedi(messaggio: string, conversazione: string | undefined, segnale: AbortSignal): AsyncGenerator<EventoChat> {
    const inizio = Date.now();
    const id = conversazione && this.conversazioni.has(conversazione) ? conversazione : randomUUID();
    const precedenti = this.conversazioni.get(id)?.messaggi ?? [];
    const nuovi: Messaggio[] = [{ role: 'user', content: messaggio }];
    let modello = config.modello.nome;
    let scritto = false;

    try {
      for (let giro = 1; giro <= MASSIMO_GIRI; giro += 1) {
        const messaggi: Messaggio[] = [{ role: 'system', content: this.prompt() }, ...precedenti, ...nuovi];
        let risposta: Response;
        try {
          risposta = await this.richiesta(modello, messaggi, giro < MASSIMO_GIRI, segnale);
        } catch (errore) {
          // Modello sovraccarico prima di aver scritto qualcosa: si riprova una volta con il modello di riserva.
          if (errore instanceof ErroreModello && SOVRACCARICO.has(errore.stato) && !scritto && modello !== config.modello.riserva) {
            this.logger.warn(`${modello} ha risposto ${errore.message}: provo ${config.modello.riserva}`);
            modello = config.modello.riserva;
            giro -= 1;
            continue;
          }
          throw errore;
        }

        let testo = '';
        const chiamate: ChiamataStrumento[] = [];
        for await (const dati of righeDati(risposta.body as ReadableStream<Uint8Array>)) {
          if (dati === '[DONE]') break;
          let pezzo: Delta;
          try {
            pezzo = JSON.parse(dati) as Delta;
          } catch {
            continue;
          }
          const delta = pezzo.choices?.[0]?.delta;
          if (delta?.content) {
            testo += delta.content;
            scritto = true;
            yield { tipo: 'testo', testo: delta.content };
          }
          for (const parte of delta?.tool_calls ?? []) {
            const chiamata = (chiamate[parte.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
            if (parte.id) chiamata.id = parte.id;
            if (parte.function?.name) chiamata.function.name += parte.function.name;
            if (parte.function?.arguments) chiamata.function.arguments += parte.function.arguments;
          }
        }

        if (chiamate.length === 0) {
          this.ricorda(id, [...precedenti, ...nuovi, { role: 'assistant', content: testo }]);
          this.logger.log(`Risposta di ${modello} in ${Date.now() - inizio} ms (${giro} giri)`);
          yield { tipo: 'fine', conversazione: id };
          return;
        }
        nuovi.push({ role: 'assistant', content: testo || null, tool_calls: chiamate });
        for (const chiamata of chiamate) {
          nuovi.push({ role: 'tool', tool_call_id: chiamata.id, content: this.eseguiStrumento(chiamata) });
        }
      }
      this.logger.warn(`Troppi giri di strumenti dopo ${Date.now() - inizio} ms`);
      yield { tipo: 'errore', messaggio: ERRORE_GENERICO };
    } catch (errore) {
      if (segnale.aborted) return;
      const sovraccarico = errore instanceof ErroreModello && SOVRACCARICO.has(errore.stato);
      this.logger.warn(`Modello ${modello} senza risposta dopo ${Date.now() - inizio} ms: ${(errore as Error).message}`);
      yield { tipo: 'errore', messaggio: sovraccarico ? ERRORE_SOVRACCARICO : ERRORE_GENERICO };
    }
  }

  private async richiesta(modello: string, messaggi: Messaggio[], conStrumenti: boolean, segnale: AbortSignal): Promise<Response> {
    // Il limite vale solo fino all'arrivo della risposta: lo streaming poi può durare quanto serve.
    const limite = modello === config.modello.riserva ? ATTESA_RISERVA_MS : config.modello.attesaPrimaRispostaMs;
    const attesa = new AbortController();
    const timer = setTimeout(() => attesa.abort(), limite);
    let risposta: Response;
    try {
      risposta = await fetch(`${config.modello.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.modello.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: modello,
          messages: messaggi,
          stream: true,
          temperature: 0,
          max_tokens: 1500,
          // All'ultimo giro niente strumenti: il modello deve scrivere la risposta.
          ...(conStrumenti ? { tools: STRUMENTI } : {}),
        }),
        signal: AbortSignal.any([segnale, attesa.signal]),
      });
    } catch (errore) {
      if (attesa.signal.aborted && !segnale.aborted) throw new ErroreModello(SCADUTO);
      throw errore;
    } finally {
      clearTimeout(timer);
    }
    if (!risposta.ok || !risposta.body) throw new ErroreModello(risposta.status);
    return risposta;
  }

  /** cercaFarmaci sul prontuario in memoria: riceve solo i nomi dei farmaci, come la rotta /api/farmaci/cerca. */
  private eseguiStrumento(chiamata: ChiamataStrumento): string {
    if (chiamata.function.name !== 'cercaFarmaci') return JSON.stringify({ errore: 'Strumento sconosciuto' });
    try {
      const argomenti = JSON.parse(chiamata.function.arguments || '{}') as {
        farmaci?: Array<{ nome?: unknown; principio_attivo?: unknown }>;
        limite_alternative?: unknown;
      };
      const farmaci = (argomenti.farmaci ?? [])
        .filter((f) => typeof f?.nome === 'string' && f.nome.trim())
        .slice(0, 20)
        .map((f) => ({
          nome: String(f.nome).slice(0, 120),
          principio_attivo: typeof f.principio_attivo === 'string' ? f.principio_attivo.slice(0, 120) : undefined,
        }));
      const limite = Number.isInteger(argomenti.limite_alternative) ? Math.min(50, Math.max(0, Number(argomenti.limite_alternative))) : 0;
      return JSON.stringify(cercaFarmaci(this.prontuario, farmaci, limite));
    } catch {
      return JSON.stringify({ errore: 'Argomenti non validi' });
    }
  }

  private ricorda(id: string, messaggi: Messaggio[]): void {
    const adesso = Date.now();
    for (const [chiave, valore] of this.conversazioni) {
      if (adesso - valore.aggiornata > DURATA_CONVERSAZIONE_MS) this.conversazioni.delete(chiave);
    }
    this.conversazioni.delete(id);
    this.conversazioni.set(id, { messaggi, aggiornata: adesso });
    if (this.conversazioni.size > MASSIMO_CONVERSAZIONI) {
      this.conversazioni.delete(this.conversazioni.keys().next().value as string);
    }
  }
}
