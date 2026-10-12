#!/usr/bin/env bash
# ==============================================================================
# Sottomette un run completo: prepara gli shard (sul login node), lancia il job
# array e il job di merge che produce <run_dir>/results.csv.
#
# Uso:
#   slurm/submit.sh                      nuovo run con slurm/config.sh
#   slurm/submit.sh --resume <run_dir>   rilancia l'array su un run esistente
#                                        (ogni task riparte da dove era arrivato)
#   slurm/submit.sh --tasks 3,5 ...      solo alcuni shard (con --resume)
#   slurm/submit.sh --dry-run ...        prepara il run dir e gli shard ma non
#                                        sottomette: mostra i comandi sbatch
#
# Ogni variabile di config.sh si può sovrascrivere da ambiente, es.:
#   SAMPLE=200 NUM_SHARDS=2 PARTITION=gpu slurm/submit.sh
# ==============================================================================

set -euo pipefail

SLURM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SLURM_DIR")"

RESUME_DIR=""
TASKS=""
DRY_RUN=0
while [ $# -gt 0 ]; do
    case "$1" in
        --resume) RESUME_DIR="$2"; shift 2 ;;
        --tasks) TASKS="$2"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
        *) echo "Opzione sconosciuta: $1" >&2; exit 2 ;;
    esac
done

if [ -n "$RESUME_DIR" ]; then
    RUN_DIR="$(cd "$RESUME_DIR" && pwd)"
    # shellcheck source=/dev/null
    source "$RUN_DIR/run.env"
    NUM_SHARDS="$(ls "$RUN_DIR"/shards/shard_*.jsonl | wc -l | tr -d ' ')"
    echo "Ripresa del run $RUN_DIR ($NUM_SHARDS shard)"
else
    # shellcheck source=config.sh
    source "$SLURM_DIR/config.sh"
    if [ ! -f "$DATASET" ]; then
        echo "Dataset non trovato: $DATASET (imposta DATASET in slurm/config.sh)" >&2
        exit 2
    fi

    RUN_DIR="$RUN_ROOT/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$RUN_DIR"/{shards,outputs,traces,logs}

    # Snapshot della configurazione: i job leggono questo, non config.sh.
    {
        echo "# Configurazione congelata da slurm/submit.sh il $(date)"
        echo "# Commit: $(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo n/d)"
        for var in REPO_DIR DATASET SAMPLE SEED NUM_SHARDS MAX_PARALLEL WORKERS \
                   MODEL EXTRA_ARGS REQUEST_TIMEOUT OLLAMA_BIN OLLAMA_MODELS PYTHON \
                   PARTITION ACCOUNT QOS TIME_LIMIT CPUS_PER_TASK MEM GRES RUN_ROOT; do
            declare -p "$var" | sed 's/^declare -[^ ]* //'
        done
        declare -f setup_env
    } > "$RUN_DIR/run.env"

    echo "Preparazione shard in $RUN_DIR/shards ..."
    SAMPLE_ARG=()
    [ -n "$SAMPLE" ] && SAMPLE_ARG=(--sample "$SAMPLE")
    PREP_OUT="$("$PYTHON" "$SLURM_DIR/prepare_shards.py" \
        --dataset "$DATASET" \
        --out-dir "$RUN_DIR/shards" \
        --num-shards "$NUM_SHARDS" \
        --seed "$SEED" \
        ${SAMPLE_ARG[@]+"${SAMPLE_ARG[@]}"})"
    echo "$PREP_OUT" | sed '$d'
    NUM_SHARDS="$(echo "$PREP_OUT" | tail -n 1)"
fi

COMMON=(--export="ALL,RUN_DIR=$RUN_DIR")
[ -n "$PARTITION" ] && COMMON+=(--partition="$PARTITION")
[ -n "$ACCOUNT" ] && COMMON+=(--account="$ACCOUNT")
[ -n "$QOS" ] && COMMON+=(--qos="$QOS")

ARRAY_SPEC="${TASKS:-0-$((NUM_SHARDS - 1))}%$MAX_PARALLEL"
ARRAY_CMD=(sbatch --parsable "${COMMON[@]}"
    --array="$ARRAY_SPEC"
    --gres="$GRES"
    --cpus-per-task="$CPUS_PER_TASK"
    --mem="$MEM"
    --time="$TIME_LIMIT"
    --requeue
    --open-mode=append
    --output="$RUN_DIR/logs/shard_%a.out"
    --error="$RUN_DIR/logs/shard_%a.err"
    "$SLURM_DIR/run_shard.sbatch")

if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] ${ARRAY_CMD[*]}"
    echo "[dry-run] sbatch ${COMMON[*]} --dependency=afterany:<array_id> ... merge.sbatch"
    exit 0
fi

ARRAY_ID="$("${ARRAY_CMD[@]}")"
MERGE_ID="$(sbatch --parsable "${COMMON[@]}" \
    --dependency="afterany:$ARRAY_ID" \
    --output="$RUN_DIR/logs/merge.out" \
    --error="$RUN_DIR/logs/merge.err" \
    "$SLURM_DIR/merge.sbatch")"

echo "$ARRAY_ID" >> "$RUN_DIR/job_ids.txt"
echo
echo "Run dir   : $RUN_DIR"
echo "Array     : $ARRAY_ID ($ARRAY_SPEC)"
echo "Merge     : $MERGE_ID (dopo l'array)"
echo "Log       : $RUN_DIR/logs/"
echo "Risultato : $RUN_DIR/results.csv"
echo
echo "Stato:    squeue -j $ARRAY_ID,$MERGE_ID"
echo "Ripresa:  $0 --resume $RUN_DIR"
