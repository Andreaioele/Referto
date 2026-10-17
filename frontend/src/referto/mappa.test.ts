import { beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre disegna con WebGL, che jsdom non ha: qui si controlla come lo usiamo.
const finto = vi.hoisted(() => {
  const mappa = {
    on: vi.fn(),
    addControl: vi.fn(),
    remove: vi.fn(),
    resize: vi.fn(),
    getLayer: vi.fn(() => ({})),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    touchZoomRotate: { disableRotation: vi.fn() },
    keyboard: { disableRotation: vi.fn() },
  }
  const segnaposto = { setLngLat: vi.fn(), addTo: vi.fn() }
  segnaposto.setLngLat.mockReturnValue(segnaposto)
  // jsdom non ha URL.createObjectURL, che serve per il worker.
  URL.createObjectURL = vi.fn(() => 'blob:worker')
  return {
    mappa,
    segnaposto,
    Map: vi.fn(function () {
      return mappa
    }),
    Marker: vi.fn(function () {
      return segnaposto
    }),
    NavigationControl: vi.fn(),
    setWorkerUrl: vi.fn(),
  }
})
vi.mock('maplibre-gl', () => ({
  Map: finto.Map,
  Marker: finto.Marker,
  NavigationControl: finto.NavigationControl,
  setWorkerUrl: finto.setWorkerUrl,
}))

const { disegnaMappa, STILE_MAPPA } = await import('./mappa')

describe('disegnaMappa', () => {
  beforeEach(() => vi.clearAllMocks())

  it('disegna la mappa Positron centrata sul luogo, ferma col nord in alto, con il segnaposto e l’attribuzione', () => {
    const elemento = document.createElement('div')
    const smonta = disegnaMappa(elemento, { nome: 'CDI Bicocca', indirizzo: 'Viale Sarca 336', lat: 45.5213, lon: 9.2131 })

    expect(STILE_MAPPA).toBe('https://tiles.openfreemap.org/styles/positron')
    expect(finto.Map).toHaveBeenCalledWith(
      expect.objectContaining({
        container: elemento,
        style: STILE_MAPPA,
        center: [9.2131, 45.5213],
        scrollZoom: false,
        dragRotate: false,
        attributionControl: { compact: false },
      }),
    )
    expect(finto.mappa.touchZoomRotate.disableRotation).toHaveBeenCalled()
    expect(finto.NavigationControl).toHaveBeenCalledWith({ showCompass: false })

    const [{ element }] = vi.mocked(finto.Marker).mock.calls[0] as unknown as [{ element: HTMLElement }]
    expect(element.className).toBe('mappa-segnaposto')
    expect(element.title).toBe('CDI Bicocca')
    expect(finto.segnaposto.setLngLat).toHaveBeenCalledWith([9.2131, 45.5213])

    smonta()
    expect(finto.mappa.remove).toHaveBeenCalledOnce()
  })

  it('a stile caricato scurisce e ingrandisce i nomi delle strade', () => {
    disegnaMappa(document.createElement('div'), { nome: 'x', indirizzo: 'y', lat: 45, lon: 9 })
    const [evento, pronto] = vi.mocked(finto.mappa.on).mock.calls[0] as unknown as [string, () => void]
    expect(evento).toBe('style.load')
    pronto()
    expect(finto.mappa.setPaintProperty).toHaveBeenCalledWith('highway-name-minor', 'text-color', '#3d434b')
    expect(finto.mappa.setLayoutProperty).toHaveBeenCalledWith('highway-name-major', 'text-size', expect.any(Array))
  })
})
