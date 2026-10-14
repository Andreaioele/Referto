#!/usr/bin/env python3
"""Costruisce backend/data/aifa_farmaci.json dall'elenco ufficiale AIFA delle confezioni.

Fonte (AIFA, licenza CC BY 4.0, https://www.aifa.gov.it/open-data):
  https://drive.aifa.gov.it/farmaci/confezioni_fornitura.csv

Uso:
  python farmaci/build_aifa_index.py --csv confezioni_fornitura.csv   # da resources/

Raggruppa le confezioni autorizzate per farmaco (COD_FARMACO): ogni farmaco
ha nome commerciale, titolare, principi attivi, ATC, forme, regime di
fornitura e i link ufficiali a foglietto illustrativo (FI) e riassunto delle
caratteristiche del prodotto (RCP) della Banca Dati Farmaci AIFA.

I link FI/RCP seguono sempre lo schema LINK_TEMPLATE (verificato su tutte le
confezioni): non vengono salvati, si ricostruiscono da cod_ditta e cod.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

LINK_TEMPLATE = (
    "https://api.aifa.gov.it/aifa-bdf-eif-be/1.0.0/organizzazione/{ditta}/farmaci/{farmaco}/stampati?ts={tipo}"
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "backend" / "data" / "aifa_farmaci.json",
    )
    args = parser.parse_args()

    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    with args.csv.open(encoding="utf-8", errors="replace") as source:
        for row in csv.DictReader(source, delimiter=";"):
            if row["STATO_AMMINISTRATIVO"].strip() == "Autorizzata":
                groups[row["COD_FARMACO"].strip()].append(row)

    drugs = []
    for code, rows in groups.items():
        first = rows[0]
        expected_fi = LINK_TEMPLATE.format(ditta=first["CODICE_DITTA"].strip(), farmaco=int(code), tipo="FI")
        if first["LINK_FI"].strip() != expected_fi:
            raise SystemExit(f"Link FI fuori schema per il farmaco {code}: {first['LINK_FI']}")
        forms = Counter(row["FORMA"].strip() for row in rows if row["FORMA"].strip())
        supply = Counter(row["FORNITURA"].strip() for row in rows if row["FORNITURA"].strip())
        drugs.append(
            {
                "cod": code,
                "nome": first["DENOMINAZIONE"].strip(),
                "ditta": first["RAGIONE_SOCIALE"].strip(),
                "cod_ditta": first["CODICE_DITTA"].strip(),
                "pa": first["PA_ASSOCIATI"].strip(),
                "atc": first["CODICE_ATC"].strip(),
                # "Importazione Parallela": stesso medicinale importato da un'altra
                # ditta. Serve a riconoscere il farmaco di riferimento di un nome.
                "procedura": first["TIPO_PROCEDURA"].strip(),
                "forme": [form for form, _ in forms.most_common(4)],
                "fornitura": supply.most_common(1)[0][0] if supply else "",
                "confezioni": [row["DESCRIZIONE"].strip() for row in rows[:2]],
                "n_confezioni": len(rows),
            }
        )
    drugs.sort(key=lambda drug: (drug["nome"], drug["cod"]))
    payload = {
        "source": "AIFA - Agenzia Italiana del Farmaco, elenco confezioni (CC BY 4.0)",
        "source_url": "https://drive.aifa.gov.it/farmaci/confezioni_fornitura.csv",
        "built_on": date.today().isoformat(),
        "link_template": LINK_TEMPLATE,
        "drugs": drugs,
    }
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"{len(drugs)} farmaci autorizzati -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
