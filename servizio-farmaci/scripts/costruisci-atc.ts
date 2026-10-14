/**
 * Costruisce data/atc.json dal file atc.csv degli open data AIFA (CC BY 4.0).
 *
 *   npm run atc -- /percorso/atc.csv
 *
 * Il file AIFA ha due colonne separate da punto e virgola: CODICE_ATC e
 * DESCRIZIONE, per tutti i livelli della classificazione (B, B01, B01A, B01AC,
 * B01AC06). Il servizio usa le descrizioni per dire in che categoria è un farmaco.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT = join(__dirname, '..', 'data', 'atc.json');

function main(): void {
  const source = process.argv[2];
  if (!source) {
    throw new Error('Uso: npm run atc -- /percorso/atc.csv');
  }
  const lines = readFileSync(source, 'utf-8').replace(/^﻿/, '').split(/\r?\n/);
  const header = lines.shift()?.trim();
  if (header !== 'CODICE_ATC;DESCRIZIONE') {
    throw new Error(`Intestazione inattesa in ${source}: ${header}`);
  }
  const codes: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf(';');
    if (separator <= 0) continue;
    const code = line.slice(0, separator).trim();
    const description = line.slice(separator + 1).trim();
    if (code && description) codes[code] = description;
  }
  const sorted = Object.fromEntries(Object.entries(codes).sort(([a], [b]) => (a < b ? -1 : 1)));
  const payload = {
    fonte: 'AIFA - Agenzia Italiana del Farmaco, classificazione ATC (open data, CC BY 4.0)',
    generato: new Date().toISOString().slice(0, 10),
    codici: sorted,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(payload)}\n`, 'utf-8');
  console.log(`${Object.keys(sorted).length} codici ATC -> ${OUTPUT}`);
}

main();
