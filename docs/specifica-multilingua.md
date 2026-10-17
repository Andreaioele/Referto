---
tags: [area/specifica]
aggiornato: 2026-10-16
---

# Specifica: Referto in italiano e in inglese

Torna a [[00-indice]] · Riferimenti: [[16-frontend]], [[15-backend]],
[[03-pipeline-spiegazione]].

La persona sceglie la lingua con il tasto **IT / EN** nella testata del
portale (branch `ita-eng`, [[16-frontend]]).

**Soluzione scelta (16/10/2026): il Mother agent non si tocca.** Scrive
sempre in italiano; con l'interfaccia in inglese le sue risposte si traducono
dopo, con controllo deterministico, e le domande in inglese gli arrivano
tradotte in italiano ([[15-backend]], `src/traduzione/`). Vantaggi: un solo
prompt del Mother agent, cache e strumenti (cercaTermine, «parola non nel
referto») invariati, nessuna sincronizzazione con Evolus. Costi: qualche
secondo in più in inglese (la risposta si vede quando è tradotta, non in
streaming) e una chiamata al modello per ogni risposta.

La proposta qui sotto (Mother agent che scrive direttamente in inglese) **non
è implementata**: resta come alternativa se la traduzione non bastasse.

## Che cosa resta in italiano anche in inglese (per scelta)

- **I documenti originali**: il foglio del referto (testo, tabella dei valori,
  note del medico), il PDF del foglietto AIFA e le sue sezioni. Sono documenti
  dello studio e dell'AIFA: Referto li spiega, non li riscrive.
- **Le citazioni** («Dal referto: …»): restano parola per parola, anche in una
  risposta inglese, perché sono la prova di ciò che si spiega.
- **I nomi propri**: studio, medici, strutture, indirizzi, farmaci commerciali.
- **La riga `ARGOMENTO`** come chiave: l'area resta una voce dell'elenco
  italiano (serve alla ricerca delle strutture); il frontend la traduce.

## Alternativa non scelta: il Mother agent in inglese

### 1. Il browser dice la lingua

`POST /api/chat` accetta un campo in più, `lingua: 'it' | 'en'`
(facoltativo, predefinito `it`, `@IsIn(['it', 'en'])` in `chat.dto.ts`).
Il frontend non lo manda: la `ValidationPipe` ha `forbidNonWhitelisted` e
risponderebbe 400. Lo stesso campo per `/api/foglietti` (domande sul
foglietto).

`RichiestaChat` e `OpzioniChiedi` (`motore-chat.ts`) portano la lingua fino al
motore; la conversazione salvata ricorda la lingua in cui è nata.

### 2. Un prompt solo, con un'appendice per l'inglese

Le regole di fedeltà restano **una sola copia, in italiano** (`data/prompt-mother.md`):
due prompt completi si separerebbero alla prima modifica. Per l'inglese si
aggiunge in coda un'appendice breve (`data/prompt-mother-en.md`), letta solo
quando `lingua = en`:

- scrivi tutta la risposta in inglese semplice (livello di una persona senza
  studi sanitari), con le stesse regole di fedeltà;
- `ARGOMENTO: <esame in inglese> · <area>`: **l'area sempre scritta come
  nell'elenco italiano** (è una chiave), l'esame in inglese;
- titoli del FORMATO in inglese, esattamente: `SUMMARY`,
  `PLAIN-LANGUAGE EXPLANATION`, `UNCERTAINTIES OR LIMITS OF THE REPORT`,
  `INSTRUCTIONS GIVEN IN THE DOCUMENT`, `MEDICINES MENTIONED IN THE REPORT`
  (da aggiungere a `TITOLI` in `referto/spiegazione.ts`);
- chiusura in inglese che inizia con «This is an automatic explanation…» e
  «No specific limits are reported.» quando non ci sono limiti (da
  riconoscere in `spiegazione.ts` e `WidgetReferto.tsx`);
- il grado di certezza si traduce con equivalenti fissi, senza cambiarlo:
  «compatibile con» → «consistent with», «non si esclude» → «cannot be ruled
  out», «verosimile» → «likely»; numeri, unità, lato e sigle invariati;
- le parole del referto citate tra virgolette restano in italiano, seguite
  dalla spiegazione in inglese.

**Motore diretto** (`mother-diretto.ts`): il messaggio di sistema diventa
`prompt + appendice`. **Motore Evolus**: il prompt dell'agente è fisso, quindi
o un secondo agente `mother-en` (variabile `EVOLUS_AGENTE_EN`) oppure una riga
tecnica `LINGUA: en` che il backend mette in testa al messaggio e che il prompt
sa leggere. Consiglio la riga tecnica: un solo agente da sincronizzare.

### 3. La cache separa le lingue

La cache delle spiegazioni (`servizio-chat.ts`) cerca per utente, impronta del
referto e `versione()` del motore. Senza la lingua, chi passa a EN
riceverebbe la spiegazione italiana salvata. Proposta: `versione()` include la
lingua (`diretto/<modello>/<prompt>/en`), così le due spiegazioni dello stesso
referto vivono una accanto all'altra e cambiare prompt le invalida entrambe.
Il widget rispiega il referto quando la lingua cambia (si ridisegna da capo),
quindi con la cache giusta il secondo passaggio IT → EN → IT è immediato.

### 4. Le risposte fisse del backend

Sono in italiano e vanno tradotte con la stessa chiave `lingua`:
`PAROLA_FUORI_DAL_REFERTO`, `ERRORE_GENERICO`, `ERRORE_SOVRACCARICO`
(`mother-diretto.ts`), `CONVERSAZIONE_PERSA` (`servizio-chat.ts`), il 503 «non
configurato» del controller e gli errori del foglietto. Gli errori HTTP che il
frontend riceve senza testo li traduce già lui (`cliente.ts`).

`domanda-su-parola.ts` riconosce solo le domande italiane («Cos'è…», «Cosa vuol
dire…»): servono anche «What is…», «What does … mean», «What are…» e le parole
vuote inglesi, altrimenti in inglese la chiamata obbligata a `cercaTermine`
non scatta.

### 5. Glossario e farmaci

`cercaTermine` e `cercaFarmaci` restituiscono definizioni in italiano (glossario
curato, HPO, Wikipedia in italiano, AIFA). Nella prima versione il modello le
traduce nella risposta, citando la fonte com'è. Dopo, per fedeltà maggiore, lo
strato inglese: HPO ha già le etichette e le definizioni in inglese,
Wikipedia/Wikidata anche (`resources/glossario/`).

### 6. Prove prima di attivarla

- test in `mother-diretto.spec.ts`: con `lingua = en` il prompt ha
  l'appendice, la versione cambia, i titoli inglesi passano dal filtro;
- test in `servizio-chat` (cache separata per lingua);
- 10–20 referti del dataset spiegati in inglese e controllati con le stesse
  regole di fedeltà dell'italiano ([[10-dataset-e-valutazione]]): il rischio è
  che la traduzione ammorbidisca o rafforzi la certezza del medico;
- l'app Python di riferimento resta solo in italiano: la parità
  (`npm run parita:tutti`) vale per `lingua = it`.

## Stima dell'alternativa

Backend: DTO e passaggio della lingua, appendice del prompt, cache, risposte
fisse e domande inglesi in `domanda-su-parola.ts`, con i test: circa mezza
giornata. Evolus: una sincronizzazione del prompt.
