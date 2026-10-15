/** Date del portale: i dati dicono "tra quanti giorni", qui diventano date in italiano. */

export function dataDa(giorni: number, oggi = new Date()): Date {
  const data = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  data.setDate(data.getDate() + giorni)
  return data
}

const formato = (opzioni: Intl.DateTimeFormatOptions) => (giorni: number) =>
  dataDa(giorni).toLocaleDateString('it-IT', opzioni)

/** "14 ottobre 2026" */
export const dataLunga = formato({ day: 'numeric', month: 'long', year: 'numeric' })
/** "giovedì 22 ottobre" */
export const giornoEData = formato({ weekday: 'long', day: 'numeric', month: 'long' })
/** "giovedì" */
export const giornoSettimana = formato({ weekday: 'long' })
/** "22" */
export const numeroGiorno = formato({ day: 'numeric' })

/** "Ott" */
export function meseBreve(giorni: number): string {
  const mese = dataDa(giorni).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')
  return mese.charAt(0).toUpperCase() + mese.slice(1)
}

/** "2026" */
export function anno(giorni: number): string {
  return String(dataDa(giorni).getFullYear())
}

/** "Venerdì 23 ottobre 2026" */
export function dataConGiorno(giorni: number): string {
  const testo = dataDa(giorni).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return testo.charAt(0).toUpperCase() + testo.slice(1)
}

/** "Mercoledì 14 ottobre 2026" */
export function oggiPerEsteso(): string {
  return dataConGiorno(0)
}

/** "Tra 8 giorni", "Domani", "Oggi" */
export function traQuanto(giorni: number): string {
  if (giorni === 0) return 'Oggi'
  if (giorni === 1) return 'Domani'
  return `Tra ${giorni} giorni`
}

export function saluto(ora = new Date().getHours()): string {
  if (ora < 13) return 'Buongiorno'
  if (ora < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}
