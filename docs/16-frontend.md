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
| `src/referto/LettoreFoglietto.tsx`, `PaginaPdf.tsx`, `pdf.ts` | Lettore del foglietto AIFA con le domande |
| `src/servizio-chat.ts` | Invio del messaggio e lettura dello streaming |
| `src/api.ts` | Stato del backend e rotte dei foglietti |
| `src/azioni.ts` | Azioni che le pagine chiedono all'app (punto di integrazione con Referto) |
| `src/index.css` | Tema del portale e tema di Referto, versione per telefono sotto i 760 px |

## Comandi

```bash
cd frontend && npm install
npm run dev     # http://localhost:5173, con il backend avviato su :3000
npm run build   # controllo dei tipi e build in dist/
npm run lint    # oxlint
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
