#!/usr/bin/env python3
"""Genera le schede dei farmaci per il RAG di Referto Farmaci dagli open data AIFA.

Crea un file Markdown per ogni principio attivo (o associazione di principi
attivi) con i nomi commerciali autorizzati in Italia (uno per riga), la
classificazione ATC, le forme farmaceutiche e il regime di fornitura. Se
disponibile, aggiunge le indicazioni autorizzate dai registri di monitoraggio
AIFA. Niente link, prezzi o dati amministrativi: non servono al paziente e i
link riempirebbero i chunk del RAG di testo inutile.

    python evolus/costruisci_schede_farmaci.py ~/Downloads/farmaci

Le schede finiscono in ``evolus/farmaci/``; poi si caricano con
``evolus/carica_farmaci.py``.
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List

OUTPUT_DIR = Path(__file__).resolve().parent / "farmaci"
TITLE_SUFFIX = " - scheda AIFA.md"
ATC_LEVELS = (1, 3, 4, 5, 7)


def read_csv(path: Path, skip_lines: int = 0) -> Iterable[Dict[str, str]]:
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    lines = text.splitlines()[skip_lines:]
    for row in csv.DictReader(lines, delimiter=";"):
        yield {(k or "").strip(): (v or "").strip() for k, v in row.items()}


def load_atc(path: Path) -> Dict[str, str]:
    return {row["CODICE_ATC"]: row["DESCRIZIONE"] for row in read_csv(path) if row.get("CODICE_ATC")}


def load_indications(path: Path) -> Dict[str, List[str]]:
    """Indicazioni autorizzate dei registri AIFA, per principio attivo in minuscolo."""
    indications: Dict[str, List[str]] = defaultdict(list)
    if not path.is_file():
        return indications
    for row in read_csv(path):
        active = row.get("Principio attivo", "").lower()
        text = row.get("Indicazione autorizzata", "")
        if active and text and text not in indications[active]:
            indications[active].append(text)
    return indications


def atc_hierarchy(code: str, atc: Dict[str, str]) -> List[str]:
    lines, seen = [], set()
    for length in ATC_LEVELS:
        prefix = code[:length]
        description = atc.get(prefix)
        if len(code) >= length and description and description not in seen:
            seen.add(description)
            lines.append(f"{prefix}: {description}")
    return lines


def file_title(active: str) -> str:
    clean = re.sub(r"[^\w\s,+()'-]", " ", active.capitalize(), flags=re.UNICODE)
    return re.sub(r"\s+", " ", clean).strip()[:120]


def build_document(active: str, rows: List[Dict[str, str]], atc: Dict[str, str],
                   indications: Dict[str, List[str]]) -> str:
    brands = sorted({re.sub(r"\s+", " ", r["DENOMINAZIONE"]).strip() for r in rows})
    atc_codes = sorted({r["CODICE_ATC"] for r in rows if r["CODICE_ATC"]})
    forms = sorted({r["FORMA"] for r in rows if r["FORMA"]})
    supply = sorted({r["FORNITURA"] for r in rows if r["FORNITURA"]})

    # Una riga per nome commerciale: in una lista unica il singolo nome pesa poco
    # nel vettore del chunk e la ricerca semantica non lo trova.
    parts = [
        f"# {active.capitalize()}",
        "",
        f"Principio attivo: {active}.",
        "",
        "## Nomi commerciali",
        *(f"{brand.title()} ({brand}) è un nome commerciale di un medicinale che "
          f"contiene {active.lower()}." for brand in brands),
        "",
        "Fonte: open data AIFA (elenco delle confezioni autorizzate e "
        "classificazione ATC). La scheda contiene solo dati anagrafici del "
        "medicinale: non contiene dosi, posologie o indicazioni sulla terapia di "
        "una persona.",
        "",
        "## Categoria del farmaco (classificazione ATC)",
    ]
    for code in atc_codes:
        parts.extend(atc_hierarchy(code, atc) or [code])
    parts += ["", "## Forme farmaceutiche", ", ".join(forms) + ".", "",
              "## Regime di fornitura", *supply]

    texts = indications.get(active.lower())
    if texts:
        parts += ["", "## Indicazioni autorizzate (registri di monitoraggio AIFA)", *texts]
    return "\n".join(parts) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dati", type=Path, help="cartella con i CSV AIFA")
    parser.add_argument("--uscita", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--solo", nargs="*", help="genera solo questi principi attivi (per prova)")
    args = parser.parse_args()

    atc = load_atc(args.dati / "atc.csv")
    registries = sorted(args.dati.glob("Elenco_Registri_PT_attivi_*.csv"))
    indications = load_indications(registries[-1]) if registries else {}

    by_active: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for row in read_csv(args.dati / "confezioni_fornitura.csv"):
        active = row.get("PA_ASSOCIATI", "")
        if row.get("STATO_AMMINISTRATIVO") == "Autorizzata" and active and active != "N.D.":
            by_active[active].append(row)

    # Grafie diverse dello stesso principio attivo ("A, B" / "A B") finiscono
    # nella stessa scheda invece di sovrascriversi.
    by_title: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    names: Dict[str, str] = {}
    for active, rows in sorted(by_active.items()):
        title = file_title(active)
        by_title[title].extend(rows)
        names.setdefault(title, active)

    wanted = {name.upper() for name in args.solo} if args.solo else None
    args.uscita.mkdir(parents=True, exist_ok=True)
    written = 0
    for title, rows in sorted(by_title.items()):
        active = names[title]
        if wanted is not None and active.upper() not in wanted:
            continue
        path = args.uscita / (title + TITLE_SUFFIX)
        path.write_text(build_document(active, rows, atc, indications), encoding="utf-8")
        written += 1
    print(f"{written} schede scritte in {args.uscita}")


if __name__ == "__main__":
    main()
