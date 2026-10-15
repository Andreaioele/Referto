---
tags: [area/progetto]
aggiornato: 2026-10-16
---

# Problemi noti e prossimi passi

Torna a [[00-indice]].

Aggiornare questa nota quando un problema si risolve (e scriverlo in
[[registro-modifiche]]).

## Problemi noti

| Problema | Dove | Nota |
|---|---|---|
| Sezione Indicazioni che incolla il referto intero o perde il piano di cura (MTSamples) | `extract_document_recommendations()` | [[03-pipeline-spiegazione]] |
| MedGemma escluso dal regolamento ma ancora default | `DEFAULT_MODEL` | [[11-modelli-e-ollama]] |
| `"think": false`, input da file di testo, pipeline SLURM non sono su `main` | branch `output-test` | [[13-git-e-workflow]] |
| Nessun client OpenAI: niente AMD Token Factory | chiamate Ollama native | [[11-modelli-e-ollama]] |
| Analisi lenta: almeno 4 chiamate al modello | `web_app.py` | [[02-architettura]] |
| Overpass spesso sovraccarico | `strutture_sanitarie.py` | [[07-branca-e-strutture]] |
| Copertura OSM delle specialità parziale | OpenStreetMap | [[07-branca-e-strutture]] |
| HPO senza anatomia e procedure | glossario | [[06-glossario-hpo]] |
| Glossario a strati (`cercaTermine`): copre circa metà delle parole difficili di RadGraph-IT; mancano soprattutto aggettivi e descrittori radiologici («ispessimento», «pervio»); restano abbinamenti sbagliati da Wikidata («radiazioni» → particella α); lo strato curato è una bozza non revisionata da un medico | `backend/data/glossario_medico.json` | [[specifica-terminologia]] |
| Una spiegazione guasta (solo markup DSML) è nella cache dell'anteprima per il referto di prova «RADIOGRAFIA DEL TORACE in due proiezioni…» (16/10/2026, conversazione `6ad156d3fa274bf09627fcf8`): sparisce al prossimo cambio di prompt o va cancellata a mano da `spiegazioni` | MongoDB | [[15-backend]] |
| L'agente Mother su Evolus non ha `cercaTermine` e ha ancora il prompt senza le regole TERMINI: sincronizzarlo solo dopo aver aggiunto lo strumento (Web API `/api/terminologia/cerca`) | Evolus | [[15-backend]] |
| Cache del glossario indipendente dal modello | `parole_salvate.json` | [[06-glossario-hpo]] |
| Referti vuoti o quasi nei dataset | `datasets/` | [[10-dataset-e-valutazione]] |
| Gemma 4 31B non ancora provato sul cluster | `output-test` | [[10-dataset-e-valutazione]] |
| Il Mother agent (DeepSeek-V4.1 su Token Factory) risponde in 1-3 minuti e con più richieste insieme va oltre il limite (HTTP 422 "sovraccarico") | Evolus | [[15-backend]] |
| Farmaci: nessuna tolleranza agli errori di battitura; alias esteri con dosaggio non riconosciuti ("Lipitor 40 mg") | `lookup()`, `backend/` | [[15-backend]] |
| Domande sul foglietto lente (30-40 secondi): la risposta passa dal Mother agent | `/api/foglietti/:cod/domande` | [[15-backend]] |
| MongoDB Atlas non accetta le connessioni da Vercel (IP non in Network Access): in produzione cache, conversazioni e trace non si salvano; la chat funziona senza archivio | Atlas | [[15-backend]] |
| Risolto: con `MONGODB_URI` su Vercel il backend non partiva (Nest aspettava MongoDB all'avvio, «No exports found in module»), 500 su tutte le rotte; ora la connessione è pigra | `connessione-mongo.ts` | [[15-backend]] |
| Login fake: senza `X-Utente-Id` tutte le conversazioni (e la cache) vanno all'utente predefinito `paziente`; chi conosce un id utente ne legge i dati | `src/sessioni/` | [[15-backend]] |
| Una spiegazione in cache non si rigenera finché non cambiano prompt o modello (nessun pulsante "rigenera"); eliminare la conversazione non la cancella | `spiegazioni` | [[15-backend]] |
| Il frontend non mostra ancora lo storico delle conversazioni salvate (rotte `/api/sessioni` pronte, con chiave API) | `frontend/` | [[specifica-storico-sessione]] |
| Risolto: con il motore diretto le domande successive dipendevano dalla memoria del processo (perse su un'altra istanza Vercel); con MongoDB la storia arriva dal database | `ServizioChat` | [[15-backend]] |
| Strutture di Milano: gli studi specialistici vengono da Overture (registri di imprese, affidabilità media); mancano Case di Comunità e pronto soccorso; medici e pediatri con licenza non commerciale (CC BY-NC). Risolto: prima 13 aree su 19 erano senza professionisti | `data/strutture-milano.json` | [[15-backend]] |
| Overpass sovraccarico quando si rigenerano le strutture (406/429/504): serve `--osm` con un'estrazione già scaricata | `scripts/costruisci-strutture.ts` | [[15-backend]] |
| Widget: se il servizio non risponde (es. 503 senza credenziali Evolus) compaiono due messaggi di errore di fila, "Il servizio non è disponibile…" e "La risposta si è interrotta…": il messaggio d'errore finisce nel testo libero della risposta | `WidgetReferto.tsx` (`Spiegazione`) | [[16-frontend]] |
| Risolto: backend fermo su Vercel (`ERR_REQUIRE_ESM` con `@nestjs/mongoose` 12, solo ESM); tornati alla 11.0.4 | `backend/package.json` | [[15-backend]] |
| Risolto: un PDF AIFA può contenere un foglio per formulazione (Dibase: 10 fogli in 54 pagine); ora si sceglie quello della confezione prescritta | `sezioni.ts` | [[15-backend]] |
| `npm audit` segnala `pdfjs-dist` 5.x (GHSA-hq66-cqwq-w95j, esecuzione di JavaScript aprendo un PDF malevolo); la correzione è la 6.x, con modifiche incompatibili. I PDF aperti sono i foglietti AIFA | `frontend/package.json` | [[16-frontend]] |

## Prossimi passi proposti

- Pubblicare il progetto Vercel con Services (backend + frontend) e collegare il
  backend come Web API all'agente Referto su Evolus, al posto del sotto-agente
  "Referto Farmaci" ([[15-backend]], [[16-frontend]]).
- Portare l'app Python (`resources/`) in backend e frontend, una funzione alla
  volta.
- Correggere la sezione Indicazioni dividendo il testo sulle intestazioni
  (`PLAN:`, `RECOMMENDATIONS:`, `CONCLUSIONI:`).
- Portare su `main` (via `staging`) le modifiche di `output-test`.
- Client compatibile OpenAI configurabile, per usare AMD Token Factory e
  mostrare AMD nella demo (pannello con modello, latenza, token al secondo).
- Unire glossario, branca e farmaci in una sola chiamata al modello.
- Controllo di copertura dei reperti ("12 reperti su 14 spiegati").
- Semaforo deterministico "parlane presto con il tuo medico".
- Indice di leggibilità Gulpease prima e dopo.
- Domande da portare alla visita e scheda da stampare.
- Anonimizzazione prima del modello e modalità "nessun dato salvato".

Catalogo completo delle idee: Feature Proposal in `Referto-doc/` ([[01-panoramica]]).
