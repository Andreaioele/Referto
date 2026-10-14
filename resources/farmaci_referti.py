"""Farmaci citati nei referti, collegati al prontuario ufficiale AIFA.

Referto non suggerisce farmaci né dosi: riporta solo quelli scritti nei
referti del paziente. Ogni campo estratto dal modello (nome, dose, frequenza,
motivo, citazione) viene tenuto solo se compare alla lettera nel referto;
altrimenti resta vuoto. Il collegamento ad AIFA è deterministico (principio
attivo o nome commerciale) e il foglietto illustrativo è il PDF ufficiale
della Banca Dati Farmaci AIFA, scaricato alla prima consultazione e poi
conservato in farmaci_cache/.
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, Iterable, List, Optional, Tuple

from performance_metrics import record_model_call

BASE_DIR = Path(__file__).resolve().parent
# I dati AIFA appartengono al backend (backend/data/): l'app Python li legge da lì.
BACKEND_DATA_DIR = BASE_DIR.parent / "backend" / "data"
AIFA_FILE = BACKEND_DATA_DIR / "aifa_farmaci.json"
LEAFLET_CACHE = BASE_DIR / "farmaci_cache"
USER_AGENT = "Referto-hackathon/0.1 (https://github.com/Andreaioele/Referto)"
MAX_PRODUCTS = 6
DOCUMENT_TYPES = {"FI": "Foglietto illustrativo", "RCP": "Riassunto delle caratteristiche del prodotto"}
USE_TYPES = [
    "in terapia",
    "prescritto o modificato",
    "sospeso",
    "somministrato durante esame o intervento",
    "citato",
]

# Sali, forme e alias dei nomi dei farmaci: stessi dati del servizio
# backend, così app e backend riconoscono gli stessi nomi.
NORMALIZATION_FILE = BACKEND_DATA_DIR / "normalizzazione.json"
_NORMALIZATION = json.loads(NORMALIZATION_FILE.read_text(encoding="utf-8"))

# Parole del principio attivo AIFA che indicano il sale o la forma: "METFORMINA
# CLORIDRATO" e "metformin" devono portare allo stesso principio attivo.
SALT_WORDS = set(_NORMALIZATION["parole_sale"])

# Nomi inglesi e marchi USA frequenti nei referti (MTSamples) che la sola
# normalizzazione non collega al principio attivo italiano.
ALIASES = dict(_NORMALIZATION["alias"])

EXTRACT_PROMPT = """Estrai dal documento medico i farmaci citati. Non aggiungere
farmaci che non sono scritti e non dare consigli.

Per ogni farmaco restituisci:
- "nome": il nome esattamente come è scritto nel documento;
- "principio_attivo": il principio attivo in italiano, se lo conosci, altrimenti "";
- "dose", "frequenza", "via": copiati alla lettera dal documento, oppure "";
- "motivo": il motivo per cui è dato, copiato alla lettera dal documento SOLO se
  è scritto; altrimenti "";
- "uso": uno tra "in terapia", "prescritto o modificato", "sospeso",
  "somministrato durante esame o intervento", "citato";
- "citazione": la frase del documento in cui compare, copiata alla lettera.

Escludi le sostanze a cui il paziente è allergico, i mezzi di contrasto e le
sostanze non farmacologiche. Rispondi solo con JSON: {"farmaci": [...]}"""


def normalize(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", (text or "").lower()).encode("ascii", "ignore").decode()
    return " ".join(re.findall(r"[a-z0-9]+(?:[.,/][0-9]+)?", ascii_text))


def inn_key(name: str) -> str:
    """Chiave che avvicina grafie inglesi e italiane dello stesso principio attivo.

    metformin / metformina, levothyroxine / levotiroxina, naproxen / naprossene,
    hydrochlorothiazide / idroclorotiazide diventano la stessa chiave.
    """
    key = re.sub(r"[^a-z]", "", normalize(name))
    for old, new in (("ph", "f"), ("th", "t"), ("ch", "c"), ("y", "i"), ("x", "ss"), ("k", "c"), ("h", "")):
        key = key.replace(old, new)
    key = re.sub(r"(.)\1+", r"\1", key)
    return re.sub(r"[aeiou]+$", "", key)


def _phrase_key(words: List[str]) -> str:
    # Parola per parola: "insulin glargine" e "insulina glargine" -> "insulin glargin".
    return " ".join(key for key in (inn_key(word) for word in words) if key)


def _component_keys(component: str) -> List[str]:
    words = normalize(component).split()
    keys = [_phrase_key(words)]
    stripped = [word for word in words if word not in SALT_WORDS]
    if stripped and stripped != words:
        keys.append(_phrase_key(stripped))
    return [key for key in keys if len(key) >= 4]


def _ingredient_label(pa: str) -> str:
    components = []
    for component in pa.split("/"):
        words = [word for word in component.lower().split() if word not in SALT_WORDS] or component.lower().split()
        components.append(" ".join(words))
    return " + ".join(components)


@lru_cache(maxsize=1)
def _aifa() -> Dict[str, Any]:
    payload = json.loads(AIFA_FILE.read_text(encoding="utf-8"))
    drugs = {drug["cod"]: drug for drug in payload["drugs"]}
    by_ingredient: Dict[str, List[str]] = defaultdict(list)
    by_brand: Dict[str, List[str]] = defaultdict(list)
    for drug in payload["drugs"]:
        components = [c for c in drug["pa"].split("/") if c.strip() and c.strip() != "N.D."]
        combo = "+".join(sorted(k for c in components for k in _component_keys(c)[-1:]))
        if combo:
            by_ingredient[combo].append(drug["cod"])
        by_brand[normalize(drug["nome"])].append(drug["cod"])
    return {
        "drugs": drugs,
        "by_ingredient": dict(by_ingredient),
        "by_brand": dict(by_brand),
        "link_template": payload["link_template"],
        "source": payload["source"],
        "built_on": payload["built_on"],
    }


def _ingredient_query_key(ingredient: str) -> str:
    return "+".join(sorted(k for c in ingredient.split("/") for k in _component_keys(c)[-1:]))


def _product_view(drug: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "cod": drug["cod"],
        "nome": drug["nome"],
        "ditta": drug["ditta"],
        "principio_attivo": _ingredient_label(drug["pa"]),
        "atc": drug["atc"],
        "forme": drug["forme"],
        "fornitura": drug["fornitura"],
        "confezioni": drug["confezioni"],
        "n_confezioni": drug["n_confezioni"],
        "foglietto_url": f"/api/farmaci/{drug['cod']}/foglietto?tipo=FI",
        "rcp_url": f"/api/farmaci/{drug['cod']}/foglietto?tipo=RCP",
    }


PARALLEL_IMPORT = "Importazione Parallela"
MAX_ALTERNATIVES = 200


def _without_parallel_imports(codes: Iterable[str]) -> List[Dict[str, Any]]:
    """Farmaci di riferimento: le importazioni parallele sono copie dello stesso
    medicinale di un'altra ditta e renderebbero ambiguo il nome."""
    drugs = [_aifa()["drugs"][code] for code in codes]
    reference = [drug for drug in drugs if drug.get("procedura") != PARALLEL_IMPORT]
    return reference or drugs


def _brand_candidates(name: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Nome commerciale italiano scritto nel referto, anche seguito dal dosaggio
    ("Brufen 600 mg" -> BRUFEN). Restituisce (nome trovato, farmaci con quel nome)."""
    data = _aifa()
    words = normalize(name).split()
    for size in range(len(words), 0, -1):
        if not words[size - 1].isalpha():
            continue
        brand = " ".join(words[:size])
        codes = data["by_brand"].get(brand)
        if not codes:
            continue
        drugs = _without_parallel_imports(codes)
        # Un farmaco che si chiama come il suo principio attivo (es. "LORAZEPAM")
        # è un generico: il nome non identifica il prodotto.
        if all(normalize(_ingredient_label(d["pa"])) == brand for d in drugs):
            return "", []
        return brand, drugs
    return "", []


def _ingredient_candidates(name: str, ingredient: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Farmaci con il principio attivo del referto. Restituisce (alias usato, farmaci)."""
    data = _aifa()
    for text in (ingredient, name):
        if not text:
            continue
        alias = ALIASES.get(normalize(text), "")
        for query in filter(None, (alias, text)):
            codes = data["by_ingredient"].get(_ingredient_query_key(query))
            if codes:
                return (alias if query == alias else ""), _without_parallel_imports(codes)
    return "", []


def lookup(name: str, ingredient: str = "") -> Optional[Dict[str, Any]]:
    """Collega un farmaco del referto a UN farmaco AIFA, solo se la corrispondenza è univoca.

    - Nome commerciale italiano con un solo farmaco di riferimento: univoco
      (es. "Brufen" -> BRUFEN di Viatris, principio attivo ibuprofene).
    - Solo principio attivo, marchio estero o nome con più farmaci: nessun
      farmaco scelto d'ufficio; si restituiscono le alternative tra cui il
      paziente sceglie il suo.
    - Principio attivo con un solo farmaco in commercio: univoco anche così.
    """
    brand, drugs = _brand_candidates(name)
    alias = ""
    kind = "nome commerciale"
    if not drugs:
        alias, drugs = _ingredient_candidates(name, ingredient)
        kind = "principio attivo"
    if not drugs:
        return None
    drugs = sorted(drugs, key=lambda d: (d["nome"], d["ditta"]))
    ingredient_label = _ingredient_label(drugs[0]["pa"])
    result: Dict[str, Any] = {
        "principio_attivo": ingredient_label,
        "atc": drugs[0]["atc"],
        "farmaco": None,
        "corrispondenza": "da scegliere",
        "perche": "",
        "alternative": [_product_view(drug) for drug in drugs[:MAX_ALTERNATIVES]],
        "alternative_totali": len(drugs),
    }
    if len(drugs) == 1:
        result["farmaco"] = result["alternative"][0]
        result["corrispondenza"] = kind if kind == "nome commerciale" else "unico con questo principio attivo"
    elif kind == "nome commerciale":
        result["perche"] = (
            f"In Italia ci sono {len(drugs)} farmaci di ditte diverse che si chiamano così: "
            "scegli quello della tua confezione (la ditta è scritta sulla scatola)."
        )
    elif alias:
        result["perche"] = (
            f"Nel referto è scritto «{name}», un nome (inglese o estero) che non indica un "
            f"farmaco preciso in Italia. Il principio attivo è {ingredient_label}: scegli il "
            "farmaco che usi per leggere il suo foglietto."
        )
    else:
        result["perche"] = (
            f"Nel referto c'è il principio attivo ({ingredient_label}), non il nome del farmaco. "
            f"In Italia ci sono {len(drugs)} farmaci con questo principio attivo: scegli quello che usi."
        )
    return result


def resolve_medication(item: Dict[str, Any]) -> Dict[str, Any]:
    """Il farmaco del referto con la corrispondenza AIFA ricalcolata e la scelta del paziente."""
    aifa = lookup(item.get("nome", ""), item.get("principio_attivo_modello", ""))
    choice = item.get("scelta")
    if aifa and choice and not aifa["farmaco"]:
        chosen = next((p for p in aifa["alternative"] if p["cod"] == choice), None)
        if chosen:
            aifa = {**aifa, "farmaco": chosen, "corrispondenza": "scelto da te"}
    return {**item, "aifa": aifa}


def valid_choice(item: Dict[str, Any], code: str) -> bool:
    aifa = lookup(item.get("nome", ""), item.get("principio_attivo_modello", ""))
    return bool(aifa and not aifa["farmaco"] and any(p["cod"] == code for p in aifa["alternative"]))


def search_catalog(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Ricerca libera nel prontuario AIFA per nome commerciale o principio attivo."""
    query_norm = normalize(query)
    if len(query_norm) < 3:
        return []
    query_key = inn_key(query)
    drugs = _aifa()["drugs"].values()
    exact, partial = [], []
    for drug in drugs:
        name = normalize(drug["nome"])
        ingredient = normalize(drug["pa"])
        if name == query_norm or (len(query_key) >= 4 and query_key in {k for c in drug["pa"].split("/") for k in _component_keys(c)}):
            exact.append(drug)
        elif query_norm in name or query_norm in ingredient:
            partial.append(drug)
    ranked = sorted(exact, key=lambda d: -d["n_confezioni"]) + sorted(partial, key=lambda d: d["nome"])
    return [_product_view(drug) for drug in ranked[:limit]]


def _grounded(value: Any, source: str) -> str:
    """Il valore se compare alla lettera nel referto (spazi e maiuscole a parte), altrimenti ""."""
    text = " ".join(str(value or "").split())
    if text and normalize(text) and normalize(text) in source:
        return text
    return ""


def _extract_with_model(report: str, base_url: str, model: str, timeout: int) -> List[Dict[str, Any]]:
    string = {"type": "string"}
    schema = {
        "type": "object",
        "properties": {
            "farmaci": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "nome": string, "principio_attivo": string, "dose": string,
                        "frequenza": string, "via": string, "motivo": string,
                        "uso": {"type": "string", "enum": USE_TYPES}, "citazione": string,
                    },
                    "required": ["nome"],
                },
            }
        },
        "required": ["farmaci"],
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": EXTRACT_PROMPT},
            {"role": "user", "content": report[:12000]},
        ],
        "stream": False,
        "think": False,
        "format": schema,
        "options": {"temperature": 0.0, "num_ctx": 16384, "num_predict": 1500},
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
            "stage": "Estrazione dei farmaci",
            "endpoint": "/api/chat",
            "wall_duration_ms": round((perf_counter() - started) * 1000, 2),
            "prompt_eval_count": result.get("prompt_eval_count"),
            "eval_count": result.get("eval_count"),
        }
    )
    parsed = json.loads(result.get("message", {}).get("content", "") or "{}")
    items = parsed.get("farmaci", []) if isinstance(parsed, dict) else []
    return [item for item in items if isinstance(item, dict)]


def _scan_text(report: str) -> List[Dict[str, Any]]:
    """Riserva senza modello: cerca nel testo principi attivi e alias noti."""
    data = _aifa()
    words = normalize(report).split()
    found: Dict[str, Dict[str, Any]] = {}
    for size in (2, 1):
        for i in range(len(words) - size + 1):
            phrase = " ".join(words[i:i + size])
            if len(phrase) < 5 or phrase in found or not all(w.isalpha() for w in words[i:i + size]):
                continue
            alias = ALIASES.get(phrase)
            key = _ingredient_query_key(alias or phrase)
            codes = data["by_ingredient"].get(key)
            # Solo principi attivi di farmaci veri (ATC diverso da V: omeopatici,
            # diagnostici, mezzi di contrasto), per evitare falsi positivi.
            if codes and (alias or any(not data["drugs"][c]["atc"].startswith("V") for c in codes)):
                found[phrase] = {
                    "nome": phrase,
                    "principio_attivo": alias or "",
                    "uso": "citato",
                    "citazione": _sentence_with(report, phrase),
                }
    return list(found.values())


def _sentence_with(report: str, phrase: str) -> str:
    """Estratto del referto intorno al farmaco, come citazione verificabile.

    Dal punto precedente al successivo, ma al massimo ~140 caratteri per lato:
    nei referti MTSamples le sezioni sono attaccate da virgole e una "frase"
    può essere lunghissima.
    """
    pattern = r"\b" + r"\W+".join(re.escape(word) for word in phrase.split()) + r"\b"
    match = re.search(pattern, report, re.IGNORECASE)
    if not match:
        return ""
    start = max(report.rfind(".", 0, match.start()) + 1, match.start() - 140)
    end = report.find(".", match.end())
    end = match.end() + 140 if end == -1 or end > match.end() + 140 else end + 1
    excerpt = " ".join(report[start:end].split()).strip(" ,")
    prefix = "…" if start > 0 and report[start - 1] != "." else ""
    suffix = "…" if end < len(report) and report[end - 1] != "." else ""
    return f"{prefix}{excerpt}{suffix}"


def extract_medications(
    report: str, base_url: str, model: str, timeout: int, use_model: bool = True
) -> Dict[str, Any]:
    source = normalize(report)
    items: List[Dict[str, Any]] = []
    method = "ricerca nel testo"
    if use_model:
        try:
            items = _extract_with_model(report, base_url, model, timeout)
            method = "modello"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
            items = []
    if method != "modello":
        items = _scan_text(report)
    else:
        # Il modello a volte salta le liste ("Medications include ..."): si
        # aggiungono i principi attivi che la ricerca nel testo trova e il
        # modello non ha restituito, senza dose (non verificabile da qui).
        known = {inn_key(str(i.get("nome", ""))) for i in items}
        known |= {
            (lookup(str(i.get("nome", "")), str(i.get("principio_attivo") or "")) or {}).get("principio_attivo")
            for i in items
        }
        extra = [
            i for i in _scan_text(report)
            if inn_key(i["nome"]) not in known
            and (lookup(i["nome"], i["principio_attivo"]) or {}).get("principio_attivo") not in known
        ]
        if extra:
            items = items + extra
            method = "modello + ricerca nel testo"

    medications: List[Dict[str, Any]] = []
    seen = set()
    for item in items:
        name = _grounded(item.get("nome"), source)
        if not name or normalize(name) in seen:
            continue  # nome non presente nel referto: scartato
        seen.add(normalize(name))
        medication = {
            "nome": name,
            "dose": _grounded(item.get("dose"), source),
            "frequenza": _grounded(item.get("frequenza"), source),
            "via": _grounded(item.get("via"), source),
            "motivo": _grounded(item.get("motivo"), source),
            "citazione": _grounded(item.get("citazione"), source),
            "uso": item.get("uso") if item.get("uso") in USE_TYPES else "citato",
            "principio_attivo_modello": str(item.get("principio_attivo") or "")[:80],
        }
        medications.append(resolve_medication(medication))
    return {"method": method, "items": medications}


def history_overview(reports: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Raggruppa i farmaci di tutti i referti: per farmaco AIFA quando la
    corrispondenza è univoca (o scelta dal paziente), altrimenti per nome scritto."""
    groups: Dict[str, Dict[str, Any]] = {}
    for report in reports:
        for index, raw in enumerate((report.get("medications") or {}).get("items", [])):
            medication = resolve_medication(raw)
            aifa = medication.get("aifa")
            product = (aifa or {}).get("farmaco")
            key = f"cod:{product['cod']}" if product else f"nome:{normalize(medication['nome'])}"
            group = groups.setdefault(key, {"chiave": key, "aifa": aifa, "menzioni": []})
            group["menzioni"].append(
                {
                    "trace_id": report["id"],
                    "indice": index,
                    "data": report.get("started_at"),
                    "referto": report.get("title") or report.get("source_name"),
                    "branca": (report.get("branch") or {}).get("label"),
                    **{k: medication.get(k, "") for k in ("nome", "dose", "frequenza", "via", "motivo", "uso", "citazione")},
                }
            )
    for group in groups.values():
        group["menzioni"].sort(key=lambda m: m.get("data") or "", reverse=True)
    return sorted(groups.values(), key=lambda g: g["menzioni"][0].get("data") or "", reverse=True)


class LeafletUnavailable(RuntimeError):
    pass


def leaflet_pdf(code: str, document_type: str = "FI") -> Path:
    """PDF ufficiale AIFA del foglietto (FI) o dell'RCP, con cache locale."""
    document_type = document_type.upper()
    data = _aifa()
    drug = data["drugs"].get(code)
    if drug is None or document_type not in DOCUMENT_TYPES:
        raise KeyError(code)
    path = LEAFLET_CACHE / f"{document_type}_{code}.pdf"
    if path.exists() and path.stat().st_size > 0:
        return path
    url = data["link_template"].format(ditta=drug["cod_ditta"], farmaco=int(code), tipo=document_type)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            content = response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise LeafletUnavailable("La Banca Dati Farmaci AIFA non risponde. Riprova tra poco.") from exc
    if not content.startswith(b"%PDF"):
        raise LeafletUnavailable("AIFA non ha restituito un PDF per questo farmaco.")
    LEAFLET_CACHE.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(content)
    temporary.replace(path)
    return path


def catalog_info() -> Dict[str, str]:
    data = _aifa()
    return {"source": data["source"], "built_on": data["built_on"], "farmaci": str(len(data["drugs"]))}
