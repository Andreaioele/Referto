# Servizio farmaci

Backend NestJS (TypeScript) che collega i nomi dei farmaci scritti in un
referto al prontuario ufficiale AIFA. È pensato per gli agenti di Referto su
Evolus: l'agente individua i nomi dei farmaci, il servizio li riconosce in modo
**deterministico**, senza modelli e senza ricerca semantica.

Documentazione di progetto: `docs/15-servizio-farmaci.md`.

## Perché un servizio e non un RAG

Con la ricerca semantica (RAG di Evolus) l'agente a volte non trovava farmaci
presenti nei dati (Cardioaspirin), saltava la ricerca o faceva molte chiamate al
modello, con tempi di 40-100 secondi e il limite di richieste del modello
spesso superato. Qui la ricerca è un indice di nomi in memoria: risponde in pochi
millisecondi e dà sempre lo stesso risultato.

## Privacy

Il servizio riceve **solo i nomi dei farmaci**, mai il testo del referto (vedi
`CLAUDE.md`: il referto non va verso servizi esterni). La richiesta rifiuta i
campi non previsti, per esempio `referto`. Il contenuto delle richieste non viene
registrato né salvato.

## API

| Metodo | Rotta | Descrizione |
|---|---|---|
| `POST` | `/farmaci/cerca` | Collega fino a 20 nomi al prontuario |
| `GET` | `/farmaci/:cod` | Un farmaco per codice AIFA (`COD_FARMACO`) |
| `GET` | `/salute` | Stato e data del prontuario (senza chiave) |
| `GET` | `/docs`, `/docs-json` | Documentazione OpenAPI |

Tutte le rotte tranne `/salute` e `/docs` richiedono l'intestazione
`x-api-key` uguale alla variabile `CHIAVE_API`. Se `CHIAVE_API` non è impostata
il controllo è disattivato (solo sviluppo locale; all'avvio compare un avviso).

```bash
curl -X POST http://localhost:3000/farmaci/cerca \
  -H 'content-type: application/json' -H 'x-api-key: ...' \
  -d '{"farmaci": [{"nome": "Cardioaspirin 100 mg"}, {"nome": "ramipril"}], "limite_alternative": 3}'
```

Per ogni nome la risposta contiene `trovato` e, se trovato:

- `principio_attivo`, `atc`, `categoria` (classificazione ATC in parole);
- `descrizione`: frase pronta con i soli dati AIFA, senza dosi né consigli
  ("Cardioaspirin è un medicinale che contiene acido acetilsalicilico. Categoria
  (classificazione ATC): antitrombotici, antiaggreganti piastrinici, esclusa l'eparina.");
- `corrispondenza` e `farmaco`, con le stesse regole di `farmaci_referti.lookup()`:
  - `nome commerciale`: nome italiano con un solo farmaco di riferimento
    (importazioni parallele escluse);
  - `unico con questo principio attivo`: un solo farmaco in commercio;
  - `da scegliere`: il nome non identifica un farmaco; `farmaco` è `null`,
    `perche` spiega il motivo e `alternative` elenca i candidati (al massimo
    `limite_alternative`, totale in `alternative_totali`);
- per ogni farmaco, i link ufficiali AIFA al foglietto illustrativo e all'RCP.

## Dati

| File | Contenuto | Come si aggiorna |
|---|---|---|
| `../farmaci/aifa_farmaci.json` | Prontuario AIFA, condiviso con l'app | `farmaci/build_aifa_index.py` |
| `../farmaci/normalizzazione.json` | Sali e alias dei nomi, condivisi con l'app | a mano |
| `data/atc.json` | Descrizioni della classificazione ATC | `npm run atc -- /percorso/atc.csv` (open data AIFA) |

## Comandi

```bash
npm install
npm run start:dev        # sviluppo, porta 3000
npm test                 # test Jest (unità, API, parità con Python)
npm run build && npm start
```

### Parità con l'app Python

Il servizio deve dare gli stessi risultati di `farmaci_referti.lookup()`.

- `npm run parita`: rigenera `test/fixtures/parita.json` (48 casi scelti, usati da `npm test`).
- `npm run parita:tutti`: confronta tutti i nomi commerciali, principi attivi e
  alias del prontuario (14.029 nomi al 14/10/2026: tutti uguali).

Da rilanciare dopo ogni modifica a `farmaci_referti.py`, ai dati in `farmaci/`
o a `src/farmaci/`.

## Pubblicazione

```bash
# dalla radice del repository
docker build -f servizio-farmaci/Dockerfile -t referto-servizio-farmaci .
docker run -p 3000:3000 -e CHIAVE_API=... referto-servizio-farmaci
```

Il contesto di build è la radice del repository (servono i dati in `farmaci/`);
`Dockerfile.dockerignore` lascia entrare solo i file necessari.

## Limiti noti

- Gli errori di battitura non sono tollerati ("Cardioaspirina", "Sintron").
- Gli alias esteri non sono riconosciuti se seguiti dal dosaggio ("Lipitor 40 mg"
  no, "Lipitor" sì): stesso comportamento dell'app.
- `npm audit` segnala vulnerabilità moderate negli strumenti di test (Jest) e in
  `js-yaml` usato da `@nestjs/swagger` per scrivere la documentazione: nessuna
  riguarda dati ricevuti dal servizio.
