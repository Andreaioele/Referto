import { useId, useState } from 'react'
import { Collegamento } from '../Collegamento'
import { Icona } from '../Icona'
import { FinestraMappa } from '../referto/FinestraMappa'
import { distanzaLeggibile } from '../referto/strutture-testi'
import { prossimeVisite, SEDE_STUDIO, STUDIO, visite, visiteFatte } from './dati'
import { dataConGiorno, dataLunga } from './date'
import { comeStruttura } from './distanza'
import { t } from '../lingua/lingua'

/**
 * La card dello studio in "Le mie strutture" (mockup "Card struttura" su
 * Claude Design): chi è e dove, la prossima visita in evidenza, l'ultima e lo
 * storico a scomparsa, poi Chiama, Mappa e Prenota. Sul computer "Chiama"
 * mostra numero e orari; sul telefono chiama subito.
 */
export function SchedaStudio() {
  const [storiaAperta, setStoriaAperta] = useState(false)
  const [telefonoVisibile, setTelefonoVisibile] = useState(false)
  const [mappaAperta, setMappaAperta] = useState(false)
  const idStoria = useId()
  const idTitolo = useId()

  const { indirizzo, lat, lon, orari } = SEDE_STUDIO
  const distanza = comeStruttura({ id: 'studio', tipo: 'ambulatorio', nome: STUDIO, indirizzo, lat, lon }).distanzaKm
  const telefono = SEDE_STUDIO.telefono.replace(/[^\d+]/g, '')
  const numero = SEDE_STUDIO.telefono.replace(/^\+39\s*/, '')
  const prossima = prossimeVisite[0]
  const ultima = visiteFatte[0]
  // Dalla più lontana nel futuro alla più vecchia, come un diario.
  const tutte = [...visite].sort((a, b) => b.giorni - a.giorni)

  return (
    <article className="studio" aria-labelledby={idTitolo}>
      <div className="studio-testa">
        <span className="studio-icona">
          <Icona nome="edificio" dimensione={28} />
        </span>
        <div className="studio-dati">
          <h3 id={idTitolo}>{STUDIO}</h3>
          <p className="tenue">{t('Ambulatorio')} · {distanzaLeggibile(distanza)}</p>
          <p className="studio-riga">
            <Icona nome="luogo" dimensione={20} />
            {indirizzo}
          </p>
          <p className="studio-riga">
            <Icona nome="orologio" dimensione={20} />
            <span className="solo-computer">
              {t('Aperto {giorni}, {ore}', { giorni: t(orari.giorni), ore: orari.ore })}
            </span>
            <span className="solo-telefono">
              {t('Aperto {giorni}, {ore}', { giorni: t(orari.giorniBrevi), ore: orari.ore })}
            </span>
          </p>
        </div>
      </div>

      {prossima && (
        <div className="studio-prossima">
          <span className="studio-prossima-icona">
            <Icona nome="calendario" dimensione={28} />
          </span>
          <div>
            <span className="studio-prossima-etichetta">{t('Prossima visita')}</span>
            <span className="studio-prossima-data">{dataConGiorno(prossima.giorni)}</span>
            <span>{t(prossima.titolo)}</span>
          </div>
        </div>
      )}

      <div className="studio-storia">
        {ultima && (
          <p className="tenue">
            {t('Ultima visita: {visita}, {data}', { visita: t(ultima.titolo).toLowerCase(), data: dataLunga(ultima.giorni) })}
          </p>
        )}
        <button
          type="button"
          className="studio-mostra"
          aria-expanded={storiaAperta}
          aria-controls={idStoria}
          onClick={() => setStoriaAperta(!storiaAperta)}
        >
          {storiaAperta ? t('Nascondi le visite') : t('Vedi tutte le {n} visite', { n: visite.length })}
        </button>
        <ul id={idStoria} className="studio-elenco" hidden={!storiaAperta}>
          {tutte.map((v) => (
            <li key={v.id}>
              <span>
                {t(v.titolo)}
                {v.giorni >= 0 && ` (${t('prenotata')})`}
              </span>
              <span className="tenue">{dataLunga(v.giorni)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="studio-azioni">
        <button
          type="button"
          className="bottone-leggero solo-computer"
          aria-expanded={telefonoVisibile}
          onClick={() => setTelefonoVisibile(!telefonoVisibile)}
        >
          <Icona nome="telefono" dimensione={22} />
          {t('Chiama')}
        </button>
        <a className="bottone solo-telefono" href={`tel:${telefono}`}>
          <Icona nome="telefono" dimensione={22} />
          {t('Chiama')} {numero}
        </a>
        <button type="button" className="bottone-leggero" aria-haspopup="dialog" onClick={() => setMappaAperta(true)}>
          <Icona nome="mappa" dimensione={22} />
          {t('Mappa')}
        </button>
        <Collegamento href="/prenota" className="bottone studio-prenota">
          <Icona nome="prenota" dimensione={22} />
          {t("Prenota un'altra visita")}
        </Collegamento>
      </div>

      {telefonoVisibile && (
        <div className="studio-telefono solo-computer" role="status">
          <span>
            {t('Telefono dello studio:')} <strong>{numero}</strong>
          </span>
          <span className="tenue">
            {t(orari.giorniBrevi)} {orari.ore}
          </span>
        </div>
      )}

      {mappaAperta && (
        <FinestraMappa
          luogo={{
            nome: STUDIO,
            indirizzo,
            lat,
            lon,
            descrizione: `${t('Ambulatorio')}, ${distanzaLeggibile(distanza)}`,
            orari: t('Aperto {giorni}, {ore}', { giorni: t(orari.giorni), ore: orari.ore }),
            telefono: numero,
          }}
          onChiudi={() => setMappaAperta(false)}
        />
      )}
    </article>
  )
}
