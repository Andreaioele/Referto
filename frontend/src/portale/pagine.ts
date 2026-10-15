import type { NomeIcona } from '../Icona'

/**
 * Pagine del portale, nell'ordine del menu (a sinistra sul computer, in basso sul
 * telefono). `soloComputer`: non sta nella barra del telefono, dove si apre
 * dall'avatar in alto (sei voci al massimo).
 */
export const PAGINE: Array<{ percorso: string; nome: string; breve: string; icona: NomeIcona; soloComputer?: boolean }> = [
  { percorso: '/', nome: 'Home', breve: 'Home', icona: 'casa' },
  { percorso: '/visite', nome: 'Le mie visite', breve: 'Visite', icona: 'calendario' },
  { percorso: '/documenti', nome: 'I miei documenti', breve: 'Documenti', icona: 'documento' },
  { percorso: '/prescrizioni', nome: 'Le mie prescrizioni', breve: 'Ricette', icona: 'pillola' },
  { percorso: '/strutture', nome: 'Le mie strutture', breve: 'Strutture', icona: 'luogo' },
  { percorso: '/professionisti', nome: 'I miei professionisti', breve: 'Medici', icona: 'stetoscopio' },
  { percorso: '/dati', nome: 'I miei dati', breve: 'Profilo', icona: 'persona', soloComputer: true },
]
