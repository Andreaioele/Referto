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
  /** Strutture sanitarie di Milano (scripts/costruisci-strutture.ts). */
  strutture: process.env.STRUTTURE_FILE ?? fileDati('strutture-milano.json'),
  /** Glossario medico a strati per cercaTermine (resources/glossario/costruisci_glossario_strati.py --backend). */
  glossario: process.env.GLOSSARIO_FILE ?? fileDati('glossario_medico.json'),
  /** Mother agent di Evolus a cui il backend inoltra i messaggi della chat. Credenziali solo lato server. */
  evolus: {
    apiBase: process.env.EVOLUS_API_BASE ?? 'https://api.evolus.ai/api/v1',
    apiKey: process.env.EVOLUS_API_KEY ?? '',
    applicationId: process.env.EVOLUS_APPLICATION_ID ?? '',
    agentId: process.env.EVOLUS_AGENT_ID ?? '85b39c17-6e3e-46a6-9f1c-c4c13c68cc77',
  },
  /**
   * Chi risponde alla chat e alle domande sui foglietti: "evolus" (il Mother
   * agent sulla piattaforma Evolus) oppure "diretto" (lo stesso agente
   * ricostruito qui, che chiama il modello su AMD Token Factory).
   */
  motoreChat: (process.env.MOTORE_CHAT === 'diretto' ? 'diretto' : 'evolus') as 'diretto' | 'evolus',
  /** Modello chiamato direttamente (API compatibile OpenAI). Chiave solo lato server. */
  modello: {
    apiBase: process.env.MODELLO_API_BASE ?? 'https://developer.amd.com.cn/radeon/api/v1',
    apiKey: process.env.RADEON_API_KEY ?? '',
    /** Lo stesso modello del Mother agent su Evolus (modelKey own/deepseek-v4.1-flash). */
    nome: process.env.MODELLO_MOTHER ?? 'DeepSeek-V4.1-Flash',
    /** Usato se il primo è sovraccarico (HTTP 429, 502, 503, 504 o nessuna risposta in 20 s) prima di aver scritto qualcosa. */
    riserva: process.env.MODELLO_MOTHER_RISERVA ?? 'DeepSeek-V4-Flash',
    /** Millisecondi entro cui il primo modello deve iniziare a rispondere, altrimenti si passa alla riserva (che si aspetta 90 s). */
    attesaPrimaRispostaMs: Number(process.env.MODELLO_ATTESA_MS ?? 20_000),
  },
  promptMother: process.env.PROMPT_MOTHER_FILE ?? fileDati('prompt-mother.md'),
  /** Prompt del traduttore dell'interfaccia in inglese (stesso modello, separato dal Mother agent). */
  promptTraduzione: { en: fileDati('prompt-traduzione-en.md'), it: fileDati('prompt-traduzione-it.md') },
  /** Stringa di connessione MongoDB (database Referto). */
  mongoUri: process.env.MONGODB_URI ?? '',
};
