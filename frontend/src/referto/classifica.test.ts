import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifica, ErroreServizio } from './cliente'

/** Mother agent finto: manda i pezzi indicati, uno ogni `pausa` ms; tiene il conto degli annullamenti. */
function motherFinto(pezzi: string[], pausa = 5) {
  const stato = { annullato: false, corpi: [] as unknown[] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, opzioni: RequestInit) => {
      stato.corpi.push(JSON.parse(String(opzioni.body)))
      opzioni.signal?.addEventListener('abort', () => (stato.annullato = true))
      const enc = new TextEncoder()
      const corpo = new ReadableStream<Uint8Array>({
        async start(c) {
          for (const pezzo of pezzi) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ tipo: 'testo', testo: pezzo })}\n\n`))
            await new Promise((r) => setTimeout(r, pausa))
          }
          c.enqueue(enc.encode('data: {"tipo":"fine","conversazione":"c1"}\n\n'))
          c.close()
        },
      })
      return new Response(corpo, { status: 200 })
    }),
  )
  return stato
}

afterEach(() => vi.unstubAllGlobals())

describe('classifica', () => {
  it('manda il referto e si ferma appena la riga ARGOMENTO è completa', async () => {
    const stato = motherFinto(['ARGOMENTO: Ecografia della tiroide · Endo', 'crinologia e diabetologia\nSINTESI\n', 'Testo che non serve.'], 30)
    const risultato = await classifica('TESTO DEL REFERTO')
    expect(risultato).toEqual({ esame: 'Ecografia della tiroide', area: 'Endocrinologia e diabetologia' })
    expect(stato.corpi).toEqual([{ messaggio: 'TESTO DEL REFERTO' }])
    expect(stato.annullato).toBe(true)
  })

  it('accetta la riga ARGOMENTO anche se il flusso finisce senza a capo', async () => {
    motherFinto(['ARGOMENTO: Esami del sangue · Laboratorio analisi'])
    await expect(classifica('referto')).resolves.toEqual({ esame: 'Esami del sangue', area: 'Laboratorio analisi' })
  })

  it('senza riga ARGOMENTO: ErroreServizio che invita a scegliere l’area', async () => {
    motherFinto(['Ecco la spiegazione senza argomento.'])
    await expect(classifica('referto')).rejects.toEqual(
      new ErroreServizio('Non sono riuscito a capire di che area è il referto. Puoi sceglierla tu qui sotto.'),
    )
  })

  it('se il servizio non risponde passa il messaggio per la persona', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(classifica('referto')).rejects.toEqual(new ErroreServizio('Il servizio non è disponibile in questo momento. Riprova tra poco.'))
  })

  it('annullata: lancia l’annullamento e chiude il flusso', async () => {
    const stato = motherFinto(['Prima parte senza', ' argomento', ' ancora'], 50)
    const controllo = new AbortController()
    const promessa = classifica('referto', controllo.signal)
    setTimeout(() => controllo.abort(), 20)
    await expect(promessa).rejects.toMatchObject({ name: 'AbortError' })
    expect(stato.annullato).toBe(true)
  })
})
