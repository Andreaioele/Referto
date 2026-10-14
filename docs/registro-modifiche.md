---
tags: [area/indice]
aggiornato: 2026-10-14
---

# Registro delle modifiche

Torna a [[00-indice]]. Regola: **ogni modifica al codice aggiunge qui una riga**
(la più recente in alto) e aggiorna la nota dell'area toccata.

Formato: `AAAA-MM-GG · branch · cosa cambia · [[nota]]`

## 2026-10-14

- `servizio-farmaci` · Pubblicazione su Vercel: `vercel.json` e `npm run copia-dati` portano i dati di `farmaci/` nella funzione; il servizio li cerca prima in `servizio-farmaci/data/` · [[15-servizio-farmaci]]
- `servizio-farmaci` · Nuovo servizio NestJS (TypeScript) per gli agenti Evolus: collega i nomi dei farmaci al prontuario AIFA con la stessa logica di `lookup()`, più categoria ATC e frase pronta; riceve solo nomi, mai il referto. Sali e alias spostati in `farmaci/normalizzazione.json`, condiviso con `farmaci_referti.py` · [[15-servizio-farmaci]]

## 2026-10-13

- `staging` · "Per saperne di più" con righe compatte che portano a Terminologie, Farmaci e Dove andare filtrati sul referto, con ritorno al referto; tolte le viste interne non più usate · [[05-webapp-e-interfaccia]]
- `staging` · Terminologie in stile vocabolario: menu a tendina alfabetico per iniziale e scheda completa della parola, con i referti in cui compare · [[06-glossario-hpo]]
- `staging` · "Dove andare" automatico: città dal profilo (Ferrara), specialità dall'ultimo referto, mappa ed elenco a gruppi subito; geocoding sul comune e non sulla provincia; mirror Overpass `maps.mail.ru` · [[07-branca-e-strutture]]
- `staging` · Farmaci: corrispondenza univoca nome → foglietto. Nome commerciale italiano (escluse le importazioni parallele) o unico farmaco con quel principio attivo; negli altri casi sceglie il paziente, mai l'app · [[08-referti-e-farmaci-aifa]]
- `staging` · File, Foto e Testo uniti nella sezione "Spiegami un referto": si sceglie la modalità e compare solo lo strumento giusto; la Foto apre la fotocamera dal vivo · [[05-webapp-e-interfaccia]]
- `staging` · Creata la documentazione `docs/` (vault Obsidian) e `CLAUDE.md`
  con la regola di aggiornamento · [[00-indice]]
- `main` · Merge di `feature-proposal-pietro` in `main`; creato il branch
  `staging` per l'integrazione · [[13-git-e-workflow]]
- `feature-proposal-pietro` · Interfaccia semplificata: tre gruppi nella barra
  laterale, strumenti per il team nascosti, titoli della spiegazione più
  diretti, sezioni secondarie a scomparsa, testi e pulsanti più grandi;
  "Parole difficili" rinominata "Terminologie" · [[05-webapp-e-interfaccia]]
- `feature-proposal-pietro` · Sezioni "I miei referti" (storico sulle trace) e
  "I miei farmaci" (farmaci scritti nei referti, prontuario e foglietti AIFA) ·
  [[08-referti-e-farmaci-aifa]]
- `feature-proposal-pietro` · Specialità del referto e mappa degli specialisti
  vicini con OpenStreetMap · [[07-branca-e-strutture]]
- `feature-proposal-pietro` · Glossario dei termini medici da HPO con
  spiegazioni semplici salvate · [[06-glossario-hpo]]

## 2026-10-12

- `output-test` · `OLLAMA_LOAD_TIMEOUT=30m` per i modelli grandi; cartelle dei
  run `<modello>-<ora>-<minuto>`; input da file di testo anche con `submit.sh`;
  `"think": false` nelle chiamate · [[10-dataset-e-valutazione]]
- `output-test` · Risorse SLURM: 1 GH100 per task, fino a 8 task in parallelo ·
  [[11-modelli-e-ollama]]
- `output-test` · Pipeline SLURM a shard e dataset clinici sul branch ·
  [[10-dataset-e-valutazione]]
