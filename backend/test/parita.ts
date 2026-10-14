import { join } from 'node:path';
import { PercorsiDati, ProntuarioService } from '../src/farmaci/prontuario.service';

/** Un caso generato da scripts/casi_parita.py con farmaci_referti.lookup(). */
export interface CasoParita {
  nome: string;
  principio_attivo_richiesto: string;
  trovato: boolean;
  principio_attivo?: string;
  atc?: string;
  corrispondenza?: string;
  perche?: string;
  farmaco?: string | null;
  alternative?: string[];
  alternative_totali?: number;
}

const DATI = join(__dirname, '..', 'data');

export const PERCORSI: PercorsiDati = {
  prontuario: join(DATI, 'aifa_farmaci.json'),
  normalizzazione: join(DATI, 'normalizzazione.json'),
  atc: join(DATI, 'atc.json'),
};

/** Lo stesso caso calcolato dal servizio, nella forma di casi_parita.py. */
export function esitoServizio(servizio: ProntuarioService, caso: CasoParita): CasoParita {
  const esito = servizio.cerca(caso.nome, caso.principio_attivo_richiesto, 5);
  if (!esito) {
    return { nome: caso.nome, principio_attivo_richiesto: caso.principio_attivo_richiesto, trovato: false };
  }
  return {
    nome: caso.nome,
    principio_attivo_richiesto: caso.principio_attivo_richiesto,
    trovato: true,
    principio_attivo: esito.principio_attivo,
    atc: esito.atc,
    corrispondenza: esito.corrispondenza,
    perche: esito.perche,
    farmaco: esito.farmaco ? esito.farmaco.cod : null,
    alternative: esito.alternative.map((prodotto) => prodotto.cod),
    alternative_totali: esito.alternative_totali,
  };
}
