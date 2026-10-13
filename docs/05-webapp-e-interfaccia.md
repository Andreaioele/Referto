---
tags: [area/interfaccia]
aggiornato: 2026-10-13
---

# Webapp e interfaccia

Torna a [[00-indice]] · Parte di [[02-architettura]].

## Avvio

```bash
uv run --no-project --with-requirements requirements.txt python web_app.py --port 7860 --model <modello> --senza-decision-model
```

Poi apri http://127.0.0.1:7860. Opzioni: `--host`, `--port`, `--model`,
`--ollama-url`, `--timeout`, `--decision-model`, `--senza-decision-model`, `--debug`.
Senza `--debug` Flask non ricarica il template: dopo una modifica a
`templates/index.html` va riavviato il server (i file in `static/` invece si
ricaricano, grazie al parametro `?v=` negli URL: alzalo quando li cambi).

## Rotte API (`web_app.py`)

| Rotta | Cosa fa | Nota |
|---|---|---|
| `POST /api/analyze/text\|pdf\|image` | Analisi completa di un referto | [[03-pipeline-spiegazione]] |
| `POST /api/analyze/dataset`, `GET /api/analyze/jobs/<id>` | Dataset JSONL in background | [[10-dataset-e-valutazione]] |
| `GET /api/datasets/predefined` | Dataset del repo | [[10-dataset-e-valutazione]] |
| `GET /api/traces`, `/api/traces/<id>` | Cronologia tecnica | [[09-trace-e-privacy]] |
| `POST /api/benchmark`, `/api/benchmark/dataset`, `GET /api/benchmarks...` | Benchmark A/B | [[04-decision-model]] |
| `GET /api/glossary` | Parole salvate, con i referti in cui compaiono | [[06-glossario-hpo]] |
| `GET /api/branches`, `/api/geocode`, `/api/facilities`, `GET/POST /api/profilo` | Specialità, mappa e città del profilo | [[07-branca-e-strutture]] |
| `GET/DELETE /api/referti/<id>`, `GET /api/referti`, `POST /api/referti/<id>/farmaci` | Storico | [[08-referti-e-farmaci-aifa]] |
| `GET /api/farmaci`, `/api/farmaci/cerca`, `/api/farmaci/<cod>/foglietto` | Farmaci e foglietti | [[08-referti-e-farmaci-aifa]] |

## Sezioni dell'interfaccia

Barra laterale in tre gruppi (`templates/index.html`, logica in `static/app.js`):

- **Spiegami un referto:** un'unica sezione (`panel-explain`). In alto tre
  grandi pulsanti (`.mode`: File, Foto, Testo); sotto compare solo lo
  strumento scelto (`.mode-panel`):
  - **File:** riquadro per caricare il PDF;
  - **Foto:** fotocamera dal vivo con `getUserMedia` (fotocamera posteriore se
    c'è), «Scatta la foto», anteprima, «Rifai la foto». La foto scattata finisce
    nello stesso campo del modulo (`#photo-input`, tramite `DataTransfer`), quindi
    l'invio è quello di sempre. Se la fotocamera non è disponibile o è negata,
    resta «Oppure scegli una foto già salvata». La fotocamera si spegne cambiando
    modalità o sezione e all'invio;
  - **Testo:** riquadro per scrivere o incollare.

  Il risultato compare sotto, in `#result-explain`. Serve un contesto sicuro
  (localhost o HTTPS) perché il browser conceda la fotocamera.
- **Il tuo archivio:** I miei referti, I miei farmaci, Terminologie, Dove andare.
- **Strumenti per il team:** Dataset, Performance, Cronologia. Nascosti di
  default; il link "Mostra strumenti per il team" in fondo alla barra li
  mostra (classe `advanced` su `body`, scelta salvata in `localStorage`).
  Tutto ciò che ha classe `advanced-only` (nome del modello, link alle trace,
  contatore caratteri, link OpenStreetMap) segue lo stesso interruttore.

Schermata del risultato (`showSingleResult`) e dettaglio di un referto
(`showReportDetail`) condividono la struttura:

1. la spiegazione con i titoli "umani";
2. **Per saperne di più** (`renderMoreSections`): voci a scomparsa per
   Terminologie, Farmaci scritti nel referto, Chi se ne occupa, Testo originale.

Il foglietto illustrativo si apre in una finestra sopra la pagina
(`openLeaflet`, `#leaflet-modal`).

## Principi di interfaccia (obiettivo: utilizzabile da una persona di 70 anni)

Decisi il 13/10/2026; valgono per ogni nuova schermata:

- **Stesso tema:** colori (variabili in `:root` di `app.css`), font e
  impostazione non si toccano.
- **Poco alla volta:** in vista solo l'essenziale; dettagli tecnici, fonti e
  dati secondari in `<details>` ("Altre informazioni", "Dettagli per chi vuole
  approfondire").
- **Parole semplici:** "Premi qui per scegliere il file", "Quanto", "Perché",
  niente sigle o termini tecnici nei testi visibili.
- **Grande e comodo:** testo della spiegazione 18 px, pulsante principale
  grande, aree da premere ampie (blocco "Leggibilità" in fondo ad `app.css`).
- **Un'azione principale per schermata,** con lo stesso nome ovunque
  ("Spiega il referto", "Leggi il foglietto illustrativo").
- **Sicurezza sempre visibile:** 112 per le urgenze, "parlane con il medico",
  "non è un consiglio di Referto".

## Mappa (Leaflet)

`leaflet@1.9.4` da unpkg e tile di OpenStreetMap: serve internet. Vedi
[[07-branca-e-strutture]].
