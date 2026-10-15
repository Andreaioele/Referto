---
tags: [area/core]
aggiornato: 2026-10-15
---

# Backend (NestJS)

Torna a [[00-indice]] · Frontend in [[16-frontend]] · Logica di origine in [[08-referti-e-farmaci-aifa]].

## A cosa serve

`backend/` è il backend di Referto in NestJS 11 (TypeScript). Tutte le rotte
stanno sotto `/api`, così il frontend le inoltra con una sola regola. Per ora
contiene il **modulo farmaci**: collega i nomi dei farmaci scritti in un referto
al prontuario AIFA, in modo deterministico. Le altre funzioni dell'app Python
(`resources/`) andranno portate qui una alla volta.

Il modulo farmaci è usato anche dagli agenti di Referto su Evolus, al posto del
sotto-agente "Referto Farmaci" basato sul RAG, che nei test di ottobre 2026 non
trovava alcuni farmaci presenti (Cardioaspirin), saltava la ricerca e impiegava
40-100 secondi per referto.

## Rotte

| Rotta | Cosa fa | Chiave |
|---|---|---|
| `POST /api/farmaci/cerca` | Collega fino a 20 nomi al prontuario AIFA | sì |
| `GET /api/farmaci/:cod` | Un farmaco per codice AIFA, con categoria e link a foglietto e RCP | sì |
| `GET /api/salute` | Stato e data del prontuario | no |
| `POST /api/chat` | Inoltra un messaggio al Mother agent di Evolus e ritrasmette la risposta in streaming | no (limite per IP) |
| `POST /api/sessioni/utenti` | Crea utente (nickname → id) | no |
| `GET /api/sessioni/utenti/:id` | Verifica che un utente esista | no |
| `POST /api/sessioni` | Crea sessione di chat (header `X-Utente-Id`) | no |
| `GET /api/sessioni` | Lista sessioni dell'utente | no |
| `GET /api/sessioni/:id` | Dettaglio sessione con turni | no |
| `POST /api/sessioni/:id/turni` | Salva un turno (domanda + risposta) | no |
| `DELETE /api/sessioni/:id` | Elimina una sessione | no |
| `GET /api/docs`, `/api/docs-json` | Documentazione OpenAPI (da importare come Web API in Evolus) | no |

Chiave: intestazione `x-api-key` uguale alla variabile `CHIAVE_API`. Se non è
impostata il controllo è spento (solo sviluppo locale).

## Chat con il Mother agent (`src/chat/`)

`POST /api/chat` con `{ messaggio, conversazione? }` inoltra il messaggio al
Mother agent di Evolus (`/agents/{id}/ask-stream`, campo `content`; per
continuare la conversazione si rimanda il suo `conversationId`, non il
`threadId`, che Evolus ignora). La risposta arriva al browser come Server-Sent
Events: righe `data:` con `tipo` `testo`, poi `fine` (con `conversazione`) o
`errore` (messaggio già in italiano). Ogni 15 secondi un commento `: attesa`
tiene aperta la connessione mentre il modello lavora.

- Credenziali solo sul server: `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID`
  (variabili d'ambiente; `EVOLUS_AGENT_ID` facoltativa, predefinito il Mother
  agent). Senza credenziali la rotta risponde 503.
- Aperta al browser (senza `CHIAVE_API`), quindi limitata: 10 messaggi al
  minuto per IP (`@nestjs/throttler`, IP da `x-real-ip` su Vercel) e al massimo
  30.000 caratteri per messaggio.
- Nei log solo esiti tecnici (stato HTTP, codice d'errore, durata), mai il testo.
- Il messaggio, cioè il testo del referto, arriva a Evolus: è ammesso (`CLAUDE.md`),
  purché nei log del backend resti solo l'esito tecnico.

## Agenti su Evolus (`resources/evolus/`)

Su Evolus restano due agenti: **Referto Mother agent** (risponde alla chat,
cerca i farmaci con la Web API `cercaFarmaci` → `POST /api/farmaci/cerca`) e
**Referto Farmaci** (RAG sulle schede AIFA, oggi non collegato al Mother).

La risposta del Mother a un referto si apre con la riga
`ARGOMENTO: <esame> · <area>` (es. `ARGOMENTO: Ecografia della tiroide ·
Endocrinologia e diabetologia`), poi le sezioni SINTESI, SPIEGAZIONE IN PAROLE
SEMPLICI, INCERTEZZE O LIMITI, INDICAZIONI. L'area è una delle 19 branche di
`resources/strutture_sanitarie.py` (stesse etichette), scelta per organo o
apparato esaminato e non per chi ha scritto il referto; riserva: Medicina
generale. L'argomento descrive l'esame, mai il risultato. Il frontend per ora
mostra la riga così com'è; in futuro può leggerla per "Dove andare".

- `agenti/*.md`: prompt di ogni agente, con `agentId` e configurazione
  nell'intestazione; `sincronizza_prompt.py <file>` carica il prompt su Evolus
  senza toccare gli altri campi. In `agenti/archivio/` i prompt di Lettore,
  Spiegatore, Valutatore e Revisore, non più presenti su Evolus.
- `farmaci/`, `costruisci_schede_farmaci.py`, `carica_farmaci.py`,
  `prova_farmaci.py`: schede AIFA in Markdown e caricamento nella Conoscenza
  dell'agente Farmaci. Le schede si rigenerano con lo script e sono escluse
  da Git (`.gitignore`).
- `openapi-referto-farmaci.json`: la Web API importata nel Mother.
- Credenziali da `EVOLUS_API_KEY`/`EVOLUS_APPLICATION_ID` o dalla configurazione
  MCP locale, mai nel repository.

## Sessioni e storico (`src/sessioni/`)

Modulo NestJS con Mongoose per MongoDB (database `Referto`). Salva utenti
(nickname, login fake), sessioni di chat e turni (domanda + risposta). Evita di
richiamare il modello per sessioni già analizzate.

- `@nestjs/mongoose` resta alla 11.x: la 12 è solo ESM e il runtime delle
  funzioni Vercel non la carica con `require` (errore `ERR_REQUIRE_ESM`, backend
  fermo su tutte le rotte), mentre in locale Node 22 sì. Prova prima di
  aggiornare: `node --no-experimental-require-module dist/main.js`.
- Stringa di connessione in `MONGODB_URI` (variabile d'ambiente). Se mancante,
  il modulo non viene caricato e le rotte non esistono: gli altri moduli non ne
  risentono.
- Collezioni: `utenti` (nickname, timestamps) e `sessioni` (utente, titolo,
  array di turni con messaggio, risposta, timestamp, metadati).
- Autenticazione: header `X-Utente-Id` con l'ObjectId dell'utente. Nessun
  token né password (hackathon).
- Nei log solo ID e timestamp, mai il contenuto dei turni
  ([[09-trace-e-privacy]]).

Specifica completa: [[specifica-storico-sessione]].

## Privacy

Il modulo farmaci riceve **solo nomi di farmaci**, mai il testo del referto
([[09-trace-e-privacy]]): la validazione rifiuta i campi non previsti
(`forbidNonWhitelisted`) e il contenuto delle richieste non viene registrato.

## Come funziona il modulo farmaci

- `src/farmaci/normalizzazione.ts`: porta in TypeScript `normalize()`,
  `inn_key()`, `_component_keys()` e `_ingredient_label()` di
  `resources/farmaci_referti.py`.
- `src/farmaci/prontuario.service.ts`: carica il prontuario e costruisce gli
  stessi indici di `_aifa()`. `cerca()` riproduce `lookup()`: nome commerciale
  italiano con un solo farmaco di riferimento (importazioni parallele escluse),
  unico farmaco con quel principio attivo, altrimenti `da scegliere` con le
  alternative. In più restituisce `categoria` (classificazione ATC) e una
  `descrizione` pronta con i soli dati AIFA.

## Dati (`backend/data/`)

| File | Contenuto | Come si aggiorna |
|---|---|---|
| `aifa_farmaci.json` | Prontuario AIFA (~12.600 farmaci) | `resources/farmaci/build_aifa_index.py` |
| `normalizzazione.json` | Sali e alias dei nomi | a mano |
| `atc.json` | Descrizioni della classificazione ATC | `npm run atc -- atc.csv` (open data AIFA) |

I dati appartengono al backend; l'app Python in `resources/` legge
`aifa_farmaci.json` e `normalizzazione.json` da qui, così app e backend
riconoscono gli stessi nomi.

## Parità con l'app Python

- `scripts/casi_parita.py` genera con Python `test/fixtures/parita.json` (48 casi
  scelti), verificati da `npm test`;
- `npm run parita:tutti` confronta tutti i 14.029 nomi del prontuario: tutti
  uguali al 14/10/2026.

Da rilanciare dopo ogni modifica a `resources/farmaci_referti.py`, a
`backend/data/` o a `backend/src/farmaci/`.

## Sviluppo e pubblicazione

```bash
cd backend && npm install && npm test && npm run start:dev   # porta 3000
```

- **Vercel**: servizio `backend` del progetto Services definito in `vercel.json`
  (radice), raggiungibile su `/api/*`; variabile `CHIAVE_API`. Il servizio
  dichiara `framework: nestjs` ed `entrypoint: src/main.ts`, perché nella cartella
  c'è anche il `Dockerfile` e Vercel altrimenti non sa quale usare. Nella funzione
  i dati stanno in `backend/data/` (percorsi dalla radice del repository):
  `src/config.ts` li cerca anche lì. Anche le librerie restano in
  `backend/node_modules/` mentre il codice è nella radice della funzione:
  `src/percorsi-moduli.ts`, importato per primo da `main.ts`, aggiunge quella
  cartella ai percorsi dei moduli (senza, l'avvio fallisce con "Cannot find
  module 'reflect-metadata'", visto nei log del primo deploy).
  Funziona anche come progetto a sé (Root Directory `backend`, preset NestJS).
- **Docker**: `docker build -t referto-backend backend`.

Nest 11 (CommonJS) e non 12: Nest 12 è solo ESM e complica Jest. Dettagli in
`backend/README.md`.

## Limiti

- Nessuna tolleranza agli errori di battitura ("Cardioaspirina").
- Alias esteri non riconosciuti se seguiti dal dosaggio ("Lipitor 40 mg"), come nell'app.

## Foglietti illustrativi (`src/foglietti/`, 14/10/2026)

Rotte pubbliche per il browser (le rotte `/api/farmaci` restano per gli agenti):

| Rotta | Cosa fa |
|---|---|
| `GET /api/foglietti/:cod?forma=` | Farmaco, pagine, intestazione e sezioni del foglio (con la pagina) |
| `GET /api/foglietti/:cod/pdf` | Il PDF ufficiale AIFA dallo stesso dominio |
| `POST /api/foglietti/:cod/domande` | `{ domanda, forma? }` → risposta, sezione citata, brani usati (10 al minuto per IP) |

- Il PDF si scarica da AIFA alla prima richiesta e resta in memoria (30 farmaci);
  il testo si legge con `unpdf`.
- `sezioni.ts` (deterministico): trova le sei sezioni dello schema europeo; se
  il PDF ha un foglio per formulazione (es. Dibase: 54 pagine) sceglie quello
  che corrisponde a `forma`, la confezione prescritta. `scegliBrani` sceglie i
  brani vicini alla domanda.
- Solo quei brani vanno al Mother agent, che deve citare la sezione
  (`SEZIONE: n`, controllata da `interpreta`). Senza agente risponde il brano
  stesso; se nessun brano corrisponde: "Non ho trovato questa informazione".
- Test: `test/foglietti.spec.ts`.

## Avvio in locale con le credenziali

`npm run start:dev` legge `backend/.env` se c'è (`node --env-file-if-exists`):
lì vanno `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID` e, se serve, `MONGODB_URI`.
Senza le credenziali Evolus la chat risponde 503 e le domande sul foglietto
usano la riserva deterministica (il brano del foglio).
