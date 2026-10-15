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
volta, testi grandi, stesso tema ([[05-webapp-e-interfaccia]]).

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
| `src/referto/tipi.ts` | Cosa riceve Referto dal portale: `RefertoDaSpiegare`, `FarmacoDaLeggere` |
| `src/portale/perReferto.ts` | Adattatore del portale dimostrativo verso i tipi di Referto |
| `src/portale/Strutture.tsx`, `Professionisti.tsx`, `MieiLuoghi.tsx`, `prenotazioni.ts`, `distanza.ts` | "Le mie strutture" e "I miei professionisti" (solo luoghi e medici delle proprie visite e prenotazioni) |
| `src/portale/SchedaStudio.tsx` | Card dello studio in "Le mie strutture": prossima visita, storico, Chiama, Mappa, Prenota |
| `src/referto/StruttureVicine.tsx`, `strutture-testi.ts`, `classificazioni.ts` | Strutture per referto e per tipo, testi, classificazioni già fatte |
| `src/referto/FinestraMappa.tsx`, `mappa.ts` | Mappa di una struttura in una finestra del portale (Leaflet + OpenStreetMap) |
| `src/azioni.ts` | Azioni che le pagine chiedono all'app (punto di integrazione con Referto) |
| `src/index.css` | Tema del portale e tema di Referto, versione per telefono sotto i 760 px |

## Comandi

```bash
cd frontend && npm install
npm run dev     # http://localhost:5173, con il backend avviato su :3000
npm run build   # controllo dei tipi e build in dist/
npm run lint    # oxlint
npm test        # Vitest (jsdom): file *.test.ts(x) accanto al codice
```

Su Vercel è il servizio `frontend` del progetto Services (`vercel.json` nella radice).

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
- Cache delle spiegazioni (con MongoDB, [[15-backend]]): se il referto era già
  stato spiegato, il backend manda la spiegazione salvata in un colpo solo e
  l'evento `fine` ha `da_cache: true`. `useChat` lo espone come `daCache` e il
  widget lo dice solo nei dettagli a scomparsa «Come è fatta questa
  spiegazione». L'id della conversazione che torna in `fine` si rimanda con le
  domande, come prima: il backend risponde senza rispiegare il referto.

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
- L'aspetto è quello di `main`: tema unico in `src/index.css`. Referto usa
  ancora le classi del portale per pulsanti ed etichette.

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

## Test (15/10/2026)

Vitest con jsdom (`npm test`): `portale/perReferto.test.ts`,
`referto/domande-pronte.test.ts`, `referto/WidgetReferto.test.tsx` (il widget
con un Mother agent finto: manda solo il testo del referto, mostra valori, note,
visita e domande pronte), `referto/cliente.test.ts` (streaming spezzato, errori,
annullamento, messaggi per stato), `referto/useFoglietto.test.tsx`,
`referto/useChat.test.tsx`.

## Le mie strutture (15/10/2026)

Nuova voce di menu e pagina `/strutture`: dove andare a Milano per i propri
referti. Flusso: **referto → Mother agent → classificazione → ricerca nei dati
locali → elenco**.

- **Per i tuoi referti:** ogni referto ha "Dove andare". Se il referto non è
  ancora classificato, `classifica()` (`referto/cliente.ts`) lo manda a `POST
  /api/chat` e **si ferma appena arriva la riga `ARGOMENTO: esame · area`**
  (la prima della risposta): annulla il resto, così non si aspetta la
  spiegazione intera. Manda anche `classificazione: true`: il backend finisce
  comunque la spiegazione e la mette in cache (senza aprire una conversazione),
  così la classificazione successiva e «Spiegamelo» su quel referto sono
  immediati. Poi `GET /api/strutture?area=...` dalla casa della
  persona ([[15-backend]]). Se l'area non si capisce o il servizio non risponde,
  la persona la sceglie da un elenco.
- **Dal widget:** quando il Mother agent spiega un referto, il widget salva la
  classificazione (`referto/classificazioni.ts`, sessionStorage, sparisce alla
  chiusura della scheda) e in fondo mostra "Dove andare", che porta a
  `/strutture?referto=<id>` con il referto già aperto, senza richiamare il modello.
- **Presentazione:** gruppi con titoli in parole semplici ("Si occupano di
  cardiologia", "Ospedali con il reparto di cardiologia", "Medici di famiglia
  vicino a casa"); per ogni struttura nome, tipo, distanza ("a 850 m da casa"),
  indirizzo e quartiere, orari se ci sono, pulsanti "Chiama" (`tel:`) e
  "Mappa" (finestra nel portale, vedi sotto). Le prime tre, poi "Mostra altre".
  Avviso: Referto non sceglie per te, telefona prima, urgenze 112.
- **Cerca vicino a casa:** medici di famiglia, pediatri, farmacie, laboratori,
  consultori, ospedali. "Da dove vengono questi dati" mostra fonti, licenze e data.
- **Casa della paziente demo:** Viale Monza 140, Milano (`paziente.casa` in
  `portale/dati.ts`, passato a Referto da `casaDelPaziente()`).
- Referto riceve `id` e `doveAndare` in `RefertoDaSpiegare` e il punto di
  partenza (`PuntoDiPartenza`): non conosce i dati del portale.
- Sul telefono la barra in basso ha sei voci.
- Test: `referto/classifica.test.ts`, `referto/StruttureVicine.test.tsx`,
  `referto/strutture-testi.test.ts`, più i casi nuovi in
  `WidgetReferto.test.tsx` e `portale/perReferto.test.ts`.

### Strutture e professionisti separati (15/10/2026)

"Le mie strutture" e "I miei professionisti" sono due sezioni diverse, con lo
stesso flusso (referto → Mother agent → classificazione → ricerca):

- **Le mie strutture** (`/strutture`, "Dove andare"): luoghi, cioè ambulatori,
  laboratori, consultori e ospedali per area; "Cerca vicino a casa" con
  farmacie, laboratori, ambulatori, consultori, ospedali.
- **I miei professionisti** (`/professionisti`, "A chi chiedere"): in cima il
  proprio medico di famiglia (dai dati del portale); per area gli studi medici
  e, per medicina generale e pediatria, medici di famiglia e pediatri vicini;
  se non c'è nessuno studio dell'area, il rimando al medico di famiglia.
  "Cerca vicino a casa": medici di famiglia, pediatri, studi medici.
- Il blocco "Per i tuoi referti" è uno solo (`PerITuoiReferti`, con la
  categoria); la classificazione salvata vale per tutte e due le pagine.
- Il widget, dopo la spiegazione, porta a entrambe ("Dove andare", "A chi
  chiedere": `doveAndare` e `aChiChiedere` in `RefertoDaSpiegare`).
- Sul telefono la barra in basso resta di sei voci: "I miei dati" esce dalla
  barra (`soloComputer` in `pagine.ts`) e si apre dall'avatar in alto.
- Test: `portale/Pagine.test.tsx` più i casi nuovi nei test di Referto.

### Nuovo flusso: ricerca dai documenti, sezioni con le proprie visite (15/10/2026)

Sostituisce le due sezioni descritte sopra con la ricerca dentro le pagine.

- **"Le mie strutture" e "I miei professionisti" non cercano:** mostrano solo
  dove si è stati o si è prenotato. Strutture: lo studio delle visite
  (`SEDE_STUDIO` in `dati.ts`, indirizzo inventato) e le strutture prenotate.
  Professionisti: il medico di famiglia, i medici delle visite allo studio
  (prossima e ultima visita) e i professionisti prenotati. In fondo, l'invito a
  cercare dai referti in "I miei documenti".
- **I referti vecchi sono già analizzati:** `classificazioniGiaFatte` in
  `dati.ts` è la riga ARGOMENTO scritta dal Mother agent all'arrivo del
  referto; l'adattatore la passa in `RefertoDaSpiegare.classificazione`, e la
  ricerca non richiama il modello. Un referto nuovo spiegato nel widget salva la
  sua classificazione come prima.
- **La ricerca è in "I miei documenti":** ogni referto ha "Cerca strutture" e
  "Cerca professionisti", che aprono sotto la riga i risultati per area e
  distanza da casa (`StruttureDelReferto`). Il widget, dopo la spiegazione,
  porta lì (`/documenti?referto=<id>&cerca=strutture|professionisti`).
- **"Prenota una visita"** su un risultato registra la prenotazione
  (`portale/prenotazioni.ts`, demo: nel browser, `localStorage`) e la struttura o
  il professionista compare nella sua sezione, con "Annulla la prenotazione".
- Test aggiornati in `portale/Pagine.test.tsx`, `WidgetReferto.test.tsx`,
  `perReferto.test.ts` (non ancora eseguiti).

### Prenota una visita (demo, 15/10/2026)

"Prenota una visita" (menu, Home e Visite sul telefono) apre `/prenota`
(`portale/Prenota.tsx`):

1. **Per quale referto?** I referti con la loro area (già classificata).
2. **Dove o con chi:** professionisti e strutture dell'area, dal più vicino a
   casa (`StruttureDelReferto`, pulsante "Scegli l'orario").
3. **Come prenotare** (`portale/SceltaOrario.tsx`): tre modi distinti, se ne
   sceglie uno.
   - **"Scegli una data":** apre il calendario di prova (`portale/calendario.ts`),
     uguale per tutti e slegato dalla realtà (prossimi dieci giorni feriali, sei
     orari, alcuni sempre occupati); scelto l'orario, "Prenota" mette la visita
     (con giorno e ora) in "Le mie strutture" o "I miei professionisti". Non
     avvisa nessuno: è una demo.
   - **"Chiama":** `tel:` con il numero vero della struttura, se c'è.
   - **"Email":** apre la posta locale con oggetto e testo già scritti;
     l'indirizzo va aggiunto (nei dati non ci sono email).

Da "I miei documenti", "Prenota una visita" su un risultato porta a `/prenota`
con il referto e la struttura già scelti (`preparaPrenotazione` in
`portale/prenotazioni.ts`). Test in `portale/Pagine.test.tsx`.

### Telefono e mappa come icone (15/10/2026)

Nelle righe di strutture e professionisti (`RigaStruttura`) "Chiama" e "Mappa"
sono pulsanti a icona (telefono, mappa; classe `.bottone-icona`), con
l'etichetta per i lettori di schermo ("Chiama ...", "Mappa: ..."). Se il
telefono o la posizione mancano il pulsante resta, spento (tratteggiato, non
cliccabile, "Telefono non disponibile"). Sul telefono le due icone stanno
affiancate sotto "Prenota una visita".

### Mappa dentro il portale (15/10/2026)

"Mappa" non apre più OpenStreetMap in una nuova scheda: apre una finestra
sopra la pagina con il nome e l'indirizzo della struttura e la mappa centrata
sul segnaposto. Vale ovunque compaia una struttura (`RigaStruttura`): "Le mie
strutture", "I miei professionisti", le prenotazioni e i risultati di "Cerca
strutture"/"Cerca professionisti" in "I miei documenti".

- **Libreria:** Leaflet 1.9.4 (licenza BSD-2) con le tile di OpenStreetMap
  (`tile.openstreetmap.org`, attribuzione "© OpenStreetMap" in basso a destra,
  obbligatoria per la licenza ODbL). Niente chiavi né servizi a pagamento.
- **Peso:** `mappa.ts` (Leaflet e il suo CSS) si carica con `import()` solo
  quando si apre una mappa: un pezzo a parte di circa 44 kB gzip più 6 kB di
  CSS; la pagina iniziale non cambia.
- **Finestra:** `FinestraMappa.tsx` usa `useDialogo` come le altre finestre
  (fuoco su "Chiudi", Esc chiude, il fuoco torna su "Mappa", la pagina sotto non
  scorre); si chiude anche con un clic fuori. È resa nel `body` con
  `createPortal`, così sta sopra tutta la pagina. Sotto i 760 px è a tutto
  schermo e la mappa prende lo spazio che resta.
- **Per chi ha 70 anni:** zoom con la rotellina spento (la pagina non "scappa"
  scorrendo), pulsanti + e − da 44 px, una riga che spiega come muoversi.
  Segnaposto disegnato in SVG con il blu del portale (nessuna immagine da servire).
- **Se la mappa non si carica** (rete assente) la finestra lo dice e resta
  chiudibile.
- Test: `referto/FinestraMappa.test.tsx` (apertura, Esc, "Chiudi", clic fuori,
  fuoco, errore, chiusura prima del caricamento) e `referto/mappa.test.ts`
  (Leaflet vero in jsdom: tile OpenStreetMap, segnaposto, attribuzione).

### Card dello studio in "Le mie strutture" (15/10/2026)

Rifatta dal mockup "Card struttura · Referto" su Claude Design (artboard
computer e telefono). `portale/SchedaStudio.tsx` sostituisce la riga dello
studio (`RigaStruttura` con la nota lunga) e il titolo "Le tue visite" non c'è
più: la sezione ha solo `aria-label`, la card è una.

- **In alto:** icona, nome, "Ambulatorio · a 3 km da casa", indirizzo e orari
  (`SEDE_STUDIO.orari` in `dati.ts`, inventati: per esteso sul computer,
  "lun–ven" sul telefono).
- **Prossima visita** in un riquadro azzurro con la data per esteso
  ("Venerdì 23 ottobre 2026", `dataConGiorno` in `date.ts`) e il tipo di visita.
- **Storico:** "Ultima visita: …" e "Vedi tutte le 7 visite", che apre l'elenco
  dalla più lontana nel futuro alla più vecchia; le prossime sono "(prenotata)".
- **Pulsanti con etichetta**, alti 56 px: sul computer "Chiama" (mostra numero
  e orari sotto i pulsanti), "Mappa" (`FinestraMappa`) e, a destra, "Prenota
  un'altra visita" (blu, porta a `/prenota`). Sul telefono uno sotto l'altro a
  tutta larghezza: "Chiama 02 0000 0000" in blu (link `tel:`), poi Mappa e Prenota.
- Le altre righe di strutture e professionisti (ricerca, prenotazioni, medici)
  restano `RigaStruttura`, con telefono e mappa come icone.
- Test: `portale/SchedaStudio.test.tsx` (con la data fissata al 15 ottobre 2026).
