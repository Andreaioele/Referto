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

Due progetti Vercel collegati a questo repository:

| Progetto | Root Directory | Preset | Variabili |
|---|---|---|---|
| backend | `backend` | NestJS | `CHIAVE_API` |
| frontend | `frontend` | Vite | — |

Il frontend inoltra `/api/*` al backend (`frontend/vercel.json`): per il
browser c'è un solo dominio. Dettagli in `docs/15-backend.md` e
`docs/16-frontend.md`.

> Il risultato è generato automaticamente e può contenere errori. Referto non
> formula diagnosi e non va usato per decisioni sulle cure o valutazioni di urgenza.
