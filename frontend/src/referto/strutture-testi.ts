import type { AreaStrutture, Categoria, GruppoStrutture } from './cliente'
import { locale, t } from '../lingua/lingua'

/** Aree in cui ogni ospedale ha il servizio anche senza reparto di degenza. */
const SERVIZIO_IN_OGNI_OSPEDALE = new Set(['radiologia', 'laboratorio'])

/** "a 850 m da casa", "a 1,2 km da casa". */
export function distanzaLeggibile(km: number): string {
  if (km < 1) return t('a {m} m da casa', { m: Math.max(100, Math.round((km * 1000) / 50) * 50) })
  return t('a {km} km da casa', { km: km.toLocaleString(locale(), { maximumFractionDigits: 1 }) })
}

/** Titolo di un gruppo di risultati per l'area del referto. */
export function titoloGruppo(gruppo: GruppoStrutture['id'], area: AreaStrutture, categoria: Categoria = 'strutture'): string {
  const reparto = t(area.reparto)
  if (categoria === 'professionisti' && gruppo === 'specialisti') return t('Studi di {reparto} vicino a casa', { reparto })
  if (gruppo === 'medici') return area.id === 'pediatria' ? t('Pediatri vicino a casa') : t('Medici di famiglia vicino a casa')
  if (gruppo === 'ospedali') {
    return SERVIZIO_IN_OGNI_OSPEDALE.has(area.id)
      ? t('Ospedali: chiedi del servizio di {reparto}', { reparto })
      : t('Ospedali con il reparto di {reparto}', { reparto })
  }
  return area.id === 'laboratorio' ? t('Laboratori di analisi') : t('Si occupano di {reparto}', { reparto })
}

/** Quando per l'area non c'è niente nei dati: dove rivolgersi comunque. */
export function nessunRisultato(area: AreaStrutture, categoria: Categoria): string {
  return categoria === 'professionisti'
    ? t('Nei dati di Milano non ci sono studi di {reparto}: il tuo medico di famiglia può dirti a chi rivolgerti.', { reparto: t(area.reparto) })
    : t('Nei dati di Milano non ci sono strutture di {reparto}: il tuo medico di famiglia può dirti dove andare.', { reparto: t(area.reparto) })
}
