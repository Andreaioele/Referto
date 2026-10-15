import { useEffect, useState, type ReactNode } from 'react'
import { Icona, type NomeIcona } from '../Icona'
import { salvaClassificazione, useClassificazione } from './classificazioni'
import {
  classifica,
  ErroreServizio,
  infoStrutture,
  struttureDellArea,
  struttureDelTipo,
  type AreaStrutture,
  type Categoria,
  type GruppoStrutture,
  type InfoStrutture,
  type StrutturaVicina,
  type TipoStruttura,
} from './cliente'
import { distanzaLeggibile, nessunRisultato, titoloGruppo } from './strutture-testi'
import type { PuntoDiPartenza, RefertoDaSpiegare } from './tipi'

/**
 * Le strutture di Milano per la sezione "Le mie strutture": per un referto
 * (classificazione del Mother agent -> ricerca nei dati locali) o per tipo.
 * Tutto deterministico dopo la classificazione: il modello non cerca strutture.
 */

const NOMI_TIPO: Record<TipoStruttura, string> = {
  ospedale: 'Ospedale',
  'casa-di-cura': 'Casa di cura',
  ambulatorio: 'Ambulatorio',
  laboratorio: 'Laboratorio analisi',
  'medico-di-famiglia': 'Medico di famiglia',
  pediatra: 'Pediatra',
  'studio-medico': 'Studio medico',
  farmacia: 'Farmacia',
  consultorio: 'Consultorio',
  riabilitazione: 'Centro di riabilitazione',
  dipendenze: 'Servizio per le dipendenze',
  'centro-trasfusionale': 'Centro trasfusionale',
}

const ICONE_TIPO: Record<TipoStruttura, NomeIcona> = {
  ospedale: 'piu',
  'casa-di-cura': 'piu',
  ambulatorio: 'luogo',
  laboratorio: 'fattura',
  'medico-di-famiglia': 'stetoscopio',
  pediatra: 'stetoscopio',
  'studio-medico': 'stetoscopio',
  farmacia: 'pillola',
  consultorio: 'persona',
  riabilitazione: 'luogo',
  dipendenze: 'luogo',
  'centro-trasfusionale': 'piu',
}

function Caricamento({ testo }: { testo: string }) {
  return (
    <p className="referto-attesa" role="status">
      <span className="rotella" aria-hidden="true" />
      {testo}
    </p>
  )
}

/** Prenotazione dalla ricerca: chi la gestisce (il portale) e che cosa è già prenotato. */
export interface Prenotabile {
  onPrenota: (struttura: StrutturaVicina) => void
  prenotate: Set<string>
}

/**
 * Una struttura: nome, tipo, distanza, indirizzo, e i pulsanti per chiamare,
 * vederla sulla mappa e (nella ricerca) prenotare una visita.
 */
export function RigaStruttura({
  struttura,
  nota,
  prenotabile,
  azioni,
}: {
  struttura: StrutturaVicina
  /** Riga in più sotto l'indirizzo: "Visita del 12 settembre 2026". */
  nota?: string
  prenotabile?: Prenotabile
  /** Pulsanti in più (es. "Annulla la prenotazione"). */
  azioni?: ReactNode
}) {
  const telefono = struttura.telefono?.replace(/[^\d+]/g, '')
  return (
    <li className="struttura">
      <span className="icona-documento">
        <Icona nome={ICONE_TIPO[struttura.tipo]} dimensione={22} />
      </span>
      <div className="struttura-testo">
        <strong>{struttura.nome}</strong>
        <span className="tenue">
          {struttura.professione ?? NOMI_TIPO[struttura.tipo]}, {distanzaLeggibile(struttura.distanzaKm)}
        </span>
        <span>
          {struttura.indirizzo}
          {struttura.quartiere ? ` (${struttura.quartiere})` : ''}
        </span>
        {struttura.orari && <span className="tenue piccolo">Orari: {struttura.orari}</span>}
        {nota && <span className="struttura-nota">{nota}</span>}
      </div>
      <div className="azioni">
        {prenotabile &&
          (prenotabile.prenotate.has(struttura.id) ? (
            <span className="pastiglia pastiglia-chiara">Prenotazione richiesta</span>
          ) : (
            <button type="button" className="bottone" onClick={() => prenotabile.onPrenota(struttura)}>
              Prenota una visita
            </button>
          ))}
        {telefono && (
          <a className="bottone-leggero" href={`tel:${telefono}`} aria-label={`Chiama ${struttura.nome}`}>
            Chiama
          </a>
        )}
        <a
          className="bottone-leggero"
          href={`https://www.openstreetmap.org/?mlat=${struttura.lat}&mlon=${struttura.lon}#map=18/${struttura.lat}/${struttura.lon}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Mappa: ${struttura.nome} (si apre in una nuova scheda)`}
        >
          Mappa
        </a>
        {azioni}
      </div>
    </li>
  )
}

/** Un elenco di strutture: le prime `visibili`, le altre con "Mostra altre". */
export function ElencoStrutture({
  strutture,
  visibili = 3,
  prenotabile,
}: {
  strutture: StrutturaVicina[]
  visibili?: number
  prenotabile?: Prenotabile
}) {
  const [tutte, setTutte] = useState(false)
  const mostrate = tutte ? strutture : strutture.slice(0, visibili)
  return (
    <>
      <ul className="strutture-elenco">
        {mostrate.map((s) => (
          <RigaStruttura key={s.id} struttura={s} prenotabile={prenotabile} />
        ))}
      </ul>
      {!tutte && strutture.length > visibili && (
        <button type="button" className="bottone-leggero strutture-altre" onClick={() => setTutte(true)}>
          Mostra altre {strutture.length - visibili}
        </button>
      )}
    </>
  )
}

/** Esito della ricerca per un'area: i gruppi oppure il messaggio d'errore. */
type Ricerca = { area: string } & ({ trovata: AreaStrutture; gruppi: GruppoStrutture[] } | { errore: string })

/**
 * Le strutture (o i professionisti) adatti a un referto: se non è ancora
 * classificato lo manda al Mother agent (solo la riga ARGOMENTO), poi cerca per
 * area vicino a casa. Se l'area non si capisce, la persona può sceglierla dall'elenco.
 */
export function StruttureDelReferto({
  referto,
  casa,
  categoria = 'strutture',
  prenotabile,
}: {
  referto: RefertoDaSpiegare
  casa: PuntoDiPartenza
  categoria?: Categoria
  prenotabile?: Prenotabile
}) {
  // Prima la classificazione già fatta all'arrivo del referto, poi quella salvata dal widget.
  const salvata = useClassificazione(referto.id)
  const classificazione = referto.classificazione ?? salvata
  const [areaScelta, setAreaScelta] = useState<string | null>(null)
  const [erroreClassifica, setErroreClassifica] = useState<string | null>(null)
  const [ricerca, setRicerca] = useState<Ricerca | null>(null)
  const area = areaScelta ?? classificazione?.area

  // 1. Classificazione: solo se manca (il widget la salva quando spiega il referto).
  useEffect(() => {
    if (classificazione || areaScelta) return
    const controllo = new AbortController()
    classifica(referto.testo, controllo.signal)
      .then((risultato) => salvaClassificazione(referto.id, risultato))
      .catch((motivo: unknown) => {
        if (controllo.signal.aborted) return
        setErroreClassifica(motivo instanceof ErroreServizio ? motivo.message : 'Collegamento interrotto. Riprova tra poco.')
      })
    return () => controllo.abort()
  }, [referto.id, referto.testo, classificazione, areaScelta])

  // 2. Ricerca nei dati locali per area, dalla casa della persona.
  useEffect(() => {
    if (!area) return
    const controllo = new AbortController()
    struttureDellArea(area, casa, 10, controllo.signal, categoria)
      .then(({ area: trovata, gruppi }) => setRicerca({ area, trovata, gruppi }))
      .catch((motivo: unknown) => {
        if (controllo.signal.aborted) return
        setRicerca({
          area,
          errore:
            motivo instanceof ErroreServizio ? motivo.message : 'Non riesco a cercare le strutture in questo momento. Riprova tra poco.',
        })
      })
    return () => controllo.abort()
  }, [area, casa, categoria])

  const esito = area && ricerca?.area === area ? ricerca : null
  const errore = area ? (esito && 'errore' in esito ? esito.errore : null) : erroreClassifica
  return (
    <div className="strutture-risultato">
      {!area && !errore && (
        <Caricamento testo="Referto sta leggendo il referto per capire di quale area si occupa… può servire un minuto." />
      )}
      {area && !esito && (
        <Caricamento testo={categoria === 'professionisti' ? 'Cerco i professionisti vicino a casa…' : 'Cerco le strutture vicino a casa…'} />
      )}
      {errore && (
        <>
          <p className="referto-errore">{errore}</p>
          <SceltaArea onScegli={setAreaScelta} />
        </>
      )}
      {esito && 'gruppi' in esito && (
        <>
          <p className="strutture-area">
            {classificazione && !areaScelta ? `${classificazione.esame}: ` : 'Area scelta: '}
            <strong>{esito.trovata.etichetta}</strong>
          </p>
          {esito.gruppi.length === 0 && <p>{nessunRisultato(esito.trovata, categoria)}</p>}
          {esito.gruppi.map((gruppo) => (
            <section key={gruppo.id} className="strutture-gruppo" aria-label={titoloGruppo(gruppo.id, esito.trovata, categoria)}>
              <h3>{titoloGruppo(gruppo.id, esito.trovata, categoria)}</h3>
              <ElencoStrutture strutture={gruppo.strutture} prenotabile={prenotabile} />
            </section>
          ))}
          <p className="tenue piccolo">
            Referto non sceglie per te: chiedi al tuo medico dove fare la visita o l'esame. Telefona prima di andare, orari e
            prenotazioni possono cambiare. Per le urgenze chiama il <strong>112</strong>.
          </p>
          <SceltaArea onScegli={setAreaScelta} testo="Non è l'area giusta? Scegline un'altra" />
        </>
      )}
    </div>
  )
}

/** Elenco delle aree, per scegliere a mano quando la classificazione manca o non convince. */
function SceltaArea({ onScegli, testo = 'Scegli tu l’area' }: { onScegli: (area: string) => void; testo?: string }) {
  const [info, setInfo] = useState<InfoStrutture | null>(null)
  useEffect(() => {
    const controllo = new AbortController()
    infoStrutture(controllo.signal).then(setInfo, () => undefined)
    return () => controllo.abort()
  }, [])
  if (!info) return null
  return (
    <label className="strutture-scelta-area">
      <span>{testo}</span>
      <select defaultValue="" onChange={(e) => e.target.value && onScegli(e.target.value)}>
        <option value="" disabled>
          Scegli…
        </option>
        {info.aree.map((a) => (
          <option key={a.id} value={a.id}>
            {a.etichetta}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Ricerca per tipo vicino a casa, senza referto: i tipi li sceglie la pagina (strutture o professionisti). */
export function CercaVicino({ casa, tipi }: { casa: PuntoDiPartenza; tipi: Array<{ tipo: TipoStruttura; nome: string }> }) {
  const [tipo, setTipo] = useState<TipoStruttura>(tipi[0].tipo)
  const [risultato, setRisultato] = useState<{ tipo: TipoStruttura; strutture?: StrutturaVicina[]; errore?: string } | null>(null)

  useEffect(() => {
    const controllo = new AbortController()
    struttureDelTipo(tipo, casa, 20, controllo.signal)
      .then((gruppo) => setRisultato({ tipo, strutture: gruppo.strutture }))
      .catch((motivo: unknown) => {
        if (controllo.signal.aborted) return
        setRisultato({
          tipo,
          errore: motivo instanceof ErroreServizio ? motivo.message : 'Non riesco a cercare in questo momento. Riprova tra poco.',
        })
      })
    return () => controllo.abort()
  }, [tipo, casa])

  const attuale = risultato?.tipo === tipo ? risultato : null
  const errore = attuale?.errore
  return (
    <>
      <div className="filtri" role="group" aria-label="Che cosa cercare vicino a casa">
        {tipi.map((voce) => (
          <button key={voce.tipo} type="button" aria-pressed={voce.tipo === tipo} onClick={() => setTipo(voce.tipo)}>
            {voce.nome}
          </button>
        ))}
      </div>
      {errore ? (
        <p className="referto-errore">{errore}</p>
      ) : !attuale?.strutture ? (
        <Caricamento testo="Cerco vicino a casa…" />
      ) : (
        <ElencoStrutture key={tipo} strutture={attuale.strutture} visibili={5} />
      )}
    </>
  )
}

/** Da dove vengono i dati, con la data. */
export function FontiStrutture() {
  const [info, setInfo] = useState<InfoStrutture | null>(null)
  useEffect(() => {
    const controllo = new AbortController()
    infoStrutture(controllo.signal).then(setInfo, () => undefined)
    return () => controllo.abort()
  }, [])
  if (!info) return null
  const data = new Date(`${info.generato}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <details className="scheda dettagli">
      <summary>Da dove vengono questi dati</summary>
      <p>
        {info.totale} tra strutture, medici e farmacie del Comune di {info.citta}, aggiornati al {data}. Le distanze sono in
        linea d'aria da casa tua.
      </p>
      <ul className="strutture-fonti">
        {info.fonti.map((f) => (
          <li key={f.nome}>
            <a href={f.url} target="_blank" rel="noreferrer">
              {f.nome}
            </a>{' '}
            <span className="tenue piccolo">({f.licenza})</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
