import { useState } from 'react'
import { useAzioni } from '../azioni'
import { Icona } from '../Icona'
import { Collegamento } from '../Collegamento'
import { esamiPrescritti, farmaci, type Farmaco } from './dati'
import { dataLunga } from './date'
import { Commutatore } from './elementi'
import { MarchioReferto } from './Struttura'

const STATI: Record<Farmaco['stato'] | 'prenotata' | 'usata', { nome: string; classe: string }> = {
  'da ritirare': { nome: 'Da ritirare', classe: 'pastiglia pastiglia-avviso' },
  ritirata: { nome: 'Ritirata', classe: 'pastiglia pastiglia-grigia' },
  'indicato dal medico': { nome: 'Indicato dal medico', classe: 'pastiglia pastiglia-grigia' },
  prenotata: { nome: 'Prenotata', classe: 'pastiglia pastiglia-chiara' },
  usata: { nome: 'Usata', classe: 'pastiglia pastiglia-grigia' },
}

function SchedaFarmaco({ farmaco }: { farmaco: Farmaco }) {
  const { apriFoglietto, refertoAttivo } = useAzioni()
  const [numeroVisibile, setNumeroVisibile] = useState(false)
  const stato = STATI[farmaco.stato]
  return (
    <section className="riga scheda-prescrizione">
      <Icona nome="pillola" dimensione={24} />
      <div className="prescrizione-testo">
        <div className="riga-titolo">
          <h3>{farmaco.nome}</h3>
          <span className={stato.classe}>{stato.nome}</span>
        </div>
        <p className="tenue">
          Prescritto da {farmaco.medico} il {dataLunga(farmaco.giorni)}
        </p>
        <div className="nota-visita">
          <strong>Come ha scritto il medico:</strong> {farmaco.dose}
        </div>
        <p className="tenue piccolo">{farmaco.validita}</p>
        {numeroVisibile && farmaco.nre && (
          <div className="numero-ricetta" id={`nre-${farmaco.id}`}>
            <div>
              <span className="tenue piccolo">Numero della ricetta elettronica (NRE)</span>
              <code>{farmaco.nre}</code>
            </div>
            <span>Mostra questo numero e la tessera sanitaria in farmacia.</span>
          </div>
        )}
        <div className="azioni">
          {farmaco.nre && (
            <button
              type="button"
              className="bottone-leggero"
              aria-expanded={numeroVisibile}
              aria-controls={`nre-${farmaco.id}`}
              onClick={() => setNumeroVisibile((v) => !v)}
            >
              {numeroVisibile ? 'Nascondi il numero della ricetta' : 'Mostra il numero per la farmacia'}
            </button>
          )}
          {farmaco.aifa && refertoAttivo && (
            <button type="button" className="bottone bottone-referto" onClick={() => apriFoglietto(farmaco)}>
              <MarchioReferto />
              Leggi il foglietto illustrativo
            </button>
          )}
        </div>
        {!farmaco.aifa && (
          <p className="tenue piccolo">Nessun foglietto: questo prodotto non è nella banca dati dei farmaci AIFA.</p>
        )}
      </div>
    </section>
  )
}

export function Prescrizioni() {
  const [scheda, setScheda] = useState<'farmaci' | 'esami'>('farmaci')
  return (
    <>
      <div className="titolo-pagina titolo-con-azione">
        <div>
          <h1>Le mie prescrizioni</h1>
          <p className="tenue">Farmaci ed esami che i medici dello studio ti hanno prescritto.</p>
        </div>
        <button type="button" className="bottone solo-computer">
          Chiedi il rinnovo di una ricetta
        </button>
      </div>
      <Commutatore
        etichetta="Quali prescrizioni vedere"
        scelta={scheda}
        onScegli={setScheda}
        voci={[
          { valore: 'farmaci', nome: `Farmaci (${farmaci.length})` },
          { valore: 'esami', nome: `Esami e visite (${esamiPrescritti.length})` },
        ]}
      />
      {scheda === 'farmaci' ? (
        <>
          <div className="gruppo-corpo">
            {farmaci.map((farmaco) => (
              <SchedaFarmaco key={farmaco.id} farmaco={farmaco} />
            ))}
          </div>
          <p className="tenue piccolo">
            Il foglietto illustrativo lo apre Referto dalla banca dati ufficiale dell'AIFA. Per dubbi sulla terapia parlane
            con il medico o con il farmacista.
          </p>
        </>
      ) : (
        <div className="gruppo-corpo">
          {esamiPrescritti.map((esame) => (
            <section key={esame.id} className="riga scheda-prescrizione">
              <Icona nome="fattura" dimensione={24} />
              <div className="prescrizione-testo">
                <div className="riga-titolo">
                  <h3>{esame.nome}</h3>
                  <span className={STATI[esame.stato].classe}>{STATI[esame.stato].nome}</span>
                </div>
                <p className="tenue">
                  Prescritto da {esame.medico} il {dataLunga(esame.giorni)}
                </p>
                <p>{esame.nota}</p>
                <div className="azioni">
                  {esame.visitaId && (
                    <Collegamento className="bottone-leggero" href="/visite">
                      Vedi l'appuntamento
                    </Collegamento>
                  )}
                  <button type="button" className="bottone-leggero">
                    Scarica la ricetta
                  </button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      <button type="button" className="bottone solo-telefono">
        Chiedi il rinnovo di una ricetta
      </button>
    </>
  )
}
