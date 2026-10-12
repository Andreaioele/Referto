# check-usage-app

Microservizio minimo (Python stdlib, zero dipendenze, immagine ~50 MB) per vedere l'usage del team
sull'API AMD Radeon. Chiama `/radeon/api/v1/usage?include_recent=true` lato backend e mostra tutti
i dati in una pagina HTML. Il token resta nel server: il browser parla solo con `/api/usage`.

## Setup

```bash
cd check-usage-app
cp .env.example .env
```

Apri `.env` e inserisci il token tra le virgolette:

```
TOKEN="il-tuo-token"
```

`.env` è nel `.gitignore`: non committarlo.

## Avvio con Docker

```bash
docker compose up -d --build
```

Apri http://localhost:8080 e premi **Check usage**. Per fermarlo: `docker compose down`.

## Avvio senza Docker

```bash
python3 server.py
```

Il server legge `.env` dalla sua cartella. Su macOS con il Python di python.org, se compare
`CERTIFICATE_VERIFY_FAILED`, lancia `SSL_CERT_FILE=/etc/ssl/cert.pem python3 server.py`.

## Variabili (`.env` o ambiente)

| Variabile | Default |
|---|---|
| `TOKEN` | obbligatoria |
| `PORT` | `8080` (solo senza Docker; con Docker cambia la porta in `docker-compose.yml`) |
| `AMD_USAGE_URL` | `https://developer.amd.com.cn/radeon/api/v1/usage?include_recent=true` |

## Cosa mostra

Budget giornaliero con barra e countdown al reset · KPI di oggi · tutti i campi account/periodo ·
confronto metriche oggi / 24h / 30gg / totale · tabelle per modello e per sorgente ·
tutte le richieste recenti · JSON grezzo in fondo. Le tabelle sono generate dalle chiavi del JSON,
quindi eventuali nuovi campi dell'API compaiono senza toccare il codice.
