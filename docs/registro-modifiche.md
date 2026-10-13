---
tags: [area/indice]
aggiornato: 2026-10-13
---

# Registro delle modifiche

Torna a [[00-indice]]. Regola: **ogni modifica al codice aggiunge qui una riga**
(la più recente in alto) e aggiorna la nota dell'area toccata.

Formato: `AAAA-MM-GG · branch · cosa cambia · [[nota]]`

## 2026-10-13

- `staging` · Creata la documentazione `docs/` (vault Obsidian) e `CLAUDE.md`
  con la regola di aggiornamento · [[00-indice]]
- `main` · Merge di `feature-proposal-pietro` in `main`; creato il branch
  `staging` per l'integrazione · [[13-git-e-workflow]]
- `feature-proposal-pietro` · Interfaccia semplificata: tre gruppi nella barra
  laterale, strumenti per il team nascosti, titoli della spiegazione più
  diretti, sezioni secondarie a scomparsa, testi e pulsanti più grandi;
  "Parole difficili" rinominata "Terminologie" · [[05-webapp-e-interfaccia]]
- `feature-proposal-pietro` · Sezioni "I miei referti" (storico sulle trace) e
  "I miei farmaci" (farmaci scritti nei referti, prontuario e foglietti AIFA) ·
  [[08-referti-e-farmaci-aifa]]
- `feature-proposal-pietro` · Specialità del referto e mappa degli specialisti
  vicini con OpenStreetMap · [[07-branca-e-strutture]]
- `feature-proposal-pietro` · Glossario dei termini medici da HPO con
  spiegazioni semplici salvate · [[06-glossario-hpo]]

## 2026-10-12

- `output-test` · `OLLAMA_LOAD_TIMEOUT=30m` per i modelli grandi; cartelle dei
  run `<modello>-<ora>-<minuto>`; input da file di testo anche con `submit.sh`;
  `"think": false` nelle chiamate · [[10-dataset-e-valutazione]]
- `output-test` · Risorse SLURM: 1 GH100 per task, fino a 8 task in parallelo ·
  [[11-modelli-e-ollama]]
- `output-test` · Pipeline SLURM a shard e dataset clinici sul branch ·
  [[10-dataset-e-valutazione]]
