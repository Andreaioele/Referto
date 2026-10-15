#!/usr/bin/env python3
"""Costruisce il glossario medico a strati per lo strumento cercaTermine (prototipo).

    uv run --no-project --with wordfreq python glossario/costruisci_glossario_strati.py
    uv run --no-project --with wordfreq python glossario/costruisci_glossario_strati.py --estratti

Tre strati, in ordine di priorità quando la stessa parola compare in più fonti:
1. curato: termini frequenti nei referti scritti a mano in italiano semplice
   (glossario/termini_curati.json), da far revisionare a un medico;
2. HPO: segni, sintomi e reperti con il nome italiano (glossario/hpo_glossario.json);
3. Wikidata: voci con almeno un codice medico (MeSH, ICD, LOINC, UBERON, FMA,
   SNOMED CT, HPO), con etichetta, sinonimi e descrizione in italiano (CC0) e
   la voce di Wikipedia in italiano (CC BY-SA 4.0), da cui con --estratti si
   prendono le prime frasi come definizione citabile.

Le risposte di Wikidata e Wikipedia restano in glossario/cache_strati/ (fuori
da Git); il risultato è glossario/glossario_strati.json.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Iterable, List

from wordfreq import top_n_list, zipf_frequency

CARTELLA = Path(__file__).resolve().parent
CACHE = CARTELLA / "cache_strati"
USCITA = CARTELLA / "glossario_strati.json"
CURATI = CARTELLA / "termini_curati.json"
HPO = CARTELLA / "hpo_glossario.json"

SPARQL = "https://query.wikidata.org/sparql"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WIKIPEDIA_API = "https://it.wikipedia.org/w/api.php"
AGENTE = "RefertoGlossario/0.1 (https://github.com/Andreaioele/Referto)"

# Proprietà di Wikidata che rendono "medica" una voce, con il nome del codice.
PROPRIETA = {
    "P486": "MeSH",
    "P494": "ICD-10",
    "P493": "ICD-9",
    "P4229": "ICD-10-CM",
    "P7807": "ICD-11",
    "P4338": "LOINC",
    "P1554": "UBERON",
    "P1402": "FMA",
    "P5806": "SNOMED CT",
    "P3841": "HPO",
}

# Voci escluse: i farmaci (codice ATC) li spiega cercaFarmaci con la fonte AIFA.
PROPRIETA_ESCLUSE = {"P267": "ATC"}

# Una parola sola più comune di così nella lingua italiana non entra come chiave
# (esclude "uomo", "Italia", "cuore" da Wikidata: "cuore" lo spiega solo lo strato curato).
SOGLIA_PAROLA_COMUNE = 4.0
MAX_PAROLE = 6


def normalizza(testo: str) -> str:
    """Minuscolo, senza accenti, solo lettere e cifre separate da spazi."""
    testo = unicodedata.normalize("NFKD", testo.lower())
    testo = "".join(c for c in testo if not unicodedata.combining(c))
    return " ".join(re.findall(r"[a-z0-9]+", testo))


def radice(parola: str) -> str:
    """Radice leggera per singolare e plurale: "polmoni" e "polmone" → "polmon", "reni" e "rene" → "ren"."""
    if len(parola) < 4 or parola[-1] not in "aeiou":
        return parola
    parola = parola[:-1]
    if parola.endswith(("ch", "gh")):
        parola = parola[:-1]
    return parola


def chiave(testo: str) -> str:
    return " ".join(radice(p) for p in normalizza(testo).split())


def chiave_ammessa(nome: str) -> bool:
    parole = normalizza(nome).split()
    if not parole or len(parole) > MAX_PAROLE or len(" ".join(parole)) < 3:
        return False
    if all(p.isdigit() for p in parole):
        return False
    if len(parole) == 1 and zipf_frequency(parole[0], "it") >= SOGLIA_PAROLA_COMUNE:
        return False
    return True


# ── Rete con cache ──

def scarica(url: str, parametri: Dict[str, str], tentativi: int = 5) -> Any:
    indirizzo = f"{url}?{urllib.parse.urlencode(parametri)}"
    for tentativo in range(tentativi):
        richiesta = urllib.request.Request(indirizzo, headers={"User-Agent": AGENTE, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(richiesta, timeout=120) as risposta:
                return json.loads(risposta.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as errore:
            attesa = 5 * (tentativo + 1)
            print(f"  riprovo tra {attesa}s ({errore})", file=sys.stderr)
            time.sleep(attesa)
    raise RuntimeError(f"Non riesco a scaricare {url}")


def a_blocchi(elementi: List[str], dimensione: int) -> Iterable[List[str]]:
    for inizio in range(0, len(elementi), dimensione):
        yield elementi[inizio:inizio + dimensione]


def codici_wikidata() -> Dict[str, Dict[str, str]]:
    """Per ogni voce Wikidata con un codice medico: {Q123: {"MeSH": "D001", ...}} (anche ATC, per escludere i farmaci)."""
    voci: Dict[str, Dict[str, str]] = {}
    for proprieta, nome in {**PROPRIETA, **PROPRIETA_ESCLUSE}.items():
        file = CACHE / f"codici_{proprieta}.json"
        if not file.exists():
            print(f"Wikidata: voci con {nome} ({proprieta})")
            risposta = scarica(SPARQL, {"query": f"SELECT ?i ?x WHERE {{ ?i wdt:{proprieta} ?x }}", "format": "json"})
            righe = [(r["i"]["value"].rsplit("/", 1)[1], r["x"]["value"]) for r in risposta["results"]["bindings"]]
            file.write_text(json.dumps(righe), encoding="utf-8")
        for voce, codice in json.loads(file.read_text(encoding="utf-8")):
            if proprieta in PROPRIETA or voce in voci:
                voci.setdefault(voce, {}).setdefault(nome, codice)
    return voci


def entita_italiane(voci: List[str]) -> Dict[str, Dict[str, Any]]:
    """Etichetta, sinonimi, descrizione e titolo di Wikipedia in italiano, 50 voci per richiesta."""
    file = CACHE / "entita_it.jsonl"
    lette: Dict[str, Dict[str, Any]] = {}
    if file.exists():
        for riga in file.read_text(encoding="utf-8").splitlines():
            dato = json.loads(riga)
            lette[dato["id"]] = dato
    mancanti = [v for v in voci if v not in lette]
    if mancanti:
        print(f"Wikidata: etichette italiane di {len(mancanti)} voci ({len(lette)} già in cache)")
    with file.open("a", encoding="utf-8") as uscita:
        for numero, blocco in enumerate(a_blocchi(mancanti, 50)):
            for tentativo in range(10):
                risposta = scarica(WIKIDATA_API, {
                    "action": "wbgetentities", "ids": "|".join(blocco), "props": "labels|aliases|descriptions|sitelinks",
                    "languages": "it", "sitefilter": "itwiki", "format": "json", "maxlag": "5",
                })
                # Con il server carico (maxlag) arriva un errore senza entità: non va salvato come "nessun nome".
                if "entities" in risposta:
                    break
                print(f"  Wikidata: {risposta.get('error', {}).get('code', 'risposta senza entità')}, riprovo", file=sys.stderr)
                time.sleep(10 * (tentativo + 1))
            else:
                raise RuntimeError("Wikidata non risponde con le entità")
            for voce in blocco:
                entita = risposta.get("entities", {}).get(voce, {})
                dato = {
                    "id": voce,
                    "nome": entita.get("labels", {}).get("it", {}).get("value"),
                    "sinonimi": [a["value"] for a in entita.get("aliases", {}).get("it", [])],
                    "descrizione": entita.get("descriptions", {}).get("it", {}).get("value"),
                    "wikipedia": entita.get("sitelinks", {}).get("itwiki", {}).get("title"),
                }
                lette[voce] = dato
                uscita.write(json.dumps(dato, ensure_ascii=False) + "\n")
            if numero % 20 == 19:
                uscita.flush()
                print(f"  {numero * 50 + len(blocco)}/{len(mancanti)}")
            time.sleep(0.2)
    return lette


def estratti_wikipedia(titoli: List[str]) -> Dict[str, str]:
    """Prime due frasi della voce di Wikipedia in italiano, 20 titoli per richiesta."""
    file = CACHE / "estratti_itwiki.json"
    letti: Dict[str, str] = json.loads(file.read_text(encoding="utf-8")) if file.exists() else {}
    mancanti = sorted({t for t in titoli if t and t not in letti})

    def richiesta(blocco: List[str]) -> Any:
        time.sleep(0.2)
        return scarica(WIKIPEDIA_API, {
            "action": "query", "prop": "extracts", "exintro": "1", "explaintext": "1", "exsentences": "2",
            "exlimit": "20", "titles": "|".join(blocco), "redirects": "1", "format": "json", "formatversion": "2",
        })

    # Ogni richiesta impiega circa 2 secondi lato Wikipedia: tre alla volta, non di più.
    blocchi = list(a_blocchi(mancanti, 20))
    with ThreadPoolExecutor(max_workers=3) as esecutore:
        risposte = esecutore.map(richiesta, blocchi)
        for numero, (blocco, risposta) in enumerate(zip(blocchi, risposte)):
            rinomina = {r["to"]: r["from"] for r in risposta.get("query", {}).get("redirects", [])}
            for pagina in risposta.get("query", {}).get("pages", []):
                titolo = rinomina.get(pagina.get("title"), pagina.get("title"))
                letti[titolo] = (pagina.get("extract") or "").strip()
            for titolo in blocco:
                letti.setdefault(titolo, "")
            if numero % 25 == 24:
                file.write_text(json.dumps(letti, ensure_ascii=False), encoding="utf-8")
                print(f"  estratti {numero * 20 + len(blocco)}/{len(mancanti)}")
    file.write_text(json.dumps(letti, ensure_ascii=False), encoding="utf-8")
    return letti


# ── Strati ──

def strato_curato() -> List[Dict[str, Any]]:
    dati = json.loads(CURATI.read_text(encoding="utf-8"))
    return [
        {
            "id": f"curato:{normalizza(t['nome']).replace(' ', '-')}",
            "strato": "curato",
            "nome": t["nome"],
            "sinonimi": t.get("sinonimi", []),
            "definizione": t["definizione"],
            "lingua_definizione": "it",
            "fonte": dati["fonte"],
            "url": None,
            "codici": {},
        }
        for t in dati["termini"]
    ]


def strato_hpo() -> List[Dict[str, Any]]:
    dati = json.loads(HPO.read_text(encoding="utf-8"))
    return [
        {
            "id": f"hpo:{t['id']}",
            "strato": "hpo",
            "nome": t["it"],
            "sinonimi": [],
            "definizione": t.get("def_en"),
            "lingua_definizione": "en",
            "fonte": f"Human Phenotype Ontology (traduzione italiana {t['it_status'].lower()})",
            "url": f"https://hpo.jax.org/browse/term/{t['id']}",
            "codici": {"HPO": t["id"]},
            "revisionato": t["it_status"] == "OFFICIAL",
        }
        for t in dati["terms"]
        if t.get("it")
    ]


def strato_wikidata(con_estratti: bool) -> List[Dict[str, Any]]:
    codici = codici_wikidata()
    entita = entita_italiane(sorted(codici, key=lambda q: int(q[1:])))
    estratti = estratti_wikipedia([e["wikipedia"] for e in entita.values() if e.get("nome")]) if con_estratti else {}
    voci = []
    for voce, dato in entita.items():
        if not dato.get("nome") or any(n in codici.get(voce, {}) for n in PROPRIETA_ESCLUSE.values()):
            continue
        titolo = dato.get("wikipedia")
        estratto = estratti.get(titolo) if titolo else None
        voci.append({
            "id": f"wikidata:{voce}",
            "strato": "wikidata",
            "nome": dato["nome"],
            "sinonimi": dato["sinonimi"],
            "definizione": estratto or None,
            "descrizione_breve": dato.get("descrizione"),
            "lingua_definizione": "it",
            "fonte": "Wikipedia in italiano (CC BY-SA 4.0)" if estratto else "Wikidata (CC0)",
            "url": f"https://it.wikipedia.org/wiki/{urllib.parse.quote(titolo.replace(' ', '_'))}" if titolo
            else f"https://www.wikidata.org/wiki/{voce}",
            "wikipedia": titolo,
            "codici": codici.get(voce, {}),
        })
    return voci


def priorita(voce: Dict[str, Any]) -> int:
    """Più basso vince: curato, HPO revisionato, Wikidata, HPO tradotto in automatico."""
    if voce["strato"] == "curato":
        return 0
    if voce["strato"] == "hpo":
        return 1 if voce.get("revisionato") else 3
    return 2


def costruisci(con_estratti: bool, con_wikidata: bool = True) -> Dict[str, Any]:
    voci = strato_curato() + strato_hpo() + (strato_wikidata(con_estratti) if con_wikidata else [])
    indice: Dict[str, str] = {}
    scelte: Dict[str, int] = {}
    for voce in voci:
        for nome in [voce["nome"], *voce["sinonimi"]]:
            if voce["strato"] != "curato" and not chiave_ammessa(nome):
                continue
            k = chiave(nome)
            if k and (k not in indice or priorita(voce) < scelte[k]):
                indice[k] = voce["id"]
                scelte[k] = priorita(voce)
    usate = set(indice.values())
    voci = [v for v in voci if v["id"] in usate]
    conteggio = {s: sum(1 for v in voci if v["strato"] == s) for s in ("curato", "hpo", "wikidata")}
    return {
        "fonti": {
            "curato": "Redazione Referto, da far revisionare a un medico",
            "hpo": "Human Phenotype Ontology, https://hpo.jax.org/license",
            "wikidata": "Wikidata (CC0) e Wikipedia in italiano (CC BY-SA 4.0)",
        },
        "creato": time.strftime("%Y-%m-%d"),
        "voci_per_strato": conteggio,
        "chiavi": len(indice),
        "voci": voci,
        "indice": indice,
    }


BACKEND = CARTELLA.parent.parent / "backend" / "data" / "glossario_medico.json"
# Parentesi di pronuncia o etimologia all'inizio delle voci di Wikipedia: non servono a capire.
PARENTESI_INUTILI = re.compile(r"\s*\((?:[^()]*?(?:pronuncia|greco|latino|/)[^()]*?)\)")
MAX_DEFINIZIONE = 400


def pulisci_definizione(testo: str) -> str:
    testo = PARENTESI_INUTILI.sub("", " ".join(testo.split()))
    return testo if len(testo) <= MAX_DEFINIZIONE else testo[:MAX_DEFINIZIONE].rsplit(" ", 1)[0] + "…"


def esporta_backend(glossario: Dict[str, Any]) -> Dict[str, Any]:
    """Versione compatta per il backend: solo le voci con una definizione, più le parole comuni da escludere.

    Il backend riproduce normalizza() e radice() (src/terminologia/testo.ts): le chiavi devono restare uguali.
    """
    voci: Dict[str, Dict[str, Any]] = {}
    for voce in glossario["voci"]:
        definizione = voce.get("definizione")
        fonte, lingua = voce["fonte"], voce["lingua_definizione"]
        if not definizione and voce.get("descrizione_breve"):
            definizione, fonte, lingua = voce["descrizione_breve"], "Wikidata (CC0)", "it"
        if not definizione:
            continue
        voci[voce["id"]] = {
            "nome": voce["nome"],
            "definizione": pulisci_definizione(definizione),
            "lingua": lingua,
            "fonte": fonte,
            "url": voce.get("url"),
            "strato": voce["strato"],
        }
    indice = {k: i for k, i in glossario["indice"].items() if i in voci}
    # Parole comuni che hanno la stessa radice di un termine di una parola sola: da sole non sono quel termine
    # ("stato" non è la proteina STAT). Lo strato curato fa eccezione.
    parole_singole = {k for k, i in indice.items() if " " not in k and voci[i]["strato"] != "curato"}
    escluse = sorted({
        p for p in (normalizza(w) for w in top_n_list("it", 60000))
        if " " not in p and zipf_frequency(p, "it") >= SOGLIA_PAROLA_COMUNE and chiave(p) in parole_singole
    })
    return {
        "fonti": glossario["fonti"],
        "creato": glossario["creato"],
        "voci": voci,
        "indice": indice,
        "escluse": escluse,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--estratti", action="store_true", help="scarica anche le prime frasi di Wikipedia (lento)")
    parser.add_argument("--senza-wikidata", action="store_true", help="solo strati curato e HPO (prova veloce)")
    parser.add_argument("--backend", action="store_true", help=f"scrive anche {BACKEND.relative_to(CARTELLA.parent.parent)}")
    args = parser.parse_args()
    CACHE.mkdir(exist_ok=True)
    glossario = costruisci(args.estratti, not args.senza_wikidata)
    USCITA.write_text(json.dumps(glossario, ensure_ascii=False), encoding="utf-8")
    print(f"{USCITA.name}: {glossario['chiavi']} chiavi, voci per strato {glossario['voci_per_strato']}")
    if args.backend:
        compatto = esporta_backend(glossario)
        BACKEND.write_text(json.dumps(compatto, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{BACKEND.name}: {len(compatto['voci'])} voci, {len(compatto['indice'])} chiavi, "
              f"{len(compatto['escluse'])} parole escluse, {BACKEND.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
