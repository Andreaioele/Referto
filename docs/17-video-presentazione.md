---
tags: [area/progetto]
aggiornato: 2026-10-17
---

# Video di presentazione

Torna a [[00-indice]] · Vincoli dell'hackathon in [[01-panoramica]].

## A cosa serve

Il video di 2–3 minuti per l'hackathon: demo, marketing e spiegazione delle
integrazioni. È **tutto generato**: niente registrazione dello schermo, niente
voce umana. Il progetto è in `resources/video/` e resta fuori da Vercel.

## Strumenti (tutti gratuiti)

| Cosa | Strumento |
|---|---|
| Video scritto in HTML/CSS + GSAP, esportato in MP4 | **HyperFrames** 0.8.164 (Apache 2.0, HeyGen) |
| Skill per Claude Code | plugin `hyperframes@hyperframes` (router `/hyperframes:hyperframes`) |
| Voce fuori campo | traccia **ElevenLabs** in inglese registrata dal team dal testo di `TESTO-VOCE.md`. La prima prova («Kristen», 16/10/2026) è superata dal nuovo copione: finché non arriva la traccia nuova la voce è provvisoria (vedi sotto). Voci di riferimento per i tempi: Edge TTS `it-IT-IsabellaNeural` (scene 3-6) e `en-US-AvaNeural` (scene 1, 2, 7, 8 e 9); voce provvisoria unica da `voce/traccia_provvisoria.py` |
| Musica di sottofondo | **MusicGen** (`facebook/musicgen-small`, in locale, gratuito; pesi CC BY-NC 4.0, quindi solo uso non commerciale), tre pezzi montati da `voce/monta_musica.py`; mix con il *voiceover carve* di HyperFrames (`@hyperframes/core` in `devDependencies`) |
| Esportazione | FFmpeg (Homebrew) e Chrome di sistema |

La voce non si genera con il TTS di HyperFrames: senza chiavi HeyGen o
ElevenLabs userebbe Kokoro, meno naturale in italiano.

## Comandi

Con il plugin installato, la CLI va lanciata dal suo launcher (`npx hyperframes`
negli esempi delle skill):

```bash
cd resources/video
node ~/.claude/plugins/cache/hyperframes/hyperframes/0.8.164/skills/hyperframes/scripts/plugin-cli.mjs check
node ~/.claude/plugins/cache/hyperframes/hyperframes/0.8.164/skills/hyperframes/scripts/plugin-cli.mjs preview --background
node ~/.claude/plugins/cache/hyperframes/hyperframes/0.8.164/skills/hyperframes/scripts/plugin-cli.mjs snapshot --at 2.6,9.8,18.4
node ~/.claude/plugins/cache/hyperframes/hyperframes/0.8.164/skills/hyperframes/scripts/plugin-cli.mjs render --quality draft --output renders/bozza.mp4
```

L'anteprima apre Studio su `http://localhost:3002/#project/video`, dove si può
anche modificare a mano; si ferma con `preview --stop`.
`npm run dev`, `npm run check` e `npm run render` fanno lo stesso con la
versione fissata in `package.json`. Le esportazioni (`renders/`) e i file di
lavoro (`.hyperframes/`) sono esclusi da Git.

## File

| File | Ruolo |
|---|---|
| `index.html` | Composizione principale (1920×1080, 30 fps): monta le scene e le voci ai tempi del copione |
| `compositions/scena-NN-*.html` | Una sotto-composizione per scena, con tempi locali. `scena-01-gancio` contiene le scene 1 e 2 del copione (la domanda e il desiderio: le carte delle tre strade si girano nelle tre promesse senza stacchi, poi il marchio); `scena-03-demo` contiene le scene 3 e 4, perché il widget resta aperto |
| `compositions/scena-05-integrazioni.html`, `scena-06-tecnologia.html` | Scena 5 (prontuario, foglietto, strutture e mappa) e scena 6 (diagramma con AMD) |
| `compositions/scena-07-osservabilita.html`, `scena-08-potenziale.html`, `scena-09-finale.html` | Scena 7 (una trace d'esempio con i campi veri del backend, «Report text: never stored», ciclo Trace → Measure → Improve), scena 8 (perché ora, mercato, come entriamo, Europa; dati da [[18-valore-di-business]]) e scena 9 (la domanda per il medico, l'ultima parola al medico e il 112, poi marchio, hackathon e crediti) |
| `archivio/` | Le scene tolte il 16/10/2026 (vecchia promessa, fiducia e chiusura, come `.html.txt` perché il controllo non le legga) e le loro voci |
| `assets/ui/foglietto-triatec-p1.png` | Pagina 1 del foglietto ufficiale AIFA del Triatec, resa dal PDF del backend |
| `assets/mappa/positron-bazzini.png` | Mappa della scena 5 come la disegna il portale (MapLibre, stile Positron di OpenFreeMap, 478×558 a doppia risoluzione, centrata sulla struttura; © OpenStreetMap contributors, © OpenMapTiles), resa una volta sola con Chrome headless il 17/10/2026. Le vecchie tessere OSM di Leaflet sono in `archivio/mappa-osm-leaflet/` |
| `assets/ui/referto-ui.css` | Tema del frontend (portale e widget) dentro `.ui`, generato da `ui/costruisci_css.py`: non va modificato a mano |
| `ui/costruisci_css.py` | Copia `frontend/src/index.css` per il video: solo versione per computer, senza animazioni, Avenir → Nunito Sans |
| `assets/fonts/` | Nunito Sans (al posto di Avenir, che non si può distribuire), Public Sans (portale) e IBM Plex Mono (testo del referto), con le licenze OFL |
| `hyperframes.json`, `meta.json`, `package.json` | Configurazione del progetto e versione fissata della CLI |
| `CLAUDE.md`, `AGENTS.md` | Istruzioni di HyperFrames per gli agenti (generate da `init`) |
| `COPIONE.md` | Copione per scene: tempi, testo letto, cosa si vede |
| `TESTO-VOCE.md` | Solo il testo inglese da dare a ElevenLabs, scena per scena (uguale al campo `inglese` di `voce/copione.json`) |
| `voce/copione.json` | Per scena: `testo` della voce di riferimento (con `voce` e `velocita` se diverse da quelle generali) e `inglese`, il testo della traccia finale |
| `voce/genera_voce.py` | Genera con Edge TTS un MP3 per scena e i tempi delle parole |
| `assets/voce/*.mp3`, `assets/voce/audio_meta.json` | Voce italiana di riferimento (Edge TTS), un MP3 per scena; `audio_meta.json` ha per scena durata e parole `{id, text, start, end}`: le animazioni sono scritte su questi tempi |
| `assets/voce/elevenlabs-kristen.mp3`, `elevenlabs-kristen.parole.json` | Traccia unica del video (ElevenLabs, inglese) e sue parole a tempo (`hyperframes transcribe`, modello `small.en`) |
| `voce/genera_musica.py`, `assets/musica/{tensione,fiducia,slancio}.wav` | Generazione dei tre pezzi di musica (circa 30 s ciascuno, MusicGen) |
| `voce/monta_musica.py`, `assets/musica/sottofondo.mp3` | Sottofondo lungo quanto il video: tensione fino a «Introducing Referto», fiducia fino alla scena 8, slancio fino alla fine, con dissolvenze incrociate e silenzi tagliati |
| `assets/voce/elevenlabs-finale.mp3`, `elevenlabs-finale.trascrizione.json` | Traccia definitiva (ElevenLabs, Kristen, 201,9 s) e sua trascrizione (`hyperframes transcribe`, `small.en`) |
| `voce/aggiungi_pause.py`, `assets/voce/elevenlabs-finale-pause.mp3`, `elevenlabs-finale-pause.parole.json` | Aggiunge alla traccia le pause `<break>` che ElevenLabs ha ignorato, allungando il silenzio dopo la parola giusta, e corregge nelle parole a tempo i nomi sbagliati dalla trascrizione: è la traccia che usa il video |
| `voce/traccia_provvisoria.py`, `assets/voce/provvisoria.mp3`, `provvisoria.parole.json` | Voce provvisoria unica (Edge TTS Ava) di tutto il testo inglese, con le pause `<break>`: stessi file che darà la trascrizione della traccia vera |
| `voce/sottotitoli.py`, `compositions/sottotitoli.html` | Sottotitoli inglesi: allinea il testo di `copione.json` (con la punteggiatura) alle parole a tempo della traccia, divide le frasi in righe bilanciate (al massimo 50 caratteri, mai a capo dopo articoli, preposizioni o aggettivi) e scrive una composizione lunga quanto il video; nella demo stanno a sinistra per non coprire il widget, e così alla fine della scena 5 (`MAPPA_S5`) per non coprire il pannello della mappa. Il file generato non va modificato a mano |
| `voce/sincronia.json`, `voce/sincronizza.py` | Ancore tra voce di riferimento e traccia; lo script scrive in ogni scena il blocco SINCRONIA (tabella dei tempi e `riallinea(tl)`) e aggiorna inizio e durata delle scene in `index.html` |

Per rigenerare la voce dopo una modifica al testo (anche di una sola scena,
passandone l'id):

```bash
cd resources/video
uv run --no-project --with edge-tts==7.3.1 python voce/genera_voce.py [03-demo ...]
```

Poi vanno ricalcolati i tempi di attacco in `COPIONE.md`.

## Come sono fatte le scene

- Ogni scena è un file in `compositions/` (radice dentro `<template>`, stili e
  script dentro il template) con la sua timeline GSAP in pausa, registrata in
  `window.__timelines` con lo stesso id del file.
- In `index.html` ogni scena si sovrappone di 1 s alla successiva, così il
  passaggio avviene dentro la scena nuova (la scena 2 apre con un cerchio chiaro
  che copre quella buia). Le voci sono `<audio>` su una traccia a parte.
- I tempi delle animazioni vengono dalle parole di `audio_meta.json` più
  l'attacco della voce nella scena (scena 1: +1,5 s; scena 2: +0,5 s), scritti
  in testa allo script di ogni scena.
- Stile: scena buia (`#0b1512`) per il problema, chiara (`#f5f7f6`) da Referto in
  poi; verde `#176b58` e menta `#e5f3ed` del tema di Referto
  (`frontend/src/index.css`). Il marchio è il quadrato verde con la «R» di
  `frontend/public/favicon.svg`.
- Sovrapposizioni volute (dissolvenze, referto sfocato sullo sfondo) sono
  segnate con `data-layout-allow-overlap`, `data-layout-allow-occlusion` e
  `data-layout-ignore`, perché `check` le accetti.
- Studio, mentre l'anteprima è aperta, aggiunge attributi `data-hf-id` agli
  elementi dei file: sono suoi, vanno lasciati. Chi modifica i file con
  sostituzioni di testo deve tenerne conto, altrimenti il testo non viene
  trovato e la modifica salta senza errori.
- La demo (`scena-03-demo`) usa l'HTML vero del portale e del widget, preso
  dall'app in esecuzione a 1440×900, dentro una finestra del browser disegnata.
  Una «camera» (`#s3-camera`) si muove con GSAP su `x`, `y`, `scale`.
- Quando si costruisce la timeline la scena non è ancora visibile, quindi le
  misure valgono zero. La riga del referto e il pulsante «Spiegamelo» usano
  posizioni fisse, misurate nell'app vera. Lo scorrimento del pannello invece
  si misura quando il tween parte (valori-funzione GSAP con `offsetTop`). Se
  cambia il layout del portale, le posizioni fisse vanno rimisurate.
- Le didascalie della scena 5 non vanno in basso: coprirebbero la riga «Fonte:
  Banca Dati Farmaci AIFA» del lettore o l'elenco delle strutture.
- Nell'app il pannello del widget sta dentro il velo (z-index 40). Nella scena
  gli è accanto, quindi ha `z-index: 41`: altrimenti il pulsante «Capire un
  referto» (z-index 10) gli finisce sopra.

## Sincronia con una traccia unica

- Una scena non conosce la traccia: le sue animazioni restano sui tempi della
  voce di riferimento. `riallinea(tl)`, chiamata prima di registrare la
  timeline, sposta l'inizio di ogni tween e ne cambia la velocità
  (`timeScale`) con un'interpolazione lineare tra le ancore.
- Dopo un cambio di traccia: trascriverla (`hyperframes transcribe … --model
  small.en` per l'inglese, `small --language it` per l'italiano), aggiornare le
  ancore in `voce/sincronia.json` e rilanciare `python3 voce/sincronizza.py`.
  Le parole delle ancore vanno scelte uniche nel tratto: «Referto» (prodotto) e
  «referto» (parola comune) sono uguali per lo script.
- Ogni scena finisce quando il fondo della successiva l'ha coperta
  (`copertura` in `sincronia.json`), così i passaggi restano puliti anche con
  pause brevi.

### Traccia definitiva (dal 17/10/2026)

La voce è la traccia ElevenLabs registrata dal testo di TESTO-VOCE.md
(`assets/voce/elevenlabs-finale.mp3`). Il modello ha ignorato i tag `<break>`,
quindi le pause si aggiungono dopo con `voce/aggiungi_pause.py`, che legge il
copione e la trascrizione e scrive la traccia con le pause e le parole a tempo
spostate. Il punto di taglio non viene dai tempi della trascrizione (che a
volte finiscono prima che la parola smetta di suonare: il 17/10/2026 due tagli
cadevano dentro «alone» e «words» e la voce «andava e veniva»), ma dal volume
misurato ogni 10 ms: si taglia al centro del silenzio vero più lungo (sotto
−45 dB) e la pausa si riempie con il fondo della registrazione, non con
silenzio digitale. Il fondo è il tratto di 0,4 s più silenzioso di tutta la
registrazione, ripetuto con dissolvenze incrociate: ripetere il silenzio attorno
al taglio non va, perché contiene la coda della parola e ripetuto diventa
un'eco di voce (successo dopo «map»). Lo script fa anche partire la parola dopo
ogni pausa dove la voce riparte davvero: la trascrizione la attaccava alla
precedente («Behind» inglobava la pausa dopo la mappa e la scena 6 partiva 2,5 s
prima della voce). Se attorno a una pausa non c'è silenzio, lo script si ferma.
Per una nuova registrazione:

```bash
cd resources/video
npx hyperframes transcribe assets/voce/<traccia>.mp3 -m small.en   # poi rinominare transcript.json
uv run --no-project --with soundfile --with numpy python voce/aggiungi_pause.py assets/voce/<traccia>.mp3 assets/voce/<traccia>.trascrizione.json
```

e in `voce/sincronia.json` si indicano la traccia `-pause.mp3` e le sue parole.
La voce provvisoria (`voce/traccia_provvisoria.py`, Edge TTS Ava) resta per le
prove: produce gli stessi file. Le ancore usano le parole del testo inglese.

Le voci sono nel gruppo audio `voiceover` e la musica (`musica-sottofondo`, nel
gruppo `music`) ha un *carve* contro quel gruppo: la musica perde solo le
frequenze della voce mentre si parla. Dopo la traccia nuova, nell'ordine:

```bash
cd resources/video
python3 voce/sincronizza.py
python3 voce/sottotitoli.py
uv run --no-project --with soundfile --with numpy python voce/monta_musica.py
node ~/.claude/plugins/cache/hyperframes/hyperframes/0.8.164/skills/hyperframes-audio/scripts/carve.mjs --comp index.html --bed musica-sottofondo
```

Il carve va rifatto perché i suoi inviluppi seguono la voce che c'era quando è
stato calcolato.

### Tre trappole di GSAP con l'anteprima e il render

- **`riallinea()` non deve toccare i tween esistenti.** Cambiare `startTime()` o
  `timeScale()` di un tween lo fa disegnare subito: un `fromTo` con
  `immediateRender: false` applicava i suoi valori di partenza fuori tempo (le
  carte della scena 2 comparivano già a 18 s). Dal 17/10/2026 `riallinea()`
  (scritta da `sincronizza.py` in ogni scena) ricrea ogni tween con i tempi della
  traccia, poi porta la timeline alla fine e la riavvolge: così ogni `.to()`
  registra una volta per tutte la partenza giusta e si può saltare ovunque.

- **Un `.to()` a metà catena legge valori sbagliati dopo un salto.** Se
  l'anteprima o un worker di render arriva direttamente a un punto del video,
  un `.to()` che parte da valori lasciati da un tween precedente può leggere lo
  stato iniziale (per esempio opacità 0): l'elemento sparisce e ricompare. Era
  la causa della nota del medico che spariva sotto il gettone «ramipril» (scena
  5) e degli elementi che sparivano prima dello zoom su AMD (scena 6). Per i
  tween a metà catena si usa `fromTo` con i valori di partenza espliciti e
  `immediateRender: false`.
- **La chat del widget scorre come nell'app.** Nella demo il pannello scende
  solo quando il testo arriva in fondo e non torna mai su: le posizioni di
  riquadri e parole si misurano all'avvio e ogni scorrimento è un `fromTo` che
  parte dal punto in cui è finito il precedente (`scendi` e `segui` in
  `scena-03-demo`). Prima ogni scorrimento saltava all'inizio di un riquadro e,
  dopo un salto dell'anteprima, ripartiva da zero: la chat sembrava salire e
  scendere. Anche la camera della demo usa `fromTo` con le partenze esplicite.
  La chat del foglietto (scena 5) fa lo stesso: dopo la domanda i suggerimenti
  si chiudono e il pannello segue la risposta fino al pulsante della sezione.
- **Le misure fatte con la scena nascosta valgono zero.** Con `display: none` gli
  `offsetTop` sono 0: per questo il pannello della demo non scorreva fino alla
  risposta sul ritmo sinusale. Le scene 3 e 5 misurano una volta, all'avvio,
  mostrando per un attimo gli antenati nascosti, e usano numeri fissi.

## Regole per il contenuto

- Solo dati finti: il portale "Poliambulatorio Valle Serena"
  (`frontend/src/portale/dati.ts`) e `resources/referto_radiologico_esempio.pdf`.
  Mai referti reali ([[09-trace-e-privacy]]).
- AMD deve essere ben visibile: il Mother agent usa DeepSeek-V4.1-Flash su AMD
  Token Factory ([[11-modelli-e-ollama]], [[15-backend]]).
- Gli stessi limiti del prodotto: niente diagnosi né consigli. Si mostra che ogni
  dato ha una fonte (referto, AIFA, OpenStreetMap, glossario).
- Le schermate di Referto si ridisegnano in HTML con il tema di
  `frontend/src/index.css` ([[16-frontend]]).

## Stato

16/10/2026: progetto creato e provato (controllo ed esportazione di prova
riusciti). Copione di 2:30 in 8 scene e voce generata (circa 122 s di parlato),
pronuncia controllata con una trascrizione. Tutte le 8 scene costruite e sincronizzate con la traccia ElevenLabs (2:18,6):
`check` passa (restano tre avvisi previsti: lunghezza del file della demo e
movimenti di camera fuori dal riquadro) e i fotogrammi sono stati controllati.
Poi, in serata: nuovo gancio e scena 8 «Il potenziale» (didascalie in inglese),
chiusura spostata a scena 9, testo inglese completo per la traccia nuova; bozza
di 2:42,6 con voce provvisoria. `check` passa (avvisi già noti: lunghezza del
file della demo, camera fuori dal riquadro, un contrasto a 4,48:1 nella scena 5).
Poi gancio e potenziale ampliati per raccontare mercato e potenziale (le tre
strade di oggi e i medici mancanti nel gancio; perché ora, mercato, come
entriamo ed Europa nella scena 8) e musica di sottofondo: bozza di 3:07, `check`
passa. Il 17/10/2026 il team ha chiesto i sottotitoli in inglese: `voce/sottotitoli.py`. Infine la revisione del
racconto: Giovanna dall'inizio alla fine, il desiderio prima di Referto (le tre
strade si girano nelle tre promesse), le trace dopo la tecnologia, la vecchia
scena «Fiducia» divisa tra la promessa e il finale sul medico; bozza di 3:18,
`check` passa. Poi le correzioni della revisione: domande del gancio più a lungo, carte in
stile Apple con giro 3D, arrivo di Referto più importante con lo slogan detto
dalla voce, risposta del ritmo sinusale visibile, gettone «ramipril» corretto,
risposta «A cosa serve?» dal foglietto, mappa più lunga, pallini e zoom della
scena 6 corretti, passaggio 6→7 senza vuoti, voce provvisoria unica; bozza di
3:19, `check` passa. Il 17/10/2026: sottotitoli inglesi, traccia ElevenLabs definitiva con le pause
aggiunte, nuova `riallinea()`; video di 3:36, `check` passa. Poi la fine della
scena 5 rifatta sulla mappa nuova del portale: pannello che entra da destra,
mappa Positron, distanza, indirizzo e orari evidenziati. Poi la scelta della
lingua: il portale resta in italiano (prodotto per pazienti italiani, testi veri
del modello e dell'AIFA), mentre didascalie delle scene 3 e 5 e diagramma della
scena 6 passano all'inglese, con il nome italiano delle sezioni del widget
tradotto, l'etichetta «Spiegamelo = Explain this to me» e il riquadro «Built for
Italian patients, in Italian». Poi il passaggio 6→7, che sembrava un errore: la
voce passava da «Token Factory» ad «And every run» senza pausa, lo zoom su AMD
veniva tagliato a metà e la scena 7 entrava in 0,3 s. Ora c'è una pausa di 1,5 s
nel copione (rilanciata tutta la catena: pause, sincronia, sottotitoli, musica e
carve), lo zoom finisce prima e la scena 7 entra con una dissolvenza di 1 s;
video di 3:34,7, `check` passa. Poi la verifica dei dati della scena 8 sulle
fonti (vedi [[18-valore-di-business]]): il 27% del fascicolo riguarda chi ha
ricevuto un documento nuovo, non tutti gli italiani, e le regioni erano del 2025.
Testi a schermo corretti (27% «of patients with a new document», 64% Veneto e 1%
Basilicata, fonte del monitoraggio di marzo-maggio 2026, DL 179/2012 per i 5
giorni, «A growing sector» e «Italian digital health spending» al posto di «Our
market»). **La voce della scena 8 va rigenerata**: il testo nuovo è già in
`TESTO-VOCE.md` e nel campo `inglese` di `voce/copione.json` («Since March
2026…», «only one in four patients opens it when a new report arrives», «We are
entering a growing sector…»). Finché la traccia non cambia non vanno rilanciati
`aggiungi_pause.py` e `sottotitoli.py`, che allineano quel testo alla voce di
oggi. Con la traccia nuova, in `voce/sincronia.json` (08-potenziale) le ancore
`["Italians", "Italians"]` e `["market", "market"]` diventano
`["Italians", "patients"]` e `["market", "sector"]`. Mancano la verifica a
orecchio della pronuncia di «Referto», la voce nuova della scena 8, i nomi del team e il link nella
chiusura, e l'esportazione finale. Da dove vengono testi e dati delle scene: `COPIONE.md`.
