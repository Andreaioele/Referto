# Referto

Referto aiuta i pazienti a capire un referto medico in italiano semplice, senza
fare diagnosi né dare consigli.

## Struttura

| Cartella | Cosa contiene |
|---|---|
| [`backend/`](backend/) | Backend NestJS (TypeScript), rotte sotto `/api`. Oggi: ricerca dei farmaci nel prontuario AIFA, usata anche dagli agenti Evolus |
| [`frontend/`](frontend/) | Frontend React + Vite (TypeScript) |
| [`resources/`](resources/) | App Python di riferimento (Flask + modelli locali), dataset, script e prove |
| [`docs/`](docs/) | Documentazione di progetto (vault Obsidian): inizia da `docs/00-indice.md` |

L'app completa oggi è quella Python in `resources/`; le sue funzioni vengono
portate una alla volta in `backend/` e `frontend/`.

## Avvio in locale

```bash
cd backend && npm install && npm run start:dev    # http://localhost:3000/api/salute
```

```bash
cd frontend && npm install && npm run dev         # http://localhost:5173
```

App Python: istruzioni in [`resources/README.md`](resources/README.md).

## Pubblicazione su Vercel

Un solo progetto Vercel con **Services** (beta, disponibile anche sul piano Hobby),
configurato da `vercel.json` nella radice:

| Percorso | Servizio | Cartella |
|---|---|---|
| `/api/*` | backend (NestJS) | `backend/` |
| tutto il resto | frontend (Vite) | `frontend/` |

Un solo dominio, niente CORS. `resources/` (l'app Flask) **non** è un servizio e
non viene pubblicata. Impostazioni del progetto: Root Directory `./`, preset
**Services**, variabili `CHIAVE_API` (rotte dei farmaci per gli agenti),
`EVOLUS_API_KEY` ed `EVOLUS_APPLICATION_ID` (chat con il Mother agent). Dettagli in `docs/15-backend.md` e
`docs/16-frontend.md`.

> Il risultato è generato automaticamente e può contenere errori. Referto non
> formula diagnosi e non va usato per decisioni sulle cure o valutazioni di urgenza.
