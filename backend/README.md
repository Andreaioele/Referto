# Backend

Backend di Referto in NestJS 11 (TypeScript). Tutte le rotte stanno sotto
`/api`. Per ora contiene il modulo **farmaci**: collega i nomi dei farmaci
scritti in un referto al prontuario ufficiale AIFA, in modo deterministico
(senza modelli né ricerca semantica). Lo usano il frontend e gli agenti di
Referto su Evolus.

Documentazione di progetto: `docs/15-backend.md`.

## Chat con il Mother agent

`POST /api/chat` con `{"messaggio": "...", "conversazione": "<id facoltativo>"}`
inoltra il messaggio al Mother agent di Evolus e ritrasmette la risposta come
Server-Sent Events (`data: {"tipo":"testo"|"fine"|"errore", ...}`).
Variabili d'ambiente: `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID` (obbligatorie),
`EVOLUS_AGENT_ID` (facoltativa). Senza credenziali risponde 503. Dettagli in
`docs/15-backend.md`.

## Privacy

Il modulo farmaci riceve **solo i nomi dei farmaci**, mai il testo del referto
(vedi `CLAUDE.md`). La richiesta rifiuta i campi non previsti, per esempio
`referto`. Il contenuto delle richieste non viene registrato né salvato.

## API

| Metodo | Rotta | Descrizione |
|---|---|---|
| `POST` | `/api/farmaci/cerca` | Collega fino a 20 nomi al prontuario |
| `GET` | `/api/farmaci/:cod` | Un farmaco per codice AIFA (`COD_FARMACO`) |
| `GET` | `/api/salute` | Stato e data del prontuario (senza chiave) |
| `POST` | `/api/chat` | Messaggio al Mother agent di Evolus, risposta in streaming (senza chiave, 10 al minuto per IP) |
| `GET` | `/api/docs`, `/api/docs-json` | Documentazione OpenAPI |

Le rotte dei farmaci richiedono l'intestazione `x-api-key` uguale alla
variabile `CHIAVE_API`. Se `CHIAVE_API` non è impostata il controllo è
disattivato (solo sviluppo locale; all'avvio compare un avviso).

```bash
curl -X POST http://localhost:3000/api/farmaci/cerca \
  -H 'content-type: application/json' -H 'x-api-key: ...' \
  -d '{"farmaci": [{"nome": "Cardioaspirin 100 mg"}, {"nome": "ramipril"}], "limite_alternative": 3}'
```

Per ogni nome la risposta contiene `trovato` e, se trovato:

- `principio_attivo`, `atc`, `categoria` (classificazione ATC in parole);
- `descrizione`: frase pronta con i soli dati AIFA, senza dosi né consigli
  ("Cardioaspirin è un medicinale che contiene acido acetilsalicilico. Categoria
  (classificazione ATC): antitrombotici, antiaggreganti piastrinici, esclusa l'eparina.");
- `corrispondenza` e `farmaco`, con le stesse regole di `lookup()` in
  `resources/farmaci_referti.py`:
  - `nome commerciale`: nome italiano con un solo farmaco di riferimento
    (importazioni parallele escluse);
  - `unico con questo principio attivo`: un solo farmaco in commercio;
  - `da scegliere`: il nome non identifica un farmaco; `farmaco` è `null`,
    `perche` spiega il motivo e `alternative` elenca i candidati (al massimo
    `limite_alternative`, totale in `alternative_totali`);
- per ogni farmaco, i link ufficiali AIFA al foglietto illustrativo e all'RCP.

## Dati (`data/`)

| File | Contenuto | Come si aggiorna |
|---|---|---|
| `aifa_farmaci.json` | Prontuario AIFA (~12.600 farmaci) | `resources/farmaci/build_aifa_index.py` |
| `normalizzazione.json` | Sali e alias dei nomi | a mano |
| `atc.json` | Descrizioni della classificazione ATC | `npm run atc -- /percorso/atc.csv` (open data AIFA) |

L'app Python in `resources/` legge `aifa_farmaci.json` e `normalizzazione.json`
da qui: app e backend riconoscono gli stessi nomi.

## Comandi

```bash
npm install
npm run start:dev        # sviluppo, porta 3000
npm test                 # test Jest (unità, API, parità con Python)
npm run build && npm start
```

### Parità con l'app Python

Il modulo farmaci deve dare gli stessi risultati di `lookup()` in
`resources/farmaci_referti.py`.

- `npm run parita`: rigenera `test/fixtures/parita.json` (48 casi scelti, usati da `npm test`).
- `npm run parita:tutti`: confronta tutti i nomi commerciali, principi attivi e
  alias del prontuario (14.029 nomi al 14/10/2026: tutti uguali).

Da rilanciare dopo ogni modifica a `resources/farmaci_referti.py`, a `data/` o a
`src/farmaci/`.

## Pubblicazione

### Vercel

Il backend è il servizio `backend` del progetto Vercel con Services definito nel
`vercel.json` della radice (`/api/*` → backend). Variabile d'ambiente del
progetto: `CHIAVE_API`. Il servizio dichiara `framework: nestjs` ed
`entrypoint: src/main.ts` perché nella cartella c'è anche il `Dockerfile`.

`src/config.ts` trova i dati sia in `data/` (avvio da questa cartella) sia in
`backend/data/` (la funzione di Services ricrea i percorsi dalla radice del
repository). Per lo stesso motivo le librerie restano in `backend/node_modules/`
mentre il codice è nella radice della funzione: `src/percorsi-moduli.ts`,
primo import di `main.ts`, le rende trovabili. Provato in locale con
`vercel build` (CLI 64) rimontando la funzione come la monta Vercel.

Funziona anche come progetto Vercel a sé: Root Directory `backend`, preset
NestJS, nessuna configurazione. Il piano Hobby di Vercel è gratuito solo per uso personale e non
commerciale.

### Docker

```bash
docker build -t referto-backend backend      # dalla radice del repository
docker run -p 3000:3000 -e CHIAVE_API=... referto-backend
```

## Limiti noti

- Gli errori di battitura non sono tollerati ("Cardioaspirina", "Sintron").
- Gli alias esteri non sono riconosciuti se seguiti dal dosaggio ("Lipitor 40 mg"
  no, "Lipitor" sì): stesso comportamento dell'app Python.
- `npm audit` segnala vulnerabilità moderate negli strumenti di test (Jest) e in
  `js-yaml` usato da `@nestjs/swagger` per scrivere la documentazione: nessuna
  riguarda dati ricevuti dal backend.
