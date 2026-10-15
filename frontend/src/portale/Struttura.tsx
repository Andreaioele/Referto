import type { ReactNode } from 'react'
import { Icona, MarchioStudio } from '../Icona'
import { Collegamento } from '../Collegamento'
import { useAzioni } from '../azioni'
import { paziente, STUDIO } from './dati'
import { PAGINE } from './pagine'


/** Il segno "R" di Referto, usato su ogni pulsante che apre il widget. */
export function MarchioReferto({ grande = false }: { grande?: boolean }) {
  return (
    <span className={grande ? 'marchio-r marchio-r-grande' : 'marchio-r'} aria-hidden="true">
      R
    </span>
  )
}

/** Testata, menu (a sinistra sul computer, in basso sul telefono) e pulsante fisso di Referto. */
export function Struttura({ percorso, children }: { percorso: string; children: ReactNode }) {
  const { spiega, refertoAttivo } = useAzioni()
  return (
    <div className="portale">
      <header className="testata">
        <Collegamento className="testata-marchio" href="/">
          <span className="marchio-studio">
            <MarchioStudio />
          </span>
          <span className="testata-nome">
            <strong>{STUDIO}</strong>
            <span>Area paziente</span>
          </span>
        </Collegamento>
        <span className="etichetta-demo">Portale dimostrativo · dati di esempio</span>
        <div className="testata-utente">
          <Collegamento className="avatar" href="/dati" aria-label="I miei dati">
            {paziente.iniziali}
          </Collegamento>
          <span className="testata-utente-nome">
            {paziente.nome} {paziente.cognome}
          </span>
          <button type="button" className="bottone-leggero solo-computer">
            Esci
          </button>
        </div>
      </header>
      <div className="etichetta-demo-telefono">Portale dimostrativo · dati di esempio</div>

      <div className="corpo">
        <nav className="menu" aria-label="Menu principale">
          {PAGINE.map((pagina) => (
            <Collegamento key={pagina.percorso} href={pagina.percorso} aria-current={pagina.percorso === percorso ? 'page' : undefined}>
              <Icona nome={pagina.icona} />
              {pagina.nome}
            </Collegamento>
          ))}
          <button type="button" className="menu-prenota">
            <Icona nome="piu" dimensione={22} />
            Prenota una visita
          </button>
        </nav>
        <main className="contenuto">{children}</main>
      </div>

      <div className="aggancio">
        {refertoAttivo && (
          <button type="button" className="lanciatore" onClick={() => spiega()}>
            <MarchioReferto grande />
            Capire un referto
          </button>
        )}
        <nav className="barra-schede" aria-label="Menu principale">
          {PAGINE.map((pagina) => (
            <Collegamento key={pagina.percorso} href={pagina.percorso} aria-current={pagina.percorso === percorso ? 'page' : undefined}>
              <span className="barra-schede-icona">
                <Icona nome={pagina.icona} />
              </span>
              {pagina.breve}
            </Collegamento>
          ))}
        </nav>
      </div>
    </div>
  )
}
