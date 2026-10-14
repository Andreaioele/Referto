"""Microservizio usage AMD Radeon API.

Solo libreria standard: nessuna dipendenza, container minuscolo.
Il token resta nel backend: il browser chiama /api/usage, mai l'API AMD direttamente.
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def load_dotenv(path):
    """Carica KEY="valore" da .env senza sovrascrivere variabili già presenti."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def unquote(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value.strip()


load_dotenv(Path(__file__).parent / ".env")

API_URL = unquote(os.environ.get(
    "AMD_USAGE_URL",
    "https://developer.amd.com.cn/radeon/api/v1/usage?include_recent=true",
))
TOKEN = unquote(os.environ.get("TOKEN", ""))
PORT = int(os.environ.get("PORT", "8080"))
INDEX = (Path(__file__).parent / "index.html").read_bytes()


def fetch_usage():
    if not TOKEN:
        return 500, {"error": "TOKEN mancante: copia .env.example in .env e inserisci il token"}
    req = urllib.request.Request(API_URL, headers={"Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return 200, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:500]
        return e.code, {"error": f"API AMD ha risposto {e.code}", "detail": body}
    except Exception as e:  # rete, timeout, JSON non valido
        return 502, {"error": "Chiamata all'API AMD fallita", "detail": str(e)}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, ctype):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self._send(200, INDEX, "text/html; charset=utf-8")
        elif path == "/api/usage":
            status, data = fetch_usage()
            self._send(status, json.dumps(data).encode(), "application/json")
        elif path == "/healthz":
            self._send(200, b"ok", "text/plain")
        else:
            self._send(404, b"not found", "text/plain")

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"Usage dashboard su http://0.0.0.0:{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
