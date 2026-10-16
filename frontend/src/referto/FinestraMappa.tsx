import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icona } from '../Icona'
import { useDialogo } from '../useDialogo'
import type { LuogoSullaMappa } from './mappa'
import { t } from '../lingua/lingua'

/**
 * La mappa di una struttura dentro al portale, sopra la pagina: nome e
 * indirizzo in alto, la mappa centrata sul segnaposto, "Chiudi" o Esc per
 * tornare alla pagina. Sul telefono occupa tutto lo schermo.
 */
export function FinestraMappa({ luogo, onChiudi }: { luogo: LuogoSullaMappa; onChiudi: () => void }) {
  const finestra = useDialogo<HTMLDivElement>(onChiudi)
  const tela = useRef<HTMLDivElement>(null)
  const [stato, setStato] = useState<'attesa' | 'pronta' | 'errore'>('attesa')
  const { nome, indirizzo, lat, lon } = luogo

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

  // Nel body: la finestra resta sopra tutta la pagina, qualunque sia la scheda da cui si apre.
  return createPortal(
    <div className="velo" onClick={(e) => e.target === e.currentTarget && onChiudi()}>
      <div
        className="finestra-documento finestra-mappa"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titolo-mappa"
        aria-describedby="indirizzo-mappa"
        ref={finestra}
      >
        <div className="finestra-testa">
          <div className="finestra-mappa-titolo">
            <h2 id="titolo-mappa">{nome}</h2>
            <p id="indirizzo-mappa" className="tenue">
              <Icona nome="luogo" dimensione={20} />
              {indirizzo}
            </p>
          </div>
          <button type="button" className="bottone-leggero" onClick={onChiudi} data-fuoco-iniziale>
            <Icona nome="chiudi" dimensione={20} />
            {t('Chiudi')}
          </button>
        </div>
        <div className="mappa">
          <div ref={tela} className="mappa-tela" role="region" aria-label={`${t('Mappa')}: ${nome}`} />
          {stato === 'attesa' && (
            <p className="mappa-stato" role="status">
              <span className="rotella" aria-hidden="true" />
              {t('Carico la mappa…')}
            </p>
          )}
          {stato === 'errore' && (
            <p className="mappa-stato referto-errore" role="alert">
              {t('Non riesco a mostrare la mappa in questo momento. Riprova tra poco.')}
            </p>
          )}
        </div>
        <p className="tenue piccolo">{t('Trascina la mappa per spostarti, usa + e − per ingrandire o rimpicciolire.')}</p>
      </div>
    </div>,
    document.body,
  )
}
