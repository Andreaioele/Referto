import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  domandaFoglietto,
  ErroreServizio,
  infoFoglietto,
  urlPdfFoglietto,
  type InfoFoglietto,
  type RispostaFoglietto,
} from '../api'
import { Icona } from '../Icona'
import { useDialogo } from '../useDialogo'
import { PaginaPdf } from './PaginaPdf'
import { MarchioFoglio } from './Marchio'
import { apriPdf } from './pdf'
import type { FarmacoDaLeggere } from './tipi'

interface Scambio {
  domanda: string
  stato: 'attesa' | 'pronta' | 'errore'
  risposta?: RispostaFoglietto
  errore?: string
}

const DOMANDE_PRONTE = ['A cosa serve?', 'Come lo prendo?', 'Se dimentico una dose?', 'Posso prenderlo con altri medicinali?']
const ZOOM = { minimo: 75, massimo: 175, passo: 25 }
const SULLA_DOSE = /come (lo |la )?prend|quant[aei] (ne )?(prend|devo)|quante gocce|quante compresse/i

/** Nome come lo scrive una persona: "TRIATEC" -> "Triatec". */
function nomeLeggibile(nome: string): string {
  return nome.charAt(0) + nome.slice(1).toLowerCase()
}

/**
 * Lettore del foglio illustrativo ufficiale AIFA, dentro il portale: il PDF
 * con le sue sezioni e, accanto, le domande all'agente di Referto. Ogni
 * risposta dice da quale sezione viene e porta il lettore a quella pagina.
 */
export function LettoreFoglietto({ farmaco, onChiudi }: { farmaco: FarmacoDaLeggere; onChiudi: () => void }) {
  const cod = farmaco.codiceAifa
  const forma = farmaco.confezione
  const [info, setInfo] = useState<InfoFoglietto | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [citata, setCitata] = useState<number | null>(null)
  const [vista, setVista] = useState<'leggi' | 'domande'>('leggi')
  const [domandeAperte, setDomandeAperte] = useState(true)
  const [scambi, setScambi] = useState<Scambio[]>([])
  const [bozza, setBozza] = useState('')
  const finestra = useDialogo<HTMLDivElement>(onChiudi)
  const fineDomande = useRef<HTMLDivElement>(null)
  const controllo = useRef<AbortController | null>(null)

  useEffect(() => {
    const segnale = new AbortController()
    let documento: PDFDocumentProxy | null = null
    Promise.all([infoFoglietto(cod, forma, segnale.signal), apriPdf(urlPdfFoglietto(cod))])
      .then(([dati, aperto]) => {
        documento = aperto
        if (segnale.signal.aborted) return void aperto.destroy()
        setInfo(dati)
        setPdf(aperto)
        // Si apre sul foglio della formulazione prescritta, non per forza sulla prima pagina del PDF.
        setPagina(dati.sezioni[0]?.pagina ?? 1)
      })
      .catch((e: unknown) => {
        if (segnale.signal.aborted) return
        setErrore(e instanceof ErroreServizio ? e.message : 'Il foglietto illustrativo non è disponibile in questo momento. Riprova tra poco.')
      })
    return () => {
      segnale.abort()
      void documento?.destroy()
      controllo.current?.abort()
    }
  }, [cod, forma])

  useEffect(() => {
    fineDomande.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [scambi])

  const nome = info ? nomeLeggibile(info.nome) : farmaco.nome
  const totale = info?.pagine ?? pdf?.numPages ?? 0
  const sezioni = info?.sezioni ?? []
  const sezioneCitata = sezioni.find((s) => s.numero === citata)
  const inAttesa = scambi.some((s) => s.stato === 'attesa')

  function vaiAllaSezione(numero: number, cita = false) {
    const sezione = sezioni.find((s) => s.numero === numero)
    if (!sezione) return
    setPagina(sezione.pagina)
    setCitata(cita ? numero : null)
    setVista('leggi')
  }

  async function chiedi(domanda: string) {
    const testo = domanda.trim()
    if (!testo || inAttesa) return
    setBozza('')
    setScambi((attuali) => [...attuali, { domanda: testo, stato: 'attesa' }])
    controllo.current = new AbortController()
    try {
      const risposta = await domandaFoglietto(cod, testo, forma, controllo.current.signal)
      setScambi((attuali) => attuali.map((s, i) => (i === attuali.length - 1 ? { ...s, stato: 'pronta', risposta } : s)))
      if (risposta.sezione) {
        const sezione = sezioni.find((s) => s.numero === risposta.sezione)
        if (sezione) {
          setPagina(sezione.pagina)
          setCitata(sezione.numero)
        }
      }
    } catch (e) {
      if (controllo.current.signal.aborted) return
      const messaggio = e instanceof ErroreServizio ? e.message : 'Collegamento interrotto. Riprova tra poco.'
      setScambi((attuali) => attuali.map((s, i) => (i === attuali.length - 1 ? { ...s, stato: 'errore', errore: messaggio } : s)))
    }
  }

  function invio(evento: FormEvent) {
    evento.preventDefault()
    void chiedi(bozza)
  }

  const sezioniDellaPagina = sezioni.filter((s) => s.pagina === pagina)

  return (
    <div
      className={`lettore vista-${vista}${domandeAperte ? '' : ' domande-chiuse'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titolo-lettore"
      ref={finestra}
    >
      <div className="lettore-testa">
        <button type="button" className="lettore-indietro" onClick={onChiudi} aria-label="Torna alle prescrizioni" data-fuoco-iniziale>
          <Icona nome="indietro" dimensione={22} />
          <span className="solo-computer">Torna alle prescrizioni</span>
        </button>
        <MarchioFoglio dimensione={34} variante="chiaro" />
        <div className="lettore-titolo">
          <strong id="titolo-lettore">Foglietto illustrativo di {nome}</strong>
          <span>{info ? `${info.principio_attivo}, ${nomeLeggibile(info.ditta)}` : farmaco.descrizione}</span>
        </div>
        <button
          type="button"
          className="lettore-attiva-domande solo-computer"
          aria-expanded={domandeAperte}
          onClick={() => setDomandeAperte((a) => !a)}
        >
          <Icona nome="messaggio" dimensione={22} />
          {domandeAperte ? 'Chiudi le domande' : 'Fai una domanda'}
        </button>
      </div>

      <div className="lettore-schede solo-telefono" role="group" aria-label="Leggi o fai una domanda">
        <button type="button" aria-pressed={vista === 'leggi'} onClick={() => setVista('leggi')}>
          Leggi
        </button>
        <button type="button" aria-pressed={vista === 'domande'} onClick={() => setVista('domande')}>
          Fai una domanda
        </button>
      </div>

      <div className="lettore-strumenti">
        <div className="lettore-gruppo">
          <button type="button" className="quadrato" aria-label="Pagina precedente" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            <Icona nome="indietro" dimensione={22} />
          </button>
          <span className="lettore-pagina" aria-live="polite">
            {totale ? (
              <>
                <span className="solo-computer">Pagina </span>
                {pagina} di {totale}
              </>
            ) : (
              '…'
            )}
          </span>
          <button
            type="button"
            className="quadrato"
            aria-label="Pagina successiva"
            disabled={!totale || pagina >= totale}
            onClick={() => setPagina((p) => p + 1)}
          >
            <Icona nome="avanti" dimensione={22} />
          </button>
        </div>
        <div className="lettore-gruppo">
          <span className="tenue piccolo solo-computer">Grandezza del testo</span>
          <button
            type="button"
            className="quadrato"
            aria-label="Testo più piccolo"
            disabled={zoom <= ZOOM.minimo}
            onClick={() => setZoom((z) => z - ZOOM.passo)}
          >
            A−
          </button>
          <span className="lettore-zoom solo-computer">{zoom}%</span>
          <button
            type="button"
            className="quadrato"
            aria-label="Testo più grande"
            disabled={zoom >= ZOOM.massimo}
            onClick={() => setZoom((z) => z + ZOOM.passo)}
          >
            A+
          </button>
        </div>
        <div className="lettore-gruppo solo-computer">
          <a className="bottone-leggero" href={urlPdfFoglietto(cod)} target="_blank" rel="noreferrer">
            <Icona nome="stampa" dimensione={20} />
            Stampa
          </a>
          <a className="bottone-leggero" href={urlPdfFoglietto(cod)} download={`foglietto-${nome}.pdf`}>
            <Icona nome="scarica" dimensione={20} />
            Scarica il PDF
          </a>
        </div>
      </div>

      <div className="lettore-corpo">
        {sezioni.length > 0 && (
          <nav className="lettore-sezioni" aria-label="Sezioni del foglietto">
            <span className="lettore-sezioni-titolo">Sezioni</span>
            {info?.titolo_foglio && <span className="lettore-foglio tenue piccolo">{info.titolo_foglio}</span>}
            {sezioni.map((sezione) => (
              <button
                key={sezione.numero}
                type="button"
                aria-current={sezioniDellaPagina.includes(sezione) ? 'true' : undefined}
                onClick={() => vaiAllaSezione(sezione.numero)}
              >
                <span className="lettore-sezione-numero">{sezione.numero}</span>
                <span>{sezione.titolo}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="lettore-vista">
          {errore ? (
            <div className="lettore-messaggio">
              <p>{errore}</p>
            </div>
          ) : !pdf ? (
            <div className="lettore-messaggio">
              <p className="referto-attesa" role="status">
                <span className="rotella" aria-hidden="true" />
                Sto aprendo il foglietto ufficiale dell'AIFA…
              </p>
            </div>
          ) : (
            <>
              {sezioneCitata && sezioneCitata.pagina === pagina && (
                <p className="lettore-citata">
                  <span className="referto-citata-etichetta">Citata nella risposta</span>
                  Sezione {sezioneCitata.numero} · {sezioneCitata.titolo}
                </p>
              )}
              <PaginaPdf pdf={pdf} numero={pagina} zoom={zoom} etichetta={`Pagina ${pagina} di ${totale} del foglietto di ${nome}`} />
            </>
          )}
        </div>

        <aside className="lettore-domande" aria-label="Domande su questo foglietto">
          <div className="lettore-domande-testa">
            <MarchioFoglio dimensione={34} variante="scuro" />
            <div>
              <strong>Domande su questo foglietto</strong>
              <span>Rispondo solo con ciò che c'è scritto</span>
            </div>
          </div>
          <div className="lettore-domande-corpo" aria-live="polite">
            <div className="referto-box">
              <p>
                Fammi una domanda su {nome}. Ti dico cosa dice il foglietto e in quale sezione trovarlo. Non do consigli:
                per quelli c'è il medico o il farmacista.
              </p>
            </div>
            {scambi.map((scambio, indice) => (
              <div key={indice} className="referto-scambio">
                <p className="referto-domanda">{scambio.domanda}</p>
                <section className={scambio.stato === 'errore' ? 'referto-box referto-errore' : 'referto-box'}>
                  {scambio.stato === 'attesa' && (
                    <p className="referto-attesa" role="status">
                      <span className="rotella" aria-hidden="true" />
                      Cerco la risposta nel foglietto… può servire mezzo minuto.
                    </p>
                  )}
                  {scambio.stato === 'errore' && <p>{scambio.errore}</p>}
                  {scambio.risposta && <RispostaDelFoglietto scambio={scambio} risposta={scambio.risposta} farmaco={farmaco} onVai={vaiAllaSezione} />}
                </section>
              </div>
            ))}
            <div ref={fineDomande} />
          </div>
          <div className="referto-piede">
            <div className="referto-suggerimenti">
              {DOMANDE_PRONTE.map((domanda) => (
                <button key={domanda} type="button" className="referto-chip" disabled={inAttesa || !info} onClick={() => void chiedi(domanda)}>
                  {domanda}
                </button>
              ))}
            </div>
            <form className="referto-chiedi" onSubmit={invio}>
              <label htmlFor="domanda-foglietto" className="nascosto">
                Fai una domanda sul foglietto
              </label>
              <input
                id="domanda-foglietto"
                type="text"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                placeholder="Scrivi la tua domanda"
                maxLength={500}
                disabled={!info}
              />
              <button type="submit" className="referto-invia" aria-label="Invia la domanda" disabled={inAttesa || bozza.trim().length < 2}>
                <Icona nome="invia" dimensione={22} />
              </button>
            </form>
            <span className="tenue piccolo">
              Non è un consiglio di Referto. Per le urgenze chiama il <strong>112</strong>.
            </span>
          </div>
        </aside>
      </div>

      <div className="lettore-piede">
        <span>
          Fonte: Banca Dati Farmaci AIFA, documento ufficiale
          {info && (
            <>
              {' · '}
              <a href={info.url_aifa} target="_blank" rel="noreferrer">
                Apri sul sito AIFA
              </a>
            </>
          )}
        </span>
        <span>Per dubbi sulla terapia parlane con il medico o con il farmacista.</span>
      </div>
    </div>
  )
}

function RispostaDelFoglietto({
  scambio,
  risposta,
  farmaco,
  onVai,
}: {
  scambio: Scambio
  risposta: RispostaFoglietto
  farmaco: FarmacoDaLeggere
  onVai: (sezione: number, cita: boolean) => void
}) {
  const fonti = risposta.brani.filter((b) => b.sezione === risposta.sezione)
  const sezione = fonti[0] ?? risposta.brani.find((b) => b.sezione === risposta.sezione)
  return (
    <>
      <p>{risposta.risposta}</p>
      {risposta.trovata && farmaco.doseScritta && SULLA_DOSE.test(scambio.domanda) && (
        <div className="referto-ricetta">
          Nella tua ricetta il medico ha scritto: <strong>{farmaco.doseScritta}</strong>
        </div>
      )}
      {risposta.trovata && sezione && (
        <button type="button" className="referto-fonte" onClick={() => onVai(sezione.sezione, true)}>
          <Icona nome="documento" dimensione={18} />
          Sezione {sezione.sezione} · {sezione.titolo}
        </button>
      )}
      {risposta.trovata && fonti.length > 0 && risposta.origine === 'agente' && (
        <details className="referto-brani">
          <summary>Cosa dice il foglietto</summary>
          {fonti.map((brano, indice) => (
            <p key={indice}>{brano.testo}</p>
          ))}
        </details>
      )}
      {!risposta.trovata && <span className="referto-non-trovato">Non trovato nel foglietto</span>}
    </>
  )
}
