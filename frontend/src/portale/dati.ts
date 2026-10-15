/**
 * Dati del portale dimostrativo dello studio medico (inventati). In un portale
 * vero arrivano dal suo gestionale; Referto riceve solo il referto che la
 * persona sceglie di farsi spiegare.
 *
 * Le date sono relative a oggi, così la demo resta sempre attuale.
 */

export interface Paziente {
  nome: string
  cognome: string
  iniziali: string
  dataNascita: string
  luogoNascita: string
  codiceFiscale: string
  scadenzaTessera: string
  telefono: string
  email: string
  indirizzo: string
  contatto: string
  pazienteDal: number
  medico: { nome: string; orari: string }
  allergie: string
  gruppoSanguigno: string
}

export interface Visita {
  id: string
  /** Giorni da oggi: positivi le prossime, negativi quelle già fatte. */
  giorni: number
  ora?: string
  titolo: string
  medico: string
  specialita: string
  luogo?: string
  daPortare?: string
  preparazione?: string
  refertoId?: string
}

export interface ValoreLaboratorio {
  esame: string
  risultato: string
  unita: string
  riferimento: string
  fuori: boolean
}

export interface Referto {
  /** Testo del referto come lo scrive il medico: è ciò che riceve Referto. */
  testo: string
  /** Valori strutturati degli esami di laboratorio, come li manda il laboratorio. */
  valori?: ValoreLaboratorio[]
  noteMedico?: string
  /** Visita prenotata in cui se ne parlerà, se c'è. */
  visitaCollegata?: string
}

export interface Documento {
  id: string
  tipo: 'referto' | 'ricetta' | 'fattura'
  titolo: string
  giorni: number
  autore: string
  nuovo?: boolean
  referto?: Referto
}

export interface FarmacoAifa {
  cod: string
  nome: string
  confezione: string
}

export interface Farmaco {
  id: string
  nome: string
  medico: string
  giorni: number
  dose: string
  validita: string
  stato: 'da ritirare' | 'ritirata' | 'indicato dal medico'
  nre?: string
  aifa?: FarmacoAifa
}

export interface PrescrizioneEsame {
  id: string
  nome: string
  medico: string
  giorni: number
  stato: 'prenotata' | 'usata'
  visitaId?: string
  nota: string
}

export const STUDIO = 'Poliambulatorio Valle Serena'

export const paziente: Paziente = {
  nome: 'Giovanna',
  cognome: 'Ferri',
  iniziali: 'GF',
  dataNascita: '3 marzo 1954',
  luogoNascita: 'Roma',
  codiceFiscale: 'XXXXXX54X00X000X',
  scadenzaTessera: '31 dicembre 2027',
  telefono: '+39 000 000 0000',
  email: 'giovanna.ferri@esempio.it',
  indirizzo: 'Via dei Tigli 12, Roma',
  contatto: 'Marco Ferri (figlio)',
  pazienteDal: 2019,
  medico: { nome: 'Dott. Paolo Rinaldi', orari: 'Riceve allo studio il lunedì e il giovedì' },
  allergie: 'Penicillina',
  gruppoSanguigno: 'A positivo',
}

const valoriSangue: ValoreLaboratorio[] = [
  { esame: 'Emoglobina', risultato: '13,4', unita: 'g/dL', riferimento: '12,0 – 15,5', fuori: false },
  { esame: 'Globuli bianchi', risultato: '6,8', unita: '×10³/µL', riferimento: '4,0 – 10,0', fuori: false },
  { esame: 'Glicemia a digiuno', risultato: '108', unita: 'mg/dL', riferimento: '70 – 99', fuori: true },
  { esame: 'Colesterolo totale', risultato: '238', unita: 'mg/dL', riferimento: '< 240', fuori: false },
  { esame: 'Colesterolo HDL', risultato: '52', unita: 'mg/dL', riferimento: '> 45', fuori: false },
  { esame: 'Colesterolo LDL', risultato: '162', unita: 'mg/dL', riferimento: '< 116', fuori: true },
  { esame: 'Trigliceridi', risultato: '118', unita: 'mg/dL', riferimento: '< 150', fuori: false },
  { esame: 'Creatinina', risultato: '0,86', unita: 'mg/dL', riferimento: '0,50 – 1,00', fuori: false },
]

const noteSangue = 'Ricontrollo del profilo lipidico tra 3 mesi. Da discutere alla visita cardiologica.'

export const visite: Visita[] = [
  {
    id: 'v-cardio',
    giorni: 8,
    ora: '10:30',
    titolo: 'Visita cardiologica di controllo',
    medico: 'Dott.ssa Elena Marchi',
    specialita: 'Cardiologia',
    luogo: 'Ambulatorio 3, primo piano',
    daPortare: "tessera sanitaria, esami del sangue recenti, elettrocardiogramma dell'ultima visita.",
  },
  {
    id: 'v-eco',
    giorni: 22,
    ora: '8:45',
    titolo: "Ecografia dell'addome completo",
    medico: 'Dott.ssa Chiara Bassi',
    specialita: 'Radiologia',
    luogo: 'Diagnostica per immagini, piano terra',
    preparazione: "digiuno da 8 ore prima dell'esame.",
  },
  {
    id: 'v-prelievo',
    giorni: 35,
    ora: '7:30',
    titolo: 'Prelievo del sangue',
    medico: 'Punto prelievi',
    specialita: 'Laboratorio analisi',
    luogo: 'Piano terra, ingresso B',
  },
  {
    id: 'v-sangue',
    giorni: -12,
    titolo: 'Esami del sangue',
    medico: 'Laboratorio analisi',
    specialita: 'Laboratorio analisi',
    refertoId: 'd-sangue',
  },
  {
    id: 'v-ecg',
    giorni: -33,
    titolo: 'Visita cardiologica con elettrocardiogramma',
    medico: 'Dott.ssa Elena Marchi',
    specialita: 'Cardiologia',
    refertoId: 'd-cardio',
  },
  {
    id: 'v-rx',
    giorni: -86,
    titolo: 'Radiografia del torace',
    medico: 'Dott.ssa Chiara Bassi',
    specialita: 'Radiologia',
    refertoId: 'd-rx',
  },
  {
    id: 'v-occhi',
    giorni: -163,
    titolo: 'Visita oculistica',
    medico: 'Dott. Luca Fontana',
    specialita: 'Oculistica',
    refertoId: 'd-occhi',
  },
]

export const documenti: Documento[] = [
  {
    id: 'd-sangue',
    tipo: 'referto',
    titolo: 'Esami del sangue',
    giorni: -12,
    autore: 'Laboratorio analisi',
    nuovo: true,
    referto: {
      testo: [
        `Laboratorio analisi - ${STUDIO}`,
        'Referto esami ematochimici',
        '',
        'Esame | Risultato | Valori di riferimento',
        ...valoriSangue.map((v) => `${v.esame} | ${v.risultato} ${v.unita}${v.fuori ? ' *' : ''} | ${v.riferimento}`),
        '',
        "* valore fuori dall'intervallo di riferimento",
        '',
        `Note del medico: ${noteSangue}`,
      ].join('\n'),
      valori: valoriSangue,
      noteMedico: noteSangue,
      visitaCollegata: 'v-cardio',
    },
  },
  {
    id: 'd-cardio',
    tipo: 'referto',
    titolo: 'Visita cardiologica con elettrocardiogramma',
    giorni: -33,
    autore: 'Dott.ssa Elena Marchi',
    referto: {
      testo: [
        `Visita cardiologica - ${STUDIO}`,
        'Motivo della visita: controllo della pressione arteriosa.',
        'Pressione arteriosa: 145/90 mmHg. Frequenza cardiaca: 72 battiti al minuto.',
        'Elettrocardiogramma: ritmo sinusale, frequenza 72 bpm, conduzione nella norma, nessuna alterazione della ripolarizzazione.',
        'Conclusioni: ipertensione arteriosa.',
        'Terapia: ramipril 5 mg, 1 compressa al mattino.',
        'Controlli: esami del sangue (profilo lipidico e glicemia) e nuova visita cardiologica tra un mese.',
      ].join('\n'),
      noteMedico: 'Terapia: ramipril 5 mg, 1 compressa al mattino. Esami del sangue e nuova visita tra un mese.',
      visitaCollegata: 'v-cardio',
    },
  },
  { id: 'd-fattura', tipo: 'fattura', titolo: 'Fattura n. 1482', giorni: -33, autore: '120,00 €' },
  {
    id: 'd-rx',
    tipo: 'referto',
    titolo: 'Radiografia del torace',
    giorni: -86,
    autore: 'Dott.ssa Chiara Bassi',
    referto: {
      testo: [
        `Radiologia - ${STUDIO}`,
        'Radiografia del torace in due proiezioni.',
        'Non si osservano addensamenti parenchimali in atto. Seni costofrenici liberi.',
        "Ombra cardiaca di dimensioni nei limiti. Ilo polmonare nella norma.",
        'Conclusioni: quadro radiografico del torace nei limiti della norma.',
      ].join('\n'),
    },
  },
  { id: 'd-ricetta', tipo: 'ricetta', titolo: 'Ricetta per esami del sangue', giorni: -86, autore: 'Dott. Paolo Rinaldi' },
  {
    id: 'd-occhi',
    tipo: 'referto',
    titolo: 'Visita oculistica',
    giorni: -163,
    autore: 'Dott. Luca Fontana',
    referto: {
      testo: [
        `Oculistica - ${STUDIO}`,
        'Acuità visiva con correzione: occhio destro 10/10, occhio sinistro 9/10.',
        'Tono oculare: 15 mmHg in entrambi gli occhi.',
        'Segmento anteriore: segni di secchezza della superficie oculare.',
        'Fondo oculare nella norma.',
        'Indicazioni: lacrime artificiali, 1 goccia per occhio 3 volte al giorno. Controllo tra 12 mesi.',
      ].join('\n'),
      noteMedico: 'Lacrime artificiali, 1 goccia per occhio 3 volte al giorno. Controllo tra 12 mesi.',
    },
  },
]

export const farmaci: Farmaco[] = [
  {
    id: 'f-triatec',
    nome: 'Triatec 5 mg compresse',
    medico: 'Dott. Paolo Rinaldi',
    giorni: -16,
    dose: '1 compressa al mattino.',
    validita: 'Ricetta valida per altri 14 giorni · 2 confezioni',
    stato: 'da ritirare',
    nre: '1200A •••• ••••',
    aifa: { cod: '027161', nome: 'Triatec', confezione: '5 mg compresse' },
  },
  {
    id: 'f-dibase',
    nome: 'Dibase 10.000 U.I./ml gocce orali',
    medico: 'Dott. Paolo Rinaldi',
    giorni: -86,
    dose: '25 gocce una volta alla settimana.',
    validita: 'Ritirata in farmacia',
    stato: 'ritirata',
    aifa: { cod: '036635', nome: 'Dibase', confezione: '10.000 U.I./ml gocce orali' },
  },
  {
    id: 'f-collirio',
    nome: 'Collirio lubrificante',
    medico: 'Dott. Luca Fontana',
    giorni: -163,
    dose: '1 goccia per occhio, 3 volte al giorno.',
    validita: 'Senza ricetta: indicato nel referto della visita oculistica',
    stato: 'indicato dal medico',
  },
]

export const esamiPrescritti: PrescrizioneEsame[] = [
  {
    id: 'e-cardio',
    nome: 'Visita cardiologica di controllo',
    medico: 'Dott. Paolo Rinaldi',
    giorni: -30,
    stato: 'prenotata',
    visitaId: 'v-cardio',
    nota: 'Già prenotata.',
  },
  {
    id: 'e-eco',
    nome: "Ecografia dell'addome completo",
    medico: 'Dott. Paolo Rinaldi',
    giorni: -30,
    stato: 'prenotata',
    visitaId: 'v-eco',
    nota: 'Già prenotata.',
  },
  {
    id: 'e-sangue',
    nome: 'Esami del sangue',
    medico: 'Dott. Paolo Rinaldi',
    giorni: -86,
    stato: 'usata',
    nota: 'Esami già fatti: il referto è nei documenti.',
  },
]

export const messaggioStudio = 'Dal 2 novembre si può prenotare il vaccino antinfluenzale, anche dal portale.'

export function documento(id: string): Documento | undefined {
  return documenti.find((d) => d.id === id)
}

export function visita(id: string): Visita | undefined {
  return visite.find((v) => v.id === id)
}

export const prossimeVisite = visite.filter((v) => v.giorni >= 0).sort((a, b) => a.giorni - b.giorni)
export const visiteFatte = visite.filter((v) => v.giorni < 0).sort((a, b) => b.giorni - a.giorni)
