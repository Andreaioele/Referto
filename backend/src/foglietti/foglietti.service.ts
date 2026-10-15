import { BadGatewayException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EvolusClient } from '../chat/evolus.client';
import { ProntuarioService } from '../farmaci/prontuario.service';
import type { Prodotto } from '../farmaci/prontuario.types';
import { FONTE_FOGLIETTI, FogliettoNonDisponibile, type FonteFoglietti, type PdfFoglietto } from './fonte-foglietti';
import { scegliBrani, trovaSezioni, type Brano, type Foglio } from './sezioni';

/** Il foglio illustrativo di un farmaco del prontuario, con il testo di ogni pagina. */
export interface FogliettoLetto extends PdfFoglietto {
  farmaco: Prodotto;
}

export interface RispostaDomanda {
  /** Risposta in parole semplici, oppure la frase di riserva se il foglio non risponde. */
  risposta: string;
  /** Sezione del foglio da cui viene la risposta (null se non trovata). */
  sezione: number | null;
  trovata: boolean;
  /** "agente" se ha risposto il modello, "foglietto" se è il testo del foglio (riserva deterministica). */
  origine: 'agente' | 'foglietto' | 'nessuna';
  /** Brani del foglio dati all'agente: la fonte verificabile della risposta. */
  brani: Brano[];
}

const CODICE = /^\d{6}$/;
// Oltre questo tempo la persona riceve il brano del foglio invece della risposta dell'agente.
const ATTESA_AGENTE_MS = 75_000;
const CHIUSURA_AGENTE = /Questa è una spiegazione automatica[\s\S]*$/;
export const NON_TROVATA = 'Non ho trovato questa informazione nel foglietto. Puoi chiedere al medico o al farmacista.';

/**
 * Fogli illustrativi ufficiali AIFA: sezioni e risposte alle domande. Il PDF
 * arriva dalla fonte dei foglietti (`FONTE_FOGLIETTI`, in produzione AIFA). La risposta dell'agente usa solo i brani
 * del foglio scelti qui in modo deterministico e deve dire da quale sezione
 * viene; se l'agente non risponde, si mostra il brano stesso.
 */
@Injectable()
export class FogliettiService {
  // Solo esiti tecnici: mai le domande o le risposte.
  private readonly logger = new Logger('Foglietti');

  constructor(
    private readonly prontuario: ProntuarioService,
    private readonly evolus: EvolusClient,
    @Inject(FONTE_FOGLIETTI) private readonly fonte: FonteFoglietti,
  ) {}

  /** Il foglio illustrativo del farmaco AIFA `cod`: 404 se il codice non è nel prontuario, 502 se la fonte non lo dà. */
  async foglietto(cod: string): Promise<FogliettoLetto> {
    const farmaco = CODICE.test(cod) ? this.prontuario.farmaco(cod) : null;
    if (!farmaco) throw new NotFoundException(`Nessun farmaco AIFA con codice ${cod}`);
    try {
      return { farmaco, ...(await this.fonte.leggi(farmaco)) };
    } catch (errore) {
      if (errore instanceof FogliettoNonDisponibile) {
        throw new BadGatewayException('Il foglietto illustrativo non è disponibile in questo momento.');
      }
      throw errore;
    }
  }

  /** Il foglio della formulazione `forma` (un PDF AIFA può contenerne più di uno), diviso in sezioni. */
  async foglio(cod: string, forma = ''): Promise<FogliettoLetto & Foglio> {
    const letto = await this.foglietto(cod);
    return { ...letto, ...trovaSezioni(letto.testo, forma) };
  }

  async domanda(cod: string, domanda: string, forma = ''): Promise<RispostaDomanda> {
    const { farmaco, sezioni } = await this.foglio(cod, forma);
    const brani = scegliBrani(sezioni, domanda, farmaco.nome);
    if (brani.length === 0) return { risposta: NON_TROVATA, sezione: null, trovata: false, origine: 'nessuna', brani };

    const testo = await this.chiediAgente(messaggioAgente(farmaco, domanda, brani));
    if (testo === null) {
      // Riserva deterministica: il brano più pertinente, così come è scritto nel foglio.
      return {
        risposta: `Ecco cosa dice il foglietto nella sezione ${brani[0].sezione}: ${brani[0].testo}`,
        sezione: brani[0].sezione,
        trovata: true,
        origine: 'foglietto',
        brani,
      };
    }
    return { ...interpreta(testo, brani), brani };
  }

  /**
   * Testo completo della risposta dell'agente, o null se non è configurato, dà
   * errore o non finisce entro ATTESA_AGENTE_MS: in quei casi si usa la riserva.
   */
  private async chiediAgente(messaggio: string): Promise<string | null> {
    if (!this.evolus.configurato()) return null;
    const inizio = Date.now();
    let testo = '';
    try {
      for await (const evento of this.evolus.chiedi(messaggio, undefined, AbortSignal.timeout(ATTESA_AGENTE_MS))) {
        if (evento.tipo === 'testo') testo += evento.testo;
        else if (evento.tipo === 'errore') return null;
      }
    } catch (errore) {
      this.logger.warn(`Agente senza risposta dopo ${Math.round((Date.now() - inizio) / 1000)}s: ${(errore as Error).name}`);
      return null;
    }
    return testo.trim() || null;
  }
}

/** Messaggio per il Mother agent: la domanda e i soli brani del foglio da usare. */
export function messaggioAgente(farmaco: Prodotto, domanda: string, brani: Brano[]): string {
  const parti = brani.map((brano) => `[SEZIONE ${brano.sezione} · ${brano.titolo}]\n${brano.testo}`).join('\n\n');
  return [
    'DOMANDA SU UN FOGLIO ILLUSTRATIVO (non è un referto: non scrivere la riga ARGOMENTO né le sezioni del referto).',
    `Farmaco: ${farmaco.nome} (${farmaco.principio_attivo}). Fonte: foglio illustrativo ufficiale AIFA.`,
    `Domanda della persona: ${domanda}`,
    '',
    'Parti del foglio illustrativo da usare (unica fonte ammessa):',
    parti,
    '',
    'Come rispondere: in italiano semplice, da 2 a 4 frasi brevi, senza titoli, elenchi o Markdown. ' +
      'Usa solo ciò che è scritto in queste parti, senza aggiungere altro. Non iniziare con "sì" o "no": ' +
      'non dai permessi, riporti il foglio. Dosi e istruzioni si riportano ' +
      'attribuite al foglio ("Il foglietto dice che..."). Se la domanda riguarda la situazione personale ' +
      '(se prenderlo, se preoccuparsi, se va bene con un altro farmaco), riporta cosa dice il foglio e ricorda ' +
      'che decide il medico o il farmacista. L\'ultima riga deve essere "SEZIONE: <numero>" con il numero della ' +
      'parte usata. Se queste parti non rispondono alla domanda, scrivi soltanto: NON_TROVATO',
  ].join('\n');
}

/**
 * Controllo deterministico della risposta dell'agente: la sezione citata deve
 * essere tra quelle date; altrimenti si usa quella del brano più pertinente.
 */
export function interpreta(testo: string, brani: Brano[]): Omit<RispostaDomanda, 'brani'> {
  if (/NON_TROVATO/.test(testo)) return { risposta: NON_TROVATA, sezione: null, trovata: false, origine: 'nessuna' };
  const citazioni = [...testo.matchAll(/SEZIONE:\s*(\d)/gi)].map((trovata) => Number(trovata[1]));
  const citata = citazioni.at(-1);
  const sezione = citata && brani.some((brano) => brano.sezione === citata) ? citata : brani[0].sezione;
  const risposta = testo
    .replace(/^\s*SEZIONE:\s*\d.*$/gim, '')
    .replace(CHIUSURA_AGENTE, '')
    .replace(/^ARGOMENTO:.*$/m, '')
    .trim();
  return { risposta, sezione, trovata: true, origine: 'agente' };
}
