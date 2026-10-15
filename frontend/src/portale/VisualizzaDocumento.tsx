import { useAzioni } from '../azioni'
import { Icona } from '../Icona'
import { useDialogo } from '../useDialogo'
import { type Documento, paziente, STUDIO } from './dati'
import { dataLunga } from './date'
import { MarchioReferto } from './Struttura'

/** Il referto così come l'ha scritto lo studio (anteprima del documento del portale). */
export function VisualizzaDocumento({ documento, onChiudi }: { documento: Documento; onChiudi: () => void }) {
  const { spiega, refertoAttivo } = useAzioni()
  const finestra = useDialogo<HTMLDivElement>(onChiudi)
  const referto = documento.referto
  return (
    <div className="velo" onClick={(e) => e.target === e.currentTarget && onChiudi()}>
      <div className="finestra-documento" role="dialog" aria-modal="true" aria-labelledby="titolo-documento" ref={finestra}>
        <div className="finestra-testa">
          <h2 id="titolo-documento">{documento.titolo}</h2>
          <button type="button" className="bottone-leggero" onClick={onChiudi} data-fuoco-iniziale>
            <Icona nome="chiudi" dimensione={20} />
            Chiudi
          </button>
        </div>
        <article className="foglio-referto" aria-label="Il referto">
          <div className="foglio-referto-testa">
            <div>
              <strong>{documento.autore}</strong>
              <br />
              <span className="tenue">{STUDIO}</span>
            </div>
            <div className="a-destra">
              <span className="tenue">Data</span>
              <br />
              <strong>{dataLunga(documento.giorni)}</strong>
            </div>
          </div>
          <p className="tenue">
            Paziente: {paziente.cognome.toUpperCase()} {paziente.nome.toUpperCase()} · nata il {paziente.dataNascita}
          </p>
          {referto?.valori ? (
            <>
              <div className="tabella-scorrevole">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Esame</th>
                      <th scope="col">Risultato</th>
                      <th scope="col">Valori di riferimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referto.valori.map((v) => (
                      <tr key={v.esame}>
                        <td>{v.esame}</td>
                        <td>{v.fuori ? <strong>{`${v.risultato} ${v.unita} *`}</strong> : `${v.risultato} ${v.unita}`}</td>
                        <td>{v.riferimento}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tenue piccolo">* valore fuori dall'intervallo di riferimento</p>
              {referto.noteMedico && (
                <p>
                  <strong>Note del medico:</strong> {referto.noteMedico}
                </p>
              )}
            </>
          ) : (
            <div className="foglio-referto-testo">{referto?.testo.split('\n').slice(1).join('\n')}</div>
          )}
        </article>
        {referto && refertoAttivo && (
          <div className="finestra-piede">
            <button
              type="button"
              className="bottone bottone-referto"
              onClick={() => {
                onChiudi()
                spiega(documento)
              }}
            >
              <MarchioReferto />
              Fatti spiegare il referto
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
