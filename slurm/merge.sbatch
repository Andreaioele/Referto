#!/usr/bin/env bash
# ==============================================================================
# Unisce i CSV degli shard in <RUN_DIR>/results.csv. Parte dopo l'array
# (dependency afterany): unisce anche se qualche shard è fallito e segnala i
# referti mancanti in merge_report.json.
# ==============================================================================
#SBATCH --job-name=referto-merge
#SBATCH --cpus-per-task=1
#SBATCH --mem=4G
#SBATCH --time=00:15:00

set -euo pipefail

: "${RUN_DIR:?RUN_DIR non impostata: sottometti con slurm/submit.sh}"
# shellcheck source=/dev/null
source "$RUN_DIR/run.env"
setup_env

"$PYTHON" "$REPO_DIR/slurm/merge_outputs.py" --run-dir "$RUN_DIR"
