"""Routing conservativo con un decision model compatibile con Jev/System One."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from time import perf_counter
from typing import Any, Dict, Optional

from performance_metrics import record_model_call
from trace_store import traced_step


DEFAULT_DECISION_MODEL = "laya:322m-multilingual-mlx-fp16"


@dataclass(frozen=True)
class DecisionResult:
    route: str
    route_probability: float
    audit_probability: float
    confidence: float
    should_skip_audit: bool
    fallback_reason: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _compact_state(report: str, draft: str) -> str:
    # Laya multilingual ha una finestra di 1.024 token: conclusioni e bozza hanno
    # priorita' rispetto al testo integrale. La verifica deterministica resta attiva.
    report_excerpt = " ".join(report.split())[:1600]
    draft_excerpt = " ".join(draft.split())[:1800]
    return (
        "Contesto: un assistente ha sintetizzato un referto medico per un paziente. "
        "Deve restare fedele, distinguere certezze e ipotesi, non inventare diagnosi "
        "e non aggiungere consigli medici.\n"
        f"REFERTO (estratto): {report_excerpt}\n"
        f"BOZZA: {draft_excerpt}"
    )


def decide_audit(
    report: str,
    draft: str,
    base_url: str,
    model: str = DEFAULT_DECISION_MODEL,
    timeout: int = 120,
    fast_threshold: float = 0.93,
    audit_threshold: float = 0.40,
) -> DecisionResult:
    """Decide se una bozza gia' valida puo' evitare la costosa revisione generativa.

    Qualsiasi errore, risposta incerta o risultato non conforme porta al percorso
    standard. Il decision model non modifica mai il contenuto medico.
    """
    payload = {
        "model": model,
        "state": _compact_state(report, draft),
        "questions": {
            "route": {
                "type": "choice",
                "instructions": (
                    "Scegli il livello di controllo necessario prima di mostrare la "
                    "bozza a un paziente."
                ),
                "criteria": {
                    "fast": "Bozza semplice, fedele, prudente e senza consigli aggiunti.",
                    "standard": "Serve una revisione ordinaria di fedelta o chiarezza.",
                    "guarded": "Contenuto incerto, delicato, contraddittorio o potenzialmente prescrittivo.",
                },
            },
            "release": {
                "type": "choice",
                "instructions": (
                    "La bozza puo' essere mostrata cosi' com'e' oppure deve essere "
                    "revisionata dal modello generativo?"
                ),
                "criteria": {
                    "needs_review": (
                        "Contiene omissioni importanti, affermazioni non supportate, "
                        "consigli aggiunti o linguaggio poco chiaro."
                    ),
                    "safe_to_publish": (
                        "E' fedele al referto, chiara, prudente e non aggiunge consigli."
                    ),
                },
            },
        },
        "keep_alive": "30m",
    }
    trace_seed: Dict[str, Any] = {
        "model": model,
        "endpoint": "/v1/systemone",
        "fast_threshold": fast_threshold,
        "audit_threshold": audit_threshold,
    }
    started = perf_counter()
    with traced_step("Decision model: selezione del percorso", trace_seed) as details:
        try:
            request = urllib.request.Request(
                f"{base_url.rstrip('/')}/v1/systemone",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = json.load(response)
            route_answer = raw["answers"]["route"]
            release_answer = raw["answers"]["release"]
            route = str(route_answer["choice"])
            probabilities = route_answer.get("probabilities", {})
            route_probability = float(probabilities.get(route, 0.0))
            audit_probability = float(
                release_answer.get("probabilities", {}).get("needs_review", 1.0)
            )
            confidence = float(route_answer.get("confidence", 0.0))
            skip = (
                route == "fast"
                and route_probability >= fast_threshold
                and audit_probability <= audit_threshold
            )
            result = DecisionResult(
                route=route,
                route_probability=route_probability,
                audit_probability=audit_probability,
                confidence=confidence,
                should_skip_audit=skip,
            )
            duration_ms = round((perf_counter() - started) * 1000, 2)
            details.update(result.as_dict())
            details["probabilities"] = probabilities
            details["release_probabilities"] = release_answer.get("probabilities", {})
            details["usage"] = raw.get("usage", {})
            record_model_call(
                {
                    "kind": "decision",
                    "model": model,
                    "stage": "Decision model: selezione del percorso",
                    "endpoint": "/v1/systemone",
                    "wall_duration_ms": duration_ms,
                    "usage": raw.get("usage", {}),
                    **result.as_dict(),
                }
            )
            return result
        except (KeyError, TypeError, ValueError, TimeoutError, urllib.error.URLError) as exc:
            # Fail-safe: il percorso standard conserva l'audit MedGemma esistente.
            reason = f"{type(exc).__name__}: {exc}"
            result = DecisionResult(
                route="standard",
                route_probability=0.0,
                audit_probability=1.0,
                confidence=0.0,
                should_skip_audit=False,
                fallback_reason=reason,
            )
            duration_ms = round((perf_counter() - started) * 1000, 2)
            details.update(result.as_dict())
            record_model_call(
                {
                    "kind": "decision",
                    "model": model,
                    "stage": "Decision model: fallback conservativo",
                    "endpoint": "/v1/systemone",
                    "wall_duration_ms": duration_ms,
                    **result.as_dict(),
                }
            )
            return result
