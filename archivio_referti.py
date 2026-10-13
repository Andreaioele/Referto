"""Storico dei referti del paziente, costruito sulle trace già salvate.

Ogni analisi riuscita di testo, PDF o immagine è un referto dell'archivio: non
c'è un secondo salvataggio, così testo, spiegazione, glossario, branca e
farmaci restano in un solo posto (traces/, locale ed escluso da Git).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from trace_store import load_trace

# Dove ogni tipo di analisi salva il testo del referto.
REPORT_TEXT_ARTIFACT = {"text": "input_text", "pdf": "report_text", "image": "transcription"}
SOURCE_LABELS = {"text": "Testo incollato", "pdf": "Documento PDF", "image": "Foto o scansione"}
EXCERPT_CHARS = 240


def _report_text(trace: Dict[str, Any]) -> str:
    artifact = REPORT_TEXT_ARTIFACT.get(trace.get("source_type", ""))
    return str((trace.get("artifacts") or {}).get(artifact) or "")


def _summary_line(explanation: str) -> str:
    """Prima frase utile della SINTESI, per l'anteprima nell'elenco."""
    lines = [line.strip() for line in (explanation or "").splitlines() if line.strip()]
    for index, line in enumerate(lines):
        if line.upper() == "SINTESI" and index + 1 < len(lines):
            return lines[index + 1][:EXCERPT_CHARS]
    return lines[0][:EXCERPT_CHARS] if lines else ""


def _title(trace: Dict[str, Any]) -> str:
    """Nome del file per PDF e immagini; per il testo incollato, il suo inizio."""
    if trace.get("source_type") != "text":
        return str(trace.get("source_name") or SOURCE_LABELS.get(trace.get("source_type"), "Referto"))
    words = _report_text(trace).split()
    title = " ".join(words[:9])
    return title + ("…" if len(words) > 9 else "") if title else "Testo incollato"


def _is_report(trace: Dict[str, Any]) -> bool:
    return trace.get("status") == "ok" and trace.get("source_type") in REPORT_TEXT_ARTIFACT


def list_reports(root: Path) -> List[Dict[str, Any]]:
    reports = []
    for path in sorted(Path(root).glob("*/*.json"), reverse=True):
        try:
            trace = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not _is_report(trace):
            continue
        artifacts = trace.get("artifacts") or {}
        medications = artifacts.get("medications")
        reports.append(
            {
                "id": trace["id"],
                "started_at": trace.get("started_at"),
                "source_type": trace.get("source_type"),
                "source_label": SOURCE_LABELS.get(trace.get("source_type"), "Referto"),
                "source_name": trace.get("source_name"),
                "title": _title(trace),
                "model": trace.get("model"),
                "branch": artifacts.get("branch"),
                "glossary_count": len(artifacts.get("glossary") or []),
                "medications": medications,
                "medications_count": len(medications["items"]) if medications else None,
                "excerpt": _report_text(trace)[:EXCERPT_CHARS],
                "summary": _summary_line(str(trace.get("output") or "")),
            }
        )
    return reports


def load_report(root: Path, trace_id: str) -> Optional[Dict[str, Any]]:
    trace = load_trace(root, trace_id)
    if trace is None or not _is_report(trace):
        return None
    artifacts = trace.get("artifacts") or {}
    return {
        "id": trace["id"],
        "started_at": trace.get("started_at"),
        "source_type": trace.get("source_type"),
        "source_label": SOURCE_LABELS.get(trace.get("source_type"), "Referto"),
        "source_name": trace.get("source_name"),
        "title": _title(trace),
        "model": trace.get("model"),
        "report_text": _report_text(trace),
        "explanation": trace.get("output") or "",
        "glossary": artifacts.get("glossary") or [],
        "branch": artifacts.get("branch"),
        "medications": artifacts.get("medications"),
    }
