---
tags: [area/specifica]
aggiornato: 2026-10-14
---

# Specifica: Storico referti per sessione

Torna a [[00-indice]] · Riferimenti: [[08-referti-e-farmaci-aifa]],
[[15-backend]], [[16-frontend]].

## Obiettivo

Tre funzionalità collegate:

1. **Login simulata (fake):** l'utente si identifica con un nome o nickname,
   senza password. Serve solo a separare le sessioni tra utenti diversi.
2. **Salvataggio dei turni:** ogni coppia domanda-risposta della chat viene
   salvata lato backend, associata all'utente e alla sessione.
3. **Storico delle chat:** l'utente può riaprire una sessione passata e
   rivedere la spiegazione senza rigenerarla. Evita chiamate inutili al
   modello Evolus.

## Login simulata

### Come funziona

- **Nessuna autenticazione reale:** niente password, niente email, niente OAuth.
- L'utente sceglie un **nickname** (testo libero, 2-30 caratteri).
- Il backend genera un **ID sessione** (UUID v4) e lo associa al nickname.
- Il frontend salva l'ID in `localStorage` e lo invia con ogni richiesta.
- "Esci" cancella l'ID dal `localStorage`; i dati restano nel backend.

### Perché fake

- Nessun dato sensibile da proteggere (i referti li incolla l'utente, non
  vengono da un sistema sanitario).
- Complessità minima: niente registrazione, niente recupero password.
- Per l'hackathon è sufficiente; un'autenticazione vera si aggiunge dopo.

### Flusso

```
Prima visita:
┌───────────────────────────────┐
│                               │
│   Benvenuto su Referto        │
│                               │
│   Come ti chiami?             │
│   ┌─────────────────────────┐ │
│   │ Mario                   │ │
│   └─────────────────────────┘ │
│                               │
│   ┌─────────────────────────┐ │
│   │      Inizia             │ │
│   └─────────────────────────┘ │
│                               │
└───────────────────────────────┘
         ↓
Backend crea utente + sessione
         ↓
Frontend salva ID in localStorage
         ↓
Si apre la chat

Visita successiva (ID in localStorage):
Frontend invia ID → backend verifica → chat con storico
```

## Salvataggio dei turni

### Cosa si salva

Ogni **turno** (messaggio dell'utente + risposta dell'agente) viene salvato nel
backend con:

```typescript
interface Turno {
  id: string;             // UUID
  sessione_id: string;    // ID della sessione di chat
  utente_id: string;      // ID dell'utente
  messaggio: string;      // testo inviato dall'utente
  risposta: string;       // risposta completa dell'agente
  timestamp: string;      // ISO 8601
  conversazione_evolus?: string;  // ID conversazione Evolus
  metadati?: {
    branca?: string;      // branca estratta dalla risposta
    n_termini?: number;   // termini trovati
    n_farmaci?: number;   // farmaci trovati
  };
}
```

### Quando si salva

Il salvataggio avviene **alla fine dello streaming** della risposta, quando il
frontend riceve l'evento `fine` da SSE. Il frontend invia il turno completo al
backend con una chiamata dedicata.

### Dove si salva

**MongoDB con Mongoose.** Database `Referto`, stringa di connessione in
`MONGODB_URI` (variabile d'ambiente). Se la variabile è vuota il modulo non
viene caricato: gli altri moduli funzionano senza database.

Collezioni: `utenti` (nickname, timestamps) e `sessioni` (utente ObjectId,
titolo, array di sotto-documenti `turni`).

## Storico delle chat

### Rotte API

| Rotta | Metodo | Auth | Descrizione |
|---|---|---|---|
| `POST /api/utenti` | POST | Pubblica | Crea utente (nickname → id) |
| `GET /api/utenti/:id` | GET | ID utente | Verifica che l'utente esista |
| `POST /api/sessioni` | POST | ID utente | Crea una nuova sessione di chat |
| `GET /api/sessioni` | GET | ID utente | Lista sessioni dell'utente |
| `GET /api/sessioni/:id` | GET | ID utente | Dettaglio sessione con tutti i turni |
| `POST /api/sessioni/:id/turni` | POST | ID utente | Salva un turno |
| `DELETE /api/sessioni/:id` | DELETE | ID utente | Elimina una sessione |

**Autenticazione:** l'ID utente viene inviato nell'intestazione
`X-Utente-Id`. Il backend verifica solo che l'ID esista e che la sessione
appartenga a quell'utente. Nessun token, nessuna firma.

### Architettura backend

#### Modulo `sessioni` (NestJS) — implementato

```
backend/src/sessioni/
├── sessioni.module.ts           # MongooseModule.forFeature
├── sessioni.service.ts          # CRUD utenti, sessioni, turni
├── sessioni.controller.ts       # rotte API sotto /api/sessioni
├── schemi.ts                    # schemi Mongoose (Utente, Sessione, Turno)
└── dto/
    ├── crea-utente.dto.ts       # { nickname: string }
    ├── crea-sessione.dto.ts     # { titolo?: string }
    └── salva-turno.dto.ts       # { messaggio, risposta, ... }
```

#### DTO

```typescript
// crea-utente.dto.ts
class CreaUtenteDto {
  nickname: string;       // 2-30 caratteri, alfanumerici + spazi
}

// salva-turno.dto.ts
class SalvaTurnoDto {
  messaggio: string;      // max 30.000 caratteri
  risposta: string;       // max 100.000 caratteri
  conversazione_evolus?: string;
  metadati?: {
    branca?: string;
    n_termini?: number;
    n_farmaci?: number;
  };
}

// risposte.dto.ts
class SessioneListaDto {
  id: string;
  titolo: string;         // prima frase del primo messaggio, o branca
  creata: string;         // ISO 8601
  ultimo_turno: string;   // ISO 8601
  n_turni: number;
  anteprima: string;      // primi 100 caratteri dell'ultima risposta
}

class SessioneDettaglioDto {
  id: string;
  titolo: string;
  creata: string;
  turni: TurnoDto[];
}

class TurnoDto {
  id: string;
  messaggio: string;
  risposta: string;
  timestamp: string;
  metadati?: Record<string, unknown>;
}
```

## Architettura frontend

### Schermata di login

Nuovo componente `Login.tsx`:

- Campo nickname + pulsante "Inizia".
- Se l'ID è già in `localStorage`, salta il login.
- Pulsante "Esci" nell'header (visibile solo se loggato): cancella
  `localStorage`, torna al login.

### Barra laterale con lo storico

Nuovo componente `Storico.tsx`:

```
┌──────────────┬──────────────────────────────┐
│  Le tue chat │                              │
│              │                              │
│ ┌──────────┐ │                              │
│ │ Oggi     │ │        Chat attuale          │
│ │ Referto  │ │                              │
│ │ cardiol. │ │  [messaggi della chat]        │
│ │ 14:32    │ │                              │
│ ├──────────┤ │                              │
│ │ Ieri     │ │                              │
│ │ Referto  │ │                              │
│ │ neurol.  │ │                              │
│ │ 09:15    │ │                              │
│ ├──────────┤ │                              │
│ │          │ │                              │
│ └──────────┘ │                              │
│              │                              │
│ [+ Nuova]    │                              │
└──────────────┴──────────────────────────────┘
```

**Su mobile (< 768 px):** la barra laterale diventa un cassetto (drawer) che
si apre con un pulsante hamburger, per non togliere spazio alla chat.

### Componenti

```
frontend/src/
├── Login.tsx                 # schermata di login fake
├── Storico.tsx               # barra laterale con lista sessioni
├── servizio-sessioni.ts      # chiamate API sessioni/turni
```

### Modifiche a componenti esistenti

**`App.tsx`:**
- Stato: aggiunge `utenteId: string | null` (da `localStorage`).
- Se `utenteId` è null → mostra `<Login>`.
- Se `utenteId` esiste → mostra layout con `<Storico>` + `<Chat>`.
- Pulsante "Esci" nell'header.

**`Chat.tsx`:**
- Riceve `sessioneId` e `utenteId` come props.
- Quando cambia `sessioneId` (clic su una sessione nello storico):
  carica i turni salvati con `GET /api/sessioni/:id` e li mostra come
  messaggi, senza chiamare Evolus.
- Alla fine di ogni streaming: salva il turno con
  `POST /api/sessioni/:id/turni`.

**`servizio-chat.ts`:**
- La funzione `inviaMessaggio()` non cambia (il salvataggio è nel componente,
  non nel servizio).

### Flusso: riapertura di una sessione

```
Utente clicca su "Referto cardiologia" nello storico
       ↓
Frontend chiama GET /api/sessioni/<id>
       ↓
Riceve i turni salvati
       ↓
Chat.tsx li mostra come messaggi (senza streaming)
       ↓
Se l'utente scrive un nuovo messaggio:
  → POST /api/chat con conversazione_evolus della sessione
  → la risposta si aggiunge ai messaggi
  → il turno si salva con POST /api/sessioni/<id>/turni
```

### Cosa si evita

- **Rigenerazione delle spiegazioni:** l'utente riapre una sessione e rivede
  le risposte senza chiamare il modello.
- **Perdita del contesto:** l'ID conversazione Evolus viene salvato, quindi
  si può continuare una conversazione interrotta.
- **Ripetizione dei referti:** lo storico mostra tutti i referti analizzati,
  con titolo e branca.

## Persistenza e privacy

- I dati di sessione restano sul server, **mai in Git** (`.gitignore`).
- Il nickname non è un dato sanitario; il testo dei referti lo è.
- I referti sono già inviati a Evolus (servizio esterno del prodotto);
  salvarli nel backend non aggiunge un nuovo destinatario.
- Il pulsante "Elimina sessione" rimuove i dati dal disco.
- Nessun dato di sessione nei log: solo ID e timestamp, mai il contenuto
  ([[09-trace-e-privacy]]).

## Test

- **Backend:** CRUD utenti e sessioni; salvataggio e lettura turni; verifica
  che un utente non acceda alle sessioni di un altro; eliminazione.
- **Frontend:** login e logout; lista sessioni; apertura sessione salvata;
  invio nuovo messaggio in sessione esistente; layout mobile.

## Dipendenze e rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Nessuna autenticazione reale | Chiunque con un ID accede alle sessioni | Accettabile per hackathon; aggiungere auth vera dopo |
| `localStorage` cancellato | L'utente perde accesso alle sessioni | Messaggio: "Inserisci di nuovo il tuo nome" |
| Conversazione Evolus scaduta | Impossibile continuare la chat | Iniziare una nuova conversazione Evolus, il contesto è nei turni salvati |
| MongoDB non raggiungibile | Le rotte sessioni non funzionano | Il modulo è condizionale: senza `MONGODB_URI` il resto dell'app funziona |
