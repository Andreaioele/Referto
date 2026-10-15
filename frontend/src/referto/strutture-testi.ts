import type { AreaStrutture, Categoria, GruppoStrutture } from './cliente'

/** Aree in cui ogni ospedale ha il servizio anche senza reparto di degenza. */
const SERVIZIO_IN_OGNI_OSPEDALE = new Set(['radiologia', 'laboratorio'])

/** "a 850 m da casa", "a 1,2 km da casa". */
export function distanzaLeggibile(km: number): string {
  if (km < 1) return `a ${Math.max(100, Math.round((km * 1000) / 50) * 50)} m da casa`
  return `a ${km.toLocaleString('it-IT', { maximumFractionDigits: 1 })} km da casa`
}

/** Titolo di un gruppo di risultati per l'area del referto. */
export function titoloGruppo(gruppo: GruppoStrutture['id'], area: AreaStrutture, categoria: Categoria = 'strutture'): string {
  if (categoria === 'professionisti' && gruppo === 'specialisti') return `Studi di ${area.reparto} vicino a casa`
  if (gruppo === 'medici') return area.id === 'pediatria' ? 'Pediatri vicino a casa' : 'Medici di famiglia vicino a casa'
  if (gruppo === 'ospedali') {
    return SERVIZIO_IN_OGNI_OSPEDALE.has(area.id)
      ? `Ospedali: chiedi del servizio di ${area.reparto}`
      : `Ospedali con il reparto di ${area.reparto}`
  }
  return area.id === 'laboratorio' ? 'Laboratori di analisi' : `Si occupano di ${area.reparto}`
}

/** Quando per l'area non c'è niente nei dati: dove rivolgersi comunque. */
export function nessunRisultato(area: AreaStrutture, categoria: Categoria): string {
  return categoria === 'professionisti'
    ? `Nei dati di Milano non ci sono studi di ${area.reparto}: il tuo medico di famiglia può dirti a chi rivolgerti.`
    : `Nei dati di Milano non ci sono strutture di ${area.reparto}: il tuo medico di famiglia può dirti dove andare.`
}
