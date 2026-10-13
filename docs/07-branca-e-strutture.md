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

## Si apre già pronta: città del profilo

- `profilo_utente.py`: il profilo del paziente, per ora solo la città, scelta
  alla creazione del profilo. Sta in `profilo/profilo.json` (fuori da Git) con
  le coordinate. Rotte `GET/POST /api/profilo`. In questo computer è Ferrara.
- Aprendo "Dove andare" (`showFacilitiesPanel` in `static/app.js`) non si scrive
  nulla: città dal profilo, specialità dell'ultimo referto che ne ha una (o
  quella del referto da cui si è premuto "Cerca specialisti vicino a me"),
  mappa ed elenco subito. Cambiando specialità o distanza la ricerca riparte da sola.
- "La tua città: Ferrara · Cambia" apre il campo per cambiarla (si salva nel
  profilo); "Usa la mia posizione solo per ora" non tocca il profilo.
- Senza profilo, la sezione chiede la città e la ricorda.

## Strutture vicine (OpenStreetMap)

1. `geocode()`: città o indirizzo → coordinate con Nominatim (solo Italia). Prima
   con `featureType=city`: senza, "Ferrara" diventa il centro della **provincia**,
   a 20 km dalla città. Poi ricerca libera, per indirizzi e paesi.
2. `find_facilities()`: query **leggera** a Overpass (solo filtri sui tag
   `healthcare` e `amenity` clinic/doctors/hospital), il filtro per branca si
   fa in Python. Gruppi (`match`), nell'ordine:
   1. `specialita` / `nome`: dichiarano la specialità o la hanno nel nome → "Si occupano di ...";
   2. `ospedale`: ospedali, case di cura, poliambulatori → "Chiedi del reparto";
   3. `altro`: studi e ambulatori **senza** specialità dichiarata (chiusi di
      default, "chiedi prima di andare"). Chi dichiara un'altra specialità è escluso;
      farmacie, dentisti e simili pure.
   Ogni struttura ha tipo in italiano (`kind_label`), specialità dichiarate
   tradotte (`specialita`), distanza, indirizzo, telefono, sito. Fino a 200 risultati.
3. Server in ordine (`OVERPASS_URLS`): `overpass-api.de`, poi il mirror
   `maps.mail.ru` (il 13/10 rispondeva quando il principale dava 504), poi gli altri.
4. Cache su disco in `strutture_cache/` (fuori da Git), coordinate arrotondate a
   ~100 m: una zona già cercata funziona anche se Overpass è giù.

A OpenStreetMap vanno solo zona e coordinate, mai il referto
([[09-trace-e-privacy]]).

**Limite dei dati:** OSM non elenca i singoli professionisti né i reparti degli
ospedali. A Ferrara, entro 10 km, ci sono 8 tra ospedali, case di cura e
poliambulatori, uno studio oculistico e pochi altri studi. Per un elenco
completo di specialisti servirebbe una fonte ufficiale (anagrafe regionale
delle strutture, dataset del Ministero con i reparti per ospedale).

## Prima di una demo

Il server pubblico Overpass è spesso sovraccarico (504 o timeout per tutta la
giornata del 13/10). Ferrara è già in cache su questo computer. Per altre città:

```bash
python strutture_sanitarie.py "Milano" --raggio 10
```

Copertura OSM delle specialità parziale: spesso escono soprattutto ospedali.
Fonte complementare possibile: dataset del Ministero della Salute "posti letto
per stabilimento ospedaliero e disciplina" (solo ospedali, dati per struttura
fino al 2019, senza coordinate). Vedi [[14-problemi-noti-e-prossimi-passi]].

Test: classe `FacilitiesTests` ([[12-test-e-sviluppo]]).
