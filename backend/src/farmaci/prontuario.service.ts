import { Inject, Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { Normalizzatore, normalizza, parole, type DatiNormalizzazione } from './normalizzazione';
import type {
  Corrispondenza,
  EsitoRicerca,
  FarmacoAifa,
  FileAtc,
  FileProntuario,
  Prodotto,
} from './prontuario.types';

export const PERCORSI_DATI = Symbol('PERCORSI_DATI');

export interface PercorsiDati {
  prontuario: string;
  normalizzazione: string;
  atc: string;
}

const IMPORTAZIONE_PARALLELA = 'Importazione Parallela';
// Livelli ATC mostrati come categoria: gruppo anatomico, terapeutico,
// farmacologico e chimico. Il livello 7 è la sostanza stessa e non serve.
const LIVELLI_CATEGORIA = [1, 3, 4, 5];

/**
 * Prontuario AIFA in memoria e ricerca deterministica di un farmaco per nome.
 *
 * `cerca()` riproduce lookup() di farmaci_referti.py: collega un nome a UN
 * farmaco AIFA solo se la corrispondenza è univoca, altrimenti restituisce le
 * alternative senza scegliere. Nessun modello, nessuna ricerca semantica.
 */
@Injectable()
export class ProntuarioService {
  private readonly prontuario: FileProntuario;
  private readonly atc: FileAtc;
  private readonly normalizzatore: Normalizzatore;
  private readonly perCodice = new Map<string, FarmacoAifa>();
  private readonly perPrincipioAttivo = new Map<string, string[]>();
  private readonly perNomeCommerciale = new Map<string, string[]>();

  constructor(@Inject(PERCORSI_DATI) percorsi: PercorsiDati) {
    this.prontuario = leggiJson<FileProntuario>(percorsi.prontuario);
    this.atc = leggiJson<FileAtc>(percorsi.atc);
    this.normalizzatore = new Normalizzatore(leggiJson<DatiNormalizzazione>(percorsi.normalizzazione));

    for (const farmaco of this.prontuario.drugs) {
      this.perCodice.set(farmaco.cod, farmaco);
      const componenti = farmaco.pa
        .split('/')
        .filter((componente) => componente.trim() && componente.trim() !== 'N.D.');
      const chiave = componenti
        .flatMap((componente) => this.normalizzatore.chiaviComponente(componente).slice(-1))
        .sort()
        .join('+');
      if (chiave) aggiungi(this.perPrincipioAttivo, chiave, farmaco.cod);
      aggiungi(this.perNomeCommerciale, normalizza(farmaco.nome), farmaco.cod);
    }
  }

  info(): { fonte: string; aggiornato: string; farmaci: number; codici_atc: number } {
    return {
      fonte: this.prontuario.source,
      aggiornato: this.prontuario.built_on,
      farmaci: this.perCodice.size,
      codici_atc: Object.keys(this.atc.codici).length,
    };
  }

  /** Un farmaco del prontuario per codice AIFA (COD_FARMACO), con la sua categoria ATC. */
  farmaco(cod: string): (Prodotto & { categoria: string[] }) | null {
    const farmaco = this.perCodice.get(cod);
    return farmaco ? { ...this.prodotto(farmaco), categoria: this.categoria(farmaco.atc) } : null;
  }

  /**
   * Collega il nome di un farmaco scritto nel referto al prontuario AIFA.
   * `principioAttivo` è quello indicato dall'agente, se lo conosce.
   * Restituisce null se il nome non corrisponde a nessun farmaco.
   */
  cerca(nome: string, principioAttivo = '', limiteAlternative = 5): EsitoRicerca | null {
    let [nomeTrovato, farmaci] = this.candidatiNomeCommerciale(nome);
    let alias = '';
    let tipo: 'nome commerciale' | 'principio attivo' = 'nome commerciale';
    if (farmaci.length === 0) {
      [alias, farmaci] = this.candidatiPrincipioAttivo(nome, principioAttivo);
      tipo = 'principio attivo';
    }
    if (farmaci.length === 0) return null;

    farmaci = [...farmaci].sort(confrontaNomeDitta);
    const etichetta = this.normalizzatore.etichettaPrincipioAttivo(farmaci[0].pa);
    const prodotti = farmaci.map((farmaco) => this.prodotto(farmaco));
    const categoria = this.categoria(farmaci[0].atc);

    let farmaco: Prodotto | null = null;
    let corrispondenza: Corrispondenza = 'da scegliere';
    let perche = '';
    if (farmaci.length === 1) {
      farmaco = prodotti[0];
      corrispondenza = tipo === 'nome commerciale' ? 'nome commerciale' : 'unico con questo principio attivo';
    } else if (tipo === 'nome commerciale') {
      perche =
        `In Italia ci sono ${farmaci.length} farmaci di ditte diverse che si chiamano così: ` +
        'scegli quello della tua confezione (la ditta è scritta sulla scatola).';
    } else if (alias) {
      perche =
        `Nel referto è scritto «${nome}», un nome (inglese o estero) che non indica un ` +
        `farmaco preciso in Italia. Il principio attivo è ${etichetta}: scegli il ` +
        'farmaco che usi per leggere il suo foglietto.';
    } else {
      perche =
        `Nel referto c'è il principio attivo (${etichetta}), non il nome del farmaco. ` +
        `In Italia ci sono ${farmaci.length} farmaci con questo principio attivo: scegli quello che usi.`;
    }

    return {
      principio_attivo: etichetta,
      atc: farmaci[0].atc,
      categoria,
      descrizione: descrizione(corrispondenza, farmaco, nomeTrovato || nome, etichetta, categoria),
      farmaco,
      corrispondenza,
      perche,
      alternative: prodotti.slice(0, limiteAlternative),
      alternative_totali: prodotti.length,
    };
  }

  /**
   * Nome commerciale italiano scritto nel referto, anche seguito dal dosaggio
   * ("Brufen 600 mg" -> BRUFEN). Restituisce [nome trovato, farmaci con quel nome].
   */
  private candidatiNomeCommerciale(nome: string): [string, FarmacoAifa[]] {
    const elenco = parole(normalizza(nome));
    for (let lunghezza = elenco.length; lunghezza > 0; lunghezza--) {
      if (!/^[a-z]+$/.test(elenco[lunghezza - 1])) continue;
      const nomeCommerciale = elenco.slice(0, lunghezza).join(' ');
      const codici = this.perNomeCommerciale.get(nomeCommerciale);
      if (!codici) continue;
      const farmaci = this.senzaImportazioniParallele(codici);
      // Un farmaco che si chiama come il suo principio attivo (es. "LORAZEPAM")
      // è un generico: il nome non identifica il prodotto.
      const generici = farmaci.every(
        (farmaco) => normalizza(this.normalizzatore.etichettaPrincipioAttivo(farmaco.pa)) === nomeCommerciale,
      );
      return generici ? ['', []] : [nomeCommerciale, farmaci];
    }
    return ['', []];
  }

  /** Farmaci con il principio attivo indicato o scritto. Restituisce [alias usato, farmaci]. */
  private candidatiPrincipioAttivo(nome: string, principioAttivo: string): [string, FarmacoAifa[]] {
    for (const testo of [principioAttivo, nome]) {
      if (!testo) continue;
      const alias = this.normalizzatore.aliasDi(testo);
      for (const richiesta of [alias, testo].filter(Boolean)) {
        const codici = this.perPrincipioAttivo.get(this.normalizzatore.chiavePrincipioAttivo(richiesta));
        if (codici) return [richiesta === alias ? alias : '', this.senzaImportazioniParallele(codici)];
      }
    }
    return ['', []];
  }

  /**
   * Farmaci di riferimento: le importazioni parallele sono copie dello stesso
   * medicinale di un'altra ditta e renderebbero ambiguo il nome.
   */
  private senzaImportazioniParallele(codici: string[]): FarmacoAifa[] {
    const farmaci = codici.map((cod) => this.perCodice.get(cod) as FarmacoAifa);
    const riferimento = farmaci.filter((farmaco) => farmaco.procedura !== IMPORTAZIONE_PARALLELA);
    return riferimento.length > 0 ? riferimento : farmaci;
  }

  private prodotto(farmaco: FarmacoAifa): Prodotto {
    const link = (tipo: 'FI' | 'RCP') =>
      this.prontuario.link_template
        .replace('{ditta}', farmaco.cod_ditta)
        .replace('{farmaco}', String(Number.parseInt(farmaco.cod, 10)))
        .replace('{tipo}', tipo);
    return {
      cod: farmaco.cod,
      nome: farmaco.nome,
      ditta: farmaco.ditta,
      principio_attivo: this.normalizzatore.etichettaPrincipioAttivo(farmaco.pa),
      atc: farmaco.atc,
      forme: farmaco.forme,
      fornitura: farmaco.fornitura,
      confezioni: farmaco.confezioni,
      n_confezioni: farmaco.n_confezioni,
      foglietto_url: link('FI'),
      rcp_url: link('RCP'),
    };
  }

  /** Descrizioni ATC dal gruppo anatomico al farmacologico, senza ripetizioni. */
  private categoria(codiceAtc: string): string[] {
    const descrizioni: string[] = [];
    for (const livello of LIVELLI_CATEGORIA) {
      const descrizione = codiceAtc.length >= livello ? this.atc.codici[codiceAtc.slice(0, livello)] : undefined;
      if (descrizione && !descrizioni.includes(testoAtc(descrizione))) descrizioni.push(testoAtc(descrizione));
    }
    return descrizioni;
  }
}

/**
 * Frase pronta per l'agente: dice che cos'è il farmaco con i soli dati AIFA,
 * senza dosi, indicazioni o consigli.
 */
function descrizione(
  corrispondenza: Corrispondenza,
  farmaco: Prodotto | null,
  nome: string,
  principioAttivo: string,
  categoria: string[],
): string {
  let frase: string;
  if (farmaco && corrispondenza === 'nome commerciale') {
    frase = `${maiuscolaIniziale(farmaco.nome)} è un medicinale che contiene ${principioAttivo}.`;
  } else if (farmaco) {
    frase = `${maiuscolaIniziale(principioAttivo)} è il principio attivo di ${maiuscolaIniziale(farmaco.nome)}, l'unico medicinale che lo contiene in Italia.`;
  } else {
    frase = `${maiuscolaIniziale(nome)} corrisponde al principio attivo ${principioAttivo}.`;
  }
  // Gruppo terapeutico e gruppo più specifico, es. "antitrombotici: antiaggreganti piastrinici".
  const gruppi = categoria.slice(1);
  if (gruppi.length > 0) {
    const [terapeutico, ...altri] = gruppi;
    const specifico = altri.at(-1);
    frase += ` Categoria (classificazione ATC): ${terapeutico}${specifico ? `, ${specifico}` : ''}.`;
  }
  return frase;
}

/** "ANTIAGGREGANTI PIASTRINICI, ESCLUSA L'EPARINA" -> minuscolo, conservando sigle come "(ACE)". */
function testoAtc(descrizione: string): string {
  return descrizione
    .split(/(\([A-Z0-9 -]{2,10}\))/)
    .map((pezzo, indice) => (indice % 2 === 1 ? pezzo : pezzo.toLowerCase()))
    .join('');
}

function maiuscolaIniziale(testo: string): string {
  const minuscolo = testo.toLowerCase();
  return minuscolo.charAt(0).toUpperCase() + minuscolo.slice(1);
}

/** Ordine di sorted(key=(nome, ditta)) in Python: confronto per codice carattere, non per lingua. */
function confrontaNomeDitta(a: FarmacoAifa, b: FarmacoAifa): number {
  if (a.nome !== b.nome) return a.nome < b.nome ? -1 : 1;
  if (a.ditta !== b.ditta) return a.ditta < b.ditta ? -1 : 1;
  return 0;
}

function aggiungi(indice: Map<string, string[]>, chiave: string, cod: string): void {
  const elenco = indice.get(chiave);
  if (elenco) elenco.push(cod);
  else indice.set(chiave, [cod]);
}

function leggiJson<T>(percorso: string): T {
  return JSON.parse(readFileSync(percorso, 'utf-8')) as T;
}
