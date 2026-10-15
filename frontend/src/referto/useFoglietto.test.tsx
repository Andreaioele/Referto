import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apriFoglietto, chiediAlFoglietto, ErroreServizio, type RispostaFoglietto } from './cliente'
import { useFoglietto } from './useFoglietto'

vi.mock('./cliente', async (originale) => ({
  ...(await originale<typeof import('./cliente')>()),
  apriFoglietto: vi.fn(),
  chiediAlFoglietto: vi.fn(),
}))

const farmaco = { codiceAifa: '036635', confezione: '10.000 U.I./ml gocce orali', nome: 'Dibase', descrizione: 'Dibase gocce' }
const info = {
  cod: '036635',
  nome: 'DIBASE',
  ditta: 'ABIOGEN',
  principio_attivo: 'colecalciferolo',
  url_aifa: 'https://aifa.example',
  pagine: 54,
  titolo_foglio: 'DIBASE 10.000 U.I./ml gocce orali',
  // il foglio della confezione prescritta comincia a pagina 21
  sezioni: [
    { numero: 1, titolo: 'Cos’è', pagina: 21 },
    { numero: 3, titolo: 'Come prendere', pagina: 23 },
    { numero: 5, titolo: 'Come conservare', pagina: 26 },
  ],
}
let pdf: { numPages: number; destroy: ReturnType<typeof vi.fn> }

function risposta(sezione: number | null): RispostaFoglietto {
  return { risposta: 'Dal foglietto…', sezione, trovata: sezione !== null, origine: 'foglietto', brani: [] }
}

beforeEach(() => {
  pdf = { numPages: 54, destroy: vi.fn(async () => undefined) }
  vi.mocked(apriFoglietto).mockResolvedValue({ info, pdf } as never)
})

afterEach(() => {
  cleanup()
  vi.mocked(apriFoglietto).mockReset()
  vi.mocked(chiediAlFoglietto).mockReset()
})

async function aperto() {
  const hook = renderHook(() => useFoglietto(farmaco))
  await waitFor(() => expect(hook.result.current.info).not.toBeNull())
  return hook
}

describe('useFoglietto', () => {
  it('apre il foglio della confezione prescritta sulla sua prima pagina', async () => {
    const { result } = await aperto()
    expect(apriFoglietto).toHaveBeenCalledWith('036635', '10.000 U.I./ml gocce orali', expect.any(AbortSignal))
    expect(result.current.pagina).toBe(21)
    expect(result.current.totale).toBe(54)
    expect(result.current.sezioniDellaPagina.map((s) => s.numero)).toEqual([1])
  })

  it('mostra l’errore per la persona se il foglio non si apre', async () => {
    vi.mocked(apriFoglietto).mockRejectedValue(new ErroreServizio('Questo farmaco non è nella banca dati AIFA.'))
    const { result } = renderHook(() => useFoglietto(farmaco))
    await waitFor(() => expect(result.current.errore).toBe('Questo farmaco non è nella banca dati AIFA.'))
  })

  it('una risposta che cita una sezione porta il lettore alla sua pagina e la segna come citata', async () => {
    vi.mocked(chiediAlFoglietto).mockResolvedValue(risposta(5))
    const { result } = await aperto()
    act(() => void result.current.chiedi('  Come si conserva?  '))
    expect(result.current.scambi).toEqual([{ domanda: 'Come si conserva?', stato: 'attesa' }])
    expect(result.current.inAttesa).toBe(true)
    await waitFor(() => expect(result.current.scambi[0].stato).toBe('pronta'))
    expect(chiediAlFoglietto).toHaveBeenCalledWith('036635', 'Come si conserva?', '10.000 U.I./ml gocce orali', expect.any(AbortSignal))
    expect(result.current.pagina).toBe(26)
    expect(result.current.sezioneCitata?.numero).toBe(5)
    expect(result.current.inAttesa).toBe(false)
  })

  it('non fa partire domande vuote o una seconda mentre la prima aspetta', async () => {
    let rispondi: (r: RispostaFoglietto) => void = () => undefined
    vi.mocked(chiediAlFoglietto).mockImplementation(() => new Promise((r) => (rispondi = r)))
    const { result } = await aperto()
    let partite: boolean[] = []
    act(() => {
      partite = [result.current.chiedi('   '), result.current.chiedi('Prima'), result.current.chiedi('Seconda')]
    })
    expect(partite).toEqual([false, true, false])
    expect(chiediAlFoglietto).toHaveBeenCalledTimes(1)
    await act(async () => rispondi(risposta(null)))
    let terza = false
    act(() => void (terza = result.current.chiedi('Terza')))
    expect(terza).toBe(true)
  })

  it('un errore resta sullo scambio con il messaggio per la persona', async () => {
    vi.mocked(chiediAlFoglietto).mockRejectedValue(new ErroreServizio('Hai fatto molte domande di seguito. Aspetta un minuto e riprova.'))
    const { result } = await aperto()
    act(() => void result.current.chiedi('A cosa serve?'))
    await waitFor(() => expect(result.current.scambi[0]).toMatchObject({ stato: 'errore', errore: 'Hai fatto molte domande di seguito. Aspetta un minuto e riprova.' }))
  })

  it('pagine e sezioni: resta tra 1 e il totale, vaiAllaSezione cambia pagina', async () => {
    const { result } = await aperto()
    act(() => result.current.vaiAllaSezione(3))
    expect(result.current.pagina).toBe(23)
    expect(result.current.sezioneCitata).toBeUndefined()
    act(() => result.current.vaiAllaSezione(5, true))
    expect(result.current.sezioneCitata?.numero).toBe(5)
    for (let i = 0; i < 40; i++) act(() => result.current.paginaSuccessiva())
    expect(result.current.pagina).toBe(54)
    for (let i = 0; i < 60; i++) act(() => result.current.paginaPrecedente())
    expect(result.current.pagina).toBe(1)
  })

  it('alla chiusura chiude il PDF e annulla la domanda in corso', async () => {
    let segnale: AbortSignal | undefined
    vi.mocked(chiediAlFoglietto).mockImplementation((_c, _d, _f, s) => {
      segnale = s
      return new Promise(() => undefined)
    })
    const { result, unmount } = await aperto()
    act(() => void result.current.chiedi('Domanda'))
    unmount()
    expect(pdf.destroy).toHaveBeenCalled()
    expect(segnale?.aborted).toBe(true)
  })
})
