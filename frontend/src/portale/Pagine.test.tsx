import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { struttureDellArea } from '../referto/cliente'
import { paziente, STUDIO } from './dati'
import { Documenti } from './Documenti'
import { PAGINE } from './pagine'
import { Prenota } from './Prenota'
import { Professionisti } from './Professionisti'
import { Strutture } from './Strutture'

vi.mock('../referto/cliente', async (originale) => ({
  ...(await originale<typeof import('../referto/cliente')>()),
  classifica: vi.fn(),
  struttureDellArea: vi.fn(),
  infoStrutture: vi.fn(async () => ({ aree: [], citta: 'Milano', generato: '2026-10-15', totale: 0, fonti: [] })),
}))

const cardiologia = { id: 'cardiologia', etichetta: 'Cardiologia', reparto: 'cardiologia' }
const studio = {
  id: 'ovt-1',
  tipo: 'studio-medico' as const,
  nome: 'Dott. Nicola Triglione',
  professione: 'Cardiologia',
  aree: ['cardiologia'],
  indirizzo: 'Via Luigi Bertelli 16',
  lat: 45.505,
  lon: 9.224,
  fonte: 'overture' as const,
  distanzaKm: 0.2,
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(struttureDellArea).mockResolvedValue({
    area: cardiologia,
    gruppi: [{ id: 'specialisti', totale: 1, strutture: [studio] }],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Le mie strutture e I miei professionisti', () => {
  it('sono due voci di menu; sul telefono la barra resta di sei voci', () => {
    expect(PAGINE.map((p) => p.nome)).toEqual(expect.arrayContaining(['Le mie strutture', 'I miei professionisti']))
    expect(PAGINE.filter((p) => !p.soloComputer)).toHaveLength(6)
  })

  it('mostrano solo dove si è stati o si è prenotato: lo studio, i medici delle visite, il medico di famiglia', () => {
    render(<Strutture />)
    expect(screen.getByText(STUDIO)).toBeTruthy()
    expect(screen.getByText('Non hai ancora prenotato in altre strutture.')).toBeTruthy()
    cleanup()
    render(<Professionisti />)
    expect(screen.getByText(paziente.medico.nome)).toBeTruthy()
    expect(screen.getByText('Dott.ssa Elena Marchi')).toBeTruthy()
    expect(screen.queryByText('Laboratorio analisi')).toBeNull()
  })

  it('in I miei documenti si cerca dal referto già classificato; "Prenota una visita" porta al calendario', async () => {
    render(<Documenti />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerca professionisti' })[1])
    await screen.findByText('Dott. Nicola Triglione')
    expect(struttureDellArea).toHaveBeenCalledWith('Cardiologia', paziente.casa, 10, expect.any(AbortSignal), 'professionisti')
    fireEvent.click(screen.getByRole('button', { name: 'Prenota una visita' }))
    expect(window.location.pathname + window.location.search).toBe('/prenota?referto=d-cardio')
    cleanup()

    // La pagina apre il calendario con il professionista già scelto; si sceglie l'orario e si segna come prenotata.
    render(<Prenota />)
    expect(screen.getByText(/Come vuoi prenotare con Dott. Nicola Triglione/)).toBeTruthy()
    // Tre modi distinti: Email apre la posta, Scegli una data apre il calendario.
    expect(screen.getByRole('link', { name: 'Email' }).getAttribute('href')).toMatch(/^mailto:\?subject=Richiesta%20di%20visita/)
    fireEvent.click(screen.getByRole('button', { name: 'Scegli una data' }))
    const libero = screen.getByRole('group', { name: /Orari di/ }).querySelector('button:not([disabled])') as HTMLButtonElement
    fireEvent.click(libero)
    fireEvent.click(screen.getByRole('button', { name: 'Prenota' }))
    expect(screen.getByText('Prenotata.')).toBeTruthy()
    cleanup()
    render(<Professionisti />)
    expect(screen.getByText('Dott. Nicola Triglione')).toBeTruthy()
    expect(screen.getByText(/^Visita .* alle /)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Annulla la prenotazione' }))
    expect(screen.queryByText('Dott. Nicola Triglione')).toBeNull()
  })
})
