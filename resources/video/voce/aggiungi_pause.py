"""Aggiunge a una traccia vocale le pause <break> del copione.

Alcuni modelli di ElevenLabs ignorano i tag `<break time="Xs" />`: la traccia
arriva senza le pause che danno tempo alle immagini. Questo script le inserisce:
per ogni tag del campo `inglese` di `voce/copione.json` trova, nella
trascrizione della traccia, la parola che lo precede e allunga il silenzio che
segue fino alla durata del tag. Scrive la traccia con le pause e le sue parole a
tempo (spostate), da indicare in `voce/sincronia.json`.

Corregge anche, nelle parole a tempo, i nomi che la trascrizione automatica
sbaglia (CORREZIONI): servono alle ancore e ai sottotitoli, non cambiano l'audio.

Uso (dalla cartella resources/video):
    uv run --no-project --with soundfile --with numpy python voce/aggiungi_pause.py \\
        assets/voce/elevenlabs-finale.mp3 assets/voce/elevenlabs-finale.trascrizione.json
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile

CARTELLA = Path(__file__).resolve().parent.parent
COPIONE = CARTELLA / "voce" / "copione.json"
GUARDA_AVANTI = 6
SOGLIA_DB = -45.0  # sotto questo livello è silenzio: lì si può tagliare
CORREZIONI = {"reverto": "Referto", "riferto": "Referto", "ramapril": "ramipril", "giovannis": "Giovanna's"}


def normale(testo: str) -> str:
    return re.sub(r"[^a-z0-9]", "", testo.lower())


def main(traccia: Path, trascrizione: Path) -> None:
    parole = json.loads(trascrizione.read_text(encoding="utf-8"))
    parole = parole if isinstance(parole, list) else parole["words"]
    for parola in parole:
        corretta = CORREZIONI.get(normale(parola["text"]))
        if corretta:
            coda = re.sub(r"^[\w']+", "", parola["text"])
            parola["text"] = corretta + coda

    # Testo del copione: parole e pause, nell'ordine.
    voci = []
    for scena in json.loads(COPIONE.read_text(encoding="utf-8"))["scene"]:
        for pezzo in re.split(r'(<break time="[0-9.]+s"\s*/>)', scena["inglese"]):
            pausa = re.match(r'<break time="([0-9.]+)s"', pezzo)
            if pausa:
                voci.append(("pausa", float(pausa.group(1))))
            else:
                voci += [("parola", p) for p in pezzo.split()]

    # Per ogni pausa, l'indice (nella trascrizione) dell'ultima parola prima della pausa.
    pause = []
    j = 0
    ultima = None
    for tipo, valore in voci:
        if tipo == "pausa":
            if ultima is not None:
                pause.append((ultima, valore))
            continue
        for k in range(j, min(j + GUARDA_AVANTI, len(parole))):
            if normale(parole[k]["text"]) == normale(valore):
                ultima, j = k, k + 1
                break

    with tempfile.TemporaryDirectory() as cartella:
        wav = Path(cartella) / "voce.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(traccia), "-ac", "1", str(wav)], check=True)
        audio, frequenza = soundfile.read(wav, dtype="float32")

        # Livello della voce ogni 10 ms: i tempi della trascrizione non bastano per
        # tagliare (a volte la parola suona ancora dopo la sua «fine»).
        passo = int(0.01 * frequenza)
        livelli = np.array([
            20 * np.log10(max(1e-9, float(np.sqrt(np.mean(audio[i:i + passo] ** 2)))))
            for i in range(0, len(audio) - passo, passo)
        ])

        def punto_di_silenzio(da: float, a: float) -> float:
            """Centro del silenzio vero più lungo tra da e a (sotto SOGLIA_DB)."""
            i0, i1 = max(0, int(da / 0.01)), min(len(livelli), int(a / 0.01))
            migliore = None
            i = i0
            while i < i1:
                if livelli[i] < SOGLIA_DB:
                    j = i
                    while j < i1 and livelli[j] < SOGLIA_DB:
                        j += 1
                    if migliore is None or j - i > migliore[1] - migliore[0]:
                        migliore = (i, j)
                    i = j
                else:
                    i += 1
            if migliore is None:
                raise SystemExit(f"Nessun silenzio tra {da:.2f} e {a:.2f} s: controllare la traccia a mano")
            return (migliore[0] + migliore[1]) / 2 * 0.01 + 0.005

        # Fondo per riempire le pause: il tratto di 0,4 s più silenzioso di tutta la
        # registrazione (niente code di parole né respiri), ripetuto con dissolvenze
        # incrociate. Ripetere il silenzio attorno al taglio non va: contiene la coda
        # della parola, che ripetuta diventa un'eco di voce.
        lungo = 40  # finestre da 10 ms
        energie = np.convolve(10 ** (livelli / 10), np.ones(lungo), "valid")
        k = int(np.argmin(energie))
        fondo_pulito = audio[k * passo:(k + lungo) * passo].copy()
        print(f"fondo per le pause: {k * 0.01:.2f}-{(k + lungo) * 0.01:.2f} s, "
              f"massimo {livelli[k:k + lungo].max():.0f} dB")
        incrocio = int(0.05 * frequenza)

        def riempi(secondi: float) -> np.ndarray:
            uscita = fondo_pulito.copy()
            curva = np.linspace(0.0, 1.0, incrocio, dtype=np.float32)
            while len(uscita) < int(secondi * frequenza):
                coda = uscita[-incrocio:] * (1 - curva) + fondo_pulito[:incrocio] * curva
                uscita = np.concatenate([uscita[:-incrocio], coda, fondo_pulito[incrocio:]])
            return uscita[:int(secondi * frequenza)].astype(np.float32)

        pezzi = []
        inizio = 0
        aggiunto = []  # (punto di taglio sulla traccia originale, secondi aggiunti)
        for k, durata in pause:
            fine_parola = parole[k]["end"]
            dopo = parole[k + 1]["start"] if k + 1 < len(parole) else len(audio) / frequenza
            punto = punto_di_silenzio(fine_parola - 0.1, max(dopo, fine_parola) + 0.6)
            # Silenzio che c'è già attorno al punto: si aggiunge solo quello che manca.
            sx = dx = int(punto / 0.01)
            while sx > 0 and livelli[sx - 1] < SOGLIA_DB:
                sx -= 1
            while dx < len(livelli) and livelli[dx] < SOGLIA_DB:
                dx += 1
            esistente = (dx - sx) * 0.01
            # La trascrizione spesso fa iniziare la parola dopo la pausa subito dopo la
            # precedente, inglobando il silenzio: la si fa partire dove la voce riparte
            # davvero (fine del silenzio misurato). Serve alla sincronia delle scene.
            if k + 1 < len(parole) and parole[k + 1]["start"] < dx * 0.01:
                parole[k + 1]["start"] = round(dx * 0.01, 3)
                parole[k + 1]["end"] = max(parole[k + 1]["end"], parole[k + 1]["start"] + 0.1)
            extra = max(0.0, durata - esistente)
            if extra <= 0:
                continue
            campione = int(punto * frequenza)
            prima = audio[inizio:campione].copy()
            riempimento = riempi(extra)
            pezzi += [prima, riempimento]
            inizio = campione
            aggiunto.append((punto, extra))
            print(f"pausa di {durata:.1f} s dopo «{parole[k]['text']}»: taglio a {punto:.2f} s "
                  f"({livelli[int(punto / 0.01)]:.0f} dB), silenzio già presente {esistente:.2f} s, +{extra:.2f} s")
        pezzi.append(audio[inizio:])
        # Dissolvenze di 5 ms su entrambi i lati di ogni giunzione: nessun clic.
        corta = int(0.005 * frequenza)
        for n in range(len(pezzi)):
            pezzo = pezzi[n] = pezzi[n].copy()
            if len(pezzo) < 2 * corta:
                continue
            if n > 0:
                pezzo[:corta] *= np.linspace(0.0, 1.0, corta, dtype=np.float32)
            if n < len(pezzi) - 1:
                pezzo[-corta:] *= np.linspace(1.0, 0.0, corta, dtype=np.float32)
        uscita_wav = Path(cartella) / "uscita.wav"
        soundfile.write(uscita_wav, np.concatenate(pezzi), frequenza)
        uscita = traccia.with_name(traccia.stem + "-pause.mp3")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(uscita_wav), "-b:a", "192k", str(uscita)], check=True)

    def sposta(t: float) -> float:
        return round(t + sum(extra for punto, extra in aggiunto if punto <= t), 3)

    spostate = [{"text": p["text"], "start": sposta(p["start"]), "end": sposta(p["end"])} for p in parole]
    destinazione = traccia.with_name(traccia.stem + "-pause.parole.json")
    destinazione.write_text(json.dumps(spostate, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{uscita.name}: {sum(e for _, e in aggiunto):.1f} s di pause aggiunte; parole in {destinazione.name}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
