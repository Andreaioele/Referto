import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dimenticaClassificazioni, salvaClassificazione } from './classificazioni'
import { classifica, ErroreServizio, infoStrutture, struttureDellArea, struttureDelTipo, type StrutturaVicina } from './cliente'
import { CercaVicino, StruttureDelReferto } from './StruttureVicine'

vi.mock('./cliente', async (originale) => ({
  ...(await originale<typeof import('./cliente')>()),
  classifica: vi.fn(),
  struttureDellArea: vi.fn(),
  struttureDelTipo: vi.fn(),
  infoStrutture: vi.fn(),
}))

const casa = { indirizzo: 'Viale Monza 140', lat: 45.5041, lon: 9.2225 }
const referto = { id: 'd-sangue', titolo: 'Esami del sangue', data: '3 ottobre 2026', testo: 'TESTO DEL REFERTO' }

function struttura(nome: string, tipo: StrutturaVicina['tipo'], distanzaKm: number, extra: Partial<StrutturaVicina> = {}): StrutturaVicina {
  return { id: nome, nome, tipo, aree: [], indirizzo: `Via ${nome} 1`, lat: 45.5, lon: 9.2, fonte: 'comune-milano', distanzaKm, ...extra }
}

const laboratorio = { id: 'laboratorio', etichetta: 'Laboratorio analisi', reparto: 'laboratorio analisi' }

beforeEach(() => {
  dimenticaClassificazioni()
  vi.mocked(infoStrutture).mockResolvedValue({
    aree: [laboratorio, { id: 'cardiologia', etichetta: 'Cardiologia', reparto: 'cardiologia' }],
    citta: 'Milano',
    generato: '2026-10-15',
    totale: 3,
    fonti: [],
  })
  vi.mocked(struttureDellArea).mockResolvedValue({
    area: laboratorio,
    gruppi: [
      {
        id: 'specialisti',
        totale: 4,
        strutture: [
          struttura('CDI Bicocca', 'laboratorio', 1.3, { telefono: '+39 02 4831 7444', orari: 'lun-ven 07:30-19:00' }),
          struttura('Synlab', 'laboratorio', 1.6),
          struttura('Bianalisi', 'laboratorio', 2.1),
          struttura('Lab Quarto', 'laboratorio', 2.4),
        ],
      },
      { id: 'ospedali', totale: 1, strutture: [struttura('San Raffaele Turro', 'ospedale', 0.8)] },
    ],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StruttureDelReferto', () => {
  it('classifica il referto con il Mother agent, poi mostra i gruppi dalla casa della persona', async () => {
    vi.mocked(classifica).mockResolvedValue({ esame: 'Esami del sangue', area: 'Laboratorio analisi' })
    render(<StruttureDelReferto referto={referto} casa={casa} />)
    expect(screen.getByRole('status').textContent).toContain('Referto sta leggendo il referto')
    await screen.findByText('Laboratori di analisi')
    expect(classifica).toHaveBeenCalledWith('TESTO DEL REFERTO', expect.any(AbortSignal))
    expect(struttureDellArea).toHaveBeenCalledWith('Laboratorio analisi', casa, 10, expect.any(AbortSignal), 'strutture')
    expect(screen.getByText('Esami del sangue:', { exact: false }).textContent).toContain('Laboratorio analisi')
    expect(screen.getByText('Ospedali: chiedi del servizio di laboratorio analisi')).toBeTruthy()

    // Prime tre, poi "Mostra altre"; telefono come link "tel:", mappa su OpenStreetMap.
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('Laboratorio analisi, a 1,3 km da casa')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Chiama CDI Bicocca' }).getAttribute('href')).toBe('tel:+390248317444')
    expect(screen.getByRole('link', { name: /Mappa: CDI Bicocca/ }).getAttribute('href')).toContain('openstreetmap.org/?mlat=45.5&mlon=9.2')
    fireEvent.click(screen.getByRole('button', { name: 'Mostra altre 1' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Orari: lun-ven 07:30-19:00')).toBeTruthy()
  })

  it('se il referto è già classificato (dal widget) non richiama il Mother agent', async () => {
    salvaClassificazione('d-sangue', { esame: 'Esami del sangue', area: 'Laboratorio analisi' })
    render(<StruttureDelReferto referto={referto} casa={casa} />)
    await screen.findByText('Laboratori di analisi')
    expect(classifica).not.toHaveBeenCalled()
  })

  it('se la classificazione non riesce si può scegliere l’area a mano', async () => {
    vi.mocked(classifica).mockRejectedValue(new ErroreServizio('Il servizio non è disponibile in questo momento. Riprova tra poco.'))
    render(<StruttureDelReferto referto={referto} casa={casa} />)
    await screen.findByText('Il servizio non è disponibile in questo momento. Riprova tra poco.')
    const scelta = await screen.findByRole('combobox')
    fireEvent.change(scelta, { target: { value: 'cardiologia' } })
    await screen.findByText('Laboratori di analisi')
    expect(struttureDellArea).toHaveBeenCalledWith('cardiologia', casa, 10, expect.any(AbortSignal), 'strutture')
    expect(screen.getByText('Area scelta:', { exact: false })).toBeTruthy()
  })
})

describe('StruttureDelReferto per i professionisti', () => {
  it('chiede i professionisti e titola gli studi; se non ce ne sono rimanda al medico di famiglia', async () => {
    salvaClassificazione('d-sangue', { esame: 'Visita cardiologica', area: 'Cardiologia' })
    const cardiologia = { id: 'cardiologia', etichetta: 'Cardiologia', reparto: 'cardiologia' }
    vi.mocked(struttureDellArea).mockResolvedValueOnce({
      area: cardiologia,
      gruppi: [{ id: 'specialisti', totale: 1, strutture: [struttura('Studio Rossi', 'studio-medico', 0.4)] }],
    })
    render(<StruttureDelReferto referto={referto} casa={casa} categoria="professionisti" />)
    await screen.findByText('Studi di cardiologia vicino a casa')
    expect(struttureDellArea).toHaveBeenCalledWith('Cardiologia', casa, 10, expect.any(AbortSignal), 'professionisti')
    expect(screen.getByText('Studio medico, a 400 m da casa')).toBeTruthy()
    cleanup()

    vi.mocked(struttureDellArea).mockResolvedValueOnce({ area: cardiologia, gruppi: [] })
    render(<StruttureDelReferto referto={referto} casa={casa} categoria="professionisti" />)
    await screen.findByText(
      'Nei dati di Milano non ci sono studi di cardiologia: il tuo medico di famiglia può dirti a chi rivolgerti.',
    )
  })
})

describe('CercaVicino', () => {
  it('parte dai medici di famiglia e cambia tipo con i filtri', async () => {
    vi.mocked(struttureDelTipo).mockImplementation(async (tipo) => ({
      id: 'specialisti',
      totale: 1,
      strutture: [struttura(tipo === 'farmacia' ? 'Farmacia Loreto' : 'Andrea Lando', tipo, 0.1)],
    }))
    render(
      <CercaVicino
        casa={casa}
        tipi={[
          { tipo: 'medico-di-famiglia', nome: 'Medici di famiglia' },
          { tipo: 'farmacia', nome: 'Farmacie' },
        ]}
      />,
    )
    await screen.findByText('Andrea Lando')
    expect(screen.getByText('Medico di famiglia, a 100 m da casa')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Farmacie' }))
    await screen.findByText('Farmacia Loreto')
    expect(struttureDelTipo).toHaveBeenLastCalledWith('farmacia', casa, 20, expect.any(AbortSignal))
    expect(screen.getByRole('button', { name: 'Farmacie' }).getAttribute('aria-pressed')).toBe('true')
  })
})
