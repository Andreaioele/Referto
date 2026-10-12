#!/usr/bin/env bash
# ==============================================================================
# Task dell'array: avvia un'istanza Ollama privata sulla GPU assegnata ed esegue
# cluster_agent_task.py sul proprio shard. Va sottomesso tramite slurm/submit.sh,
# che passa risorse, log e RUN_DIR.
# ==============================================================================
#SBATCH --job-name=referto-shard

set -euo pipefail

: "${RUN_DIR:?RUN_DIR non impostata: sottometti con slurm/submit.sh}"
# shellcheck source=/dev/null
source "$RUN_DIR/run.env"
setup_env

TASK_ID="${SLURM_ARRAY_TASK_ID:?questo script va eseguito come job array}"
SHARD_NAME="$(printf 'shard_%03d' "$TASK_ID")"
SHARD_FILE="$RUN_DIR/shards/$SHARD_NAME.jsonl"
OUT_CSV="$RUN_DIR/outputs/$SHARD_NAME.csv"

# Porta derivata dal job id: due task sullo stesso nodo non devono collidere.
PORT=$(( 20000 + SLURM_JOB_ID % 40000 ))
export OLLAMA_HOST="127.0.0.1:$PORT"
export OLLAMA_MODELS
export OLLAMA_NUM_PARALLEL="$WORKERS"
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_KEEP_ALIVE=-1
# I modelli grandi letti dal filesystem di gruppo possono superare i 5 minuti
# di caricamento predefiniti di Ollama ("timed out waiting for llama-server").
export OLLAMA_LOAD_TIMEOUT="${OLLAMA_LOAD_TIMEOUT:-30m}"
OLLAMA_URL="http://$OLLAMA_HOST"

echo "======================================================================"
echo " Job ${SLURM_ARRAY_JOB_ID}_${TASK_ID} su $(hostname) - $(date)"
echo " Shard      : $SHARD_FILE ($(wc -l < "$SHARD_FILE") referti)"
echo " GPU        : ${CUDA_VISIBLE_DEVICES:-N/D}"
echo " Ollama     : $OLLAMA_URL (modelli in $OLLAMA_MODELS)"
echo " Modello    : $MODEL  workers=$WORKERS  args=$EXTRA_ARGS"
echo "======================================================================"
nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv || true

OLLAMA_LOG="$RUN_DIR/logs/ollama_${TASK_ID}.log"
"$OLLAMA_BIN" serve >"$OLLAMA_LOG" 2>&1 &
OLLAMA_PID=$!
cleanup() {
    kill "$OLLAMA_PID" 2>/dev/null || true
    wait "$OLLAMA_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
    curl -sf "$OLLAMA_URL/api/version" >/dev/null 2>&1 && break
    if ! kill -0 "$OLLAMA_PID" 2>/dev/null; then
        echo "Ollama è terminato all'avvio, vedi $OLLAMA_LOG" >&2
        exit 3
    fi
    sleep 2
done
if ! curl -sf "$OLLAMA_URL/api/version" >/dev/null 2>&1; then
    echo "Ollama non risponde dopo 120s, vedi $OLLAMA_LOG" >&2
    exit 3
fi

# I nodi sono offline: il modello deve essere già in OLLAMA_MODELS.
if ! curl -sf "$OLLAMA_URL/api/tags" | grep -q "\"$MODEL\""; then
    echo "Modello $MODEL non trovato in $OLLAMA_MODELS. Disponibili:" >&2
    curl -sf "$OLLAMA_URL/api/tags" >&2 || true
    exit 4
fi

# Carica il modello in VRAM prima di partire, così la prima riga del CSV non
# include il tempo di caricamento.
curl -sf "$OLLAMA_URL/api/generate" -d "{\"model\":\"$MODEL\",\"keep_alive\":-1}" >/dev/null

# --resume: se il task viene rilanciato (requeue o a mano) riparte dai doc_key
# già presenti nel CSV dello shard.
set +e
# shellcheck disable=SC2086
"$PYTHON" "$REPO_DIR/cluster_agent_task.py" \
    --dataset "$SHARD_FILE" \
    --output "$OUT_CSV" \
    --traces-dir "$RUN_DIR/traces" \
    --ollama-url "$OLLAMA_URL" \
    --model "$MODEL" \
    --workers "$WORKERS" \
    --timeout "$REQUEST_TIMEOUT" \
    --resume \
    $EXTRA_ARGS
rc=$?
set -e

echo "cluster_agent_task.py terminato con codice $rc - $(date)"
# Codice 1 = alcuni referti con status=error (registrati nel CSV): è un esito
# da analizzare, non un fallimento del task.
if [ "$rc" -eq 1 ]; then
    exit 0
fi
exit "$rc"
