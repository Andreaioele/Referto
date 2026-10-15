"""Estrae i luoghi sanitari della città di Milano da Overture Maps (places).

Overture pubblica i luoghi come file Parquet su uno storage pubblico (S3), senza
chiave né account, con licenza CDLA Permissive 2.0. DuckDB legge solo le parti
dei file che cadono nel rettangolo di Milano.

Lo lancia scripts/costruisci-strutture.ts (npm run strutture), con uv:

    uv run --no-project --with duckdb==1.4.1 python -I scripts/estrai_overture.py OUTPUT.json [RELEASE]

Scrive un JSON con i soli campi che servono; la scelta di cosa tenere e come
classificarlo è nello script TypeScript.
"""

import json
import sys
import urllib.request

import duckdb

BUCKET = "overturemaps-us-west-2"
# Rettangolo che contiene il Comune di Milano (lo stesso di costruisci-strutture.ts).
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 45.38, 45.54, 9.04, 9.28


def ultima_release() -> str:
    """La release più recente pubblicata nel bucket (es. 2026-09-23.1)."""
    url = f"https://{BUCKET}.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/"
    testo = urllib.request.urlopen(url, timeout=60).read().decode()
    release = [p.split("/")[1] for p in testo.split("<Prefix>")[1:] if p.startswith("release/2")]
    return sorted(r.split("<")[0] for r in release)[-1]


def main() -> None:
    uscita = sys.argv[1]
    release = sys.argv[2] if len(sys.argv) > 2 else ultima_release()
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    righe = con.execute(
        f"""
        SELECT id, names.primary AS nome, taxonomy.primary AS categoria, taxonomy.alternates AS alternative,
               confidence, operating_status AS stato,
               addresses[1].freeform AS indirizzo, addresses[1].postcode AS cap, addresses[1].locality AS citta,
               phones[1] AS telefono, websites[1] AS sito, [s.dataset FOR s IN sources] AS fonti,
               ST_Y(geometry) AS lat, ST_X(geometry) AS lon
        FROM read_parquet('s3://{BUCKET}/release/{release}/theme=places/type=place/*', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {LON_MIN} AND {LON_MAX} AND bbox.ymin BETWEEN {LAT_MIN} AND {LAT_MAX}
          AND list_contains(taxonomy.hierarchy, 'health_care')
          AND lower(trim(addresses[1].locality)) IN ('milano', 'milan')
        """
    ).fetchall()
    colonne = [c[0] for c in con.description]
    luoghi = [dict(zip(colonne, r)) for r in righe]
    with open(uscita, "w", encoding="utf-8") as f:
        json.dump({"release": release, "luoghi": luoghi}, f, ensure_ascii=False)
    print(f"Overture {release}: {len(luoghi)} luoghi sanitari a Milano -> {uscita}")


if __name__ == "__main__":
    main()
