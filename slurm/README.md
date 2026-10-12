# Run SLURM di `cluster_agent_task.py`

Esegue `cluster_agent_task.py` su un dataset di referti come job array SLURM
(uno shard per task, una GPU e un'istanza Ollama privata per task) e unisce gli
output in un unico `results.csv`, da analizzare in seguito con il decision model.

Il decision model di routing è **spento** (`--no-decision-model`): ogni referto
passa per l'audit generativo, quindi l'output misura MedGemma da solo.

## Prerequisiti sul cluster

- Ollama installato e modelli già in `OLLAMA_MODELS` (i nodi sono offline: il
  job verifica che `MODEL` sia presente e altrimenti esce con codice 4).
- Python ≥ 3.10 con `pip install -r requirements.txt`: `spiega_referto.py`
  importa `pypdf` all'avvio. La preparazione degli shard e il merge usano solo
  la libreria standard.
- Dataset JSONL, un referto per riga, nello stesso formato letto da
  `cluster_agent_task.py`.

## Configurazione

Modifica `slurm/config.sh`. Le voci principali sono:

| Variabile | Default | |
|---|---|---|
| `DATASET` | `$HOME/referto-data/dataset.jsonl` | file di input |
| `SAMPLE` / `SEED` | vuoto / `42` | campione casuale; vuoto = tutto |
| `NUM_SHARDS` | `8` | task dell'array |
| `MAX_PARALLEL` | `2` | task contemporanei (2 H100) |
| `WORKERS` | `4` | richieste concorrenti per task |
| `PARTITION` / `ACCOUNT` / `QOS` | vuoti | da impostare per il cluster |
| `TIME_LIMIT` | `04:00:00` | per task |
| `setup_env()` | vuota | `module load`, attivazione del venv, … |

Ogni variabile si può anche passare da ambiente:
`SAMPLE=200 PARTITION=gpu slurm/submit.sh`.

## Uso

Dal login node, nella root del repo:

```bash
slurm/submit.sh --dry-run   # prepara gli shard e mostra i comandi sbatch
slurm/submit.sh             # sottomette array + merge
```

Ogni run crea `risultati/slurm-runs/<timestamp>/`:

```
run.env              configurazione congelata (i job leggono questa, non config.sh)
shards/              shard_NNN.jsonl + manifest.json (campione, doc_key, sha256 del dataset)
outputs/             CSV/JSONL/summary di ogni shard, scritti riga per riga
traces/              trace per referto
logs/                shard_N.out/.err, ollama_N.log, merge.out
results.csv          tutti gli shard uniti, nell'ordine del manifest, con colonna "shard"
merge_report.json    copertura: referti attesi/scritti, doc_key mancanti, conteggio status
```

`results.csv` ha le colonne di `CSV_FIELDNAMES` di `cluster_agent_task.py`
(performance, trace, `report_text`, `explanation`) più `shard`.

## Ripresa

Se un task va in timeout o fallisce, rilancialo sullo stesso run: riparte dai
`doc_key` già scritti nel CSV dello shard, poi viene rifatto il merge.

```bash
slurm/submit.sh --resume risultati/slurm-runs/<timestamp>             # tutti gli shard
slurm/submit.sh --resume risultati/slurm-runs/<timestamp> --tasks 3,5 # solo alcuni
```

## Note

- Un `cluster_agent_task.py` che termina con codice 1 (alcuni referti con
  `status=error`) viene considerato un task riuscito: quegli errori sono dati
  da analizzare e restano nel CSV.
- Se nel dataset mancano `doc_key`/`id`, `prepare_shards.py` assegna
  `line-<riga>`; le chiavi duplicate diventano `<chiave>#n`. Ogni record riceve
  anche `source_line`, per risalire alla riga originale.
- La porta di Ollama è derivata dal job id, così due task sullo stesso nodo non
  collidono.
