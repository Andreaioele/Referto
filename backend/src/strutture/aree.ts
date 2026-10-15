/**
 * Le 19 aree della classificazione del Mother agent (riga "ARGOMENTO: esame ·
 * area", elenco chiuso in data/prompt-mother.md) e come si riconoscono nei dati
 * delle strutture di Milano. La usano lo script che costruisce
 * data/strutture-milano.json e il servizio che cerca le strutture.
 */
export interface Area {
  /** Identificativo stabile, usato nelle rotte e nei dati. */
  id: string;
  /** Come la scrive il Mother agent, esattamente. */
  etichetta: string;
  /** Per le frasi: "Chiedi del reparto di ..." */
  reparto: string;
  /** Parti del nome del reparto negli open data dei posti letto (maiuscolo). */
  discipline: string[];
  /** Valori di healthcare:speciality di OpenStreetMap: inizio del valore, o valore esatto se finisce con "$". */
  osm: string[];
  /** Parole nel nome di un ambulatorio che indicano l'area (minuscolo). */
  nome: string[];
  /** Categorie di Overture Maps (taxonomy.primary) che indicano l'area. */
  overture?: string[];
  /** Tipi di struttura sempre adatti a quest'area (es. il medico di famiglia). */
  tipi?: TipoStruttura[];
  /** Tutti gli ospedali hanno questo servizio anche senza reparto di degenza (radiologia, laboratorio). */
  inTuttiGliOspedali?: boolean;
}

export type TipoStruttura =
  | 'ospedale'
  | 'casa-di-cura'
  | 'ambulatorio'
  | 'laboratorio'
  | 'medico-di-famiglia'
  | 'pediatra'
  | 'studio-medico'
  | 'farmacia'
  | 'consultorio'
  | 'riabilitazione'
  | 'rsa'
  | 'dipendenze'
  | 'centro-trasfusionale';

export const AREE: Area[] = [
  { id: 'cardiologia', etichetta: 'Cardiologia', reparto: 'cardiologia', discipline: ['CARDIOLOGIA', 'UNITA` CORONARICA', 'CARDIOCHIRURGIA'], osm: ['cardiolog'], nome: ['cardio'], overture: ['cardiology', 'cardiothoracic_surgery'] },
  { id: 'pneumologia', etichetta: 'Pneumologia', reparto: 'pneumologia', discipline: ['PNEUMOLOGIA', 'CHIRURGIA TORACICA'], osm: ['pulmonolog', 'pneumolog'], nome: ['pneumo'], overture: ['pulmonology', 'sleep_medicine'] },
  { id: 'ortopedia', etichetta: 'Ortopedia e traumatologia', reparto: 'ortopedia', discipline: ['ORTOPEDIA', 'UNITA` SPINALE'], osm: ['orthopaedic', 'orthopedic', 'trauma'], nome: ['ortoped'], tipi: ['riabilitazione'], overture: ['orthopedic_surgery', 'orthopedics', 'sports_medicine', 'pediatric_orthopedic_surgery', 'physical_therapy', 'rehabilitation_center'] },
  { id: 'neurologia', etichetta: 'Neurologia', reparto: 'neurologia', discipline: ['NEUROLOGIA', 'NEUROCHIRURGIA', 'NEURO-RIABILITAZIONE'], osm: ['neurolog'], nome: ['neurolog'], overture: ['neurology', 'neuropathology'] },
  { id: 'gastroenterologia', etichetta: 'Gastroenterologia ed endoscopia digestiva', reparto: 'gastroenterologia', discipline: ['GASTROENTEROLOGIA'], osm: ['gastroenterolog', 'endoscop'], nome: ['gastro', 'endoscop'], overture: ['gastroenterology', 'proctology', 'hepatology'] },
  { id: 'urologia', etichetta: 'Urologia', reparto: 'urologia', discipline: ['UROLOGIA'], osm: ['urolog'], nome: ['urolog'], overture: ['urology'] },
  { id: 'nefrologia', etichetta: 'Nefrologia', reparto: 'nefrologia', discipline: ['NEFROLOGIA'], osm: ['nephrolog', 'dialysis'], nome: ['nefrolog', 'dialisi'], overture: ['nephrology', 'dialysis_clinic'] },
  { id: 'ginecologia', etichetta: 'Ginecologia e ostetricia', reparto: 'ginecologia', discipline: ['GINECOLOGIA'], osm: ['gynaecolog', 'gynecolog', 'obstetric'], nome: ['ginecolog', 'donna'], tipi: ['consultorio'], overture: ['obstetrics_and_gynecology', 'reproductive_perinatal_and_womens_care', 'prenatal_and_perinatal_care', 'maternity_center', 'fertility_clinic', 'midwifery'] },
  { id: 'oncologia', etichetta: 'Oncologia', reparto: 'oncologia', discipline: ['ONCOLOGIA', 'ONCOEMATOLOGIA', 'EMATOLOGIA', 'RADIOTERAPIA'], osm: ['oncolog', 'haematolog', 'hematolog'], nome: ['oncolog', 'tumori'], overture: ['oncology', 'hematology'] },
  { id: 'dermatologia', etichetta: 'Dermatologia', reparto: 'dermatologia', discipline: ['DERMATOLOGIA'], osm: ['dermatolog'], nome: ['dermatolog'], overture: ['dermatology'] },
  { id: 'otorinolaringoiatria', etichetta: 'Otorinolaringoiatria', reparto: 'otorinolaringoiatria', discipline: ['OTORINOLARINGOIATRIA'], osm: ['otolaryngolog', 'otorhinolaryngolog', 'ent$'], nome: ['otorino'], overture: ['otolaryngology', 'ear_nose_and_throat', 'audiology'] },
  { id: 'oculistica', etichetta: 'Oculistica', reparto: 'oculistica', discipline: ['OCULISTICA'], osm: ['ophthalmolog'], nome: ['oculist', 'oftalm', 'vista'], overture: ['ophthalmology'] },
  { id: 'endocrinologia', etichetta: 'Endocrinologia e diabetologia', reparto: 'endocrinologia', discipline: ['MALATTIE ENDOCRINE'], osm: ['endocrinolog', 'diabetolog'], nome: ['endocrin', 'diabet'], overture: ['endocrinology'] },
  { id: 'psichiatria', etichetta: 'Psichiatria e psicologia', reparto: 'psichiatria', discipline: ['PSICHIATRIA', 'NEUROPSICHIATRIA INFANTILE'], osm: ['psychiatr', 'psycholog', 'psychotherap'], nome: ['psichiatr', 'psicolog', 'psicoterap'], overture: ['psychiatry', 'child_psychiatry', 'psychology', 'psychotherapy', 'psychoanalysis', 'behavioral_or_mental_health_clinic', 'abuse_and_addiction_treatment_center', 'addiction_rehabilitation_center', 'alcohol_and_drug_treatment_center'] },
  { id: 'pediatria', etichetta: 'Pediatria', reparto: 'pediatria', discipline: ['PEDIATRIA', 'NEONATOLOGIA', 'CHIRURGIA PEDIATRICA'], osm: ['paediatric', 'pediatric'], nome: ['pediatr', 'bambin'], tipi: ['pediatra'], overture: ['pediatric_clinic'] },
  { id: 'laboratorio', etichetta: 'Laboratorio analisi', reparto: 'laboratorio analisi', discipline: [], osm: ['blood_check', 'biology', 'laboratory'], nome: ['laborator', 'analisi', 'prelievi'], tipi: ['laboratorio'], inTuttiGliOspedali: true, overture: ['laboratory_testing', 'pathology'] },
  { id: 'radiologia', etichetta: 'Radiologia e diagnostica per immagini', reparto: 'radiologia', discipline: ['RADIOLOGIA', 'MEDICINA NUCLEARE'], osm: ['radiolog', 'diagnostic_radiology', 'nuclear_medicine'], nome: ['radiolog', 'diagnostic', 'imaging', 'ecograf'], inTuttiGliOspedali: true, overture: ['radiology', 'diagnostic_imaging'] },
  { id: 'chirurgia', etichetta: 'Chirurgia generale', reparto: 'chirurgia generale', discipline: ['CHIRURGIA GENERALE'], osm: ['surgery', 'general_surgery'], nome: ['chirurg'], overture: ['surgery', 'surgery_center'] },
  { id: 'medicina-generale', etichetta: 'Medicina generale', reparto: 'medicina generale', discipline: ['MEDICINA GENERALE'], osm: ['general$', 'general_practice$'], nome: [], tipi: ['medico-di-famiglia'], overture: ['family_practice', 'internal_medicine', 'geriatric_medicine'] },
];

/**
 * Categorie di Overture Maps accettate e come chiamarle per la persona.
 * Quelle generiche (studio medico, ambulatorio) hanno l'area solo dal nome; le
 * altre (dentisti, medicine alternative...) non entrano nei dati.
 */
export const CATEGORIE_OVERTURE: Record<string, string> = {
  doctors_office: 'Studio medico',
  outpatient_care_facility: 'Ambulatorio',
  public_health_clinic: 'Ambulatorio pubblico',
  community_health_center: 'Ambulatorio',
  urgent_care_clinic: 'Ambulatorio',
  surgery_center: 'Centro di chirurgia',
  cardiology: 'Cardiologia',
  cardiothoracic_surgery: 'Cardiochirurgia',
  pulmonology: 'Pneumologia',
  sleep_medicine: 'Medicina del sonno',
  orthopedic_surgery: 'Ortopedia',
  orthopedics: 'Ortopedia',
  sports_medicine: 'Medicina dello sport',
  pediatric_orthopedic_surgery: 'Ortopedia pediatrica',
  physical_therapy: 'Fisioterapia',
  rehabilitation_center: 'Centro di riabilitazione',
  neurology: 'Neurologia',
  neuropathology: 'Neurologia',
  gastroenterology: 'Gastroenterologia',
  proctology: 'Proctologia',
  hepatology: 'Epatologia',
  urology: 'Urologia',
  nephrology: 'Nefrologia',
  dialysis_clinic: 'Centro dialisi',
  obstetrics_and_gynecology: 'Ginecologia',
  reproductive_perinatal_and_womens_care: 'Salute della donna',
  prenatal_and_perinatal_care: 'Gravidanza e nascita',
  maternity_center: 'Gravidanza e nascita',
  fertility_clinic: 'Centro per la fertilità',
  midwifery: 'Ostetrica',
  oncology: 'Oncologia',
  hematology: 'Ematologia',
  dermatology: 'Dermatologia',
  otolaryngology: 'Otorinolaringoiatria',
  ear_nose_and_throat: 'Otorinolaringoiatria',
  audiology: 'Audiologia',
  ophthalmology: 'Oculistica',
  endocrinology: 'Endocrinologia',
  psychiatry: 'Psichiatria',
  child_psychiatry: 'Neuropsichiatria infantile',
  psychology: 'Psicologia',
  psychotherapy: 'Psicoterapia',
  psychoanalysis: 'Psicoanalisi',
  behavioral_or_mental_health_clinic: 'Centro per la salute mentale',
  abuse_and_addiction_treatment_center: 'Servizio per le dipendenze',
  addiction_rehabilitation_center: 'Servizio per le dipendenze',
  alcohol_and_drug_treatment_center: 'Servizio per le dipendenze',
  pediatric_clinic: 'Pediatria',
  laboratory_testing: 'Laboratorio analisi',
  pathology: 'Anatomia patologica',
  radiology: 'Radiologia',
  diagnostic_imaging: 'Diagnostica per immagini',
  surgery: 'Chirurgia',
  family_practice: 'Medicina generale',
  internal_medicine: 'Medicina interna',
  geriatric_medicine: 'Geriatria',
};

/** L'area scritta dal Mother agent ("Cardiologia", "cardiologia ") -> area; null se fuori elenco. */
export function areaDaEtichetta(testo: string): Area | null {
  const pulita = normalizza(testo);
  return AREE.find((a) => normalizza(a.etichetta) === pulita || a.id === pulita) ?? null;
}

/** Un valore di healthcare:speciality corrisponde a uno dei modelli dell'area. */
export function corrispondeOsm(valore: string, modelli: string[]): boolean {
  const v = valore.trim().toLowerCase();
  return modelli.some((m) => (m.endsWith('$') ? v === m.slice(0, -1) : v.startsWith(m)));
}

export function normalizza(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
