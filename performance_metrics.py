"""Raccolta locale delle metriche delle chiamate ai modelli."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Dict, Iterator, List, Optional


_MODEL_CALLS: ContextVar[Optional[List[Dict[str, Any]]]] = ContextVar(
    "model_calls", default=None
)


@contextmanager
def capture_model_calls() -> Iterator[List[Dict[str, Any]]]:
    calls: List[Dict[str, Any]] = []
    token = _MODEL_CALLS.set(calls)
    try:
        yield calls
    finally:
        _MODEL_CALLS.reset(token)


def record_model_call(call: Dict[str, Any]) -> None:
    calls = _MODEL_CALLS.get()
    if calls is not None:
        calls.append(call)
