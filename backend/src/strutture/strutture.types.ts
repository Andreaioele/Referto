import type { TipoStruttura } from './aree';

/** Un luogo dove andare (o un medico con il suo ambulatorio) in data/strutture-milano.json. */
export interface Struttura {
  id: string;
  tipo: TipoStruttura;
  /** Nome leggibile: "Ospedale Niguarda", "Dott.ssa Sara Rossi". */
  nome: string;
  /** Aree (id di AREE) di cui la struttura si occupa dichiaratamente. */
  aree: string[];
  /** Professione, quando non è un medico (studi di fisioterapisti, psicoterapeuti). */
  professione?: string;
  /** Reparti di degenza, come li scrive il Ministero (solo ospedali e case di cura). */
  reparti?: string[];
  indirizzo: string;
  cap?: string;
  /** Municipio di Milano (1-9). */
  municipio?: string;
  /** Quartiere (NIL). */
  quartiere?: string;
  lat: number;
  lon: number;
  telefono?: string;
  sito?: string;
  orari?: string;
  /** Altri ambulatori dello stesso medico. */
  altreSedi?: Array<{ indirizzo: string; lat: number; lon: number }>;
  fonte: 'comune-milano' | 'openstreetmap' | 'overture';
}

export interface FileStrutture {
  citta: string;
  generato: string;
  fonti: Array<{ nome: string; url: string; licenza: string; aggiornato?: string }>;
  strutture: Struttura[];
}
