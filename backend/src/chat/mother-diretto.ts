import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from '../config';
import { cercaFarmaci } from '../farmaci/cerca-farmaci';
import { ProntuarioService } from '../farmaci/prontuario.service';
import { GlossarioService } from '../terminologia/glossario.service';
import type { TraceMotore } from './archivio-chat';
import { righeDati, type EventoChat } from './evolus.client';
import { domandaSuParola, parolaNellaConversazione } from './domanda-su-parola';
import { FiltroFonti } from './filtro-fonti';
import { MotoreChat, type OpzioniChiedi } from './motore-chat';

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
  /** Alcuni server lo mandano nell'ultimo pezzo. */
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Gli strumenti del Mother agent descritti per il modello: cercaFarmaci (come la Web API "Referto-medicinali"
 * su Evolus) e cercaTermine (glossario medico a strati, per ora solo nel motore diretto).
 */
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
  {
    type: 'function',
    function: {
      name: 'cercaTermine',
      description:
        'Passa SOLO parole o sigle mediche del referto da spiegare (al massimo 10), scritte come nel referto: mai ' +
        'frasi o il testo del referto. Per ogni parola restituisce trovato e, se trovato, una definizione con fonte ' +
        'e link (glossario curato, HPO o Wikipedia in italiano).',
      parameters: {
        type: 'object',
        properties: {
          termini: {
            type: 'array',
            description: 'Parole o sigle mediche del referto, per esempio "consolidazione" o "colesterolo LDL".',
            items: { type: 'string' },
          },
        },
        required: ['termini'],
      },
    },
  },
];

/**
 * Un elenco negli argomenti di uno strumento. Il modello di riserva (DeepSeek-V4-Flash) a volte lo manda
 * come stringa con dentro il JSON ("[\"consolidazione\"]") o come parole separate da virgole.
 */
function elenco(valore: unknown): unknown[] {
  if (Array.isArray(valore)) return valore;
  if (typeof valore !== 'string' || !valore.trim()) return [];
  try {
    const letto: unknown = JSON.parse(valore);
    if (Array.isArray(letto)) return letto;
  } catch {
    // non è JSON: parole separate da virgole
  }
  return valore.split(/[,;\n]/).map((parte) => parte.trim()).filter(Boolean);
}

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
/** Risposta senza modello a «Cos'è…» su una parola che non c'è nel referto né nella conversazione. */
export const PAROLA_FUORI_DAL_REFERTO =
  'Mi dispiace, questa parola non compare nel referto che mi hai mandato: posso aiutarti solo a capire ' +
  "quello che c'è scritto lì. Se vuoi, chiedimi di un'altra parola del referto.";

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
 * Con MongoDB la storia della conversazione arriva dall'archivio (opzione
 * storia). Senza, le conversazioni restano in memoria per due ore (al massimo
 * 200): basta per le domande successive nel widget; un riavvio del server le perde.
 */
@Injectable()
export class MotherDiretto extends MotoreChat {
  readonly nome = 'diretto';
  // Solo esiti tecnici: mai il contenuto dei messaggi.
  private readonly logger = new Logger('MotherDiretto');
  private readonly conversazioni = new Map<string, { messaggi: Messaggio[]; aggiornata: number }>();
  private promptLetto: string | null = null;

  constructor(
    private readonly prontuario: ProntuarioService,
    private readonly glossario: GlossarioService,
  ) {
    super();
  }

  configurato(): boolean {
    return Boolean(config.modello.apiKey);
  }

  private prompt(): string {
    this.promptLetto ??= readFileSync(config.promptMother, 'utf8').trim();
    return this.promptLetto;
  }

  versione(): string {
    const prompt = createHash('sha256').update(this.prompt()).digest('hex').slice(0, 12);
    return `diretto/${config.modello.nome}/${prompt}`;
  }

  async *chiedi(
    messaggio: string,
    conversazione: string | undefined,
    segnale: AbortSignal,
    { storia, trace }: OpzioniChiedi = {},
  ): AsyncGenerator<EventoChat> {
    const inizio = Date.now();
    const id = conversazione && (storia || this.conversazioni.has(conversazione)) ? conversazione : randomUUID();
    // La storia dell'archivio vale più della memoria: sopravvive ai riavvii e alle istanze diverse di Vercel.
    const precedenti: Messaggio[] = storia
      ? storia.flatMap((turno): Messaggio[] => [
          { role: 'user', content: turno.domanda },
          { role: 'assistant', content: turno.risposta },
        ])
      : (this.conversazioni.get(id)?.messaggi ?? []);
    const nuovi: Messaggio[] = [{ role: 'user', content: messaggio }];
    // Solo dopo un referto: senza, una domanda su una parola è fuori tema e non serve il glossario.
    let obbligaTermine = precedenti.length > 0 && domandaSuParola(messaggio);

    // Una parola che non c'è nel referto né nella conversazione non si spiega: risposta fissa, senza modello.
    // Solo referto, domande e risposte: le definizioni restituite dagli strumenti non contano.
    const conversazioneFinora = precedenti.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => m.content ?? '');
    if (obbligaTermine && !parolaNellaConversazione(messaggio, conversazioneFinora)) {
      if (!storia) this.ricorda(id, [...precedenti, ...nuovi, { role: 'assistant', content: PAROLA_FUORI_DAL_REFERTO }]);
      this.logger.log('Domanda su una parola fuori dal referto: risposta fissa');
      yield { tipo: 'testo', testo: PAROLA_FUORI_DAL_REFERTO };
      yield { tipo: 'fine', conversazione: id };
      return;
    }

    let modello = config.modello.nome;
    let scritto = false;
    trace?.modelli_provati.push(modello);
    const filtro = new FiltroFonti();

    try {
      for (let giro = 1; giro <= MASSIMO_GIRI; giro += 1) {
        const messaggi: Messaggio[] = [{ role: 'system', content: this.prompt() }, ...precedenti, ...nuovi];
        let risposta: Response;
        if (trace) {
          trace.giri += 1;
          trace.modello = modello;
        }
        const obbligato = giro === 1 && obbligaTermine ? 'cercaTermine' : undefined;
        try {
          risposta = await this.richiesta(modello, messaggi, giro < MASSIMO_GIRI, segnale, obbligato);
        } catch (errore) {
          // Se il server non accetta lo strumento obbligato (tool_choice), si riprova lasciando scegliere il modello.
          if (obbligato && errore instanceof ErroreModello && errore.stato === 400) {
            this.logger.warn(`${modello} non accetta tool_choice: riprovo senza`);
            obbligaTermine = false;
            giro -= 1;
            continue;
          }
          // Modello sovraccarico prima di aver scritto qualcosa: si riprova una volta con il modello di riserva.
          if (errore instanceof ErroreModello && SOVRACCARICO.has(errore.stato) && !scritto && modello !== config.modello.riserva) {
            this.logger.warn(`${modello} ha risposto ${errore.message}: provo ${config.modello.riserva}`);
            modello = config.modello.riserva;
            trace?.modelli_provati.push(modello);
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
          if (trace && pezzo.usage) {
            trace.token_input = (trace.token_input ?? 0) + (pezzo.usage.prompt_tokens ?? 0);
            trace.token_output = (trace.token_output ?? 0) + (pezzo.usage.completion_tokens ?? 0);
          }
          const delta = pezzo.choices?.[0]?.delta;
          // Prima di chiamare uno strumento il modello a volte manda solo righe vuote: non vanno alla persona.
          const contenuto = scritto ? delta?.content : delta?.content?.trimStart();
          if (contenuto) {
            if (trace && !scritto) trace.primo_testo_ms = Date.now() - inizio;
            scritto = true;
            const daMandare = filtro.aggiungi(contenuto);
            testo += daMandare;
            if (daMandare) yield { tipo: 'testo', testo: daMandare };
          }
          for (const parte of delta?.tool_calls ?? []) {
            const chiamata = (chiamate[parte.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
            if (parte.id) chiamata.id = parte.id;
            if (parte.function?.name) chiamata.function.name += parte.function.name;
            if (parte.function?.arguments) chiamata.function.arguments += parte.function.arguments;
          }
        }

        if (chiamate.length === 0) {
          const resto = filtro.fine();
          if (resto) {
            testo += resto;
            yield { tipo: 'testo', testo: resto };
          }
          // Per esempio solo markup di chiamate a strumenti, tolto dal filtro: non è una risposta da salvare.
          if (!testo.trim()) {
            this.logger.warn(`${modello} non ha scritto una risposta dopo ${giro} giri`);
            if (trace) trace.errore = 'risposta vuota';
            yield { tipo: 'errore', messaggio: ERRORE_GENERICO };
            return;
          }
          if (!storia) this.ricorda(id, [...precedenti, ...nuovi, { role: 'assistant', content: testo }]);
          this.logger.log(`Risposta di ${modello} in ${Date.now() - inizio} ms (${giro} giri)`);
          yield { tipo: 'fine', conversazione: id };
          return;
        }
        nuovi.push({ role: 'assistant', content: testo || null, tool_calls: chiamate });
        for (const chiamata of chiamate) {
          const risultato = this.eseguiStrumento(chiamata, trace);
          filtro.ammettiDa(chiamata.function.name, risultato);
          nuovi.push({ role: 'tool', tool_call_id: chiamata.id, content: risultato });
        }
      }
      this.logger.warn(`Troppi giri di strumenti dopo ${Date.now() - inizio} ms`);
      if (trace) trace.errore = 'troppi giri di strumenti';
      yield { tipo: 'errore', messaggio: ERRORE_GENERICO };
    } catch (errore) {
      if (segnale.aborted) return;
      const sovraccarico = errore instanceof ErroreModello && SOVRACCARICO.has(errore.stato);
      this.logger.warn(`Modello ${modello} senza risposta dopo ${Date.now() - inizio} ms: ${(errore as Error).message}`);
      if (trace) trace.errore = (errore as Error).message;
      yield { tipo: 'errore', messaggio: sovraccarico ? ERRORE_SOVRACCARICO : ERRORE_GENERICO };
    }
  }

  private async richiesta(
    modello: string,
    messaggi: Messaggio[],
    conStrumenti: boolean,
    segnale: AbortSignal,
    obbligato?: string,
  ): Promise<Response> {
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
          ...(conStrumenti && obbligato ? { tool_choice: { type: 'function', function: { name: obbligato } } } : {}),
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

  /** Esegue lo strumento e, se c'è una trace, ne registra parametri, risultato e durata. */
  private eseguiStrumento(chiamata: ChiamataStrumento, trace?: TraceMotore): string {
    const inizio = Date.now();
    const risultato = this.strumento(chiamata);
    if (trace) {
      const leggi = (testo: string): unknown => {
        try {
          return JSON.parse(testo);
        } catch {
          return testo;
        }
      };
      const risposta = leggi(risultato) as { errore?: string };
      trace.chiamate_tool.push({
        nome: chiamata.function.name,
        parametri: leggi(chiamata.function.arguments || '{}'),
        risposta,
        durata_ms: Date.now() - inizio,
        ...(typeof risposta?.errore === 'string' ? { errore: risposta.errore } : {}),
      });
    }
    return risultato;
  }

  private strumento(chiamata: ChiamataStrumento): string {
    if (chiamata.function.name === 'cercaFarmaci') return this.cercaFarmaci(chiamata);
    if (chiamata.function.name === 'cercaTermine') return this.cercaTermine(chiamata);
    return JSON.stringify({ errore: 'Strumento sconosciuto' });
  }

  /** cercaTermine sul glossario in memoria: riceve solo parole o sigle, come la rotta /api/terminologia/cerca. */
  private cercaTermine(chiamata: ChiamataStrumento): string {
    try {
      const argomenti = JSON.parse(chiamata.function.arguments || '{}') as { termini?: unknown };
      const termini = elenco(argomenti.termini)
        .filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
        .slice(0, 10)
        .map((t) => t.slice(0, 80));
      if (termini.length === 0) return JSON.stringify({ errore: 'Nessun termine' });
      return JSON.stringify({ risultati: this.glossario.cerca(termini) });
    } catch {
      return JSON.stringify({ errore: 'Argomenti non validi' });
    }
  }

  /** cercaFarmaci sul prontuario in memoria: riceve solo i nomi dei farmaci, come la rotta /api/farmaci/cerca. */
  private cercaFarmaci(chiamata: ChiamataStrumento): string {
    try {
      const argomenti = JSON.parse(chiamata.function.arguments || '{}') as { farmaci?: unknown; limite_alternative?: unknown };
      const farmaci = (elenco(argomenti.farmaci) as Array<{ nome?: unknown; principio_attivo?: unknown }>)
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
