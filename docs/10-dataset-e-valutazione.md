---
tags: [area/valutazione]
aggiornato: 2026-10-14
---

# Dataset e valutazione

Torna a [[00-indice]] · Modelli in [[11-modelli-e-ollama]].

## Dataset nel repo (`datasets/`)

| File | Referti | Note |
|---|---|---|
| `all_datasets_merged.jsonl` | 5.016 | MTSamples (4.966, inglese) + RadGraph-IT (50, italiano); creato da `merge_datasets.py` |
| `mtsamples_all.jsonl` | 4.966 | Trascrizioni cliniche MTSamples, con `medical_specialty` |
| `mtsamples_cardio_pulmonary.jsonl`, `mtsamples_radiology.jsonl` | 371, 273 | Sottoinsiemi |
| `radgraph_it_50.jsonl` | 50 | Radiografie del torace in italiano (formato a token `sentences`) |
| `mtsamples.csv` | — | Fonte originale MTSamples |

Formato: un oggetto JSON per riga con `doc_key`, `dataset`, `text` (o
`sentences` per RadGraph). `dataset_record_to_text()` in `spiega_referto.py`
legge entrambi i formati.

**Attenzione:** 23 referti MTSamples hanno meno di 50 caratteri e 64 meno di 200
(per esempio `mtsamples-873` è solo `INDICATION: ,`). Vanno esclusi dalle
statistiche. In MTSamples le sezioni sono separate da virgole e non da righe
vuote: è la causa del problema della sezione Indicazioni
([[03-pipeline-spiegazione]]).

## Esecuzione batch

- `cluster_agent_task.py`: elabora un dataset in parallelo (`--workers`) e
  scrive un CSV (`CSV_FIELDNAMES`: stato, errore, durata, token, chiamate,
  testo del referto, spiegazione) più trace e riepilogo JSON. `--resume`
  riparte dai `doc_key` già fatti. Codice di uscita 1 se qualche referto è in errore.
- `submit_h100.sh`: script SLURM singolo, più vecchio (da lanciare dentro `resources/`).
- **Pipeline SLURM a shard** (`slurm/`: `submit.sh`, `config.sh`,
  `run_shard.sbatch`, `prepare_shards.py`, `merge.sbatch`, `merge_outputs.py`):
  sta **solo sul branch `output-test`**, non su `main` ([[13-git-e-workflow]]).
  Divide il dataset in shard, lancia un job array (un `ollama serve` privato
  per task, una GPU per task) e un job di merge che produce `results.csv`.
  Sullo stesso branch: input da file di testo e `"think": false`.

## Risultati finora (cluster, 12/10/2026)

Campione di 50 referti MTSamples (seed 42), H100 NVL:

| Modello | Esito | Note |
|---|---|---|
| `qwen3.8:27b` con thinking | 1/25 ok | Il ragionamento esaurisce `num_predict`: risposta vuota |
| `qwen3.8:27b` senza thinking | 50/50 ok | ~66 s per referto con 4 in parallelo, ~41 token/s per GPU; tutto il dataset ≈ 12 h su 2 GPU |
| `gemma4:31b` | non partito | Caricamento oltre i 5 minuti di Ollama: `OLLAMA_LOAD_TIMEOUT=30m` aggiunto su `output-test` |

Qualità di Qwen 27B: spiegazioni fedeli, numeri corretti, nessuna invenzione
grave; difetti: omissioni nei referti lunghi, gergo non sempre spiegato,
qualche rassicurazione non scritta nel referto.

Il report sui dataset per fine-tuning e per il Referto-Bench è in
`Referto-doc/` (fuori dal repo, vedi [[01-panoramica]]).
