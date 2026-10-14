"""Branca specialistica del referto e strutture sanitarie nella zona del paziente.

1. classify_report(): assegna il referto a una branca (cardiologia,
   radiologia, ...). Prova con il modello, vincolato a un elenco chiuso, e se
   non risponde usa le parole chiave.
2. geocode(): da città o indirizzo a coordinate (Nominatim, OpenStreetMap).
3. find_facilities(): strutture vicine da OpenStreetMap (Overpass), filtrate
   per branca e ordinate per pertinenza e distanza.

Ai servizi OpenStreetMap vanno solo zona e coordinate, mai il testo del
referto. Le risposte sono salvate in strutture_cache/ e riusate: così una
zona già cercata funziona anche quando Overpass è sovraccarico.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, List, Optional

from performance_metrics import record_model_call

CACHE_DIR = Path(__file__).resolve().parent / "strutture_cache"
USER_AGENT = "Referto-hackathon/0.1 (https://github.com/Andreaioele/Referto)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    # Mirror che il 13/10/2026 rispondeva mentre il server principale dava 504.
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
OVERPASS_TIMEOUT = 25
MAX_FACILITIES = 200
DEFAULT_BRANCH = "medicina-generale"

# id, nome, valori OSM di healthcare:speciality, radici nel nome della
# struttura, parole del referto (normalizzate, senza accenti) che indicano la branca.
BRANCHES: List[Dict[str, Any]] = [
    {
        "id": "radiologia", "label": "Radiologia e diagnostica per immagini",
        "osm": ["radiology", "diagnostic_radiology", "nuclear_medicine"],
        "name": ["radiolog", "diagnostica per immagini", "imaging", "risonanz", "ecograf"],
        "report": ["radiograph", "x-ray", "x ray", "ct scan", "ct of", "mri", "ultrasound", "radiologia",
                   "radiografia", "rx ", "tc ", " tac ", "risonanza", "ecografia", "proiezione", "mammograph",
                   "mammografia", "impression", "findings", "contrast"],
    },
    {
        "id": "cardiologia", "label": "Cardiologia",
        "osm": ["cardiology"],
        "name": ["cardiolog", "cuore", "cardio"],
        "report": ["cardiac", "heart", "echocardiogra", "ejection fraction", "atrial", "ventric", "coronary",
                   "cardio", "ecg", "ekg", "mitral", "aortic valve", "cuore", "cardiaco", "cardiaca",
                   "ecocardiogra", "frazione di eiezione", "coronar", " atrio ", "ventricol", "elettrocardiogra"],
    },
    {
        "id": "pneumologia", "label": "Pneumologia",
        "osm": ["pulmonology", "pneumology"],
        "name": ["pneumolog", "polmon", "respirator"],
        "report": ["pulmonary function", "spirometr", "copd", "asthma", "bronch", "pneumolog", "spirometria",
                   "broncopneumopatia", " asma "],
    },
    {
        "id": "ortopedia", "label": "Ortopedia e traumatologia",
        "osm": ["orthopaedics", "orthopedics", "trauma"],
        "name": ["ortoped", "traumatolog", "fisiatr"],
        "report": ["fracture", "orthopedic", "knee", " hip ", "shoulder", " spine", "lumbar", "meniscus",
                   "ligament", "tendon", "arthroplasty", "frattura", "ginocchio", " anca ", "spalla", "menisco",
                   "legamento", "tendine", "colonna", "lombare", "ortoped"],
    },
    {
        "id": "neurologia", "label": "Neurologia",
        "osm": ["neurology", "neurosurgery"],
        "name": ["neurolog", "neurochirurg"],
        "report": ["neurolog", "seizure", "headache", "migraine", "stroke", "brain", "eeg", "multiple sclerosis",
                   "neuropathy", "cerebral", "cervello", "cerebrale", "ictus", "emicrania", "epilessia",
                   "encefalo", "neuropatia"],
    },
    {
        "id": "gastroenterologia", "label": "Gastroenterologia ed endoscopia digestiva",
        "osm": ["gastroenterology", "hepatology"],
        "name": ["gastroenterolog", "endoscop", "epatolog"],
        "report": ["colonoscop", "endoscop", "egd", "gastr", "liver", "colon", "bowel", "esophag", "duoden",
                   "colonscopia", "gastroscopia", "fegato", "intestin", "esofag", "stomaco"],
    },
    {
        "id": "urologia", "label": "Urologia",
        "osm": ["urology", "andrology"],
        "name": ["urolog", "androlog"],
        "report": ["urolog", "prostat", "bladder", "kidney stone", "ureter", "cystoscop", "vasectomy",
                   "vescica", "prostata", "calcolo renale", "uretere", "cistoscopia"],
    },
    {
        "id": "nefrologia", "label": "Nefrologia",
        "osm": ["nephrology", "dialysis"],
        "name": ["nefrolog", "dialisi"],
        "report": ["renal failure", "kidney disease", "dialysis", "creatinine", "nephro", "insufficienza renale",
                   "dialisi", "creatinina", "nefro"],
    },
    {
        "id": "ginecologia", "label": "Ginecologia e ostetricia",
        "osm": ["gynaecology", "gynecology", "obstetrics"],
        "name": ["ginecolog", "ostetric", "consultorio"],
        "report": ["pregnan", "uterus", "uterine", "ovar", "cesarean", "gynecolog", "obstetric", "pap smear",
                   "gravidanza", " utero", " ovaio", "ovaie", "cesareo", "ginecolog", "ostetric", "pap test"],
    },
    {
        "id": "oncologia", "label": "Oncologia",
        "osm": ["oncology", "radiotherapy", "haematology", "hematology"],
        "name": ["oncolog", "tumori", "radioterapi", "ematolog"],
        "report": ["oncolog", "chemotherap", "carcinoma", "metasta", "lymphoma", "malignan", "neoplas",
                   "chemioterapia", "metastas", "linfoma", "neoplasia", "tumore maligno"],
    },
    {
        "id": "dermatologia", "label": "Dermatologia",
        "osm": ["dermatology", "dermatovenereology"],
        "name": ["dermatolog"],
        "report": ["dermatolog", "skin lesion", "rash", "melanoma", "nevus", "eczema", "psoriasis", " cute ",
                   "neo ", "nevo", "dermatite", "psoriasi"],
    },
    {
        "id": "otorinolaringoiatria", "label": "Otorinolaringoiatria",
        "osm": ["otolaryngology", "otorhinolaryngology", "ent"],
        "name": ["otorino", "orl"],
        "report": ["tonsil", "sinus", "otitis", "larynx", "hearing", "adenoid", "otolaryng", "tonsille",
                   "seni paranasali", "otite", "laringe", "udito", "otorino"],
    },
    {
        "id": "oculistica", "label": "Oculistica",
        "osm": ["ophthalmology", "optometry"],
        "name": ["oculist", "oftalmolog", "ottic"],
        "report": ["cataract", "retina", "glaucoma", "ophthalm", "visual acuity", "cornea", "cataratta",
                   "oculist", "oftalm", "acuita visiva"],
    },
    {
        "id": "endocrinologia", "label": "Endocrinologia e diabetologia",
        "osm": ["endocrinology", "diabetology"],
        "name": ["endocrinolog", "diabetolog"],
        "report": ["thyroid", "diabetes", "insulin", "endocrin", "hba1c", "tiroide", "diabete", "insulina",
                   "endocrin", "emoglobina glicata"],
    },
    {
        "id": "psichiatria", "label": "Psichiatria e psicologia",
        "osm": ["psychiatry", "psychology", "psychotherapy"],
        "name": ["psichiatr", "psicolog", "salute mentale", "csm"],
        "report": ["psychiatr", "depression", "anxiety", "bipolar", "schizophren", "psycholog",
                   "neuropsycholog", "psichiatr", "depressione", "ansia", "psicolog"],
    },
    {
        "id": "pediatria", "label": "Pediatria",
        "osm": ["paediatrics", "pediatrics"],
        "name": ["pediatr"],
        "report": ["pediatric", "infant", "newborn", " child", "pediatr", "neonat", "bambino", "bambina"],
    },
    {
        "id": "laboratorio", "label": "Laboratorio analisi",
        "osm": ["laboratory", "clinical_pathology", "pathology"],
        "healthcare": ["laboratory", "sample_collection", "blood_donation"],
        "name": ["laboratorio", "analisi cliniche", "punto prelievi", "prelievi"],
        "report": ["hemoglobin", "hematocrit", "platelets", "white blood cell", "glucose", "cholesterol",
                   "emocromo", "emoglobina", "piastrine", "globuli", "glicemia", "colesterolo", "mg/dl",
                   "valori di riferimento", "analisi del sangue"],
    },
    {
        "id": "chirurgia", "label": "Chirurgia generale",
        "osm": ["surgery", "general_surgery"],
        "name": ["chirurg"],
        "report": ["preoperative diagnosis", "postoperative diagnosis", "procedure in detail", "incision",
                   "anesthesia", "sutur", "laparoscop", "hernia", "diagnosi preoperatoria", "intervento",
                   "incisione", "anestesia", "sutura", "laparoscop", "ernia"],
    },
    {
        "id": DEFAULT_BRANCH, "label": "Medicina generale",
        "osm": ["general", "general_practice", "internal_medicine", "family_medicine"],
        "name": ["medico di base", "medicina generale", "poliambulatorio", "medicina interna"],
        "report": [],
    },
]
BRANCHES_BY_ID = {branch["id"]: branch for branch in BRANCHES}

CLASSIFY_PROMPT = """Classifica un documento medico nella branca specialistica
a cui appartiene: la specialità che di norma produce o segue quel tipo di
documento. Non fare diagnosi e non valutare l'urgenza.
Rispondi solo con JSON nel formato {"branca": "<id>", "motivo": "<massimo 15 parole>"}.
Valori ammessi per "branca": """


class FacilitiesUnavailable(RuntimeError):
    """Il servizio OpenStreetMap non ha risposto e non c'è una copia in cache."""


def _normalize(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return " " + re.sub(r"\s+", " ", ascii_text) + " "


def branch_view(branch_id: str) -> Dict[str, str]:
    branch = BRANCHES_BY_ID.get(branch_id, BRANCHES_BY_ID[DEFAULT_BRANCH])
    return {"id": branch["id"], "label": branch["label"]}


def keyword_branch(text: str) -> Dict[str, Any]:
    """Branca con più parole chiave nel testo; a parità vince la prima in elenco."""
    normalized = _normalize(text)
    best_id, best_score = DEFAULT_BRANCH, 0
    for branch in BRANCHES:
        score = sum(normalized.count(keyword) for keyword in branch["report"])
        if score > best_score:
            best_id, best_score = branch["id"], score
    return {**branch_view(best_id), "method": "parole chiave", "score": best_score}


def _classify_with_model(text: str, base_url: str, model: str, timeout: int) -> Dict[str, Any]:
    ids = [branch["id"] for branch in BRANCHES]
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": CLASSIFY_PROMPT + ", ".join(ids)},
            {"role": "user", "content": text[:6000]},
        ],
        "stream": False,
        "think": False,
        "format": {
            "type": "object",
            "properties": {"branca": {"type": "string", "enum": ids}, "motivo": {"type": "string"}},
            "required": ["branca"],
        },
        "options": {"temperature": 0.0, "num_predict": 80},
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
            "stage": "Classificazione della branca",
            "endpoint": "/api/chat",
            "wall_duration_ms": round((perf_counter() - started) * 1000, 2),
            "prompt_eval_count": result.get("prompt_eval_count"),
            "eval_count": result.get("eval_count"),
        }
    )
    parsed = json.loads(result.get("message", {}).get("content", "") or "{}")
    branch_id = parsed.get("branca") if isinstance(parsed, dict) else None
    if branch_id not in BRANCHES_BY_ID:
        raise ValueError(f"branca non valida: {branch_id!r}")
    return {**branch_view(branch_id), "method": "modello", "reason": str(parsed.get("motivo", ""))[:200]}


def classify_report(
    report: str, base_url: str, model: str, timeout: int, use_model: bool = True
) -> Dict[str, Any]:
    if use_model:
        try:
            return _classify_with_model(report, base_url, model, timeout)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
            pass
    return keyword_branch(report)


def _cache_path(kind: str, key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
    return CACHE_DIR / kind / f"{digest}.json"


def _cache_read(kind: str, key: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(_cache_path(kind, key).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _cache_write(kind: str, key: str, value: Dict[str, Any]) -> None:
    path = _cache_path(kind, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def _http_get_json(url: str, timeout: int, data: Optional[bytes] = None) -> Any:
    request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def geocode(query: str) -> Dict[str, Any]:
    """Coordinate di una città o di un indirizzo in Italia (Nominatim)."""
    query = " ".join(query.split())
    if len(query) < 2:
        raise ValueError("Scrivi una città o un indirizzo.")
    key = query.lower()
    cached = _cache_read("geocode", key)
    if cached:
        return cached
    base = {"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "it", "accept-language": "it"}
    results = []
    try:
        # Prima un comune (featureType=city): "Ferrara" altrimenti diventa il centro della
        # provincia, a 20 km dalla città. Poi la ricerca libera (indirizzi).
        for extra in ({"featureType": "city"}, {}):
            params = urllib.parse.urlencode({**base, **extra})
            results = _http_get_json(f"{NOMINATIM_URL}?{params}", timeout=15)
            if results:
                break
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise FacilitiesUnavailable("Il servizio di ricerca degli indirizzi non risponde.") from exc
    if not results:
        raise ValueError(f"Non trovo «{query}». Prova con il nome della città.")
    place = {
        "lat": float(results[0]["lat"]),
        "lon": float(results[0]["lon"]),
        "label": results[0].get("display_name", query),
    }
    _cache_write("geocode", key, place)
    return place


def _overpass_query(lat: float, lon: float, radius_m: int) -> str:
    # Filtri solo sui tag (niente regex sul nome): la query resta leggera per
    # il server; il filtro per branca si fa qui in Python.
    area = f"(around:{radius_m},{lat:.5f},{lon:.5f})"
    return (
        f"[out:json][timeout:{OVERPASS_TIMEOUT}];("
        f'nwr{area}["healthcare"];'
        f'nwr{area}["amenity"~"^(clinic|doctors|hospital)$"];'
        ");out center tags;"
    )


def _fetch_elements(lat: float, lon: float, radius_km: int) -> Dict[str, Any]:
    # Coordinate arrotondate a ~100 m: ricerche dalla stessa zona riusano la cache.
    key = f"{lat:.3f},{lon:.3f},{radius_km}"
    cached = _cache_read("overpass", key)
    if cached:
        return {**cached, "cached": True}
    data = urllib.parse.urlencode(
        {"data": _overpass_query(round(lat, 3), round(lon, 3), radius_km * 1000)}
    ).encode()
    errors = []
    # Al massimo ~1,5 minuti: il server principale due volte, i mirror una.
    for attempt, url in enumerate((*OVERPASS_URLS, OVERPASS_URLS[0])):
        try:
            payload = _http_get_json(url, timeout=OVERPASS_TIMEOUT + 10, data=data)
            entry = {
                "elements": payload.get("elements", []),
                "fetched_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "osm_timestamp": payload.get("osm3s", {}).get("timestamp_osm_base"),
            }
            _cache_write("overpass", key, entry)
            return {**entry, "cached": False}
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            errors.append(f"{url}: {exc}")
            time.sleep(2)
    raise FacilitiesUnavailable(
        "OpenStreetMap è sovraccarico e questa zona non è ancora in cache. Riprova tra qualche minuto."
    )


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# Strutture "di contorno": compaiono nell'elenco completo come altri studi e
# ambulatori della zona anche se non dichiarano la branca. Farmacie, dentisti,
# ottici ecc. no, a meno che la branca li indichi esplicitamente.
GENERAL_KINDS = {"doctor", "doctors", "clinic", "centre"}
KIND_LABELS = {
    "hospital": "Ospedale o casa di cura",
    "clinic": "Poliambulatorio o ambulatorio",
    "centre": "Centro sanitario",
    "doctor": "Studio medico",
    "doctors": "Studio medico",
    "laboratory": "Laboratorio analisi",
    "sample_collection": "Punto prelievi",
    "optometrist": "Ottico o optometrista",
    "dentist": "Studio dentistico",
    "physiotherapist": "Fisioterapista",
    "psychotherapist": "Psicoterapeuta",
    "pharmacy": "Farmacia",
}


def _kind(tags: Dict[str, str]) -> str:
    return tags.get("healthcare") or tags.get("amenity") or "struttura"


def _match(tags: Dict[str, str], branch: Dict[str, Any]) -> Optional[str]:
    """Quanto la struttura è pertinente: specialità dichiarata > nome > ospedale > altro."""
    specialities = {s.strip().lower() for s in tags.get("healthcare:speciality", "").split(";") if s.strip()}
    if specialities & set(branch["osm"]) or tags.get("healthcare") in branch.get("healthcare", []):
        return "specialita"
    name = _normalize(tags.get("name", ""))
    if any(keyword in name for keyword in branch["name"]):
        return "nome"
    if tags.get("amenity") == "hospital" or tags.get("healthcare") == "hospital":
        return "ospedale"
    # Specialità sconosciuta: forse se ne occupa. Specialità diversa dichiarata: no.
    if _kind(tags) in GENERAL_KINDS and not specialities:
        return "altro"
    return None


# Specialità OSM frequenti che non sono una branca dell'elenco, in italiano.
OSM_SPECIALITY_IT = {
    "vaccination": "vaccinazioni", "dentistry": "odontoiatria", "orthodontics": "ortodonzia",
    "podiatry": "podologia", "physiotherapy": "fisioterapia", "sports_medicine": "medicina dello sport",
    "emergency": "pronto soccorso", "geriatrics": "geriatria", "rheumatology": "reumatologia",
    "allergology": "allergologia", "infectious_diseases": "malattie infettive",
    "occupational": "medicina del lavoro", "anaesthetics": "anestesia", "plastic_surgery": "chirurgia plastica",
    "vascular_surgery": "chirurgia vascolare", "rehabilitation": "riabilitazione",
    "dental_oral_maxillo_facial_surgery": "chirurgia maxillo-facciale", "blood_check": "prelievi",
    "speech_therapy": "logopedia", "nutrition": "nutrizione", "abortion": "interruzione di gravidanza",
}


def _speciality_labels(tags: Dict[str, str]) -> List[str]:
    """Specialità dichiarate in OSM, in italiano quando corrispondono a una branca."""
    labels = []
    for value in (s.strip().lower() for s in tags.get("healthcare:speciality", "").split(";")):
        if not value:
            continue
        branch = next((b for b in BRANCHES if value in b["osm"]), None)
        label = branch["label"] if branch else OSM_SPECIALITY_IT.get(value, value.replace("_", " "))
        if label not in labels:
            labels.append(label)
    return labels


def _address(tags: Dict[str, str]) -> str:
    street = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
    city = tags.get("addr:city") or tags.get("addr:place") or ""
    return ", ".join(filter(None, [street, city]))


def find_facilities(lat: float, lon: float, branch_id: str, radius_km: int = 10) -> Dict[str, Any]:
    branch = BRANCHES_BY_ID.get(branch_id, BRANCHES_BY_ID[DEFAULT_BRANCH])
    radius_km = max(1, min(int(radius_km), 30))
    fetched = _fetch_elements(lat, lon, radius_km)
    order = {"specialita": 0, "nome": 1, "ospedale": 2, "altro": 3}
    facilities = []
    for element in fetched["elements"]:
        tags = element.get("tags", {})
        if not tags.get("name"):
            continue
        match = _match(tags, branch)
        if not match:
            continue
        point = element if "lat" in element else element.get("center", {})
        if "lat" not in point:
            continue
        facilities.append(
            {
                "name": tags["name"],
                "kind": _kind(tags),
                "kind_label": KIND_LABELS.get(_kind(tags), "Struttura sanitaria"),
                "specialita": _speciality_labels(tags),
                "match": match,
                "lat": point["lat"],
                "lon": point["lon"],
                "distance_km": round(_distance_km(lat, lon, point["lat"], point["lon"]), 2),
                "address": _address(tags),
                "phone": tags.get("phone") or tags.get("contact:phone"),
                "website": tags.get("website") or tags.get("contact:website"),
                "osm_url": f"https://www.openstreetmap.org/{element['type']}/{element['id']}",
            }
        )
    facilities.sort(key=lambda item: (order[item["match"]], item["distance_km"]))
    return {
        "branch": branch_view(branch["id"]),
        "center": {"lat": lat, "lon": lon},
        "radius_km": radius_km,
        "facilities": facilities[:MAX_FACILITIES],
        "total_matches": len(facilities),
        "cached": fetched["cached"],
        "fetched_at": fetched.get("fetched_at"),
        "source": "OpenStreetMap (ODbL)",
    }


def main() -> int:
    """Precarica una zona nella cache, così in demo la mappa non dipende da Overpass."""
    import argparse

    parser = argparse.ArgumentParser(description=main.__doc__)
    parser.add_argument("luogo", help="Città o indirizzo, es. \"Milano\"")
    parser.add_argument("--raggio", type=int, default=10, help="Raggio in km (default 10)")
    args = parser.parse_args()
    place = geocode(args.luogo)
    result = find_facilities(place["lat"], place["lon"], DEFAULT_BRANCH, args.raggio)
    print(f"{place['label']}: zona in cache ({'già presente' if result['cached'] else 'scaricata ora'})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
