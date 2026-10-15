import { Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import os from 'node:os';

/** Attesa tra un tentativo di connessione non riuscito e il successivo. */
export const ATTESA_NUOVO_TENTATIVO_MS = 15_000;

/**
 * Connessione al database Referto, usata dal backend e dai test.
 * - lazyConnection: il server si mette in ascolto senza aspettare MongoDB. Su
 *   Vercel l'avvio deve essere veloce: aspettando la connessione la funzione
 *   veniva chiusa ("No exports found in module") e tutte le rotte davano 500.
 * - Se la connessione non riesce lo si scrive nel log (il motivo tecnico), la
 *   chat va avanti senza archivio e si riprova dopo `attesaMs`: un'istanza di
 *   Vercel partita mentre Atlas la rifiutava non resta senza archivio per sempre.
 *   Un errore non gestito fermerebbe il processo.
 * - serverSelectionTimeoutMS: se MongoDB non risponde ci si arrende dopo 5
 *   secondi invece di 30.
 * - runtimeAdapters: il driver 7 caricherebbe "os" con import() dinamico, che
 *   non funziona in tutti gli ambienti (jest, funzioni che girano in una vm).
 */
export function connessioneMongo(uri: string, attesaMs = ATTESA_NUOVO_TENTATIVO_MS) {
  const opzioni = () => ({ dbName: 'Referto', serverSelectionTimeoutMS: 5_000, runtimeAdapters: { os } });
  return MongooseModule.forRoot(uri, {
    ...opzioni(),
    lazyConnection: true,
    connectionFactory: (connessione: Connection) => {
      const logger = new Logger('MongoDB');
      let chiusa = false;
      connessione.on('close', () => (chiusa = true));
      connessione.on('error', (errore: Error) => logger.warn(`Errore di connessione: ${errore.name}`));
      const prova = (tentativo: Promise<unknown>) =>
        tentativo
          .then(() => logger.log('Connesso'))
          // Il messaggio del driver dice il motivo (server, rete, accesso negato): niente dati della chat.
          .catch((errore: Error) => {
            logger.warn(`Connessione non riuscita: la chat va avanti senza archivio. ${errore.name}: ${errore.message.slice(0, 400)}`);
            const riprova = setTimeout(() => {
              if (!chiusa && connessione.readyState === 0) prova(connessione.openUri(uri, opzioni()));
            }, attesaMs);
            // Il tentativo in sospeso non tiene acceso il processo (test, chiusura del server).
            riprova.unref();
          });
      prova(connessione.asPromise());
      return connessione;
    },
  });
}
