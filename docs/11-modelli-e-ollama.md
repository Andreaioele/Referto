---
tags: [area/infrastruttura]
aggiornato: 2026-10-14
---

# Modelli, Ollama e infrastruttura AMD

Torna a [[00-indice]] · Usati da [[03-pipeline-spiegazione]].

## Modelli nel codice

| Ruolo | Default | Dove |
|---|---|---|
| Generazione, audit, glossario, branca, farmaci | `medgemma:4b-it-q4_K_M` | `DEFAULT_MODEL` in `spiega_referto.py` |
| Decision model | `laya:322m-multilingual-mlx-fp16` | `decision_model.py` |
| Embedding per il grounding | `bge-m3:latest` | `decision_model.py` |

**MedGemma è escluso dal regolamento:** il default va cambiato. Candidato:
Gemma 4 31B IT, disponibile su AMD Token Factory. Si sceglie il modello con
`--model` (webapp, CLI, job batch).

Tutte le chiamate usano l'**API nativa di Ollama** (`/api/chat` con `format`
JSON schema, `/api/embed`). Per i modelli che "ragionano" serve
`"think": false`, oggi solo sul branch `output-test` ([[03-pipeline-spiegazione]]).
I moduli nuovi (glossario, branca, farmaci) lo passano già.

## AMD Token Factory

Catalogo di API di AMD Radeon Cloud (manuale completo in
`07-amd-token-factory.md` nel vault del team). Per Referto:

- endpoint gratuiti **compatibili OpenAI e Anthropic**, non Ollama: serve un
  client OpenAI configurabile (non ancora fatto);
- niente embedding sugli endpoint condivisi: decision model in locale o spento;
- **niente dati sanitari reali** sugli endpoint condivisi: in demo solo referti
  sintetici o pubblici ([[09-trace-e-privacy]]);
- limiti di 20–30 richieste al minuto per tutto il team: le valutazioni
  massive vanno sul cluster o su un endpoint dedicato;
- `resources/check-usage-app/`: microservizio per vedere l'usage del team (token nel
  server, mai nel browser).

## Cluster SLURM (H100)

Riferimenti per chi lancia i job ([[10-dataset-e-valutazione]]):

- Ollama 0.12.11 in `/hpc/groups/users-urs/brnptr/ollama/`, modelli in
  `/hpc/groups/users-urs/brnptr/ollama-models` (area di gruppo da 5 TB; la
  home ha poca quota). I nodi non hanno internet: i modelli si preparano dal login node.
- Ollama 0.40 non importa `Gemma3ForConditionalGeneration` da safetensors: usare 0.12.x.
- Download da Hugging Face: `HF_HOME` deve essere lo stesso per `hf auth login`
  e `hf download`, altrimenti il token non viene trovato.
- Partizioni: `gpu_H100` (`gpu:GH100:N`) e `gpu_H100_partitioned` (fette MIG
  `gpu:1g.22gb:N`). Un processo CUDA usa **una sola** fetta MIG: chiedere 1
  fetta per task e più task in parallelo.
- Ollama carica il modello su una sola GPU se ci sta: 2 GPU per task non
  servono, meglio 1 GPU per task.
