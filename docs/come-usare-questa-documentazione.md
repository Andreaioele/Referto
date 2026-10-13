---
tags: [area/indice]
aggiornato: 2026-10-13
---

# Come usare questa documentazione

Torna a [[00-indice]].

## Con Claude Code

Chiedi di leggere `docs/00-indice.md` e poi le note dell'area su cui lavorare.
`CLAUDE.md` alla radice del repo lo ricorda a ogni sessione, insieme alla regola
di aggiornamento. Le mappe in formato `mermaid` nell'indice e in
[[02-architettura]] riassumono il grafo in testo.

## Con Obsidian (grafo)

1. In Obsidian: *Open folder as vault* → scegli la cartella `docs/`.
2. Apri la vista a grafo (Ctrl/Cmd+G). I colori sono configurati in
   `.obsidian/graph.json`, per area (tag nel frontmatter):

| Colore | Tag | Note |
|---|---|---|
| Verde scuro | `area/indice` | indice, registro, questa guida |
| Verde | `area/core` | architettura, pipeline, decision model, trace |
| Blu | `area/funzioni` | glossario, strutture, referti e farmaci |
| Viola | `area/interfaccia` | webapp e interfaccia |
| Arancio | `area/valutazione` | dataset e valutazione |
| Rosso | `area/infrastruttura` | modelli, Ollama, AMD, cluster |
| Grigio | `area/progetto`, `area/sviluppo` | panoramica, problemi, test, git |

Solo `graph.json` e `app.json` sono nel repo; il resto di `.obsidian/`
(workspace, plugin) è locale e ignorato da Git.

## Come scrivere o aggiornare una nota

- Frontmatter con `tags: [area/...]` (uno dei tag sopra) e `aggiornato: AAAA-MM-GG`.
- Prima riga: `Torna a [[00-indice]]` e il collegamento all'area madre.
- Collega con `[[nome-nota]]` ogni nota citata: è così che nasce il grafo.
- Riferimenti al codice in `backtick` con nome di file e funzione.
- Una nota nuova va aggiunta all'indice e alla mappa `mermaid` di [[00-indice]].
- Ogni modifica al codice: aggiornare la nota dell'area e [[registro-modifiche]].
