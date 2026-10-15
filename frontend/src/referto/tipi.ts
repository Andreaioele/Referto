/**
 * Cosa riceve Referto dal portale in cui è integrato. Referto non conosce i
 * dati del portale: ogni portale li trasforma in questi tipi (per il portale
 * dimostrativo lo fa `portale/perReferto.ts`). Date e testi arrivano già
 * scritti per la persona.
 */

/** Un valore di laboratorio come lo manda il laboratorio. */
export interface ValoreLaboratorio {
  esame: string
  risultato: string
  unita: string
  riferimento: string
  /** Fuori dall'intervallo di riferimento, come segnato nel referto. */
  fuori: boolean
}

/** Visita già prenotata in cui la persona potrà parlare del referto. */
export interface VisitaCollegata {
  /** "Visita cardiologica di controllo" */
  titolo: string
  /** Quando, già scritto: "venerdì 23 ottobre" */
  quando: string
  /** Pagina del portale con la visita. */
  href: string
}

/** Il referto che la persona ha scelto di farsi spiegare: solo questo va al Mother agent. */
export interface RefertoDaSpiegare {
  /** "Esami del sangue" */
  titolo: string
  /** Data del referto, già scritta: "3 ottobre 2026" */
  data: string
  /** Testo del referto come lo scrive il medico: è ciò che si manda al Mother agent. */
  testo: string
  valori?: ValoreLaboratorio[]
  /** Note del medico, copiate così come sono. */
  noteMedico?: string
  /** Solo se la visita è ancora da fare. */
  visitaCollegata?: VisitaCollegata
}

/** Il farmaco di cui aprire il foglio illustrativo AIFA. */
export interface FarmacoDaLeggere {
  /** COD_FARMACO del prontuario AIFA, 6 cifre. */
  codiceAifa: string
  /** Confezione prescritta: sceglie il foglio giusto se il PDF ne ha più di uno. */
  confezione: string
  /** Nome come nel prontuario AIFA ("TRIATEC"), mostrato mentre il foglio si carica. */
  nome: string
  /** Nome come nella ricetta ("Triatec 5 mg compresse"), mostrato mentre il foglio si carica. */
  descrizione: string
  /** Come l'ha scritto il medico nella ricetta, se c'è. */
  doseScritta?: string
}
