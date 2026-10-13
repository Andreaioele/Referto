---
tags: [area/sviluppo]
aggiornato: 2026-10-13
---

# Git e flusso di lavoro

Torna a [[00-indice]] · Test in [[12-test-e-sviluppo]].

Repository: `github.com/Andreaioele/Referto`.

## Branch

| Branch | Ruolo |
|---|---|
| `main` | Versione stabile. Si aggiorna solo da `staging` |
| `staging` | Integrazione: ogni lavoro si mergia qui prima di `main` |
| `feature-proposal-pietro` | Glossario, mappa, referti, farmaci, interfaccia semplificata (già in `main`) |
| `output-test` | Pipeline SLURM a shard, input da file di testo, `"think": false`, timeout di caricamento. **Non ancora in `main`** |
| `fine-tuning-test` | Esperimenti di fine-tuning (locale) |
| `impl/decision-model` | Lavoro sul decision model (remoto) |

Flusso: branch di lavoro → merge su `staging` → verifica (test e prova nell'app)
→ merge su `main`.

## Regole per i commit

- Nessuna riga di attribuzione a Claude nei commit e nelle PR
  (niente `Co-Authored-By: Claude`, niente "Generated with Claude Code").
- Messaggi in italiano, al presente, che dicono cosa cambia.
- Ogni commit che cambia il comportamento aggiorna la documentazione:
  la nota dell'area e [[registro-modifiche]] (regola in `CLAUDE.md`).
- Mai committare dati sanitari: `traces/`, `risultati/`, `benchmarks/`,
  cache e file `.env` sono in `.gitignore` ([[09-trace-e-privacy]]).
