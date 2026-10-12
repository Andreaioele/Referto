#!/usr/bin/env python3
"""Task autonomo per eseguire l'agente clinico su cluster GPU (es. NVIDIA H100).

Esegue l'intero pipeline:
1. Caricamento e campionamento/filtraggio del dataset (JSONL / CSV).
2. Lettura e spiegazione di ciascun referto con MedGemma.
3. Routing semantico con Decision Model (bge-m3) per saltare l'audit quando sicuro.
4. Revisione generativa di sicurezza e normalizzazione quando necessario.
5. Registrazione atomica delle trace di esecuzione nella cronologia locale (traces/).
6. Salvataggio incrementale dei risultati (JSONL) e summary analitico (JSON).
7. Rilevamento automatico dell'ambiente hardware (GPU H100, SLURM, VRAM).
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import json
import os
import platform
import random
import re
import shutil
import statistics
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, List, Optional, Set, Tuple

from decision_model import (
    DEFAULT_AUDIT_THRESHOLD,
    DEFAULT_DECISION_MODEL,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_FAST_THRESHOLD,
)
from performance_metrics import capture_model_calls
from spiega_referto import (
    DEFAULT_MODEL,
    DEFAULT_OLLAMA_URL,
    DISCLAIMER,
    UserFacingError,
    dataset_record_to_text,
    explain_report,
    load_jsonl_reports,
    normalize_ollama_url,
    validate_explanation,
)
from trace_store import TraceRecorder, trace_scope, traced_step

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATASETS_DIR = BASE_DIR / "datasets"
DEFAULT_OUTPUT_DIR = BASE_DIR / "risultati"
DEFAULT_TRACES_DIR = BASE_DIR / "traces"


def detect_cluster_hardware() -> Dict[str, Any]:
    """Rileva l'ambiente di calcolo: GPU NVIDIA (H100/A100), SLURM e CPU."""
    info: Dict[str, Any] = {
        "hostname": platform.node(),
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "cpu_count": os.cpu_count() or 1,
        "cuda_visible_devices": os.environ.get("CUDA_VISIBLE_DEVICES"),
        "gpu_detected": False,
        "gpus": [],
        "slurm": {},
    }

    # Controllo variabili d'ambiente SLURM
    slurm_vars = {
        k: v for k, v in os.environ.items() if k.startswith("SLURM_")
    }
    if slurm_vars:
        info["slurm"] = {
            "job_id": slurm_vars.get("SLURM_JOB_ID"),
            "job_name": slurm_vars.get("SLURM_JOB_NAME"),
            "array_task_id": slurm_vars.get("SLURM_ARRAY_TASK_ID"),
            "nodelist": slurm_vars.get("SLURM_NODELIST"),
            "gpus_on_node": slurm_vars.get("SLURM_GPUS_ON_NODE"),
            "cpus_per_task": slurm_vars.get("SLURM_CPUS_PER_TASK"),
        }

    # Rilevamento GPU tramite nvidia-smi
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            output = subprocess.check_output(
                [
                    nvidia_smi,
                    "--query-gpu=name,memory.total,driver_version,pstate",
                    "--format=csv,noheader",
                ],
                text=True,
                timeout=5,
                stderr=subprocess.DEVNULL,
            ).strip()
            for line in output.splitlines():
                parts = [p.strip() for p in line.split(",")]
                if parts:
                    info["gpus"].append(
                        {
                            "name": parts[0] if len(parts) > 0 else "Unknown",
                            "memory_total": parts[1] if len(parts) > 1 else "Unknown",
                            "driver_version": parts[2] if len(parts) > 2 else "Unknown",
                            "pstate": parts[3] if len(parts) > 3 else "Unknown",
                        }
                    )
            if info["gpus"]:
                info["gpu_detected"] = True
        except Exception:
            pass

    return info


def resolve_dataset_path(dataset_arg: Optional[str]) -> Path:
    """Risolve il percorso del dataset supportando sia percorsi sia nomi noti."""
    if dataset_arg:
        p = Path(dataset_arg).expanduser()
        if p.is_file():
            return p.resolve()
        candidate = DEFAULT_DATASETS_DIR / dataset_arg
        if candidate.is_file():
            return candidate.resolve()
        if not dataset_arg.endswith(".jsonl"):
            candidate_ext = DEFAULT_DATASETS_DIR / f"{dataset_arg}.jsonl"
            if candidate_ext.is_file():
                return candidate_ext.resolve()
        raise FileNotFoundError(f"Dataset non trovato: {dataset_arg}")

    # Fallback predefinito: all_datasets_merged.jsonl, poi mtsamples_radiology, poi radgraph_it_50
    for name in (
        "all_datasets_merged.jsonl",
        "mtsamples_radiology.jsonl",
        "radgraph_it_50.jsonl",
        "mtsamples_all.jsonl",
    ):
        p = DEFAULT_DATASETS_DIR / name
        if p.is_file():
            return p.resolve()

    # Cerca il primo .jsonl in datasets/
    if DEFAULT_DATASETS_DIR.exists():
        for p in DEFAULT_DATASETS_DIR.glob("*.jsonl"):
            return p.resolve()

    raise FileNotFoundError("Nessun dataset .jsonl trovato nella directory datasets/.")


def load_reports(path: Path) -> List[Tuple[Dict[str, Any], str]]:
    """Carica i referti da JSONL oppure da un file di testo.

    Nel file di testo ogni referto è separato da una riga di soli trattini
    (es. "-----"); senza separatori l'intero file è un unico referto.
    """
    if path.suffix.lower() == ".jsonl":
        return load_jsonl_reports(path, limit=None)

    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise UserFacingError(f"Non riesco a leggere il file di testo: {exc}") from exc
    blocks = [b.strip() for b in re.split(r"^\s*-{3,}\s*$", content, flags=re.MULTILINE)]
    blocks = [b for b in blocks if b]
    if not blocks:
        raise UserFacingError("Il file di testo non contiene referti.")

    records: List[Tuple[Dict[str, Any], str]] = []
    for i, block in enumerate(blocks, start=1):
        doc_key = path.stem if len(blocks) == 1 else f"{path.stem}-{i}"
        record = {"doc_key": doc_key, "dataset": "text-file", "text": block}
        records.append((record, dataset_record_to_text(record)))
    return records


class ProgressTracker:
    """Monitoraggio thread-safe dell'avanzamento con velocità ed ETA."""

    def __init__(self, total: int, quiet: bool = False) -> None:
        self.total = total
        self.quiet = quiet
        self.completed = 0
        self.successes = 0
        self.errors = 0
        self.skipped = 0
        self.start_time = perf_counter()
        self._lock = threading.Lock()

    def update(
        self,
        doc_key: str,
        status: str,
        route: str,
        duration_ms: float,
        tokens: int,
        error_msg: Optional[str] = None,
    ) -> None:
        with self._lock:
            self.completed += 1
            if status == "ok":
                self.successes += 1
            else:
                self.errors += 1
            if route == "fast":
                self.skipped += 1

            if self.quiet:
                return

            elapsed = perf_counter() - self.start_time
            rate = self.completed / elapsed if elapsed > 0 else 0.0
            remaining = self.total - self.completed
            eta_seconds = remaining / rate if rate > 0 else 0.0
            eta_str = (
                f"{int(eta_seconds // 60)}m {int(eta_seconds % 60):02d}s"
                if eta_seconds > 60
                else f"{int(eta_seconds)}s"
            )

            status_tag = "\033[92mOK\033[0m" if status == "ok" else "\033[91mERR\033[0m"
            route_tag = (
                "\033[96mFAST (skip audit)\033[0m"
                if route == "fast"
                else "\033[93mSTD (audit)\033[0m"
            )

            tps = (tokens / (duration_ms / 1000)) if duration_ms > 0 else 0.0
            print(
                f"[{self.completed:>{len(str(self.total))}}/{self.total}] "
                f"({self.completed / self.total * 100:4.1f}%) "
                f"doc_key={doc_key} | {status_tag} | {route_tag} | "
                f"{duration_ms / 1000:4.2f}s | {tokens} tok ({tps:4.1f} t/s) | ETA: {eta_str}",
                file=sys.stderr,
                flush=True,
            )
            if error_msg:
                print(f"  └─> Errore: {error_msg}", file=sys.stderr, flush=True)


CSV_FIELDNAMES = [
    # Identificativi & Dataset
    "index",
    "doc_key",
    "dataset",
    "source_dataset",
    "language",
    "medical_specialty",
    "sample_name",
    "status",
    "error",
    # Performance
    "duration_ms",
    "duration_s",
    "tokens_per_second",
    "prompt_tokens",
    "generated_tokens",
    "medgemma_calls",
    "decision_calls",
    "audit_called",
    "audit_skipped",
    "decision_route",
    "decision_score",
    "validation_issues",
    # Trace
    "trace_id",
    "trace_path",
    # Input
    "report_chars",
    "report_text",
    # Output
    "explanation_chars",
    "explanation",
]


def result_to_csv_row(res: Dict[str, Any]) -> Dict[str, Any]:
    """Mappa il dizionario dei risultati in un record piatto per il file CSV."""
    validation_issues = res.get("validation_issues") or []
    if isinstance(validation_issues, list):
        validation_str = "; ".join(str(v) for v in validation_issues)
    else:
        validation_str = str(validation_issues)

    return {
        "index": res.get("index", ""),
        "doc_key": res.get("doc_key", ""),
        "dataset": res.get("dataset") or "",
        "source_dataset": res.get("source_dataset") or "",
        "language": res.get("language") or "",
        "medical_specialty": res.get("medical_specialty") or "",
        "sample_name": res.get("sample_name") or "",
        "status": res.get("status", ""),
        "error": res.get("error") or "",
        "duration_ms": res.get("duration_ms", 0),
        "duration_s": round(float(res.get("duration_ms", 0)) / 1000, 3),
        "tokens_per_second": res.get("tokens_per_second", 0),
        "prompt_tokens": res.get("prompt_tokens", 0),
        "generated_tokens": res.get("generated_tokens", 0),
        "medgemma_calls": res.get("medgemma_calls", 0),
        "decision_calls": res.get("decision_calls", 0),
        "audit_called": res.get("audit_called", False),
        "audit_skipped": res.get("audit_skipped", False),
        "decision_route": res.get("decision_route", ""),
        "decision_score": res.get("decision_score") if res.get("decision_score") is not None else "",
        "validation_issues": validation_str,
        "trace_id": res.get("trace_id", ""),
        "trace_path": res.get("trace_path", ""),
        "report_chars": res.get("report_chars", len(res.get("report_text", ""))),
        "report_text": res.get("report_text", ""),
        "explanation_chars": res.get("explanation_chars", len(res.get("explanation", ""))),
        "explanation": res.get("explanation", ""),
    }


def load_processed_keys(output_path: Path) -> Set[str]:
    """Legge i doc_key già elaborati per supportare il resume automatico da CSV o JSONL."""
    if not output_path.exists():
        return set()
    processed: Set[str] = set()

    if output_path.suffix.lower() == ".csv":
        try:
            with output_path.open("r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    key = str(row.get("doc_key") or row.get("id") or "").strip()
                    if key:
                        processed.add(key)
        except Exception:
            pass
        return processed

    try:
        with output_path.open("r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    key = str(data.get("doc_key") or data.get("id") or "").strip()
                    if key:
                        processed.add(key)
                except Exception:
                    continue
    except Exception:
        pass
    return processed


def process_single_report(
    record: Dict[str, Any],
    report: str,
    index: int,
    base_url: str,
    model: str,
    decision_model_name: str,
    use_decision_model: bool,
    fast_threshold: float,
    audit_threshold: float,
    timeout: int,
    max_chunk_chars: int,
    traces_dir: Path,
) -> Dict[str, Any]:
    """Elabora un singolo referto clinico con trace dedicata e metriche."""
    doc_key = str(record.get("doc_key") or record.get("id") or f"report-{index}")
    report_trace = TraceRecorder(
        root=traces_dir,
        source_type="cluster_report",
        source_name=f"Referto #{index} ({doc_key})",
        model=model,
    )
    report_trace.set_artifact("doc_key", doc_key)
    report_trace.set_artifact("record_metadata", {k: v for k, v in record.items() if k not in ("sentences", "ner", "relations", "text")})
    report_trace.set_artifact("report_characters", len(report))

    started = perf_counter()
    error: Optional[str] = None
    explanation = ""

    with trace_scope(report_trace):
        with capture_model_calls() as calls:
            try:
                with traced_step("Esecuzione agente clinico"):
                    explanation = explain_report(
                        report=report,
                        base_url=base_url,
                        model=model,
                        timeout=timeout,
                        max_chunk_chars=max_chunk_chars,
                        use_decision_model=use_decision_model,
                        decision_model=decision_model_name,
                        decision_fast_threshold=fast_threshold,
                        decision_audit_threshold=audit_threshold,
                    )
            except Exception as exc:
                error = f"{type(exc).__name__}: {exc}"

    duration_ms = round((perf_counter() - started) * 1000, 2)
    generative_calls = [c for c in calls if c.get("kind") == "generative"]
    decision_calls = [c for c in calls if c.get("kind") == "decision"]
    validation_issues = validate_explanation(explanation) if explanation else []
    status = "ok" if (error is None and not validation_issues) else "error"

    last_decision = decision_calls[-1] if decision_calls else None
    audit_skipped = bool(last_decision and last_decision.get("should_skip_audit"))
    route = (
        last_decision.get("route")
        if last_decision
        else ("fast" if audit_skipped else "standard")
    )
    score = (
        (last_decision.get("route_probability") or last_decision.get("grounding_score"))
        if last_decision
        else None
    )

    prompt_tokens = sum(int(c.get("prompt_eval_count") or 0) for c in generative_calls)
    generated_tokens = sum(int(c.get("eval_count") or 0) for c in generative_calls)
    tps = round(generated_tokens / (duration_ms / 1000), 2) if duration_ms > 0 else 0.0

    if status == "ok":
        final_output = explanation.rstrip() + DISCLAIMER + "\n"
        report_trace.complete(final_output)
    else:
        report_trace.fail(error or ", ".join(validation_issues))

    return {
        "index": index,
        "id": doc_key,
        "doc_key": doc_key,
        "dataset": record.get("dataset"),
        "source_dataset": record.get("source_dataset"),
        "language": record.get("language", "it" if "radgraph" in str(record.get("dataset", "")).lower() else "en"),
        "medical_specialty": record.get("medical_specialty", "General"),
        "sample_name": record.get("sample_name", ""),
        "status": status,
        "error": error or (", ".join(validation_issues) if validation_issues else None),
        "duration_ms": duration_ms,
        "tokens_per_second": tps,
        "prompt_tokens": prompt_tokens,
        "generated_tokens": generated_tokens,
        "medgemma_calls": len(generative_calls),
        "decision_calls": len(decision_calls),
        "audit_called": any("Revisione" in str(c.get("stage")) for c in generative_calls),
        "audit_skipped": audit_skipped,
        "decision_route": route,
        "decision_score": round(score, 4) if isinstance(score, float) else score,
        "validation_issues": validation_issues,
        "trace_id": report_trace.trace_id,
        "trace_path": str(report_trace.path),
        "report_chars": len(report),
        "report_text": report,
        "explanation_chars": len(explanation) if explanation else 0,
        "explanation": explanation,
    }


def run_cluster_agent_task(
    dataset_path: Path,
    output_path: Path,
    summary_path: Path,
    traces_dir: Path,
    base_url: str = DEFAULT_OLLAMA_URL,
    model: str = DEFAULT_MODEL,
    decision_model: str = DEFAULT_EMBEDDING_MODEL,
    use_decision_model: bool = True,
    fast_threshold: float = DEFAULT_FAST_THRESHOLD,
    audit_threshold: float = DEFAULT_AUDIT_THRESHOLD,
    limit: Optional[int] = None,
    sample: Optional[int] = None,
    seed: Optional[int] = None,
    workers: int = 1,
    timeout: int = 300,
    max_chunk_chars: int = 9000,
    resume: bool = False,
    quiet: bool = False,
) -> Dict[str, Any]:
    """Funzione principale eseguita su cluster."""
    base_url = normalize_ollama_url(base_url)
    started_iso = datetime.now().astimezone().isoformat(timespec="milliseconds")
    start_time = perf_counter()

    # Rilevamento hardware del cluster
    hardware = detect_cluster_hardware()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    traces_dir.mkdir(parents=True, exist_ok=True)

    # Determinazione percorsi file di output (CSV principale, JSONL secondario)
    if output_path.suffix.lower() == ".jsonl":
        jsonl_path = output_path
        csv_path = output_path.with_suffix(".csv")
    else:
        csv_path = output_path if output_path.suffix.lower() == ".csv" else output_path.with_suffix(".csv")
        jsonl_path = output_path.with_suffix(".jsonl")

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)

    # Master Job Trace
    master_trace = TraceRecorder(
        root=traces_dir,
        source_type="cluster_job",
        source_name=f"Cluster Job: {dataset_path.name}",
        model=model,
    )
    master_trace.set_artifact("hardware_environment", hardware)
    master_trace.set_artifact("dataset_path", str(dataset_path))

    # Caricamento dataset
    all_records = load_reports(dataset_path)
    total_in_dataset = len(all_records)

    # Campionamento o limite
    selected_records = all_records
    if sample is not None and 0 < sample < len(selected_records):
        rng = random.Random(seed)
        selected_records = rng.sample(selected_records, sample)
    if limit is not None and limit > 0:
        selected_records = selected_records[:limit]

    # Resume: salta già elaborati (legge da CSV se esiste, altrimenti JSONL)
    processed_keys = load_processed_keys(csv_path if csv_path.exists() else jsonl_path) if resume else set()
    records_to_process = [
        (rec, rep)
        for rec, rep in selected_records
        if str(rec.get("doc_key") or rec.get("id") or "") not in processed_keys
    ]

    master_trace.set_artifact(
        "job_configuration",
        {
            "dataset_total": total_in_dataset,
            "selected_count": len(selected_records),
            "already_processed_skipped": len(selected_records) - len(records_to_process),
            "to_process_count": len(records_to_process),
            "model": model,
            "decision_model": decision_model if use_decision_model else None,
            "use_decision_model": use_decision_model,
            "fast_threshold": fast_threshold,
            "audit_threshold": audit_threshold,
            "workers": workers,
            "timeout": timeout,
            "max_chunk_chars": max_chunk_chars,
            "output_csv": str(csv_path),
            "output_jsonl": str(jsonl_path),
        },
    )

    if not quiet:
        gpu_name = hardware["gpus"][0]["name"] if hardware["gpus"] else "CPU / N/D"
        print("=" * 70, file=sys.stderr)
        print(f" REFERTO · CLUSTER AGENT TASK (H100 / GPU)", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(f" Dataset sorgente : {dataset_path.name} ({total_in_dataset} referti)", file=sys.stderr)
        print(f" Da elaborare     : {len(records_to_process)} (già fatti: {len(processed_keys)})", file=sys.stderr)
        print(f" Hardware         : {gpu_name} (Host: {hardware['hostname']})", file=sys.stderr)
        print(f" Concorrenza      : {workers} worker thread", file=sys.stderr)
        print(f" Modello MedGemma : {model}", file=sys.stderr)
        print(f" Decision Model   : {decision_model if use_decision_model else 'DISABILITATO'}", file=sys.stderr)
        print(f" Output CSV       : {csv_path}", file=sys.stderr)
        print(f" Output JSONL     : {jsonl_path}", file=sys.stderr)
        print("=" * 70, file=sys.stderr)

    tracker = ProgressTracker(total=len(records_to_process), quiet=quiet)
    results: List[Dict[str, Any]] = []
    file_lock = threading.Lock()

    # Apertura file di output in append mode se resume
    csv_mode = "a" if resume and csv_path.exists() and csv_path.stat().st_size > 0 else "w"
    jsonl_mode = "a" if resume and jsonl_path.exists() and jsonl_path.stat().st_size > 0 else "w"

    with csv_path.open(csv_mode, encoding="utf-8", newline="") as csv_f, \
         jsonl_path.open(jsonl_mode, encoding="utf-8") as jsonl_f:

        csv_writer = csv.DictWriter(csv_f, fieldnames=CSV_FIELDNAMES, quoting=csv.QUOTE_MINIMAL)
        if csv_mode == "w":
            csv_writer.writeheader()
            csv_f.flush()

        def worker_task(index: int, item: Tuple[Dict[str, Any], str]) -> Dict[str, Any]:
            rec, rep = item
            result = process_single_report(
                record=rec,
                report=rep,
                index=index,
                base_url=base_url,
                model=model,
                decision_model_name=decision_model,
                use_decision_model=use_decision_model,
                fast_threshold=fast_threshold,
                audit_threshold=audit_threshold,
                timeout=timeout,
                max_chunk_chars=max_chunk_chars,
                traces_dir=traces_dir,
            )
            # Scrittura atomica e flush immediato su CSV e JSONL
            with file_lock:
                csv_writer.writerow(result_to_csv_row(result))
                csv_f.flush()
                jsonl_f.write(json.dumps(result, ensure_ascii=False) + "\n")
                jsonl_f.flush()

            tracker.update(
                doc_key=result["doc_key"],
                status=result["status"],
                route=result["decision_route"],
                duration_ms=result["duration_ms"],
                tokens=result["generated_tokens"],
                error_msg=result["error"] if result["status"] != "ok" else None,
            )
            return result

        if workers > 1:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [
                    executor.submit(worker_task, idx, item)
                    for idx, item in enumerate(records_to_process, start=1)
                ]
                for future in concurrent.futures.as_completed(futures):
                    try:
                        results.append(future.result())
                    except Exception as exc:
                        print(f"Eccezione worker imprevista: {exc}", file=sys.stderr)
        else:
            for idx, item in enumerate(records_to_process, start=1):
                results.append(worker_task(idx, item))

    # Aggregazione statistiche finali
    total_elapsed = perf_counter() - start_time
    durations = [r["duration_ms"] for r in results]
    prompt_tokens_list = [r["prompt_tokens"] for r in results]
    gen_tokens_list = [r["generated_tokens"] for r in results]
    successes = sum(1 for r in results if r["status"] == "ok")
    errors = len(results) - successes
    audit_skipped = sum(1 for r in results if r["audit_skipped"])

    summary: Dict[str, Any] = {
        "job_id": master_trace.trace_id,
        "dataset": {
            "path": str(dataset_path),
            "filename": dataset_path.name,
            "total_records_in_file": total_in_dataset,
            "processed_in_this_run": len(results),
            "successes": successes,
            "errors": errors,
        },
        "timestamps": {
            "started_at": started_iso,
            "completed_at": datetime.now().astimezone().isoformat(timespec="milliseconds"),
            "total_elapsed_seconds": round(total_elapsed, 2),
        },
        "hardware": hardware,
        "configuration": {
            "model": model,
            "decision_model": decision_model if use_decision_model else None,
            "use_decision_model": use_decision_model,
            "fast_threshold": fast_threshold,
            "audit_threshold": audit_threshold,
            "workers": workers,
            "timeout": timeout,
            "max_chunk_chars": max_chunk_chars,
        },
        "performance_metrics": {
            "total_duration_ms": round(sum(durations), 2) if durations else 0.0,
            "mean_duration_ms": round(statistics.mean(durations), 2) if durations else 0.0,
            "median_duration_ms": round(statistics.median(durations), 2) if durations else 0.0,
            "min_duration_ms": round(min(durations), 2) if durations else 0.0,
            "max_duration_ms": round(max(durations), 2) if durations else 0.0,
            "total_prompt_tokens": sum(prompt_tokens_list),
            "total_generated_tokens": sum(gen_tokens_list),
            "mean_prompt_tokens": round(statistics.mean(prompt_tokens_list), 1) if prompt_tokens_list else 0.0,
            "mean_generated_tokens": round(statistics.mean(gen_tokens_list), 1) if gen_tokens_list else 0.0,
            "throughput_tokens_per_sec": round(sum(gen_tokens_list) / total_elapsed, 2) if total_elapsed > 0 else 0.0,
            "audit_skipped_count": audit_skipped,
            "audit_skipped_rate": round(audit_skipped / len(results), 4) if results else 0.0,
            "audit_executed_count": len(results) - audit_skipped,
            "mean_medgemma_calls": round(statistics.mean(r["medgemma_calls"] for r in results), 2) if results else 0.0,
        },
        "output_csv": str(csv_path),
        "output_jsonl": str(jsonl_path),
        "output_file": str(output_path),
        "summary_file": str(summary_path),
        "trace_id": master_trace.trace_id,
    }

    # Salvataggio summary JSON
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    master_trace.complete(summary)

    if not quiet:
        print("\n" + "=" * 70, file=sys.stderr)
        print(" RIEPILOGO TASK COMPLETATO CON SUCCESSO", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(f" Referti elaborati : {len(results)}/{len(records_to_process)} (Successi: {successes}, Errori: {errors})", file=sys.stderr)
        print(f" Tempo totale      : {total_elapsed / 60:4.2f} minuti ({total_elapsed:4.1f}s)", file=sys.stderr)
        print(f" Latenza mediana   : {summary['performance_metrics']['median_duration_ms'] / 1000:4.2f}s per referto", file=sys.stderr)
        print(f" Audit evitati     : {audit_skipped}/{len(results)} ({summary['performance_metrics']['audit_skipped_rate'] * 100:4.1f}%)", file=sys.stderr)
        print(f" Token generati    : {summary['performance_metrics']['total_generated_tokens']:,} ({summary['performance_metrics']['throughput_tokens_per_sec']:4.1f} tok/s)", file=sys.stderr)
        print(f" Master Trace ID   : {master_trace.trace_id}", file=sys.stderr)
        print(f" Risultati CSV     : {csv_path}", file=sys.stderr)
        print(f" Risultati JSONL   : {jsonl_path}", file=sys.stderr)
        print(f" Summary JSON      : {summary_path}", file=sys.stderr)
        print("=" * 70, file=sys.stderr)

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Esegue l'agente medico Referto su un dataset clinico (ottimizzato per cluster GPU H100)."
    )
    parser.add_argument(
        "-d",
        "--dataset",
        type=str,
        default="all_datasets_merged.jsonl",
        help="Percorso o nome del file JSONL, oppure file di testo con uno o più referti separati da '-----' (default: all_datasets_merged.jsonl)",
    )
    parser.add_argument(
        "-m",
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Modello Ollama principale per MedGemma (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--decision-model",
        type=str,
        default=DEFAULT_EMBEDDING_MODEL,
        help=f"Decision model o embedding per routing semantico (default: {DEFAULT_EMBEDDING_MODEL})",
    )
    parser.add_argument(
        "--senza-decision-model",
        "--no-decision-model",
        dest="no_decision_model",
        action="store_true",
        help="Disabilita il decision model ed esegue sempre la revisione generativa",
    )
    parser.add_argument(
        "--ollama-url",
        type=str,
        default=normalize_ollama_url(os.environ.get("OLLAMA_BASE_URL", os.environ.get("OLLAMA_HOST", DEFAULT_OLLAMA_URL))),
        help=f"URL del server Ollama (default: {DEFAULT_OLLAMA_URL})",
    )
    parser.add_argument(
        "-l",
        "--limit",
        type=int,
        default=None,
        help="Elabora al massimo L referti",
    )
    parser.add_argument(
        "-s",
        "--sample",
        type=int,
        default=None,
        help="Estrae un campione casuale di S referti dal dataset",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Seed casuale per la riproducibilità del campionamento (default: 42)",
    )
    parser.add_argument(
        "-w",
        "--workers",
        "--concurrency",
        dest="workers",
        type=int,
        default=1,
        help="Numero di worker concorrenti (default: 1; su H100 consigliato 2-8)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=None,
        help="Percorso del file CSV di output (default: risultati/cluster-job-<timestamp>-<dataset>.csv)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Cartella dove salvare i risultati (default: risultati/)",
    )
    parser.add_argument(
        "--traces-dir",
        type=Path,
        default=DEFAULT_TRACES_DIR,
        help="Cartella delle trace locali (default: traces/)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Timeout per ciascuna chiamata HTTP al modello in secondi (default: 300)",
    )
    parser.add_argument(
        "--max-chars",
        type=int,
        default=9000,
        help="Lunghezza massima per chunk del referto (default: 9000)",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Riprende l'elaborazione saltando i referti già presenti nel file di output",
    )
    parser.add_argument(
        "-q",
        "--quiet",
        action="store_true",
        help="Sopprime i log dettagliati riga per riga e mostra solo il report finale",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        dataset_path = resolve_dataset_path(args.dataset)
    except FileNotFoundError as exc:
        print(f"Errore: {exc}", file=sys.stderr)
        return 2

    # Determinazione nomi file di output (CSV principale)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    stem = dataset_path.stem
    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        summary_path = output_path.with_name(f"{output_path.stem}_summary.json")
    else:
        output_path = args.output_dir / f"cluster-job-{timestamp}-{stem}.csv"
        summary_path = args.output_dir / f"cluster-job-{timestamp}-{stem}_summary.json"

    try:
        summary = run_cluster_agent_task(
            dataset_path=dataset_path,
            output_path=output_path,
            summary_path=summary_path,
            traces_dir=args.traces_dir,
            base_url=args.ollama_url,
            model=args.model,
            decision_model=args.decision_model,
            use_decision_model=not args.no_decision_model,
            limit=args.limit,
            sample=args.sample,
            seed=args.seed,
            workers=max(1, args.workers),
            timeout=args.timeout,
            max_chunk_chars=args.max_chars,
            resume=args.resume,
            quiet=args.quiet,
        )
        return 0 if summary["dataset"]["errors"] == 0 else 1
    except KeyboardInterrupt:
        print("\nInterruzione da tastiera (SIGINT). Risultati parziali salvati.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"\nErrore fatale durante il cluster task: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
