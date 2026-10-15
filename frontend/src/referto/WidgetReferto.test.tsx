import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefertoDaSpiegare } from './tipi'
import { WidgetReferto } from './WidgetReferto'

/** Risposta del Mother agent nel formato di resources/evolus/agenti/mother.md, in streaming SSE. */
const RISPOSTA = [
  'ARGOMENTO: Esami del sangue · Laboratorio analisi',
  'SINTESI',
  'Quasi tutti i valori sono nella norma; due sono un po’ alti.',
  'SPIEGAZIONE IN PAROLE SEMPLICI',
  'La glicemia e il colesterolo LDL sono sopra l’intervallo indicato dal laboratorio.',
  'Questa è una spiegazione automatica e non sostituisce il medico.',
].join('\n')

function sse(...eventi: object[]): Response {
  const testo = eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(testo, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const referto: RefertoDaSpiegare = {
  id: 'd-sangue',
  titolo: 'Esami del sangue',
  data: '3 ottobre 2026',
  testo: 'TESTO DEL REFERTO',
  valori: [
    { esame: 'Glicemia a digiuno', risultato: '108', unita: 'mg/dL', riferimento: '70 – 99', fuori: true },
    { esame: 'Emoglobina', risultato: '13,4', unita: 'g/dL', riferimento: '12,0 – 15,5', fuori: false },
  ],
  noteMedico: 'Ricontrollo tra 3 mesi.',
  visitaCollegata: { titolo: 'Visita cardiologica di controllo', quando: 'venerdì 23 ottobre', href: '/visite' },
  doveAndare: '/documenti?referto=d-sangue&cerca=strutture',
  aChiChiedere: '/documenti?referto=d-sangue&cerca=professionisti',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WidgetReferto', () => {
  it('manda al Mother agent solo il testo del referto e mostra la spiegazione con i dati del referto', async () => {
    const richieste: Array<{ url: string; corpo?: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opzioni?: RequestInit) => {
        richieste.push({ url, corpo: opzioni?.body ? JSON.parse(String(opzioni.body)) : undefined })
        if (url === '/api/salute') return Response.json({ stato: 'ok', aggiornato: '2026-10-13' })
        return sse({ tipo: 'testo', testo: RISPOSTA }, { tipo: 'fine', conversazione: 'c-1' })
      }),
    )
    render(<WidgetReferto referto={referto} onChiudi={() => undefined} />)

    expect(screen.getByText(/Stai leggendo:/).textContent).toBe('Stai leggendo: Esami del sangue · 3 ottobre 2026')
    await screen.findByText('Quasi tutti i valori sono nella norma; due sono un po’ alti.')

    expect(richieste.find((r) => r.url === '/api/chat')?.corpo).toEqual({ messaggio: 'TESTO DEL REFERTO' })
    expect(screen.getByText('Esami del sangue · Laboratorio analisi', { selector: '.referto-argomento' })).toBeTruthy()
    expect(screen.getByText(/Dal referto: «Glicemia a digiuno 108 mg\/dL · 70 – 99»/)).toBeTruthy()
    expect(screen.getByText('«Ricontrollo tra 3 mesi.»')).toBeTruthy()
    expect(screen.getByText("Gli altri 1 valori sono nell'intervallo")).toBeTruthy()
    expect(screen.queryByText(/Questa è una spiegazione automatica/)).toBeNull()

    const visita = screen.getByRole('link', { name: 'Vedi la visita' })
    expect(visita.getAttribute('href')).toBe('/visite')
    expect(visita.closest('p, section')?.textContent).toContain('visita cardiologica di controllo venerdì 23 ottobre')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cosa vuol dire «Glicemia a digiuno»?' })).toBeTruthy())

    // "Le mie strutture": collegamento per questo referto e classificazione salvata (niente seconda chiamata al modello).
    expect(screen.getByRole('link', { name: 'Cerca strutture' }).getAttribute('href')).toBe('/documenti?referto=d-sangue&cerca=strutture')
    expect(screen.getByRole('link', { name: 'Cerca professionisti' }).getAttribute('href')).toBe(
      '/documenti?referto=d-sangue&cerca=professionisti',
    )
    expect(screen.getByText(/Cerca strutture e medici di/).textContent).toContain('laboratorio analisi')
    expect(JSON.parse(sessionStorage.getItem('referto-classificazioni') ?? '{}')['d-sangue']).toEqual({
      esame: 'Esami del sangue',
      area: 'Laboratorio analisi',
    })
  })

  it('senza referto chiede di incollarne il testo e non chiama il Mother agent', async () => {
    const chiamata = vi.fn(async (_url: string) => Response.json({ stato: 'ok', aggiornato: '2026-10-13' }))
    vi.stubGlobal('fetch', chiamata)
    render(<WidgetReferto onChiudi={() => undefined} />)
    expect(screen.getByText('Il referto che incolli tu')).toBeTruthy()
    expect(screen.getByLabelText('Incolla il testo del referto')).toBeTruthy()
    await waitFor(() => expect(chiamata).toHaveBeenCalledTimes(1))
    expect(chiamata.mock.calls[0][0]).toBe('/api/salute')
  })
})
