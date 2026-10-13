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
- Nel dettaglio, glossario, farmaci e specialità sono righe che portano alle
  rispettive sezioni filtrate su quel referto ([[05-webapp-e-interfaccia]]): la
  scelta del farmaco si fa nella sezione Farmaci.
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
4. **Collegamento AIFA univoco** (`lookup`): un farmaco del referto è collegato
   a **un solo** farmaco AIFA, e quindi a un solo foglietto, solo quando la
   corrispondenza è certa. Il nome mostrato è il nome commerciale
   ("Brufen"); il principio attivo ("ibuprofene") è scritto sotto.
   - **Nome commerciale italiano** scritto nel referto, anche con il dosaggio
     ("Brufen 600 mg"): si cercano i farmaci AIFA con quel nome, **escluse le
     importazioni parallele** (`procedura == "Importazione Parallela"`: copie
     dello stesso medicinale di altre ditte; "Brufen" ne ha 10). Se ne resta uno
     solo, è univoco. Un farmaco che si chiama come il suo principio attivo
     (generico) non conta come nome commerciale.
   - **Principio attivo con un solo farmaco in commercio** ("glipizide" →
     Minidiab): univoco, con la frase "in Italia l'unico farmaco con questo
     principio attivo è ...".
   - **In tutti gli altri casi** (solo principio attivo, marchio estero come
     "Motrin", nome con più farmaci come "Diflucan") l'app **non sceglie**:
     `corrispondenza = "da scegliere"`, spiegazione in `perche` e
     `alternative`. Il paziente indica il suo farmaco ("È il mio farmaco");
     la scelta si salva nell'elemento del referto (`scelta`, rotta
     `POST /api/referti/<id>/farmaci/<indice>/scelta`, accettata solo tra le
     alternative) e diventa `corrispondenza = "scelto da te"`, annullabile.
   - Per riconoscere i principi attivi: `inn_key()` avvicina inglese e italiano
     (metformin → metformina), `SALT_WORDS` toglie i sali, `ALIASES` copre nomi
     inglesi e marchi USA (Motrin → ibuprofene).
   - `resolve_medication()` **ricalcola la corrispondenza a ogni lettura** (storico,
     dettaglio, sezione Farmaci): le regole valgono anche per i referti vecchi.
5. **Storico** (`history_overview`): raggruppa per farmaco AIFA quando è univoco
   o scelto (`cod:<codice>`), altrimenti per nome scritto (`nome:<nome>`), con
   referto di origine e data. Una scelta fatta dalla sezione Farmaci vale per
   tutte le menzioni del gruppo.

## Prontuario e foglietti illustrativi AIFA

- Fonte: `https://drive.aifa.gov.it/farmaci/confezioni_fornitura.csv` (AIFA,
  CC BY 4.0): 160.165 confezioni autorizzate, ognuna con link a foglietto
  illustrativo (FI) e RCP della Banca Dati Farmaci.
- `farmaci/build_aifa_index.py` → `farmaci/aifa_farmaci.json` (~12.600 farmaci,
  5,9 MB, con il tipo di procedura per riconoscere le importazioni parallele). I link non sono salvati: seguono sempre lo schema `link_template`
  (verificato su tutte le confezioni dallo script).
- `leaflet_pdf()`: scarica il PDF ufficiale alla prima apertura e lo tiene in
  `farmaci_cache/` (fuori da Git). La rotta
  `/api/farmaci/<cod>/foglietto?tipo=FI|RCP` accetta solo codici del prontuario.
- `search_catalog()`: ricerca libera nel prontuario ("Cerca il foglietto di un
  altro farmaco").
- Farmaci non in commercio in Italia (es. idrocodone) risultano "Foglietto non trovato".

Test: classi `MedicationTests`, `UnivocalMedicationTests` e `ArchiveTests` ([[12-test-e-sviluppo]]).
