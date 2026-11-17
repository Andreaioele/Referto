"""Costruisce la traccia vocale provvisoria: tutto il testo inglese, una sola voce.

Finché il team non registra la traccia ElevenLabs, il video usa questa: legge il
campo `inglese` di `voce/copione.json` (lo stesso di TESTO-VOCE.md) con Edge TTS
`en-US-AvaNeural`, rispetta le pause `<break time="Xs" />` e mette una pausa tra
una voce e l'altra. Scrive `assets/voce/provvisoria.mp3` e
`assets/voce/provvisoria.parole.json` (parole con inizio e fine sulla traccia),
cioè gli stessi file che darà la trascrizione della traccia vera: poi basta
`python3 voce/sincronizza.py`.

Uso (dalla cartella resources/video):
    uv run --no-project --with edge-tts==7.3.1 python voce/traccia_provvisoria.py
"""

import asyncio
import json
import re
import subprocess
import tempfile
from pathlib import Path

import edge_tts

CARTELLA = Path(__file__).resolve().parent.parent
COPIONE = CARTELLA / "voce" / "copione.json"
USCITA = CARTELLA / "assets" / "voce" / "provvisoria.mp3"
PAROLE = CARTELLA / "assets" / "voce" / "provvisoria.parole.json"
VOCE = "en-US-AvaNeural"
VELOCITA = "+5%"
TICK = 10_000_000  # Edge TTS misura i tempi in unità da 100 ns
# Pausa dopo ogni voce: più corta tra due voci della stessa composizione.
PAUSA_TRA_VOCI = {"01-gancio": 0.5, "03-demo": 0.8}
PAUSA_TRA_SCENE = 0.9
FREQUENZA = 24000


def durata(percorso: Path) -> float:
    uscita = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(percorso)],
        capture_output=True, text=True, check=True,
    )
    return float(uscita.stdout.strip())


def silenzio(percorso: Path, secondi: float) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"anullsrc=r={FREQUENZA}:cl=mono",
         "-t", f"{secondi:.3f}", "-c:a", "pcm_s16le", str(percorso)],
        check=True,
    )


async def pezzo(testo: str, percorso: Path) -> list:
    """Un pezzo di parlato in WAV e le sue parole (tempi locali)."""
    mp3 = percorso.with_suffix(".mp3")
    comunicazione = edge_tts.Communicate(testo, VOCE, rate=VELOCITA, boundary="WordBoundary")
    parole = []
    with mp3.open("wb") as file:
        async for parte in comunicazione.stream():
            if parte["type"] == "audio":
                file.write(parte["data"])
            elif parte["type"] == "WordBoundary":
                inizio = parte["offset"] / TICK
                parole.append({"text": parte["text"], "start": inizio, "end": inizio + parte["duration"] / TICK})
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-ar", str(FREQUENZA), "-ac", "1",
                    "-c:a", "pcm_s16le", str(percorso)], check=True)
    return parole


async def main() -> None:
    copione = json.loads(COPIONE.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as cartella:
        tmp = Path(cartella)
        pezzi = []
        parole = []
        t = 0.0
        for n, scena in enumerate(copione["scene"]):
            # Il testo si divide sulle pause: parlato, silenzio, parlato…
            parti = re.split(r'\s*<break time="([0-9.]+)s"\s*/>\s*', scena["inglese"])
            for i, parte in enumerate(parti):
                if i % 2 == 1:
                    pausa = tmp / f"p{len(pezzi)}.wav"
                    silenzio(pausa, float(parte))
                    pezzi.append(pausa)
                    t += float(parte)
                    continue
                if not parte.strip():
                    continue
                wav = tmp / f"p{len(pezzi)}.wav"
                for parola in await pezzo(parte.strip(), wav):
                    parole.append({"text": parola["text"], "start": round(t + parola["start"], 3),
                                   "end": round(t + parola["end"], 3)})
                pezzi.append(wav)
                t += durata(wav)
            if n < len(copione["scene"]) - 1:
                pausa = tmp / f"p{len(pezzi)}.wav"
                secondi = PAUSA_TRA_VOCI.get(scena["id"], PAUSA_TRA_SCENE)
                silenzio(pausa, secondi)
                pezzi.append(pausa)
                t += secondi
            print(f"{scena['id']}: fine a {t:.1f} s")
        elenco = tmp / "elenco.txt"
        elenco.write_text("".join(f"file '{p}'\n" for p in pezzi), encoding="utf-8")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(elenco),
                        "-ar", "44100", "-b:a", "160k", str(USCITA)], check=True)
    # Edge TTS dà «Since 2026» come una parola sola: la trascrizione della traccia vera le divide.
    divise = []
    for parola in parole:
        pezzi_parola = parola["text"].split()
        passo = (parola["end"] - parola["start"]) / len(pezzi_parola)
        for k, testo in enumerate(pezzi_parola):
            divise.append({"text": testo, "start": round(parola["start"] + k * passo, 3),
                           "end": round(parola["start"] + (k + 1) * passo, 3)})
    PAROLE.write_text(json.dumps(divise, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Traccia provvisoria: {durata(USCITA):.1f} s, {len(divise)} parole")


if __name__ == "__main__":
    asyncio.run(main())
