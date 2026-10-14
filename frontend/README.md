# Frontend

Nuova interfaccia di Referto: React 19 + Vite + TypeScript, pubblicata come sito
statico. Per ora c'è la pagina iniziale con il controllo del collegamento al
backend; le schermate dell'app Python (`resources/`) arriveranno una alla volta.

Documentazione di progetto: `docs/16-frontend.md`.

## Comandi

```bash
npm install
npm run dev      # http://localhost:5173 (avvia prima il backend: cd ../backend && npm run start:dev)
npm run build    # controllo dei tipi e build in dist/
npm run lint     # oxlint
```

## Collegamento con il backend

Il frontend chiama sempre `/api/...` sul proprio dominio:

- in sviluppo Vite inoltra `/api` a `http://localhost:3000` (`vite.config.ts`;
  un altro indirizzo con `BACKEND_URL=... npm run dev`);
- su Vercel lo fa `vercel.json`, verso `https://referto-backend.vercel.app`.
  **Se il progetto backend su Vercel ha un altro indirizzo, va cambiato lì.**

## Pubblicazione su Vercel

| Campo | Valore |
|---|---|
| Root Directory | `frontend` |
| Application Preset | Vite |

Le rotte protette da chiave del backend (farmaci, per gli agenti) non vanno
chiamate dal frontend: la chiave finirebbe nel browser.
