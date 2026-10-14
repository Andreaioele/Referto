"""Client minimale per AMD Token Factory (endpoint compatibile OpenAI).

Un modello viene instradato su Token Factory quando il nome inizia con
``tokenfactory/``, ad esempio ``tokenfactory/DeepSeek-V4-Flash``. La chiave viene
letta da ``RADEON_API_KEY`` (variabile d'ambiente o file ``.env`` del progetto).
"""

from __future__ import annotations

import json
import os
import random
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

MODEL_PREFIX = "tokenfactory/"
DEFAULT_BASE_URL = "https://developer.amd.com.cn/radeon/api/v1"
ENV_FILE = Path(__file__).resolve().parent / ".env"
RETRYABLE_STATUS = {429, 502, 503}
MAX_ATTEMPTS = 5

IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}

_env_loaded = False


class TokenFactoryError(RuntimeError):
    """Errore di configurazione o di chiamata verso Token Factory."""


def load_env_file(path: Path = ENV_FILE) -> None:
    """Carica KEY=VALUE da .env senza sovrascrivere le variabili gia' definite."""
    global _env_loaded
    if _env_loaded:
        return
    _env_loaded = True
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def is_tokenfactory_model(model: str) -> bool:
    return str(model).startswith(MODEL_PREFIX)


def remote_model_name(model: str) -> str:
    return str(model)[len(MODEL_PREFIX):] if is_tokenfactory_model(model) else str(model)


def base_url() -> str:
    load_env_file()
    return (os.environ.get("RADEON_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def _api_key() -> str:
    load_env_file()
    key = os.environ.get("RADEON_API_KEY", "").strip()
    if not key:
        raise TokenFactoryError(
            "Manca RADEON_API_KEY: aggiungila al file .env del progetto per usare Token Factory."
        )
    return key


def image_data_url(image_path: Path, encoded: str) -> str:
    mime = IMAGE_MIME_TYPES.get(image_path.suffix.lower(), "image/png")
    return f"data:{mime};base64,{encoded}"


def build_messages(
    system_prompt: str,
    user_prompt: str,
    image_urls: Optional[Sequence[str]] = None,
) -> List[Dict[str, Any]]:
    user_content: Any = user_prompt
    if image_urls:
        user_content = [{"type": "text", "text": user_prompt}] + [
            {"type": "image_url", "image_url": {"url": url}} for url in image_urls
        ]
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]


def _error_detail(exc: urllib.error.HTTPError) -> str:
    raw = exc.read().decode("utf-8", errors="replace")
    try:
        body = json.loads(raw)
        error = body.get("error") or body.get("detail", {}).get("error") or {}
        message = error.get("message") if isinstance(error, dict) else None
        if message:
            return str(message)[:500]
    except (ValueError, AttributeError):
        pass
    return raw[:500]


def _retry_delay(exc: urllib.error.HTTPError, attempt: int) -> float:
    retry_after = exc.headers.get("Retry-After") if exc.headers else None
    try:
        delay = float(retry_after) if retry_after else 2.0 ** attempt
    except ValueError:
        delay = 2.0 ** attempt
    return min(delay, 60.0) + random.uniform(0, 1)


def chat_completion(
    model: str,
    messages: List[Dict[str, Any]],
    timeout: int,
    max_tokens: int,
    temperature: float = 0.0,
) -> Dict[str, Any]:
    """Invia una richiesta a /chat/completions, ritentando su 429/502/503."""
    payload = {
        "model": remote_model_name(model),
        "messages": messages,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }
    url = f"{base_url()}/chat/completions"
    for attempt in range(1, MAX_ATTEMPTS + 1):
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code in RETRYABLE_STATUS and attempt < MAX_ATTEMPTS:
                time.sleep(_retry_delay(exc, attempt))
                continue
            raise TokenFactoryError(
                f"Token Factory ha restituito un errore {exc.code}: {_error_detail(exc)}"
            ) from exc
        except urllib.error.URLError as exc:
            raise TokenFactoryError(
                f"Non riesco a contattare Token Factory ({exc.reason}). Controlla la connessione."
            ) from exc
    raise TokenFactoryError("Token Factory non ha risposto dopo vari tentativi.")
