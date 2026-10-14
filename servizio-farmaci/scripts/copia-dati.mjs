/**
 * Copia in data/ i dati condivisi che stanno in ../farmaci/, per le piattaforme
 * che pubblicano solo la cartella servizio-farmaci/ (Vercel con Root Directory).
 * Le copie sono escluse da Git: la fonte resta farmaci/ nella radice del repo.
 *
 *   npm run copia-dati
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const servizio = join(dirname(fileURLToPath(import.meta.url)), '..');
const sorgente = join(servizio, '..', 'farmaci');
const destinazione = join(servizio, 'data');

mkdirSync(destinazione, { recursive: true });
for (const nome of ['aifa_farmaci.json', 'normalizzazione.json']) {
  const file = join(sorgente, nome);
  if (!existsSync(file)) {
    throw new Error(`${file} non trovato: su Vercel attiva "Include files outside the Root Directory"`);
  }
  copyFileSync(file, join(destinazione, nome));
  console.log(`${nome} -> data/`);
}
