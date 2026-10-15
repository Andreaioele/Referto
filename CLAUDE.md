# Referto: istruzioni per Claude Code

App web che spiega i referti medici ai pazienti in italiano semplice (hackathon
AMD Developer ACT III, track Health).

## Prima di lavorare

Leggi `docs/00-indice.md` e poi le note dell'area che tocchi. La cartella
`docs/` è la documentazione di onboarding (vault Obsidian, note collegate con
`[[wikilink]]`).

## Struttura

- `backend/`: backend NestJS (TypeScript), rotte sotto `/api`; dati AIFA in `backend/data/`.
- `frontend/`: frontend React + Vite (TypeScript); inoltra `/api` al backend.
- `resources/`: app Python di riferimento (Flask), dataset, script e prove. Le
  sue funzioni vanno portate in backend e frontend una alla volta.
- Nella radice restano solo `backend/`, `frontend/`, `resources/`, `docs/` e i
  file del repository (`README.md`, `CLAUDE.md`, `.gitignore`, `vercel.json`): niente file sparsi.
- `vercel.json` (radice) pubblica backend e frontend come un unico progetto
  Vercel con Services; `resources/` non va mai aggiunta ai servizi.

## Regola: documentazione sempre allineata

**Ogni modifica al codice va riportata in `docs/` nello stesso commit:**

1. aggiorna la nota dell'area toccata (e il campo `aggiornato:` nel frontmatter);
2. aggiungi una riga in cima a `docs/registro-modifiche.md`
   (`AAAA-MM-GG · branch · cosa cambia · [[nota]]`);
3. se nasce un'area nuova, crea la nota, collegala e aggiungila all'indice e
   alla mappa `mermaid` di `docs/00-indice.md`;
4. se risolvi o scopri un problema, aggiorna `docs/14-problemi-noti-e-prossimi-passi.md`.

Convenzioni delle note in `docs/come-usare-questa-documentazione.md`.

## Diagrammi (archify)

L'output della skill **archify** va sempre in `docs/archify/`, una cartella per
diagramma (`docs/archify/<tipo>-<argomento>-<AAAAMMGG-HHMMSS>/`), mai in
`.archify/` nella radice; aggiungi ogni diagramma alla tabella di
`docs/archify/README.md`. Se serve capire architettura o flussi, leggi anche
quella cartella (`candidate.json` è il diagramma in dati, più facile da leggere
dell'HTML).

## Vincoli di prodotto

- Niente diagnosi, terapie o consigli: si spiega solo ciò che è scritto nel
  referto; farmaci e indicazioni solo se scritti dal medico.
- Ogni dato generato dal modello deve essere verificabile (citazione o fonte
  ufficiale) o avere una riserva deterministica.
- Interfaccia usabile da una persona di 70 anni: stesso tema, poche
  informazioni alla volta, dettagli tecnici a scomparsa
  (`docs/05-webapp-e-interfaccia.md`).
- Mai dati sanitari in Git: traces, risultati, profilo e `.env` restano fuori
  (`.gitignore`). Il testo dei referti può andare ai servizi esterni del
  prodotto (Evolus, Vercel); nei log solo esiti tecnici, mai il contenuto.

## Comandi

```bash
cd backend && npm test && npm run parita:tutti     # test e parità con l'app Python
cd frontend && npm run build && npm run lint && npm test
cd resources && uv run --no-project --with-requirements requirements.txt python -m unittest test_app
cd resources && uv run --no-project --with-requirements requirements.txt python web_app.py --port 7860 --model <modello> --senza-decision-model
```

## Git

- Flusso: branch di lavoro → `staging` → `main`.
- Nessuna attribuzione a Claude nei commit o nelle PR (niente `Co-Authored-By`).
- Testi, commenti e messaggi di commit in italiano.
