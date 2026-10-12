"""Benchmark A/B locale tra pipeline standard e pipeline con decision model."""

from __future__ import annotations

import hashlib
import json
import statistics
import uuid
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, List, Optional

from decision_model import DEFAULT_DECISION_MODEL
from performance_metrics import capture_model_calls
from spiega_referto import explain_report, validate_explanation


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _run_once(
    report: str,
    mode: str,
    repeat: int,
    order: int,
    base_url: str,
    model: str,
    decision_model: str,
    timeout: int,
    max_chars: int,
) -> Dict[str, Any]:
    started = perf_counter()
    error = None
    explanation = ""
    with capture_model_calls() as calls:
        try:
            explanation = explain_report(
                report,
                base_url,
                model,
                timeout,
                max_chars,
                use_decision_model=mode == "decision",
                decision_model=decision_model,
            )
        except Exception as exc:  # benchmark: l'errore deve restare misurabile
            error = f"{type(exc).__name__}: {exc}"
    duration_ms = round((perf_counter() - started) * 1000, 2)
    generative = [call for call in calls if call.get("kind") == "generative"]
    decisions = [call for call in calls if call.get("kind") == "decision"]
    issues = validate_explanation(explanation) if explanation else []
    return {
        "mode": mode,
        "repeat": repeat,
        "order": order,
        "duration_ms": duration_ms,
        "success": error is None and not issues,
        "error": error,
        "validation_issues": issues,
        "model_calls": len(calls),
        "medgemma_calls": len(generative),
        "decision_calls": len(decisions),
        "prompt_tokens": sum(int(c.get("prompt_eval_count") or 0) for c in generative),
        "generated_tokens": sum(int(c.get("eval_count") or 0) for c in generative),
        "ollama_duration_ms": round(
            sum(float(c.get("total_duration") or 0) for c in generative) / 1_000_000, 2
        ),
        "audit_called": any("Revisione" in str(c.get("stage")) for c in generative),
        "repair_called": any("Riparazione" in str(c.get("stage")) for c in generative),
        "audit_skipped": bool(decisions and decisions[-1].get("should_skip_audit")),
        "decision_route": decisions[-1].get("route") if decisions else None,
        "decision_probability": decisions[-1].get("route_probability") if decisions else None,
        "audit_probability": decisions[-1].get("audit_probability") if decisions else None,
    }


def _aggregate(rows: List[Dict[str, Any]], mode: str) -> Dict[str, Any]:
    selected = [row for row in rows if row["mode"] == mode]
    durations = [row["duration_ms"] for row in selected]
    return {
        "runs": len(selected),
        "median_duration_ms": round(statistics.median(durations), 2),
        "mean_duration_ms": round(statistics.mean(durations), 2),
        "min_duration_ms": round(min(durations), 2),
        "max_duration_ms": round(max(durations), 2),
        "success_rate": round(sum(row["success"] for row in selected) / len(selected), 3),
        "mean_medgemma_calls": round(statistics.mean(row["medgemma_calls"] for row in selected), 2),
        "mean_prompt_tokens": round(statistics.mean(row["prompt_tokens"] for row in selected), 2),
        "mean_generated_tokens": round(statistics.mean(row["generated_tokens"] for row in selected), 2),
        "audit_rate": round(sum(row["audit_called"] for row in selected) / len(selected), 3),
        "audit_skip_rate": round(sum(row["audit_skipped"] for row in selected) / len(selected), 3),
    }


def run_paired_benchmark(
    report: str,
    source_name: str,
    output_dir: Path,
    base_url: str,
    model: str,
    timeout: int,
    max_chars: int,
    repeats: int = 2,
    decision_model: str = DEFAULT_DECISION_MODEL,
) -> Dict[str, Any]:
    repeats = max(1, min(int(repeats), 5))
    started_at = _now()
    rows: List[Dict[str, Any]] = []
    for repeat in range(1, repeats + 1):
        modes = ["baseline", "decision"] if repeat % 2 else ["decision", "baseline"]
        for order, mode in enumerate(modes, start=1):
            rows.append(
                _run_once(
                    report, mode, repeat, order, base_url, model,
                    decision_model, timeout, max_chars,
                )
            )

    baseline = _aggregate(rows, "baseline")
    decision = _aggregate(rows, "decision")
    baseline_ms = baseline["median_duration_ms"]
    decision_ms = decision["median_duration_ms"]
    speedup = ((baseline_ms - decision_ms) / baseline_ms * 100) if baseline_ms else 0.0
    call_reduction = baseline["mean_medgemma_calls"] - decision["mean_medgemma_calls"]
    benchmark_id = f"benchmark-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    result = {
        "id": benchmark_id,
        "started_at": started_at,
        "completed_at": _now(),
        "source_name": source_name,
        "report": {
            "sha256": hashlib.sha256(report.encode("utf-8")).hexdigest(),
            "characters": len(report),
            "words": len(report.split()),
        },
        "configuration": {
            "model": model,
            "decision_model": decision_model,
            "repeats": repeats,
            "max_chunk_chars": max_chars,
            "paired_order": "alternato",
        },
        "aggregates": {"baseline": baseline, "decision": decision},
        "comparison": {
            "speedup_percent": round(speedup, 2),
            "median_saved_ms": round(baseline_ms - decision_ms, 2),
            "mean_medgemma_calls_saved": round(call_reduction, 2),
        },
        "runs": rows,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / f"{benchmark_id}.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return result


def list_benchmarks(output_dir: Path, limit: int = 50) -> List[Dict[str, Any]]:
    if not output_dir.exists():
        return []
    results = []
    for path in sorted(output_dir.glob("benchmark-*.json"), reverse=True)[:limit]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            results.append(
                {
                    "id": data["id"],
                    "started_at": data["started_at"],
                    "source_name": data["source_name"],
                    "speedup_percent": data["comparison"]["speedup_percent"],
                    "repeats": data["configuration"]["repeats"],
                }
            )
        except (OSError, KeyError, json.JSONDecodeError):
            continue
    return results


def load_benchmark(output_dir: Path, benchmark_id: str) -> Optional[Dict[str, Any]]:
    if not benchmark_id.startswith("benchmark-") or "/" in benchmark_id:
        return None
    path = output_dir / f"{benchmark_id}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
