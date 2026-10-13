---
tags: [area/core]
aggiornato: 2026-10-13
---

# Pipeline di spiegazione

Torna a [[00-indice]] · Parte di [[02-architettura]].

Tutto in `spiega_referto.py`, funzione `explain_report()`. Usata dalla webapp
([[05-webapp-e-interfaccia]]), dal benchmark ([[04-decision-model]]) e dal job
batch ([[10-dataset-e-valutazione]]).

## Formato dell'uscita

Testo semplice (niente Markdown) con quattro sezioni obbligatorie
(`REQUIRED_HEADINGS`) più la nota fissa `DISCLAIMER`:

| Sezione nel testo | Titolo mostrato nella UI |
|---|---|
| `SINTESI` | In breve |
| `SPIEGAZIONE IN PAROLE SEMPLICI` | Cosa dice il referto |
| `INCERTEZZE O LIMITI DEL REFERTO` | Cosa non è sicuro |
| `INDICAZIONI RIPORTATE NEL DOCUMENTO` | Cosa scrive di fare il medico |
| `NOTA INFORMATIVA` | Da sapere |

I titoli "umani" sono solo nella UI (`explanationLabels` in `static/app.js`):
il testo salvato e validato usa sempre quelli in maiuscolo.

## Passi

1. **Divisione:** `split_text()` spezza i referti oltre `max_chunk_chars`
   (default 9000). Un referto corto è un solo pezzo.
2. **Bozza:** prompt `FINAL_TASK`. Per i referti lunghi prima `CHUNK_TASK` su
   ogni parte (estrae solo i fatti), poi `FINAL_TASK` sui fatti uniti.
3. **Routing opzionale:** con il decision model attivo, se la bozza supera i
   controlli deterministici, [[04-decision-model]] può saltare l'audit.
4. **Audit:** `review_and_validate()` chiede al modello di confrontare bozza e
   referto (`AUDIT_TASK`).
5. **Pulizia e controlli deterministici:**
   - `sanitize_explanation()` toglie frasi vietate, sostituisce "Non sono
     riportati limiti specifici" con il limite scritto nel referto se c'è, e
     **ricostruisce la sezione Indicazioni** con `extract_document_recommendations()`;
   - `normalize_explanation_format()` riporta il testo al formato a sezioni;
   - `validate_explanation()` controlla sezioni, consigli vietati
     (`FORBIDDEN_ADVICE_PATTERNS`), affermazioni eccessive (`OVERCLAIM_PATTERNS`), lunghezza.
6. **Riparazione:** se restano problemi, una chiamata `SAFETY_REPAIR_TASK`. Se
   fallisce ancora, `UserFacingError`: nessun risultato.

Ogni chiamata passa da `ollama_chat()` con `temperature: 0`, `num_ctx: 16384`,
ed è registrata nella trace e nelle metriche (`record_model_call`).

## Lettura di PDF e immagini

- `extract_pdf_text()` (pypdf). Se il testo è troppo poco, il PDF è trattato
  come scansione: `render_pdf_pages()` (PyMuPDF, max 12 pagine) e poi
  `transcribe_report_images()` con il modello multimodale.
- `IMMAGINE_SENZA_REFERTO_TESTUALE`: il modello rifiuta radiografie o TAC senza
  testo. Referto non interpreta immagini cliniche.

## Uso da terminale

```bash
python spiega_referto.py referto.pdf --model <modello> --senza-decision-model
```

Opzioni in `parse_args()`: `--output`, `--timeout`, `--max-chars`,
`--decision-model`, `--senza-decision-model`, `--ollama-url`.

## Problemi noti

- La sezione **Indicazioni** su referti MTSamples incolla il referto intero in
  inglese o perde il piano di cura: `extract_document_recommendations()` lavora
  per paragrafi e MTSamples è un unico paragrafo. La UI la mette a scomparsa,
  ma va corretta qui. Vedi [[14-problemi-noti-e-prossimi-passi]].
- Su `main` le chiamate non passano `"think": false`: con modelli che
  "ragionano" (Qwen3) il ragionamento consuma il budget di token. La correzione
  è sul branch `output-test` ([[13-git-e-workflow]]).
