import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * File in backend/data/. process.cwd() è la cartella del backend sia in locale
 * sia nella funzione Vercel (Vercel include i file letti da lì); __dirname copre
 * l'avvio da un'altra cartella (src/ o dist/ -> ..).
 */
function fileDati(nome: string): string {
  const candidati = [join(process.cwd(), 'data', nome), join(__dirname, '..', 'data', nome)];
  return candidati.find((percorso) => existsSync(percorso)) ?? candidati[1];
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
