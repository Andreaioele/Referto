"""Glossario dei termini medici trovati nel referto.

I termini e le definizioni vengono dalla Human Phenotype Ontology (HPO, vedi
glossario/build_glossary.py): il modello non decide quali parole sono mediche
né cosa significano. Al modello chiediamo solo di riformulare in italiano
semplice la definizione HPO; il risultato viene salvato in
glossario/parole_salvate.json e riusato, così ogni termine si genera una volta.
"""

from __future__ import annotations

import json
import re
import threading
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, Iterable, List, Optional, Tuple

from performance_metrics import record_model_call

GLOSSARY_DIR = Path(__file__).resolve().parent / "glossario"
GLOSSARY_FILE = GLOSSARY_DIR / "hpo_glossario.json"
SAVED_FILE = GLOSSARY_DIR / "parole_salvate.json"
HPO_TERM_URL = "https://hpo.jax.org/browse/term/{id}"

MAX_TERMS = 15
MAX_NGRAM = 6
MIN_KEY_CHARS = 4
MAX_SIMPLE_CHARS = 400
# Corrispondenze troppo generiche o ambigue nei referti: "cutting" e
# "aspiration" sono quasi sempre gesti chirurgici, non i fenotipi HPO omonimi.
IGNORED_KEYS = {"pain", "dolore", "cutting", "aspiration", "aspirazione"}

SIMPLIFY_PROMPT = """Sei un assistente che spiega parole mediche a pazienti
italiani senza formazione sanitaria. Per ogni termine ricevi il nome e una
definizione di riferimento in inglese.

Per ciascun termine scrivi:
- "nome": il nome del termine in italiano, come lo scriverebbe un medico;
- "spiegazione": una o due frasi in italiano semplice (massimo 40 parole) che
  riformulano SOLO la definizione data.

Regole:
- non aggiungere cause, sintomi, gravità, esami, terapie o consigli;
- non rivolgerti al paziente e non dire che ha quella condizione;
- se usi una parola tecnica, spiegala tra parentesi.

Rispondi solo con un oggetto JSON nel formato
{"HP:0000001": {"nome": "...", "spiegazione": "..."}, ...}
"""

_saved_lock = threading.Lock()


def _normalize(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return " ".join(re.findall(r"[a-z0-9]+", ascii_text))


@lru_cache(maxsize=1)
def _load_glossary() -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str]]:
    """Restituisce (termini per id, indice da forma normalizzata a id)."""
    payload = json.loads(GLOSSARY_FILE.read_text(encoding="utf-8"))
    terms = {term["id"]: term for term in payload["terms"]}
    index: Dict[str, str] = {}
    for term in payload["terms"]:
        names = [term["en"], term.get("it", ""), *term.get("syn_en", []), *term.get("lay_en", [])]
        for name in names:
            key = _normalize(name)
            if len(key) >= MIN_KEY_CHARS and key not in IGNORED_KEYS:
                index.setdefault(key, term["id"])
    return terms, index


def find_terms(texts: Iterable[str], limit: int = MAX_TERMS) -> List[Dict[str, Any]]:
    """Trova i termini HPO nei testi, in ordine di comparsa, senza duplicati.

    Per ogni posizione prende la corrispondenza più lunga (fino a 6 parole),
    così "versamento pleurico" vince su "versamento".
    """
    terms, index = _load_glossary()
    found: Dict[str, str] = {}
    for text in texts:
        words = _normalize(text or "").split()
        i = 0
        while i < len(words) and len(found) < limit:
            for size in range(min(MAX_NGRAM, len(words) - i), 0, -1):
                key = " ".join(words[i:i + size])
                term_id = index.get(key)
                if term_id:
                    found.setdefault(term_id, key)
                    i += size
                    break
            else:
                i += 1
    return [_public_term(terms[term_id], matched) for term_id, matched in found.items()]


def _public_term(term: Dict[str, Any], matched: str = "") -> Dict[str, Any]:
    return {
        "id": term["id"],
        "en": term["en"],
        "it": term.get("it"),
        "it_status": term.get("it_status"),
        "lay_en": term.get("lay_en", [])[:3],
        "definition_en": term.get("def_en"),
        "source_url": HPO_TERM_URL.format(id=term["id"]),
        "matched": matched,
    }


def _read_saved() -> Dict[str, Dict[str, Any]]:
    try:
        return json.loads(SAVED_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _write_saved(saved: Dict[str, Dict[str, Any]]) -> None:
    SAVED_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SAVED_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(SAVED_FILE)


def _simplify_with_model(
    terms: List[Dict[str, Any]], base_url: str, model: str, timeout: int
) -> Dict[str, Dict[str, str]]:
    items = [
        {
            "id": term["id"],
            "nome_inglese": term["en"],
            "nome_italiano": term.get("it") or "",
            "definizione": term.get("definition_en") or term["en"],
        }
        for term in terms
    ]
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SIMPLIFY_PROMPT},
            {"role": "user", "content": json.dumps(items, ensure_ascii=False)},
        ],
        "stream": False,
        "format": "json",
        "think": False,
        "options": {"temperature": 0.0, "num_predict": 120 * len(items) + 200},
        "keep_alive": "30m",
    }
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.load(response)
    record_model_call(
        {
            "kind": "generative",
            "model": model,
            "stage": "Glossario: spiegazioni semplici",
            "endpoint": "/api/chat",
            "wall_duration_ms": round((perf_counter() - started) * 1000, 2),
            "prompt_eval_count": result.get("prompt_eval_count"),
            "eval_count": result.get("eval_count"),
        }
    )
    parsed = json.loads(result.get("message", {}).get("content", "") or "{}")
    simplified: Dict[str, Dict[str, str]] = {}
    for term in terms:
        entry = parsed.get(term["id"]) if isinstance(parsed, dict) else None
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("spiegazione", "")).strip()
        name = str(entry.get("nome", "")).strip()
        if text and len(text) <= MAX_SIMPLE_CHARS:
            simplified[term["id"]] = {"simple_it": text, "name_it": name}
    return simplified


def build_glossary(
    report: str,
    explanation: str,
    base_url: str,
    model: str,
    timeout: int,
) -> List[Dict[str, Any]]:
    """Termini del referto con spiegazione semplice, salvati per la consultazione.

    Se il modello non risponde o restituisce JSON non valido, i termini restano
    con la sola definizione HPO: il glossario non blocca mai la spiegazione.
    """
    terms = find_terms([report, explanation])
    if not terms:
        return []

    with _saved_lock:
        saved = _read_saved()
    missing = [term for term in terms if not saved.get(term["id"], {}).get("simple_it")]
    generated: Dict[str, Dict[str, str]] = {}
    if missing:
        try:
            generated = _simplify_with_model(missing, base_url, model, timeout)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
            generated = {}

    now = datetime.now().astimezone().isoformat(timespec="seconds")
    with _saved_lock:
        saved = _read_saved()
        for term in terms:
            entry = saved.get(term["id"], {"first_seen": now, "count": 0})
            if term["id"] in generated:
                entry.update(generated[term["id"]], model=model, generated_at=now)
            entry["last_seen"] = now
            entry["count"] = int(entry.get("count", 0)) + 1
            saved[term["id"]] = entry
            term.update(_saved_fields(entry))
        _write_saved(saved)
    return terms


def _saved_fields(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "simple_it": entry.get("simple_it"),
        "name_it": entry.get("name_it"),
        "simple_model": entry.get("model"),
        "first_seen": entry.get("first_seen"),
        "last_seen": entry.get("last_seen"),
        "count": entry.get("count", 0),
    }


def saved_terms() -> List[Dict[str, Any]]:
    """Tutte le parole incontrate nei referti analizzati, dalla più recente."""
    terms, _ = _load_glossary()
    with _saved_lock:
        saved = _read_saved()
    result = []
    for term_id, entry in saved.items():
        if term_id in terms:
            term = _public_term(terms[term_id])
            term.update(_saved_fields(entry))
            result.append(term)
    result.sort(key=lambda term: term.get("last_seen") or "", reverse=True)
    return result


@lru_cache(maxsize=1)
def glossary_info() -> Optional[Dict[str, Any]]:
    try:
        payload = json.loads(GLOSSARY_FILE.read_text(encoding="utf-8"))
    except OSError:
        return None
    return {key: payload.get(key) for key in ("source", "source_url", "license", "hpo_version")}
