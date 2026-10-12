#!/usr/bin/env python3
"""Divide il dataset in shard JSONL per il job array SLURM.

Il campionamento avviene qui, una sola volta, con lo stesso algoritmo di
cluster_agent_task.py (random.Random(seed).sample): i task dell'array leggono
ognuno il proprio shard completo, senza --sample.

Ogni record riceve un doc_key univoco se non ne ha uno: cluster_agent_task.py
altrimenti userebbe "report-<indice nello shard>", che collide tra shard.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def load_text_records(path: Path) -> List[Dict[str, Any]]:
    """File di testo: referti separati da una riga di soli trattini (es. "-----").

    Stesse regole di load_reports() in cluster_agent_task.py.
    """
    content = path.read_text(encoding="utf-8")
    blocks = [b.strip() for b in re.split(r"^\s*-{3,}\s*$", content, flags=re.MULTILINE)]
    blocks = [b for b in blocks if b]
    return [
        {
            "doc_key": path.stem if len(blocks) == 1 else f"{path.stem}-{i}",
            "dataset": "text-file",
            "text": block,
        }
        for i, block in enumerate(blocks, start=1)
    ]


def load_records(path: Path) -> List[Dict[str, Any]]:
    if path.suffix.lower() != ".jsonl":
        return load_text_records(path)
    records: List[Dict[str, Any]] = []
    seen: Dict[str, int] = {}
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            if not isinstance(record, dict):
                raise ValueError(f"Riga {line_number}: non è un oggetto JSON")
            key = str(record.get("doc_key") or record.get("id") or "").strip()
            if not key:
                key = f"line-{line_number}"
            if key in seen:
                seen[key] += 1
                key = f"{key}#{seen[key]}"
            else:
                seen[key] = 0
            record["doc_key"] = key
            record["source_line"] = line_number
            records.append(record)
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--num-shards", type=int, required=True)
    parser.add_argument("--sample", type=int, default=None)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    dataset = args.dataset.expanduser().resolve()
    records = load_records(dataset)
    total = len(records)
    if not records:
        print(f"Errore: nessun referto in {dataset}", file=sys.stderr)
        return 2

    selected = records
    if args.sample is not None and 0 < args.sample < total:
        selected = random.Random(args.seed).sample(records, args.sample)

    num_shards = max(1, min(args.num_shards, len(selected)))
    shards: List[List[Dict[str, Any]]] = [[] for _ in range(num_shards)]
    # Round-robin: se il dataset è ordinato per sorgente, ogni shard resta misto.
    for i, record in enumerate(selected):
        shards[i % num_shards].append(record)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    shard_files = []
    for i, shard in enumerate(shards):
        shard_path = args.out_dir / f"shard_{i:03d}.jsonl"
        with shard_path.open("w", encoding="utf-8") as f:
            for record in shard:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        shard_files.append({"index": i, "path": str(shard_path), "count": len(shard)})

    renamed = sum(1 for r in records if "#" in r["doc_key"])

    manifest = {
        "dataset": str(dataset),
        "dataset_sha256": sha256_of(dataset),
        "dataset_total": total,
        "sample": args.sample,
        "seed": args.seed,
        "selected_count": len(selected),
        "num_shards": num_shards,
        "shards": shard_files,
        "duplicate_keys_renamed": renamed,
        "doc_keys": [r["doc_key"] for r in selected],
    }
    (args.out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Dataset: {dataset} ({total} referti)")
    print(f"Selezionati: {len(selected)} (sample={args.sample}, seed={args.seed})")
    print(f"Shard: {num_shards} da ~{len(selected) // num_shards} referti")
    if renamed:
        print(f"Attenzione: {renamed} doc_key duplicate rinominate con suffisso #n")
    # Ultima riga letta da submit.sh: numero effettivo di shard.
    print(num_shards)
    return 0


if __name__ == "__main__":
    sys.exit(main())
