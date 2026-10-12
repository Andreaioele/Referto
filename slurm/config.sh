# shellcheck shell=bash
# ==============================================================================
# Configurazione dei run SLURM di cluster_agent_task.py.
#
# Modifica questo file (o sovrascrivi le variabili da ambiente prima di
# lanciare slurm/submit.sh). submit.sh ne salva una copia congelata in
# <run_dir>/run.env, quindi modificarlo dopo la sottomissione non tocca i job
# già in coda.
# ==============================================================================

# --- Dataset ------------------------------------------------------------------
# JSONL con un referto per riga (stesso formato letto da cluster_agent_task.py).
DATASET="${DATASET:-$HOME/referto-data/dataset.jsonl}"
# Campione casuale di N referti; vuoto = tutto il dataset.
SAMPLE="${SAMPLE:-}"
SEED="${SEED:-42}"

# --- Sharding -----------------------------------------------------------------
# Numero di shard = numero di task dell'array. Più shard piccoli rendono più
# economico rilanciare quelli falliti e aiutano a stare dentro TIME_LIMIT.
NUM_SHARDS="${NUM_SHARDS:-8}"
# Task in esecuzione contemporanea (uno per GPU: 2 H100).
MAX_PARALLEL="${MAX_PARALLEL:-2}"
# Richieste concorrenti verso Ollama per ogni task (= OLLAMA_NUM_PARALLEL).
WORKERS="${WORKERS:-4}"

# --- Modello ------------------------------------------------------------------
MODEL="${MODEL:-medgemma:4b-it-q4_K_M}"
# Decision model spento: audit generativo sempre eseguito, così l'output misura
# MedGemma da solo.
EXTRA_ARGS="${EXTRA_ARGS:---no-decision-model}"
REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-300}"

# --- Ollama (ambiente già pronto sul cluster, nodi senza internet) -------------
OLLAMA_BIN="${OLLAMA_BIN:-ollama}"
# Cartella dei modelli già scaricati (default di Ollama).
OLLAMA_MODELS="${OLLAMA_MODELS:-$HOME/.ollama/models}"

# --- Python -------------------------------------------------------------------
PYTHON="${PYTHON:-python3}"
# Comandi eseguiti sul nodo prima del job (module load, attivazione venv, ...).
setup_env() {
    :
}

# --- Risorse SLURM ------------------------------------------------------------
PARTITION="${PARTITION:-}"
ACCOUNT="${ACCOUNT:-}"
QOS="${QOS:-}"
TIME_LIMIT="${TIME_LIMIT:-04:00:00}"
CPUS_PER_TASK="${CPUS_PER_TASK:-8}"
MEM="${MEM:-64G}"
GRES="${GRES:-gpu:1}"

# --- Output -------------------------------------------------------------------
# Ogni run crea <RUN_ROOT>/<timestamp>/ con shard, CSV, trace e log.
RUN_ROOT="${RUN_ROOT:-$REPO_DIR/risultati/slurm-runs}"
