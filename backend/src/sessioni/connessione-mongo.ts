import { Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import os from 'node:os';

/**
 * Connessione al database Referto, usata dal backend e dai test.
 * - lazyConnection: il server si mette in ascolto senza aspettare MongoDB. Su
 *   Vercel l'avvio deve essere veloce: aspettando la connessione la funzione
 *   veniva chiusa ("No exports found in module") e tutte le rotte davano 500.
 * - Se la connessione non riesce lo si scrive nel log (il motivo tecnico)
 *   e la chat va avanti senza archivio; un errore non gestito fermerebbe il processo.
 * - serverSelectionTimeoutMS: se MongoDB non risponde ci si arrende dopo 5
 *   secondi invece di 30.
 * - runtimeAdapters: il driver 7 caricherebbe "os" con import() dinamico, che
 *   non funziona in tutti gli ambienti (jest, funzioni che girano in una vm).
 */
export function connessioneMongo(uri: string) {
  return MongooseModule.forRoot(uri, {
    dbName: 'Referto',
    lazyConnection: true,
    serverSelectionTimeoutMS: 5_000,
    runtimeAdapters: { os },
    connectionFactory: (connessione: Connection) => {
      const logger = new Logger('MongoDB');
      connessione.on('error', (errore: Error) => logger.warn(`Errore di connessione: ${errore.name}`));
      connessione
        .asPromise()
        .then(() => logger.log('Connesso'))
        // Il messaggio del driver dice il motivo (server, rete, accesso negato): niente dati della chat.
        .catch((errore: Error) =>
          logger.warn(`Connessione non riuscita: la chat va avanti senza archivio. ${errore.name}: ${errore.message.slice(0, 400)}`),
        );
      return connessione;
    },
  });
}
