---
tags: [area/core]
aggiornato: 2026-10-14
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
| `GET /api/docs`, `/api/docs-json` | Documentazione OpenAPI (da importare come Web API in Evolus) | no |

Chiave: intestazione `x-api-key` uguale alla variabile `CHIAVE_API`. Se non è
impostata il controllo è spento (solo sviluppo locale).

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

- **Vercel** (progetto "backend"): Root Directory `backend`, preset NestJS,
  variabile `CHIAVE_API`. Nessuna configurazione: Vercel trova `src/main.ts` e
  include `data/` nella funzione (provato con `vercel build`).
- **Docker**: `docker build -t referto-backend backend`.

Nest 11 (CommonJS) e non 12: Nest 12 è solo ESM e complica Jest. Dettagli in
`backend/README.md`.

## Limiti

- Nessuna tolleranza agli errori di battitura ("Cardioaspirina").
- Alias esteri non riconosciuti se seguiti dal dosaggio ("Lipitor 40 mg"), come nell'app.
