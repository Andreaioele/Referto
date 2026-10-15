#!/usr/bin/env python3
"""Misura quanti termini dei referti di esempio copre il glossario a strati.

    uv run --no-project --with wordfreq python glossario/misura_copertura.py

Referti usati:
- datasets/radgraph_it_50.jsonl: 50 referti di radiografie del torace in
  italiano, con le entità (anatomia e osservazioni) annotate a mano: sono il
  denominatore oggettivo;
- i referti di esempio del portale (frontend/src/portale/dati.ts): esami del
  sangue, visita cardiologica, radiografia, visita oculistica.

Una parola è "difficile" se è rara nell'italiano comune (frequenza Zipf < 3,5
secondo wordfreq). Si misura quante parole difficili cadono dentro un termine
del glossario, strato per strato e con tutti gli strati insieme. Il rapporto
va in glossario/copertura.md.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List, Set, Tuple

from wordfreq import zipf_frequency

sys.path.insert(0, str(Path(__file__).resolve().parent))
from costruisci_glossario_strati import (  # noqa: E402
    MAX_PAROLE, SOGLIA_PAROLA_COMUNE, USCITA, estratti_wikipedia, normalizza, radice,
)

CARTELLA = Path(__file__).resolve().parent
RADICE_REPO = CARTELLA.parent.parent
RADGRAPH = CARTELLA.parent / "datasets" / "radgraph_it_50.jsonl"
RAPPORTO = CARTELLA / "copertura.md"
SOGLIA_DIFFICILE = 3.5
COMBINAZIONI = {
    "curato": {"curato"},
    "hpo": {"hpo"},
    "wikidata": {"wikidata"},
    "curato + hpo": {"curato", "hpo"},
    "tutti": {"curato", "hpo", "wikidata"},
}


def difficile(parola: str) -> bool:
    return len(parola) >= 3 and parola.isalpha() and zipf_frequency(parola, "it") < SOGLIA_DIFFICILE


def referti_portale() -> List[Dict[str, str]]:
    codice = (
        "const { documenti } = await import('./frontend/src/portale/dati.ts');"
        "console.log(JSON.stringify(documenti.filter(d => d.referto).map(d => ({ id: d.id, testo: d.referto.testo }))));"
    )
    uscita = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", codice],
        cwd=RADICE_REPO, capture_output=True, text=True, check=True,
    )
    return json.loads(uscita.stdout)


def referti_radgraph() -> List[Tuple[List[str], List[Tuple[int, int, str]]]]:
    """Per ogni referto: le parole e le entità annotate (inizio, fine compresa, tipo)."""
    referti = []
    for riga in RADGRAPH.read_text(encoding="utf-8").splitlines():
        dato = json.loads(riga)
        parole = [p for frase in dato["sentences"] for p in frase]
        entita = [(a, b, tipo) for frase in dato["ner"] for a, b, tipo in frase]
        referti.append((parole, entita))
    return referti


class Glossario:
    def __init__(self, dati: Dict, strati: Set[str]):
        self.voci = {v["id"]: v for v in dati["voci"]}
        self.indice = {k: i for k, i in dati["indice"].items() if self.voci[i]["strato"] in strati}

    def coperte(self, parole: List[str]) -> Tuple[Set[int], List[Tuple[int, int, str]]]:
        """Indici delle parole coperte e termini trovati (inizio, fine esclusa, id), corrispondenza più lunga."""
        radici = [radice(p) for p in parole]
        coperte: Set[int] = set()
        trovati = []
        i = 0
        while i < len(radici):
            for lunghezza in range(min(MAX_PAROLE, len(radici) - i), 0, -1):
                voce = self.indice.get(" ".join(radici[i:i + lunghezza]))
                # Una parola comune che ha solo la radice in comune con un termine non conta ("stato" non è STAT).
                if voce and lunghezza == 1 and self.voci[voce]["strato"] != "curato" \
                        and zipf_frequency(parole[i], "it") >= SOGLIA_PAROLA_COMUNE:
                    voce = None
                if voce:
                    coperte.update(range(i, i + lunghezza))
                    trovati.append((i, i + lunghezza, voce))
                    i += lunghezza
                    break
            else:
                i += 1
        return coperte, trovati


def parole_normalizzate(testo: str) -> List[str]:
    return normalizza(testo).split()


def misura(dati: Dict) -> str:
    radgraph = referti_radgraph()
    portale = referti_portale()
    righe = ["# Copertura del glossario a strati", "",
             f"Glossario: {dati['chiavi']} chiavi; voci per strato {dati['voci_per_strato']} (creato {dati['creato']}).", "",
             "Parola difficile: Zipf < 3,5 in italiano (wordfreq). Corrispondenza sulla radice (singolare/plurale).", ""]

    # 1. Entità annotate di RadGraph-IT: per ogni entità, le parole difficili.
    righe += ["## RadGraph-IT (50 radiografie del torace, entità annotate)", "",
              "| Strati | Parole difficili coperte (occorrenze) | Parole difficili diverse coperte | Entità difficili coperte del tutto |",
              "|---|---|---|---|"]
    mancanti_rg: Counter = Counter()
    for nome, strati in COMBINAZIONI.items():
        glossario = Glossario(dati, strati)
        occ = occ_ok = ent = ent_ok = 0
        diverse: Dict[str, bool] = {}
        for parole, entita in radgraph:
            norm = [normalizza(p) for p in parole]
            # Le parole del referto, normalizzate e senza punteggiatura, con il loro indice originale.
            posizioni = [i for i, p in enumerate(norm) if p and " " not in p]
            sequenza = [norm[i] for i in posizioni]
            coperte_seq, _ = glossario.coperte(sequenza)
            coperte = {posizioni[j] for j in coperte_seq}
            for a, b, _tipo in entita:
                difficili = [i for i in range(a, b + 1) if i < len(norm) and difficile(norm[i])]
                if not difficili:
                    continue
                ent += 1
                ent_ok += all(i in coperte for i in difficili)
                for i in difficili:
                    occ += 1
                    occ_ok += i in coperte
                    diverse[norm[i]] = diverse.get(norm[i], False) or i in coperte
                    if nome == "tutti" and i not in coperte:
                        mancanti_rg[norm[i]] += 1
        perc = lambda a, b: f"{a}/{b} ({100 * a / b:.0f}%)" if b else "-"
        righe.append(f"| {nome} | {perc(occ_ok, occ)} | {perc(sum(diverse.values()), len(diverse))} | {perc(ent_ok, ent)} |")
    righe += ["", "Parole difficili non coperte (tutti gli strati), le più frequenti:", "",
              ", ".join(f"{p} ({n})" for p, n in mancanti_rg.most_common(40)), ""]

    # 2. Referti del portale: parole difficili e termini trovati.
    righe += ["## Referti del portale", ""]
    glossario = Glossario(dati, COMBINAZIONI["tutti"])
    trovati_tutti = []
    for referto in portale:
        parole = parole_normalizzate(referto["testo"])
        coperte, trovati = glossario.coperte(parole)
        difficili = sorted({p for p in parole if difficile(p)})
        coperte_diff = sorted({parole[i] for i in coperte if difficile(parole[i])})
        righe += [f"### {referto['id']}", "",
                  f"Parole difficili coperte: {len(coperte_diff)}/{len(difficili)}. "
                  f"Non coperte: {', '.join(sorted(set(difficili) - set(coperte_diff))) or 'nessuna'}.", "",
                  "| Nel referto | Voce | Strato | Definizione |", "|---|---|---|---|"]
        for a, b, voce_id in trovati:
            voce = glossario.voci[voce_id]
            trovati_tutti.append(voce)
            righe.append(f"| {' '.join(parole[a:b])} | {voce['nome']} | {voce['strato']} | {{{voce_id}}} |")
        righe.append("")

    # Definizioni dei termini trovati nel portale (per Wikidata servono le frasi di Wikipedia).
    estratti = estratti_wikipedia([v["wikipedia"] for v in trovati_tutti if v.get("wikipedia")])
    testo = "\n".join(righe)
    for voce in trovati_tutti:
        definizione = voce.get("definizione") or estratti.get(voce.get("wikipedia") or "") or voce.get("descrizione_breve") or "(nessuna)"
        if voce["lingua_definizione"] == "en":
            definizione = f"[EN] {definizione}"
        testo = testo.replace("{" + voce["id"] + "}", definizione.replace("\n", " ").replace("|", "/")[:220])

    # 3. Termini trovati in RadGraph-IT: quanti hanno una definizione in italiano da citare.
    comuni: Counter = Counter()
    trovati_rg: Dict[str, Dict] = {}
    for parole, _ in radgraph:
        sequenza = [n for n in (normalizza(p) for p in parole) if n and " " not in n]
        _, trovati = glossario.coperte(sequenza)
        for _a, _b, voce_id in trovati:
            trovati_rg[voce_id] = glossario.voci[voce_id]
    estratti = estratti_wikipedia([v["wikipedia"] for v in trovati_rg.values() if v.get("wikipedia")])
    testo += "\n## Termini diversi trovati in RadGraph-IT: definizione disponibile\n\n"
    testo += "| Strato | Termini | Definizione in italiano | Solo definizione inglese o breve |\n|---|---|---|---|\n"
    for strato in ("curato", "hpo", "wikidata"):
        voci = [v for v in trovati_rg.values() if v["strato"] == strato]
        con_it = [v for v in voci if (v["lingua_definizione"] == "it" and v.get("definizione")) or estratti.get(v.get("wikipedia") or "")]
        testo += f"| {strato} | {len(voci)} | {len(con_it)} | {len(voci) - len(con_it)} |\n"
    esempi = [v for v in trovati_rg.values() if v["strato"] == "wikidata" and estratti.get(v.get("wikipedia") or "")][:12]
    testo += "\nEsempi di definizioni da Wikipedia (prime due frasi):\n\n"
    testo += "\n".join(f"- **{v['nome']}** ({', '.join(v['codici'])}): {estratti[v['wikipedia']][:240]}" for v in esempi) + "\n"

    # 4. Parole comuni prese come termini: possibili falsi positivi.
    for parole, _ in radgraph:
        sequenza = [n for n in (normalizza(p) for p in parole) if n and " " not in n]
        _, trovati = glossario.coperte(sequenza)
        for a, b, voce_id in trovati:
            if not any(difficile(p) for p in sequenza[a:b]):
                comuni[f"{' '.join(sequenza[a:b])} → {glossario.voci[voce_id]['nome']} ({glossario.voci[voce_id]['strato']})"] += 1
    testo += "\n## Termini trovati fatti solo di parole comuni (da controllare)\n\n"
    testo += "\n".join(f"- {t}: {n}" for t, n in comuni.most_common(30)) + "\n"
    return testo


def main() -> None:
    dati = json.loads(USCITA.read_text(encoding="utf-8"))
    rapporto = misura(dati)
    RAPPORTO.write_text(rapporto, encoding="utf-8")
    print(rapporto)


if __name__ == "__main__":
    main()
