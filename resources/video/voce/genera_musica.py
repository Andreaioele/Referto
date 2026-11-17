"""Genera i pezzi della musica di sottofondo con MusicGen (gratuito, in locale).

Tre pezzi da circa 30 s, scritti in `assets/musica/`:
- `tensione.wav`: il gancio, sospeso e in minore;
- `fiducia.wav`: da Referto in poi, caldo e luminoso;
- `slancio.wav`: il potenziale e la chiusura, più pieno.
`voce/monta_musica.py` li unisce nella traccia del video.

Licenza: i pesi di `facebook/musicgen-small` sono CC BY-NC 4.0, quindi la musica
va bene per l'hackathon ma non per un uso commerciale.

Uso (dalla cartella resources/video, la prima volta scarica circa 2 GB):
    uv run --no-project --python 3.12 --with torch --with transformers==4.46.3 \
        --with soundfile --with numpy python voce/genera_musica.py
"""

from pathlib import Path

import numpy as np
import soundfile
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

CARTELLA = Path(__file__).resolve().parent.parent
USCITA = CARTELLA / "assets" / "musica"

PEZZI = {
    "tensione": "minimal cinematic underscore, soft sustained synth pad in a minor key, "
    "sparse felt piano notes, gentle heartbeat pulse, tension, curiosity, no drums, 90 bpm",
    "fiducia": "uplifting modern corporate tech underscore, warm bright piano melody, soft synth pads, "
    "light plucked arpeggio, gentle percussion, hopeful, major key, 100 bpm",
    "slancio": "inspiring modern tech underscore, bright piano and warm strings, "
    "steady light drums, building momentum, optimistic, major key, 100 bpm",
}


def main() -> None:
    USCITA.mkdir(parents=True, exist_ok=True)
    dispositivo = "mps" if torch.backends.mps.is_available() else "cpu"
    processore = AutoProcessor.from_pretrained("facebook/musicgen-small")
    modello = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small").to(dispositivo)
    frequenza = modello.config.audio_encoder.sampling_rate
    for seme, (nome, prompt) in enumerate(PEZZI.items()):
        torch.manual_seed(7 + seme)
        ingresso = processore(text=[prompt], padding=True, return_tensors="pt").to(dispositivo)
        # 50 token al secondo: 1500 token ≈ 30 s, il massimo del decoder.
        audio = modello.generate(**ingresso, do_sample=True, guidance_scale=3.0, max_new_tokens=1500)
        onda = audio[0, 0].float().cpu().numpy()
        onda = onda / max(1e-6, float(np.abs(onda).max())) * 0.9
        soundfile.write(USCITA / f"{nome}.wav", onda, frequenza)
        print(f"{nome}: {len(onda) / frequenza:.1f} s")


if __name__ == "__main__":
    main()
