---
tags: [area/funzioni]
aggiornato: 2026-10-13
---

# Specialità del referto e "Dove andare"

Torna a [[00-indice]] · Mostrato in [[05-webapp-e-interfaccia]] come "Dove andare".

Tutto in `strutture_sanitarie.py`.

## Specialità (branca) del referto

- `BRANCHES`: 19 branche (radiologia, cardiologia, ..., medicina generale), ognuna
  con valori OSM di `healthcare:speciality`, radici del nome delle strutture e
  parole chiave del referto.
- `classify_report()`: il modello sceglie da un **elenco chiuso** (`format` con
  JSON schema ed `enum`). Se non risponde, `keyword_branch()` conta le parole chiave.
- Le parole chiave da sole indovinano ~45% delle specialità di MTSamples (le
  etichette si sovrappongono, es. chirurgia e ortopedia): sono solo una riserva.
- Il risultato va nella trace (`branch`) e dà il titolo ai referti incollati
  nello storico ("Referto di neurologia", [[08-referti-e-farmaci-aifa]]).

## Strutture vicine (OpenStreetMap)

1. `geocode()`: città o indirizzo → coordinate con Nominatim (solo Italia).
2. `find_facilities()`: query **leggera** a Overpass (solo filtri sui tag
   `healthcare` e `amenity` clinic/doctors/hospital), il filtro per branca si
   fa in Python. Ordine:
   1. specialità dichiarata in OSM;
   2. branca nel nome della struttura;
   3. ospedali.
3. Tentativi su più server (`OVERPASS_URLS`), attesa massima ~1,5 minuti.
4. Cache su disco in `strutture_cache/` (fuori da Git), coordinate arrotondate a
   ~100 m: una zona già cercata funziona anche se Overpass è giù.

A OpenStreetMap vanno solo zona e coordinate, mai il referto
([[09-trace-e-privacy]]).

## Prima di una demo

Il server pubblico Overpass è spesso sovraccarico (504 o timeout per tutta la
giornata del 13/10). Precaricare le città:

```bash
python strutture_sanitarie.py "Milano" --raggio 10
```

Copertura OSM delle specialità parziale: spesso escono soprattutto ospedali.
Fonte complementare possibile: dataset del Ministero della Salute "posti letto
per stabilimento ospedaliero e disciplina" (solo ospedali, dati per struttura
fino al 2019, senza coordinate). Vedi [[14-problemi-noti-e-prossimi-passi]].

Test: classe `FacilitiesTests` ([[12-test-e-sviluppo]]).
