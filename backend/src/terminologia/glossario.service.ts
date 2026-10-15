import { Inject, Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { normalizza, radice } from './testo';

export const FILE_GLOSSARIO = Symbol('FILE_GLOSSARIO');

/** Una voce del glossario: definizione già pronta, con la sua fonte. */
export interface VoceGlossario {
  nome: string;
  definizione: string;
  /** "it", oppure "en" per le definizioni HPO non tradotte. */
  lingua: string;
  fonte: string;
  url: string | null;
  strato: 'curato' | 'hpo' | 'wikidata';
}

/** backend/data/glossario_medico.json, generato da resources/glossario/costruisci_glossario_strati.py --backend. */
interface FileGlossario {
  fonti: Record<string, string>;
  creato: string;
  voci: Record<string, VoceGlossario>;
  /** Chiave (parole normalizzate e ridotte alla radice) → id della voce. */
  indice: Record<string, string>;
  /** Parole comuni che da sole non valgono come termine anche se hanno la radice di uno ("stato" non è STAT). */
  escluse: string[];
}

export interface EsitoTermine {
  richiesto: string;
  trovato: boolean;
  termine?: string;
  definizione?: string;
  lingua?: string;
  fonte?: string;
  url?: string | null;
}

export interface TermineNelTesto {
  /** Le parole del testo, normalizzate, che corrispondono al termine. */
  parole: string;
  id: string;
  voce: VoceGlossario;
}

const MAX_PAROLE = 6;

/**
 * Glossario medico a strati (termini curati, HPO, Wikidata con le frasi di Wikipedia) e ricerca
 * deterministica: nessun modello decide che cosa significa una parola.
 */
@Injectable()
export class GlossarioService {
  private readonly dati: FileGlossario;
  private readonly escluse: Set<string>;

  constructor(@Inject(FILE_GLOSSARIO) file: string) {
    this.dati = JSON.parse(readFileSync(file, 'utf8')) as FileGlossario;
    this.escluse = new Set(this.dati.escluse);
  }

  get creato(): string {
    return this.dati.creato;
  }

  get numeroVoci(): number {
    return Object.keys(this.dati.voci).length;
  }

  /**
   * Termini nel testo, in ordine e senza ripetizioni: in ogni punto vince la corrispondenza più lunga
   * (fino a 6 parole), così "versamento pleurico" vince su "versamento".
   */
  trovaNelTesto(testo: string, limite = Infinity): TermineNelTesto[] {
    const parole = normalizza(testo).split(' ').filter(Boolean);
    const radici = parole.map(radice);
    const trovati = new Map<string, TermineNelTesto>();
    for (let i = 0; i < radici.length && trovati.size < limite; ) {
      let passo = 1;
      for (let lunghezza = Math.min(MAX_PAROLE, radici.length - i); lunghezza > 0; lunghezza--) {
        const id = this.dati.indice[radici.slice(i, i + lunghezza).join(' ')];
        if (!id) continue;
        const voce = this.dati.voci[id];
        // Una parola comune che ha solo la radice in comune con un termine non conta.
        if (lunghezza === 1 && voce.strato !== 'curato' && this.escluse.has(parole[i])) continue;
        if (!trovati.has(id)) trovati.set(id, { parole: parole.slice(i, i + lunghezza).join(' '), id, voce });
        passo = lunghezza;
        break;
      }
      i += passo;
    }
    return [...trovati.values()];
  }

  /** Per ogni termine richiesto (una parola o sigla del referto): la voce che lo spiega, se c'è. */
  cerca(termini: string[]): EsitoTermine[] {
    return termini.map((richiesto) => {
      // Il primo termine del glossario nel testo richiesto, il più lungo possibile ("consolidazione focale" → consolidazione).
      const voce = this.trovaNelTesto(richiesto, 1)[0]?.voce;
      if (!voce) return { richiesto, trovato: false };
      return {
        richiesto,
        trovato: true,
        termine: voce.nome,
        definizione: voce.definizione,
        lingua: voce.lingua,
        fonte: voce.fonte,
        url: voce.url,
      };
    });
  }
}
