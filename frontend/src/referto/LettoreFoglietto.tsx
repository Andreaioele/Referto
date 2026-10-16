import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icona } from '../Icona'
import { useDialogo } from '../useDialogo'
import { PaginaPdf } from './PaginaPdf'
import { urlPdfFoglietto, type RispostaFoglietto } from './cliente'
import type { FarmacoDaLeggere } from './tipi'
import { useFoglietto, type Scambio } from './useFoglietto'
import { domandaPerReferto, useTraduzione } from './useTraduzione'
import { t, useLingua } from '../lingua/lingua'

const DOMANDE_PRONTE = ['A cosa serve?', 'Come lo prendo?', 'Se dimentico una dose?', 'Posso prenderlo con altri medicinali?']
const ZOOM = { minimo: 75, massimo: 175, passo: 25 }
const SULLA_DOSE =
  /come (lo |la )?prend|quant[aei] (ne )?(prend|devo)|quante gocce|quante compresse|how (do|should) i take|how (much|many)/i

/** Nome come lo scrive una persona: "TRIATEC" -> "Triatec". */
function nomeLeggibile(nome: string): string {
  return nome.charAt(0) + nome.slice(1).toLowerCase()
}

/**
 * Lettore del foglio illustrativo ufficiale AIFA, dentro il portale: il PDF
 * con le sue sezioni e, accanto, le domande all'agente di Referto. Ogni
 * risposta dice da quale sezione viene e porta il lettore a quella pagina.
 * Dati, pagina e domande sono in useFoglietto; qui c'è solo la vista.
 */
export function LettoreFoglietto({ farmaco, onChiudi }: { farmaco: FarmacoDaLeggere; onChiudi: () => void }) {
  const foglietto = useFoglietto(farmaco)
  const { info, pdf, errore, pagina, totale, sezioni, sezioneCitata, sezioniDellaPagina, scambi, inAttesa } = foglietto
  const cod = farmaco.codiceAifa
  const [zoom, setZoom] = useState(100)
  const [vista, setVista] = useState<'leggi' | 'domande'>('leggi')
  const [domandeAperte, setDomandeAperte] = useState(true)
  const [bozza, setBozza] = useState('')
  const finestra = useDialogo<HTMLDivElement>(onChiudi)
  const fineDomande = useRef<HTMLDivElement>(null)
  const lingua = useLingua()

  useEffect(() => {
    fineDomande.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [scambi])

  const nome = info ? nomeLeggibile(info.nome) : farmaco.nome

  function vaiAllaSezione(numero: number, cita = false) {
    foglietto.vaiAllaSezione(numero, cita)
    setVista('leggi')
  }

  function invio(evento: FormEvent) {
    evento.preventDefault()
    const domanda = bozza.trim()
    // L'agente del foglietto riceve le domande in italiano: quelle scritte in inglese si traducono prima.
    const prepara = lingua === 'en' ? (segnale: AbortSignal) => domandaPerReferto(domanda, lingua, segnale) : undefined
    if (foglietto.chiedi(domanda, { prepara })) setBozza('')
  }


  return (
    <div
      className={`lettore vista-${vista}${domandeAperte ? '' : ' domande-chiuse'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titolo-lettore"
      ref={finestra}
    >
      <div className="lettore-testa">
        <button type="button" className="lettore-indietro" onClick={onChiudi} aria-label={t('Torna alle prescrizioni')} data-fuoco-iniziale>
          <Icona nome="indietro" dimensione={22} />
          <span className="solo-computer">{t('Torna alle prescrizioni')}</span>
        </button>
        <span className="referto-marchio piccolo-marchio" aria-hidden="true">
          R
        </span>
        <div className="lettore-titolo">
          <strong id="titolo-lettore">{t('Foglietto illustrativo')} · {nome}</strong>
          <span>{info ? `${info.principio_attivo} · ${nomeLeggibile(info.ditta)}` : farmaco.descrizione}</span>
        </div>
        <button
          type="button"
          className="lettore-attiva-domande solo-computer"
          aria-expanded={domandeAperte}
          onClick={() => setDomandeAperte((a) => !a)}
        >
          <Icona nome="messaggio" dimensione={22} />
          {domandeAperte ? t('Chiudi le domande') : t('Fai una domanda')}
        </button>
      </div>

      <div className="lettore-schede solo-telefono" role="group" aria-label={t('Leggi o fai una domanda')}>
        <button type="button" aria-pressed={vista === 'leggi'} onClick={() => setVista('leggi')}>
          {t('Leggi')}
        </button>
        <button type="button" aria-pressed={vista === 'domande'} onClick={() => setVista('domande')}>
          {t('Fai una domanda')}
        </button>
      </div>

      <div className="lettore-strumenti">
        <div className="lettore-gruppo">
          <button type="button" className="quadrato" aria-label={t('Pagina precedente')} disabled={pagina <= 1} onClick={foglietto.paginaPrecedente}>
            <Icona nome="indietro" dimensione={22} />
          </button>
          <span className="lettore-pagina" aria-live="polite">
            {totale ? (
              <>
                <span className="solo-computer">{t('Pagina')} </span>
                {t('{pagina} di {totale}', { pagina, totale })}
              </>
            ) : (
              '…'
            )}
          </span>
          <button
            type="button"
            className="quadrato"
            aria-label={t('Pagina successiva')}
            disabled={!totale || pagina >= totale}
            onClick={foglietto.paginaSuccessiva}
          >
            <Icona nome="avanti" dimensione={22} />
          </button>
        </div>
        <div className="lettore-gruppo">
          <span className="tenue piccolo solo-computer">{t('Grandezza del testo')}</span>
          <button
            type="button"
            className="quadrato"
            aria-label={t('Testo più piccolo')}
            disabled={zoom <= ZOOM.minimo}
            onClick={() => setZoom((z) => z - ZOOM.passo)}
          >
            A−
          </button>
          <span className="lettore-zoom solo-computer">{zoom}%</span>
          <button
            type="button"
            className="quadrato"
            aria-label={t('Testo più grande')}
            disabled={zoom >= ZOOM.massimo}
            onClick={() => setZoom((z) => z + ZOOM.passo)}
          >
            A+
          </button>
        </div>
        <div className="lettore-gruppo solo-computer">
          <a className="bottone-leggero" href={urlPdfFoglietto(cod)} target="_blank" rel="noreferrer">
            <Icona nome="stampa" dimensione={20} />
            {t('Stampa')}
          </a>
          <a className="bottone-leggero" href={urlPdfFoglietto(cod)} download={`foglietto-${nome}.pdf`}>
            <Icona nome="scarica" dimensione={20} />
            {t('Scarica il PDF')}
          </a>
        </div>
      </div>

      <div className="lettore-corpo">
        {sezioni.length > 0 && (
          <nav className="lettore-sezioni" aria-label={t('Sezioni del foglietto')}>
            <span className="lettore-sezioni-titolo">{t('Sezioni')}</span>
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
                {t("Sto aprendo il foglietto ufficiale dell'AIFA…")}
              </p>
            </div>
          ) : (
            <>
              {sezioneCitata && sezioneCitata.pagina === pagina && (
                <p className="lettore-citata">
                  <span className="pastiglia pastiglia-referto">{t('Citata nella risposta')}</span>
                  {t('Sezione {n}', { n: sezioneCitata.numero })} · {sezioneCitata.titolo}
                </p>
              )}
              <PaginaPdf pdf={pdf} numero={pagina} zoom={zoom} etichetta={t('Pagina {pagina} di {totale} del foglietto di {nome}', { pagina, totale, nome })} />
            </>
          )}
        </div>

        <aside className="lettore-domande" aria-label={t('Domande su questo foglietto')}>
          <div className="lettore-domande-testa">
            <span className="referto-marchio piccolo-marchio" aria-hidden="true">
              R
            </span>
            <div>
              <strong>{t('Domande su questo foglietto')}</strong>
              <span>{t("Rispondo solo con ciò che c'è scritto")}</span>
            </div>
          </div>
          <div className="lettore-domande-corpo" aria-live="polite">
            <div className="referto-box">
              <p>
                {t(
                  "Fammi una domanda su {nome}. Ti dico cosa dice il foglietto e in quale sezione trovarlo. Non do consigli: per quelli c'è il medico o il farmacista.",
                  { nome },
                )}
              </p>
            </div>
            {scambi.map((scambio, indice) => (
              <div key={indice} className="referto-scambio">
                <p className="referto-domanda">{scambio.mostra ?? scambio.domanda}</p>
                <section className={scambio.stato === 'errore' ? 'referto-box referto-errore' : 'referto-box'}>
                  {scambio.stato === 'attesa' && (
                    <p className="referto-attesa" role="status">
                      <span className="rotella" aria-hidden="true" />
                      {t('Cerco la risposta nel foglietto… può servire mezzo minuto.')}
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
                <button
                  key={domanda}
                  type="button"
                  className="referto-chip"
                  disabled={inAttesa || !info}
                  onClick={() => foglietto.chiedi(domanda, { mostra: t(domanda) })}
                >
                  {t(domanda)}
                </button>
              ))}
            </div>
            <form className="referto-chiedi" onSubmit={invio}>
              <label htmlFor="domanda-foglietto" className="nascosto">
                {t('Fai una domanda sul foglietto')}
              </label>
              <input
                id="domanda-foglietto"
                type="text"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                placeholder={t('Scrivi la tua domanda')}
                maxLength={500}
                disabled={!info}
              />
              <button type="submit" className="referto-invia" aria-label={t('Invia la domanda')} disabled={inAttesa || bozza.trim().length < 2}>
                <Icona nome="invia" dimensione={22} />
              </button>
            </form>
            <span className="tenue piccolo">
              {t('Non è un consiglio di Referto. Per le urgenze chiama il')} <strong>112</strong>.
            </span>
          </div>
        </aside>
      </div>

      <div className="lettore-piede">
        <span>
          {t('Fonte: Banca Dati Farmaci AIFA, documento ufficiale')}
          {info && (
            <>
              {' · '}
              <a href={info.url_aifa} target="_blank" rel="noreferrer">
                {t('Apri sul sito AIFA')}
              </a>
            </>
          )}
        </span>
        <span>{t('Per dubbi sulla terapia parlane con il medico o con il farmacista.')}</span>
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
  // La risposta la scrive l'agente in italiano: in inglese si traduce; i brani del foglietto restano com'è il documento.
  const traduzione = useTraduzione([risposta.risposta])
  if (!traduzione.pronta) {
    return (
      <p className="referto-attesa" role="status">
        <span className="rotella" aria-hidden="true" />
        {t('Sto traducendo la risposta in inglese…')}
      </p>
    )
  }
  const tradotta = traduzione.testi[0]
  return (
    <>
      <p>{tradotta.testo}</p>
      {!tradotta.tradotto && (
        <span className="referto-citazione">{t('Mostrato in italiano: la traduzione non ha passato il controllo.')}</span>
      )}
      {risposta.trovata && farmaco.doseScritta && SULLA_DOSE.test(scambio.domanda) && (
        <div className="referto-ricetta">
          {t('Nella tua ricetta il medico ha scritto:')} <strong>{t(farmaco.doseScritta)}</strong>
        </div>
      )}
      {risposta.trovata && sezione && (
        <button type="button" className="referto-fonte" onClick={() => onVai(sezione.sezione, true)}>
          <Icona nome="documento" dimensione={18} />
          {t('Sezione {n}', { n: sezione.sezione })} · {sezione.titolo}
        </button>
      )}
      {risposta.trovata && fonti.length > 0 && risposta.origine === 'agente' && (
        <details className="referto-brani">
          <summary>{t('Cosa dice il foglietto')}</summary>
          {fonti.map((brano, indice) => (
            <p key={indice}>{brano.testo}</p>
          ))}
        </details>
      )}
      {!risposta.trovata && <span className="pastiglia pastiglia-avviso">{t('Non trovato nel foglietto')}</span>}
    </>
  )
}
