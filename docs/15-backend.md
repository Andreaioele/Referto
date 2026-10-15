---
tags: [area/core]
aggiornato: 2026-10-16
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
| `POST /api/terminologia/cerca` | Spiega fino a 10 parole o sigle mediche con il glossario a strati (definizione, fonte, link) | sì |
| `GET /api/salute` | Stato e data del prontuario | no |
| `POST /api/chat` | Inoltra un messaggio al Mother agent e ritrasmette la risposta in streaming; con MongoDB usa la cache delle spiegazioni e salva conversazioni e trace | no (limite per IP) |
| `POST /api/sessioni/utenti` | Crea un utente con il nickname (login fake); l'id va in `X-Utente-Id` | no |
| `GET /api/sessioni/utenti/:id` | Verifica che un utente esista | no |
| `GET /api/sessioni/utente` | L'utente corrente (header `X-Utente-Id`, se no l'utente predefinito) | sì |
| `GET /api/sessioni/conversazioni` | Conversazioni dell'utente, senza testi | sì |
| `GET /api/sessioni/conversazioni/:id` | Referto, spiegazione e domande, senza rigenerare | sì |
| `GET /api/sessioni/conversazioni/:id/trace` | Trace di ogni generazione della conversazione | sì |
| `PATCH /api/sessioni/conversazioni/:id` | Rinomina (`{ titolo }`) | sì |
| `DELETE /api/sessioni/conversazioni/:id` | Elimina la conversazione e le sue trace | sì |
| `GET /api/strutture?area=&categoria=&lat=&lon=&limite=` | Per l'area del referto (come la scrive il Mother agent): `categoria=strutture` (luoghi, predefinita) o `professionisti` (medici e studi), per gruppo, dal più vicino | no |
| `GET /api/strutture?tipo=&lat=&lon=&limite=` | Strutture di un tipo (medici di famiglia, farmacie, laboratori...), dalla più vicina | no |
| `GET /api/strutture/aree` | Le 19 aree della classificazione, con fonti e data dei dati | no |
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

## Mother agent ricostruito nel backend (`src/chat/mother-diretto.ts`)

Alternativa a Evolus, scelta con `MOTORE_CHAT=diretto` (predefinito: `evolus`).
Chat e domande sui foglietti usano il motore scelto tramite `MotoreChat`
(`src/chat/motore-chat.ts`); `/api/salute` dice quale (`motore_chat`).

- Stesso prompt: `data/prompt-mother.md`, copia del corpo di
  `resources/evolus/agenti/mother.md` (un test controlla che siano uguali:
  quando si cambia il prompt vanno aggiornati tutti e due).
- Stesso modello: `DeepSeek-V4.1-Flash` su AMD Token Factory (API compatibile
  OpenAI, `/chat/completions` in streaming), chiave in `RADEON_API_KEY`. Se il
  modello è sovraccarico (HTTP 429, 502, 503, 504) o non inizia a rispondere
  entro `MODELLO_ATTESA_MS` (predefinito 20 secondi) prima di aver scritto
  qualcosa, si riprova con `MODELLO_MOTHER_RISERVA` (predefinito
  `DeepSeek-V4-Flash`), che si aspetta fino a 90 secondi. Se sono sovraccarichi
  tutti e due la persona legge «Il servizio di spiegazione è sovraccarico».
- Su Vercel dal 15/10/2026: `MOTORE_CHAT=diretto` e `RADEON_API_KEY`
  impostate per Production e Preview (tutti i rami). Per le anteprime la CLI
  vuole il ramo vuoto: `vercel env add NOME preview "" --value … --yes`.
- Lo strumento `cercaFarmaci` è una funzione: il modello la chiama come la Web
  API su Evolus, ma la ricerca avviene sul prontuario in memoria
  (`src/farmaci/cerca-farmaci.ts`, la stessa della rotta `/api/farmaci/cerca`).
- Lo strumento `cercaTermine` (dal 16/10/2026, solo nel motore diretto) cerca
  parole o sigle nel glossario medico a strati (`src/terminologia/`, la stessa
  ricerca della rotta `/api/terminologia/cerca`). Il prompt lo fa chiamare una
  volta durante la spiegazione, per al massimo 5 termini difficili (anche
  insieme a `cercaFarmaci`), e prima di rispondere a «che cosa vuol dire…».
  Della definizione il modello usa solo che cosa è la cosa nominata. Nelle
  risposte alle domande cita la fonte con il link.
  Provato nell'anteprima Vercel il 16/10/2026: nella spiegazione di una
  radiografia ha chiamato lo strumento per 3 termini, tutti trovati, e per
  «ilo polmonare» anche nella domanda. Per «lobo inferiore» invece non l'ha
  chiamato e ha aggiunto nozioni generali; da qui la regola «chiama sempre,
  anche se pensi di saperlo». La fonte dello strato curato si legge
  «Glossario di Referto».
- Anche con quella regola il modello a volte risponde a memoria. Per questo,
  dopo un referto, una domanda del tipo «Cos'è…», «Cosa vuol dire…» o «Che
  cosa significa…» (`domandaSuParola()`) obbliga il primo giro a chiamare
  `cercaTermine` (`tool_choice`). Se il server rifiuta `tool_choice` (HTTP
  400) si riprova senza. Senza un referto la domanda resta fuori tema e lo
  strumento non è obbligato.
- Prima, un controllo senza modello (`src/chat/domanda-su-parola.ts`): se
  le parole chieste (tolte quelle come «cos'è», «il», «referto») non
  compaiono nel referto, nelle domande o nelle risposte precedenti, anche al
  singolare o al plurale, la risposta è una frase fissa e gentile:
  `PAROLA_FUORI_DAL_REFERTO`, «questa parola non compare nel referto…». Le
  definizioni restituite dagli strumenti non contano. Anche il prompt ha la
  regola, per le domande scritte in altro modo.
- `FiltroFonti` (`src/chat/filtro-fonti.ts`) toglie dalla risposta, mentre
  arriva in streaming, le righe «Fonte: …» che non nominano una fonte o un
  link restituiti da uno strumento chiamato nella stessa domanda (AIFA se è
  stato chiamato `cercaFarmaci`). Anche il testo salvato è quello filtrato.
- Con MongoDB la storia di ogni domanda arriva dall'archivio (opzione
  `storia` di `chiedi`), quindi vale anche dopo un riavvio o su un'altra
  istanza di Vercel. Senza MongoDB le conversazioni restano in memoria per due
  ore (al massimo 200): un riavvio, o una seconda istanza su Vercel, le perde.
- `versione()` = `diretto/<modello>/<12 caratteri dello SHA-256 del prompt>`:
  cambiare prompt o modello invalida la cache delle spiegazioni.
- Manca rispetto a Evolus l'OCR di PDF e foto (oggi il frontend manda solo
  testo). Al contrario, sull'agente Evolus manca `cercaTermine`: il prompt su
  Evolus non è ancora sincronizzato con quello che lo nomina.

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

Ai messaggi che non sono referti il Mother risponde in poche frasi, senza
sezioni (prompt, parte QUANDO IL MESSAGGIO NON È UN REFERTO). Le domande fuori
tema, che non riguardano un referto né il servizio (storia, sport, cucina,
curiosità, medicina generale non legata a un referto), non hanno risposta nel
merito: l'agente dice con garbo che può aiutare solo a capire i referti e
invita a incollarne uno o a fare una domanda su quello già inviato (dal
15/10/2026, dopo che in produzione aveva elencato i sette re di Roma). Le
domande che riguardano il referto sono tutte in tema, anche se generiche
(«Cos'è il colesterolo LDL?», «Cosa vuol dire v.r.?», «Me lo spieghi più
semplice?», «Devo preoccuparmi?», un farmaco scritto dal medico): una parola,
una sigla o un valore del referto si spiega in parole semplici, senza cause,
conseguenze o giudizi sulla salute. Il prompt è
sincronizzato anche sull'agente Evolus; provato lì il 15/10/2026 con «i 7 re
di Roma», la ricetta della carbonara, un esame del sangue con Cardioaspirin e
le domande successive (anche una fuori tema dentro la stessa conversazione).

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

## Cache delle spiegazioni, conversazioni e trace (`src/chat/servizio-chat.ts`)

`ServizioChat` sta tra la rotta `/api/chat` e il motore. Usa l'`ArchivioChat`
(`src/chat/archivio-chat.ts`) che il modulo sessioni fornisce solo con
`MONGODB_URI`; senza, la chat va dritta al motore come prima.

- **Primo messaggio (nessuna `conversazione`) = referto.** Impronta: SHA-256
  del testo con gli spazi normalizzati (`improntaReferto`). Se lo stesso utente
  ha già una spiegazione per quell'impronta e per la stessa `versione()` del
  motore, la si manda in un solo evento `testo` senza chiamare il modello, e
  `fine` ha `da_cache: true`. Altrimenti la si genera, la si salva in cache
  (solo se finita senza errori) e `fine` ha `da_cache: false`. In tutti e due i
  casi nasce una conversazione nuova, il cui id (ObjectId) torna in `fine`.
- **La spiegazione si finisce anche se il browser chiude.** La generazione non
  usa il segnale del browser ma un tempo massimo di 240 secondi (sotto i 300 di
  una funzione Vercel): se la connessione si chiude a metà, il backend legge il
  resto senza mandarlo, salva la spiegazione in cache e solo dopo chiude la
  risposta (così Vercel non ferma la funzione). La prossima richiesta dello
  stesso referto è immediata. Se il browser ha già chiuso non nasce nessuna
  conversazione (nessuno ne userebbe l'id): resta solo la trace, con esito `ok`.
- **`classificazione: true`** (lo manda `classifica()` del frontend, a cui
  serve solo la riga ARGOMENTO): come una spiegazione, cache compresa, ma senza
  conversazione; `fine` ha `conversazione: null` e la trace ha `tipo:
  "classificazione"`. La prima classificazione costa una spiegazione intera
  (una volta per referto); dopo, classificazione e «Spiegamelo» sono immediati.
- **Messaggi con `conversazione` = domande.** Il motore riceve la storia
  salvata (referto, spiegazione, domande e risposte precedenti) e risponde solo
  alla domanda: il referto non viene rispiegato. Il motore diretto la mette nei
  messaggi del modello; Evolus continua la sua conversazione se c'è, altrimenti
  (spiegazione dalla cache) riceve storia e domanda in un solo messaggio
  (`messaggioConStoria`). Una conversazione di un altro utente o inesistente dà
  l'errore «Questa conversazione non è più disponibile».
- **Trace di ogni generazione**, anche errori, interruzioni (il browser chiude)
  e risposte dalla cache: motore, versione, modello e modelli provati (riserva),
  giri, durata, tempo al primo testo, token (se il server li manda), chiamate a
  `cercaFarmaci` con parametri, risultato e durata, esito ed errore tecnico,
  lunghezze di messaggio e risposta. Nessun testo del referto o della risposta.
- Se MongoDB non risponde la chat continua senza salvare (nel log
  «Archivio non disponibile», senza contenuti); la conversazione resta quella
  del motore (UUID), che si continua senza archivio.
- Il controller accetta come `conversazione` un ObjectId o un UUID.
- Le domande invece si fermano quando il browser chiude: la risposta a metà
  non si salva (trace `interrotta`).

## Sessioni e storico (`src/sessioni/`)

Modulo NestJS con Mongoose per MongoDB (database `Referto`), globale: la chat ne
usa l'`ArchivioChat` (`SessioniService`) senza importarlo. Le conversazioni le
scrive solo il backend dentro `POST /api/chat`; le rotte `/api/sessioni` le
leggono, rinominano ed eliminano.

- `@nestjs/mongoose` resta alla 11.x: la 12 è solo ESM e il runtime delle
  funzioni Vercel non la carica con `require` (errore `ERR_REQUIRE_ESM`, backend
  fermo su tutte le rotte), mentre in locale Node 22 sì. Prova prima di
  aggiornare: `node --no-experimental-require-module dist/main.js`.
- Connessione in `src/sessioni/connessione-mongo.ts`: **pigra**
  (`lazyConnection`), perché su Vercel il server deve mettersi in ascolto
  subito. Il 15/10/2026, con `MONGODB_URI` appena impostata, Nest aspettava
  MongoDB all'avvio, Vercel chiudeva la funzione («No exports found in module
  "/var/task/main.js"») e **tutte** le rotte davano 500. Se la connessione non
  riesce, nel log c'è il motivo tecnico (`[MongoDB] Connessione non riuscita`),
  la chat va avanti senza archivio e si riprova ogni 15 secondi finché non si
  connette (`[MongoDB] Connesso`). Il driver riceve `runtimeAdapters: { os }`
  (altrimenti lo carica con `import()` dinamico, che in jest non funziona).
- **Atlas deve accettare Vercel:** le funzioni Vercel non hanno un IP fisso, quindi
  in Atlas → Network Access serve `0.0.0.0/0` (o gli IP statici di Vercel, piano
  Pro). Senza, il log dice «Could not connect to any servers in your MongoDB Atlas
  cluster… IP that isn't whitelisted» e nulla viene salvato.
- Stringa di connessione in `MONGODB_URI` (variabile d'ambiente). Se mancante,
  il modulo non viene caricato e le rotte non esistono: gli altri moduli non ne
  risentono.
- Collezioni:
  - `utenti`: nickname. L'utente predefinito `paziente` nasce alla prima
    richiesta (non all'avvio, così il backend parte anche se MongoDB non
    risponde).
  - `spiegazioni`: la cache. Utente, `hash` del referto, `versione` del motore,
    testo della spiegazione, `usi` e `ultimo_uso`; indice unico su
    utente + hash + versione. Il testo del referto qui non c'è.
  - `conversazioni`: utente, `titolo` e `area` (dalla riga ARGOMENTO),
    `referto` (testo e hash), `spiegazione` (testo, `da_cache`, riferimenti a
    cache e trace), `conversazione_motore` (Evolus) e `turni` (domanda,
    risposta, trace).
  - `trace`: una per generazione, con utente e, se c'è, conversazione.
- Utente: header `X-Utente-Id` con l'ObjectId di un utente esistente; se manca
  o non esiste si usa l'utente predefinito. Nessun token né password
  (hackathon). La cache e le conversazioni sono sempre per utente.
- Le rotte `/api/sessioni` restituiscono il testo dei referti, quindi chiedono
  la chiave API (`CHIAVE_API`); la chat resta aperta al browser.
- Eliminare una conversazione elimina le sue trace, non la spiegazione in
  cache (che non contiene il referto).
- Test: `test/sessioni.spec.ts` gira su un MongoDB in memoria
  (`mongodb-memory-server-core`, il binario si scarica al primo avvio). Il
  driver 7 carica `os` con `import()` dinamico, che jest non supporta: il test
  passa `runtimeAdapters: { os }`.
- Nei log solo ID e timestamp, mai il contenuto dei turni
  ([[09-trace-e-privacy]]).
- Le sessioni con i turni scritti dal browser (`POST /api/sessioni`,
  `/:id/turni`, con `ArchivioSessioni` MongoDB/memoria) sono state sostituite
  il 15/10/2026 dalle conversazioni salvate dalla chat; dei due lavori restano
  gli utenti con nickname (`POST /api/sessioni/utenti`, aperta al browser).

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
| `glossario_medico.json` | Glossario medico a strati per `cercaTermine` (circa 8 MB: voci con definizione, indice delle chiavi, parole comuni escluse) | `resources/glossario/costruisci_glossario_strati.py --estratti --backend` |

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
  (`SEZIONE: n`, controllata da `interpreta`). Senza agente, se dà errore o se
  non finisce entro 75 secondi risponde il brano stesso; se nessun brano corrisponde: "Non ho trovato questa informazione".
- Test: `test/foglietti.spec.ts`.

## Glossario medico e cercaTermine (`src/terminologia/`, 16/10/2026)

`GlossarioService` carica `data/glossario_medico.json`, generato dal prototipo
a strati descritto in [[specifica-terminologia]]: termini curati, HPO e
Wikidata, con le prime frasi della voce di Wikipedia in italiano.

- Ricerca deterministica, nessun modello. Le parole sono normalizzate
  (minuscolo, senza accenti) e ridotte a una radice leggera, così singolare e
  plurale coincidono. In ogni punto vince il termine più lungo, fino a 6
  parole.
- `src/terminologia/testo.ts` riproduce `normalizza()` e `radice()` dello
  script Python: un test confronta le chiavi. Se cambiano lì, vanno cambiate
  anche qui.
- Parole comuni escluse: una parola molto frequente in italiano non vale come
  termine solo perché ne condivide la radice («stato» non è la proteina
  STAT). L'elenco lo calcola lo script con wordfreq.
- I farmaci non ci sono: li spiega `cercaFarmaci` con la fonte AIFA.
- Rotta `POST /api/terminologia/cerca` con `{ termini: [...] }` (da 1 a 10
  parole di massimo 80 caratteri, con chiave API). Risponde con `trovato`,
  `termine`, `definizione`, `lingua` (`en` per le definizioni HPO non
  tradotte), `fonte` e `url`.

## Strutture di Milano (`src/strutture/`, 15/10/2026)

Per la sezione "Le mie strutture" del portale ([[16-frontend]]). La demo è
limitata alla **città di Milano** e cerca solo in un file locale: niente Google
Maps/Places, e il Mother agent non cerca strutture.

Flusso: referto → Mother agent → classificazione (riga `ARGOMENTO: esame ·
area`, elenco chiuso di 19 aree in `data/prompt-mother.md`) → `GET
/api/strutture?area=...` → elenco per distanza dalla casa della persona.

- **Dati:** `data/strutture-milano.json` (7.687 voci, circa 2 MB), costruito da
  `npm run strutture` (`scripts/costruisci-strutture.ts`), da tre fonti aperte e
  gratuite, senza chiavi né account:
  - Comune di Milano (dati.comune.milano.it): 988 medici di famiglia e 115
    pediatri attivi (un medico con i suoi ambulatori, **senza** data di nascita
    né codice regionale), 422 farmacie, 35 consultori, 16 strutture di
    riabilitazione, 3 servizi per le dipendenze, 16 centri trasfusionali, 35
    ospedali e case di cura con i reparti (posti letto, ultimo anno: 2023). I nomi
    degli ospedali nel CSV sono troncati: quelli leggibili e tre coordinate
    mancanti sono nella tabella `OSPEDALI` dello script;
  - OpenStreetMap (Overpass, solo il comune): 62 ambulatori e poliambulatori, 19
    laboratori e 48 studi di professionisti (`studio-medico`: studi medici,
    fisioterapisti e psicoterapeuti, con la `professione` quando non è un
    medico), con indirizzo, specialità dichiarate, telefono e orari quando ci
    sono. Gli ospedali di OSM già presenti negli open data si scartano.
  - **Overture Maps** (places, release 2026-09-23.1, licenza CDLA Permissive
    2.0): i file pubblici su S3 si leggono con DuckDB in `scripts/estrai_overture.py`,
    lanciato dallo script con `uv` (circa 30 secondi). Porta gli studi medici
    specialistici e gli ambulatori privati che su OSM mancano: 5.928 voci (circa
    5.070 studi, 950 ambulatori, 32 laboratori). Regole: solo luoghi aperti con
    affidabilità almeno 0,5, nella città di Milano, nelle categorie delle 19 aree
    (`CATEGORIE_OVERTURE` e `overture` in `aree.ts`); niente ospedali (restano
    quelli ufficiali del Comune); esclusi dentisti, osteopati, omeopati,
    farmacie, ottici e i "laboratori" non sanitari (revisioni auto, restauro);
    un nome da persona ("Dott.", "Dr.", "Prof.") è uno studio; nomi pubblicitari
    accorciati; telefoni nel formato `+39 ...`; doppioni con le altre fonti
    (stesso nome entro 150 m) scartati. La maggior parte viene da registri di
    imprese (BrightQuery): affidabilità media, va bene per una demo.
  - Overpass è spesso sovraccarico: `npm run strutture -- --osm estrazione.json`
    usa un'estrazione già scaricata; `--overture estrazione.json` fa lo stesso
    per Overture.
- **Aree:** `src/strutture/aree.ts` collega ogni area ai reparti ministeriali,
  alle specialità OSM e alle parole nel nome. Un test confronta l'elenco con
  `data/prompt-mother.md`: se il prompt cambia aree, il test fallisce.
- **Ricerca** (`StruttureService`, in memoria, deterministica): per area, gruppi
  ordinati dal più vicino (distanza in linea d'aria), separati per categoria:
  - `strutture` (luoghi, sezione "Le mie strutture"): `specialisti`
    (ambulatori, laboratori, consultori... che dichiarano l'area) e `ospedali`
    (con il reparto; per radiologia e laboratorio tutti, "chiedi del servizio");
  - `professionisti` (persone, sezione "I miei professionisti"): `specialisti`
    (studi medici che dichiarano l'area) e `medici` (medico di famiglia o
    pediatra, per medicina generale e pediatria). Con Overture tutte le 19 aree
    hanno professionisti (prima 13 su 19 ne erano senza): per esempio cardiologia
    143 studi, oculistica 129, urologia 97, pediatria 153. Se un gruppo è vuoto
    il frontend rimanda al proprio medico di famiglia.
  Il punto di partenza deve essere dentro Milano (altrimenti 400); senza punto
  si parte dal Duomo. Risposta in circa 10 ms.
- Le rotte ricevono solo l'area e un punto, mai il testo del referto.
- **Licenze:** Comune CC0, CC BY e IODL; medici e pediatri **CC BY-NC** (va bene
  per la demo, non per un uso commerciale); OSM ODbL (citare "© OpenStreetMap
  contributors"); Overture CDLA Permissive 2.0 (citare la fonte). Fonti e
  licenze sono nel file e in `/api/strutture/aree`.
- **Limiti:** gli studi di Overture vengono in gran parte da registri di
  imprese, con nomi e indirizzi a volte datati; i reparti dicono dove si è
  ricoverati, per le visite ambulatoriali sono un'indicazione; mancano le Case
  di Comunità e l'elenco dei pronto soccorso; nefrologia (8 studi) e oncologia
  (22) restano scarse e si appoggiano agli ospedali.
- Test: `test/strutture.spec.ts`.

## Avvio in locale con le credenziali

`npm run start:dev` legge `backend/.env` se c'è (`node --env-file-if-exists`):
lì vanno `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID` e, se serve, `MONGODB_URI`.
Senza le credenziali Evolus la chat risponde 503 e le domande sul foglietto
usano la riserva deterministica (il brano del foglio).
