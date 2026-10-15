import type { NomeIcona } from '../Icona'

/** Pagine del portale, nell'ordine del menu (a sinistra sul computer, in basso sul telefono). */
export const PAGINE: Array<{ percorso: string; nome: string; breve: string; icona: NomeIcona }> = [
  { percorso: '/', nome: 'Home', breve: 'Home', icona: 'casa' },
  { percorso: '/visite', nome: 'Le mie visite', breve: 'Visite', icona: 'calendario' },
  { percorso: '/documenti', nome: 'I miei documenti', breve: 'Documenti', icona: 'documento' },
  { percorso: '/prescrizioni', nome: 'Le mie prescrizioni', breve: 'Ricette', icona: 'pillola' },
  { percorso: '/dati', nome: 'I miei dati', breve: 'Profilo', icona: 'persona' },
]
