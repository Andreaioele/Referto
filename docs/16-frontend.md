---
tags: [area/interfaccia]
aggiornato: 2026-10-15
---

# Frontend (React + Vite)

Torna a [[00-indice]] · Backend in [[15-backend]] · Interfaccia attuale in [[05-webapp-e-interfaccia]].

## A cosa serve

`frontend/` è la nuova interfaccia di Referto: React 19 + Vite + TypeScript,
pubblicata come sito statico. È un portale dimostrativo di uno studio
medico con Referto integrato come widget (vedi sotto). Nel widget la risposta del
Mother agent compare mentre viene scritta (`POST /api/chat`, [[15-backend]]). Le domande successive continuano la stessa
conversazione. Se arriva un errore dopo una parte della risposta, la parte già
scritta resta e l'errore la segue. La data del prontuario (`GET /api/salute`) è
nei dettagli a scomparsa «Come è fatta questa spiegazione». Le
schermate dell'app Python (`resources/templates/`, `resources/static/`) vanno
portate qui una alla volta, con gli stessi principi: poche informazioni alla
volta, testi grandi, tema di Referto descritto sotto ([[05-webapp-e-interfaccia]]).

## Collegamento con il backend

Il frontend chiama sempre `/api/...` sul proprio dominio:

- **sviluppo**: Vite inoltra `/api` a `http://localhost:3000` (`vite.config.ts`,
  sovrascrivibile con `BACKEND_URL`);
- **Vercel**: il progetto usa Services (`vercel.json` nella radice): `/api/*`
  va al servizio backend, il resto al servizio frontend, che rimanda a
  `index.html` le rotte che non sono file (navigazione lato client).

Per il browser c'è un solo dominio: niente CORS. Le rotte del backend protette da
chiave (farmaci, per gli agenti) non vanno chiamate dal frontend, perché la chiave
finirebbe nel browser: le funzioni per i pazienti avranno rotte proprie.

## File

| File | Ruolo |
|---|---|
| `src/App.tsx` | Pagine del portale e finestre sopra (widget, foglietto, documento) |
| `src/portale/` | Portale dimostrativo: pagine, dati di esempio, date, menu |
| `src/referto/WidgetReferto.tsx`, `useChat.ts`, `spiegazione.ts` | Widget Referto e chat con il Mother agent |
| `src/referto/LettoreFoglietto.tsx`, `useFoglietto.ts`, `PaginaPdf.tsx`, `pdf.ts` | Lettore del foglietto AIFA con le domande: stato in `useFoglietto`, vista nel componente |
| `src/referto/cliente.ts` | Client di Referto verso `/api`: spiegazione in streaming, foglietti, stato del backend; errori già scritti per la persona |
| `src/azioni.ts` | Azioni che le pagine chiedono all'app (punto di integrazione con Referto) |
| `src/index.css` | Tema del portale (finto: gruppi di righe, un verde, Source Serif 4 per i titoli e Public Sans), versione per telefono sotto i 760 px |
| `src/referto/referto.css` | Tema di Referto: widget e lettore del foglietto, separato dal portale perché è la parte che si integra in portali diversi |
| `src/referto/Marchio.tsx` | Marchio di Referto (foglio con l'angolo piegato e la R) |
| `src/referto/tipi.ts` | Cosa riceve Referto dal portale: `RefertoDaSpiegare`, `FarmacoDaLeggere` |
| `src/portale/perReferto.ts` | Adattatore del portale dimostrativo verso i tipi di Referto |

## Tema di Referto (15/10/2026)

Scelte dopo l'analisi con la skill `frontend-design` e una ricerca sui colori
verde e bianco per pazienti anziani:

- **Carattere:** Atkinson Hyperlegible Next (Braille Institute), pensato per chi
  vede poco e chiaro sui numeri (1/l/I, 0/O). Il portale usa Public Sans. Tutti e
  due ospitati nell'app (`@fontsource`), niente servizi esterni.
- **Colori** (`:root` in `referto.css`, contrasto misurato sul bianco): verde
  `#0f5143` (9,2:1) solo per marchio e azioni, **mai per stati clinici** (il
  verde si legge come "tutto a posto"); contenuti su carta bianca, testo
  `#1d2422`; menta `#e3f1ea` solo per ciò che è selezionato, mai come struttura
  (con l'età le tinte pallide blu-verdi si distinguono peggio); bordi dei
  controlli `#76847e` (3,9:1, sopra il minimo di 3:1); ambra `#8a4a00` per i
  valori fuori intervallo, sempre con l'etichetta.
- **Riconoscibilità:** Referto si distingue dal portale anche per forma, non
  solo per colore: marchio a foglio su ogni pulsante che lo apre e pulsanti a
  pillola (il portale ha rettangoli arrotondati).
- **Il widget è un foglio da leggere:** la spiegazione è un unico foglio con
  sezioni separate da spazio e filetti, non una pila di schede; le domande del
  paziente lo continuano ("Le tue domande", domanda come citazione, non fumetti).
- **Telefono:** «Capire un referto» è una fascia fissa sopra la barra delle
  schede, non un pulsante sospeso (copriva i pulsanti della pagina);
  `scroll-padding-bottom` evita che lo scorrimento automatico lasci elementi sotto.
- **Testi in `rem`:** seguono la dimensione del testo scelta nel telefono o nel browser.
- Domanda pronta «Cosa posso chiedere al medico?» al posto di «Devo preoccuparmi?».
- **Portale "da portale vero" (15/10/2026, dopo un confronto con MyChart, NHS App,
  Apple Salute, Doctolib e One Medical):** pagina neutra `#f4f5f4`, contenuti in
  **gruppi di righe** su carta bianca (titolo del gruppo sopra, righe separate da
  filetti, componente `Gruppo` in `portale/elementi.tsx`) invece di schede
  separate; testo tenue `#4b5450` (7,8:1), bordi dei controlli `#76847e`.
  Titoli delle pagine, nome dello studio e giorno delle visite in
  **Source Serif 4** (carta intestata dello studio, come One Medical), il resto
  in Public Sans. Tolti: fascia di benvenuto con motivo, riquadri colorati delle
  icone, pillole piene, riquadro colorato del calendario (ora colonna della data
  con filetto), separatori a punto centrale nei testi, maiuscole nelle tabelle.
- **Blu per il portale, verde per Referto** (15/10/2026, come era su `main`): il
  blu `#1f4e8c` (8,3:1) è dello studio: pulsanti, collegamenti, menu e schede
  selezionate (fondo `#e6edf7`), icone delle righe. La **testata** è blu scuro
  `#163a69` con il marchio bianco: il punto fermo in cima a ogni pagina. Il
  verde resta solo di Referto (pillole con il marchio, widget, lettore), così si
  distingue a colpo d'occhio cosa apre Referto. Colore per orientare l'occhio:
  icona blu e titolo blu scuro su ogni gruppo (`Gruppo` con `icona`), cornice
  blu sul gruppo "Da fare" (`prioritario`), giorno della prossima visita in blu,
  "Tra 8 giorni" come etichetta blu chiaro, "Nuovo" con pallino blu, "Da
  ritirare" con pallino ambra (azione fuori dal portale), note "Da portare" e
  "Come ha scritto il medico" su azzurro `#eef3fa`; l'ambra resta per avvisi e
  preparazione.
- **Home "Da fare"** (come i «To Do» di MyChart): nuovo referto e ricette da
  ritirare in cima, poi prossima visita, ultimi documenti e messaggio dello studio.
- **Schede di pagina** (Prossime/Già fatte, Farmaci/Esami) come in MyChart e NHS:
  testo con una riga sotto la scelta, non pulsanti pieni.

## Comandi

```bash
cd frontend && npm install
npm run dev     # http://localhost:5173, con il backend avviato su :3000
npm run build   # controllo dei tipi e build in dist/
npm run lint    # oxlint
npm test        # Vitest (jsdom): file *.test.ts(x) accanto al codice
```

Su Vercel è il servizio `frontend` del progetto Services (`vercel.json` nella radice).

## Referto separato dal portale (15/10/2026)

Referto (`src/referto/`) si integra in portali diversi, quindi non importa nulla
da `src/portale/`: lo impone la regola `no-restricted-imports` in
`.oxlintrc.json` (`npm run lint` fallisce).

- **Cosa riceve:** i tipi di `referto/tipi.ts`. `RefertoDaSpiegare` ha titolo,
  data già scritta, testo (l'unica cosa che va al Mother agent), valori, note
  del medico e la visita collegata già risolta (titolo, quando, indirizzo), solo
  se è ancora da fare. `FarmacoDaLeggere` ha codice AIFA, confezione, nome AIFA,
  nome della ricetta e dose scritta dal medico.
- **Adattatore:** `portale/perReferto.ts` trasforma i dati del portale in
  questi tipi; `App.tsx` lo chiama quando apre il widget o il lettore. Un altro
  portale scrive il suo adattatore, Referto non cambia.
- **CSS:** `referto.css` usa solo le sue variabili e contiene le classi di
  Referto prima sparse nel portale (`.bottone-referto`, `.referto-velo`,
  icona della visita, etichette "Citata nella risposta" e "Non trovato"). Dal
  portale prende solo le classi di base: `.bottone`, `.bottone-leggero`,
  `.tenue`, `.piccolo`, `.nascosto`, `.solo-computer`, `.solo-telefono`.
- Testo secondario di Referto `#4b5450` (7,8:1): prima era `#55605c` (6,5:1),
  sotto il minimo di 7:1.
- Test: `portale/perReferto.test.ts`, `referto/domande-pronte.test.ts`,
  `referto/WidgetReferto.test.tsx` (il widget con un Mother agent finto: manda
  solo il testo del referto, mostra valori, note, visita e domande pronte).

## Client di Referto e stato del lettore (15/10/2026)

- **`referto/cliente.ts`** sostituisce `src/api.ts` e `src/servizio-chat.ts`
  (li usava solo Referto). Chi lo usa non legge stati HTTP né righe SSE:
  - `spiega()` passa i pezzi di testo e **finisce sempre con un solo evento**
    `fine` o `errore`, anche se la rete cade o il flusso si chiude prima
    ("La risposta si è interrotta", "Collegamento interrotto"); se la richiesta
    è annullata non arriva più nulla. Non lancia mai.
  - `apriFoglietto()` restituisce dati e PDF aperto insieme; se una delle due
    parti fallisce chiude il PDF già aperto.
  - `chiediAlFoglietto()` e `statoBackend()`; gli errori sono `ErroreServizio`
    con il messaggio per la persona, scritto una volta sola per ogni stato
    (429, 404, 502, altri).
- **`useChat`** trasforma soltanto gli eventi in messaggi.
- **`referto/useFoglietto.ts`**: caricamento, pagina (sempre tra 1 e il
  totale), domande, citazione che porta alla pagina, annullamento e chiusura
  del PDF alla chiusura. `LettoreFoglietto` tiene solo zoom, schede e bozza.
- Test: `referto/cliente.test.ts` (streaming spezzato, errori, annullamento,
  messaggi per stato, PDF chiuso se i dati falliscono),
  `referto/useFoglietto.test.tsx`, `referto/useChat.test.tsx`.

## Portale dimostrativo con Referto integrato (15/10/2026)

Il frontend simula l'area paziente di uno studio medico finto
("Poliambulatorio Valle Serena", dati di esempio in `src/portale/dati.ts`, date
relative a oggi). Referto è il widget integrato nel portale.

- Pagine (`src/portale/`): Home, Le mie visite, I miei documenti, Le mie
  prescrizioni, I miei dati; percorsi `/`, `/visite`, `/documenti`,
  `/prescrizioni`, `/dati` senza librerie (`src/percorsi.ts`). Sotto i 760 px
  il menu diventa una barra in basso (`src/index.css`).
- Integrazione (`src/azioni.ts`): «Spiegamelo», «Fatti spiegare il referto» e
  il pulsante fisso «Capire un referto» aprono il widget
  (`src/referto/WidgetReferto.tsx`): manda il testo del referto a `POST /api/chat`,
  divide la risposta del Mother agent nelle sue parti (`spiegazione.ts`) e
  aggiunge dati verificabili copiati dal referto (valori fuori intervallo con
  citazione, note del medico, visita prenotata). Il consenso in «I miei dati»
  nasconde tutti i pulsanti di Referto (salvato in `localStorage`).
- Foglietto (`src/referto/LettoreFoglietto.tsx`): il PDF ufficiale AIFA,
  disegnato con `pdfjs-dist` (caricato solo quando serve), con sezioni, pagine,
  grandezza del testo e le domande all'agente (`/api/foglietti`, [[15-backend]]).
  Ogni risposta cita la sezione e porta il lettore a quella pagina.
- `Chat.tsx` è stato tolto: la chat libera è il widget senza documento.
