import { cambiaLingua, LINGUE, t, useLingua } from './lingua'

/**
 * Il tasto per scegliere la lingua, nella testata: due pulsanti (IT, EN) e
 * quello attivo è premuto. Ogni nome è scritto nella sua lingua, così lo
 * riconosce anche chi non legge l'altra.
 */
export function SelettoreLingua() {
  const attuale = useLingua()
  return (
    <div className="selettore-lingua" role="group" aria-label={t('Lingua')}>
      {LINGUE.map((voce) => (
        <button
          key={voce.codice}
          type="button"
          lang={voce.codice}
          aria-pressed={voce.codice === attuale}
          aria-label={voce.nome}
          title={voce.nome}
          onClick={() => cambiaLingua(voce.codice)}
        >
          {voce.breve}
        </button>
      ))}
    </div>
  )
}
