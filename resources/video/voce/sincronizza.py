"""Sincronizza le scene con una traccia vocale unica (oggi: ElevenLabs, in inglese).

Le animazioni delle scene sono scritte sui tempi della voce italiana di
riferimento (`assets/voce/audio_meta.json`). Questo script legge le ancore di
`voce/sincronia.json` (coppie di parole equivalenti tra la voce di riferimento e
la traccia nuova, trascritta in `parole_traccia`) e:

- sceglie dove comincia ogni scena (le pause tra una scena e l'altra si
  accorciano a quelle della traccia);
- scrive in ogni composizione il blocco SINCRONIA: la tabella dei tempi vecchi →
  nuovi e la funzione `riallinea(tl)`, che sposta e ridimensiona ogni tween;
- aggiorna `index.html`: posizioni e durate delle scene, una sola traccia vocale
  (nel gruppo `voiceover`) e la durata della musica, che poi va rimontata.

Uso (dalla cartella resources/video), dopo ogni cambio di traccia o di ancore:
    python3 voce/sincronizza.py
"""

import json
import re
import subprocess
from pathlib import Path

CARTELLA = Path(__file__).resolve().parent.parent
SINCRONIA = CARTELLA / "voce" / "sincronia.json"
RIFERIMENTO = CARTELLA / "assets" / "voce" / "audio_meta.json"
INDICE = CARTELLA / "index.html"
ATTACCO_MINIMO = 0.4  # tempo minimo tra l'inizio della scena e la sua prima parola

FUNZIONE = """      // SINCRONIA-INIZIO (generato da voce/sincronizza.py: non modificare a mano)
      // Tempi della scena: [tempo sulla voce di riferimento, tempo sulla traccia].
      const SINCRONIA = {tabella};
      // Ricrea ogni tween sui tempi della traccia (inizio spostato, durata adattata).
      // Non si cambiano startTime() e timeScale() dei tween esistenti: GSAP li
      // disegnerebbe subito e i fromTo con immediateRender: false applicherebbero i
      // valori di partenza fuori tempo. Alla fine la timeline va alla fine e torna
      // all'inizio: così ogni .to() registra la partenza giusta una volta per tutte e
      // l'anteprima o il render possono saltare in qualsiasi punto.
      function riallinea(tl) {{
        const T = (t) => {{
          if (t <= SINCRONIA[0][0]) return t - SINCRONIA[0][0] + SINCRONIA[0][1];
          for (let i = 1; i < SINCRONIA.length; i++) {{
            if (t <= SINCRONIA[i][0]) {{
              const [a0, b0] = SINCRONIA[i - 1];
              const [a1, b1] = SINCRONIA[i];
              return b0 + ((t - a0) * (b1 - b0)) / (a1 - a0);
            }}
          }}
          const [a, b] = SINCRONIA[SINCRONIA.length - 1];
          return b + (t - a);
        }};
        const figli = tl.getChildren(false, true, false).map((f) => ({{
          f,
          inizio: f.startTime(),
          durata: f.totalDuration(),
          vars: f.vars,
          bersagli: f.targets(),
        }}));
        for (const {{ f }} of figli) f.kill();
        for (const {{ inizio, durata, vars, bersagli }} of figli) {{
          const nuovoInizio = T(inizio);
          const fattore = durata > 0 ? Math.max(0.01, T(inizio + durata) - nuovoInizio) / durata : 1;
          const nuovi = {{ ...vars, immediateRender: false }};
          delete nuovi.parent;
          delete nuovi.delay;
          if (typeof vars.duration === "number") nuovi.duration = vars.duration * fattore;
          if (typeof vars.stagger === "number") nuovi.stagger = vars.stagger * fattore;
          if (typeof vars.repeatDelay === "number") nuovi.repeatDelay = vars.repeatDelay * fattore;
          tl.to(bersagli, nuovi, nuovoInizio);
        }}
        tl.progress(1).progress(0);
      }}
      // SINCRONIA-FINE
"""


def normale(testo: str) -> str:
    return re.sub(r"[^a-zàèéìòù]", "", testo.lower())


def cerca(parole: list, testo: str, da: int, dove: str) -> int:
    for i in range(da, len(parole)):
        if normale(parole[i]["text"]) == normale(testo):
            return i
    raise SystemExit(f"Ancora non trovata: «{testo}» in {dove} dopo la parola {da}")


def mappa(tabella: list, t: float) -> float:
    """Stessa interpolazione di riallinea() nella pagina."""
    if t <= tabella[0][0]:
        return t - tabella[0][0] + tabella[0][1]
    for (a0, b0), (a1, b1) in zip(tabella, tabella[1:]):
        if t <= a1:
            return b0 + (t - a0) * (b1 - b0) / (a1 - a0)
    a, b = tabella[-1]
    return b + (t - a)


def durata_audio(percorso: Path) -> float:
    uscita = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(percorso)],
        capture_output=True, text=True, check=True,
    )
    return round(float(uscita.stdout.strip()), 3)


def main() -> None:
    conf = json.loads(SINCRONIA.read_text(encoding="utf-8"))
    riferimento = {v["id"]: v["words"] for v in json.loads(RIFERIMENTO.read_text(encoding="utf-8"))["voices"]}
    traccia = json.loads((CARTELLA / conf["parole_traccia"]).read_text(encoding="utf-8"))
    traccia = traccia if isinstance(traccia, list) else traccia["words"]
    g = conf["inizio_traccia"]

    # 1. Ancore: (tempo locale sulla voce di riferimento, tempo globale sulla traccia).
    composizioni = []
    pe = 0
    for comp in conf["composizioni"]:
        punti = []
        for voce in comp["voci"]:
            parole = riferimento[voce["id"]]
            pi = 0
            for n, (it, en) in enumerate(voce["ancore"]):
                ultima = n == len(voce["ancore"]) - 1
                i = cerca(parole, it, pi, voce["id"])
                e = cerca(traccia, en, pe, f"traccia ({voce['id']})")
                vecchio = (parole[i]["end"] if ultima else parole[i]["start"]) + voce["attacco"]
                nuovo = g + (traccia[e]["end"] if ultima else traccia[e]["start"])
                punti.append((round(vecchio, 3), round(nuovo, 3)))
                pi, pe = i + 1, e + 1
        composizioni.append({**comp, "punti": punti})

    # 2. Dove comincia ogni scena e tabella dei tempi locali.
    fine_precedente = None
    for c in composizioni:
        vecchio0, nuovo0 = c["punti"][0]
        if fine_precedente is None:
            inizio = 0.0
        else:
            pausa = nuovo0 - fine_precedente
            inizio = nuovo0 - min(vecchio0, max(ATTACCO_MINIMO, pausa))
        c["inizio"] = round(inizio, 3)
        tabella = [(0.0, 0.0)] + [(v, round(n - inizio, 3)) for v, n in c["punti"]]
        if "coda" in c:
            fine_locale = tabella[-1][1]
            tabella += [(v, round(fine_locale + d, 3)) for v, d in c["coda"]]
        for (a0, b0), (a1, b1) in zip(tabella, tabella[1:]):
            if not (a1 > a0 and b1 > b0):
                raise SystemExit(f"{c['id']}: ancore non crescenti {a0}→{b0} e {a1}→{b1}")
        c["tabella"] = tabella
        fine_precedente = c["punti"][-1][1]
    for c, dopo in zip(composizioni, composizioni[1:]):
        # La scena resta sotto la successiva finché il fondo di quella non la copre.
        copertura = max(0.2, mappa(dopo["tabella"], dopo["copertura"]))
        c["durata"] = round(dopo["inizio"] + copertura - c["inizio"], 3)
    ultima = composizioni[-1]
    ultima["durata"] = ultima["tabella"][-1][1]
    totale = round(ultima["inizio"] + ultima["durata"], 3)

    # 3. Blocco SINCRONIA e chiamata a riallinea() in ogni composizione.
    for c in composizioni:
        file = CARTELLA / "compositions" / f"{c['id']}.html"
        testo = file.read_text(encoding="utf-8")
        tabella = json.dumps([[a, b] for a, b in c["tabella"]])
        blocco = FUNZIONE.format(tabella=tabella)
        if "// SINCRONIA-INIZIO" in testo:
            testo = re.sub(r"      // SINCRONIA-INIZIO.*?// SINCRONIA-FINE\n", lambda _: blocco, testo, flags=re.S)
        else:
            testo = re.sub(r"(\n\s*<script[^>]*>\n)", lambda m: m.group(1) + blocco, testo, count=1)
        registra = f'window.__timelines["{c["id"]}"] = tl;'
        if "riallinea(tl);" not in testo:
            testo = testo.replace(registra, "riallinea(tl);\n          " + registra if "costruisci" in testo else "riallinea(tl);\n        " + registra)
        file.write_text(testo, encoding="utf-8")

    # 4. index.html: scene, durata totale, una sola traccia audio.
    indice = INDICE.read_text(encoding="utf-8")
    for c in composizioni:
        schema = re.compile(r'(<div[^>]*?\n?\s*id="' + c["id"] + r'"(?:(?!></div>).)*?data-start=")[0-9.]+("(?:(?!></div>).)*?data-duration=")[0-9.]+', re.S)
        indice, n = schema.subn(lambda m: f'{m.group(1)}{c["inizio"]}{m.group(2)}{c["durata"]}', indice)
        if n != 1:
            raise SystemExit(f"Scena non trovata in index.html: {c['id']}")
    indice, n = re.subn(r'(id="root"(?:(?!>).)*?data-duration=")[0-9.]+', lambda m: f"{m.group(1)}{totale}", indice, count=1, flags=re.S)
    if n != 1:
        raise SystemExit("Root non trovata in index.html")
    indice = re.sub(r'\n\s*<audio[^>]*id="voce-[^"]*"[^>]*></audio>', "", indice)
    durata = durata_audio(CARTELLA / conf["traccia"])
    audio = (f'\n      <audio id="voce-traccia" data-audio-group="voiceover" src="{conf["traccia"]}" data-start="{g}" '
             f'data-duration="{durata}" data-track-index="10" data-volume="1"></audio>')
    indice = re.sub(r"(<!-- Voce fuori campo[^\n]*-->)", lambda m: "<!-- Voce fuori campo: traccia unica, scene sincronizzate da voce/sincronizza.py -->" + audio, indice, count=1)
    # La musica copre tutto il video: va rimontata (monta_musica.py) e ricarvata dopo.
    indice = re.sub(r'(<audio id="musica-sottofondo"[^>]*?data-duration=")[0-9.]+', lambda m: f"{m.group(1)}{totale}", indice)
    INDICE.write_text(indice, encoding="utf-8")

    for c in composizioni:
        print(f"{c['id']:24} inizio {c['inizio']:7.2f}  durata {c['durata']:6.2f}")
    print(f"Totale {totale:.2f} s")
    print("Ora: voce/sottotitoli.py, voce/monta_musica.py e il carve della musica (vedi docs/17-video-presentazione.md).")


if __name__ == "__main__":
    main()
