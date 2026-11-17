"""Monta la musica di sottofondo sui tempi delle scene di `index.html`.

Usa i tre pezzi di `voce/genera_musica.py` (`assets/musica/*.wav`):
- `tensione` dal primo fotogramma fino a «Meet Referto» (fine della scena 2);
- `fiducia` da lì fino all'inizio della scena 8;
- `slancio` per il potenziale e la chiusura, con dissolvenza finale.
Ogni pezzo si ripete con una dissolvenza incrociata finché serve. Scrive
`assets/musica/sottofondo.mp3`, lungo quanto il video: va rilanciato quando
cambiano i tempi delle scene (per esempio dopo `voce/sincronizza.py`).

Uso (dalla cartella resources/video):
    uv run --no-project --with soundfile --with numpy python voce/monta_musica.py
"""

import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile

CARTELLA = Path(__file__).resolve().parent.parent
MUSICA = CARTELLA / "assets" / "musica"
INDICE = CARTELLA / "index.html"
INCROCIO = 2.0  # secondi di dissolvenza incrociata tra un pezzo e l'altro
SINCRONIA = CARTELLA / "voce" / "sincronia.json"
PAROLA_SVOLTA = "meet"  # la musica cambia su «Meet Referto», letto dalla traccia


def inizio_scena(indice: str, id_scena: str) -> float:
    trovato = re.search(r'id="' + id_scena + r'"(?:(?!></div>).)*?data-start="([0-9.]+)"', indice, re.S)
    if not trovato:
        raise SystemExit(f"Scena non trovata in index.html: {id_scena}")
    return float(trovato.group(1))


def durata_video(indice: str) -> float:
    return float(re.search(r'id="root"(?:(?!>).)*?data-duration="([0-9.]+)"', indice, re.S).group(1))


def leggi(nome: str) -> tuple[np.ndarray, int]:
    onda, frequenza = soundfile.read(MUSICA / f"{nome}.wav", dtype="float32")
    if onda.ndim > 1:
        onda = onda.mean(axis=1)
    return ritaglia(onda, frequenza), frequenza


def ritaglia(onda: np.ndarray, frequenza: int, soglia_db: float = -40.0) -> np.ndarray:
    """Toglie i silenzi a inizio e fine, che nei cicli diventerebbero buchi."""
    finestra = int(0.05 * frequenza)
    livelli = [20 * np.log10(max(1e-9, float(np.sqrt(np.mean(onda[i:i + finestra] ** 2)))))
               for i in range(0, len(onda) - finestra, finestra)]
    sopra = [i for i, livello in enumerate(livelli) if livello > soglia_db]
    if not sopra:
        return onda
    return onda[sopra[0] * finestra:(sopra[-1] + 1) * finestra]


def incrocia(a: np.ndarray, b: np.ndarray, n: int) -> np.ndarray:
    n = min(n, len(a), len(b))
    curva = np.linspace(0.0, 1.0, n, dtype=np.float32)
    mezzo = a[-n:] * np.cos(curva * np.pi / 2) + b[:n] * np.sin(curva * np.pi / 2)
    return np.concatenate([a[:-n], mezzo, b[n:]])


def ripeti(pezzo: np.ndarray, campioni: int, n: int) -> np.ndarray:
    """Il pezzo ripetuto con dissolvenze incrociate fino a `campioni` (+ coda per l'incrocio)."""
    uscita = pezzo.copy()
    while len(uscita) < campioni + n:
        uscita = incrocia(uscita, pezzo, n)
    return uscita[: campioni + n]


def main() -> None:
    indice = INDICE.read_text(encoding="utf-8")
    conf = json.loads(SINCRONIA.read_text(encoding="utf-8"))
    parole = json.loads((CARTELLA / conf["parole_traccia"]).read_text(encoding="utf-8"))
    parole = parole if isinstance(parole, list) else parole["words"]
    svolta = next(p for p in parole if re.sub(r"[^a-z]", "", p["text"].lower()) == PAROLA_SVOLTA)
    t2 = svolta["start"] + conf["inizio_traccia"] - 0.2
    t8 = inizio_scena(indice, "scena-08-potenziale")
    fine = durata_video(indice)

    tensione, frequenza = leggi("tensione")
    fiducia, _ = leggi("fiducia")
    slancio, _ = leggi("slancio")
    n = int(INCROCIO * frequenza)

    # Ogni tratto finisce a metà dell'incrocio con il successivo.
    tratto1 = ripeti(tensione, int((t2 - INCROCIO / 2) * frequenza), n)
    tratto2 = ripeti(fiducia, int((t8 - t2) * frequenza), n)
    tratto3 = ripeti(slancio, int((fine - t8 + INCROCIO / 2) * frequenza), n)
    traccia = incrocia(incrocia(tratto1, tratto2, n), tratto3, n)[: int(fine * frequenza)]

    # Entrata morbida e uscita in dissolvenza sugli ultimi 3 s.
    entrata = int(1.0 * frequenza)
    traccia[:entrata] *= np.linspace(0.0, 1.0, entrata, dtype=np.float32)
    uscita = int(3.0 * frequenza)
    traccia[-uscita:] *= np.linspace(1.0, 0.0, uscita, dtype=np.float32)
    traccia = traccia / max(1e-6, float(np.abs(traccia).max())) * 0.9

    temporaneo = MUSICA / "sottofondo.wav"
    soundfile.write(temporaneo, traccia, frequenza)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(temporaneo), "-ar", "44100", "-b:a", "192k",
         str(MUSICA / "sottofondo.mp3")],
        check=True,
    )
    temporaneo.unlink()
    print(f"sottofondo.mp3: {fine:.2f} s (tensione fino a {t2:.2f} s, slancio da {t8:.2f} s)")


if __name__ == "__main__":
    main()
