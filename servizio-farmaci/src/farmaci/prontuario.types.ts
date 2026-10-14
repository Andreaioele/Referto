/** Un farmaco di farmaci/aifa_farmaci.json (generato da farmaci/build_aifa_index.py). */
export interface FarmacoAifa {
  cod: string;
  nome: string;
  ditta: string;
  cod_ditta: string;
  pa: string;
  atc: string;
  procedura: string;
  forme: string[];
  fornitura: string;
  confezioni: string[];
  n_confezioni: number;
}

export interface FileProntuario {
  source: string;
  source_url: string;
  built_on: string;
  link_template: string;
  drugs: FarmacoAifa[];
}

export interface FileAtc {
  fonte: string;
  generato: string;
  codici: Record<string, string>;
}

export type Corrispondenza =
  | 'nome commerciale'
  | 'unico con questo principio attivo'
  | 'da scegliere';

/** Farmaco come lo restituisce il servizio (stessi campi di _product_view in farmaci_referti.py). */
export interface Prodotto {
  cod: string;
  nome: string;
  ditta: string;
  principio_attivo: string;
  atc: string;
  forme: string[];
  fornitura: string;
  confezioni: string[];
  n_confezioni: number;
  foglietto_url: string;
  rcp_url: string;
}

/** Esito di lookup() in farmaci_referti.py, più categoria e descrizione pronte per l'agente. */
export interface EsitoRicerca {
  principio_attivo: string;
  atc: string;
  categoria: string[];
  descrizione: string;
  farmaco: Prodotto | null;
  corrispondenza: Corrispondenza;
  perche: string;
  alternative: Prodotto[];
  alternative_totali: number;
}
