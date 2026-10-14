---
tags: [area/specifica]
aggiornato: 2026-10-14
---

# Specifica: Terminologia medica nel referto

Torna a [[00-indice]] · Riferimenti: [[06-glossario-hpo]], [[15-backend]],
[[16-frontend]], [[08-referti-e-farmaci-aifa]].

## Obiettivo

Dopo che l'agente Evolus spiega un referto, l'app trova automaticamente i
**5 termini medici principali e più difficili** nel testo e li spiega in
italiano semplice. Se nel referto ce ne sono meno di 5, l'app restituisce solo
quelli trovati.

La logica segue lo stesso schema già implementato per la ricerca dei farmaci
AIFA: dato deterministico (glossario) + collegamento univoco + eventuale
riformulazione dal modello.

## Fonte dati: glossario medico completo

### Stato attuale: HPO

Il glossario HPO (`glossario/hpo_glossario.json`, ~19.000 termini) copre segni,
sintomi e reperti fenotipici. **Limite noto:** non copre anatomia (menisco,
vertebra), procedure (ecocardiografia, biopsia) né valori di laboratorio
(creatinina, emoglobina).

### Glossario da trovare (priorità alta)

Serve un glossario medico **completo** che copra anche:

- **Anatomia** (organi, ossa, muscoli, strutture)
- **Procedure e esami** (biopsia, ecografia, risonanza, TAC, endoscopia)
- **Valori di laboratorio** (creatinina, glicemia, emocromo, transaminasi)
- **Farmacologia** (già coperta dal prontuario AIFA, da collegare)
- **Patologie** (parzialmente coperte da HPO)

Candidati da valutare:

| Fonte | Copertura | Licenza | Note |
|---|---|---|---|
| HPO attuale | Segni/sintomi (~19k) | Libera con citazione | Già in uso |
| SNOMED CT | Completa (~350k concetti) | Affiliazione nazionale (Italia aderisce) | Il più completo; verificare i termini per il rilascio |
| MeSH (NLM) | Ampia (~30k descrittori) | Dominio pubblico (USA) | Traduzione italiana parziale; buono per procedure e laboratorio |
| ICD-11 (OMS) | Diagnosi e procedure (~55k) | CC BY-NC-SA 3.0 IGO | Traduzione italiana ufficiale |
| Dizionario medico Treccani / ISS | Divulgativa | Da verificare | Definizioni già in italiano semplice |
| UMLS Metathesaurus | Aggrega tutti i precedenti | Licenza UMLS (gratuita, registrazione) | Ideale come indice unificato |

**Azione richiesta:** scegliere e acquisire il glossario prima di implementare.
Il formato finale deve essere un file `.json` (o generato da `.md`) nella
cartella `backend/data/`, con la stessa logica del prontuario AIFA: uno script
di build in `resources/` genera il file, che viene committato nel backend.

## Architettura backend

### Modulo `terminologia` (NestJS)

Segue la struttura del modulo `farmaci`:

```
backend/src/terminologia/
├── terminologia.module.ts
├── terminologia.service.ts       # carica il glossario, cerca i termini
├── terminologia.controller.ts    # rotte API
├── riconoscimento.ts             # logica deterministica di ricerca
└── dto/
    ├── cerca-termini.dto.ts
    └── risposte.dto.ts
```

**Dati:** `backend/data/glossario_medico.json` (generato da uno script di build).

### Servizio `TerminologiaService`

1. **Caricamento all'avvio:** legge il glossario in memoria e costruisce un
   indice invertito (termine normalizzato → definizione), come
   `ProntuarioService` fa con i farmaci.
2. **`cercaTermini(testo: string, limite?: number)`:** riproduce
   `find_terms()` di `glossario_medico.py`:
   - Normalizza il testo (minuscolo, senza accenti).
   - Corrispondenza più lunga fino a 6 parole, sia in italiano che in inglese.
   - Esclude parole ambigue (`IGNORED_KEYS`: "pain", "cutting", …).
   - Restituisce al massimo `limite` termini (default 5).
   - **Classificazione per difficoltà:** ordina i termini trovati per rarità
     (frequenza nella lingua comune, basata su un indice di frequenza o sulla
     lunghezza/complessità del termine) e restituisce i primi 5 più difficili.
3. **`semplifica(termini: TermineTrovato[])`:** riformulazione opzionale con il
   modello Evolus (una sola chiamata per tutti i termini nuovi); riserva: la
   definizione ufficiale dal glossario.

### Rotte API

| Rotta | Metodo | Autenticazione | Descrizione |
|---|---|---|---|
| `POST /api/terminologia/cerca` | POST | Chiave API | Trova i 5 termini principali in un testo |
| `GET /api/terminologia/:id` | GET | Chiave API | Dettaglio di un termine per codice |

### DTO

```typescript
// cerca-termini.dto.ts
class CercaTerminiDto {
  testo: string;          // max 30.000 caratteri (testo del referto)
  limite?: number;        // default 5, max 15
}

// risposte.dto.ts
class TermineTrovatoDto {
  codice: string;         // codice nel glossario (es. HP:0001945)
  termine: string;        // parola trovata nel testo
  nome_italiano: string;  // nome italiano nel glossario
  nome_inglese: string;   // nome inglese nel glossario
  definizione: string;    // definizione ufficiale
  spiegazione: string;    // riformulazione in italiano semplice
  sinonimi: string[];     // altri modi di dire
  fonte: string;          // "HPO" | "MeSH" | altra fonte
  url_fonte?: string;     // link alla scheda ufficiale
  posizione: number;      // posizione nel testo (indice carattere)
}

class RispostaTerminiDto {
  fonte: { nome: string; versione: string; data: string };
  termini: TermineTrovatoDto[];
  totale_trovati: number; // quanti termini trovati in tutto
}
```

## Architettura frontend

### Integrazione nella chat

Dopo la risposta dell'agente Evolus, il frontend:

1. Chiama `POST /api/terminologia/cerca` con il testo del referto (o con il
   testo della risposta dell'agente, che contiene la spiegazione).
2. Sotto la risposta dell'agente, mostra una sezione **"Parole difficili"**
   con i termini trovati.

### Componente `Terminologia`

```
frontend/src/
├── Terminologia.tsx      # componente React
├── servizio-terminologia.ts  # chiamata API
```

**Visualizzazione (principi di [[05-webapp-e-interfaccia]]):**

- Ogni termine è un **pulsante** con il nome italiano.
- Premuto, si espande mostrando:
  - **Cosa significa:** spiegazione in italiano semplice (18 px, grande).
  - **`<details>` "Altre informazioni":** definizione ufficiale, sinonimi,
    link alla fonte.
- Se non trova 5 termini, mostra quelli trovati senza messaggi d'errore.
- Avviso fisso: _"Una parola può comparire anche perché il referto la esclude
  (es. 'nessun pneumotorace')."_

### Flusso utente

```
Utente incolla referto
       ↓
Agente Evolus spiega
       ↓
Frontend chiama POST /api/terminologia/cerca
       ↓
Sotto la spiegazione compare:
  ┌──────────────────────────────────────┐
  │ Parole difficili                      │
  │ ┌──────────┐ ┌──────────┐ ┌────────┐ │
  │ │ Dispnea  │ │ Edema    │ │Fibrosi │ │
  │ └──────────┘ └──────────┘ └────────┘ │
  │                                       │
  │ ▼ Dispnea                             │
  │ Difficoltà a respirare, la sensazione │
  │ di non riuscire a prendere aria.      │
  │                                       │
  │ ▸ Altre informazioni                  │
  └──────────────────────────────────────┘
```

## Collegamento con il modulo farmaci

Quando un termine trovato è un principio attivo (es. "metformina"), il
componente deve riconoscerlo e mostrare un link al farmaco AIFA corrispondente
anziché una definizione generica. Questo evita duplicazioni con la sezione
farmaci.

## Test

- **Backend:** test unitari per `cercaTermini()` con referti di esempio;
  verificare che i termini ambigui siano esclusi; verificare l'ordinamento per
  difficoltà.
- **Frontend:** verificare che i termini compaiano sotto la spiegazione;
  verificare l'espansione dei dettagli; verificare il caso "meno di 5 termini".

## Dipendenze e rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Glossario HPO incompleto | Termini anatomici e di laboratorio non trovati | Integrare con MeSH o SNOMED CT |
| Termini ambigui (falsi positivi) | Parole comuni segnalate come mediche | Lista di esclusione `IGNORED_KEYS` |
| Classificazione di difficoltà soggettiva | I 5 termini scelti non sono i più utili | Heuristic basata su lunghezza + rarità + assenza nel vocabolario di base |
| Latenza della chiamata al glossario | L'utente aspetta dopo la spiegazione | Chiamata in parallelo con la risposta; il glossario è locale, non richiede rete |
