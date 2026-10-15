/**
 * Sezioni del foglio illustrativo AIFA e scelta dei brani che rispondono a
 * una domanda. Tutto deterministico: nessun modello, solo il testo del PDF.
 *
 * I fogli illustrativi seguono lo schema europeo (QRD): un indice
 * "Contenuto di questo foglio" con sei voci numerate, poi le sei sezioni con
 * gli stessi titoli.
 */

export interface Sezione {
  numero: number;
  titolo: string;
  /** Pagina del PDF (da 1) in cui inizia la sezione. */
  pagina: number;
  testo: string;
}

export interface Brano {
  sezione: number;
  titolo: string;
  pagina: number;
  testo: string;
}

interface Riga {
  pagina: number;
  testo: string;
}

// Intestazioni e piè di pagina che AIFA aggiunge a ogni pagina del PDF.
const RUMORE = [
  /^Documento reso disponibile da AIFA/i,
  /^Pag\.\s*\d+\s+di\s+\d+$/i,
  /^medicinali e, pertanto, l.Agenzia/i,
  /^all.immissione in commercio \(o titolare AIC\)/i,
  /^\d+\s*\/\s*\d+$/,
];
// Dove finisce il primo foglio: un altro foglio (PDF con più formulazioni) o la parte per i medici.
const FINE_FOGLIO = [/^Foglio illustrativo/i, /^Le informazioni seguenti sono destinate/i];
const VOCE = /^([1-6])\.\s*(.+)$/;

/** Righe utili del PDF, con la pagina da cui vengono. */
function righe(pagine: string[]): Riga[] {
  return pagine.flatMap((testo, indice) =>
    testo
      .split('\n')
      .map((riga) => riga.trim())
      .filter((riga) => riga && !RUMORE.some((schema) => schema.test(riga)))
      .map((riga) => ({ pagina: indice + 1, testo: riga })),
  );
}

/** Confronto dei titoli senza maiuscole, accenti e apostrofi tipografici. */
function chiaveTitolo(testo: string): string {
  return normalizza(testo).replace(/\s+/g, ' ').slice(0, 24);
}

export interface Foglio {
  /** Intestazione del foglio, per esempio "DIBASE 10.000 U.I./ml gocce orali, soluzione". */
  titolo: string;
  sezioni: Sezione[];
}

/** Parole e numeri di un testo, per confrontare la formulazione prescritta con l'intestazione dei fogli. */
function parole(testo: string): Set<string> {
  return new Set((normalizza(testo).match(/[a-z]{2,}|\d+(?:[.,]\d+)*/g) ?? []).filter(Boolean));
}

/**
 * Il foglio illustrativo del PDF con le sue sei sezioni. Un PDF può contenerne
 * più di uno (un foglio per formulazione: capsule, gocce, fiale…): con
 * `forma` (la confezione prescritta) si sceglie quello la cui intestazione la
 * descrive meglio, altrimenti il primo. Sezioni vuote se il PDF non ha
 * l'indice standard.
 */
export function trovaSezioni(pagine: string[], forma = ''): Foglio {
  const tutte = righe(pagine);
  const indici = tutte.flatMap((riga, posizione) => (/^contenuto di questo foglio/i.test(riga.testo) ? [posizione] : []));
  if (indici.length === 0) return { titolo: '', sezioni: [] };

  const cercate = parole(forma);
  const candidati = indici.map((indice) => {
    let inizio = indice;
    while (inizio > 0 && indice - inizio < 12 && !/^Foglio illustrativo/i.test(tutte[inizio].testo)) inizio -= 1;
    const intestazione = tutte.slice(inizio + 1, indice).map((riga) => riga.testo);
    const presenti = parole(intestazione.join(' '));
    const punteggio = [...cercate].filter((parola) => presenti.has(parola)).length;
    const titolo = intestazione.find((riga) => /\d|mg|compress|capsul|gocce|soluzion|sciroppo/i.test(riga)) ?? intestazione[0] ?? '';
    return { indice, punteggio, titolo };
  });
  const scelto = candidati.reduce((migliore, candidato) => (candidato.punteggio > migliore.punteggio ? candidato : migliore));
  return { titolo: scelto.titolo, sezioni: sezioniDa(tutte, scelto.indice) };
}

/** Le sei sezioni che seguono l'indice "Contenuto di questo foglio" alla riga `indice`. */
function sezioniDa(tutte: Riga[], indice: number): Sezione[] {
  const titoli = new Map<number, string>();
  let cursore = indice + 1;
  while (cursore < tutte.length && titoli.size < 6) {
    const voce = VOCE.exec(tutte[cursore].testo);
    if (voce) titoli.set(Number(voce[1]), voce[2].trim());
    cursore += 1;
  }

  const inizi: Array<{ numero: number; titolo: string; riga: number }> = [];
  for (const [numero, titolo] of [...titoli].sort(([a], [b]) => a - b)) {
    const dopo = inizi.at(-1)?.riga ?? cursore - 1;
    for (let r = dopo + 1; r < tutte.length; r += 1) {
      const voce = VOCE.exec(tutte[r].testo);
      if (voce && Number(voce[1]) === numero && chiaveTitolo(voce[2]) === chiaveTitolo(titolo)) {
        inizi.push({ numero, titolo, riga: r });
        break;
      }
    }
  }

  return inizi.map((inizio, posizione) => {
    let fine = inizi[posizione + 1]?.riga ?? tutte.length;
    for (let r = inizio.riga + 1; r < fine; r += 1) {
      if (FINE_FOGLIO.some((schema) => schema.test(tutte[r].testo))) {
        fine = r;
        break;
      }
    }
    return {
      numero: inizio.numero,
      titolo: inizio.titolo,
      pagina: tutte[inizio.riga].pagina,
      testo: unisciRighe(tutte.slice(inizio.riga + 1, fine).map((riga) => riga.testo)),
    };
  });
}

/** Ricompone le righe del PDF in paragrafi: una riga che non chiude la frase continua nella successiva. */
function unisciRighe(elenco: string[]): string {
  let testo = '';
  for (const riga of elenco) {
    if (!testo) testo = riga;
    else if (/[.:;!?]$/.test(testo) || /^[•\-–]/.test(riga)) testo += `\n${riga}`;
    else testo += ` ${riga}`;
  }
  return testo.replace(/[ \t]+/g, ' ').trim();
}

// Parole della domanda che indicano la sezione del foglio che risponde.
const INDIZI: Array<[number, RegExp]> = [
  [1, /\b(serve|servono|cos.e|che cos|usato per|utilizzato|indicat)/],
  [2, /\b(prima di|controindica|altri (farmaci|medicinali)|insieme|interazion|gravidanz|allatta|alcol|guidare|avvertenz|precauzion|allergi)/],
  [3, /\b(come (lo |la )?prend|dose|dosi|quant[aei] (ne )?(prend|devo)|quando|dimentic|troppo|sospend|smett|interromp|orari)/],
  [4, /\b(effett|indesiderat|collateral|reazion)/],
  [5, /\b(conserv|scadenz|temperatur|frigo)/],
  [6, /\b(contien|eccipient|confezion|aspetto|lattosio|ingredient)/],
];

const PAROLE_VUOTE = new Set([
  'della', 'delle', 'dello', 'degli', 'questo', 'questa', 'quale', 'quali', 'posso', 'devo', 'come', 'cosa',
  'sono', 'anche', 'quando', 'perche', 'farmaco', 'medicinale', 'foglietto', 'illustrativo', 'prendere',
  'prenderlo', 'prenderla', 'fare', 'faccio', 'essere', 'molto', 'nella', 'nelle', 'dove', 'altro',
  'quanto', 'quanti', 'quanta', 'quante',
]);

/** Minuscole senza accenti né apostrofi tipografici. */
export function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'");
}

/** Radici delle parole significative (prime 6 lettere), per un confronto tollerante alle desinenze. */
function radici(testo: string, escluse: Set<string>): Set<string> {
  return new Set(
    (normalizza(testo).match(/[a-z]{4,}/g) ?? [])
      .filter((parola) => !PAROLE_VUOTE.has(parola))
      .map((parola) => parola.slice(0, 6))
      .filter((radice) => !escluse.has(radice)),
  );
}

/** Divide il testo di una sezione in brani di circa `lunghezza` caratteri, senza spezzare le frasi. */
function dividi(testo: string, lunghezza: number): string[] {
  const frasi = testo.match(/[^.!?\n]+[.!?]?\s*/g) ?? [testo];
  const brani: string[] = [];
  let attuale = '';
  for (const frase of frasi) {
    if (attuale && attuale.length + frase.length > lunghezza) {
      brani.push(attuale.trim());
      attuale = '';
    }
    attuale += frase;
  }
  if (attuale.trim()) brani.push(attuale.trim());
  return brani;
}

/**
 * I brani del foglio più vicini alla domanda (al massimo `quanti`), dal più
 * pertinente. Punteggio: parole in comune con la domanda, più un bonus per la
 * sezione suggerita dalle parole della domanda. Il nome del farmaco non conta,
 * perché compare ovunque. Nessun brano se nulla corrisponde.
 */
export function scegliBrani(sezioni: Sezione[], domanda: string, nomeFarmaco: string, quanti = 3): Brano[] {
  const domandaNormale = normalizza(domanda);
  const suggerite = new Set(INDIZI.filter(([, schema]) => schema.test(domandaNormale)).map(([numero]) => numero));
  const cercate = radici(domanda, radici(nomeFarmaco, new Set()));

  const candidati = sezioni.flatMap((sezione) =>
    dividi(sezione.testo, 700).map((testo, ordine) => {
      const presenti = radici(`${sezione.titolo} ${testo}`, new Set());
      const comuni = [...cercate].filter((radice) => presenti.has(radice)).length;
      const bonus = suggerite.has(sezione.numero) ? 2 : 0;
      return {
        brano: { sezione: sezione.numero, titolo: sezione.titolo, pagina: sezione.pagina, testo },
        punteggio: comuni + bonus,
        comuni,
        ordine,
      };
    }),
  );

  return candidati
    .filter((candidato) => candidato.comuni > 0 || (candidato.punteggio > 0 && candidato.ordine === 0))
    .sort((a, b) => b.punteggio - a.punteggio || a.brano.sezione - b.brano.sezione || a.ordine - b.ordine)
    .slice(0, quanti)
    .map((candidato) => candidato.brano);
}
