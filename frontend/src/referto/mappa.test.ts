import { describe, expect, it } from 'vitest'
import { disegnaMappa } from './mappa'

describe('disegnaMappa', () => {
  it('disegna con Leaflet le tile di OpenStreetMap, il segnaposto e l’attribuzione, e poi la smonta', () => {
    const elemento = document.createElement('div')
    document.body.append(elemento)
    const smonta = disegnaMappa(elemento, { nome: 'CDI Bicocca', indirizzo: 'Viale Sarca 336', lat: 45.5213, lon: 9.2131 })

    expect(elemento.classList.contains('leaflet-container')).toBe(true)
    const tile = elemento.querySelector<HTMLImageElement>('img.leaflet-tile')
    expect(tile?.src).toMatch(/^https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png$/)
    expect(elemento.querySelector('.mappa-segnaposto')?.getAttribute('title')).toBe('CDI Bicocca')
    expect(elemento.querySelector('.leaflet-control-attribution')?.textContent).toContain('OpenStreetMap')
    expect(elemento.querySelector('.leaflet-control-zoom-in')).toBeTruthy()

    smonta()
    expect(elemento.querySelector('.leaflet-pane')).toBeNull()
    elemento.remove()
  })
})
