"""Genera la voce fuori campo del video con Edge TTS, una traccia per scena.

Legge `voce/copione.json` (voce e velocità generali, o quelle della scena se
ci sono) e scrive in `assets/voce/` un MP3 per scena e
`audio_meta.json` con durata e tempi delle parole (formato `{id, text, start,
end}` in secondi), che servono per sottotitoli e animazioni.

Uso (dalla cartella resources/video):
    uv run --no-project --with edge-tts==7.3.1 python voce/genera_voce.py [id-scena ...]
"""

import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

import edge_tts

CARTELLA = Path(__file__).resolve().parent.parent
COPIONE = CARTELLA / "voce" / "copione.json"
USCITA = CARTELLA / "assets" / "voce"
META = USCITA / "audio_meta.json"
TICK = 10_000_000  # Edge TTS misura i tempi in unità da 100 ns


def durata(percorso: Path) -> float:
    risultato = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(percorso)],
        capture_output=True, text=True, check=True,
    )
    return round(float(risultato.stdout.strip()), 3)


async def genera_scena(scena: dict, voce: str, velocita: str) -> dict:
    percorso = USCITA / f"{scena['id']}.mp3"
    # Le pause <break time="…" /> sono per ElevenLabs: la voce di riferimento le ignora.
    testo = re.sub(r"\s*<break[^>]*/>\s*", " ", scena["testo"]).strip()
    comunicazione = edge_tts.Communicate(testo, voce, rate=velocita, boundary="WordBoundary")
    parole = []
    with percorso.open("wb") as file:
        async for pezzo in comunicazione.stream():
            if pezzo["type"] == "audio":
                file.write(pezzo["data"])
            elif pezzo["type"] == "WordBoundary":
                inizio = pezzo["offset"] / TICK
                parole.append({
                    "id": f"w{len(parole)}",
                    "text": pezzo["text"],
                    "start": round(inizio, 3),
                    "end": round(inizio + pezzo["duration"] / TICK, 3),
                })
    return {
        "id": scena["id"],
        "titolo": scena["titolo"],
        "text": testo,
        "path": f"assets/voce/{percorso.name}",
        "voice": voce,
        "duration_s": durata(percorso),
        "words": parole,
    }


async def main(solo: list[str]) -> None:
    copione = json.loads(COPIONE.read_text(encoding="utf-8"))
    USCITA.mkdir(parents=True, exist_ok=True)
    precedenti = {}
    if solo and META.exists():
        precedenti = {v["id"]: v for v in json.loads(META.read_text(encoding="utf-8"))["voices"]}
    voci = []
    for scena in copione["scene"]:
        if solo and scena["id"] not in solo:
            voci.append(precedenti[scena["id"]])
            continue
        voce = await genera_scena(scena, scena.get("voce", copione["voce"]), scena.get("velocita", copione["velocita"]))
        print(f"{voce['id']}: {voce['duration_s']:.1f} s, {len(voce['words'])} parole")
        voci.append(voce)
    totale = round(sum(v["duration_s"] for v in voci), 3)
    meta = {"provider": "edge-tts", "voice": copione["voce"], "rate": copione["velocita"],
            "voices": voci, "total_duration_s": totale}
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Totale voce: {totale:.1f} s")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
