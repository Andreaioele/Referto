"""Benchmark A/B locale tra pipeline standard e pipeline con decision model."""

from __future__ import annotations

import hashlib
import json
import statistics
import uuid
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any, Callable, Dict, List, Optional, Tuple

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
    if not selected:
        return {
            "runs": 0,
            "median_duration_ms": 0.0,
            "mean_duration_ms": 0.0,
            "min_duration_ms": 0.0,
            "max_duration_ms": 0.0,
            "success_rate": 0.0,
            "mean_medgemma_calls": 0.0,
            "mean_prompt_tokens": 0.0,
            "mean_generated_tokens": 0.0,
            "audit_rate": 0.0,
            "audit_skip_rate": 0.0,
        }
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


def _comparison(
    baseline: Dict[str, Any], decision: Dict[str, Any]
) -> Dict[str, Any]:
    baseline_ms = baseline.get("median_duration_ms", 0.0)
    decision_ms = decision.get("median_duration_ms", 0.0)
    if baseline_ms and decision_ms:
        speedup = ((baseline_ms - decision_ms) / baseline_ms * 100)
    else:
        speedup = 0.0
    return {
        "speedup_percent": round(speedup, 2),
        "median_saved_ms": round(baseline_ms - decision_ms, 2) if baseline_ms and decision_ms else 0.0,
        "mean_medgemma_calls_saved": round(
            baseline.get("mean_medgemma_calls", 0.0) - decision.get("mean_medgemma_calls", 0.0), 2
        ) if baseline.get("runs") and decision.get("runs") else 0.0,
    }


def _save_benchmark(result: Dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / f"{result['id']}.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )


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
    test_mode: str = "ab",
) -> Dict[str, Any]:
    repeats = max(1, min(int(repeats), 5))
    started_at = _now()
    rows: List[Dict[str, Any]] = []
    for repeat in range(1, repeats + 1):
        if test_mode == "decision":
            modes = ["decision"]
        elif test_mode == "baseline":
            modes = ["baseline"]
        else:
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
    benchmark_id = f"benchmark-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    result = {
        "id": benchmark_id,
        "kind": "single",
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
            "paired_order": "alternato" if test_mode == "ab" else test_mode,
            "test_mode": test_mode,
            "total_executions": len(rows),
        },
        "aggregates": {"baseline": baseline, "decision": decision},
        "comparison": _comparison(baseline, decision),
        "runs": rows,
    }
    _save_benchmark(result, output_dir)
    return result


def run_dataset_benchmark(
    records: List[Tuple[Dict[str, Any], str]],
    source_name: str,
    output_dir: Path,
    base_url: str,
    model: str,
    timeout: int,
    max_chars: int,
    repeats: int = 1,
    decision_model: str = DEFAULT_DECISION_MODEL,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    test_mode: str = "ab",
    sample_info: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Esegue il benchmark sui referti campionati."""
    if not records:
        raise ValueError("Il dataset non contiene referti utilizzabili.")
    repeats = max(1, min(int(repeats), 3))
    started_at = _now()
    all_rows: List[Dict[str, Any]] = []
    items: List[Dict[str, Any]] = []
    mode_multiplier = 2 if test_mode == "ab" else 1
    total_executions = len(records) * repeats * mode_multiplier
    completed_executions = 0

    for report_index, (record, report) in enumerate(records, start=1):
        item_rows: List[Dict[str, Any]] = []
        record_id = hashlib.sha256(
            str(record.get("doc_key") or report_index).encode("utf-8")
        ).hexdigest()[:10]
        for repeat in range(1, repeats + 1):
            if test_mode == "decision":
                modes = ["decision"]
            elif test_mode == "baseline":
                modes = ["baseline"]
            else:
                modes = ["baseline", "decision"] if repeat % 2 else ["decision", "baseline"]
            for order, mode in enumerate(modes, start=1):
                row = _run_once(
                    report, mode, repeat, order, base_url, model,
                    decision_model, timeout, max_chars,
                )
                row["report_index"] = report_index
                item_rows.append(row)
                all_rows.append(row)
                completed_executions += 1
                if progress_callback:
                    progress_callback(
                        {
                            "completed_executions": completed_executions,
                            "total_executions": total_executions,
                            "report_index": report_index,
                            "records_total": len(records),
                            "mode": mode,
                            "repeat": repeat,
                        }
                    )

        item_baseline = _aggregate(item_rows, "baseline")
        item_decision = _aggregate(item_rows, "decision")
        items.append(
            {
                "index": report_index,
                "record_id": record_id,
                "report": {
                    "sha256": hashlib.sha256(report.encode("utf-8")).hexdigest(),
                    "characters": len(report),
                    "words": len(report.split()),
                },
                "aggregates": {
                    "baseline": item_baseline,
                    "decision": item_decision,
                },
                "comparison": _comparison(item_baseline, item_decision),
                "runs": item_rows,
            }
        )

    baseline = _aggregate(all_rows, "baseline")
    decision = _aggregate(all_rows, "decision")
    comparison = _comparison(baseline, decision)
    comparison.update(
        {
            "reports_faster": sum(
                item["comparison"]["speedup_percent"] > 0 for item in items
            ) if test_mode == "ab" else 0,
            "reports_slower_or_equal": sum(
                item["comparison"]["speedup_percent"] <= 0 for item in items
            ) if test_mode == "ab" else 0,
            "reports_with_audit_skipped": sum(
                any(run["mode"] == "decision" and run["audit_skipped"] for run in item["runs"])
                for item in items
            ),
            "reports_all_runs_successful": sum(
                all(run["success"] for run in item["runs"]) for item in items
            ),
        }
    )
    combined_hash = hashlib.sha256()
    for _, report in records:
        combined_hash.update(report.encode("utf-8"))
        combined_hash.update(b"\0")

    benchmark_id = f"benchmark-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    dataset_meta = {
        "sha256": combined_hash.hexdigest(),
        "records": len(records),
        "characters": sum(len(report) for _, report in records),
        "words": sum(len(report.split()) for _, report in records),
    }
    if sample_info:
        dataset_meta.update(sample_info)

    result = {
        "id": benchmark_id,
        "kind": "dataset",
        "started_at": started_at,
        "completed_at": _now(),
        "source_name": source_name,
        "dataset": dataset_meta,
        "configuration": {
            "model": model,
            "decision_model": decision_model,
            "repeats": repeats,
            "max_chunk_chars": max_chars,
            "paired_order": "alternato" if test_mode == "ab" else test_mode,
            "test_mode": test_mode,
            "total_executions": total_executions,
        },
        "aggregates": {"baseline": baseline, "decision": decision},
        "comparison": comparison,
        "items": items,
        "runs": all_rows,
    }
    _save_benchmark(result, output_dir)
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
                    "kind": data.get("kind", "single"),
                    "records": data.get("dataset", {}).get("records", 1),
                    "test_mode": data.get("configuration", {}).get("test_mode", "ab"),
                    "decision_median_ms": data.get("aggregates", {}).get("decision", {}).get("median_duration_ms", 0.0),
                    "baseline_median_ms": data.get("aggregates", {}).get("baseline", {}).get("median_duration_ms", 0.0),
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
