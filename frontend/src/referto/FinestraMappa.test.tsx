import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StrutturaVicina } from './cliente'
import { disegnaMappa } from './mappa'
import { RigaStruttura } from './StruttureVicine'

// Leaflet vero è provato in mappa.test.ts: qui conta la finestra.
const smonta = vi.fn()
vi.mock('./mappa', () => ({ disegnaMappa: vi.fn(() => smonta) }))

const bicocca: StrutturaVicina = {
  id: 'cdi-bicocca',
  nome: 'CDI Bicocca',
  tipo: 'laboratorio',
  aree: [],
  indirizzo: 'Viale Sarca 336',
  quartiere: 'Bicocca',
  lat: 45.5213,
  lon: 9.2131,
  fonte: 'comune-milano',
  distanzaKm: 1.3,
  orari: 'Lun-Ven 7:30-12',
  telefono: '02 1234 5678',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function apriMappa() {
  render(
    <ul>
      <RigaStruttura struttura={bicocca} />
    </ul>,
  )
  const pulsante = screen.getByRole('button', { name: 'Mappa: CDI Bicocca' })
  pulsante.focus()
  fireEvent.click(pulsante)
  return pulsante
}

describe('FinestraMappa', () => {
  it('«Mappa» apre il pannello laterale: mappa centrata sulla struttura e le sue informazioni', async () => {
    apriMappa()
    const finestra = screen.getByRole('dialog', { name: 'CDI Bicocca' })
    expect(finestra.getAttribute('aria-modal')).toBe('true')
    expect(finestra.classList.contains('pannello-mappa')).toBe(true)
    expect(screen.getByText('Viale Sarca 336 (Bicocca)', { selector: '#indirizzo-mappa' })).toBeTruthy()
    expect(within(finestra).getByText(/^Laboratorio analisi, /)).toBeTruthy()
    expect(within(finestra).getByText('Lun-Ven 7:30-12')).toBeTruthy()
    expect(within(finestra).getByRole('link', { name: 'Chiama' }).getAttribute('href')).toBe('tel:0212345678')
    expect(screen.getByRole('status').textContent).toContain('Carico la mappa')
    // Nessun link verso altre schede: la mappa è dentro la finestra.
    expect(finestra.querySelector('a[target="_blank"]')).toBeNull()

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(disegnaMappa).toHaveBeenCalledWith(screen.getByRole('region', { name: 'Mappa: CDI Bicocca' }), {
      nome: 'CDI Bicocca',
      indirizzo: 'Viale Sarca 336 (Bicocca)',
      lat: 45.5213,
      lon: 9.2131,
    })
    // Il fuoco va su "Chiudi" e la pagina sotto non scorre.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Chiudi' }))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('si chiude con Esc: smonta la mappa e il fuoco torna su «Mappa»', async () => {
    const pulsante = apriMappa()
    await waitFor(() => expect(disegnaMappa).toHaveBeenCalled())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(smonta).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(pulsante)
    expect(document.body.style.overflow).toBe('')
  })

  it('si chiude con «Chiudi» e con un clic fuori dalla finestra', async () => {
    apriMappa()
    await waitFor(() => expect(disegnaMappa).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(smonta).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Mappa: CDI Bicocca' }))
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('chiusa prima che Leaflet arrivi, non disegna la mappa', async () => {
    apriMappa()
    fireEvent.keyDown(document, { key: 'Escape' })
    await import('./mappa')
    await new Promise((fine) => setTimeout(fine, 0))
    expect(disegnaMappa).not.toHaveBeenCalled()
  })

  it('senza orari né telefono mostra solo l’indirizzo, senza «Chiama»', () => {
    render(
      <ul>
        <RigaStruttura struttura={{ ...bicocca, orari: undefined, telefono: undefined }} />
      </ul>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mappa: CDI Bicocca' }))
    const finestra = screen.getByRole('dialog', { name: 'CDI Bicocca' })
    expect(within(finestra).queryByRole('link', { name: 'Chiama' })).toBeNull()
    expect(within(finestra).queryByText('Orari')).toBeNull()
  })

  it('se la mappa non si carica lo dice, e la finestra resta chiudibile', async () => {
    vi.mocked(disegnaMappa).mockImplementationOnce(() => {
      throw new Error('niente rete')
    })
    apriMappa()
    expect((await screen.findByRole('alert')).textContent).toContain('Non riesco a mostrare la mappa')
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
