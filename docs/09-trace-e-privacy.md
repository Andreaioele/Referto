---
tags: [area/core]
aggiornato: 2026-10-13
---

# Trace, dati e privacy

Torna a [[00-indice]] · Parte di [[02-architettura]].

## Trace (`trace_store.py`)

Ogni esecuzione (analisi, dataset, benchmark) crea un `TraceRecorder` che
salva su disco **a ogni aggiornamento**, così restano anche le esecuzioni
fallite: `traces/<data>/<trace_id>.json` con stato, durata, passi
(`traced_step`), artefatti (`set_artifact`), output ed errore.

- `trace_scope()` rende la trace attiva per tutto il codice chiamato:
  `traced_step()` e `record_model_call()` (in `performance_metrics.py`) vi scrivono.
- La sezione **Cronologia** (strumenti per il team) mostra le trace grezze;
  **I miei referti** ne è la vista per il paziente ([[08-referti-e-farmaci-aifa]]).

## Cosa resta su disco e cosa esce dal computer

| Dato | Dove | Esce dal computer? |
|---|---|---|
| Testo del referto, prompt, risposte | `traces/` | No: va solo a Ollama in locale |
| Parole del glossario incontrate | `glossario/parole_salvate.json` | No |
| Città del profilo | `profilo/profilo.json` | Solo il nome della città, a Nominatim |
| Zona cercata e coordinate | `strutture_cache/` | Sì, a Nominatim e Overpass (OpenStreetMap) |
| Codice del farmaco di cui si apre il foglietto | `farmaci_cache/` | Sì, ad AIFA |
| Tile della mappa | — | Sì, a OpenStreetMap |

Il testo del referto non viene mai inviato a servizi esterni, a meno che si
configuri `--ollama-url` verso un server remoto (per esempio AMD Token Factory):
chi lo fa è responsabile della destinazione dei dati.

Tutte le cartelle con dati sanitari o personali sono in `.gitignore`: non vanno
aggiunte al repository. Questioni aperte (anonimizzazione prima del modello,
modalità senza salvataggio) in [[14-problemi-noti-e-prossimi-passi]].
