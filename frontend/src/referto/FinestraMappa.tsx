import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icona } from '../Icona'
import { useDialogo } from '../useDialogo'
import type { LuogoSullaMappa } from './mappa'

/** Il luogo da mostrare con le informazioni della scheda (tutte facoltative tranne quelle della mappa). */
export interface SchedaLuogo extends LuogoSullaMappa {
  /** Che cos'è e quanto dista: "Laboratorio analisi, a 1,3 km". */
  descrizione?: string
  orari?: string
  /** Il numero come lo leggiamo; il link `tel:` lo pulisce da sé. */
  telefono?: string
}

/**
 * La mappa di una struttura in un pannello che entra da destra, come il widget
 * Referto: nome e tipo in alto, la mappa in grigio con il segnaposto, sotto
 * indirizzo, orari e "Chiama". "Chiudi", Esc o un clic fuori per tornare alla
 * pagina. Sul telefono occupa tutto lo schermo.
 */
export function FinestraMappa({ luogo, onChiudi }: { luogo: SchedaLuogo; onChiudi: () => void }) {
  const pannello = useDialogo<HTMLDivElement>(onChiudi)
  const tela = useRef<HTMLDivElement>(null)
  const [stato, setStato] = useState<'attesa' | 'pronta' | 'errore'>('attesa')
  const { nome, indirizzo, lat, lon, descrizione, orari, telefono } = luogo
  const numero = telefono?.replace(/[^\d+]/g, '')

  useEffect(() => {
    let chiusa = false
    let smonta: (() => void) | undefined
    import('./mappa')
      .then(({ disegnaMappa }) => {
        if (chiusa || !tela.current) return
        smonta = disegnaMappa(tela.current, { nome, indirizzo, lat, lon })
        setStato('pronta')
      })
      .catch(() => {
        if (!chiusa) setStato('errore')
      })
    return () => {
      chiusa = true
      smonta?.()
    }
  }, [nome, indirizzo, lat, lon])

  // Nel body: il pannello resta sopra tutta la pagina, qualunque sia la scheda da cui si apre.
  return createPortal(
    <div className="velo-laterale" onClick={(e) => e.target === e.currentTarget && onChiudi()}>
      <div
        className="pannello-mappa"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titolo-mappa"
        aria-describedby="indirizzo-mappa"
        ref={pannello}
      >
        <div className="pannello-mappa-testa">
          <div className="pannello-mappa-titolo">
            <h2 id="titolo-mappa">{nome}</h2>
            {descrizione && <p className="tenue">{descrizione}</p>}
          </div>
          <button type="button" className="bottone-leggero" onClick={onChiudi} data-fuoco-iniziale>
            <Icona nome="chiudi" dimensione={20} />
            Chiudi
          </button>
        </div>

        <div className="mappa">
          <div ref={tela} className="mappa-tela" role="region" aria-label={`Mappa: ${nome}`} />
          {stato === 'attesa' && (
            <p className="mappa-stato" role="status">
              <span className="rotella" aria-hidden="true" />
              Carico la mappa…
            </p>
          )}
          {stato === 'errore' && (
            <p className="mappa-stato referto-errore" role="alert">
              Non riesco a mostrare la mappa in questo momento. Riprova tra poco.
            </p>
          )}
        </div>
        <p className="tenue piccolo pannello-mappa-aiuto">Trascina la mappa per spostarti, usa + e − per ingrandire.</p>

        <dl className="pannello-mappa-dati">
          <div>
            <dt>
              <Icona nome="luogo" dimensione={22} />
              <span className="nascosto">Indirizzo</span>
            </dt>
            <dd id="indirizzo-mappa">{indirizzo}</dd>
          </div>
          {orari && (
            <div>
              <dt>
                <Icona nome="orologio" dimensione={22} />
                <span className="nascosto">Orari</span>
              </dt>
              <dd>{orari}</dd>
            </div>
          )}
          {numero && (
            <div>
              <dt>
                <Icona nome="telefono" dimensione={22} />
                <span className="nascosto">Telefono</span>
              </dt>
              <dd>{telefono}</dd>
            </div>
          )}
        </dl>
        {numero && (
          <a className="bottone pannello-mappa-chiama" href={`tel:${numero}`}>
            <Icona nome="telefono" dimensione={22} />
            Chiama
          </a>
        )}
      </div>
    </div>,
    document.body,
  )
}
