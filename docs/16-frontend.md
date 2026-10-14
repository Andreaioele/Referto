---
tags: [area/interfaccia]
aggiornato: 2026-10-14
---

# Frontend (React + Vite)

Torna a [[00-indice]] · Backend in [[15-backend]] · Interfaccia attuale in [[05-webapp-e-interfaccia]].

## A cosa serve

`frontend/` è la nuova interfaccia di Referto: React 19 + Vite + TypeScript,
pubblicata come sito statico. La pagina iniziale ha la chat "Spiegami un
referto" (`src/Chat.tsx`): si incolla il referto o si fa una domanda e la
risposta del Mother agent compare mentre viene scritta (`POST /api/chat`,
[[15-backend]]). Le domande successive continuano la stessa conversazione;
"Nuovo referto" la azzera. Se arriva un errore dopo una parte della risposta,
la parte già scritta resta e l'errore la segue. Lo stato del collegamento con il
backend (`GET /api/salute`) è nei dettagli a scomparsa in fondo. Le
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
| `src/App.tsx` | Pagina iniziale |
| `src/Chat.tsx` | Chat con il Mother agent |
| `src/servizio-chat.ts` | Invio del messaggio e lettura dello streaming |
| `src/api.ts` | Stato del backend |
| `src/index.css` | Tema (colori e caratteri di `resources/static/app.css`) |

## Comandi

```bash
cd frontend && npm install
npm run dev     # http://localhost:5173, con il backend avviato su :3000
npm run build   # controllo dei tipi e build in dist/
npm run lint    # oxlint
```

Su Vercel è il servizio `frontend` del progetto Services (`vercel.json` nella radice).
