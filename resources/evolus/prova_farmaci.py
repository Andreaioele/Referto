#!/usr/bin/env python3
"""Prova l'agente Referto Farmaci su Evolus.

Un referto a scelta:

    python evolus/prova_farmaci.py "Paziente in terapia con Cardioaspirin 100 mg."
    python evolus/prova_farmaci.py -f referto.txt

I casi di prova predefiniti, ripetuti N volte:

    python evolus/prova_farmaci.py --casi --ripeti 2

Per ogni risposta controlla che non ci siano ragionamenti prima della risposta,
che ogni "Fonte" citata esista davvero nella Conoscenza e, nei casi predefiniti, che
siano state trovate le schede attese.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional, Set

sys.path.insert(0, str(Path(__file__).resolve().parent))
from carica_farmaci import API_BASE, existing_titles, load_headers  # noqa: E402

AGENT_ID = "73a07892-eb3b-4865-8292-6cab19ea2292"
SUFFIX = " - scheda AIFA"

# (nome, referto, schede attese nella risposta). None = deve rispondere NESSUN_FARMACO.
CASI = [
    ("nomi commerciali",
     "RX TORACE. Paziente in terapia con Cardioaspirin 100 mg e Sintrom. "
     "Non si osservano addensamenti parenchimali. Seni costo-frenici liberi.",
     ["Acido acetilsalicilico", "Acenocumarolo"]),
    ("oncologico",
     "TC TORACE-ADDOME CON MDC. Paziente in trattamento con Zytiga e abemaciclib. "
     "Linfonodi di dimensioni non significative. Fegato senza lesioni focali.",
     ["Abiraterone acetato", "Abemaciclib"]),
    ("nome commerciale comune",
     "RX GINOCCHIO DX. Paziente in terapia con Tachipirina al bisogno. "
     "Lieve riduzione della rima articolare mediale.",
     ["Paracetamolo"]),
    # "Zentrolax" non esiste: l'agente deve dire che non ha informazioni, senza inventare.
    ("farmaco inesistente",
     "RX COLONNA LOMBARE. Paziente in terapia con Zentrolax 20 mg. "
     "Spondiloartrosi lombare.",
     []),
    ("nessun farmaco",
     "ECOGRAFIA ADDOME. Fegato di dimensioni nella norma con ecostruttura omogenea. "
     "Colecisti alitiasica. Vie biliari non dilatate.",
     None),
    ("solo esami di laboratorio",
     "ESAMI EMATOCHIMICI. Potassio 4.2 mmol/L. Ferro 45 ug/dL (L). Vitamina D 18 ng/mL (L).",
     None),
]


def ask(text: str, headers: dict) -> str:
    body = json.dumps({"content": text}).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/agents/{AGENT_ID}/ask", data=body, method="POST",
        headers=dict(headers, **{"Content-Type": "application/json"}),
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))["answer"]


def check(answer: str, rag_titles: Set[str], expected: Optional[List[str]]) -> List[str]:
    problems = []
    stripped = answer.strip()
    if not stripped.startswith(("FARMACI NEL REFERTO", "NESSUN_FARMACO")):
        problems.append("testo prima della risposta (ragionamenti trapelati?)")
    if stripped.count("FARMACI NEL REFERTO") > 1:
        problems.append("risposta ripetuta (bozza trapelata?)")
    if re.search(r"[　-鿿가-힯]", answer):
        problems.append("testo in cinese/giapponese/coreano")
    for source in re.findall(r"Fonte:\s*(.+?)(?:\.md)?\.?\s*$", answer, flags=re.MULTILINE):
        if source.strip() + ".md" not in rag_titles:
            problems.append(f"fonte inesistente nelle memorie: {source.strip()}")
    if expected is None:
        if stripped != "NESSUN_FARMACO":
            problems.append("atteso NESSUN_FARMACO")
    else:
        for name in expected:
            if name + SUFFIX not in answer:
                problems.append(f"scheda non trovata: {name}")
    return problems


def run(name: str, text: str, expected, headers, rag_titles) -> bool:
    start = time.time()
    try:
        answer = ask(text, headers)
    except (urllib.error.URLError, TimeoutError) as exc:
        detail = exc.read().decode("utf-8", "replace")[:200] if isinstance(exc, urllib.error.HTTPError) else exc
        print(f"\n=== {name}: ERRORE DI CHIAMATA ({time.time() - start:.0f}s) {detail}")
        return False
    problems = check(answer, rag_titles, expected)
    status = "OK" if not problems else "PROBLEMI"
    print(f"\n=== {name}: {status} ({time.time() - start:.0f}s)")
    for problem in problems:
        print(f"  - {problem}")
    print(answer)
    return not problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("referto", nargs="?", help="testo del referto")
    parser.add_argument("-f", "--file", type=Path, help="file di testo con il referto")
    parser.add_argument("--casi", action="store_true", help="esegue i casi di prova predefiniti")
    parser.add_argument("--ripeti", type=int, default=1)
    args = parser.parse_args()

    headers = load_headers()
    rag_titles = existing_titles(headers)
    print(f"{len(rag_titles)} schede distinte nella Conoscenza dell'agente.")

    if args.casi:
        cases = CASI
    elif args.file or args.referto:
        text = args.file.read_text(encoding="utf-8") if args.file else args.referto
        cases = [("referto", text, [])]
    else:
        parser.error("passa un referto, -f file oppure --casi")

    results = [run(name, text, expected, headers, rag_titles)
               for _ in range(args.ripeti) for name, text, expected in cases]
    print(f"\nRiepilogo: {sum(results)}/{len(results)} risposte senza problemi.")


if __name__ == "__main__":
    main()
