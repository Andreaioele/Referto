# Referto

Referto è un’applicazione web locale che aiuta i pazienti a comprendere il
contenuto di un referto medico usando MedGemma tramite Ollama.

Può elaborare:

- PDF testuali e PDF scansionati;
- fotografie o scansioni di documenti medici;
- testo incollato;
- dataset testuali JSONL, incluso il formato RadGraph-IT.

L’applicazione sintetizza i reperti importanti in italiano semplice, conserva il
grado di incertezza del documento e non genera consigli medici. Le indicazioni
operative già presenti nel documento vengono mostrate in una sezione separata e
chiaramente attribuite alla fonte.

> **Attenzione:** il risultato è generato automaticamente e può contenere
> errori. Referto non formula diagnosi e non deve essere usato per decisioni
> terapeutiche o valutazioni di urgenza.

## Caratteristiche

- Elaborazione locale tramite l’API di Ollama su `127.0.0.1:11434`.
- Interfaccia per PDF, immagini, testo e dataset.
- Trascrizione di fotografie e scansioni con il modello multimodale.
- Controllo automatico di fedeltà e sicurezza della risposta.
- Routing locale con Laya: le bozze semplici e già conformi possono evitare una
  seconda generazione, mentre i casi incerti mantengono l’audit completo.
- Benchmark A/B persistenti e dashboard per confrontare tempi, chiamate e token.
- Risposte in prosa, senza Markdown o elenchi generati dal modello.
- Cronologia persistente con data, ora, durata, prompt, risposte e passaggi.
- Trace salvate anche per le esecuzioni fallite.

## Requisiti

- Python 3.10 o successivo;
- [Ollama](https://ollama.com/download);
- una copia locale di MedGemma compatibile con Ollama;
- memoria sufficiente per eseguire il modello scelto.

Il modello predefinito configurato nel progetto è:

```text
medgemma:4b-it-q4_K_M
```

Il decision model predefinito è:

```text
laya:322m-multilingual-mlx-fp16
```

## 1. Installare Ollama

Scarica Ollama dal [sito ufficiale](https://ollama.com/download) e avvialo.

Su Linux, se il servizio non è già attivo:

```bash
ollama serve
```

Controlla che il comando sia disponibile:

```bash
ollama --version
ollama list
```

## 2. Configurare MedGemma in Ollama

### Se il modello è già installato

Verifica che il nome compaia in Ollama:

```bash
ollama list
ollama show medgemma:4b-it-q4_K_M
```

Esegui una prova:

```bash
ollama run medgemma:4b-it-q4_K_M
```

Scrivi `/bye` per terminare la sessione.

### Se devi importare il modello

1. Accedi alla pagina di
   [google/medgemma-4b-it](https://huggingface.co/google/medgemma-4b-it).
2. Accetta le condizioni **Health AI Developer Foundations** richieste da
   Google per scaricare i file.
3. Scarica una versione compatibile con Ollama. La pagina del modello contiene
   anche il collegamento alle quantizzazioni utilizzabili con Ollama e llama.cpp.
4. Copia il file di esempio:

```bash
cp Modelfile.example Modelfile
```

5. Modifica la prima riga del `Modelfile` indicando il percorso assoluto del
   file GGUF o della cartella Safetensors:

```text
FROM /percorso/assoluto/al/modello.gguf
```

6. Crea il modello locale con il nome usato dall’app:

```bash
ollama create medgemma:4b-it-q4_K_M -f Modelfile
```

7. Verifica l’importazione:

```bash
ollama show medgemma:4b-it-q4_K_M
ollama run medgemma:4b-it-q4_K_M
```

Ollama supporta l’importazione da cartelle Safetensors e da file GGUF. Un GGUF
deve essere già quantizzato prima dell’importazione. Per l’analisi delle immagini
serve una build multimodale di MedGemma completa del relativo supporto visivo;
una conversione solo testuale potrà essere usata esclusivamente con testo e PDF
contenenti testo estraibile.

Documentazione ufficiale:

- [Importare un modello in Ollama](https://docs.ollama.com/import)
- [Guida rapida di Ollama](https://docs.ollama.com/quickstart)
- [MedGemma su Hugging Face](https://huggingface.co/google/medgemma-4b-it)

## 3. Installare il decision model (Laya o BGE-M3)

Referto supporta due motori di decision model per ridurre la latenza evitando la seconda generazione di revisione (audit MedGemma) quando la bozza iniziale è già fedele e conforme:

### Opzione A: Routing con Laya (classificazione tipizzata)

Richiede Ollama 0.40.0 o successivo con l'endpoint `/v1/systemone`:

```bash
ollama pull laya:322m-multilingual-mlx-fp16
```

Laya valuta la bozza e attribuisce probabilità ai percorsi (`fast` vs `standard`/`guarded`). Lo stato viene mantenuto compatto entro i 944 token per prevenire overflow.

### Opzione B: Grounding semantico con BGE-M3 (verifica vettoriale)

Utilizza l'endpoint batch di embedding `/api/embed` con il modello multilingue stato dell'arte BGE-M3:

```bash
ollama pull bge-m3:latest
```

BGE-M3 calcola matematicamente l'ancoraggio semantico di ogni affermazione clinica della bozza rispetto alle frasi del referto. Se tutte le asserzioni superano la soglia di fedeltà, l'audit viene saltato in ~25 ms con zero rischi di allucinazione non supportata.

Per avviare l'app con uno dei due modelli:

```bash
# Con Laya
python3 web_app.py --decision-model laya:322m-multilingual-mlx-fp16

# Con BGE-M3 (grounding semantico)
python3 web_app.py --decision-model bge-m3:latest
```

## 4. Installare Referto

Clona il repository:

```bash
git clone https://github.com/Andreaioele/Referto.git
cd Referto
```

Crea un ambiente virtuale e installa le dipendenze:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
```

Su Windows PowerShell, l’attivazione dell’ambiente è:

```powershell
.venv\Scripts\Activate.ps1
```

## 5. Avviare l’app

Assicurati che Ollama sia in esecuzione, quindi:

```bash
source .venv/bin/activate
python3 web_app.py
```

Apri nel browser:

```text
http://127.0.0.1:7860
```

L’app ascolta soltanto sull’interfaccia locale e non viene pubblicata in rete.

### Usare un modello o una porta differenti

```bash
python3 web_app.py \
  --model nome-del-modello-in-ollama \
  --decision-model laya:322m-multilingual-mlx-fp16 \
  --ollama-url http://127.0.0.1:11434 \
  --port 8080
```

Il valore passato a `--model` deve corrispondere esattamente a uno dei nomi
mostrati da `ollama list`.

Per disattivare il routing e forzare sempre l’audit MedGemma:

```bash
python3 web_app.py --senza-decision-model
```

## Utilizzo

L’interfaccia contiene sei sezioni:

1. **Documento PDF** — estrae il testo o legge visivamente le scansioni.
2. **Immagine** — trascrive una fotografia o scansione del referto e la spiega.
3. **Testo** — analizza un referto incollato manualmente.
4. **Dataset** — elabora più referti da un file JSONL.
5. **Performance** — esegue un confronto accoppiato con e senza decision model.
6. **Cronologia** — mostra le trace delle esecuzioni con date, orari e passaggi.

### Confrontare le performance

Apri **Performance** e scegli se confrontare un singolo referto oppure un intero
dataset JSONL. Nel primo caso puoi incollare il testo o caricare un PDF. Nel
secondo caso seleziona il file JSONL: l’app conta localmente le righe, mostra il
numero totale di elaborazioni e usa tutti i referti del file.

Per ogni ripetizione l’app esegue entrambe le modalità sullo stesso input,
alternandone l’ordine. Il test del dataset viene eseguito in background e la UI
mostra l’avanzamento senza bloccarsi. La dashboard mostra:

- durata end-to-end mediana;
- chiamate a MedGemma e audit evitati;
- token generati;
- risultato di ogni singola prova oppure, per un dataset, il confronto di ogni
  referto con il riepilogo complessivo.

Una singola prova è indicativa: per un confronto più stabile usa almeno 3–5
ripetizioni su un singolo referto. Su un dataset completo conviene iniziare con
1 ripetizione, perché ogni referto produce due elaborazioni. Le probabilità di Laya e il campo
`confidence` non sono una misura di accuratezza clinica; le soglie vanno validate
su un insieme di referti separato prima di usare l’ottimizzazione in produzione.

Le immagini devono contenere un documento scritto. L’app non interpreta
direttamente radiografie, TAC, risonanze, ecografie o altre immagini cliniche.

## Trace, risultati e privacy

Ogni esecuzione viene registrata nella cartella locale `traces/`. Le trace
possono contenere il testo integrale del referto, prompt e risposte del modello.
I risultati dei dataset vengono salvati in `risultati/`.
Le sole metriche dei confronti vengono salvate in `benchmarks/`: il testo del
referto e le risposte non vengono inclusi, ma viene conservata un’impronta SHA-256
per identificare input uguali.

Queste cartelle sono escluse da Git tramite `.gitignore`. Non aggiungerle
manualmente al repository perché potrebbero contenere dati sanitari personali.

Il progetto non invia intenzionalmente i documenti a servizi remoti: usa
l’endpoint locale di Ollama configurato con `--ollama-url`. Chi modifica tale
indirizzo è responsabile della destinazione dei dati.

## Uso da terminale

Per spiegare un PDF testuale senza usare l’interfaccia web:

```bash
python3 spiega_referto.py "/percorso/del/referto.pdf"
```

Per scegliere il file di uscita o il modello:

```bash
python3 spiega_referto.py referto.pdf \
  --output spiegazione.txt \
  --model medgemma:4b-it-q4_K_M \
  --decision-model laya:322m-multilingual-mlx-fp16
```

Usa `--senza-decision-model` per eseguire il percorso standard completo.

## Esecuzione su Cluster GPU (NVIDIA H100 / SLURM)

Per elaborare in batch dataset clinici su larga scala (es. `all_datasets_merged.jsonl` con oltre 5.000 referti) su nodi di calcolo ad alte prestazioni come **NVIDIA H100 (80GB VRAM)**:

### 1. Esecuzione diretta con Python
```bash
python3 cluster_agent_task.py \
  --dataset all_datasets_merged.jsonl \
  --workers 4 \
  --decision-model bge-m3:latest \
  --resume
```

Parametri principali:
- `-d, --dataset`: nome del file o percorso del dataset (`datasets/` o assoluto);
- `-w, --workers`: numero di worker thread concorrenti (consigliato 4–8 su H100 per saturare la GPU);
- `-s, --sample`: campionamento casuale di N referti (con `--seed`);
- `-l, --limit`: limita ai primi L referti;
- `--resume`: riprende il lavoro saltando i referti già presenti nel file di output (tollerante a interruzioni);
- `-o, --output`: percorso personalizzato del file `.jsonl` di output (genera in automatico anche il `*_summary.json`).

### 2. Sottomissione SLURM automatica
È disponibile lo script preconfigurato `submit_h100.sh`:
```bash
sbatch submit_h100.sh all_datasets_merged.jsonl 4
```
Lo script:
1. Alloca le risorse richieste (`--gres=gpu:1`, 8 CPU, 64GB RAM);
2. Rileva l'hardware e avvia Ollama se non già in ascolto;
3. Esegue `cluster_agent_task.py` con logging in tempo reale e salvataggio atomico dei risultati in `risultati/`;
4. Registra le trace complete in `traces/` compatibili con la Cronologia web.

## Test

Con l’ambiente virtuale attivo:

```bash
python3 -m unittest -v test_app.py
```

## Struttura principale

```text
web_app.py          server Flask e API web
spiega_referto.py   estrazione, prompt, controlli e interazione con Ollama
decision_model.py   routing tipizzato e fallback conservativo con Laya
benchmarking.py     misurazione A/B e archivio locale delle metriche
performance_metrics.py raccolta delle metriche per chiamata
trace_store.py      archivio persistente delle trace
templates/          pagina HTML
static/             CSS e JavaScript
test_app.py         test automatici
```

## Licenza e modello

Il repository non include i pesi di MedGemma. L’uso del modello è soggetto ai
termini pubblicati da Google nella pagina ufficiale di MedGemma. Verifica sempre
licenza, requisiti e limitazioni del modello prima della distribuzione.
