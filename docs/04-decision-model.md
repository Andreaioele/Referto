---
tags: [area/core]
aggiornato: 2026-10-13
---

# Decision model e benchmark A/B

Torna a [[00-indice]] · Usato da [[03-pipeline-spiegazione]].

## Scopo

Risparmiare la chiamata di audit quando la bozza è già buona. In
`decision_model.py`, `decide_audit()` sceglie tra due strategie in base al
modello configurato:

- **Laya System One** (`laya:322m-multilingual-mlx-fp16`, default):
  `decide_systemone_audit()` classifica la coppia referto/bozza e restituisce
  probabilità di "percorso veloce" e di audit, con soglie
  `DEFAULT_FAST_THRESHOLD = 0.65` e `DEFAULT_AUDIT_THRESHOLD = 0.50`.
- **Grounding con embedding** (`bge-m3:latest` o altro modello di embedding):
  `decide_grounding_audit()` confronta con `/api/embed` ogni affermazione
  clinica della bozza con le frasi del referto; l'audit si salta solo se
  similarità minima e media superano 0.70 e 0.75.

Il routing è **conservativo**: si salta l'audit solo se la bozza ha già passato
i controlli deterministici e il decision model è sicuro. Ogni errore porta
all'audit completo (`fallback_reason` nella trace). Il risultato
(`DecisionResult`) finisce nella trace.

Disattivabile: `--senza-decision-model` (webapp) o `--no-decision-model`
(job batch). Nei test sul cluster è spento, per misurare il modello da solo.

## Benchmark A/B

`benchmarking.py` esegue lo stesso referto (o un intero dataset) con e senza
decision model, alternando l'ordine per ridurre l'effetto del riscaldamento.
Salva in `benchmarks/` solo metriche e hash SHA-256, mai testi o risposte.
Nella UI è la sezione **Performance**, visibile solo con "Mostra strumenti per
il team" ([[05-webapp-e-interfaccia]]).
