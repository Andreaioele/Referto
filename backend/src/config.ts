import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * File in backend/data/, cercato dove lo mettono i vari modi di avvio:
 * - process.cwd()/data: avvio dalla cartella backend/ (npm, Docker, progetto Vercel con Root Directory backend);
 * - process.cwd()/backend/data: funzione di Vercel Services, che ricrea i percorsi dalla radice del repository;
 * - __dirname/../data: avvio da un'altra cartella (src/ o dist/ -> ..).
 */
function fileDati(nome: string): string {
  const candidati = [
    join(process.cwd(), 'data', nome),
    join(process.cwd(), 'backend', 'data', nome),
    join(__dirname, '..', 'data', nome),
  ];
  return candidati.find((percorso) => existsSync(percorso)) ?? candidati[candidati.length - 1];
}

/** Percorsi dei dati e impostazioni, sovrascrivibili con variabili d'ambiente. */
export const config = {
  porta: Number(process.env.PORT ?? 3000),
  /** Se vuota il backend non chiede la chiave (solo per lo sviluppo locale). */
  chiaveApi: process.env.CHIAVE_API ?? '',
  prontuario: process.env.PRONTUARIO_FILE ?? fileDati('aifa_farmaci.json'),
  normalizzazione: process.env.NORMALIZZAZIONE_FILE ?? fileDati('normalizzazione.json'),
  atc: process.env.ATC_FILE ?? fileDati('atc.json'),
};
