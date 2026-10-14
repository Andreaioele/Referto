#!/usr/bin/env python3
"""Carica su Evolus il prompt di un agente dal suo file in evolus/agenti/.

    python evolus/sincronizza_prompt.py evolus/agenti/mother.md

Legge l'agentId dall'intestazione del file e sostituisce solo il prompt: gli
altri campi dell'agente vengono rimandati con i valori attuali e, dopo
l'aggiornamento, si verifica che nessuno sia cambiato.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from carica_farmaci import API_BASE, load_headers, request  # noqa: E402

KEPT_FIELDS = [
    "name", "description", "language", "modelKey", "fallbackModelKeys", "ocrModelKey",
    "webSearchType", "serviceType", "routerWebSearch", "useAskStream", "isChatVisible",
    "fileToolsEnabled", "scriptToolEnabled",
]
IGNORED_IN_CHECK = {"prompt", "lastModifiedBy", "totalTokens"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("file", type=Path)
    args = parser.parse_args()

    _, header, body = args.file.read_text(encoding="utf-8").split("---\n", 2)
    match = re.search(r'^agentId:\s*"([0-9a-f-]{36})"', header, flags=re.MULTILINE)
    if not match:
        sys.exit(f"agentId non trovato nell'intestazione di {args.file}")
    agent_id, prompt = match.group(1), body.strip()

    headers = load_headers()
    url = f"{API_BASE}/agents/{agent_id}"
    before = request("GET", url, headers)
    if before["prompt"].strip() == prompt:
        print(f"{before['name']}: prompt già aggiornato.")
        return

    payload = {key: before[key] for key in KEPT_FIELDS if key in before}
    payload["prompt"] = prompt
    request("PUT", url, dict(headers, **{"Content-Type": "application/json"}),
            json.dumps(payload).encode("utf-8"))

    after = request("GET", url, headers)
    changed = sorted(k for k in set(before) | set(after)
                     if k not in IGNORED_IN_CHECK and before.get(k) != after.get(k))
    if after["prompt"].strip() != prompt or changed:
        sys.exit(f"Verifica fallita: prompt aggiornato={after['prompt'].strip() == prompt}, "
                 f"altri campi cambiati={changed}")
    print(f"{after['name']}: prompt aggiornato ({len(prompt)} caratteri).")


if __name__ == "__main__":
    main()
