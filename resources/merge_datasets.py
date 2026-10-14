#!/usr/bin/env python3
"""Script per unificare tutti i dataset clinici presenti nella repository in un unico file JSONL."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from spiega_referto import dataset_record_to_text, load_jsonl_reports

BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / "datasets"
OUTPUT_FILE = DATASETS_DIR / "all_datasets_merged.jsonl"


def merge_datasets() -> Path:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    merged_records: List[Dict[str, Any]] = []
    seen_texts: set[str] = set()

    # 1. RadGraph-IT (50 referti radiologici in italiano)
    radgraph_path = DATASETS_DIR / "radgraph_it_50.jsonl"
    if radgraph_path.exists():
        with radgraph_path.open("r", encoding="utf-8") as f:
            for idx, line in enumerate(f, 1):
                if not line.strip():
                    continue
                row = json.loads(line)
                clean_text = dataset_record_to_text(row)
                doc_key_orig = row.get("doc_key", idx)
                doc_key_str = f"radgraph_it-{doc_key_orig}"

                merged_row = {
                    "id": doc_key_str,
                    "doc_key": doc_key_str,
                    "dataset": "radgraph_it",
                    "source_dataset": "radgraph_it_50.jsonl",
                    "language": "it",
                    "medical_specialty": "Radiology",
                    "sample_name": f"Torace e RX IT #{doc_key_orig}",
                    "description": "Referto radiologico in lingua italiana con annotazioni cliniche (RadGraph-IT)",
                    "text": clean_text,
                    "original_doc_key": doc_key_orig,
                    "sentences": row.get("sentences"),
                    "ner": row.get("ner"),
                    "relations": row.get("relations"),
                }
                merged_records.append(merged_row)
                seen_texts.add(clean_text)

    # 2. MTSamples All (4.966 referti specialistici in inglese)
    mtsamples_path = DATASETS_DIR / "mtsamples_all.jsonl"
    if mtsamples_path.exists():
        with mtsamples_path.open("r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                row = json.loads(line)
                text = row.get("text", "").strip()
                if not text:
                    continue
                merged_row = {
                    "id": row.get("id") or row.get("doc_key"),
                    "doc_key": row.get("doc_key") or row.get("id"),
                    "dataset": "mtsamples",
                    "source_dataset": "mtsamples_all.jsonl",
                    "language": "en",
                    "medical_specialty": row.get("medical_specialty", "General"),
                    "sample_name": row.get("sample_name", ""),
                    "description": row.get("description", ""),
                    "text": text,
                }
                merged_records.append(merged_row)

    # Scrittura del file unificato
    with OUTPUT_FILE.open("w", encoding="utf-8") as out:
        for record in merged_records:
            out.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"Dataset unificato creato con successo in: {OUTPUT_FILE}")
    print(f"Totale referti inclusi: {len(merged_records)}")
    it_count = sum(1 for r in merged_records if r.get("language") == "it")
    en_count = sum(1 for r in merged_records if r.get("language") == "en")
    print(f" - Referti in Italiano (RadGraph-IT): {it_count}")
    print(f" - Referti in Inglese (MTSamples): {en_count}")

    # Verifica validità con load_jsonl_reports
    loaded = load_jsonl_reports(OUTPUT_FILE)
    print(f"Verifica completata: {len(loaded)} referti caricati correttamente con load_jsonl_reports().")
    return OUTPUT_FILE


if __name__ == "__main__":
    merge_datasets()
