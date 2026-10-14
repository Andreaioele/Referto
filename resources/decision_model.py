"""Routing conservativo con decision model (Laya System One e Grounding con Embedding)."""

from __future__ import annotations

import json
import math
import re
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from time import perf_counter
from typing import Any, Dict, List, Optional, Sequence

from performance_metrics import record_model_call
from trace_store import traced_step


DEFAULT_DECISION_MODEL = "laya:322m-multilingual-mlx-fp16"
DEFAULT_EMBEDDING_MODEL = "bge-m3:latest"
DEFAULT_FAST_THRESHOLD = 0.65
DEFAULT_AUDIT_THRESHOLD = 0.50
DEFAULT_GROUNDING_THRESHOLD = 0.70
DEFAULT_GROUNDING_MEAN_THRESHOLD = 0.75


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


def is_embedding_model(model: str) -> bool:
    """Riconosce se il modello specificato e' un modello di embedding."""
    name = (model or "").lower()
    return any(keyword in name for keyword in ("bge", "embed", "nomic", "minilm"))


def _compact_state(report: str, draft: str) -> str:
    # Laya multilingual su Ollama /v1/systemone ha un limite per lo stato di 944 token
    # per poter includere domande e criteri (contesto massimo 1.024 token).
    # Manteniamo gli estratti entro ~2.000 caratteri (~500-600 token) per prevenire
    # errori 400 Bad Request di Ollama.
    report_excerpt = " ".join(report.split())[:900]
    draft_excerpt = " ".join(draft.split())[:1100]
    return (
        "Contesto: un assistente ha sintetizzato un referto medico per un paziente. "
        "Deve restare fedele, distinguere certezze e ipotesi, non inventare diagnosi "
        "e non aggiungere consigli medici.\n"
        f"REFERTO (estratto): {report_excerpt}\n"
        f"BOZZA: {draft_excerpt}"
    )


def _cosine_similarity(v1: Sequence[float], v2: Sequence[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    return (dot / (norm1 * norm2)) if (norm1 and norm2) else 0.0


def _extract_clinical_claims(text: str) -> List[str]:
    """Estrae le singole asserzioni cliniche dalla bozza, escludendo titoli e frasi fisse."""
    raw = [s.strip() for s in re.split(r"[.\n;]+", text) if s.strip()]
    headers = {
        "sintesi",
        "spiegazione in parole semplici",
        "incertezze o limiti del referto",
        "indicazioni riportate nel documento",
        "reperti principali",
        "domande da fare al medico",
        "domande utili da fare al medico",
    }
    claims: List[str] = []
    for sentence in raw:
        clean = sentence.strip(" :-*#")
        if not clean or len(clean) < 15:
            continue
        clean_lower = clean.lower()
        if clean_lower in headers:
            continue
        # Esclude indicazioni boilerplate o frasi standard di assenza
        if any(
            pattern in clean_lower
            for pattern in (
                "il documento non riporta indicazioni",
                "non sono riportati limiti",
                "nessuna indicazione operativa riportata",
            )
        ):
            continue
        claims.append(clean)
    return claims


def _extract_report_sentences(text: str) -> List[str]:
    """Spezza il referto in frasi significative per il confronto semantico."""
    raw = [s.strip() for s in re.split(r"[.\n;]+", text) if s.strip()]
    return [s for s in raw if len(s) >= 10]


def _embed_texts(
    base_url: str,
    model: str,
    texts: Sequence[str],
    timeout: int = 60,
) -> List[List[float]]:
    """Esegue l'embedding vettoriale via Ollama /api/embed (con fallback su /api/embeddings)."""
    if not texts:
        return []
    base_url = base_url.rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[:-3].rstrip("/")
    # Prova l'endpoint batch nativo /api/embed
    payload = {
        "model": model,
        "input": list(texts),
        "keep_alive": "30m",
    }
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/embed",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = json.load(response)
        embeddings = data.get("embeddings")
        if isinstance(embeddings, list) and len(embeddings) == len(texts):
            return embeddings
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise

    # Fallback su endpoint /api/embeddings singola chiamata
    results: List[List[float]] = []
    for item in texts:
        single_req = urllib.request.Request(
            f"{base_url.rstrip('/')}/api/embeddings",
            data=json.dumps({"model": model, "prompt": item, "keep_alive": "30m"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(single_req, timeout=timeout) as response:
            single_data = json.load(response)
        results.append(single_data.get("embedding", []))
    return results


def decide_grounding_audit(
    report: str,
    draft: str,
    base_url: str,
    model: str = DEFAULT_EMBEDDING_MODEL,
    timeout: int = 60,
    min_similarity: float = DEFAULT_GROUNDING_THRESHOLD,
    mean_similarity: float = DEFAULT_GROUNDING_MEAN_THRESHOLD,
) -> DecisionResult:
    """Verifica la fedelta' semantica della bozza rispetto al referto tramite embeddings.

    Calcola se ogni affermazione clinica della bozza e' sufficientemente ancorata
    alle frasi del referto originale (groundedness). Se tutte le affermazioni
    superano la soglia minima e la media e' soddisfacente, evita l'audit generativo.
    """
    trace_seed: Dict[str, Any] = {
        "model": model,
        "endpoint": "/api/embed",
        "method": "grounding_embeddings",
        "min_similarity_threshold": min_similarity,
        "mean_similarity_threshold": mean_similarity,
    }
    started = perf_counter()
    with traced_step("Decision model: grounding semantico con embedding", trace_seed) as details:
        try:
            claims = _extract_clinical_claims(draft)
            report_sentences = _extract_report_sentences(report)

            if not claims or not report_sentences:
                # Se non ci sono asserzioni o frasi analizzabili, fallback prudente
                result = DecisionResult(
                    route="standard",
                    route_probability=0.0,
                    audit_probability=1.0,
                    confidence=0.0,
                    should_skip_audit=False,
                    fallback_reason="Testo insufficiente per verifica semantica",
                )
                duration_ms = round((perf_counter() - started) * 1000, 2)
                details.update(result.as_dict())
                return result

            all_texts = report_sentences + claims
            all_vectors = _embed_texts(base_url, model, all_texts, timeout=timeout)
            report_vectors = all_vectors[:len(report_sentences)]
            claim_vectors = all_vectors[len(report_sentences):]

            claim_similarities: List[float] = []
            ungrounded_claims: List[Dict[str, Any]] = []

            for claim_text, claim_vec in zip(claims, claim_vectors):
                sims = [_cosine_similarity(claim_vec, rep_vec) for rep_vec in report_vectors]
                best_sim = max(sims) if sims else 0.0
                best_idx = sims.index(best_sim) if sims else 0
                claim_similarities.append(best_sim)
                if best_sim < min_similarity:
                    ungrounded_claims.append(
                        {
                            "claim": claim_text,
                            "similarity": round(best_sim, 3),
                            "best_matched_sentence": report_sentences[best_idx],
                        }
                    )

            min_sim = min(claim_similarities) if claim_similarities else 0.0
            mean_sim = (sum(claim_similarities) / len(claim_similarities)) if claim_similarities else 0.0
            skip = (min_sim >= min_similarity) and (mean_sim >= mean_similarity)
            route = "fast" if skip else "standard"
            route_probability = round(mean_sim, 4)
            audit_probability = round(max(0.0, 1.0 - mean_sim), 4)

            result = DecisionResult(
                route=route,
                route_probability=route_probability,
                audit_probability=audit_probability,
                confidence=round(min_sim, 4),
                should_skip_audit=skip,
            )
            duration_ms = round((perf_counter() - started) * 1000, 2)
            details.update(result.as_dict())
            details["claims_evaluated"] = len(claims)
            details["min_similarity"] = round(min_sim, 4)
            details["mean_similarity"] = round(mean_sim, 4)
            details["ungrounded_claims"] = ungrounded_claims

            record_model_call(
                {
                    "kind": "decision",
                    "model": model,
                    "stage": "Decision model: grounding semantico con embedding",
                    "endpoint": "/api/embed",
                    "wall_duration_ms": duration_ms,
                    "claims_count": len(claims),
                    "min_similarity": round(min_sim, 4),
                    "mean_similarity": round(mean_sim, 4),
                    **result.as_dict(),
                }
            )
            return result
        except (KeyError, TypeError, ValueError, TimeoutError, urllib.error.URLError) as exc:
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
                    "stage": "Decision model: fallback conservativo grounding",
                    "endpoint": "/api/embed",
                    "wall_duration_ms": duration_ms,
                    **result.as_dict(),
                }
            )
            return result


def decide_systemone_audit(
    report: str,
    draft: str,
    base_url: str,
    model: str = DEFAULT_DECISION_MODEL,
    timeout: int = 120,
    fast_threshold: float = DEFAULT_FAST_THRESHOLD,
    audit_threshold: float = DEFAULT_AUDIT_THRESHOLD,
) -> DecisionResult:
    """Decide se una bozza gia' valida puo' evitare la costosa revisione generativa con Laya.

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
            # Cattura il messaggio esatto da Ollama in caso di HTTPError (es. token limit)
            if isinstance(exc, urllib.error.HTTPError):
                try:
                    error_body = exc.read().decode("utf-8", errors="replace").strip()
                    reason = f"HTTPError {exc.code}: {error_body}" if error_body else f"HTTPError {exc.code}: {exc.reason}"
                except Exception:
                    reason = f"HTTPError {exc.code}: {exc.reason}"
            else:
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


def decide_audit(
    report: str,
    draft: str,
    base_url: str,
    model: str = DEFAULT_DECISION_MODEL,
    timeout: int = 120,
    fast_threshold: float = DEFAULT_FAST_THRESHOLD,
    audit_threshold: float = DEFAULT_AUDIT_THRESHOLD,
    grounding_min_similarity: float = DEFAULT_GROUNDING_THRESHOLD,
    grounding_mean_similarity: float = DEFAULT_GROUNDING_MEAN_THRESHOLD,
) -> DecisionResult:
    """Instrada la decisione di audit sul modello appropriato (Laya System One o Embedding Grounding)."""
    if is_embedding_model(model):
        return decide_grounding_audit(
            report=report,
            draft=draft,
            base_url=base_url,
            model=model,
            timeout=timeout,
            min_similarity=grounding_min_similarity,
            mean_similarity=grounding_mean_similarity,
        )
    return decide_systemone_audit(
        report=report,
        draft=draft,
        base_url=base_url,
        model=model,
        timeout=timeout,
        fast_threshold=fast_threshold,
        audit_threshold=audit_threshold,
    )
