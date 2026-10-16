import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { apriFoglietto, chiediAlFoglietto, ErroreServizio, type InfoFoglietto, type RispostaFoglietto } from './cliente'
import type { FarmacoDaLeggere } from './tipi'
import { t } from '../lingua/lingua'

export interface Scambio {
  /** La domanda come la riceve l'agente del foglietto (in italiano). */
  domanda: string
  /** La domanda come la vede la persona, se diversa (interfaccia in inglese). */
  mostra?: string
  stato: 'attesa' | 'pronta' | 'errore'
  risposta?: RispostaFoglietto
  errore?: string
}

/**
 * Stato del lettore del foglietto: caricamento di dati e PDF, pagina, domande e
 * citazioni. Una risposta che cita una sezione porta il lettore alla sua pagina.
 * Alla chiusura annulla le richieste e chiude il PDF. Il componente tiene solo
 * lo stato della vista (zoom, schede, bozza).
 */
export function useFoglietto(farmaco: FarmacoDaLeggere) {
  const { codiceAifa: cod, confezione: forma } = farmaco
  const [info, setInfo] = useState<InfoFoglietto | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)
  const [citata, setCitata] = useState<number | null>(null)
  const [scambi, setScambi] = useState<Scambio[]>([])
  const domandaInCorso = useRef<AbortController | null>(null)

  useEffect(() => {
    const caricamento = new AbortController()
    let aperto: PDFDocumentProxy | null = null
    apriFoglietto(cod, forma, caricamento.signal)
      .then((risultato) => {
        aperto = risultato.pdf
        if (caricamento.signal.aborted) return void risultato.pdf.destroy()
        setInfo(risultato.info)
        setPdf(risultato.pdf)
        // Si apre sul foglio della formulazione prescritta, non per forza sulla prima pagina del PDF.
        setPagina(risultato.info.sezioni[0]?.pagina ?? 1)
      })
      .catch((motivo: unknown) => {
        if (caricamento.signal.aborted) return
        setErrore(motivo instanceof ErroreServizio ? motivo.message : t('Il foglietto illustrativo non è disponibile in questo momento. Riprova tra poco.'))
      })
    return () => {
      caricamento.abort()
      void aperto?.destroy()
      domandaInCorso.current?.abort()
    }
  }, [cod, forma])

  const totale = info?.pagine ?? pdf?.numPages ?? 0
  const sezioni = info?.sezioni ?? []
  const inAttesa = scambi.some((s) => s.stato === 'attesa')

  /** Porta il lettore alla pagina della sezione; con `cita` la segna come citata. */
  const vaiAllaSezione = (numero: number, cita = false) => {
    const sezione = sezioni.find((s) => s.numero === numero)
    if (!sezione) return
    setPagina(sezione.pagina)
    setCitata(cita ? numero : null)
  }

  /**
   * Fa la domanda; restituisce false se non può partire (vuota, foglio non pronto, un'altra in corso).
   * `mostra` è il testo a schermo se diverso; `prepara` trasforma la domanda prima di mandarla
   * (traduzione in italiano), mentre a schermo si vede subito.
   */
  const chiedi = (
    domanda: string,
    { mostra, prepara }: { mostra?: string; prepara?: (segnale: AbortSignal) => Promise<string> } = {},
  ): boolean => {
    const testo = domanda.trim()
    if (!testo || !info || domandaInCorso.current) return false
    const indice = scambi.length
    const aggiorna = (modifica: Partial<Scambio>) =>
      setScambi((attuali) => attuali.map((s, i) => (i === indice ? { ...s, ...modifica } : s)))
    const controllo = (domandaInCorso.current = new AbortController())
    setScambi((attuali) => [...attuali, { domanda: testo, mostra, stato: 'attesa' }])
    const richiesta = prepara
      ? prepara(controllo.signal).then((daMandare) => {
          if (daMandare !== testo) aggiorna({ domanda: daMandare })
          return chiediAlFoglietto(cod, daMandare, forma, controllo.signal)
        })
      : chiediAlFoglietto(cod, testo, forma, controllo.signal)
    richiesta
      .then((risposta) => {
        aggiorna({ stato: 'pronta', risposta })
        const sezione = risposta.sezione ? sezioni.find((s) => s.numero === risposta.sezione) : undefined
        if (sezione) {
          setPagina(sezione.pagina)
          setCitata(sezione.numero)
        }
      })
      .catch((motivo: unknown) => {
        if (controllo.signal.aborted) return
        aggiorna({ stato: 'errore', errore: motivo instanceof ErroreServizio ? motivo.message : t('Collegamento interrotto. Riprova tra poco.') })
      })
      .finally(() => {
        if (domandaInCorso.current === controllo) domandaInCorso.current = null
      })
    return true
  }

  return {
    info,
    pdf,
    errore,
    pagina,
    totale,
    sezioni,
    /** Sezione citata dall'ultima risposta, se il lettore è ancora su quella. */
    sezioneCitata: sezioni.find((s) => s.numero === citata),
    sezioniDellaPagina: sezioni.filter((s) => s.pagina === pagina),
    scambi,
    inAttesa,
    paginaPrecedente: () => setPagina((p) => Math.max(1, p - 1)),
    paginaSuccessiva: () => setPagina((p) => (totale ? Math.min(totale, p + 1) : p)),
    vaiAllaSezione,
    chiedi,
  }
}
