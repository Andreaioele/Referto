/**
 * Costruisce data/strutture-milano.json: strutture sanitarie, medici di
 * famiglia, pediatri e farmacie del Comune di Milano (solo la città, niente
 * provincia), dagli open data del Comune e da OpenStreetMap.
 *
 *   npm run strutture
 *   npm run strutture -- --osm estrazione.json   # usa un'estrazione Overpass già scaricata
 *   npm run strutture -- --overture overture.json  # usa un'estrazione Overture già fatta
 *
 * Fonti:
 * - Comune di Milano (dati.comune.milano.it): medici di medicina generale,
 *   pediatri di libera scelta, farmacie, consultori, strutture di riabilitazione,
 *   servizi per le dipendenze, centri trasfusionali, posti letto per reparto di
 *   ospedali e case di cura (ultimo anno disponibile);
 * - OpenStreetMap (Overpass): ambulatori, poliambulatori e laboratori, con le
 *   specialità dichiarate;
 * - Overture Maps (places, file pubblici letti con DuckDB da scripts/estrai_overture.py
 *   tramite uv): studi medici specialistici e ambulatori privati, che su
 *   OpenStreetMap sono pochi. Si tengono solo luoghi aperti, abbastanza affidabili
 *   e nelle 19 aree; gli ospedali restano quelli ufficiali del Comune.
 *
 * La demo cerca solo in questo file: niente Google Maps né ricerche del modello.
 * Non si copiano dati personali che non servono (es. la data di nascita dei medici).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AREE, CATEGORIE_OVERTURE, corrispondeOsm, normalizza, type TipoStruttura } from '../src/strutture/aree';
import type { FileStrutture, Struttura } from '../src/strutture/strutture.types';

const OUTPUT = join(__dirname, '..', 'data', 'strutture-milano.json');
const CKAN = 'https://dati.comune.milano.it/api/3/action/package_show?id=';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
/** Rettangolo che contiene il Comune di Milano: scarta coordinate sbagliate. */
const MILANO = { latMin: 45.38, latMax: 45.54, lonMin: 9.04, lonMax: 9.28 };

const DATASET = {
  medici: 'ds234-sociale-medici-medicina-generale',
  pediatri: 'ds235-sociale-pediatri-libera-scelta',
  farmacie: 'ds501_farmacie-nel-comune-di-milano',
  consultoriPubblici: 'ds561_elenco-consultori-pubblici-nel-comune-di-milano',
  consultoriPrivati: 'ds560_consultori-privati-nel-comune-di-milano',
  riabilitazione: 'ds620_elenco_strutture_di_riabilitazione_ria_nel_comune_di_milano',
  dipendenze: 'ds624_servizi_territoriali_per_le_tossicodipendenze_sert_nel_comune_di_milano',
  postiLetto: 'ds683-sanita-posti-letto-delle-strutture-ospedaliere-e-case-di-cura-2010-avanti',
  trasfusionali: 'ds689-sanita-centri-trasfusionali-associativi',
} as const;

/**
 * Ospedali e case di cura (codice struttura-subcodice del Ministero): nome
 * leggibile (nel CSV è troncato a 40 caratteri) e coordinate dove mancano
 * (ricavate una volta da Nominatim).
 */
const OSPEDALI: Record<string, { nome: string; lat?: number; lon?: number }> = {
  '30096-00': { nome: 'Casa di Cura del Policlinico', lat: 45.459494, lon: 9.161872 },
  '30922-00': { nome: 'Istituto Nazionale dei Tumori', lat: 45.474386, lon: 9.232179 },
  '30923-00': { nome: 'Istituto Neurologico Carlo Besta', lat: 45.477132, lon: 9.230656 },
  '30910-00': { nome: 'Ospedale Fatebenefratelli e Oftalmico' },
  '30925-00': { nome: 'Policlinico di Milano, Ospedale Maggiore' },
  '30124-00': { nome: 'Istituto Stomatologico Italiano' },
  '30911-00': { nome: 'Istituto Ortopedico Gaetano Pini' },
  '30936-3': { nome: 'Auxologico Capitanio' },
  '30367-00': { nome: 'Ospedale San Giuseppe' },
  '30912-00': { nome: 'CTO, Centro Traumatologico Ortopedico' },
  '30950-00': { nome: 'San Raffaele Turro' },
  '30100-00': { nome: 'Casa di Cura Igea' },
  '30057-00': { nome: 'Ospedale Macedonio Melloni' },
  '30097-00': { nome: 'Istituto Clinico Città Studi' },
  '30935-00': { nome: 'Ospedale San Raffaele' },
  '30934-00': { nome: 'Centro Cardiologico Monzino' },
  '30949-00': { nome: 'Istituti Clinici Scientifici Maugeri' },
  '30941-00': { nome: 'Istituto Europeo di Oncologia' },
  '30914-00': { nome: 'Ospedale San Paolo' },
  '30936-2': { nome: 'Auxologico San Michele' },
  '30946-2': { nome: 'Istituto Clinico San Siro' },
  '30110-00': { nome: 'Casa di Cura San Giovanni' },
  '30937-00': { nome: 'Centro Santa Maria Nascente, Fondazione Don Gnocchi' },
  '30936-1': { nome: 'Auxologico San Luca' },
  '30103-00': { nome: 'Centro Palazzolo, Fondazione Don Gnocchi' },
  '30915-00': { nome: 'Ospedale San Carlo Borromeo' },
  '30056-00': { nome: 'Ospedale dei Bambini Vittore Buzzi' },
  '30946-1': { nome: "Ospedale Galeazzi-Sant'Ambrogio" },
  '30916-00': { nome: 'Ospedale Luigi Sacco' },
  '30121-00': { nome: 'Casa di Cura San Pio X' },
  '30378-00': { nome: 'Centro Clinico NeMO' },
  '30913-00': { nome: 'Ospedale Niguarda' },
};

/** Reparti che non dicono nulla alla persona (organizzazione, non specialità). */
const REPARTI_NASCOSTI = new Set(['DAY HOSPITAL', 'DAY SURGERY', 'PENSIONANTI', 'ASTANTERIA', 'LUNGODEGENTI']);

type Riga = Record<string, string>;

async function main(): Promise<void> {
  const fonti: FileStrutture['fonti'] = [];
  const strutture: Struttura[] = [];

  const scarica = async (chiave: keyof typeof DATASET, nome: string): Promise<Riga[]> => {
    const { righe, url, licenza, aggiornato } = await datasetComune(DATASET[chiave]);
    fonti.push({ nome: `Comune di Milano: ${nome}`, url, licenza, aggiornato });
    return righe;
  };

  const ospedali = ospedaliDaPostiLetto(await scarica('postiLetto', 'posti letto di ospedali e case di cura'));
  strutture.push(...ospedali);
  strutture.push(...medici(await scarica('medici', 'medici di medicina generale'), 'medico-di-famiglia'));
  strutture.push(...medici(await scarica('pediatri', 'pediatri di libera scelta'), 'pediatra'));
  strutture.push(...farmacie(await scarica('farmacie', 'farmacie')));
  for (const [chiave, nome, tipo, aree] of [
    ['consultoriPubblici', 'consultori pubblici', 'consultorio', ['ginecologia']],
    ['consultoriPrivati', 'consultori privati', 'consultorio', ['ginecologia']],
    ['riabilitazione', 'strutture di riabilitazione', 'riabilitazione', ['ortopedia', 'neurologia']],
    ['dipendenze', 'servizi per le dipendenze', 'dipendenze', ['psichiatria']],
  ] as const) {
    strutture.push(...udo(await scarica(chiave, nome), tipo, [...aree]));
  }
  strutture.push(...trasfusionali(await scarica('trasfusionali', 'centri trasfusionali')));

  const osm = await daOpenStreetMap(ospedali);
  fonti.push({
    nome: 'OpenStreetMap: ambulatori, poliambulatori e laboratori',
    url: 'https://www.openstreetmap.org/copyright',
    licenza: 'ODbL 1.0 (© OpenStreetMap contributors)',
    aggiornato: new Date().toISOString().slice(0, 10),
  });
  strutture.push(...osm);

  const overture = await daOverture(strutture);
  fonti.push({
    nome: 'Overture Maps: studi medici e ambulatori',
    url: 'https://overturemaps.org',
    licenza: 'CDLA Permissive 2.0 (© Overture Maps Foundation)',
    aggiornato: overture.release.slice(0, 10),
  });
  strutture.push(...overture.strutture);

  const valide = strutture.filter(
    (s) => s.lat >= MILANO.latMin && s.lat <= MILANO.latMax && s.lon >= MILANO.lonMin && s.lon <= MILANO.lonMax,
  );
  valide.sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome, 'it') : a.tipo.localeCompare(b.tipo)));
  const file: FileStrutture = { citta: 'Milano', generato: new Date().toISOString().slice(0, 10), fonti, strutture: valide };
  writeFileSync(OUTPUT, `${JSON.stringify(file)}\n`, 'utf-8');

  const perTipo: Record<string, number> = {};
  for (const s of valide) perTipo[s.tipo] = (perTipo[s.tipo] ?? 0) + 1;
  console.log(`${valide.length} strutture (scartate fuori Milano: ${strutture.length - valide.length}) -> ${OUTPUT}`);
  console.log(perTipo);
}

/* ── Comune di Milano ── */

async function datasetComune(id: string): Promise<{ righe: Riga[]; url: string; licenza: string; aggiornato?: string }> {
  const pacchetto = (await (await fetch(CKAN + id)).json()) as {
    result: { license_title: string; resources: Array<{ format: string; url: string; last_modified?: string; created: string }> };
  };
  const csv = pacchetto.result.resources.filter((r) => (r.format || '').toUpperCase() === 'CSV').at(-1);
  if (!csv) throw new Error(`Nessun CSV nel dataset ${id}`);
  const testo = await (await fetch(csv.url)).text();
  return {
    righe: leggiCsv(testo.replace(/^﻿/, '')),
    url: `https://dati.comune.milano.it/dataset/${id}`,
    licenza: pacchetto.result.license_title,
    aggiornato: (csv.last_modified ?? csv.created).slice(0, 10),
  };
}

/** CSV separato da punto e virgola, con campi tra virgolette. */
function leggiCsv(testo: string): Riga[] {
  const righe: string[][] = [];
  let campo = '';
  let riga: string[] = [];
  let virgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (virgolette) {
      if (c === '"' && testo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') virgolette = false;
      else campo += c;
    } else if (c === '"') virgolette = true;
    else if (c === ';') {
      riga.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo);
      if (riga.some((v) => v !== '')) righe.push(riga);
      riga = [];
      campo = '';
    } else campo += c;
  }
  if (campo || riga.length) {
    riga.push(campo);
    righe.push(riga);
  }
  const [intestazione, ...dati] = righe;
  return dati.map((valori) => Object.fromEntries(intestazione.map((nome, i) => [nome.trim(), (valori[i] ?? '').trim()])));
}

/** "VIA MERCALLI,28" -> "Via Mercalli 28"; toglie "Milano" e il CAP in fondo. */
function indirizzoLeggibile(testo: string): string {
  return maiuscoleIniziali(
    testo
      .replace(/\s*\d{5}\s*milano\s*$/i, '')
      .replace(/,?\s*milano\s*$/i, '')
      .replace(/\s*,\s*(\d)/g, ' $1')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim(),
  );
}

function numero(valore: string | undefined): number {
  return Number(String(valore ?? '').replace(',', '.'));
}

function luogo(r: Riga): Pick<Struttura, 'cap' | 'municipio' | 'quartiere'> {
  return {
    cap: r.CAP || undefined,
    municipio: r.MUNICIPIO || undefined,
    quartiere: r.NIL ? maiuscoleIniziali(r.NIL) : undefined,
  };
}

function ospedaliDaPostiLetto(righe: Riga[]): Struttura[] {
  const ultimo = Math.max(...righe.map((r) => Number(r.Anno)));
  const perStruttura = new Map<string, { riga: Riga; reparti: Set<string> }>();
  for (const r of righe.filter((r) => Number(r.Anno) === ultimo)) {
    const chiave = `${r['Codice struttura']}-${r.Subcodice || '00'}`;
    const voce = perStruttura.get(chiave) ?? { riga: r, reparti: new Set<string>() };
    voce.reparti.add(r['Descrizione disciplina']);
    perStruttura.set(chiave, voce);
  }
  const risultato: Struttura[] = [];
  for (const [chiave, { riga, reparti }] of perStruttura) {
    const nota = OSPEDALI[chiave];
    if (!nota) console.warn(`Ospedale senza nome rivisto: ${chiave} ${riga['Denominazione Struttura/Stabilimento']}`);
    const lat = nota?.lat ?? numero(riga.LAT_Y_4326);
    const lon = nota?.lon ?? numero(riga.LONG_X_4326);
    if (!lat || !lon) continue;
    const elenco = [...reparti].filter((d) => !REPARTI_NASCOSTI.has(d));
    risultato.push({
      id: `osp-${chiave}`,
      tipo: /casa di cura/i.test(riga['Descrizione tipo struttura']) ? 'casa-di-cura' : 'ospedale',
      nome: nota?.nome ?? maiuscoleIniziali(riga['Denominazione Struttura/Stabilimento']),
      aree: AREE.filter((a) => a.discipline.some((d) => elenco.some((r) => r.includes(d)))).map((a) => a.id),
      reparti: elenco.map(maiuscoleIniziali).sort((a, b) => a.localeCompare(b, 'it')),
      indirizzo: indirizzoLeggibile(riga.Indirizzo.replace(/\s*-\s*SEDE LEGALE.*$/i, '')),
      ...luogo(riga),
      lat,
      lon,
      fonte: 'comune-milano',
    });
  }
  return risultato;
}

function medici(righe: Riga[], tipo: 'medico-di-famiglia' | 'pediatra'): Struttura[] {
  const perMedico = new Map<string, Riga[]>();
  // Solo medici attivi e ambulatori con indirizzo (nel dataset alcuni ne sono senza).
  for (const r of righe.filter((r) => r.attivo === '1' && r.via.trim())) {
    perMedico.set(r.idMedico, [...(perMedico.get(r.idMedico) ?? []), r]);
  }
  const risultato: Struttura[] = [];
  for (const [id, sedi] of perMedico) {
    const ordinate = [...sedi].sort((a, b) => Number(b.ambulatorioPrincipale) - Number(a.ambulatorioPrincipale));
    const principale = ordinate[0];
    const indirizzo = (r: Riga) => indirizzoLeggibile(`${r.via} ${r.civico}`);
    const lat = numero(principale.LAT_Y_4326);
    const lon = numero(principale.LONG_X_4326);
    if (!lat || !lon) continue;
    // Solo nome, indirizzo e ambulatori: la data di nascita del dataset non serve.
    risultato.push({
      id: `${tipo === 'pediatra' ? 'pls' : 'mmg'}-${id}`,
      tipo,
      nome: nomePersona(`${principale.nomeMedico} ${principale.cognomeMedico}`),
      aree: tipo === 'pediatra' ? ['pediatria'] : ['medicina-generale'],
      indirizzo: indirizzo(principale),
      ...luogo(principale),
      lat,
      lon,
      altreSedi:
        ordinate.length > 1
          ? ordinate
              .slice(1)
              .map((r) => ({ indirizzo: indirizzo(r), lat: numero(r.LAT_Y_4326), lon: numero(r.LONG_X_4326) }))
              .filter((s) => s.lat && s.lon && s.indirizzo !== indirizzo(principale))
          : undefined,
      fonte: 'comune-milano',
    });
  }
  return risultato;
}

function farmacie(righe: Riga[]): Struttura[] {
  return righe.flatMap((r) => {
    const lat = numero(r.LATITUDINE);
    const lon = numero(r.LONGITUDINE);
    if (!lat || !lon) return [];
    // Senza ragione sociale: "Antica Farmacia Diana SNC del Dott. ..." -> "Antica Farmacia Diana".
    const nome = maiuscoleIniziali(r.DESCRIZIONE_FARMACIA.replace(/\s+(S\.?R\.?L|S\.?N\.?C|S\.?A\.?S|S\.?P\.?A)\b.*$/i, ''));
    return [
      {
        id: `farm-${r.CODICE_FARMACIA}`,
        tipo: 'farmacia' as const,
        nome: /farmaci/i.test(nome) ? nome : `Farmacia ${nome}`,
        aree: [],
        indirizzo: indirizzoLeggibile(r.INDIRIZZO),
        ...luogo(r),
        lat,
        lon,
        fonte: 'comune-milano' as const,
      },
    ];
  });
}

/** Unità d'offerta regionali (consultori, riabilitazione, dipendenze): stesse colonne. */
function udo(righe: Riga[], tipo: TipoStruttura, aree: string[]): Struttura[] {
  return righe.flatMap((r) => {
    const lat = numero(r.WGS84_Y);
    const lon = numero(r.WGS84_X);
    if (!lat || !lon) return [];
    return [
      {
        id: `${tipo}-${r.COD_STRUTTURA}`,
        tipo,
        nome: maiuscoleIniziali(r.DENOM_STRUTTURA),
        aree,
        indirizzo: indirizzoLeggibile(r.INDIRIZZO_UBICAZIONE),
        ...luogo(r),
        lat,
        lon,
        fonte: 'comune-milano' as const,
      },
    ];
  });
}

function trasfusionali(righe: Riga[]): Struttura[] {
  return righe.flatMap((r, i) => {
    const lat = numero(r.LAT_Y_4326);
    const lon = numero(r.LONG_X_4326);
    if (!lat || !lon) return [];
    return [
      {
        id: `trasf-${i + 1}`,
        tipo: 'centro-trasfusionale' as const,
        nome: `Centro trasfusionale: ${r['Centro Trasfusionale di riferimento'].replace(/\s*-\s*Centro Trasfusionale\s*$/i, '')}`,
        aree: [],
        indirizzo: indirizzoLeggibile(r['Indirizzo Centro Trasfusionale']),
        ...luogo(r),
        lat,
        lon,
        telefono: r.Telefono || undefined,
        sito: r['Sito Web'] ? `https://${r['Sito Web'].replace(/^https?:\/\//, '')}` : undefined,
        orari: r['Orari di Apertura'] ? r['Orari di Apertura'].replace(/(\d)\s{2,}(\d)/g, '$1-$2').replace(/\s{2,}/g, ' ') : undefined,
        fonte: 'comune-milano' as const,
      },
    ];
  });
}

/* ── OpenStreetMap ── */

interface ElementoOsm {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

const PROFESSIONI_OSM: Record<string, string> = { physiotherapist: 'Fisioterapista', psychotherapist: 'Psicoterapeuta' };

const TIPI_OSM: Record<string, TipoStruttura> = {
  clinic: 'ambulatorio',
  centre: 'ambulatorio',
  // Studi di singoli professionisti: vanno in "I miei professionisti", non tra le strutture.
  doctor: 'studio-medico',
  doctors: 'studio-medico',
  physiotherapist: 'studio-medico',
  psychotherapist: 'studio-medico',
  laboratory: 'laboratorio',
  sample_collection: 'laboratorio',
  hospital: 'ospedale',
};

async function daOpenStreetMap(ospedali: Struttura[]): Promise<Struttura[]> {
  const query =
    '[out:json][timeout:120];area["name"="Milano"]["admin_level"="8"]->.a;' +
    '(nwr["healthcare"](area.a);nwr["amenity"~"^(hospital|clinic|doctors)$"](area.a););out center tags;';
  let elementi: ElementoOsm[] | null = null;
  const file = process.argv.indexOf('--osm');
  if (file > 0) {
    elementi = (JSON.parse(readFileSync(process.argv[file + 1], 'utf-8')) as { elements: ElementoOsm[] }).elements;
  }
  for (const server of elementi ? [] : OVERPASS) {
    try {
      const risposta = await fetch(server, {
        method: 'POST',
        headers: { 'User-Agent': 'Referto-demo/1.0 (hackathon AMD, dati per Milano)', Accept: 'application/json' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(150_000),
      });
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
      elementi = ((await risposta.json()) as { elements: ElementoOsm[] }).elements;
      break;
    } catch (errore) {
      console.warn(`Overpass ${server}: ${(errore as Error).message}`);
    }
  }
  if (!elementi) throw new Error('Nessun server Overpass ha risposto: riprova più tardi.');

  const risultato: Struttura[] = [];
  for (const e of elementi) {
    const t = e.tags;
    const genere = t.healthcare || t.amenity;
    const tipo = TIPI_OSM[genere];
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!tipo || !t.name || !lat || !lon) continue;
    const via = t['addr:street'];
    if (!via) continue;
    // Gli ospedali ci sono già, dagli open data: si tiene solo quello che manca.
    if (tipo === 'ospedale' && ospedali.some((o) => distanzaKm(o.lat, o.lon, lat, lon) < 0.4)) continue;
    const specialita = (t['healthcare:speciality'] ?? '').split(';').filter(Boolean);
    const nome = normalizza(t.name);
    const aree = AREE.filter(
      (a) =>
        specialita.some((s) => corrispondeOsm(s, a.osm)) ||
        a.nome.some((parola) => nome.includes(parola)) ||
        (a.id === 'laboratorio' && tipo === 'laboratorio') ||
        (a.id === 'ortopedia' && genere === 'physiotherapist') ||
        (a.id === 'psichiatria' && genere === 'psychotherapist'),
    ).map((a) => a.id);
    risultato.push({
      id: `osm-${e.type[0]}${e.id}`,
      tipo,
      nome: t.name,
      professione: PROFESSIONI_OSM[genere],
      aree,
      indirizzo: `${via}${t['addr:housenumber'] ? ` ${t['addr:housenumber']}` : ''}`,
      cap: t['addr:postcode'],
      lat,
      lon,
      telefono: t.phone ?? t['contact:phone'],
      sito: t.website ?? t['contact:website'],
      orari: t.opening_hours ? orariLeggibili(t.opening_hours) : undefined,
      fonte: 'openstreetmap',
    });
  }
  return risultato;
}

/** "Mo-Fr 08:00-19:00; Sa 08:00-12:00" -> "lun-ven 08:00-19:00; sab 08:00-12:00". */
function orariLeggibili(orari: string): string {
  const giorni: Record<string, string> = { Mo: 'lun', Tu: 'mar', We: 'mer', Th: 'gio', Fr: 'ven', Sa: 'sab', Su: 'dom', PH: 'festivi' };
  return orari
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (g) => giorni[g])
    .replace(/\boff\b/g, 'chiuso')
    .replace(/24\/7/, 'sempre aperto');
}

/* ── Overture Maps ── */

interface LuogoOverture {
  id: string;
  nome: string | null;
  categoria: string | null;
  alternative: string[] | null;
  confidence: number | null;
  stato: string | null;
  indirizzo: string | null;
  cap: string | null;
  telefono: string | null;
  sito: string | null;
  lat: number;
  lon: number;
}

/** Categorie che sono luoghi (centri, laboratori), non studi di un professionista. */
const LUOGHI_OVERTURE = new Set([
  'outpatient_care_facility',
  'public_health_clinic',
  'community_health_center',
  'urgent_care_clinic',
  'surgery_center',
  'rehabilitation_center',
  'dialysis_clinic',
  'fertility_clinic',
  'maternity_center',
  'behavioral_or_mental_health_clinic',
  'abuse_and_addiction_treatment_center',
  'addiction_rehabilitation_center',
  'alcohol_and_drug_treatment_center',
  'diagnostic_imaging',
  'radiology',
]);
const LABORATORI_OVERTURE = new Set(['laboratory_testing', 'pathology']);
/** Un nome da centro o società, non da singolo professionista. */
const NOME_DA_LUOGO = /\b(centro|poliambulatori|clinica|istituto|ambulatori|casa di cura|ospedal|fondazione|gruppo|medical|diagnostic|laborator|s\.?r\.?l|s\.?p\.?a|asst|ats)\b/i;
/** Nomi da escludere: categorie fuori dalle 19 aree finite in studi o ambulatori generici. */
const NOME_ESCLUSO = /dent|odont|ortodon|implantolog|osteopat|omeopat|naturopat|agopunt|chiropr|estetic|beauty|veterinar|zooprofil|ottic|farmaci|parafarm|massagg|tatuagg/i;
/** Un nome da persona: è lo studio di un professionista, qualunque sia la categoria. */
const NOME_DA_PERSONA = /^(dott|dr|prof)\b/i;
/** Un laboratorio di Overture entra solo se il nome è sanitario (la categoria comprende anche revisioni auto, restauro...). */
const NOME_DA_LABORATORIO_MEDICO = /analisi|medic|clinic|diagnost|biolog|prelievi|sanit|patolog|ematolog|synlab|cerba|lifebrain|bianalisi|cdi\b|istituto|ospedal|policlinic|unimi|genetic/i;
/** Sotto questa affidabilità (0-1) un luogo di Overture non entra: 0,5 è il valore dei registri di imprese. */
const AFFIDABILITA_MINIMA = 0.5;

async function daOverture(esistenti: Struttura[]): Promise<{ release: string; strutture: Struttura[] }> {
  let file = argomento('--overture');
  if (!file) {
    file = join(mkdtempSync(join(tmpdir(), 'overture-')), 'overture.json');
    const esito = spawnSync(
      'uv',
      ['run', '--no-project', '--with', 'duckdb==1.4.1', 'python', '-I', join(__dirname, 'estrai_overture.py'), file],
      { stdio: 'inherit' },
    );
    if (esito.status !== 0) {
      throw new Error('Estrazione da Overture non riuscita: serve uv (https://docs.astral.sh/uv/), oppure --overture file.json');
    }
  }
  const { release, luoghi } = JSON.parse(readFileSync(file, 'utf-8')) as { release: string; luoghi: LuogoOverture[] };

  const risultato: Struttura[] = [];
  let doppioni = 0;
  for (const l of luoghi) {
    const categoria = l.categoria ?? '';
    if (!(categoria in CATEGORIE_OVERTURE)) continue;
    if (l.stato === 'permanently_closed' || (l.confidence ?? 0) < AFFIDABILITA_MINIMA) continue;
    if (!l.nome?.trim() || !l.indirizzo?.trim()) continue;
    const nome = nomeBreve(l.nome === l.nome.toUpperCase() ? maiuscoleIniziali(l.nome) : l.nome.trim());
    if (NOME_ESCLUSO.test(nome)) continue;
    if (LABORATORI_OVERTURE.has(categoria) && !NOME_DA_LABORATORIO_MEDICO.test(nome)) continue;
    // Già presente da un'altra fonte (stesso nome, a meno di 150 m)?
    const chiave = normalizza(nome);
    if ([...esistenti, ...risultato].some((s) => stessoNome(normalizza(s.nome), chiave) && distanzaKm(s.lat, s.lon, l.lat, l.lon) < 0.15)) {
      doppioni++;
      continue;
    }
    const tipo: TipoStruttura = NOME_DA_PERSONA.test(nome)
      ? 'studio-medico'
      : LABORATORI_OVERTURE.has(categoria)
      ? 'laboratorio'
      : LUOGHI_OVERTURE.has(categoria) || NOME_DA_LUOGO.test(nome)
        ? 'ambulatorio'
        : 'studio-medico';
    const categorie = [categoria, ...(l.alternative ?? [])];
    const aree = AREE.filter(
      (a) => categorie.some((c) => (a.overture ?? []).includes(c)) || a.nome.some((parola) => chiave.includes(parola)),
    ).map((a) => a.id);
    risultato.push({
      id: `ovt-${l.id.slice(0, 16)}`,
      tipo,
      nome,
      professione: tipo === 'studio-medico' && categoria !== 'doctors_office' ? CATEGORIE_OVERTURE[categoria] : undefined,
      aree,
      indirizzo: indirizzoLeggibile(l.indirizzo),
      cap: l.cap ?? undefined,
      lat: l.lat,
      lon: l.lon,
      telefono: telefonoItaliano(l.telefono),
      sito: l.sito ?? undefined,
      fonte: 'overture',
    });
  }
  console.log(`Overture: ${risultato.length} luoghi aggiunti, ${doppioni} già presenti da altre fonti`);
  return { release, strutture: risultato };
}

/**
 * Nomi-pubblicità troppo lunghi ("Dott. ROBERTO STERZI , Neurologo Emicrania, Cefalee
 * tensive... - MILANO MEDICA") -> la parte prima del primo " - " e al massimo due
 * parti separate da virgola; le parole tutte maiuscole di almeno 4 lettere diventano normali.
 */
function nomeBreve(nome: string): string {
  let breve = nome.replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
  if (breve.length > 60) breve = breve.split(/ [-|] /)[0];
  if (breve.length > 60) breve = breve.split(/: |\. /)[0];
  if (breve.length > 60) breve = breve.split(', ').slice(0, 2).join(', ');
  if (breve.length > 70) breve = `${breve.slice(0, breve.lastIndexOf(' ', 70)).replace(/[,.:;-]+$/, '')}…`;
  return breve.replace(/\b\p{Lu}{4,}\b/gu, (parola) => parola.charAt(0) + parola.slice(1).toLowerCase());
}

/** "Centro Medico Santagostino" e "Santagostino Centro Medico" non contano; uguali o uno dentro l'altro sì. */
function stessoNome(a: string, b: string): boolean {
  if (a === b) return true;
  const [corto, lungo] = a.length < b.length ? [a, b] : [b, a];
  return corto.length >= 8 && lungo.includes(corto);
}

/** "390287362744" o "024812920" -> "+39 0287362744" / "+39 024812920". */
function telefonoItaliano(telefono: string | null): string | undefined {
  const cifre = (telefono ?? '').replace(/\D/g, '');
  if (cifre.length < 6) return undefined;
  if (cifre.startsWith('39') && cifre.length >= 11) return `+39 ${cifre.slice(2)}`;
  return `+39 ${cifre}`;
}

function argomento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/* ── Utilità ── */

function distanzaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** "FEDERICA DI LUNARDO" -> "Federica Di Lunardo": nei nomi di persona ogni parola ha la maiuscola. */
function nomePersona(testo: string): string {
  return testo
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, s, c) => s + c.toUpperCase());
}

const MINUSCOLE = new Set(['di', 'del', 'della', 'dei', 'delle', 'e', 'a', 'da', 'in', 'per', 'al', 'alla']);

/** "OSPEDALE S. PAOLO - MILANO" -> "Ospedale S. Paolo - Milano"; sigle brevi senza vocali restano maiuscole. */
function maiuscoleIniziali(testo: string): string {
  return testo
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/(\s+)/)
    .map((parola, i) => {
      if (/^\s+$/.test(parola) || !parola) return parola;
      if (i > 0 && MINUSCOLE.has(parola)) return parola;
      if (/^(srl|spa|snc|sas|asst|ats|irccs|ccf|udo|uo|uoc|cdi|aied)\.?,?$/.test(parola)) return parola.toUpperCase();
      if (/^[ivxl]+[,.]?$/.test(parola) && parola.length > 1) return parola.toUpperCase();
      return parola.replace(/^(\p{L})/u, (c) => c.toUpperCase()).replace(/(['’-])(\p{L})/gu, (_, s, c) => s + c.toUpperCase());
    })
    .join('');
}

main().catch((errore) => {
  console.error(errore);
  process.exit(1);
});
