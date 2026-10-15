---
tags: [area/indice]
aggiornato: 2026-10-15
---

# Registro delle modifiche

Torna a [[00-indice]]. Regola: **ogni modifica al codice aggiunge qui una riga**
(la più recente in alto) e aggiorna la nota dell'area toccata.

Formato: `AAAA-MM-GG · branch · cosa cambia · [[nota]]`

- 2026-10-15 · chat-frontend · Portale: «Mappa» apre una finestra nel portale (Leaflet + tile OpenStreetMap, caricati solo quando serve) invece di una nuova scheda; Esc o «Chiudi» per tornare, a tutto schermo sul telefono · [[16-frontend]]
- 2026-10-15 · chat-frontend · Backend: se MongoDB non si connette si riprova ogni 15 secondi (prima l'istanza restava senza archivio fino al riavvio) · [[15-backend]]
- 2026-10-15 · chat-frontend · Backend: connessione a MongoDB pigra (con `MONGODB_URI` su Vercel tutte le rotte davano 500); nel log il motivo se non si connette (oggi: IP di Vercel non ammesso in Atlas) · [[15-backend]]
- 2026-10-15 · chat-frontend · Chat: la spiegazione si finisce e va in cache anche se il browser chiude a metà (tempo massimo 240 s); `classificazione: true` da `classifica()` riempie la cache senza creare conversazioni; nessuna conversazione per un browser che ha già chiuso · [[15-backend]] · [[16-frontend]]
- 2026-10-15 · chat-frontend · Unito a `staging`: le sessioni con turni dal browser e l'`ArchivioSessioni` lasciano il posto alle conversazioni della chat; restano gli utenti con nickname (`POST /api/sessioni/utenti`); `daCache` spostato sul nuovo `cliente.ts` · [[15-backend]] · [[16-frontend]]
- 2026-10-15 · chat-frontend · Chat su MongoDB: cache della spiegazione per utente e referto (stessa versione del motore), domande con la spiegazione salvata senza rispiegare il referto, conversazioni e trace di ogni generazione salvate dal backend; rotte `/api/sessioni/conversazioni` con chiave API · [[15-backend]]
- 2026-10-15 · pietro-giovedi-2 · Prenota una visita: "Scegli una data", "Chiama" ed "Email" sono tre modi distinti; il calendario si apre solo con "Scegli una data" e si conferma con "Prenota" · [[16-frontend]]
- 2026-10-15 · pietro-giovedi-2 · "Prenota una visita" funzionante (demo): scelta del referto, strutture e professionisti dell'area, calendario di prova uguale per tutti, "Chiama", "Email" e "Segna come prenotata" · [[16-frontend]]
- 2026-10-15 · pietro-giovedi-2 · Nuovo flusso: "Le mie strutture" e "I miei professionisti" mostrano solo visite e prenotazioni; ricerca con "Cerca strutture" e "Cerca professionisti" in "I miei documenti" (referti già classificati), "Prenota una visita" sposta il risultato nella sezione; test aggiornati ma non eseguiti · [[16-frontend]]
- 2026-10-15 · pietro-giovedi-2 · Overture Maps come terza fonte delle strutture di Milano (file pubblici letti con DuckDB, senza chiavi): studi specialistici e ambulatori privati, filtri di qualità e doppioni; tutte le 19 aree hanno professionisti (prima 13 ne erano senza) · [[15-backend]]
- 2026-10-15 · pietro-giovedi-2 · "Le mie strutture" e "I miei professionisti" in due sezioni: tipo `studio-medico` nei dati, `categoria` in `/api/strutture`, pagina dei professionisti con il proprio medico di famiglia, due collegamenti dal widget, barra del telefono di sei voci · [[15-backend]] · [[16-frontend]]
- 2026-10-15 · pietro-giovedi-2 · "Le mie strutture": strutture di Milano (open data del Comune e OpenStreetMap, `data/strutture-milano.json`), modulo `strutture` con ricerca per area della classificazione del Mother agent e per tipo, nuova sezione nel portale con classificazione che si ferma alla riga ARGOMENTO, collegamento dal widget; paziente demo a Milano · [[15-backend]] · [[16-frontend]]
- 2026-10-15 · pietro-giovedi-2 · Allineato a `main` (Mother agent ricostruito, `MotoreChat`); tolta la separazione della fonte dei foglietti (`FonteFoglietti`, `FonteAifa`): `foglietti.service.ts` resta quello di `main` · [[15-backend]]
- 2026-10-15 · chat-frontend · Vercel: `MOTORE_CHAT` e `RADEON_API_KEY` anche per le anteprime (tutti i rami) · [[15-backend]]
- 2026-10-15 · chat-frontend · Mother diretto: il modello di riserva si aspetta fino a 90 secondi (non 20) · [[15-backend]]
- 2026-10-15 · chat-frontend · Mother diretto attivo su Vercel; passa al modello di riserva anche su 504 o dopo 20 secondi senza risposta · [[15-backend]]
- 2026-10-15 · chat-frontend · Mother agent ricostruito nel backend (stesso prompt e modello, cercaFarmaci locale), attivabile con `MOTORE_CHAT=diretto` · [[15-backend]]
- 2026-10-15 · pietro-giovedi-2 · Aspetto del frontend riportato a quello di `main` (CSS, caratteri, testi, componenti del portale; HTML delle pagine identico a `main`); restano l'architettura (tipi di Referto, adattatore del portale, client di Referto, `useFoglietto`, regola di lint) e i test Vitest · [[16-frontend]]
- 2026-10-15 · pietro-giovedi · Titoli dei gruppi della Home (Da fare, Prossima visita, Ultimi documenti, Dallo studio) dentro il riquadro, come intestazione azzurra · [[16-frontend]]
- 2026-10-15 · pietro-giovedi · Blu per il portale (testata blu scuro, menu, pulsanti, icone e titoli dei gruppi, cornice su "Da fare", etichette di tempo) e verde solo per Referto, per orientare l'occhio · [[16-frontend]]
- 2026-10-15 · pietro-giovedi · Client di Referto (`referto/cliente.ts`, al posto di `api.ts` e `servizio-chat.ts`) con esito sempre garantito e messaggi d'errore in un posto; stato del lettore in `useFoglietto`; test di client, `useChat` e `useFoglietto`; segnalato il doppio messaggio d'errore del widget · [[16-frontend]]
- 2026-10-15 · pietro-giovedi · Referto separato dal portale: tipi propri (`referto/tipi.ts`), adattatore `portale/perReferto.ts`, regola di lint che vieta import da `portale/`, CSS di Referto autonomo (corretta l'icona della visita collegata rimasta senza stile e il grigio secondario sotto 7:1); Vitest nel frontend con i primi test · [[16-frontend]]
- 2026-10-15 · pietro-giovedi · Sessioni: salvataggio dietro l'interfaccia `ArchivioSessioni` (MongoDB e memoria); i test girano sempre (prima saltati senza MongoDB), verificati anche su MongoDB 7 · [[15-backend]]
- 2026-10-15 · pietro-giovedi · Foglietti: fonte dei fogli separata dalla loro lettura (`FonteFoglietti`, `FonteAifa`); test con fonte di prova al posto di `jest.spyOn`, nuovi test su download, memoria ed estrazione; `npm test` con `--experimental-vm-modules` · [[15-backend]]
- 2026-10-15 · pietro-giovedi · Primo diagramma archify: architettura del sistema (`docs/archify/architecture-referto-20261015-104805/`) · [[archify/README]]
- 2026-10-15 · pietro-giovedi · Nuova cartella `docs/archify/` per i diagrammi della skill archify; regola in `CLAUDE.md` · [[archify/README]]
- 2026-10-15 · pietro-giovedi · Portale più professionale dopo il confronto con MyChart, NHS App, Apple Salute, Doctolib e One Medical: gruppi di righe al posto delle schede, Home "Da fare", titoli in Source Serif 4, tolte decorazioni (motivo a croci, riquadri delle icone, pillole colorate) · [[16-frontend]]
- 2026-10-15 · pietro-giovedi · Niente blu: portale e widget in una scala di otto verdi (foresta, pino, felce, muschio, salvia, germoglio, menta, nebbia) con contrasti misurati; dettagli: fascia di benvenuto con motivo a croci, tacca sul menu attivo, calendario e etichette in toni di verde, contorno di fuoco doppio, favicon con il marchio · [[16-frontend]]
- 2026-10-15 · pietro-giovedi · Restyling del widget Referto: carattere Atkinson Hyperlegible Next e Public Sans ospitati nell'app; verde solo per marchio e azioni, contenuti su carta bianca, bordi dei controlli oltre 3:1; nuovo marchio a foglio e pulsanti a pillola; spiegazione come foglio unico e domande come citazioni; al telefono «Capire un referto» diventa una fascia fissa (copriva i pulsanti); testi in rem; CSS di Referto separato (`referto/referto.css`) · [[16-frontend]]
- 2026-10-15 · chat-frontend · Domande sul foglietto: se l'agente non risponde entro 75 secondi o dà errore si risponde con il brano del foglio (prima: errore 500 per timeout) · [[15-backend]]
- 2026-10-15 · chat-frontend · Backend: `@nestjs/mongoose` 11.0.4 (CommonJS) al posto della 12 (solo ESM), che su Vercel bloccava l'avvio di tutto il backend · [[15-backend]]
- 2026-10-15 · chat-frontend · Frontend rifatto come portale dimostrativo di uno studio medico con Referto integrato (widget, lettore PDF del foglietto con domande, versione per telefono) · [[16-frontend]]
- 2026-10-15 · chat-frontend · Backend: modulo foglietti (PDF AIFA, sezioni, domande all'agente con riserva deterministica) · [[15-backend]]

## 2026-10-14

- `chat-frontend` · Modulo sessioni con Mongoose: schemi Utente/Sessione/Turno, CRUD completo, rotte API sotto `/api/sessioni`, connessione MongoDB condizionale (`MONGODB_URI`), 10 test e2e · [[15-backend]] · [[specifica-storico-sessione]]
- `chat-frontend` · Tre documenti di specifica in `docs/`: terminologia medica ([[specifica-terminologia]]), visite e specialisti vicini ([[specifica-visite-specialisti]]), storico referti per sessione ([[specifica-storico-sessione]]). Aggiornato l'indice e la mappa mermaid · [[00-indice]]
- `chat-frontend` · Mother agent: nuovo passo di classificazione e riga `ARGOMENTO: <esame> · <area>` in cima alla risposta (area da elenco chiuso di 19 branche, riserva Medicina generale, mai diagnosi o reperti); prompt caricato su Evolus · [[15-backend]]
- `chat-frontend` · Aggiunta `resources/evolus/`: prompt degli agenti Evolus allineati alla piattaforma (Mother e Farmaci; Lettore, Spiegatore, Valutatore e Revisore in `agenti/archivio/`), script di sincronizzazione e di caricamento delle schede AIFA nella Conoscenza (le schede, generate, restano fuori da Git); note sui modelli Token Factory per H100 (`resources/modelli_*.pdf`) · [[15-backend]]
- `chat-frontend` · `CLAUDE.md`: tolto il vincolo "il referto non lascia il computer"; resta il divieto di dati sanitari in Git e di contenuti nei log · [[14-problemi-noti-e-prossimi-passi]]
- `chat-frontend` · Chat "Spiegami un referto" nel frontend collegata al Mother agent: `POST /api/chat` nel backend inoltra a Evolus `/ask-stream` e ritrasmette la risposta in streaming; credenziali Evolus solo lato server, 10 messaggi al minuto per IP · [[15-backend]] · [[16-frontend]]
- `vercel-services` · Backend su Vercel Services: `src/percorsi-moduli.ts` rende trovabili le librerie in `backend/node_modules/` (il primo deploy falliva con "Cannot find module 'reflect-metadata'") · [[15-backend]]
- `vercel-services` · Un solo progetto Vercel con Services (`vercel.json` nella radice): `/api/*` al backend, il resto al frontend; `resources/` esclusa. Il backend trova i dati anche in `backend/data/`, come li monta la funzione di Services · [[15-backend]] · [[16-frontend]]
- `riorganizzazione` · Nuova struttura: `backend/` (ex `servizio-farmaci/`, rotte sotto `/api`, dati AIFA in `backend/data/`), `frontend/` (React + Vite, inoltro `/api` al backend), `resources/` (app Python, dataset, script). Due progetti Vercel · [[15-backend]] · [[16-frontend]]
- `servizio-farmaci` · Pubblicazione su Vercel: `vercel.json` e `npm run copia-dati` portano i dati di `farmaci/` nella funzione; il servizio li cerca prima in `servizio-farmaci/data/` · [[15-backend]]
- `servizio-farmaci` · Nuovo servizio NestJS (TypeScript) per gli agenti Evolus: collega i nomi dei farmaci al prontuario AIFA con la stessa logica di `lookup()`, più categoria ATC e frase pronta; riceve solo nomi, mai il referto. Sali e alias spostati in `farmaci/normalizzazione.json`, condiviso con `farmaci_referti.py` · [[15-backend]]

## 2026-10-13

- `staging` · "Per saperne di più" con righe compatte che portano a Terminologie, Farmaci e Dove andare filtrati sul referto, con ritorno al referto; tolte le viste interne non più usate · [[05-webapp-e-interfaccia]]
- `staging` · Terminologie in stile vocabolario: menu a tendina alfabetico per iniziale e scheda completa della parola, con i referti in cui compare · [[06-glossario-hpo]]
- `staging` · "Dove andare" automatico: città dal profilo (Ferrara), specialità dall'ultimo referto, mappa ed elenco a gruppi subito; geocoding sul comune e non sulla provincia; mirror Overpass `maps.mail.ru` · [[07-branca-e-strutture]]
- `staging` · Farmaci: corrispondenza univoca nome → foglietto. Nome commerciale italiano (escluse le importazioni parallele) o unico farmaco con quel principio attivo; negli altri casi sceglie il paziente, mai l'app · [[08-referti-e-farmaci-aifa]]
- `staging` · File, Foto e Testo uniti nella sezione "Spiegami un referto": si sceglie la modalità e compare solo lo strumento giusto; la Foto apre la fotocamera dal vivo · [[05-webapp-e-interfaccia]]
- `staging` · Creata la documentazione `docs/` (vault Obsidian) e `CLAUDE.md`
  con la regola di aggiornamento · [[00-indice]]
- `main` · Merge di `feature-proposal-pietro` in `main`; creato il branch
  `staging` per l'integrazione · [[13-git-e-workflow]]
- `feature-proposal-pietro` · Interfaccia semplificata: tre gruppi nella barra
  laterale, strumenti per il team nascosti, titoli della spiegazione più
  diretti, sezioni secondarie a scomparsa, testi e pulsanti più grandi;
  "Parole difficili" rinominata "Terminologie" · [[05-webapp-e-interfaccia]]
- `feature-proposal-pietro` · Sezioni "I miei referti" (storico sulle trace) e
  "I miei farmaci" (farmaci scritti nei referti, prontuario e foglietti AIFA) ·
  [[08-referti-e-farmaci-aifa]]
- `feature-proposal-pietro` · Specialità del referto e mappa degli specialisti
  vicini con OpenStreetMap · [[07-branca-e-strutture]]
- `feature-proposal-pietro` · Glossario dei termini medici da HPO con
  spiegazioni semplici salvate · [[06-glossario-hpo]]

## 2026-10-12

- `output-test` · `OLLAMA_LOAD_TIMEOUT=30m` per i modelli grandi; cartelle dei
  run `<modello>-<ora>-<minuto>`; input da file di testo anche con `submit.sh`;
  `"think": false` nelle chiamate · [[10-dataset-e-valutazione]]
- `output-test` · Risorse SLURM: 1 GH100 per task, fino a 8 task in parallelo ·
  [[11-modelli-e-ollama]]
- `output-test` · Pipeline SLURM a shard e dataset clinici sul branch ·
  [[10-dataset-e-valutazione]]
