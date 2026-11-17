"""Genera i sottotitoli inglesi del video dalla traccia vocale.

Legge il testo inglese di `voce/copione.json` (con la punteggiatura) e le parole
a tempo della traccia indicata in `voce/sincronia.json` (`parole_traccia`, oggi
la provvisoria, poi la trascrizione di ElevenLabs). Allinea le due liste parola
per parola, divide il testo in righe brevi e scrive
`compositions/sottotitoli.html`, una composizione lunga quanto il video. Nella
demo (scene 3-4) i sottotitoli stanno a sinistra, per non coprire il widget, e
così alla fine della scena 5, per non coprire il pannello della mappa a destra.

Uso (dalla cartella resources/video), dopo `voce/sincronizza.py`:
    python3 voce/sottotitoli.py
"""

import json
import re
from pathlib import Path

CARTELLA = Path(__file__).resolve().parent.parent
COPIONE = CARTELLA / "voce" / "copione.json"
SINCRONIA = CARTELLA / "voce" / "sincronia.json"
INDICE = CARTELLA / "index.html"
USCITA = CARTELLA / "compositions" / "sottotitoli.html"
CODA = 0.35  # quanto resta la riga dopo l'ultima parola
GUARDA_AVANTI = 6  # parole della traccia in cui cercare la parola del testo
# Secondi dall'inizio della scena 5 alla riga sulle distanze, quando si apre il
# pannello della mappa (a destra): da lì alla fine della scena, righe a sinistra.
MAPPA_S5 = 28.0


def normale(testo: str) -> str:
    return re.sub(r"[^a-z0-9]", "", testo.lower())


def inizio_scena(indice: str, id_scena: str) -> float:
    trovato = re.search(r'id="' + id_scena + r'"(?:(?!></div>).)*?data-start="([0-9.]+)"', indice, re.S)
    return float(trovato.group(1))


def allinea(testo: list, traccia: list) -> list:
    """Per ogni parola del testo: (parola con punteggiatura, inizio, fine) sulla traccia."""
    risultato = []
    j = 0
    for parola in testo:
        chiave = normale(parola)
        trovata = None
        for k in range(j, min(j + GUARDA_AVANTI, len(traccia))):
            if normale(traccia[k]["text"]) == chiave:
                trovata = k
                break
        if trovata is None:
            risultato.append([parola, None, None])
            continue
        risultato.append([parola, traccia[trovata]["start"], traccia[trovata]["end"]])
        j = trovata + 1
    allinea.mancanti = sum(1 for voce in risultato if voce[1] is None)
    # Le parole non trovate (trascrizione diversa dal testo) prendono i tempi delle vicine.
    for i, voce in enumerate(risultato):
        if voce[1] is None:
            prima = next((risultato[k][2] for k in range(i - 1, -1, -1) if risultato[k][2] is not None), 0.0)
            dopo = next((risultato[k][1] for k in range(i + 1, len(risultato)) if risultato[k][1] is not None), prima)
            voce[1], voce[2] = prima, max(prima, dopo)
    return risultato


# Una riga non finisce con queste parole: articoli, preposizioni e gli aggettivi
# del testo che stanno davanti a un nome.
DEBOLI = {"a", "an", "the", "in", "of", "to", "on", "her", "his", "its", "and", "or", "with", "for",
          "from", "by", "at", "is", "are", "who", "that", "what", "every", "one", "can", "more", "than",
          "electronic", "family", "health", "medical", "separate", "official", "original", "patient",
          "nearest", "cardiology", "follow-up", "real", "digital", "regional", "european", "data",
          "language", "token", "amd", "open", "verifiable", "final", "single", "plain", "own", "less"}
MAX_CARATTERI = 50


def testo_di(gruppo: list) -> str:
    return " ".join(p for p, _, _ in gruppo)


def spezza(gruppo: list) -> list:
    """Divide un pezzo di frase troppo lungo nel punto più centrale «buono»."""
    if len(testo_di(gruppo)) <= MAX_CARATTERI or len(gruppo) < 4:
        return [gruppo]
    totale = len(testo_di(gruppo))
    migliore = None
    for i in range(2, len(gruppo) - 1):
        sinistra = testo_di(gruppo[:i])
        costo = abs(len(sinistra) - (totale - len(sinistra) - 1))
        if normale(gruppo[i - 1][0]) in DEBOLI:
            costo += 1000
        if migliore is None or costo < migliore[0]:
            migliore = (costo, i)
    i = migliore[1]
    return spezza(gruppo[:i]) + spezza(gruppo[i:])


def righe(parole: list) -> list:
    """Prima pezzi di frase (punteggiatura forte, virgole, pause della voce), poi
    ogni pezzo troppo lungo diviso in righe bilanciate."""
    pezzi = []
    corrente = []
    for parola, inizio, fine in parole:
        if corrente and inizio - corrente[-1][2] > 0.6:
            pezzi.append(corrente)
            corrente = []
        corrente.append((parola, inizio, fine))
        if parola.endswith((".", "?", "!", ":", ";")) or (parola.endswith(",") and len(corrente) >= 3):
            pezzi.append(corrente)
            corrente = []
    if corrente:
        pezzi.append(corrente)
    uscita = []
    for pezzo in pezzi:
        uscita += spezza(pezzo)
    return uscita


def main() -> None:
    copione = json.loads(COPIONE.read_text(encoding="utf-8"))
    conf = json.loads(SINCRONIA.read_text(encoding="utf-8"))
    traccia = json.loads((CARTELLA / conf["parole_traccia"]).read_text(encoding="utf-8"))
    traccia = traccia if isinstance(traccia, list) else traccia["words"]
    g = conf["inizio_traccia"]
    indice = INDICE.read_text(encoding="utf-8")
    demo = (inizio_scena(indice, "scena-03-demo"), inizio_scena(indice, "scena-05-integrazioni"))
    mappa = (demo[1] + MAPPA_S5, inizio_scena(indice, "scena-06-tecnologia"))
    durata = float(re.search(r'id="root"(?:(?!>).)*?data-duration="([0-9.]+)"', indice, re.S).group(1))

    testo = []
    for scena in copione["scene"]:
        testo += re.sub(r"\s*<break[^>]*/>\s*", " ", scena["inglese"]).split()
    parole = allinea(testo, traccia)
    elenco = righe(parole)

    html = []
    tempi = []
    for n, riga in enumerate(elenco):
        inizio = round(riga[0][1] + g - 0.05, 3)
        fine = riga[-1][2] + g + CODA
        if n + 1 < len(elenco):
            fine = min(fine, elenco[n + 1][0][1] + g - 0.05)
        fine = round(max(fine, inizio + 0.5), 3)
        a_sinistra = demo[0] <= inizio < demo[1] or mappa[0] <= inizio < mappa[1]
        classe = "st-riga st-sinistra" if a_sinistra else "st-riga"
        frase = " ".join(p for p, _, _ in riga).replace("&", "&amp;").replace("<", "&lt;")
        html.append(f'        <div class="{classe}" id="st-{n}" data-layout-allow-overlap><span data-layout-allow-overlap>{frase}</span></div>')
        tempi.append([inizio, fine])

    pagina = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <!--
      Sottotitoli inglesi, generati da voce/sottotitoli.py: non modificare a mano.
      Una riga per volta, sui tempi della traccia vocale ({conf["parole_traccia"]}).
    -->
    <template>
      <style>
        @font-face {{
          font-family: "Nunito Sans";
          src: url("assets/fonts/nunito-sans-latin-wght.woff2") format("woff2");
          font-weight: 200 1000;
        }}
        #st-root {{
          position: absolute;
          inset: 0;
          pointer-events: none;
          font-family: "Nunito Sans", sans-serif;
        }}
        .st-riga {{
          position: absolute;
          left: 0;
          right: 0;
          bottom: 54px;
          display: flex;
          justify-content: center;
          opacity: 0;
        }}
        .st-riga span {{
          max-width: 1300px;
          padding: 10px 26px;
          border-radius: 16px;
          background: rgba(11, 21, 18, 0.78);
          color: #ffffff;
          font-size: 42px;
          font-weight: 700;
          line-height: 1.3;
          letter-spacing: -0.005em;
          text-align: center;
        }}
        .st-sinistra {{
          left: 110px;
          right: auto;
          justify-content: flex-start;
        }}
        .st-sinistra span {{
          max-width: 860px;
          text-align: left;
        }}
      </style>

      <div id="st-root" data-composition-id="sottotitoli" data-width="1920" data-height="1080">
{chr(10).join(html)}
      </div>

      <script>
        // [inizio, fine] di ogni riga, in secondi del video.
        const TEMPI = {json.dumps(tempi)};
        const tl = gsap.timeline({{ paused: true }});
        TEMPI.forEach(([inizio, fine], n) => {{
          tl.fromTo(`#st-${{n}}`, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.08, ease: "none" }}, inizio);
          tl.fromTo(`#st-${{n}}`, {{ opacity: 1 }}, {{ opacity: 0, duration: 0.08, ease: "none", immediateRender: false }}, fine - 0.08);
        }});
        tl.set({{}}, {{}}, {durata});
        window.__timelines["sottotitoli"] = tl;
      </script>
    </template>
  </body>
</html>
"""
    USCITA.write_text(pagina, encoding="utf-8")

    # Il contenitore in index.html, lungo quanto il video.
    host = (f'      <div\n        id="sottotitoli"\n        data-composition-id="sottotitoli"\n'
            f'        data-composition-src="compositions/sottotitoli.html"\n        data-start="0"\n'
            f'        data-duration="{durata}"\n        data-track-index="9"\n        data-width="1920"\n'
            f'        data-height="1080"\n      ></div>\n')
    if 'id="sottotitoli"' in indice:
        indice = re.sub(r'      <div\n        id="sottotitoli".*?></div>\n', lambda _: host, indice, flags=re.S)
    else:
        indice = indice.replace("\n      <!-- Voce fuori campo", "\n      <!-- Sottotitoli inglesi: voce/sottotitoli.py -->\n" + host + "\n      <!-- Voce fuori campo", 1)
    INDICE.write_text(indice, encoding="utf-8")
    mancanti = allinea.mancanti
    print(f"{len(elenco)} righe, {len(parole)} parole ({mancanti} senza tempo), video {durata:.1f} s")


if __name__ == "__main__":
    main()
