import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apriFoglietto, chiediAlFoglietto, ErroreServizio, spiega, type EventoChat } from './cliente'
import { apriPdf } from './pdf'

vi.mock('./pdf', () => ({ apriPdf: vi.fn() }))

/** Flusso SSE spezzato in pezzi arbitrari, come arriva dalla rete. */
function flusso(...pezzi: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const pezzo of pezzi) controller.enqueue(encoder.encode(pezzo))
      controller.close()
    },
  })
}

function rispondi(risposta: Response | (() => Response | Promise<Response>)) {
  vi.stubGlobal('fetch', vi.fn(async () => (typeof risposta === 'function' ? risposta() : risposta)))
}

async function eventiDi(segnale = new AbortController().signal): Promise<EventoChat[]> {
  const eventi: EventoChat[] = []
  await spiega('testo del referto', null, (e) => eventi.push(e), segnale)
  return eventi
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(apriPdf).mockReset()
})

describe('spiega', () => {
  it('ricompone le righe spezzate, salta commenti e righe non valide e finisce con "fine"', async () => {
    rispondi(
      new Response(
        flusso(': attesa\n\nda', 'ta: {"tipo":"testo","testo":"Ci', 'ao"}\n\ndata: non-json\n\ndata: {"tipo":"testo","testo":" a te"}\n\n', 'data: {"tipo":"fine","conversazione":"c-1"}\n\n'),
      ),
    )
    expect(await eventiDi()).toEqual([
      { tipo: 'testo', testo: 'Ciao' },
      { tipo: 'testo', testo: ' a te' },
      { tipo: 'fine', conversazione: 'c-1' },
    ])
  })

  it('manda la conversazione solo se c’è', async () => {
    const chiamata = vi.fn(async () => new Response(flusso('data: {"tipo":"fine","conversazione":"c-2"}\n\n')))
    vi.stubGlobal('fetch', chiamata)
    await spiega('prima', null, () => undefined, new AbortController().signal)
    await spiega('seconda', 'c-1', () => undefined, new AbortController().signal)
    const corpi = chiamata.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)))
    expect(corpi).toEqual([{ messaggio: 'prima' }, { messaggio: 'seconda', conversazione: 'c-1' }])
  })

  it('se il flusso si chiude senza esito aggiunge un solo errore', async () => {
    rispondi(new Response(flusso('data: {"tipo":"testo","testo":"Mezza"}\n\n')))
    expect(await eventiDi()).toEqual([
      { tipo: 'testo', testo: 'Mezza' },
      { tipo: 'errore', messaggio: 'La risposta si è interrotta. Riprova tra poco.' },
    ])
  })

  it('passa l’errore del backend e si ferma lì', async () => {
    rispondi(new Response(flusso('data: {"tipo":"errore","messaggio":"Sovraccarico"}\n\ndata: {"tipo":"testo","testo":"dopo"}\n\n')))
    expect(await eventiDi()).toEqual([{ tipo: 'errore', messaggio: 'Sovraccarico' }])
  })

  it('traduce gli stati HTTP in messaggi per la persona', async () => {
    rispondi(new Response('', { status: 429 }))
    expect(await eventiDi()).toEqual([{ tipo: 'errore', messaggio: 'Hai inviato molti messaggi di seguito. Aspetta un minuto e riprova.' }])
    rispondi(new Response('', { status: 503 }))
    expect(await eventiDi()).toEqual([{ tipo: 'errore', messaggio: 'Il servizio non è disponibile in questo momento. Riprova tra poco.' }])
  })

  it('rete assente o caduta durante la risposta: un solo errore "collegamento interrotto"', async () => {
    rispondi(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await eventiDi()).toEqual([{ tipo: 'errore', messaggio: 'Collegamento interrotto. Riprova tra poco.' }])
    // primo pezzo arrivato, poi la rete cade
    let letture = 0
    const rotto = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (letture++ === 0) controller.enqueue(new TextEncoder().encode('data: {"tipo":"testo","testo":"Inizio"}\n\n'))
        else controller.error(new TypeError('network error'))
      },
    })
    rispondi(new Response(rotto))
    expect(await eventiDi()).toEqual([
      { tipo: 'testo', testo: 'Inizio' },
      { tipo: 'errore', messaggio: 'Collegamento interrotto. Riprova tra poco.' },
    ])
  })

  it('annullata: non arriva nessun evento e non lancia', async () => {
    const controllo = new AbortController()
    controllo.abort()
    rispondi(() => Promise.reject(new DOMException('annullata', 'AbortError')))
    expect(await eventiDi(controllo.signal)).toEqual([])
  })
})

describe('chiediAlFoglietto', () => {
  it('restituisce la risposta del backend', async () => {
    const risposta = { risposta: 'Una al giorno', sezione: 3, trovata: true, origine: 'foglietto', brani: [] }
    rispondi(Response.json(risposta))
    await expect(chiediAlFoglietto('027161', 'Come lo prendo?', '5 mg')).resolves.toEqual(risposta)
  })

  it.each([
    [429, 'Hai fatto molte domande di seguito. Aspetta un minuto e riprova.'],
    [404, 'Questo farmaco non è nella banca dati AIFA.'],
    [502, 'Il foglietto illustrativo non è disponibile in questo momento. Riprova tra poco.'],
    [500, 'Il servizio non è disponibile in questo momento. Riprova tra poco.'],
  ])('stato %i: ErroreServizio con il messaggio per la persona', async (stato, messaggio) => {
    rispondi(new Response('', { status: stato }))
    await expect(chiediAlFoglietto('027161', 'Domanda', '')).rejects.toEqual(new ErroreServizio(messaggio))
  })

  it('rete assente: ErroreServizio; annullata: rilancia l’annullamento', async () => {
    rispondi(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(chiediAlFoglietto('027161', 'Domanda', '')).rejects.toEqual(new ErroreServizio('Collegamento interrotto. Riprova tra poco.'))
    const controllo = new AbortController()
    controllo.abort()
    rispondi(() => Promise.reject(new DOMException('annullata', 'AbortError')))
    await expect(chiediAlFoglietto('027161', 'Domanda', '', controllo.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('apriFoglietto', () => {
  const info = { cod: '027161', nome: 'TRIATEC', pagine: 13, sezioni: [{ numero: 1, titolo: 'A cosa serve', pagina: 1 }] }
  let pdf: { destroy: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    pdf = { destroy: vi.fn(async () => undefined) }
  })

  it('restituisce dati e PDF, chiedendo il foglio della confezione prescritta', async () => {
    const chiamata = vi.fn(async () => Response.json(info))
    vi.stubGlobal('fetch', chiamata)
    vi.mocked(apriPdf).mockResolvedValue(pdf as never)
    await expect(apriFoglietto('027161', '5 mg compresse')).resolves.toEqual({ info, pdf })
    expect((chiamata.mock.calls[0] as unknown as [string])[0]).toBe('/api/foglietti/027161?forma=5+mg+compresse')
    expect(apriPdf).toHaveBeenCalledWith('/api/foglietti/027161/pdf')
  })

  it('se i dati falliscono chiude il PDF già aperto e dà il messaggio giusto', async () => {
    rispondi(new Response('', { status: 404 }))
    vi.mocked(apriPdf).mockResolvedValue(pdf as never)
    await expect(apriFoglietto('999999', '')).rejects.toEqual(new ErroreServizio('Questo farmaco non è nella banca dati AIFA.'))
    expect(pdf.destroy).toHaveBeenCalled()
  })

  it('se il PDF non si apre: foglietto non disponibile', async () => {
    rispondi(Response.json(info))
    vi.mocked(apriPdf).mockRejectedValue(new Error('pdf.js: file rotto'))
    await expect(apriFoglietto('027161', '')).rejects.toEqual(
      new ErroreServizio('Il foglietto illustrativo non è disponibile in questo momento. Riprova tra poco.'),
    )
  })
})
