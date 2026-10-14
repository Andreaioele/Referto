/**
 * Va importato per primo da main.ts, prima di qualsiasi libreria.
 *
 * Nella funzione di Vercel Services il codice compilato sta nella radice della
 * funzione (/var/task/main.js) mentre le librerie restano in
 * /var/task/backend/node_modules, dove Node non le cerca: senza questo modulo
 * l'avvio fallisce con "Cannot find module 'reflect-metadata'". Qui si aggiunge
 * quella cartella ai percorsi di ricerca dei moduli (come farebbe NODE_PATH).
 * In locale, in Docker o con il backend pubblicato da solo la cartella non
 * esiste e non cambia nulla.
 */
import { existsSync } from 'node:fs';
import Module from 'node:module';
import { delimiter, join } from 'node:path';

const librerieServizio = join(__dirname, 'backend', 'node_modules');

if (existsSync(librerieServizio)) {
  process.env.NODE_PATH = [librerieServizio, process.env.NODE_PATH].filter(Boolean).join(delimiter);
  // API interna di Node, stabile da anni: rilegge NODE_PATH dopo l'avvio.
  (Module as unknown as { _initPaths: () => void })._initPaths();
}
