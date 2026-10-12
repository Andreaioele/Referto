#!/usr/bin/env python3
"""Interfaccia web locale per spiegare referti con MedGemma e Ollama."""

from __future__ import annotations

import argparse
import json
import re
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from flask import Flask, jsonify, render_template, request, send_from_directory
from PIL import Image, UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from benchmarking import list_benchmarks, load_benchmark, run_paired_benchmark
from decision_model import DEFAULT_DECISION_MODEL
from trace_store import (
    TraceRecorder,
    list_trace_summaries,
    load_trace,
    trace_scope,
    traced_step,
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
)


BASE_DIR = Path(__file__).resolve().parent
RESULTS_DIR = BASE_DIR / "risultati"
TRACES_DIR = BASE_DIR / "traces"
BENCHMARKS_DIR = BASE_DIR / "benchmarks"
MODEL_LOCK = threading.Lock()
MAX_DATASET_ITEMS = 200

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
            trace.complete(result)
            return jsonify({"ok": True, "result": result, "trace_id": trace.trace_id})
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
                trace.complete(result)
                return jsonify(
                    {
                        "ok": True,
                        "result": result,
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
                trace.complete(result)
                return jsonify(
                    {
                        "ok": True,
                        "result": result,
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


@app.post("/api/analyze/dataset")
def analyze_dataset():
    upload = request.files.get("dataset")
    source_name = secure_filename(getattr(upload, "filename", "")) or "Dataset JSONL"
    trace = _new_trace("dataset", source_name)
    acquired = False
    with trace_scope(trace):
        try:
            with traced_step("Accesso al modello locale"):
                acquired = _acquire_model()
            try:
                requested_limit = int(request.form.get("limit", "5"))
            except ValueError as exc:
                raise UserFacingError("Il limite del dataset non e' valido.") from exc
            limit = max(1, min(requested_limit, MAX_DATASET_ITEMS))

            with tempfile.TemporaryDirectory(prefix="referto-dataset-") as temp_name:
                with traced_step("Caricamento del dataset JSONL") as details:
                    dataset_path = _save_upload(upload, Path(temp_name), {".jsonl"})
                    records = load_jsonl_reports(dataset_path, limit=limit)
                    details["filename"] = dataset_path.name
                    details["bytes"] = dataset_path.stat().st_size
                    details["records_loaded"] = len(records)
                    details["requested_limit"] = limit

            RESULTS_DIR.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            output_name = f"dataset-spiegato-{timestamp}.jsonl"
            output_path = RESULTS_DIR / output_name
            results = []

            with output_path.open("w", encoding="utf-8") as destination:
                for index, (record, report) in enumerate(records, start=1):
                    item: Dict[str, Any] = {
                        "index": index,
                        "dataset": record.get("dataset"),
                        "doc_key": record.get("doc_key"),
                        "report_text": report,
                    }
                    try:
                        with traced_step(
                            f"Elaborazione del referto {index}",
                            {
                                "index": index,
                                "doc_key": record.get("doc_key"),
                                "report_text": report,
                            },
                        ) as details:
                            item["explanation"] = _explain_text(report)
                            details["explanation"] = item["explanation"]
                        item["status"] = "ok"
                    except UserFacingError as exc:
                        item["status"] = "error"
                        item["error"] = str(exc)
                    destination.write(json.dumps(item, ensure_ascii=False) + "\n")
                    results.append(item)

            successes = sum(item["status"] == "ok" for item in results)
            preview = [
                {
                    "index": item["index"],
                    "doc_key": item.get("doc_key"),
                    "status": item["status"],
                    "explanation": item.get("explanation", "")[:700],
                    "error": item.get("error", ""),
                }
                for item in results[:5]
            ]
            summary = {
                "processed": len(results),
                "successes": successes,
                "errors": len(results) - successes,
                "output_file": output_name,
            }
            trace.set_artifact("dataset_results", results)
            trace.complete(summary)
            return jsonify(
                {
                    "ok": True,
                    **summary,
                    "preview": preview,
                    "download_url": f"/download/{output_name}",
                    "trace_id": trace.trace_id,
                }
            )
        except UserFacingError as exc:
            trace.fail(str(exc))
            return _json_error(str(exc), trace_id=trace.trace_id)
        except OSError as exc:
            message = f"Errore durante il salvataggio: {exc}"
            trace.fail(message)
            return _json_error(message, 500, trace.trace_id)
        except Exception as exc:
            message = f"Errore interno imprevisto: {type(exc).__name__}: {exc}"
            trace.fail(message)
            return _json_error("Errore interno imprevisto.", 500, trace.trace_id)
        finally:
            if acquired:
                _release_model()


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

            trace.set_artifact("input_text", report)
            trace.set_artifact("repeats", repeats)
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
