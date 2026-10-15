import { paziente } from './dati'
import { MarchioReferto } from './Struttura'

function Voci({ voci }: { voci: Array<[string, string]> }) {
  return (
    <dl className="voci">
      {voci.map(([nome, valore]) => (
        <div key={nome}>
          <dt>{nome}</dt>
          <dd>{valore}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Dati del paziente e servizi collegati. L'interruttore di Referto qui è solo
 * dimostrativo: in un portale vero sarebbe il consenso salvato dallo studio.
 */
export function Profilo({ refertoAttivo, onCambiaReferto }: { refertoAttivo: boolean; onCambiaReferto: (attivo: boolean) => void }) {
  return (
    <>
      <div className="profilo">
        <span className="avatar avatar-grande" aria-hidden="true">
          {paziente.iniziali}
        </span>
        <div>
          <h1>
            {paziente.nome} {paziente.cognome}
          </h1>
          <p className="tenue">Paziente dello studio dal {paziente.pazienteDal}</p>
        </div>
      </div>

      <section className="scheda" aria-labelledby="titolo-anagrafica">
        <div className="scheda-testa">
          <h2 id="titolo-anagrafica">Anagrafica</h2>
          <button type="button" className="bottone-leggero bottone-piccolo">
            Modifica
          </button>
        </div>
        <Voci
          voci={[
            ['Data di nascita', paziente.dataNascita],
            ['Luogo di nascita', paziente.luogoNascita],
            ['Codice fiscale', paziente.codiceFiscale],
            ['Tessera sanitaria', `scade il ${paziente.scadenzaTessera}`],
          ]}
        />
      </section>

      <section className="scheda" aria-labelledby="titolo-contatti">
        <div className="scheda-testa">
          <h2 id="titolo-contatti">Contatti</h2>
          <button type="button" className="bottone-leggero bottone-piccolo">
            Modifica
          </button>
        </div>
        <Voci
          voci={[
            ['Telefono', paziente.telefono],
            ['Email', paziente.email],
            ['Indirizzo', paziente.indirizzo],
            ['Persona da avvisare', paziente.contatto],
          ]}
        />
      </section>

      <div className="due-colonne">
        <section className="scheda" aria-labelledby="titolo-medico">
          <h2 id="titolo-medico">Medico di famiglia</h2>
          <p>
            <strong>{paziente.medico.nome}</strong>
          </p>
          <p className="tenue">{paziente.medico.orari}</p>
        </section>
        <section className="scheda" aria-labelledby="titolo-salute">
          <h2 id="titolo-salute">Informazioni sanitarie</h2>
          <Voci
            voci={[
              ['Allergie dichiarate', paziente.allergie],
              ['Gruppo sanguigno', paziente.gruppoSanguigno],
            ]}
          />
        </section>
      </div>

      <section className="scheda" aria-labelledby="titolo-servizi">
        <h2 id="titolo-servizi">Servizi collegati</h2>
        <div className="servizio-referto">
          <MarchioReferto grande />
          <div className="servizio-referto-testo">
            <strong>Referto</strong>
            <span>
              Spiega i referti con parole semplici. Legge solo il documento che scegli di farti spiegare, mai gli altri.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            className="interruttore"
            aria-checked={refertoAttivo}
            aria-label="Usa Referto nel portale"
            onClick={() => onCambiaReferto(!refertoAttivo)}
          >
            <span />
          </button>
          <span className="interruttore-stato">{refertoAttivo ? 'Attivo' : 'Spento'}</span>
        </div>
        <p className="tenue piccolo">Puoi spegnerlo quando vuoi: i pulsanti «Spiegamelo» spariranno dal portale.</p>
      </section>

      <button type="button" className="bottone-leggero solo-telefono">
        Esci
      </button>
    </>
  )
}
