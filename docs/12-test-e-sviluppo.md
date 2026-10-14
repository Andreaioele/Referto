---
tags: [area/sviluppo]
aggiornato: 2026-10-14
---

# Test e sviluppo locale

Torna a [[00-indice]] · Flusso git in [[13-git-e-workflow]].

## Ambiente

Python gestito con **uv**. Senza creare un ambiente:

```bash
uv run --no-project --with-requirements requirements.txt python -m unittest test_app
```

Oppure con un ambiente nel repo: `uv venv --python 3.11 .venv` e
`uv pip install --python .venv/bin/python -r requirements.txt`.

## Test (`test_app.py`)

50 test, nessuno chiama un modello vero (le chiamate sono sostituite con
`unittest.mock.patch`). Classi:

| Classe | Copre |
|---|---|
| `ParserTests` | lettura dataset, sanificazione, formato |
| `DecisionModelTests` | routing e fallback del decision model ([[04-decision-model]]) |
| `BenchmarkTests` | benchmark A/B |
| `WebTests` | rotte Flask principali |
| `ClusterAgentTaskTests` | job batch e `--resume` |
| `GlossaryTests` | [[06-glossario-hpo]] |
| `FacilitiesTests` | [[07-branca-e-strutture]] |
| `MedicationTests`, `UnivocalMedicationTests`, `ArchiveTests` | [[08-referti-e-farmaci-aifa]] |

Il servizio NestJS in `servizio-farmaci/` ha test propri (Jest): `cd servizio-farmaci && npm test`,
più il confronto con Python `npm run parita:tutti` ([[15-servizio-farmaci]]).

Ogni nuova funzione arriva con i suoi test, nello stile esistente
(`patch.object` sulle chiamate al modello e ai servizi esterni, cartelle temporanee).

## Prova nell'app senza un modello medico

Sul Mac c'è `qwen2.5-coder:7b` in Ollama: basta per provare il **flusso** (non
la qualità medica):

```bash
uv run --no-project --with-requirements requirements.txt python web_app.py --port 7860 --senza-decision-model --model qwen2.5-coder:7b
```

Un'analisi completa richiede qualche minuto. Dopo le prove, se il glossario ha
salvato spiegazioni generate da questo modello, cancellare
`glossario/parole_salvate.json` ([[06-glossario-hpo]]).

## Convenzioni del codice

- Commenti, docstring, messaggi e testi della UI in italiano.
- Moduli piatti nella radice (`nome_modulo.py`); dati e script di costruzione in
  una cartella omonima (`glossario/`, `farmaci/`).
- Ogni chiamata al modello: `record_model_call()` e, se rilevante, `traced_step()`
  ([[09-trace-e-privacy]]).
- Ogni dato generato dal modello deve essere verificabile o avere una riserva
  deterministica ([[01-panoramica]]).
