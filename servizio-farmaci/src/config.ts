import { join, resolve } from 'node:path';

// servizio-farmaci/src (o dist) -> radice del repository, dove vive farmaci/.
const RADICE_REPO = resolve(__dirname, '..', '..');

/** Percorsi dei dati e impostazioni, sovrascrivibili con variabili d'ambiente. */
export const config = {
  porta: Number(process.env.PORT ?? 3000),
  /** Se vuota il servizio non chiede la chiave (solo per lo sviluppo locale). */
  chiaveApi: process.env.CHIAVE_API ?? '',
  prontuario: process.env.PRONTUARIO_FILE ?? join(RADICE_REPO, 'farmaci', 'aifa_farmaci.json'),
  normalizzazione:
    process.env.NORMALIZZAZIONE_FILE ?? join(RADICE_REPO, 'farmaci', 'normalizzazione.json'),
  atc: process.env.ATC_FILE ?? join(__dirname, '..', 'data', 'atc.json'),
};
