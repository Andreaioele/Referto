import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cambiaLingua } from '../lingua/lingua'
import { dimenticaTraduzioni } from './cliente'
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
  act(() => cambiaLingua('it'))
  dimenticaTraduzioni()
})

/** Le traduzioni che il backend restituirebbe (/api/traduzione): ogni testo non in elenco torna non tradotto. */
const INGLESE: Record<string, string> = {
  'Esami del sangue': 'Blood tests',
  'Quasi tutti i valori sono nella norma; due sono un po’ alti.': 'Almost all values are within normal limits; two are a little high.',
  'Devo preoccuparmi?': 'Should I be worried?',
  'Cosa vuol dire glicemia?': 'What does glicemia mean?',
  'Il referto non dice di preoccuparsi.': 'The report does not say to worry.',
  'La glicemia è lo zucchero nel sangue.': 'Glicemia is the sugar in the blood.',
}

/** fetch finto: salute, Mother agent (risposta al referto, poi alle domande) e traduzione; registra i corpi. */
function backendFinto(risposteDomande: string[]) {
  const richieste: Array<{ url: string; corpo?: { messaggio?: string; testi?: string[]; lingua?: string } }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opzioni?: RequestInit) => {
      const corpo = opzioni?.body ? JSON.parse(String(opzioni.body)) : undefined
      richieste.push({ url, corpo })
      if (url === '/api/salute') return Response.json({ stato: 'ok', aggiornato: '2026-10-13' })
      if (url === '/api/traduzione') {
        const testi = corpo.testi as string[]
        return Response.json({
          traduzioni: testi.map((testo) =>
            corpo.lingua === 'it'
              ? { testo: 'Cosa vuol dire glicemia?', tradotto: true }
              : INGLESE[testo]
                ? { testo: INGLESE[testo], tradotto: true }
                : { testo, tradotto: false },
          ),
        })
      }
      const testo = corpo.conversazione ? (risposteDomande.shift() ?? '') : RISPOSTA
      return sse({ tipo: 'testo', testo }, { tipo: 'fine', conversazione: 'c-1' })
    }),
  )
  return richieste
}

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

  describe('in inglese', () => {
    it('traduce le parti scritte dal Mother agent; ciò che non passa il controllo resta in italiano, segnalato', async () => {
      act(() => cambiaLingua('en'))
      backendFinto([])
      render(<WidgetReferto referto={referto} onChiudi={() => undefined} />)

      await screen.findByText('Almost all values are within normal limits; two are a little high.')
      expect(screen.queryByText('Quasi tutti i valori sono nella norma; due sono un po’ alti.')).toBeNull()
      expect(screen.getByText('Blood tests · Testing laboratory', { selector: '.referto-argomento' })).toBeTruthy()
      // Questa parte non ha traduzione (il backend la restituisce non tradotta): resta in italiano, con la nota.
      expect(screen.getByText('La glicemia e il colesterolo LDL sono sopra l’intervallo indicato dal laboratorio.')).toBeTruthy()
      expect(screen.getAllByText('Shown in Italian: the translation did not pass the check.')).toHaveLength(1)
      // I dati copiati dal referto restano come sono.
      expect(screen.getByText(/From the report: «Glicemia a digiuno 108 mg\/dL · 70 – 99»/)).toBeTruthy()
    })

    it('la domanda pronta si vede in inglese ma va al Mother agent in italiano, e la risposta si traduce', async () => {
      act(() => cambiaLingua('en'))
      const richieste = backendFinto(['Il referto non dice di preoccuparsi.'])
      render(<WidgetReferto referto={referto} onChiudi={() => undefined} />)

      fireEvent.click(await screen.findByRole('button', { name: 'Should I be worried?' }))
      await screen.findByText('The report does not say to worry.')
      expect(screen.getByText('Should I be worried?', { selector: '.referto-domanda' })).toBeTruthy()
      expect(richieste.filter((r) => r.url === '/api/chat').map((r) => r.corpo?.messaggio)).toEqual(['TESTO DEL REFERTO', 'Devo preoccuparmi?'])
    })

    it('la domanda scritta in inglese si traduce in italiano prima di andare al Mother agent', async () => {
      act(() => cambiaLingua('en'))
      const richieste = backendFinto(['La glicemia è lo zucchero nel sangue.'])
      render(<WidgetReferto referto={referto} onChiudi={() => undefined} />)

      const campo = await screen.findByPlaceholderText('Ask a question about this report')
      await waitFor(() => expect((campo as HTMLInputElement).disabled).toBe(false))
      fireEvent.change(campo, { target: { value: 'What does glicemia mean?' } })
      fireEvent.submit(campo.closest('form')!)

      await screen.findByText('Glicemia is the sugar in the blood.')
      expect(screen.getByText('What does glicemia mean?', { selector: '.referto-domanda' })).toBeTruthy()
      expect(richieste.find((r) => r.corpo?.lingua === 'it')?.corpo?.testi).toEqual(['What does glicemia mean?'])
      expect(richieste.filter((r) => r.url === '/api/chat').at(-1)?.corpo?.messaggio).toBe('Cosa vuol dire glicemia?')
    })

    it('se la traduzione non risponde mostra la spiegazione in italiano, segnalata', async () => {
      act(() => cambiaLingua('en'))
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url === '/api/salute') return Response.json({ stato: 'ok', aggiornato: '2026-10-13' })
          if (url === '/api/traduzione') return new Response('', { status: 503 })
          return sse({ tipo: 'testo', testo: RISPOSTA }, { tipo: 'fine', conversazione: 'c-1' })
        }),
      )
      render(<WidgetReferto referto={referto} onChiudi={() => undefined} />)
      await screen.findByText('Quasi tutti i valori sono nella norma; due sono un po’ alti.')
      expect(screen.getAllByText('Shown in Italian: the translation did not pass the check.').length).toBeGreaterThan(0)
    })
  })
})
