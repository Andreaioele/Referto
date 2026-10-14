#!/usr/bin/env bash
# ==============================================================================
# Script di sottomissione SLURM per Referto Medical Agent su cluster GPU (NVIDIA H100)
# ==============================================================================
#SBATCH --job-name=referto_agent_h100
#SBATCH --output=risultati/slurm-%j.out
#SBATCH --error=risultati/slurm-%j.err
#SBATCH --partition=gpu
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64G
#SBATCH --time=08:00:00

set -euo pipefail

# 1. Cartella radice del progetto
PROJECT_DIR="${SLURM_SUBMIT_DIR:-$(pwd)}"
cd "$PROJECT_DIR"
mkdir -p risultati traces

# 2. Configurazione porte e host per Ollama su nodo di calcolo
export OLLAMA_HOST="127.0.0.1:11434"
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}"

echo "======================================================================"
echo " Avvio Job SLURM: ${SLURM_JOB_ID:-N/A} su nodo $(hostname)"
echo " GPU Assegnate: ${SLURM_GPUS_ON_NODE:-$CUDA_VISIBLE_DEVICES}"
echo " Data inizio: $(date)"
echo "======================================================================"

# 3. Avvio di Ollama in background se non già in esecuzione
OLLAMA_PID=""
if ! curl -s "http://${OLLAMA_HOST}/api/version" >/dev/null 2>&1; then
    echo "Avvio istanza Ollama locale in background..."
    ollama serve &
    OLLAMA_PID=$!
    
    # Attesa che Ollama sia pronto
    echo "In attesa che Ollama sia pronto..."
    for i in {1..30}; do
        if curl -s "http://${OLLAMA_HOST}/api/version" >/dev/null 2>&1; then
            echo "Ollama è pronto e risponde correttamente."
            break
        fi
        sleep 2
    done
else
    echo "Ollama già in esecuzione su http://${OLLAMA_HOST}"
fi

# Cleanup all'uscita per terminare Ollama se avviato da questo script
cleanup() {
    echo "Esecuzione completata o segnale ricevuto."
    if [ -n "$OLLAMA_PID" ]; then
        echo "Terminazione processo Ollama background (PID $OLLAMA_PID)..."
        kill "$OLLAMA_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 4. Attivazione ambiente Python
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# 5. Esecuzione del task unico per cluster
# Con GPU H100 (80GB VRAM) possiamo eseguire 4-8 worker concorrenti per saturare la GPU
DATASET="${1:-all_datasets_merged.jsonl}"
WORKERS="${2:-4}"

echo "Esecuzione cluster_agent_task.py su dataset: $DATASET con $WORKERS worker..."

python3 cluster_agent_task.py \
    --dataset "$DATASET" \
    --workers "$WORKERS" \
    --resume

echo "======================================================================"
echo " Job SLURM completato con successo: $(date)"
echo "======================================================================"
