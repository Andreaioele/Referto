/**
 * La risposta del Mother agent a un referto ha una forma fissa (vedi
 * resources/evolus/agenti/mother.md): riga ARGOMENTO, poi i titoli in
 * maiuscolo con un paragrafo ciascuno e una frase di chiusura. Qui la si
 * divide in parti da mostrare in riquadri separati. Funziona anche su una
 * risposta ancora incompleta (streaming) e su una risposta libera.
 */

export type Parte = 'sintesi' | 'spiegazione' | 'limiti' | 'indicazioni' | 'farmaci'

export interface Spiegazione {
  argomento?: { esame: string; area: string }
  parti: Partial<Record<Parte, string>>
  /** Testo senza titoli (domande successive, messaggi che non sono referti). */
  libero: string
}

const TITOLI: Record<string, Parte> = {
  SINTESI: 'sintesi',
  'SPIEGAZIONE IN PAROLE SEMPLICI': 'spiegazione',
  'INCERTEZZE O LIMITI DEL REFERTO': 'limiti',
  'INDICAZIONI RIPORTATE NEL DOCUMENTO': 'indicazioni',
  'FARMACI CITATI NEL REFERTO': 'farmaci',
}

export const CHIUSURA = /Questa è una spiegazione automatica[\s\S]*$/

export function leggiSpiegazione(testo: string): Spiegazione {
  const spiegazione: Spiegazione = { parti: {}, libero: '' }
  let attuale: Parte | null = null
  const libero: string[] = []
  for (const riga of testo.replace(CHIUSURA, '').split('\n')) {
    const pulita = riga.trim()
    const argomento = /^ARGOMENTO:\s*(.+?)\s*·\s*(.+)$/.exec(pulita)
    if (argomento) {
      spiegazione.argomento = { esame: argomento[1], area: argomento[2] }
      continue
    }
    const titolo = TITOLI[pulita.replace(/:$/, '').toUpperCase()]
    if (titolo && pulita === pulita.toUpperCase()) {
      attuale = titolo
      spiegazione.parti[attuale] = ''
      continue
    }
    if (attuale) spiegazione.parti[attuale] = `${spiegazione.parti[attuale] ?? ''}\n${riga}`.trim()
    else libero.push(riga)
  }
  spiegazione.libero = libero.join('\n').trim()
  return spiegazione
}

/** Toglie la frase di chiusura (la sicurezza è già sempre visibile nel widget). */
export function senzaChiusura(testo: string): string {
  return testo.replace(CHIUSURA, '').trim()
}
