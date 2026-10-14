# Referto

L'applicazione legge referti da PDF, foto/scansioni, testo incollato e dataset
JSONL. I dati vengono inviati esclusivamente all'istanza locale di Ollama
(`127.0.0.1`). L'agente sintetizza conclusioni, reperti importanti e incertezze
dichiarate usando un italiano semplice. Non genera diagnosi aggiuntive, consigli
medici, raccomandazioni operative o prossimi passi. Se il documento originale
contiene indicazioni operative, queste vengono conservate in una sezione separata
e chiaramente segnalate come contenuto del documento, senza essere approvate o
ampliate dall'applicazione.

La lettura delle immagini serve soltanto a trascrivere una foto o scansione del
documento. L'agente rifiuta di interpretare direttamente radiografie, TAC,
risonanze, ecografie o altre immagini cliniche prive di referto testuale.

## Installazione

Apri il terminale nella cartella che contiene questi file:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

Verifica che Ollama e MedGemma siano disponibili:

```bash
ollama list
```

Se il modello non compare:

```bash
ollama pull medgemma:4b-it-q4_K_M
```

## Interfaccia web

Avvia Ollama, poi esegui:

```bash
source .venv/bin/activate
python3 web_app.py
```

Apri nel browser:

```text
http://127.0.0.1:7860
```

L'interfaccia contiene cinque sezioni:

1. **PDF**: estrae il testo; se il PDF e' una scansione, prova a leggerne le pagine come immagini.
2. **Immagine**: trascrive una foto/scansione del referto e poi la spiega.
3. **Testo**: analizza il testo incollato.
4. **Dataset**: elabora un file JSONL come RadGraph-IT e genera un JSONL scaricabile.
5. **Cronologia**: mostra tutte le esecuzioni con data, ora, durata, stato e dettaglio dei passaggi.

Ogni esecuzione, anche se fallisce, viene salvata immediatamente nella cartella
`traces`, organizzata per giorno. La trace contiene tipo e nome dell'input,
testo estratto o trascritto, prompt e risposte del modello, controlli applicati,
metriche, errori e risultato finale. I dati rimangono sul computer e possono
essere consultati dalla sezione **Cronologia**.

Per i dataset e' consigliabile iniziare da 2-5 referti: ogni elemento richiede
piu' passaggi del modello per generazione e verifica. I risultati vengono salvati
anche nella cartella `risultati`.

Per usare un'altra porta o variante del modello:

```bash
python3 web_app.py --port 8080 --model medgemma:4b-it-q4_K_M
```

L'applicazione ascolta soltanto su `127.0.0.1` e non e' pubblicata in rete.

## Uso dal terminale per un PDF

```bash
python3 spiega_referto.py "/percorso/del/referto.pdf"
```

Per scegliere il file di uscita:

```bash
python3 spiega_referto.py referto.pdf -o spiegazione.txt
```

Per usare un'altra variante installata in Ollama:

```bash
python3 spiega_referto.py referto.pdf --model medgemma:4b
```

Dal terminale `spiega_referto.py` continua ad accettare PDF testuali. Per PDF
scansionati, immagini, testo libero e dataset usa l'interfaccia web.

## Limiti importanti

L'output e' una spiegazione automatica, non una diagnosi, e non va usato per
terapie, decisioni cliniche o valutazioni di urgenza.
