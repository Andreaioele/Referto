"""Profilo del paziente: per ora solo la città, scelta alla creazione del profilo.

Serve a "Dove andare": la sezione si apre già sulla zona del paziente. Il file
profilo/profilo.json resta su questo computer (escluso da Git); a
OpenStreetMap va solo il nome della città, per trovarne le coordinate.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from strutture_sanitarie import geocode

PROFILE_FILE = Path(__file__).resolve().parent / "profilo" / "profilo.json"


def load_profile() -> Dict[str, Any]:
    try:
        return json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_city(city: str) -> Dict[str, Any]:
    """Salva la città con le sue coordinate. ValueError se non si trova."""
    place = geocode(city)
    profile = {
        **load_profile(),
        "citta": " ".join(city.split()).title(),
        "luogo": place,
        "aggiornato": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    PROFILE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = PROFILE_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(PROFILE_FILE)
    return profile
