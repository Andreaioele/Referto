import type { ReactNode } from 'react'
import { useAzioni } from '../azioni'
import { Icona } from '../Icona'
import { type Documento, type Visita, documento as trovaDocumento } from './dati'
import { anno, dataLunga, giornoSettimana, meseBreve, numeroGiorno, traQuanto } from './date'
import { MarchioReferto } from './Struttura'

/** Riquadro con mese, giorno e giorno della settimana (o l'anno, per le visite già fatte). */
export function CalendarioVisita({ visita, inEvidenza = false }: { visita: Visita; inEvidenza?: boolean }) {
  const passata = visita.giorni < 0
  const classe = passata ? 'calendario calendario-passato' : inEvidenza ? 'calendario calendario-evidenza' : 'calendario'
  return (
    <div className={classe} aria-hidden="true">
      <span className="calendario-mese">{meseBreve(visita.giorni)}</span>
      <span className="calendario-giorno">{numeroGiorno(visita.giorni)}</span>
      <span className="calendario-sotto">{passata ? anno(visita.giorni) : giornoSettimana(visita.giorni)}</span>
    </div>
  )
}

/** Una visita: prossima (con cosa portare e le azioni) o già fatta (con il suo referto). */
export function SchedaVisita({ visita, inEvidenza = false, nuda = false }: { visita: Visita; inEvidenza?: boolean; nuda?: boolean }) {
  const { spiega, apriDocumento, refertoAttivo } = useAzioni()
  const passata = visita.giorni < 0
  const referto = visita.refertoId ? trovaDocumento(visita.refertoId) : undefined
  const contenuto = (
    <>
      <div className="visita">
        <CalendarioVisita visita={visita} inEvidenza={inEvidenza} />
        <div className="visita-testo">
          <div className="riga-titolo">
            <h3>{visita.titolo}</h3>
            {!passata && visita.giorni <= 14 && <span className="pastiglia pastiglia-chiara">{traQuanto(visita.giorni)}</span>}
            {referto?.nuovo && <span className="pastiglia">Referto nuovo</span>}
          </div>
          <p>
            {visita.medico}
            {visita.specialita !== visita.medico && !passata ? ` · ${visita.specialita}` : ''}
          </p>
          {passata ? (
            <p className="tenue">{dataLunga(visita.giorni)}</p>
          ) : (
            <p className="dettagli-visita">
              {visita.ora && (
                <span>
                  <Icona nome="orologio" dimensione={20} />
                  <span className="nascosto">Orario: </span>ore {visita.ora}
                </span>
              )}
              {visita.luogo && (
                <span>
                  <Icona nome="luogo" dimensione={20} />
                  <span className="nascosto">Dove: </span>
                  {visita.luogo}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      {visita.daPortare && (
        <div className="nota-visita">
          <strong>Da portare:</strong> {visita.daPortare}
        </div>
      )}
      {visita.preparazione && (
        <div className="nota-visita nota-avviso">
          <strong>Preparazione indicata dallo studio:</strong> {visita.preparazione}
        </div>
      )}
      <div className="azioni">
        {passata && referto ? (
          <>
            <button type="button" className="bottone-leggero" onClick={() => apriDocumento(referto)}>
              Apri il referto
            </button>
            {refertoAttivo && (
              <button type="button" className="bottone bottone-referto" onClick={() => spiega(referto)}>
                <MarchioReferto />
                Spiegamelo
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="bottone-leggero">
              Aggiungi al calendario
            </button>
            <button type="button" className="bottone-leggero">
              Sposta o disdici
            </button>
          </>
        )}
      </div>
    </>
  )
  return nuda ? <div className="visita-nuda">{contenuto}</div> : <section className="scheda">{contenuto}</section>
}

const ICONE_DOCUMENTO = { referto: 'documento', ricetta: 'fattura', fattura: 'fattura' } as const
const NOMI_TIPO = { referto: 'Referto', ricetta: 'Ricetta', fattura: 'Fattura' }

/** Una riga dell'elenco dei documenti, con "Spiegamelo" per i referti. */
export function RigaDocumento({ documento, compatta = false }: { documento: Documento; compatta?: boolean }) {
  const { spiega, apriDocumento, refertoAttivo } = useAzioni()
  const referto = documento.tipo === 'referto' && documento.referto
  return (
    <div className={compatta ? 'riga-documento riga-compatta' : 'riga-documento'}>
      <span className={referto ? 'icona-documento' : 'icona-documento icona-altro'}>
        <Icona nome={ICONE_DOCUMENTO[documento.tipo]} dimensione={22} />
      </span>
      <div className="riga-documento-testo">
        <span className="riga-documento-titolo">
          {documento.titolo}
          {documento.nuovo && <span className="pastiglia">Nuovo</span>}
        </span>
        <span className="tenue piccolo">
          {NOMI_TIPO[documento.tipo]} · {dataLunga(documento.giorni)}
          {compatta && documento.tipo !== 'fattura' ? '' : ` · ${documento.autore}`}
        </span>
      </div>
      <div className="azioni">
        {referto ? (
          <>
            {(!compatta || !refertoAttivo) && (
              <button type="button" className="bottone-leggero" onClick={() => apriDocumento(documento)}>
                Apri
              </button>
            )}
            {refertoAttivo && (
              <button
                type="button"
                className="bottone bottone-referto"
                onClick={() => spiega(documento)}
                aria-label={compatta ? `Spiegamelo: ${documento.titolo}` : undefined}
              >
                <MarchioReferto />
                <span className="testo-bottone">Spiegamelo</span>
              </button>
            )}
          </>
        ) : (
          <button type="button" className="bottone-leggero" aria-label={compatta ? `Scarica: ${documento.titolo}` : undefined}>
            <Icona nome="scarica" dimensione={20} />
            <span className="testo-bottone">Scarica</span>
          </button>
        )}
      </div>
    </div>
  )
}

/** Due o più schede che cambiano cosa si vede (Prossime / Già fatte, Farmaci / Esami). */
export function Commutatore<T extends string>({
  etichetta,
  scelta,
  voci,
  onScegli,
}: {
  etichetta: string
  scelta: T
  voci: Array<{ valore: T; nome: ReactNode }>
  onScegli: (valore: T) => void
}) {
  return (
    <div className="commutatore" role="group" aria-label={etichetta}>
      {voci.map((voce) => (
        <button
          key={voce.valore}
          type="button"
          aria-pressed={voce.valore === scelta}
          onClick={() => onScegli(voce.valore)}
        >
          {voce.nome}
        </button>
      ))}
    </div>
  )
}
