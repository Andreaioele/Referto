#!/usr/bin/env python3
"""Unisce i CSV degli shard in un unico results.csv e verifica la copertura."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List

csv.field_size_limit(sys.maxsize)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=Path, required=True)
    args = parser.parse_args()

    run_dir: Path = args.run_dir
    manifest = json.loads((run_dir / "shards" / "manifest.json").read_text(encoding="utf-8"))
    expected: List[str] = manifest["doc_keys"]

    rows: Dict[str, Dict[str, str]] = {}
    fieldnames: List[str] = []
    per_shard = {}
    for shard in manifest["shards"]:
        name = Path(shard["path"]).stem
        csv_path = run_dir / "outputs" / f"{name}.csv"
        if not csv_path.exists():
            per_shard[name] = {"expected": shard["count"], "rows": 0, "missing_file": True}
            continue
        count = 0
        with csv_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            fieldnames = fieldnames or list(reader.fieldnames or [])
            for row in reader:
                key = row.get("doc_key", "")
                if not key:
                    continue
                row["shard"] = name
                # Con --resume una riga può comparire due volte solo se il job è
                # stato interrotto a metà scrittura: tiene l'ultima.
                rows[key] = row
                count += 1
        per_shard[name] = {"expected": shard["count"], "rows": count}

    if not fieldnames:
        print("Errore: nessun CSV di shard trovato in outputs/", file=sys.stderr)
        return 2

    out_fields = ["shard"] + fieldnames
    results_path = run_dir / "results.csv"
    with results_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
        writer.writeheader()
        for key in expected:
            if key in rows:
                writer.writerow(rows[key])

    missing = [k for k in expected if k not in rows]
    statuses = Counter(rows[k].get("status", "") for k in expected if k in rows)
    report = {
        "results_csv": str(results_path),
        "expected": len(expected),
        "written": len(expected) - len(missing),
        "missing_count": len(missing),
        "missing_doc_keys": missing,
        "status_counts": dict(statuses),
        "shards": per_shard,
    }
    (run_dir / "merge_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"results.csv: {report['written']}/{report['expected']} referti")
    print(f"status: {dict(statuses)}")
    if missing:
        print(f"Mancano {len(missing)} referti (vedi merge_report.json)")
        for name, info in per_shard.items():
            if info["rows"] < info["expected"]:
                print(f"  {name}: {info['rows']}/{info['expected']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
