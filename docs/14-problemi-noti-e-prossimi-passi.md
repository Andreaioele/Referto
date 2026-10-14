---
tags: [area/progetto]
aggiornato: 2026-10-14
---

# Problemi noti e prossimi passi

Torna a [[00-indice]].

Aggiornare questa nota quando un problema si risolve (e scriverlo in
[[registro-modifiche]]).

## Problemi noti

| Problema | Dove | Nota |
|---|---|---|
| Sezione Indicazioni che incolla il referto intero o perde il piano di cura (MTSamples) | `extract_document_recommendations()` | [[03-pipeline-spiegazione]] |
| MedGemma escluso dal regolamento ma ancora default | `DEFAULT_MODEL` | [[11-modelli-e-ollama]] |
| `"think": false`, input da file di testo, pipeline SLURM non sono su `main` | branch `output-test` | [[13-git-e-workflow]] |
| Nessun client OpenAI: niente AMD Token Factory | chiamate Ollama native | [[11-modelli-e-ollama]] |
| Analisi lenta: almeno 4 chiamate al modello | `web_app.py` | [[02-architettura]] |
| Overpass spesso sovraccarico | `strutture_sanitarie.py` | [[07-branca-e-strutture]] |
| Copertura OSM delle specialità parziale | OpenStreetMap | [[07-branca-e-strutture]] |
| HPO senza anatomia e procedure | glossario | [[06-glossario-hpo]] |
| Cache del glossario indipendente dal modello | `parole_salvate.json` | [[06-glossario-hpo]] |
| Referti vuoti o quasi nei dataset | `datasets/` | [[10-dataset-e-valutazione]] |
| Gemma 4 31B non ancora provato sul cluster | `output-test` | [[10-dataset-e-valutazione]] |
| La chat (`/api/chat`) manda il testo del referto a Evolus: va deciso con il team se e come conciliarlo con "il referto non lascia il computer" | `backend/src/chat/` | [[15-backend]] |
| Il Mother agent (DeepSeek-V4.1 su Token Factory) risponde in 1-3 minuti e con più richieste insieme va oltre il limite (HTTP 422 "sovraccarico") | Evolus | [[15-backend]] |
| Farmaci: nessuna tolleranza agli errori di battitura; alias esteri con dosaggio non riconosciuti ("Lipitor 40 mg") | `lookup()`, `backend/` | [[15-backend]] |

## Prossimi passi proposti

- Pubblicare il progetto Vercel con Services (backend + frontend) e collegare il
  backend come Web API all'agente Referto su Evolus, al posto del sotto-agente
  "Referto Farmaci" ([[15-backend]], [[16-frontend]]).
- Portare l'app Python (`resources/`) in backend e frontend, una funzione alla
  volta. Prima di pubblicare in cloud l'analisi dei referti va rivisto il vincolo
  "il referto non lascia il computer" (`CLAUDE.md`, [[09-trace-e-privacy]]).
- Correggere la sezione Indicazioni dividendo il testo sulle intestazioni
  (`PLAN:`, `RECOMMENDATIONS:`, `CONCLUSIONI:`).
- Portare su `main` (via `staging`) le modifiche di `output-test`.
- Client compatibile OpenAI configurabile, per usare AMD Token Factory e
  mostrare AMD nella demo (pannello con modello, latenza, token al secondo).
- Unire glossario, branca e farmaci in una sola chiamata al modello.
- Controllo di copertura dei reperti ("12 reperti su 14 spiegati").
- Semaforo deterministico "parlane presto con il tuo medico".
- Indice di leggibilità Gulpease prima e dopo.
- Domande da portare alla visita e scheda da stampare.
- Anonimizzazione prima del modello e modalità "nessun dato salvato".

Catalogo completo delle idee: Feature Proposal in `Referto-doc/` ([[01-panoramica]]).
