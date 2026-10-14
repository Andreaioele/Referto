#!/usr/bin/env python3
"""Risultati di farmaci_referti.lookup() da confrontare con il servizio TypeScript.

    python scripts/casi_parita.py                 # casi scelti -> test/fixtures/parita.json
    python scripts/casi_parita.py --tutti FILE    # tutti i nomi del prontuario -> FILE

I casi scelti sono committati e usati dai test Jest; il confronto su tutti i
nomi si fa con `npm run parita:tutti` (vedi README). Il codice Python di
riferimento è resources/farmaci_referti.py.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# L'app Python di riferimento sta in resources/ nella radice del repository.
ROOT = Path(__file__).resolve().parents[2] / "resources"
sys.path.insert(0, str(ROOT))

import farmaci_referti  # noqa: E402

FIXTURE = Path(__file__).resolve().parents[1] / "test" / "fixtures" / "parita.json"

# (nome scritto nel referto, principio attivo indicato dall'agente)
CASI = [
    ("Cardioaspirin 100 mg", ""), ("Cardioaspirin", ""), ("Triatec 5 mg/die", ""), ("Lasix 25 mg", ""),
    ("Eutirox 75 mcg", ""), ("Coumadin", ""), ("Iomeron 350", ""), ("Brufen 600 mg", ""),
    ("Tachipirina", ""), ("Sintrom", ""), ("Pantorc", ""), ("Torvast", ""), ("Diflucan", ""),
    ("Augmentin", ""), ("Zytiga", ""), ("Verzenios", ""), ("Glucophage", ""), ("Lorazepam", ""),
    ("ramipril", ""), ("warfarin", ""), ("paracetamolo", ""), ("acido acetilsalicilico", ""),
    ("metformina cloridrato", ""), ("abemaciclib", ""), ("glipizide", ""), ("furosemide", ""),
    ("metformin", ""), ("ibuprofen", ""), ("levothyroxine", ""), ("insulin glargine", ""),
    ("hydrochlorothiazide", ""), ("naproxen", ""), ("Motrin", ""), ("Tylenol", ""), ("Plavix", ""),
    ("Lipitor 40 mg", ""), ("aspirin", ""), ("vitamin D", ""), ("Solu-Medrol", ""),
    ("Zentrolax", ""), ("farmaco inesistente xyz", ""), ("mezzo di contrasto", ""),
    ("terapia anticoagulante", ""), ("Xyz", "ramipril"), ("Pressotec", "ramipril"),
    ("ACIDO ACETILSALICILICO   MYLAN", ""), ("Cardioaspirina", ""), ("Sintron", ""),
]


def risultato(nome: str, principio_attivo: str) -> dict:
    esito = farmaci_referti.lookup(nome, principio_attivo)
    if esito is None:
        return {"nome": nome, "principio_attivo_richiesto": principio_attivo, "trovato": False}
    return {
        "nome": nome,
        "principio_attivo_richiesto": principio_attivo,
        "trovato": True,
        "principio_attivo": esito["principio_attivo"],
        "atc": esito["atc"],
        "corrispondenza": esito["corrispondenza"],
        "perche": esito["perche"],
        "farmaco": esito["farmaco"]["cod"] if esito["farmaco"] else None,
        "alternative": [prodotto["cod"] for prodotto in esito["alternative"][:5]],
        "alternative_totali": esito["alternative_totali"],
    }


def tutti_i_nomi() -> list[tuple[str, str]]:
    dati = json.loads(farmaci_referti.AIFA_FILE.read_text(encoding="utf-8"))
    nomi = {farmaco["nome"] for farmaco in dati["drugs"]}
    nomi |= {farmaco["pa"] for farmaco in dati["drugs"] if farmaco["pa"] and farmaco["pa"] != "N.D."}
    nomi |= set(farmaci_referti.ALIASES)
    return [(nome, "") for nome in sorted(nomi)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tutti", type=Path, help="confronta tutti i nomi del prontuario e scrive qui")
    args = parser.parse_args()
    casi = tutti_i_nomi() if args.tutti else CASI
    uscita = args.tutti or FIXTURE
    uscita.parent.mkdir(parents=True, exist_ok=True)
    risultati = [risultato(nome, principio) for nome, principio in casi]
    uscita.write_text(json.dumps(risultati, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(risultati)} casi -> {uscita}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
