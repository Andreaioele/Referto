---
tags: [area/funzioni]
aggiornato: 2026-10-13
---

# I miei referti e I miei farmaci (AIFA)

Torna a [[00-indice]] · Mostrato in [[05-webapp-e-interfaccia]].

## Storico dei referti (`archivio_referti.py`)

Nessun secondo salvataggio: lo storico è una vista sulle trace
([[09-trace-e-privacy]]). Ogni trace con `status: ok` e `source_type` in
`text`, `pdf`, `image` è un referto; il testo sta nell'artefatto
`input_text`, `report_text` o `transcription` (`REPORT_TEXT_ARTIFACT`).

- `list_reports()`: elenco con titolo, specialità, prima frase della sintesi, conteggi.
- `load_report()`: testo, spiegazione, glossario, branca, farmaci.
- `trace_store.update_trace_artifact()` aggiunge i farmaci a referti già
  analizzati; `trace_store.delete_trace()` elimina un referto (pulsante
  "Elimina questo referto", con conferma).

## Farmaci (`farmaci_referti.py`)

**Referto non suggerisce farmaci né dosi:** mostra solo quelli scritti nei referti.

1. **Estrazione** (`extract_medications`): il modello propone i farmaci con
   `format` JSON schema (nome, principio attivo, dose, frequenza, via, motivo,
   uso, citazione). Allergie e mezzi di contrasto esclusi dal prompt.
2. **Verifica alla lettera** (`_grounded`): ogni campo resta solo se compare
   nel referto; un farmaco il cui nome non è nel testo viene scartato. Dosi o
   motivi inventati diventano "Non scritto nel referto".
3. **Ricerca nel testo** (`_scan_text`): trova i principi attivi e gli alias
   noti anche senza modello. Si aggiunge ai risultati del modello (che spesso
   salta le liste "Medications include ...") e fa da riserva se il modello
   non risponde. La citazione è l'estratto del referto intorno al farmaco.
4. **Collegamento AIFA** (`lookup`): deterministico, per principio attivo o
   nome commerciale.
   - `inn_key()` avvicina inglese e italiano (metformin → metformina,
     levothyroxine → levotiroxina, naproxen → naprossene).
   - `SALT_WORDS` toglie i sali ("METFORMINA CLORIDRATO").
   - `ALIASES` copre nomi inglesi e marchi USA (Tylenol → paracetamolo,
     Motrin → ibuprofene, Vytorin → simvastatina + ezetimibe).
5. **Storico** (`history_overview`): raggruppa per principio attivo tutte le
   menzioni, con referto di origine e data.

## Prontuario e foglietti illustrativi AIFA

- Fonte: `https://drive.aifa.gov.it/farmaci/confezioni_fornitura.csv` (AIFA,
  CC BY 4.0): 160.165 confezioni autorizzate, ognuna con link a foglietto
  illustrativo (FI) e RCP della Banca Dati Farmaci.
- `farmaci/build_aifa_index.py` → `farmaci/aifa_farmaci.json` (~12.600 farmaci,
  5,4 MB). I link non sono salvati: seguono sempre lo schema `link_template`
  (verificato su tutte le confezioni dallo script).
- `leaflet_pdf()`: scarica il PDF ufficiale alla prima apertura e lo tiene in
  `farmaci_cache/` (fuori da Git). La rotta
  `/api/farmaci/<cod>/foglietto?tipo=FI|RCP` accetta solo codici del prontuario.
- `search_catalog()`: ricerca libera nel prontuario ("Cerca il foglietto di un
  altro farmaco").
- Farmaci non in commercio in Italia (es. idrocodone) risultano "Foglietto non trovato".

Test: classi `MedicationTests` e `ArchiveTests` ([[12-test-e-sviluppo]]).
