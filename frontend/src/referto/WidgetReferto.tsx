import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { statoBackend, type StatoBackend } from './cliente'
import { Collegamento } from '../Collegamento'
import { Icona } from '../Icona'
import { useDialogo } from '../useDialogo'
import { leggiSpiegazione, senzaChiusura } from './spiegazione'
import { salvaClassificazione } from './classificazioni'
import { domandePronte } from './domande-pronte'
import type { RefertoDaSpiegare } from './tipi'
import { useChat, type Messaggio } from './useChat'
import { locale, t } from '../lingua/lingua'

const LUNGHEZZA_MASSIMA = 30000
const LIMITI_ASSENTI = /^(non sono riportati limiti specifici|no specific limits are reported)\.?$/i

function Caricamento({ testo }: { testo: string }) {
  return (
    <p className="referto-attesa" role="status">
      <span className="rotella" aria-hidden="true" />
      {testo}
    </p>
  )
}

/** La spiegazione del referto: le parti del Mother agent più i dati del referto che si possono verificare. */
function Spiegazione({
  risposta,
  referto,
  inCorso,
  onChiudi,
}: {
  risposta: Messaggio
  referto?: RefertoDaSpiegare
  inCorso: boolean
  onChiudi: () => void
}) {
  const spiegazione = useMemo(() => leggiSpiegazione(risposta.testo), [risposta.testo])
  const argomento = spiegazione.argomento
  // Durante lo streaming la riga ARGOMENTO può essere ancora a metà: vale solo quando è finita.
  const argomentoCompleto = argomento && (!inCorso || /ARGOMENTO:[^\n]*\n/.test(risposta.testo)) ? argomento : undefined

  // La classificazione del Mother agent serve anche a "Le mie strutture": così non lo si richiama.
  useEffect(() => {
    if (referto && argomentoCompleto) salvaClassificazione(referto.id, argomentoCompleto)
  }, [referto, argomentoCompleto])
  const fuori = referto?.valori?.filter((v) => v.fuori) ?? []
  const nellIntervallo = referto?.valori?.filter((v) => !v.fuori) ?? []
  const visitaCollegata = referto?.visitaCollegata
  const { sintesi, spiegazione: semplice, indicazioni, farmaci, limiti } = spiegazione.parti
  const vuota = !sintesi && !semplice && !spiegazione.libero

  if (risposta.errore && vuota) return <p className="referto-errore">{risposta.testo}</p>
  return (
    <>
      {spiegazione.argomento && (
        <p className="referto-argomento">
          {spiegazione.argomento.esame} · {t(spiegazione.argomento.area)}
        </p>
      )}
      {vuota && inCorso && <Caricamento testo={t('Sto leggendo il referto… può servire un minuto.')} />}
      {sintesi && (
        <section className="referto-box">
          <h3>{t('In breve')}</h3>
          <p>{sintesi}</p>
        </section>
      )}
      {fuori.length > 0 && (
        <section className="referto-box">
          <h3>{t("I valori fuori dall'intervallo")}</h3>
          {fuori.map((valore) => (
            <div key={valore.esame} className="referto-valore">
              <div className="referto-valore-numeri">
                <strong>{valore.esame}</strong>
                <span className="referto-valore-numero">
                  {valore.risultato} <small>{valore.unita}</small>
                </span>
                <span className="tenue">
                  {t('intervallo:')} {valore.riferimento}
                </span>
              </div>
              <span className="referto-citazione">
                {t('Dal referto:')} «{valore.esame} {valore.risultato} {valore.unita} · {valore.riferimento}»
              </span>
            </div>
          ))}
        </section>
      )}
      {semplice && (
        <section className="referto-box">
          <h3>{t('In parole semplici')}</h3>
          <p>{semplice}</p>
        </section>
      )}
      {spiegazione.libero && !sintesi && (
        <section className="referto-box">
          <p>{senzaChiusura(spiegazione.libero)}</p>
        </section>
      )}
      {(referto?.noteMedico || indicazioni) && (
        <section className="referto-box">
          <h3>{t('Cosa ha scritto il medico')}</h3>
          {referto?.noteMedico ? (
            <>
              <p className="referto-nota">«{referto.noteMedico}»</p>
              <span className="referto-citazione">{t('Dal referto')}</span>
            </>
          ) : (
            <p>{indicazioni}</p>
          )}
        </section>
      )}
      {farmaci && (
        <section className="referto-box">
          <h3>{t('Farmaci citati nel referto')}</h3>
          <p>{farmaci}</p>
        </section>
      )}
      {visitaCollegata && (sintesi || !inCorso) && (
        <section className="referto-box referto-visita">
          <span className="icona-tonda">
            <Icona nome="calendario" dimensione={22} />
          </span>
          <p>
            {t('Hai già una')} <strong>{t(visitaCollegata.titolo).toLowerCase()}</strong> {visitaCollegata.quando}
            {t(': lì puoi parlarne con il medico.')}
          </p>
          <Collegamento href={visitaCollegata.href} onClick={onChiudi}>
            {t('Vedi la visita')}
          </Collegamento>
        </section>
      )}
      {(referto?.doveAndare || referto?.aChiChiedere) && argomentoCompleto && (sintesi || !inCorso) && (
        <section className="referto-box referto-visita">
          <span className="icona-tonda">
            <Icona nome="luogo" dimensione={22} />
          </span>
          <p>
            {t('Cerca strutture e medici di')} <strong>{t(argomentoCompleto.area).toLowerCase()}</strong>{' '}
            {t('vicino a casa tua e prenota una visita.')}
          </p>
          {referto.doveAndare && (
            <Collegamento href={referto.doveAndare} onClick={onChiudi}>
              {t('Cerca strutture')}
            </Collegamento>
          )}
          {referto.aChiChiedere && (
            <Collegamento href={referto.aChiChiedere} onClick={onChiudi}>
              {t('Cerca professionisti')}
            </Collegamento>
          )}
        </section>
      )}
      {nellIntervallo.length > 0 && (
        <details className="referto-box">
          <summary>{t("Gli altri {n} valori sono nell'intervallo", { n: nellIntervallo.length })}</summary>
          <p>{nellIntervallo.map((v) => v.esame).join(', ')}.</p>
        </details>
      )}
      {limiti && !LIMITI_ASSENTI.test(limiti) && (
        <details className="referto-box">
          <summary>{t('Limiti del referto')}</summary>
          <p>{limiti}</p>
        </details>
      )}
      {risposta.errore && !vuota && <p className="referto-errore">{t('La risposta si è interrotta. Riprova tra poco.')}</p>}
    </>
  )
}

/**
 * Il widget di Referto dentro il portale: pannello laterale (a tutto schermo
 * sul telefono). Riceve dal portale solo il referto scelto (`RefertoDaSpiegare`)
 * e lo manda al Mother agent; senza referto chiede di incollarne il testo.
 */
export function WidgetReferto({ referto, onChiudi }: { referto?: RefertoDaSpiegare; onChiudi: () => void }) {
  const { messaggi, inCorso, daCache, invia, azzera } = useChat()
  const [bozza, setBozza] = useState('')
  const [stato, setStato] = useState<StatoBackend | null>(null)
  const pannello = useDialogo<HTMLDivElement>(onChiudi)

  useEffect(() => {
    if (referto) void invia(referto.testo, { nascosto: true })
    return azzera
  }, [referto, invia, azzera])

  useEffect(() => {
    const controllo = new AbortController()
    statoBackend(controllo.signal).then(setStato, () => undefined)
    return () => controllo.abort()
  }, [])

  const [primaDomanda, primaRisposta, ...seguito] = messaggi
  const iniziato = Boolean(primaDomanda)
  const domande: Array<[Messaggio, Messaggio]> = []
  for (let i = 0; i + 1 < seguito.length; i += 2) domande.push([seguito[i], seguito[i + 1]])

  // Una domanda nuova (pronta o scritta) va in cima al pannello, con la risposta
  // sotto: ci si salta una volta sola, quando la domanda compare.
  const ultimaDomanda = useRef<HTMLDivElement>(null)
  const domandeViste = useRef(domande.length)
  useLayoutEffect(() => {
    if (domande.length > domandeViste.current) {
      const domanda = ultimaDomanda.current
      const corpo = domanda?.closest<HTMLElement>('.referto-corpo')
      // Salto diretto, prima del disegno: la domanda a 12 px dalla cima del pannello.
      if (domanda && corpo) {
        const cima = corpo.scrollTop + domanda.getBoundingClientRect().top - corpo.getBoundingClientRect().top - 12
        corpo.scrollTo?.({ top: cima, behavior: 'instant' })
      }
    }
    domandeViste.current = domande.length
  }, [domande.length])

  function invio(evento: FormEvent) {
    evento.preventDefault()
    const testo = bozza.trim()
    if (!testo || inCorso) return
    setBozza('')
    void invia(testo)
  }

  return (
    <div className="referto-velo" onClick={(e) => e.target === e.currentTarget && onChiudi()}>
      <div className="referto-pannello" role="dialog" aria-modal="true" aria-labelledby="titolo-referto" ref={pannello}>
        <div className="referto-testa">
          <span className="referto-marchio" aria-hidden="true">
            R
          </span>
          <div className="referto-testa-testo">
            <strong id="titolo-referto">Referto</strong>
            <span>{t('Ti spiego il referto in parole semplici')}</span>
          </div>
          <button type="button" className="referto-chiudi" onClick={onChiudi} aria-label={t('Chiudi Referto')} data-fuoco-iniziale>
            <Icona nome="chiudi" dimensione={22} />
          </button>
        </div>
        <div className="referto-contesto">
          <Icona nome="documento" dimensione={20} />
          {referto ? (
            <span>
              {t('Stai leggendo:')}{' '}
              <strong>
                {t(referto.titolo)} · {referto.data}
              </strong>
            </span>
          ) : (
            <span>{t('Il referto che incolli tu')}</span>
          )}
        </div>

        <div className="referto-corpo" aria-live="polite">
          {!iniziato ? (
            <form className="referto-incolla" onSubmit={invio}>
              <label htmlFor="testo-referto">
                <strong>{t('Incolla il testo del referto')}</strong>
              </label>
              <p className="tenue piccolo">{t('Prima togli nome, codice fiscale e indirizzo.')}</p>
              <textarea
                id="testo-referto"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                maxLength={LUNGHEZZA_MASSIMA}
                rows={9}
                placeholder={t('Incolla qui il testo del referto…')}
              />
              <button type="submit" className="bottone bottone-referto" disabled={!bozza.trim()}>
                {t('Spiega il referto')}
              </button>
            </form>
          ) : (
            primaRisposta && <Spiegazione risposta={primaRisposta} referto={referto} inCorso={inCorso && seguito.length === 0} onChiudi={onChiudi} />
          )}

          {domande.map(([domanda, risposta], indice) => (
            <div
              key={indice}
              className={indice === domande.length - 1 ? 'referto-scambio referto-scambio-ultimo' : 'referto-scambio'}
              ref={indice === domande.length - 1 ? ultimaDomanda : undefined}
            >
              <p className="referto-domanda">{domanda.testo}</p>
              <section className={risposta.errore ? 'referto-box referto-errore' : 'referto-box'}>
                {risposta.testo ? (
                  <p>{senzaChiusura(risposta.testo)}</p>
                ) : (
                  <Caricamento testo={t('Sto cercando la risposta nel referto…')} />
                )}
              </section>
            </div>
          ))}

          {iniziato && (
            <details className="referto-box referto-dettagli">
              <summary>{t('Come è fatta questa spiegazione')}</summary>
              <p>
                {t(
                  "La spiegazione la scrive l'assistente di Referto usando solo il testo del referto. I valori e le note del medico sono copiati dal referto così come sono.",
                )}
                {daCache && ` ${t('Questo referto era già stato spiegato: la spiegazione è quella salvata, non è stata riscritta.')}`}
                {stato &&
                  ` ${t('Collegato al prontuario AIFA aggiornato al {data}.', {
                    data: new Date(`${stato.aggiornato}T00:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
                  })}`}
              </p>
            </details>
          )}

          <div className="referto-sicurezza">
            <Icona nome="scudo" dimensione={22} />
            <span>
              {t(
                'Referto non fa diagnosi e non dà consigli: spiega solo ciò che è scritto. Per ogni dubbio parlane con il tuo medico. Per le urgenze chiama il',
              )}{' '}
              <strong>112</strong>.
            </span>
          </div>
        </div>

        {iniziato && (
          <div className="referto-piede">
            {!inCorso && (
              <div className="referto-suggerimenti">
                {domandePronte(referto).map((domanda) => (
                  <button key={domanda} type="button" className="referto-chip" onClick={() => void invia(domanda)}>
                    {domanda}
                  </button>
                ))}
              </div>
            )}
            <form className="referto-chiedi" onSubmit={invio}>
              <label htmlFor="domanda-referto" className="nascosto">
                {t('Fai una domanda su questo referto')}
              </label>
              <input
                id="domanda-referto"
                type="text"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                placeholder={t('Fai una domanda su questo referto')}
                maxLength={2000}
                disabled={inCorso}
              />
              <button type="submit" className="referto-invia" aria-label={t('Invia la domanda')} disabled={inCorso || !bozza.trim()}>
                <Icona nome="invia" dimensione={22} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
