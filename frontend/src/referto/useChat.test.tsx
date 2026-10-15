import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spiega, type EventoChat } from './cliente'
import { useChat } from './useChat'

vi.mock('./cliente', () => ({ spiega: vi.fn() }))

/** spiega() finto: manda gli eventi indicati e restituisce la conversazione ricevuta. */
function rispondeCon(...eventi: EventoChat[]) {
  vi.mocked(spiega).mockImplementationOnce(async (_m, _c, suEvento) => {
    for (const evento of eventi) suEvento(evento)
  })
}

afterEach(() => {
  cleanup()
  vi.mocked(spiega).mockReset()
})

describe('useChat', () => {
  it('costruisce la risposta dai pezzi e continua la stessa conversazione', async () => {
    rispondeCon({ tipo: 'testo', testo: 'Ciao' }, { tipo: 'testo', testo: ', ecco' }, { tipo: 'fine', conversazione: 'c-1' })
    rispondeCon({ tipo: 'testo', testo: 'Seconda' }, { tipo: 'fine', conversazione: 'c-1' })
    const { result } = renderHook(() => useChat())
    await act(() => result.current.invia('REFERTO', { nascosto: true }))
    expect(result.current.messaggi).toEqual([
      { autore: 'persona', testo: 'REFERTO', nascosto: true },
      { autore: 'referto', testo: 'Ciao, ecco' },
    ])
    expect(result.current.inCorso).toBe(false)
    await act(() => result.current.invia('Domanda'))
    expect(vi.mocked(spiega).mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['REFERTO', null],
      ['Domanda', 'c-1'],
    ])
  })

  it('un errore dopo una parte di risposta la tiene e la segue', async () => {
    rispondeCon({ tipo: 'testo', testo: 'Parte' }, { tipo: 'errore', messaggio: 'La risposta si è interrotta. Riprova tra poco.' })
    const { result } = renderHook(() => useChat())
    await act(() => result.current.invia('REFERTO'))
    expect(result.current.messaggi[1]).toEqual({
      autore: 'referto',
      testo: 'Parte\n\n(La risposta si è interrotta. Riprova tra poco.)',
      errore: true,
    })
  })

  it('dice se la spiegazione del referto arriva dalla cache del backend', async () => {
    rispondeCon({ tipo: 'testo', testo: 'Spiegazione salvata' }, { tipo: 'fine', conversazione: 'c-1', da_cache: true })
    rispondeCon({ tipo: 'testo', testo: 'Risposta nuova' }, { tipo: 'fine', conversazione: 'c-1' })
    const { result } = renderHook(() => useChat())
    await act(() => result.current.invia('REFERTO'))
    expect(result.current.daCache).toBe(true)
    // Le domande successive non cambiano l'origine della spiegazione.
    await act(() => result.current.invia('Domanda'))
    expect(result.current.daCache).toBe(true)
    act(() => result.current.azzera())
    expect(result.current.daCache).toBe(false)
  })

  it('azzera annulla e ricomincia una conversazione nuova', async () => {
    rispondeCon({ tipo: 'fine', conversazione: 'c-1' })
    rispondeCon({ tipo: 'fine', conversazione: 'c-2' })
    const { result } = renderHook(() => useChat())
    await act(() => result.current.invia('Primo'))
    act(() => result.current.azzera())
    expect(result.current.messaggi).toEqual([])
    await act(() => result.current.invia('Nuovo'))
    expect(vi.mocked(spiega).mock.calls[1][1]).toBeNull()
  })
})
