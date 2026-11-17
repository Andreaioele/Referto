"""Copia il tema del frontend (portale + widget Referto) per le scene del video.

Legge `frontend/src/index.css` e scrive `assets/ui/referto-ui.css`:
- tutte le regole finiscono dentro `.ui`, così il tema non tocca il resto del
  video (`:root` e `body` diventano `.ui` stesso);
- solo la versione per computer: niente media query, animazioni e transizioni
  (il video le muove con GSAP, fotogramma per fotogramma);
- Avenir, che non si può distribuire, diventa Nunito Sans; Public Sans resta,
  con i font in `assets/fonts/`.

Uso (dalla cartella resources/video), dopo ogni modifica al tema del frontend:
    python3 ui/costruisci_css.py
"""

import re
from pathlib import Path

CARTELLA = Path(__file__).resolve().parent.parent
SORGENTE = CARTELLA.parent.parent / "frontend" / "src" / "index.css"
USCITA = CARTELLA / "assets" / "ui" / "referto-ui.css"

FONT = """@font-face {
  font-family: "Public Sans";
  src: url("../fonts/public-sans-latin-wght.woff2") format("woff2");
  font-weight: 100 900;
}
@font-face {
  font-family: "Nunito Sans";
  src: url("../fonts/nunito-sans-latin-wght.woff2") format("woff2");
  font-weight: 200 1000;
}
"""


def togli_blocchi(css: str, inizio: re.Pattern) -> str:
    """Toglie ogni blocco `@... { ... }` che comincia con `inizio`, graffe comprese."""
    uscita, i = [], 0
    while (trovato := inizio.search(css, i)) is not None:
        uscita.append(css[i : trovato.start()])
        j = css.index("{", trovato.start())
        profondita = 0
        while True:
            if css[j] == "{":
                profondita += 1
            elif css[j] == "}":
                profondita -= 1
                if profondita == 0:
                    break
            j += 1
        i = j + 1
    uscita.append(css[i:])
    return "".join(uscita)


def main() -> None:
    css = SORGENTE.read_text(encoding="utf-8")
    css = togli_blocchi(css, re.compile(r"@media|@keyframes"))
    css = re.sub(r"^\s*(animation|transition)[a-z-]*:[^;]*;\n", "", css, flags=re.M)
    css = re.sub(r"^:root \{", "& {", css, flags=re.M)
    css = re.sub(r"^body \{", "& {", css, flags=re.M)
    css = css.replace("'Avenir Next', Avenir,", "'Nunito Sans',")
    testa = (
        "/* Generato da ui/costruisci_css.py a partire da frontend/src/index.css:\n"
        "   non modificare a mano, rigenera. */\n"
    )
    USCITA.parent.mkdir(parents=True, exist_ok=True)
    USCITA.write_text(testa + FONT + ".ui {\n" + css + "\n}\n", encoding="utf-8")
    print(f"Scritto {USCITA.relative_to(CARTELLA)} ({len(css)} caratteri)")


if __name__ == "__main__":
    main()
