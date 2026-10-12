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

## 3. Installare Referto

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

## 4. Avviare l’app

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
  --ollama-url http://127.0.0.1:11434 \
  --port 8080
```

Il valore passato a `--model` deve corrispondere esattamente a uno dei nomi
mostrati da `ollama list`.

## Utilizzo

L’interfaccia contiene cinque sezioni:

1. **Documento PDF** — estrae il testo o legge visivamente le scansioni.
2. **Immagine** — trascrive una fotografia o scansione del referto e la spiega.
3. **Testo** — analizza un referto incollato manualmente.
4. **Dataset** — elabora più referti da un file JSONL.
5. **Cronologia** — mostra le trace delle esecuzioni con date, orari e passaggi.

Le immagini devono contenere un documento scritto. L’app non interpreta
direttamente radiografie, TAC, risonanze, ecografie o altre immagini cliniche.

## Trace, risultati e privacy

Ogni esecuzione viene registrata nella cartella locale `traces/`. Le trace
possono contenere il testo integrale del referto, prompt e risposte del modello.
I risultati dei dataset vengono salvati in `risultati/`.

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
  --model medgemma:4b-it-q4_K_M
```

## Test

Con l’ambiente virtuale attivo:

```bash
python3 -m unittest -v test_app.py
```

## Struttura principale

```text
web_app.py          server Flask e API web
spiega_referto.py   estrazione, prompt, controlli e interazione con Ollama
trace_store.py      archivio persistente delle trace
templates/          pagina HTML
static/             CSS e JavaScript
test_app.py         test automatici
```

## Licenza e modello

Il repository non include i pesi di MedGemma. L’uso del modello è soggetto ai
termini pubblicati da Google nella pagina ufficiale di MedGemma. Verifica sempre
licenza, requisiti e limitazioni del modello prima della distribuzione.
