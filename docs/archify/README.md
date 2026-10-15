---
tags: [area/indice]
aggiornato: 2026-10-15
---

# Diagrammi archify

Torna a [[00-indice]] · Architettura descritta a parole in [[02-architettura]].

Qui finiscono i diagrammi creati con la skill **archify** (architettura, flussi,
sequenze, moduli): pagine HTML interattive da aprire nel browser.

- Ogni richiesta ha la sua cartella `docs/archify/<tipo>-<argomento>-<AAAAMMGG-HHMMSS>/`
  con `candidate.json` (il diagramma in dati) e `<argomento>.html` (il diagramma).
- Un diagramma rifatto riusa la sua cartella; una richiesta nuova ne crea una
  nuova, così le versioni precedenti restano.
- Le ricevute dei controlli di archify (`*.finalize*.json`, `*.browser-check.json`,
  `*.delivery.json`) restano in locale: contengono percorsi della macchina e sono
  escluse in `.gitignore`.
- I diagrammi descrivono il codice com'era quando sono stati creati: se il codice
  cambia, conta il codice. Nei diagrammi niente dati sanitari reali.

## Diagrammi

| Cartella | Cosa mostra |
|---|---|
| `architecture-referto-20261015-104805/` | Architettura del sistema: browser (portale, widget, lettore del foglietto), instradamento `/api`, moduli NestJS, Mother agent Evolus, AIFA, dati del prontuario, MongoDB opzionale. Codice al commit `06a1282`. |
