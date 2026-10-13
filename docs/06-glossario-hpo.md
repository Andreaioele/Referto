---
tags: [area/funzioni]
aggiornato: 2026-10-13
---

# Terminologie (glossario HPO)

Torna a [[00-indice]] · Mostrato in [[05-webapp-e-interfaccia]] come "Terminologie".

## Cosa fa

Dopo ogni analisi trova nel referto e nella spiegazione le parole mediche e le
spiega una alla volta. Le parole restano salvate e si rileggono nella sezione
Terminologie.

## Fonte: Human Phenotype Ontology (HPO)

- `glossario/hpo_glossario.json`: ~19.000 termini del ramo "Phenotypic
  abnormality" (segni, sintomi, reperti), con definizione inglese, sinonimi e
  sinonimi "layperson" (parole comuni). ~3.500 hanno il nome italiano: 524
  traduzioni revisionate (`OFFICIAL`), le altre automatiche (`CANDIDATE`).
- Licenza: uso libero con citazione (https://hpo.jax.org/license).
- Rigenerazione con `glossario/build_glossary.py` (comandi nel README).
- **Limite:** HPO non copre anatomia né procedure (menisco, ecocardiografia, biopsia).

## Come funziona (`glossario_medico.py`)

1. **Riconoscimento deterministico** (`find_terms`): testo normalizzato (minuscolo,
   senza accenti), corrispondenza più lunga fino a 6 parole, in inglese e in
   italiano, massimo 15 termini. `IGNORED_KEYS` esclude parole ambigue
   ("pain", "cutting", "aspiration"...). Il modello non decide quali parole sono mediche.
2. **Riformulazione** (`_simplify_with_model`): una sola chiamata per i termini
   nuovi, `format: json`; il modello riscrive in italiano semplice **solo** la
   definizione HPO, senza cause, terapie o consigli.
3. **Salvataggio** in `glossario/parole_salvate.json` (fuori da Git): ogni
   spiegazione si genera una volta e poi si riusa, con conteggio e date.
4. **Riserva:** se il modello non risponde resta la definizione HPO.

## Interfaccia

- **Sezione Terminologie (vocabolario):** un menu a tendina con tutte le parole
  salvate in **ordine alfabetico** (`localeCompare` in italiano), raggruppate
  per iniziale (`<optgroup>`), più "Parola precedente / successiva". Scelta una
  parola, sotto compare la scheda completa, tutta aperta
  (`renderVocabularyEntry` in `static/app.js`): nome italiano e inglese, cosa
  significa (spiegazione semplice), altri modi di dirlo, definizione ufficiale
  HPO, i referti in cui compare (cliccabili, da `GET /api/glossary` che
  aggiunge `referti` a ogni parola usando `glossary_ids` dello storico) e il
  link alla scheda HPO.
- **Nel risultato di un referto** ("Per saperne di più" → Terminologie): le
  parole di quel referto in pulsanti, una alla volta, con i dettagli tecnici
  in "Dettagli per chi vuole approfondire".

Una nota avverte sempre che una parola può comparire anche perché il referto
la esclude ("nessun pneumotorace").

Attenzione: la cache non dipende dal modello. Se si cambia modello e si vogliono
spiegazioni nuove, va cancellato `glossario/parole_salvate.json`.

Test: classe `GlossaryTests` in `test_app.py` ([[12-test-e-sviluppo]]).
