---
tags: [area/specifica]
aggiornato: 2026-10-14
---

# Specifica: Visite e specialisti vicini

Torna a [[00-indice]] · Riferimenti: [[07-branca-e-strutture]],
[[15-backend]], [[16-frontend]].

## Obiettivo

Dopo l'analisi di un referto, l'agente consiglia le **strutture sanitarie più
vicine all'utente** per un'eventuale visita specialistica. La posizione è
**hardcodata a Milano** (coordinate fisse, nessun geocoding da input utente in
questa versione).

L'app deve:

1. **Classificare il referto** per individuare la branca medica (cardiologia,
   neurologia, radiologia, ecc.).
2. **Cercare le strutture** nella zona di Milano tramite OpenStreetMap / Overpass.
3. **Mostrare i risultati** con mappa e lista, ordinati per distanza.

## Classificazione del referto

### Logica (già implementata in Python)

`strutture_sanitarie.py` definisce 19 branche, ognuna con:

- Valori OSM di `healthcare:speciality` (per filtrare le strutture)
- Radici del nome (per riconoscere strutture dal nome)
- Parole chiave del referto (per classificazione deterministica di riserva)

```python
BRANCHES = {
    "cardiologia": {
        "osm_speciality": ["cardiology"],
        "name_roots": ["cardio", "cuore"],
        "keywords": ["ecg", "ecocardiogramma", "holter", ...]
    },
    # ... 18 altre branche
}
```

**`classify_report()`** usa il modello con JSON schema vincolato a un `enum`
delle 19 branche. Se il modello non risponde, `keyword_branch()` conta le
parole chiave (riserva, ~45% di accuratezza).

### Come portare nel backend NestJS

Il Mother agent di Evolus **già classifica il referto**: nel prompt attuale
produce una riga `ARGOMENTO: <esame> · <area>` con l'area da un elenco chiuso
di 19 branche. Quindi **non serve una seconda classificazione nel backend**:
il frontend deve estrarre la branca dalla risposta dell'agente.

Se la risposta dell'agente non contiene la branca (errore, timeout), il backend
può applicare la classificazione deterministica per parole chiave come riserva.

## Ricerca strutture

### Fonte dati: OpenStreetMap via Overpass

L'app Python usa Overpass API per cercare strutture sanitarie in un raggio
intorno alle coordinate. Stessa logica da portare nel backend.

### Alternativa: Google Maps Places API

| | OpenStreetMap / Overpass | Google Maps Places API |
|---|---|---|
| **Costo** | Gratuito | $17 per 1.000 richieste (Nearby Search) |
| **Copertura Italia** | Parziale (soprattutto ospedali, pochi studi privati) | Completa (include studi medici, cliniche private) |
| **Dettagli** | Tag OSM (specialità dichiarata, telefono, sito) | Nome, indirizzo, telefono, orari, recensioni, foto |
| **Limiti** | Server spesso sovraccarico (504), dati non uniformi | Quota mensile gratuita: $200/mese (~11.700 richieste) |
| **Filtro per specialità** | Tag `healthcare:speciality` (spesso assente) | `type=doctor` + keyword (es. "cardiologo Milano") |

**Raccomandazione:** partire con OpenStreetMap (gratuito, già implementato in
Python) con posizione hardcodata a Milano (e cache pre-generata). Valutare
Google Maps Places API in un secondo momento per dati più completi.

### Posizione hardcodata: Milano

```typescript
const POSIZIONE_DEFAULT = {
  citta: "Milano",
  lat: 45.4642,
  lon: 9.1900,
};
```

Nessun geocoding, nessun campo di input per la città, nessun profilo utente in
questa versione. La posizione è una costante nel backend.

## Architettura backend

### Modulo `strutture` (NestJS)

```
backend/src/strutture/
├── strutture.module.ts
├── strutture.service.ts         # cerca strutture via Overpass
├── strutture.controller.ts      # rotte API
├── overpass.client.ts           # client HTTP per Overpass API
├── branche.ts                   # definizione delle 19 branche e parole chiave
├── cache-strutture.service.ts   # cache su disco (opzionale)
└── dto/
    ├── cerca-strutture.dto.ts
    └── risposte.dto.ts
```

### Servizio `StruttureService`

1. **`cercaStrutture(branca: string, raggio?: number)`:**
   - Coordinate fisse di Milano.
   - Query Overpass leggera: solo tag `healthcare`, `amenity` (clinic, doctors,
     hospital). Il filtro per branca si fa in TypeScript, non nella query.
   - Raggruppamento risultati (stessa logica Python):
     1. **Specialità dichiarata** (`healthcare:speciality` o nome pertinente):
        _"Si occupano di cardiologia"_
     2. **Ospedali e poliambulatori:** _"Chiedi del reparto di cardiologia"_
     3. **Studi senza specialità dichiarata** (nascosti di default):
        _"Chiedi prima di andare"_
   - Esclusioni: farmacie, dentisti, strutture con altra specialità dichiarata.
   - Fino a 200 risultati, ordinati per distanza.

2. **`classificaPerParoleChiave(testo: string)`** (riserva):
   - Conta le parole chiave di ogni branca nel testo.
   - Restituisce la branca con il punteggio più alto.

### Overpass client

Mirror multipli come nell'app Python, con fallback:

```typescript
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  // altri mirror
];
```

Timeout: 25 secondi per mirror, poi il successivo.

### Cache (opzionale ma consigliato)

Con la posizione fissa a Milano, la cache è molto efficace: una sola query
Overpass copre tutte le richieste. Si può pre-generare al deploy.

Approccio: file JSON in `backend/data/strutture_milano.json`, rigenerato
periodicamente (cron o script manuale). Se il file esiste, il servizio lo usa
senza chiamare Overpass.

### Rotte API

| Rotta | Metodo | Auth | Descrizione |
|---|---|---|---|
| `POST /api/strutture/cerca` | POST | Pubblica | Cerca strutture vicine per branca |
| `GET /api/strutture/branche` | GET | Pubblica | Elenco delle 19 branche disponibili |

### DTO

```typescript
// cerca-strutture.dto.ts
class CercaStruttureDto {
  branca: string;         // una delle 19 branche (validata con enum)
  raggio?: number;        // km, default 10, max 50
}

// risposte.dto.ts
class StrutturaDto {
  nome: string;
  tipo: string;               // "ospedale" | "ambulatorio" | "studio" | ...
  tipo_etichetta: string;     // etichetta in italiano
  gruppo: "specialita" | "ospedale" | "altro";
  gruppo_messaggio: string;   // "Si occupano di ..." | "Chiedi del reparto"
  specialita: string[];       // specialità dichiarate (tradotte in italiano)
  distanza_km: number;
  indirizzo?: string;
  telefono?: string;
  sito_web?: string;
  lat: number;
  lon: number;
}

class RispostaStruttureDto {
  branca: string;
  branca_etichetta: string;   // "Cardiologia"
  citta: string;              // "Milano"
  raggio_km: number;
  strutture: StrutturaDto[];
  totale: number;
  fonte: string;              // "OpenStreetMap"
  avviso: string;             // "I dati provengono da OpenStreetMap..."
}
```

## Architettura frontend

### Integrazione nella chat

Dopo la risposta dell'agente Evolus:

1. Il frontend estrae la branca dalla riga `ARGOMENTO: <esame> · <area>`.
2. Chiama `POST /api/strutture/cerca` con la branca estratta.
3. Sotto la risposta (e sotto i termini difficili), mostra la sezione
   **"Dove andare"**.

### Componenti

```
frontend/src/
├── Strutture.tsx              # sezione "Dove andare"
├── MappaStrutture.tsx         # mappa Leaflet
├── servizio-strutture.ts      # chiamate API
```

**Dipendenza:** `leaflet` (già usato nell'app Python, da unpkg).

### Visualizzazione

```
┌────────────────────────────────────────────┐
│ Dove andare per una visita                  │
│ Cardiologia · Milano · entro 10 km          │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │         [Mappa Leaflet]                 │ │
│ │    📍 📍    📍                           │ │
│ │        📍         📍                     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Si occupano di cardiologia                  │
│ ┌─────────────────────────────────────────┐ │
│ │ Studio Cardiologico Rossi    0,8 km     │ │
│ │ Via Roma 12 · 02 1234567               │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Chiedi del reparto di cardiologia           │
│ ┌─────────────────────────────────────────┐ │
│ │ Ospedale Niguarda            3,2 km     │ │
│ │ Piazza Ospedale Maggiore 3             │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ Policlinico di Milano        4,1 km     │ │
│ │ Via F. Sforza 35                       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ▸ Altri studi e ambulatori (chiedi prima)   │
│                                             │
│ ⓘ I dati provengono da OpenStreetMap e      │
│   potrebbero non essere completi.           │
│   Verifica sempre prima di prenotare.       │
└────────────────────────────────────────────┘
```

**Principi UI ([[05-webapp-e-interfaccia]]):**

- Mappa compatta (200-250 px di altezza), interattiva (zoom, pan).
- Lista sotto la mappa, raggruppata per tipo.
- Gruppo "altro" nascosto in `<details>` con avviso.
- Ogni struttura: nome, distanza, indirizzo, telefono (cliccabile: `tel:`).
- Avviso fisso in fondo: dati OSM non sempre completi.

## Test

- **Backend:** test con branca valida e invalida; mock di Overpass con dati
  di Milano; verifica raggruppamento e ordinamento per distanza.
- **Frontend:** verifica che la mappa si carichi; verifica lista raggruppata;
  verifica link telefono cliccabile.

## Dipendenze e rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Overpass sovraccarico (504) | Nessun risultato | Cache pre-generata per Milano; mirror multipli |
| Dati OSM incompleti a Milano | Pochi studi privati | Avviso all'utente; futura integrazione Google Maps |
| Branca non estratta dalla risposta agente | Nessuna ricerca | Classificazione deterministica per parole chiave |
| Costi Google Maps se integrato | Budget | Partire con OSM; Google solo come upgrade futuro |
| Leaflet in bundle | +40 KB gzipped | Caricamento lazy del componente mappa |
