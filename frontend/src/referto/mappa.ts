import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * La mappa di un luogo con Leaflet e le tile di OpenStreetMap. Il modulo si
 * carica solo quando si apre una mappa, così Leaflet non pesa sulla pagina.
 */

export interface LuogoSullaMappa {
  nome: string
  indirizzo: string
  lat: number
  lon: number
}

/** Segnaposto disegnato qui (niente immagini da servire): colore dal tema del portale. */
const SEGNAPOSTO = L.divIcon({
  className: 'mappa-segnaposto',
  html:
    '<svg viewBox="0 0 36 48" width="36" height="48" aria-hidden="true">' +
    '<path d="M18 46C18 46 33 29 33 17A15 15 0 0 0 3 17c0 12 15 29 15 29z" fill="currentColor" stroke="#fff" stroke-width="2"/>' +
    '<circle cx="18" cy="17" r="6" fill="#fff"/></svg>',
  iconSize: [36, 48],
  iconAnchor: [18, 46],
})

/** Disegna la mappa nell'elemento, centrata sul luogo; restituisce la funzione che la smonta. */
export function disegnaMappa(elemento: HTMLElement, luogo: LuogoSullaMappa): () => void {
  const centro: L.LatLngTuple = [luogo.lat, luogo.lon]
  const mappa = L.map(elemento, { center: centro, zoom: 17, scrollWheelZoom: false })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  }).addTo(mappa)
  L.marker(centro, { icon: SEGNAPOSTO, title: luogo.nome, alt: luogo.nome, keyboard: false }).addTo(mappa)

  // Sul telefono la finestra cambia misura quando si gira lo schermo.
  const osservatore = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => mappa.invalidateSize())
  osservatore?.observe(elemento)
  return () => {
    osservatore?.disconnect()
    mappa.remove()
  }
}
