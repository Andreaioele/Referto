---
tags: [area/progetto]
aggiornato: 2026-10-13
---

# Panoramica

Torna a [[00-indice]].

## Cos'è Referto

Un'app web che spiega un referto medico al paziente in italiano semplice. Il
paziente, dalla sezione "Spiegami un referto", carica un PDF, scatta una foto o
incolla il testo; Referto restituisce una
spiegazione in quattro sezioni (vedi [[03-pipeline-spiegazione]]) e, intorno a
questa, strumenti per orientarsi:

- **Terminologie:** le parole mediche del referto spiegate una a una ([[06-glossario-hpo]]);
- **Dove andare:** la specialità del referto e una mappa degli specialisti vicini ([[07-branca-e-strutture]]);
- **I miei referti** e **I miei farmaci:** lo storico e i farmaci scritti nei
  referti, con il foglietto illustrativo AIFA ([[08-referti-e-farmaci-aifa]]).

## Contesto: hackathon AMD Developer ACT III

Progetto per il track **Health** dell'hackathon. Vincoli che orientano ogni scelta:

- **Niente diagnosi, terapie o consigli.** Referto spiega solo ciò che è scritto
  nel documento. Le indicazioni operative compaiono solo se presenti nel referto,
  in una sezione separata e attribuita al documento. Lo stesso vale per i
  farmaci: solo quelli scritti dal medico, mai suggeriti.
- **Temi che la giuria del track Health si aspetta:** errori, dati sensibili,
  incertezza, decisioni ad alto rischio, revisione umana. Per questo ogni dato
  mostrato è verificabile (citazioni, fonti ufficiali, controlli deterministici).
- **Regola AMD:** il carico deve girare su hardware AMD (MI300X o AMD Token
  Factory) e si deve vedere nella demo. Vedi [[11-modelli-e-ollama]].
- **MedGemma è escluso dal regolamento**, anche se è ancora il modello
  predefinito nel codice: va sostituito (candidato Gemma 4 31B IT).
- **Feature freeze:** 16/10/2026, poi video da 2–3 minuti.

## Principi del prodotto

1. **Fedeltà verificabile:** ogni informazione si può ricondurre al referto o a
   una fonte ufficiale (HPO, AIFA, OpenStreetMap). Il modello riformula, le
   fonti decidono cosa è vero.
2. **Locale per default:** il referto è elaborato da Ollama in locale; i dati
   restano sul computer ([[09-trace-e-privacy]]).
3. **Semplice anche per una persona di 70 anni:** poche informazioni alla volta,
   testi grandi, dettagli tecnici a scomparsa ([[05-webapp-e-interfaccia]]).

## Documenti fuori dal repo

Nella cartella `Referto-doc/` del vault del team (fuori da questo repository) ci
sono l'analisi iniziale, i report sui dataset per fine-tuning e test e la
Feature Proposal con il catalogo delle funzioni candidate.
