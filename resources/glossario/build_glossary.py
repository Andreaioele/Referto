#!/usr/bin/env python3
"""Costruisce glossario/hpo_glossario.json dalla Human Phenotype Ontology (HPO).

Fonti (licenza HPO: uso libero con citazione, https://hpo.jax.org/license):
  - hp.json: https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/hp.json
  - traduzione italiana: https://raw.githubusercontent.com/obophenotype/hpo-translations/main/babelon/hp-it.babelon.tsv

Uso:
  python glossario/build_glossary.py --hp-json hp.json --it-tsv hp-it.babelon.tsv

Tiene solo il ramo "Phenotypic abnormality" (HP:0000118), cioè segni, sintomi e
reperti: sono i termini che compaiono nei referti. Per ogni termine salva
nome inglese, sinonimi esatti, sinonimi "layperson" (parole comuni),
definizione inglese e, se c'è, il nome italiano con lo stato della traduzione
(OFFICIAL = revisionata, CANDIDATE = automatica non revisionata).
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

PHENOTYPIC_ABNORMALITY = "http://purl.obolibrary.org/obo/HP_0000118"
OBO_PREFIX = "http://purl.obolibrary.org/obo/HP_"
LAYPERSON = "http://purl.obolibrary.org/obo/hp#layperson"


def hp_id(uri: str) -> str:
    return "HP:" + uri.rsplit("_", 1)[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--hp-json", type=Path, required=True)
    parser.add_argument("--it-tsv", type=Path, required=True)
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).with_name("hpo_glossario.json")
    )
    args = parser.parse_args()

    graph = json.loads(args.hp_json.read_text(encoding="utf-8"))["graphs"][0]
    version = graph.get("meta", {}).get("version", "")

    children = defaultdict(list)
    for edge in graph["edges"]:
        if edge["pred"] == "is_a":
            children[edge["obj"]].append(edge["sub"])
    phenotypic: set[str] = set()
    stack = [PHENOTYPIC_ABNORMALITY]
    while stack:
        node = stack.pop()
        if node not in phenotypic:
            phenotypic.add(node)
            stack.extend(children[node])
    phenotypic.discard(PHENOTYPIC_ABNORMALITY)

    italian: dict[str, tuple[str, str]] = {}
    with args.it_tsv.open(encoding="utf-8") as source:
        for row in csv.DictReader(source, delimiter="\t"):
            if row["predicate_id"] == "rdfs:label" and row["translation_value"].strip():
                italian[row["subject_id"]] = (
                    row["translation_value"].strip(),
                    row["translation_status"].strip(),
                )

    terms = []
    for node in graph["nodes"]:
        uri = node.get("id", "")
        if uri not in phenotypic or not uri.startswith(OBO_PREFIX) or not node.get("lbl"):
            continue
        meta = node.get("meta", {})
        if meta.get("deprecated"):
            continue
        definition = (meta.get("definition") or {}).get("val", "").strip()
        exact, lay = [], []
        for synonym in meta.get("synonyms", []):
            value = synonym.get("val", "").strip()
            if not value:
                continue
            if synonym.get("synonymType") == LAYPERSON:
                lay.append(value)
            elif synonym.get("pred") == "hasExactSynonym":
                exact.append(value)
        term = {"id": hp_id(uri), "en": node["lbl"]}
        if hp_id(uri) in italian:
            term["it"], term["it_status"] = italian[hp_id(uri)]
        if definition:
            term["def_en"] = definition
        if lay:
            term["lay_en"] = lay
        if exact:
            term["syn_en"] = exact
        terms.append(term)

    terms.sort(key=lambda t: t["id"])
    payload = {
        "source": "Human Phenotype Ontology (HPO)",
        "source_url": "https://hpo.jax.org",
        "license": "https://hpo.jax.org/license",
        "hpo_version": version,
        "italian_source": "obophenotype/hpo-translations (babelon hp-it)",
        "terms": terms,
    }
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    with_it = sum(1 for t in terms if "it" in t)
    print(f"{len(terms)} termini ({with_it} con nome italiano) -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
