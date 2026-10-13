"""Archivio locale e persistente delle esecuzioni di Referto."""

from __future__ import annotations

import json
import threading
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional


_ACTIVE_TRACE: ContextVar[Optional["TraceRecorder"]] = ContextVar(
    "referto_active_trace", default=None
)


def _now() -> datetime:
    return datetime.now().astimezone()


def _timestamp() -> str:
    return _now().isoformat(timespec="milliseconds")


class TraceRecorder:
    """Salva ogni aggiornamento su disco per conservare anche i fallimenti."""

    def __init__(
        self,
        root: Path,
        source_type: str,
        source_name: str,
        model: str,
    ) -> None:
        started = _now()
        self.root = Path(root)
        self.trace_id = (
            started.strftime("%Y%m%d-%H%M%S-%f") + "-" + uuid.uuid4().hex[:8]
        )
        self.path = self.root / started.strftime("%Y-%m-%d") / f"{self.trace_id}.json"
        self._lock = threading.RLock()
        self.data: Dict[str, Any] = {
            "id": self.trace_id,
            "started_at": started.isoformat(timespec="milliseconds"),
            "completed_at": None,
            "duration_ms": None,
            "status": "running",
            "source_type": source_type,
            "source_name": source_name,
            "model": model,
            "artifacts": {},
            "steps": [],
            "output": None,
            "error": None,
        }
        self._started_monotonic = time.monotonic()
        self._persist()

    def _persist(self) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(
                json.dumps(self.data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            temporary.replace(self.path)

    def set_artifact(self, name: str, value: Any) -> None:
        with self._lock:
            self.data["artifacts"][name] = value
            self._persist()

    @contextmanager
    def step(
        self, name: str, details: Optional[Dict[str, Any]] = None
    ) -> Iterator[Dict[str, Any]]:
        started = _timestamp()
        started_monotonic = time.monotonic()
        entry: Dict[str, Any] = {
            "number": len(self.data["steps"]) + 1,
            "name": name,
            "started_at": started,
            "completed_at": None,
            "duration_ms": None,
            "status": "running",
            "details": details or {},
            "error": None,
        }
        with self._lock:
            self.data["steps"].append(entry)
            self._persist()
        try:
            yield entry["details"]
        except Exception as exc:
            entry["status"] = "error"
            entry["error"] = str(exc)
            raise
        else:
            entry["status"] = "ok"
        finally:
            entry["completed_at"] = _timestamp()
            entry["duration_ms"] = round(
                (time.monotonic() - started_monotonic) * 1000
            )
            self._persist()

    def complete(self, output: Any = None) -> None:
        with self._lock:
            self.data["status"] = "ok"
            self.data["completed_at"] = _timestamp()
            self.data["duration_ms"] = round(
                (time.monotonic() - self._started_monotonic) * 1000
            )
            self.data["output"] = output
            self._persist()

    def fail(self, error: str) -> None:
        with self._lock:
            self.data["status"] = "error"
            self.data["completed_at"] = _timestamp()
            self.data["duration_ms"] = round(
                (time.monotonic() - self._started_monotonic) * 1000
            )
            self.data["error"] = error
            self._persist()


@contextmanager
def trace_scope(recorder: TraceRecorder) -> Iterator[TraceRecorder]:
    token = _ACTIVE_TRACE.set(recorder)
    try:
        yield recorder
    finally:
        _ACTIVE_TRACE.reset(token)


@contextmanager
def traced_step(
    name: str, details: Optional[Dict[str, Any]] = None
) -> Iterator[Dict[str, Any]]:
    recorder = _ACTIVE_TRACE.get()
    if recorder is None:
        yield details or {}
        return
    with recorder.step(name, details) as step_details:
        yield step_details


def active_trace() -> Optional[TraceRecorder]:
    return _ACTIVE_TRACE.get()


def list_trace_summaries(root: Path, limit: int = 100) -> List[Dict[str, Any]]:
    files = sorted(Path(root).glob("*/*.json"), reverse=True)[:limit]
    summaries: List[Dict[str, Any]] = []
    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        summaries.append(
            {
                "id": data.get("id"),
                "started_at": data.get("started_at"),
                "completed_at": data.get("completed_at"),
                "duration_ms": data.get("duration_ms"),
                "status": data.get("status"),
                "source_type": data.get("source_type"),
                "source_name": data.get("source_name"),
                "model": data.get("model"),
                "step_count": len(data.get("steps", [])),
                "error": data.get("error"),
            }
        )
    return summaries


def load_trace(root: Path, trace_id: str) -> Optional[Dict[str, Any]]:
    if not trace_id or any(character not in "0123456789-abcdef" for character in trace_id):
        return None
    matches = list(Path(root).glob(f"*/{trace_id}.json"))
    if len(matches) != 1:
        return None
    try:
        return json.loads(matches[0].read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def update_trace_artifact(root: Path, trace_id: str, name: str, value: Any) -> bool:
    """Aggiunge un artefatto a una trace già conclusa (es. farmaci estratti dopo)."""
    if not trace_id or any(character not in "0123456789-abcdef" for character in trace_id):
        return False
    matches = list(Path(root).glob(f"*/{trace_id}.json"))
    if len(matches) != 1:
        return False
    path = matches[0]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    data.setdefault("artifacts", {})[name] = value
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)
    return True


def delete_trace(root: Path, trace_id: str) -> bool:
    if not trace_id or any(character not in "0123456789-abcdef" for character in trace_id):
        return False
    matches = list(Path(root).glob(f"*/{trace_id}.json"))
    if len(matches) != 1:
        return False
    matches[0].unlink()
    return True
