import type { StrutturaVicina } from '../referto/cliente'
import { casaDelPaziente } from './perReferto'

/** Distanza in linea d'aria in km (formula dell'emisenoverso), come nel backend. */
export function distanzaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (g: number) => (g * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

/** Una voce di "Le mie strutture" o "I miei professionisti" nel formato delle righe di Referto. */
export function comeStruttura(
  voce: Pick<StrutturaVicina, 'id' | 'tipo' | 'nome' | 'indirizzo' | 'lat' | 'lon'> & Partial<StrutturaVicina>,
): StrutturaVicina {
  const casa = casaDelPaziente()
  return {
    aree: [],
    fonte: 'comune-milano',
    ...voce,
    distanzaKm: Math.round(distanzaKm(casa.lat, casa.lon, voce.lat, voce.lon) * 10) / 10,
  }
}
