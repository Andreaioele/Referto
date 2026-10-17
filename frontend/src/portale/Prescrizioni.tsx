import { useState } from 'react'
import { useAzioni } from '../azioni'
import { Icona } from '../Icona'
import { Collegamento } from '../Collegamento'
import { esamiPrescritti, farmaci, type Farmaco } from './dati'
import { dataLunga } from './date'
import { Commutatore } from './elementi'
import { MarchioReferto } from './Struttura'
import { t } from '../lingua/lingua'

const STATI: Record<Farmaco['stato'] | 'prenotata' | 'usata', { nome: string; classe: string }> = {
  'da ritirare': { nome: 'Da ritirare', classe: 'pastiglia' },
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
    <section className="scheda scheda-prescrizione">
      <span className={farmaco.stato === 'da ritirare' ? 'icona-grande' : 'icona-grande icona-spenta'}>
        <Icona nome="pillola" dimensione={28} />
      </span>
      <div className="prescrizione-testo">
        <div className="riga-titolo">
          <h3>{t(farmaco.nome)}</h3>
          <span className={stato.classe}>{t(stato.nome)}</span>
        </div>
        <p className="tenue">
          {t('{medico} · prescritto il {data}', { medico: t(farmaco.medico), data: dataLunga(farmaco.giorni) })}
        </p>
        <div className="nota-visita">
          <strong>{t('Come ha scritto il medico:')}</strong> {t(farmaco.dose)}
        </div>
        <p className="tenue piccolo">{t(farmaco.validita)}</p>
        {numeroVisibile && farmaco.nre && (
          <div className="numero-ricetta" id={`nre-${farmaco.id}`}>
            <div>
              <span className="tenue piccolo">{t('Numero della ricetta elettronica (NRE)')}</span>
              <code>{farmaco.nre}</code>
            </div>
            <span>{t('Mostra questo numero e la tessera sanitaria in farmacia.')}</span>
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
              {numeroVisibile ? t('Nascondi il numero della ricetta') : t('Mostra il numero per la farmacia')}
            </button>
          )}
          {farmaco.aifa && refertoAttivo && (
            <button type="button" className="bottone bottone-referto" onClick={() => apriFoglietto(farmaco)}>
              <MarchioReferto />
              {t('Leggi il foglietto illustrativo')}
            </button>
          )}
        </div>
        {!farmaco.aifa && (
          <p className="tenue piccolo">{t('Nessun foglietto: questo prodotto non è nella banca dati dei farmaci AIFA.')}</p>
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
          <h1>{t('Le mie prescrizioni')}</h1>
          <p className="tenue">{t('Farmaci ed esami che i medici dello studio ti hanno prescritto.')}</p>
        </div>
        <button type="button" className="bottone solo-computer">
          {t('Chiedi il rinnovo di una ricetta')}
        </button>
      </div>
      <Commutatore
        etichetta={t('Quali prescrizioni vedere')}
        scelta={scheda}
        onScegli={setScheda}
        voci={[
          { valore: 'farmaci', nome: t('Farmaci ({n})', { n: farmaci.length }) },
          { valore: 'esami', nome: t('Esami e visite ({n})', { n: esamiPrescritti.length }) },
        ]}
      />
      {scheda === 'farmaci' ? (
        <div className="elenco-schede">
          {farmaci.map((farmaco) => (
            <SchedaFarmaco key={farmaco.id} farmaco={farmaco} />
          ))}
          <p className="tenue piccolo">
            {t(
              "Il foglietto illustrativo lo apre Referto dalla banca dati ufficiale dell'AIFA. Per dubbi sulla terapia parlane con il medico o con il farmacista.",
            )}
          </p>
        </div>
      ) : (
        <div className="elenco-schede">
          {esamiPrescritti.map((esame) => (
            <section key={esame.id} className="scheda scheda-prescrizione">
              <span className="icona-grande">
                <Icona nome="fattura" dimensione={28} />
              </span>
              <div className="prescrizione-testo">
                <div className="riga-titolo">
                  <h3>{t(esame.nome)}</h3>
                  <span className={STATI[esame.stato].classe}>{t(STATI[esame.stato].nome)}</span>
                </div>
                <p className="tenue">
                  {t('{medico} · prescritto il {data}', { medico: t(esame.medico), data: dataLunga(esame.giorni) })}
                </p>
                <p>{t(esame.nota)}</p>
                <div className="azioni">
                  {esame.visitaId && (
                    <Collegamento className="bottone-leggero" href="/visite">
                      {t("Vedi l'appuntamento")}
                    </Collegamento>
                  )}
                  <button type="button" className="bottone-leggero">
                    {t('Scarica la ricetta')}
                  </button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      <button type="button" className="bottone solo-telefono">
        {t('Chiedi il rinnovo di una ricetta')}
      </button>
    </>
  )
}
