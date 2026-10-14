#!/usr/bin/env python3
"""Carica le schede dei farmaci nella Conoscenza dell'agente Referto Farmaci su Evolus.

Metti i file nella cartella ``evolus/farmaci/`` e lancia:

    python evolus/carica_farmaci.py

Vengono caricati solo i file non ancora presenti nella memoria (confronto per
nome del file). Il nome del file diventa il titolo del documento, cioè la
"Fonte" citata dall'agente: usa nomi chiari, ad esempio
``Coumadin - foglietto illustrativo AIFA.pdf``.

Le credenziali si leggono da EVOLUS_API_KEY ed EVOLUS_APPLICATION_ID, oppure
dalla configurazione del server MCP "evolus" in ~/.claude.json.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict

API_BASE = "https://api.evolus.ai/api/v1"
# "Conoscenza — Referto Farmaci": la libreria personale dell'agente Referto Farmaci.
MEMORY_ID = "31469653-41c7-f111-bf5b-000d3aae6dc8"
DEFAULT_DIR = Path(__file__).resolve().parent / "farmaci"
ALLOWED_SUFFIXES = {".pdf", ".txt", ".md", ".docx", ".html", ".htm"}
MAX_ATTEMPTS = 10


def load_headers() -> Dict[str, str]:
    api_key = os.environ.get("EVOLUS_API_KEY")
    app_id = os.environ.get("EVOLUS_APPLICATION_ID")
    if not (api_key and app_id):
        config_path = Path.home() / ".claude.json"
        if config_path.is_file():
            config = json.loads(config_path.read_text(encoding="utf-8"))
            headers = config.get("mcpServers", {}).get("evolus", {}).get("headers", {})
            api_key = api_key or headers.get("X-ApiKey")
            app_id = app_id or headers.get("X-Application-Id")
    if not (api_key and app_id):
        sys.exit("Credenziali Evolus mancanti: imposta EVOLUS_API_KEY ed EVOLUS_APPLICATION_ID.")
    return {"X-ApiKey": api_key, "X-Application-Id": app_id}


def request(method: str, url: str, headers: Dict[str, str], body: bytes | None = None):
    """Chiamata all'API Evolus; sul limite di frequenza (429) aspetta e riprova."""
    for _ in range(MAX_ATTEMPTS):
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=300) as response:
                return json.loads(response.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise
            time.sleep(float(exc.headers.get("Retry-After") or 60))
    raise urllib.error.URLError("limite di frequenza Evolus: riprova più tardi")


def existing_titles(headers: Dict[str, str], memory_id: str = MEMORY_ID) -> set[str]:
    documents = request("GET", f"{API_BASE}/memories/{memory_id}/documents", headers)
    return {doc.get("title") for doc in documents or []}


def upload(path: Path, headers: Dict[str, str]) -> dict:
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode("utf-8")
    multipart_headers = dict(headers, **{"Content-Type": f"multipart/form-data; boundary={boundary}"})
    return request("POST", f"{API_BASE}/memories/{MEMORY_ID}/documents", multipart_headers, body)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("cartella", nargs="?", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--paralleli", type=int, default=2, help="caricamenti contemporanei")
    parser.add_argument("--elenco", action="store_true", help="mostra i documenti già caricati ed esce")
    args = parser.parse_args()

    headers = load_headers()
    already = existing_titles(headers)
    if args.elenco:
        for title in sorted(t for t in already if t):
            print(title)
        print(f"{len(already)} documenti nella memoria.")
        return

    files = sorted(p for p in args.cartella.iterdir() if p.is_file() and p.suffix.lower() in ALLOWED_SUFFIXES)
    if not files:
        sys.exit(f"Nessun file da caricare in {args.cartella}.")

    pending = [p for p in files if p.name not in already]
    print(f"{len(files) - len(pending)} già presenti, {len(pending)} da caricare.")

    def send(path: Path) -> str:
        try:
            doc = upload(path, headers)
        except urllib.error.HTTPError as exc:
            return f"ERRORE {exc.code}  {path.name}: {exc.read().decode('utf-8', 'replace')[:300]}"
        except urllib.error.URLError as exc:
            return f"ERRORE  {path.name}: {exc.reason}"
        return f"caricato      {path.name}  (id {doc.get('id')})"

    with ThreadPoolExecutor(max_workers=args.paralleli) as pool:
        for index, line in enumerate(pool.map(send, pending), 1):
            print(f"[{index}/{len(pending)}] {line}", flush=True)
    print("Caricamento finito: Evolus indicizza i documenti in background.")


if __name__ == "__main__":
    main()
