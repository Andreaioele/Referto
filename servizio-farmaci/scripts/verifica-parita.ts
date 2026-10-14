/**
 * Confronta il servizio con farmaci_referti.lookup() su un file generato da
 * scripts/casi_parita.py (di solito con --tutti, cioè su tutti i nomi del prontuario).
 *
 *   npm run parita:tutti
 */
import { readFileSync } from 'node:fs';
import { ProntuarioService } from '../src/farmaci/prontuario.service';
import { CasoParita, esitoServizio, PERCORSI } from '../test/parita';

function main(): void {
  const file = process.argv[2];
  if (!file) throw new Error('Uso: ts-node scripts/verifica-parita.ts FILE.json');
  const casi = JSON.parse(readFileSync(file, 'utf-8')) as CasoParita[];
  const servizio = new ProntuarioService(PERCORSI);
  const diversi = casi.filter(
    (caso) => JSON.stringify(esitoServizio(servizio, caso)) !== JSON.stringify(caso),
  );
  for (const caso of diversi.slice(0, 20)) {
    console.log('Python:    ', JSON.stringify(caso));
    console.log('TypeScript:', JSON.stringify(esitoServizio(servizio, caso)));
  }
  console.log(`${casi.length - diversi.length}/${casi.length} casi uguali`);
  if (diversi.length > 0) process.exitCode = 1;
}

main();
