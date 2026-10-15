import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disegnaMappa } from '../referto/mappa'
import { STUDIO } from './dati'
import { SchedaStudio } from './SchedaStudio'

vi.mock('../referto/mappa', () => ({ disegnaMappa: vi.fn(() => () => undefined) }))

// Le date del portale sono "tra quanti giorni": con oggi fisso al 15 ottobre 2026 sono quelle del mockup.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 10, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('SchedaStudio', () => {
  it('mostra chi è, dove, gli orari e la prossima visita in evidenza', () => {
    render(<SchedaStudio />)
    const scheda = screen.getByRole('article', { name: STUDIO })
    expect(within(scheda).getByText(/^Ambulatorio · a \d/)).toBeTruthy()
    expect(within(scheda).getByText('Via Valle Serena 1, Milano')).toBeTruthy()
    expect(within(scheda).getByText('Aperto dal lunedì al venerdì, 8:00–19:00')).toBeTruthy()
    expect(within(scheda).getByText('Aperto lun–ven, 8:00–19:00')).toBeTruthy()
    expect(within(scheda).getByText('Prossima visita')).toBeTruthy()
    expect(within(scheda).getByText('Venerdì 23 ottobre 2026')).toBeTruthy()
    expect(within(scheda).getByText('Visita cardiologica di controllo')).toBeTruthy()
    expect(within(scheda).getByText('Ultima visita: esami del sangue, 3 ottobre 2026')).toBeTruthy()
  })

  it('«Vedi tutte le 7 visite» apre lo storico, con le prossime segnate come prenotate', () => {
    render(<SchedaStudio />)
    const pulsante = screen.getByRole('button', { name: 'Vedi tutte le 7 visite' })
    expect(pulsante.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)

    fireEvent.click(pulsante)
    expect(pulsante.getAttribute('aria-expanded')).toBe('true')
    const voci = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(voci).toHaveLength(7)
    expect(voci[2]).toBe('Visita cardiologica di controllo (prenotata)23 ottobre 2026')
    expect(voci[3]).toBe('Esami del sangue3 ottobre 2026')
    expect(voci.filter((v) => v?.includes('(prenotata)'))).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Nascondi le visite' }))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('«Chiama» sul computer mostra numero e orari; sul telefono è un link tel: con il numero', () => {
    render(<SchedaStudio />)
    expect(screen.getByRole('link', { name: 'Chiama 02 0000 0000' }).getAttribute('href')).toBe('tel:+390200000000')
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Chiama' }))
    const riquadro = screen.getByRole('status')
    expect(riquadro.textContent).toContain('Telefono dello studio: 02 0000 0000')
    expect(riquadro.textContent).toContain('lun–ven 8:00–19:00')
  })

  it('«Mappa» apre la mappa dello studio nel portale; «Prenota un’altra visita» porta a /prenota', async () => {
    render(<SchedaStudio />)
    expect(screen.getByRole('link', { name: "Prenota un'altra visita" }).getAttribute('href')).toBe('/prenota')
    fireEvent.click(screen.getByRole('button', { name: 'Mappa' }))
    expect(screen.getByRole('dialog', { name: STUDIO })).toBeTruthy()
    await waitFor(() =>
      expect(disegnaMappa).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ nome: STUDIO, indirizzo: 'Via Valle Serena 1, Milano' })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
