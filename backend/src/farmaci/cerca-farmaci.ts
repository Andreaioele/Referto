import type { RispostaCercaDto, RisultatoDto } from './dto/risposte.dto';
import type { ProntuarioService } from './prontuario.service';

/**
 * Ricerca di più farmaci nel prontuario: la usano la rotta POST /api/farmaci/cerca
 * (Web API degli agenti Evolus) e lo strumento cercaFarmaci del Mother agent
 * ricostruito nel backend (src/chat/mother-diretto.ts).
 */
export function cercaFarmaci(
  prontuario: ProntuarioService,
  farmaci: Array<{ nome: string; principio_attivo?: string }>,
  limiteAlternative = 5,
): RispostaCercaDto {
  const risultati: RisultatoDto[] = farmaci.map(({ nome, principio_attivo }) => {
    const esito = prontuario.cerca(nome, principio_attivo ?? '', limiteAlternative);
    return esito ? { nome, trovato: true, ...esito } : { nome, trovato: false };
  });
  const { fonte, aggiornato } = prontuario.info();
  return { fonte: { fonte, aggiornato }, risultati };
}
