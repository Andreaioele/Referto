---
tags: [area/funzioni]
aggiornato: 2026-10-14
---

# Servizio farmaci (NestJS)

Torna a [[00-indice]] · Stessa logica di [[08-referti-e-farmaci-aifa]].

## A cosa serve

Servizio HTTP in `servizio-farmaci/` (NestJS, TypeScript) che collega i **nomi
dei farmaci** scritti in un referto al prontuario AIFA. È pensato per gli agenti
di Referto su Evolus: l'agente principale individua i nomi, il servizio li
riconosce in modo deterministico e restituisce principio attivo, categoria ATC e
una frase pronta (`descrizione`) con i soli dati AIFA.

Sostituisce il sotto-agente "Referto Farmaci" basato sul RAG di Evolus, che nei
test di ottobre 2026 non trovava alcuni farmaci presenti (Cardioaspirin), saltava
la ricerca, scriveva testo spurio e impiegava 40-100 secondi per referto.

## Privacy

Riceve **solo nomi di farmaci**, mai il testo del referto ([[09-trace-e-privacy]]):
la validazione rifiuta i campi non previsti (`forbidNonWhitelisted`) e il
contenuto delle richieste non viene registrato. Chiave obbligatoria in
produzione: intestazione `x-api-key` uguale a `CHIAVE_API`.

## Come funziona

- `src/farmaci/normalizzazione.ts`: porta in TypeScript `normalize()`,
  `inn_key()`, `_component_keys()` e `_ingredient_label()` di `farmaci_referti.py`.
- `src/farmaci/prontuario.service.ts`: carica `farmaci/aifa_farmaci.json` e
  costruisce gli stessi indici di `_aifa()` (per nome commerciale e per
  principio attivo). `cerca()` riproduce `lookup()`: nome commerciale italiano
  con un solo farmaco di riferimento (importazioni parallele escluse), unico
  farmaco con quel principio attivo, altrimenti `da scegliere` con le alternative.
- In più rispetto all'app: `categoria` e `descrizione` dalla classificazione ATC
  (`servizio-farmaci/data/atc.json`, generato da `atc.csv` degli open data AIFA).
- Sali e alias sono in `farmaci/normalizzazione.json`, letto **sia** da
  `farmaci_referti.py` **sia** dal servizio: le due liste non possono divergere.

Rotte: `POST /farmaci/cerca`, `GET /farmaci/:cod`, `GET /salute`, documentazione
OpenAPI su `/docs` e `/docs-json` (da importare come Web API negli agenti).

## Parità con l'app

Il servizio deve dare gli stessi risultati di `farmaci_referti.lookup()`:

- `scripts/casi_parita.py` genera con Python `test/fixtures/parita.json` (48 casi
  scelti), verificati da `npm test`;
- `npm run parita:tutti` confronta tutti i 14.029 nomi del prontuario (nomi
  commerciali, principi attivi, alias): tutti uguali al 14/10/2026.

Va rilanciato dopo ogni modifica a `farmaci_referti.py`, ai dati in `farmaci/`
o a `servizio-farmaci/src/farmaci/`.

## Sviluppo e pubblicazione

```bash
cd servizio-farmaci && npm install && npm test && npm run start:dev
docker build -f servizio-farmaci/Dockerfile -t referto-servizio-farmaci .   # dalla radice
```

Nest 11 (CommonJS): Nest 12 è solo ESM e complica Jest. Dettagli in
`servizio-farmaci/README.md`. Collegamento agli agenti Evolus e pubblicazione:
da fare ([[14-problemi-noti-e-prossimi-passi]]).

## Limiti

- Nessuna tolleranza agli errori di battitura ("Cardioaspirina").
- Alias esteri non riconosciuti se seguiti dal dosaggio ("Lipitor 40 mg"), come nell'app.
