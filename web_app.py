#!/usr/bin/env python3
"""Interfaccia web locale per spiegare referti con MedGemma e Ollama."""

from __future__ import annotations

import argparse
import json
import random
import re
import statistics
import tempfile
import threading
import uuid
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, render_template, request, send_file, send_from_directory
from PIL import Image, UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from benchmarking import (
    list_benchmarks,
    load_benchmark,
    run_dataset_benchmark,
    run_paired_benchmark,
)
from decision_model import DEFAULT_DECISION_MODEL
from performance_metrics import capture_model_calls
from glossario_medico import build_glossary, glossary_info, saved_terms
from strutture_sanitarie import (
    BRANCHES,
    FacilitiesUnavailable,
    branch_view,
    classify_report,
    find_facilities,
    geocode,
)
from archivio_referti import list_reports, load_report
from farmaci_referti import (
    LeafletUnavailable,
    catalog_info,
    extract_medications,
    history_overview,
    valid_choice,
    leaflet_pdf,
    search_catalog,
)
from trace_store import (
    TraceRecorder,
    delete_trace,
    list_trace_summaries,
    load_trace,
    trace_scope,
    traced_step,
    update_trace_artifact,
)

from spiega_referto import (
    DEFAULT_MODEL,
    DEFAULT_OLLAMA_URL,
    DISCLAIMER,
    SUPPORTED_IMAGE_SUFFIXES,
    UserFacingError,
    explain_report,
    extract_pdf_text,
    load_jsonl_reports,
    render_pdf_pages,
    transcribe_report_images,
    validate_explanation,
)


BASE_DIR = Path(__file__).resolve().parent
RESULTS_DIR = BASE_DIR / "risultati"
TRACES_DIR = BASE_DIR / "traces"
BENCHMARKS_DIR = BASE_DIR / "benchmarks"
DATASETS_DIR = BASE_DIR / "datasets"
PREDEFINED_DATASETS: Dict[str, Dict[str, Any]] = {
    "mtsamples_radiology.jsonl": {
        "title": "MTSamples · Radiologia",
        "description": "273 referti di ecografie, raggi X, TC e RM",
        "badge": "Radiologia",
        "records": 273,
    },
    "radgraph_it_50.jsonl": {
        "title": "RadGraph-IT",
        "description": "50 referti radiologici in lingua italiana",
        "badge": "Italiano",
        "records": 50,
    },
    "mtsamples_cardio_pulmonary.jsonl": {
        "title": "MTSamples · Cardio & Polmonare",
        "description": "371 referti cardiovascolari e respiratori",
        "badge": "Cardio / Polmoni",
        "records": 371,
    },
    "mtsamples_all.jsonl": {
        "title": "MTSamples · Archivio Completo",
        "description": "4.966 referti da 40 branche cliniche",
        "badge": "Completo",
        "records": 4966,
    },
    "all_datasets_merged.jsonl": {
        "title": "Tutti i Dataset Uniti (IT + EN)",
        "description": "5.016 referti clinici: RadGraph-IT e archivio MTSamples completo",
        "badge": "Tutti Uniti",
        "records": 5016,
    },
}
MODEL_LOCK = threading.Lock()
MAX_DATASET_ITEMS = 200
BENCHMARK_JOBS: Dict[str, Dict[str, Any]] = {}
BENCHMARK_JOBS_LOCK = threading.RLock()
DATASET_JOBS: Dict[str, Dict[str, Any]] = {}
DATASET_JOBS_LOCK = threading.RLock()

app = Flask(__name__)
app.config.update(
    MAX_CONTENT_LENGTH=25 * 1024 * 1024,
    MODEL_NAME=DEFAULT_MODEL,
    OLLAMA_URL=DEFAULT_OLLAMA_URL,
    MODEL_TIMEOUT=600,
    MAX_CHUNK_CHARS=9000,
    TRACE_DIR=TRACES_DIR,
    BENCHMARK_DIR=BENCHMARKS_DIR,
    DECISION_MODEL_NAME=DEFAULT_DECISION_MODEL,
    DECISION_MODEL_ENABLED=True,
)


def _settings() -> Tuple[str, str, int, int]:
    return (
        str(app.config["OLLAMA_URL"]),
        str(app.config["MODEL_NAME"]),
        int(app.config["MODEL_TIMEOUT"]),
        int(app.config["MAX_CHUNK_CHARS"]),
    )


def _complete_output(explanation: str) -> str:
    return explanation.rstrip() + DISCLAIMER


def _explain_text(report: str, use_decision_model: Optional[bool] = None) -> str:
    report = report.strip()
    if len(re.sub(r"\s+", "", report)) < 40:
        raise UserFacingError("Il testo e' troppo breve per contenere un referto completo.")
    base_url, model, timeout, max_chars = _settings()
    enabled = (
        bool(app.config["DECISION_MODEL_ENABLED"])
        if use_decision_model is None
        else use_decision_model
    )
    return _complete_output(
        explain_report(
            report,
            base_url,
            model,
            timeout,
            max_chars,
            use_decision_model=enabled,
            decision_model=str(app.config["DECISION_MODEL_NAME"]),
        )
    )


def _glossary(report: str, result: str) -> List[Dict[str, Any]]:
    """Parole mediche del referto con spiegazione semplice; mai bloccante."""
    base_url, model, timeout, _ = _settings()
    with traced_step("Glossario dei termini medici") as details:
        try:
            terms = build_glossary(report, result, base_url, model, timeout)
        except Exception as exc:  # il glossario è un extra: la spiegazione resta valida
            details["error"] = f"{type(exc).__name__}: {exc}"
            return []
        details["terms"] = [term["id"] for term in terms]
        details["simplified"] = sum(1 for term in terms if term.get("simple_it"))
    return terms


def _branch(report: str) -> Dict[str, Any]:
    """Branca specialistica del referto: modello, con parole chiave di riserva."""
    base_url, model, timeout, _ = _settings()
    with traced_step("Classificazione della branca") as details:
        branch = classify_report(report, base_url, model, timeout)
        details.update(branch)
    return branch


def _medications(report: str) -> Dict[str, Any]:
    """Farmaci scritti nel referto, collegati al prontuario AIFA."""
    base_url, model, timeout, _ = _settings()
    with traced_step("Estrazione dei farmaci") as details:
        medications = extract_medications(report, base_url, model, timeout)
        details["method"] = medications["method"]
        details["count"] = len(medications["items"])
    return medications


def _save_upload(upload: Any, directory: Path, allowed_suffixes: set[str]) -> Path:
    if upload is None or not getattr(upload, "filename", ""):
        raise UserFacingError("Seleziona un file prima di avviare l'analisi.")
    safe_name = secure_filename(upload.filename)
    suffix = Path(safe_name).suffix.lower()
    if suffix not in allowed_suffixes:
        allowed = ", ".join(sorted(allowed_suffixes))
        raise UserFacingError(f"Formato non supportato. Formati ammessi: {allowed}")
    destination = directory / (safe_name or f"caricamento{suffix}")
    upload.save(destination)
    return destination


def _acquire_model() -> bool:
    if not MODEL_LOCK.acquire(blocking=False):
        raise UserFacingError(
            "Il modello sta gia' elaborando un altro referto. Attendi il completamento e riprova."
        )
    return True


def _release_model() -> None:
    if MODEL_LOCK.locked():
        MODEL_LOCK.release()


def _json_error(message: str, status: int = 400, trace_id: Optional[str] = None):
    payload = {"ok": False, "error": message}
    if trace_id:
        payload["trace_id"] = trace_id
    return jsonify(payload), status


def _new_trace(source_type: str, source_name: str) -> TraceRecorder:
    return TraceRecorder(
        Path(app.config["TRACE_DIR"]),
        source_type,
        source_name,
        str(app.config["MODEL_NAME"]),
    )


def _benchmark_job_view(job: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": job["id"],
        "status": job["status"],
        "source_name": job["source_name"],
        "trace_id": job["trace_id"],
        "records_total": job["records_total"],
        "total_executions": job["total_executions"],
        "completed_executions": job["completed_executions"],
        "current_report": job.get("current_report", 0),
        "current_mode": job.get("current_mode"),
        "test_mode": job.get("test_mode", "ab"),
        "sample_info": job.get("sample_info"),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "error": job.get("error"),
        "benchmark": job.get("benchmark") if job["status"] == "complete" else None,
    }


def _run_dataset_benchmark_job(
    job_id: str,
    records: list,
    repeats: int,
    trace: TraceRecorder,
    test_mode: str = "ab",
    sample_info: Optional[Dict[str, Any]] = None,
) -> None:
    acquired = False
    try:
        with BENCHMARK_JOBS_LOCK:
            job = BENCHMARK_JOBS[job_id]
            job["status"] = "queued"
        with trace_scope(trace):
            with traced_step("Attesa e accesso esclusivo ai modelli locali"):
                MODEL_LOCK.acquire()
                acquired = True
            with BENCHMARK_JOBS_LOCK:
                job["status"] = "running"
                job["started_at"] = datetime.now().astimezone().isoformat(timespec="seconds")

            def update_progress(progress: Dict[str, Any]) -> None:
                with BENCHMARK_JOBS_LOCK:
                    job["completed_executions"] = progress["completed_executions"]
                    job["current_report"] = progress["report_index"]
                    job["current_mode"] = progress["mode"]

            base_url, model, timeout, max_chars = _settings()
            result = run_dataset_benchmark(
                records=records,
                source_name=job["source_name"],
                output_dir=Path(app.config["BENCHMARK_DIR"]),
                base_url=base_url,
                model=model,
                timeout=timeout,
                max_chars=max_chars,
                repeats=repeats,
                decision_model=str(app.config["DECISION_MODEL_NAME"]),
                progress_callback=update_progress,
                test_mode=test_mode,
                sample_info=sample_info,
            )
            with BENCHMARK_JOBS_LOCK:
                job["status"] = "complete"
                job["completed_executions"] = job["total_executions"]
                job["completed_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
                job["benchmark"] = result
            trace.set_artifact(
                "benchmark_metrics",
                {
                    "benchmark_id": result["id"],
                    "dataset": result["dataset"],
                    "configuration": result["configuration"],
                    "aggregates": result["aggregates"],
                    "comparison": result["comparison"],
                },
            )
            trace.complete(result["comparison"])
    except Exception as exc:
        message = f"Benchmark dataset non completato: {type(exc).__name__}: {exc}"
        with BENCHMARK_JOBS_LOCK:
            job = BENCHMARK_JOBS.get(job_id)
            if job:
                job["status"] = "error"
                job["completed_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
                job["error"] = message
        trace.fail(message)
    finally:
        if acquired:
            _release_model()


def _dataset_job_view(job: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": job["id"],
        "status": job["status"],
        "source_name": job["source_name"],
        "trace_id": job["trace_id"],
        "records_total": job["records_total"],
        "total_executions": job["total_executions"],
        "completed_executions": job["completed_executions"],
        "current_report": job.get("current_report", 0),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "error": job.get("error"),
        "result": job.get("result") if job["status"] == "complete" else None,
    }


def _run_dataset_analysis_job(
    job_id: str,
    records: list,
    limit: int,
    output_name: str,
    trace: TraceRecorder,
) -> None:
    acquired = False
    try:
        with DATASET_JOBS_LOCK:
            job = DATASET_JOBS[job_id]
            job["status"] = "queued"
        with trace_scope(trace):
            with traced_step("Attesa e accesso esclusivo ai modelli locali"):
                MODEL_LOCK.acquire()
                acquired = True
            with DATASET_JOBS_LOCK:
                job["status"] = "running"
                job["started_at"] = datetime.now().astimezone().isoformat(timespec="seconds")

            base_url, model, timeout, max_chars = _settings()
            decision_model_name = str(app.config["DECISION_MODEL_NAME"])
            output_path = RESULTS_DIR / output_name
            items: List[Dict[str, Any]] = []

            with output_path.open("w", encoding="utf-8") as destination:
                for index, (record, report) in enumerate(records[:limit], start=1):
                    with DATASET_JOBS_LOCK:
                        job["current_report"] = index

                    started = perf_counter()
                    error = None
                    explanation = ""
                    with capture_model_calls() as calls:
                        try:
                            with traced_step(
                                f"Elaborazione del referto {index}",
                                {
                                    "index": index,
                                    "doc_key": record.get("doc_key"),
                                    "report_text": report,
                                },
                            ) as step_details:
                                explanation = explain_report(
                                    report,
                                    base_url=base_url,
                                    model=model,
                                    timeout=timeout,
                                    max_chunk_chars=max_chars,
                                    use_decision_model=True,
                                    decision_model=decision_model_name,
                                )
                                step_details["explanation"] = explanation
                        except Exception as exc:
                            error = f"{type(exc).__name__}: {exc}"

                    duration_ms = round((perf_counter() - started) * 1000, 2)
                    generative = [c for c in calls if c.get("kind") == "generative"]
                    decisions = [c for c in calls if c.get("kind") == "decision"]
                    issues = validate_explanation(explanation) if explanation else []
                    status = "ok" if (error is None and not issues) else "error"
                    audit_skipped = bool(decisions and decisions[-1].get("should_skip_audit"))

                    item = {
                        "index": index,
                        "doc_key": record.get("doc_key"),
                        "status": status,
                        "error": error or (", ".join(issues) if issues else ""),
                        "duration_ms": duration_ms,
                        "medgemma_calls": len(generative),
                        "decision_calls": len(decisions),
                        "prompt_tokens": sum(int(c.get("prompt_eval_count") or 0) for c in generative),
                        "generated_tokens": sum(int(c.get("eval_count") or 0) for c in generative),
                        "audit_called": any("Revisione" in str(c.get("stage")) for c in generative),
                        "audit_skipped": audit_skipped,
                        "decision_route": decisions[-1].get("route") if decisions else ("fast" if audit_skipped else "standard"),
                        "decision_score": (decisions[-1].get("route_probability") or decisions[-1].get("grounding_score")) if decisions else None,
                        "explanation": explanation,
                        "report_text": report,
                    }
                    destination.write(json.dumps(item, ensure_ascii=False) + "\n")
                    destination.flush()
                    items.append(item)

                    with DATASET_JOBS_LOCK:
                        job["completed_executions"] = index

            successes = sum(it["status"] == "ok" for it in items)
            audit_skipped_count = sum(it["audit_skipped"] for it in items)
            durations = [it["duration_ms"] for it in items]
            median_ms = round(statistics.median(durations), 2) if durations else 0.0
            mean_calls = round(statistics.mean(it["medgemma_calls"] for it in items), 2) if items else 0.0
            total_tokens = sum(it["generated_tokens"] for it in items)

            result_payload = {
                "processed": len(items),
                "successes": successes,
                "errors": len(items) - successes,
                "output_file": output_name,
                "download_url": f"/download/{output_name}",
                "trace_id": trace.trace_id,
                "aggregates": {
                    "total_duration_ms": round(sum(durations), 2) if durations else 0.0,
                    "median_duration_ms": median_ms,
                    "mean_medgemma_calls": mean_calls,
                    "audit_skipped_count": audit_skipped_count,
                    "audit_skipped_percent": round(audit_skipped_count / len(items) * 100, 1) if items else 0.0,
                    "total_generated_tokens": total_tokens,
                    "decision_model": decision_model_name,
                },
                "items": [
                    {
                        "index": it["index"],
                        "doc_key": it["doc_key"],
                        "status": it["status"],
                        "error": it["error"],
                        "duration_ms": it["duration_ms"],
                        "medgemma_calls": it["medgemma_calls"],
                        "audit_skipped": it["audit_skipped"],
                        "decision_route": it["decision_route"],
                        "decision_score": it["decision_score"],
                        "generated_tokens": it["generated_tokens"],
                        "explanation": it["explanation"],
                    }
                    for it in items
                ],
            }

            with DATASET_JOBS_LOCK:
                job["status"] = "complete"
                job["completed_executions"] = job["total_executions"]
                job["completed_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
                job["result"] = result_payload

            trace.set_artifact("dataset_metrics", result_payload["aggregates"])
            trace.complete(result_payload["aggregates"])
    except Exception as exc:
        message = f"Elaborazione dataset non completata: {type(exc).__name__}: {exc}"
        with DATASET_JOBS_LOCK:
            job = DATASET_JOBS.get(job_id)
            if job:
                job["status"] = "error"
                job["completed_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
                job["error"] = message
        trace.fail(message)
    finally:
        if acquired:
            _release_model()


@app.errorhandler(RequestEntityTooLarge)
def handle_large_file(_: RequestEntityTooLarge):
    message = "Il file supera il limite di 25 MB."
    trace = _new_trace("upload", "File oltre il limite")
    trace.fail(message)
    return _json_error(message, 413, trace.trace_id)


@app.get("/")
def index():
    return render_template("index.html", model_name=app.config["MODEL_NAME"])


@app.post("/api/analyze/text")
def analyze_text():
    report = request.form.get("text", "")
    trace = _new_trace("text", "Testo incollato")
    acquired = False
    with trace_scope(trace):
        trace.set_artifact("input_text", report)
        try:
            with traced_step("Accesso al modello locale"):
                acquired = _acquire_model()
            result = _explain_text(report)
            glossary = _glossary(report, result)
            branch = _branch(report)
            medications = _medications(report)
            trace.set_artifact("glossary", glossary)
            trace.set_artifact("branch", branch)
            trace.set_artifact("medications", medications)
            trace.complete(result)
            return jsonify(
                {
                    "ok": True,
                    "result": result,
                    "glossary": glossary,
                    "branch": branch,
                    "medications": medications,
                    "trace_id": trace.trace_id,
                }
            )
        except UserFacingError as exc:
            trace.fail(str(exc))
            return _json_error(str(exc), trace_id=trace.trace_id)
        except Exception as exc:
            message = f"Errore interno imprevisto: {type(exc).__name__}: {exc}"
            trace.fail(message)
            return _json_error("Errore interno imprevisto.", 500, trace.trace_id)
        finally:
            if acquired:
                _release_model()


@app.post("/api/analyze/image")
def analyze_image():
    upload = request.files.get("image")
    source_name = secure_filename(getattr(upload, "filename", "")) or "Immagine"
    trace = _new_trace("image", source_name)
    acquired = False
    with trace_scope(trace):
        try:
            with traced_step("Accesso al modello locale"):
                acquired = _acquire_model()
            with tempfile.TemporaryDirectory(prefix="referto-immagine-") as temp_name:
                temp_dir = Path(temp_name)
                with traced_step("Salvataggio e verifica dell'immagine") as details:
                    image_path = _save_upload(upload, temp_dir, SUPPORTED_IMAGE_SUFFIXES)
                    try:
                        with Image.open(image_path) as image:
                            details["format"] = image.format
                            details["size"] = list(image.size)
                            image.verify()
                    except (UnidentifiedImageError, OSError) as exc:
                        raise UserFacingError("Il file caricato non e' un'immagine valida.") from exc
                    details["filename"] = image_path.name
                    details["bytes"] = image_path.stat().st_size
                base_url, model, timeout, _ = _settings()
                report = transcribe_report_images([image_path], base_url, model, timeout)
                trace.set_artifact("transcription", report)
                result = _explain_text(report)
                glossary = _glossary(report, result)
                branch = _branch(report)
                medications = _medications(report)
                trace.set_artifact("glossary", glossary)
                trace.set_artifact("branch", branch)
                trace.set_artifact("medications", medications)
                trace.complete(result)
                return jsonify(
                    {
                        "ok": True,
                        "result": result,
                        "glossary": glossary,
                        "branch": branch,
                        "medications": medications,
                        "transcription": report,
                        "trace_id": trace.trace_id,
                    }
                )
        except UserFacingError as exc:
            trace.fail(str(exc))
            return _json_error(str(exc), trace_id=trace.trace_id)
        except Exception as exc:
            message = f"Errore interno imprevisto: {type(exc).__name__}: {exc}"
            trace.fail(message)
            return _json_error("Errore interno imprevisto.", 500, trace.trace_id)
        finally:
            if acquired:
                _release_model()


@app.post("/api/analyze/pdf")
def analyze_pdf():
    upload = request.files.get("pdf")
    source_name = secure_filename(getattr(upload, "filename", "")) or "Documento PDF"
    trace = _new_trace("pdf", source_name)
    acquired = False
    with trace_scope(trace):
        try:
            with traced_step("Accesso al modello locale"):
                acquired = _acquire_model()
            with tempfile.TemporaryDirectory(prefix="referto-pdf-") as temp_name:
                temp_dir = Path(temp_name)
                with traced_step("Salvataggio del documento PDF") as details:
                    pdf_path = _save_upload(upload, temp_dir, {".pdf"})
                    details["filename"] = pdf_path.name
                    details["bytes"] = pdf_path.stat().st_size
                used_vision = False
                try:
                    with traced_step("Estrazione del testo dal PDF") as details:
                        report = extract_pdf_text(pdf_path)
                        details["characters"] = len(report)
                except UserFacingError as exc:
                    if "abbastanza testo estraibile" not in str(exc):
                        raise
                    with traced_step("Conversione delle pagine PDF in immagini") as details:
                        images = render_pdf_pages(pdf_path, temp_dir / "pagine")
                        details["page_count"] = len(images)
                    base_url, model, timeout, _ = _settings()
                    report = transcribe_report_images(images, base_url, model, timeout)
                    used_vision = True
                trace.set_artifact("report_text", report)
                trace.set_artifact(
                    "reading_method",
                    "vision" if used_vision else "pdf_text_extraction",
                )
                result = _explain_text(report)
                glossary = _glossary(report, result)
                branch = _branch(report)
                medications = _medications(report)
                trace.set_artifact("glossary", glossary)
                trace.set_artifact("branch", branch)
                trace.set_artifact("medications", medications)
                trace.complete(result)
                return jsonify(
                    {
                        "ok": True,
                        "result": result,
                        "glossary": glossary,
                        "branch": branch,
                        "medications": medications,
                        "source": "Lettura visiva del PDF scansionato" if used_vision else "Testo del PDF",
                        "trace_id": trace.trace_id,
                    }
                )
        except UserFacingError as exc:
            trace.fail(str(exc))
            return _json_error(str(exc), trace_id=trace.trace_id)
        except Exception as exc:
            message = f"Errore interno imprevisto: {type(exc).__name__}: {exc}"
            trace.fail(message)
            return _json_error("Errore interno imprevisto.", 500, trace.trace_id)
        finally:
            if acquired:
                _release_model()


@app.get("/api/datasets/predefined")
def get_predefined_datasets():
    datasets = []
    for filename, meta in PREDEFINED_DATASETS.items():
        file_path = DATASETS_DIR / filename
        if file_path.is_file():
            datasets.append(
                {
                    "filename": filename,
                    "title": meta["title"],
                    "description": meta["description"],
                    "badge": meta.get("badge", ""),
                    "records": meta.get("records", 0),
                    "bytes": file_path.stat().st_size,
                }
            )
    return jsonify({"ok": True, "datasets": datasets})


@app.post("/api/analyze/dataset")
def analyze_dataset():
    dataset_name = request.form.get("dataset_name", "").strip()
    upload = request.files.get("dataset")

    if dataset_name and dataset_name != "custom":
        safe_name = Path(dataset_name).name
        source_name = PREDEFINED_DATASETS.get(safe_name, {}).get("title", safe_name)
        trace = _new_trace("dataset", source_name)
        is_predefined = True
    else:
        source_name = secure_filename(getattr(upload, "filename", "")) or "Dataset JSONL"
        trace = _new_trace("dataset", source_name)
        is_predefined = False

    with trace_scope(trace):
        try:
            if is_predefined:
                safe_name = Path(dataset_name).name
                dataset_path = DATASETS_DIR / safe_name
                if not dataset_path.is_file() or dataset_path.suffix.lower() != ".jsonl":
                    raise UserFacingError(f"Dataset predefinito non trovato: {safe_name}")
            try:
                requested_limit = int(request.form.get("limit", "5"))
            except ValueError as exc:
                raise UserFacingError("Il limite del dataset non e' valido.") from exc
            limit = max(1, min(requested_limit, MAX_DATASET_ITEMS))

            if is_predefined:
                with traced_step("Caricamento del dataset locale") as details:
                    records = load_jsonl_reports(dataset_path, limit=limit)
                    if not records:
                        raise UserFacingError("Il file non contiene referti testuali utilizzabili.")
                    details["filename"] = dataset_path.name
                    details["bytes"] = dataset_path.stat().st_size
                    details["records_loaded"] = len(records)
                    details["requested_limit"] = limit
            else:
                with tempfile.TemporaryDirectory(prefix="referto-dataset-upload-") as temp_name:
                    with traced_step("Caricamento del dataset JSONL") as details:
                        saved_path = _save_upload(upload, Path(temp_name), {".jsonl"})
                        records = load_jsonl_reports(saved_path, limit=limit)
                        if not records:
                            raise UserFacingError("Il file non contiene referti testuali utilizzabili.")
                        details["filename"] = saved_path.name
                        details["bytes"] = saved_path.stat().st_size
                        details["records_loaded"] = len(records)
                        details["requested_limit"] = limit

            RESULTS_DIR.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            output_name = f"dataset-spiegato-{timestamp}.jsonl"

            job_id = f"job-{uuid.uuid4().hex[:12]}"
            job = {
                "id": job_id,
                "status": "queued",
                "source_name": source_name,
                "trace_id": trace.trace_id,
                "records_total": len(records),
                "total_executions": len(records),
                "completed_executions": 0,
                "current_report": 0,
                "started_at": None,
                "completed_at": None,
                "error": None,
                "result": None,
            }
            with DATASET_JOBS_LOCK:
                DATASET_JOBS[job_id] = job

            worker = threading.Thread(
                target=_run_dataset_analysis_job,
                args=(job_id, records, limit, output_name, trace),
                daemon=True,
                name=f"dataset-{job_id}",
            )
            worker.start()
            return jsonify({"ok": True, "job": _dataset_job_view(job)}), 202
        except UserFacingError as exc:
            trace.fail(str(exc))
            return _json_error(str(exc), trace_id=trace.trace_id)
        except Exception as exc:
            message = f"Impossibile avviare l'elaborazione del dataset: {type(exc).__name__}: {exc}"
            trace.fail(message)
            return _json_error(message, 500, trace.trace_id)


@app.get("/api/analyze/jobs/<job_id>")
def dataset_analysis_job(job_id: str):
    if not re.fullmatch(r"job-[0-9a-f]{12}", job_id):
        return _json_error("Elaborazione dataset non trovata.", 404)
    with DATASET_JOBS_LOCK:
        job = DATASET_JOBS.get(job_id)
        if job is None:
            return _json_error("Elaborazione dataset non trovata.", 404)
        payload = _dataset_job_view(job)
    return jsonify({"ok": True, "job": payload})



@app.get("/api/traces")
def traces_index():
    try:
        limit = max(1, min(int(request.args.get("limit", "100")), 500))
    except ValueError:
        limit = 100
    traces = list_trace_summaries(Path(app.config["TRACE_DIR"]), limit=limit)
    return jsonify({"ok": True, "traces": traces})


@app.get("/api/traces/<trace_id>")
def trace_detail(trace_id: str):
    trace = load_trace(Path(app.config["TRACE_DIR"]), trace_id)
    if trace is None:
        return _json_error("Trace non trovata.", 404)
    return jsonify({"ok": True, "trace": trace})


@app.post("/api/benchmark")
def run_benchmark():
    upload = request.files.get("pdf")
    source_name = (
        secure_filename(getattr(upload, "filename", "")) or "Testo benchmark"
    )
    report = request.form.get("text", "").strip()
    trace = _new_trace("benchmark", source_name)
    acquired = False
    with trace_scope(trace):
        try:
            try:
                repeats = max(1, min(int(request.form.get("repeats", "2")), 5))
            except ValueError as exc:
                raise UserFacingError("Il numero di ripetizioni non e' valido.") from exc

            if upload is not None and getattr(upload, "filename", ""):
                with tempfile.TemporaryDirectory(prefix="referto-benchmark-") as temp_name:
                    pdf_path = _save_upload(upload, Path(temp_name), {".pdf"})
                    report = extract_pdf_text(pdf_path)
            if len(re.sub(r"\s+", "", report)) < 40:
                raise UserFacingError(
                    "Incolla un referto sufficientemente completo oppure carica un PDF testuale."
                )

            test_mode = request.form.get("test_mode", "ab").strip().lower()
            if test_mode not in {"ab", "decision", "baseline"}:
                test_mode = "ab"

            trace.set_artifact("input_text", report)
            trace.set_artifact("repeats", repeats)
            trace.set_artifact("test_mode", test_mode)
            with traced_step("Accesso esclusivo ai modelli locali"):
                acquired = _acquire_model()
            base_url, model, timeout, max_chars = _settings()
            result = run_paired_benchmark(
                report=report,
                source_name=source_name,
                output_dir=Path(app.config["BENCHMARK_DIR"]),
                base_url=base_url,
                model=model,
                timeout=timeout,
                max_chars=max_chars,
                repeats=repeats,
                decision_model=str(app.config["DECISION_MODEL_NAME"]),
                test_mode=test_mode,
            )
            trace.set_artifact("benchmark_metrics", result)
            trace.complete(result["comparison"])
            return jsonify(
                {"ok": True, "benchmark": result, "trace_id": trace.trace_id}
            )
        except UserFacingError as exc:
            trace.fail(str(exc))
            return _json_error(str(exc), trace_id=trace.trace_id)
        except Exception as exc:
            message = f"Benchmark non completato: {type(exc).__name__}: {exc}"
            trace.fail(message)
            return _json_error(message, 500, trace.trace_id)
        finally:
            if acquired:
                _release_model()


@app.post("/api/benchmark/dataset")
def start_dataset_benchmark():
    dataset_name = request.form.get("dataset_name", "").strip()
    upload = request.files.get("dataset")
    test_mode = request.form.get("test_mode", "ab").strip().lower()
    if test_mode not in {"ab", "decision", "baseline"}:
        test_mode = "ab"

    sample_size_raw = request.form.get("sample_size", "").strip()
    sample_size = None
    if sample_size_raw:
        try:
            sample_size = int(sample_size_raw)
            if sample_size <= 0:
                raise UserFacingError("Il numero di referti deve essere maggiore di zero.")
        except ValueError as exc:
            raise UserFacingError("Il numero di referti del campione non e' valido.") from exc

    if dataset_name and dataset_name != "custom":
        safe_name = Path(dataset_name).name
        base_source_name = PREDEFINED_DATASETS.get(safe_name, {}).get("title", safe_name)
        is_predefined = True
    else:
        base_source_name = secure_filename(getattr(upload, "filename", "")) or "Dataset JSONL"
        is_predefined = False

    trace = _new_trace("benchmark_dataset", base_source_name)
    with trace_scope(trace):
        try:
            if is_predefined:
                safe_name = Path(dataset_name).name
                dataset_path = DATASETS_DIR / safe_name
                if not dataset_path.is_file() or dataset_path.suffix.lower() != ".jsonl":
                    raise UserFacingError(f"Dataset predefinito non trovato: {safe_name}")
            try:
                repeats = max(1, min(int(request.form.get("repeats", "1")), 3))
            except ValueError as exc:
                raise UserFacingError("Il numero di ripetizioni non e' valido.") from exc

            if is_predefined:
                with traced_step("Caricamento completo del dataset locale") as details:
                    records = load_jsonl_reports(dataset_path, limit=None)
                    if not records:
                        raise UserFacingError("Il file non contiene referti testuali utilizzabili.")
                    details["filename"] = dataset_path.name
                    details["bytes"] = dataset_path.stat().st_size
                    details["records_loaded"] = len(records)
            else:
                with tempfile.TemporaryDirectory(prefix="referto-benchmark-dataset-") as temp_name:
                    with traced_step("Caricamento completo del dataset JSONL") as details:
                        dataset_path = _save_upload(upload, Path(temp_name), {".jsonl"})
                        records = load_jsonl_reports(dataset_path, limit=None)
                        if not records:
                            raise UserFacingError("Il file non contiene referti testuali utilizzabili.")
                        details["filename"] = dataset_path.name
                        details["bytes"] = dataset_path.stat().st_size
                        details["records_loaded"] = len(records)

            total_available = len(records)
            if sample_size is not None and 0 < sample_size < total_available:
                sampled_records = random.sample(records, sample_size)
                sample_info = {
                    "sampled": True,
                    "sample_size": len(sampled_records),
                    "total_available": total_available,
                }
                source_name = f"{base_source_name} ({len(sampled_records)} referti casuali)"
            else:
                sampled_records = records
                sample_info = {
                    "sampled": False,
                    "sample_size": total_available,
                    "total_available": total_available,
                }
                source_name = base_source_name

            mode_multiplier = 2 if test_mode == "ab" else 1
            total_executions = len(sampled_records) * repeats * mode_multiplier
            job_id = f"job-{uuid.uuid4().hex[:12]}"
            job = {
                "id": job_id,
                "status": "queued",
                "source_name": source_name,
                "trace_id": trace.trace_id,
                "records_total": len(sampled_records),
                "total_executions": total_executions,
                "completed_executions": 0,
                "current_report": 0,
                "current_mode": None,
                "test_mode": test_mode,
                "sample_info": sample_info,
                "started_at": None,
                "completed_at": None,
                "error": None,
                "benchmark": None,
            }
            with BENCHMARK_JOBS_LOCK:
                BENCHMARK_JOBS[job_id] = job
            trace.set_artifact(
                "dataset_summary",
                {
                    "filename": source_name,
                    "records_tested": len(sampled_records),
                    "total_available": total_available,
                    "repeats": repeats,
                    "test_mode": test_mode,
                    "total_executions": total_executions,
                    "sample_info": sample_info,
                },
            )
            worker = threading.Thread(
                target=_run_dataset_benchmark_job,
                args=(job_id, sampled_records, repeats, trace, test_mode, sample_info),
                daemon=True,
                name=f"referto-{job_id}",
            )
            worker.start()
            return jsonify({"ok": True, "job": _benchmark_job_view(job)}), 202
        except UserFacingError as exc:
            trace.fail(str(exc))
            return _json_error(str(exc), trace_id=trace.trace_id)
        except Exception as exc:
            message = f"Impossibile avviare il benchmark dataset: {type(exc).__name__}: {exc}"
            trace.fail(message)
            return _json_error(message, 500, trace.trace_id)


@app.get("/api/benchmark/jobs/<job_id>")
def dataset_benchmark_job(job_id: str):
    if not re.fullmatch(r"job-[0-9a-f]{12}", job_id):
        return _json_error("Test di performance non trovato.", 404)
    with BENCHMARK_JOBS_LOCK:
        job = BENCHMARK_JOBS.get(job_id)
        if job is None:
            return _json_error("Test di performance non trovato.", 404)
        payload = _benchmark_job_view(job)
    return jsonify({"ok": True, "job": payload})


@app.get("/api/benchmarks")
def benchmarks_index():
    return jsonify(
        {
            "ok": True,
            "benchmarks": list_benchmarks(Path(app.config["BENCHMARK_DIR"]), limit=50),
        }
    )


@app.get("/api/benchmarks/<benchmark_id>")
def benchmark_detail(benchmark_id: str):
    benchmark = load_benchmark(Path(app.config["BENCHMARK_DIR"]), benchmark_id)
    if benchmark is None:
        return _json_error("Benchmark non trovato.", 404)
    return jsonify({"ok": True, "benchmark": benchmark})


@app.get("/api/glossary")
def glossary_index():
    return jsonify({"ok": True, "terms": saved_terms(), "source": glossary_info()})


@app.get("/api/branches")
def branches_index():
    return jsonify({"ok": True, "branches": [branch_view(branch["id"]) for branch in BRANCHES]})


@app.get("/api/geocode")
def geocode_place():
    try:
        return jsonify({"ok": True, "place": geocode(request.args.get("q", ""))})
    except ValueError as exc:
        return _json_error(str(exc))
    except FacilitiesUnavailable as exc:
        return _json_error(str(exc), 503)


@app.get("/api/facilities")
def facilities_near():
    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 10))
    except (KeyError, ValueError):
        return _json_error("Posizione o raggio non validi.")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return _json_error("Posizione non valida.")
    try:
        return jsonify(
            {"ok": True, **find_facilities(lat, lon, request.args.get("branch", ""), radius)}
        )
    except FacilitiesUnavailable as exc:
        return _json_error(str(exc), 503)


@app.get("/api/referti")
def reports_index():
    return jsonify({"ok": True, "reports": list_reports(Path(app.config["TRACE_DIR"]))})


@app.get("/api/referti/<trace_id>")
def report_detail(trace_id: str):
    report = load_report(Path(app.config["TRACE_DIR"]), trace_id)
    if report is None:
        return _json_error("Referto non trovato.", 404)
    return jsonify({"ok": True, "report": report})


@app.delete("/api/referti/<trace_id>")
def report_delete(trace_id: str):
    root = Path(app.config["TRACE_DIR"])
    if load_report(root, trace_id) is None or not delete_trace(root, trace_id):
        return _json_error("Referto non trovato.", 404)
    return jsonify({"ok": True})


@app.post("/api/referti/<trace_id>/farmaci")
def report_medications(trace_id: str):
    """Estrae i farmaci da un referto analizzato prima di questa funzione."""
    root = Path(app.config["TRACE_DIR"])
    report = load_report(root, trace_id)
    if report is None:
        return _json_error("Referto non trovato.", 404)
    acquired = False
    try:
        acquired = _acquire_model()
        base_url, model, timeout, _ = _settings()
        medications = extract_medications(report["report_text"], base_url, model, timeout)
    except UserFacingError as exc:
        return _json_error(str(exc), 409)
    finally:
        if acquired:
            _release_model()
    update_trace_artifact(root, trace_id, "medications", medications)
    return jsonify({"ok": True, "medications": medications})


@app.post("/api/referti/<trace_id>/farmaci/<int:index>/scelta")
def medication_choice(trace_id: str, index: int):
    """Il paziente indica quale farmaco usa quando il referto non lo identifica."""
    root = Path(app.config["TRACE_DIR"])
    trace = load_trace(root, trace_id)
    medications = ((trace or {}).get("artifacts") or {}).get("medications")
    if not medications or not 0 <= index < len(medications.get("items", [])):
        return _json_error("Farmaco non trovato.", 404)
    code = (request.get_json(silent=True) or {}).get("cod")
    item = medications["items"][index]
    if code is None:
        item.pop("scelta", None)
    elif valid_choice(item, str(code)):
        item["scelta"] = str(code)
    else:
        return _json_error("Questo farmaco non corrisponde a quello scritto nel referto.")
    update_trace_artifact(root, trace_id, "medications", medications)
    return jsonify({"ok": True})


@app.get("/api/farmaci")
def medications_index():
    reports = list_reports(Path(app.config["TRACE_DIR"]))
    return jsonify(
        {
            "ok": True,
            "farmaci": history_overview(reports),
            "referti_totali": len(reports),
            "referti_da_analizzare": [r["id"] for r in reports if r["medications"] is None],
            "prontuario": catalog_info(),
        }
    )


@app.get("/api/farmaci/cerca")
def medications_search():
    return jsonify({"ok": True, "risultati": search_catalog(request.args.get("q", ""))})


@app.get("/api/farmaci/<code>/foglietto")
def medication_leaflet(code: str):
    document_type = request.args.get("tipo", "FI").upper()
    try:
        path = leaflet_pdf(code, document_type)
    except KeyError:
        return _json_error("Farmaco o documento non trovato.", 404)
    except LeafletUnavailable as exc:
        return _json_error(str(exc), 503)
    return send_file(
        path,
        mimetype="application/pdf",
        as_attachment=False,
        download_name=f"{document_type}_{code}.pdf",
    )


@app.get("/download/<path:filename>")
def download_result(filename: str):
    safe_name = secure_filename(filename)
    if safe_name != filename or not safe_name.endswith(".jsonl"):
        return _json_error("File non valido.", 404)
    return send_from_directory(RESULTS_DIR, safe_name, as_attachment=True)


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("deve essere maggiore di zero")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Avvia l'interfaccia web locale.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=positive_int, default=7860)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    parser.add_argument("--timeout", type=positive_int, default=600)
    parser.add_argument("--decision-model", default=DEFAULT_DECISION_MODEL)
    parser.add_argument("--senza-decision-model", action="store_true")
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    app.config.update(
        MODEL_NAME=args.model,
        OLLAMA_URL=args.ollama_url,
        MODEL_TIMEOUT=args.timeout,
        DECISION_MODEL_NAME=args.decision_model,
        DECISION_MODEL_ENABLED=not args.senza_decision_model,
    )
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)


if __name__ == "__main__":
    main()
