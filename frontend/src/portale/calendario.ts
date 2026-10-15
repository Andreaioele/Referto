/**
 * Calendario di prova per la prenotazione (demo): uguale per tutte le strutture
 * e tutti i professionisti, slegato dalla realtà. I prossimi dieci giorni
 * feriali da domani, sei orari al giorno, alcuni "occupati" sempre negli stessi
 * punti così la demo è stabile.
 */
export const ORARI = ['08:30', '10:00', '11:30', '14:30', '16:00', '17:30']

export interface GiornoDisponibile {
  /** Data a mezzanotte, ora locale. */
  data: Date
  orari: Array<{ ora: string; libero: boolean }>
}

export function giorniDisponibili(oggi = new Date(), quanti = 10): GiornoDisponibile[] {
  const giorni: GiornoDisponibile[] = []
  const data = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  while (giorni.length < quanti) {
    data.setDate(data.getDate() + 1)
    const settimana = data.getDay()
    if (settimana === 0 || settimana === 6) continue
    const indice = giorni.length
    giorni.push({
      data: new Date(data),
      orari: ORARI.map((ora, i) => ({ ora, libero: (indice + i) % 3 !== 0 })),
    })
  }
  return giorni
}

/** "martedì 20 ottobre" */
export function giornoLeggibile(data: Date): string {
  return data.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** La data e l'ora scelte, come ISO locale "2026-10-20T10:00". */
export function quandoIso(data: Date, ora: string): string {
  const mese = String(data.getMonth() + 1).padStart(2, '0')
  const giorno = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mese}-${giorno}T${ora}`
}
