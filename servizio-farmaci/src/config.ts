import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// servizio-farmaci/src (o dist) -> radice del repository, dove vive farmaci/.
const RADICE_REPO = resolve(__dirname, '..', '..');

/**
 * Primo file esistente tra: data/ del servizio (copia fatta da `npm run
 * copia-dati`, usata su Vercel) e farmaci/ nella radice del repository
 * (sviluppo locale e Docker). process.cwd() è la cartella del servizio sia in
 * locale sia nella funzione Vercel.
 */
function fileDati(nome: string): string {
  const candidati = [
    join(process.cwd(), 'data', nome),
    join(__dirname, '..', 'data', nome),
    join(RADICE_REPO, 'farmaci', nome),
  ];
  return candidati.find((percorso) => existsSync(percorso)) ?? candidati[candidati.length - 1];
}

/** Percorsi dei dati e impostazioni, sovrascrivibili con variabili d'ambiente. */
export const config = {
  porta: Number(process.env.PORT ?? 3000),
  /** Se vuota il servizio non chiede la chiave (solo per lo sviluppo locale). */
  chiaveApi: process.env.CHIAVE_API ?? '',
  prontuario: process.env.PRONTUARIO_FILE ?? fileDati('aifa_farmaci.json'),
  normalizzazione: process.env.NORMALIZZAZIONE_FILE ?? fileDati('normalizzazione.json'),
  atc: process.env.ATC_FILE ?? fileDati('atc.json'),
};
