import { Map as MappaMaplibre, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import codiceWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw'

/**
 * La mappa di un luogo con MapLibre e lo stile Positron di OpenFreeMap: dati di
 * OpenStreetMap disegnati in grigio chiaro, con poche icone e niente numeri
 * civici, così l'unico colore è il segnaposto. Niente chiavi né servizi a
 * pagamento. Il modulo si carica solo quando si apre una mappa, così MapLibre
 * non pesa sulla pagina.
 */

export interface LuogoSullaMappa {
  nome: string
  indirizzo: string
  lat: number
  lon: number
}

// MapLibre cerca il worker accanto al proprio file, che Vite sposta (e in sviluppo
// gli aggiunge il suo client, che in un worker non funziona): gli passiamo il
// codice originale come blob, uguale in sviluppo e in produzione.
setWorkerUrl(URL.createObjectURL(new Blob([codiceWorker], { type: 'text/javascript' })))

export const STILE_MAPPA = 'https://tiles.openfreemap.org/styles/positron'

/** I nomi delle strade di Positron sono grigio chiaro e piccoli: più scuri e più grandi, per chi legge con fatica. */
const NOMI_STRADE = ['highway-name-minor', 'highway-name-major', 'highway-name-path']

/** Segnaposto disegnato qui (niente immagini da servire): colore dal tema del portale. */
function segnaposto(nome: string): HTMLElement {
  const elemento = document.createElement('div')
  elemento.className = 'mappa-segnaposto'
  elemento.title = nome
  elemento.innerHTML =
    '<svg viewBox="0 0 36 48" width="36" height="48" aria-hidden="true">' +
    '<path d="M18 46C18 46 33 29 33 17A15 15 0 0 0 3 17c0 12 15 29 15 29z" fill="currentColor" stroke="#fff" stroke-width="2"/>' +
    '<circle cx="18" cy="17" r="6" fill="#fff"/></svg>'
  return elemento
}

/** Disegna la mappa nell'elemento, centrata sul luogo; restituisce la funzione che la smonta. */
export function disegnaMappa(elemento: HTMLElement, luogo: LuogoSullaMappa): () => void {
  const centro: [number, number] = [luogo.lon, luogo.lat]
  const mappa = new MappaMaplibre({
    container: elemento,
    style: STILE_MAPPA,
    center: centro,
    zoom: 16,
    // La rotellina non ingrandisce (la pagina non "scappa") e la mappa non ruota: resta sempre col nord in alto.
    scrollZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: { compact: false },
  })
  mappa.touchZoomRotate.disableRotation()
  mappa.keyboard.disableRotation()
  mappa.addControl(new NavigationControl({ showCompass: false }), 'top-left')
  new Marker({ element: segnaposto(luogo.nome), anchor: 'bottom' }).setLngLat(centro).addTo(mappa)

  mappa.on('style.load', () => {
    for (const strato of NOMI_STRADE) {
      if (!mappa.getLayer(strato)) continue
      mappa.setPaintProperty(strato, 'text-color', '#3d434b')
      mappa.setLayoutProperty(strato, 'text-size', ['interpolate', ['linear'], ['zoom'], 13, 13, 16, 15, 18, 17])
    }
  })

  // Sul telefono la finestra cambia misura quando si gira lo schermo.
  const osservatore = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => mappa.resize())
  osservatore?.observe(elemento)
  return () => {
    osservatore?.disconnect()
    mappa.remove()
  }
}
