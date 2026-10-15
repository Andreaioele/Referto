import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { statoBackend, type StatoBackend } from './cliente'
import { Collegamento } from '../Collegamento'
import { Icona } from '../Icona'
import { useDialogo } from '../useDialogo'
import { leggiSpiegazione, senzaChiusura } from './spiegazione'
import { salvaClassificazione } from './classificazioni'
import { domandePronte } from './domande-pronte'
import type { RefertoDaSpiegare } from './tipi'
import { useChat, type Messaggio } from './useChat'

const LUNGHEZZA_MASSIMA = 30000
const LIMITI_ASSENTI = /^non sono riportati limiti specifici\.?$/i

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
          {spiegazione.argomento.esame} · {spiegazione.argomento.area}
        </p>
      )}
      {vuota && inCorso && <Caricamento testo="Sto leggendo il referto… può servire un minuto." />}
      {sintesi && (
        <section className="referto-box">
          <h3>In breve</h3>
          <p>{sintesi}</p>
        </section>
      )}
      {fuori.length > 0 && (
        <section className="referto-box">
          <h3>I valori fuori dall'intervallo</h3>
          {fuori.map((valore) => (
            <div key={valore.esame} className="referto-valore">
              <div className="referto-valore-numeri">
                <strong>{valore.esame}</strong>
                <span className="referto-valore-numero">
                  {valore.risultato} <small>{valore.unita}</small>
                </span>
                <span className="tenue">intervallo: {valore.riferimento}</span>
              </div>
              <span className="referto-citazione">
                Dal referto: «{valore.esame} {valore.risultato} {valore.unita} · {valore.riferimento}»
              </span>
            </div>
          ))}
        </section>
      )}
      {semplice && (
        <section className="referto-box">
          <h3>In parole semplici</h3>
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
          <h3>Cosa ha scritto il medico</h3>
          {referto?.noteMedico ? (
            <>
              <p className="referto-nota">«{referto.noteMedico}»</p>
              <span className="referto-citazione">Dal referto</span>
            </>
          ) : (
            <p>{indicazioni}</p>
          )}
        </section>
      )}
      {farmaci && (
        <section className="referto-box">
          <h3>Farmaci citati nel referto</h3>
          <p>{farmaci}</p>
        </section>
      )}
      {visitaCollegata && (sintesi || !inCorso) && (
        <section className="referto-box referto-visita">
          <span className="icona-tonda">
            <Icona nome="calendario" dimensione={22} />
          </span>
          <p>
            Hai già una <strong>{visitaCollegata.titolo.toLowerCase()}</strong> {visitaCollegata.quando}: lì
            puoi parlarne con il medico.
          </p>
          <Collegamento href={visitaCollegata.href} onClick={onChiudi}>
            Vedi la visita
          </Collegamento>
        </section>
      )}
      {(referto?.doveAndare || referto?.aChiChiedere) && argomentoCompleto && (sintesi || !inCorso) && (
        <section className="referto-box referto-visita">
          <span className="icona-tonda">
            <Icona nome="luogo" dimensione={22} />
          </span>
          <p>
            Cerca strutture e medici di <strong>{argomentoCompleto.area.toLowerCase()}</strong> vicino a casa tua e
            prenota una visita.
          </p>
          {referto.doveAndare && (
            <Collegamento href={referto.doveAndare} onClick={onChiudi}>
              Cerca strutture
            </Collegamento>
          )}
          {referto.aChiChiedere && (
            <Collegamento href={referto.aChiChiedere} onClick={onChiudi}>
              Cerca professionisti
            </Collegamento>
          )}
        </section>
      )}
      {nellIntervallo.length > 0 && (
        <details className="referto-box">
          <summary>Gli altri {nellIntervallo.length} valori sono nell'intervallo</summary>
          <p>{nellIntervallo.map((v) => v.esame).join(', ')}.</p>
        </details>
      )}
      {limiti && !LIMITI_ASSENTI.test(limiti) && (
        <details className="referto-box">
          <summary>Limiti del referto</summary>
          <p>{limiti}</p>
        </details>
      )}
      {risposta.errore && !vuota && <p className="referto-errore">La risposta si è interrotta. Riprova tra poco.</p>}
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
            <span>Ti spiego il referto in parole semplici</span>
          </div>
          <button type="button" className="referto-chiudi" onClick={onChiudi} aria-label="Chiudi Referto" data-fuoco-iniziale>
            <Icona nome="chiudi" dimensione={22} />
          </button>
        </div>
        <div className="referto-contesto">
          <Icona nome="documento" dimensione={20} />
          {referto ? (
            <span>
              Stai leggendo:{' '}
              <strong>
                {referto.titolo} · {referto.data}
              </strong>
            </span>
          ) : (
            <span>Il referto che incolli tu</span>
          )}
        </div>

        <div className="referto-corpo" aria-live="polite">
          {!iniziato ? (
            <form className="referto-incolla" onSubmit={invio}>
              <label htmlFor="testo-referto">
                <strong>Incolla il testo del referto</strong>
              </label>
              <p className="tenue piccolo">Prima togli nome, codice fiscale e indirizzo.</p>
              <textarea
                id="testo-referto"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                maxLength={LUNGHEZZA_MASSIMA}
                rows={9}
                placeholder="Incolla qui il testo del referto…"
              />
              <button type="submit" className="bottone bottone-referto" disabled={!bozza.trim()}>
                Spiega il referto
              </button>
            </form>
          ) : (
            primaRisposta && <Spiegazione risposta={primaRisposta} referto={referto} inCorso={inCorso && seguito.length === 0} onChiudi={onChiudi} />
          )}

          {domande.map(([domanda, risposta], indice) => (
            <div key={indice} className="referto-scambio">
              <p className="referto-domanda">{domanda.testo}</p>
              <section className={risposta.errore ? 'referto-box referto-errore' : 'referto-box'}>
                {risposta.testo ? (
                  <p>{senzaChiusura(risposta.testo)}</p>
                ) : (
                  <Caricamento testo="Sto cercando la risposta nel referto…" />
                )}
              </section>
            </div>
          ))}

          {iniziato && (
            <details className="referto-box referto-dettagli">
              <summary>Come è fatta questa spiegazione</summary>
              <p>
                La spiegazione la scrive l'assistente di Referto usando solo il testo del referto. I valori e le note del
                medico sono copiati dal referto così come sono.
                {daCache && ' Questo referto era già stato spiegato: la spiegazione è quella salvata, non è stata riscritta.'}
                {stato && ` Collegato al prontuario AIFA aggiornato al ${new Date(`${stato.aggiornato}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
              </p>
            </details>
          )}

          <div className="referto-sicurezza">
            <Icona nome="scudo" dimensione={22} />
            <span>
              Referto non fa diagnosi e non dà consigli: spiega solo ciò che è scritto. Per ogni dubbio parlane con il tuo
              medico. Per le urgenze chiama il <strong>112</strong>.
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
                Fai una domanda su questo referto
              </label>
              <input
                id="domanda-referto"
                type="text"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                placeholder="Fai una domanda su questo referto"
                maxLength={2000}
                disabled={inCorso}
              />
              <button type="submit" className="referto-invia" aria-label="Invia la domanda" disabled={inCorso || !bozza.trim()}>
                <Icona nome="invia" dimensione={22} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
