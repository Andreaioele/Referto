# Copione del video di presentazione

Durata: **3:35** (214,7 s), con la traccia definitiva di ElevenLabs
(`assets/voce/elevenlabs-finale.mp3`, voce «Kristen», 17/10/2026). Voce finale: una traccia
unica di ElevenLabs in inglese, da registrare dal testo di
[TESTO-VOCE.md](TESTO-VOCE.md) (lo stesso del campo `inglese` di
`voce/copione.json`). Formato 1920×1080. Musica di sottofondo generata con MusicGen in tre pezzi
(tensione nella domanda e nel desiderio, fiducia da «Meet Referto», slancio dal
potenziale),
montata sui tempi delle scene da `voce/monta_musica.py` e scavata sotto la voce
con il carve di HyperFrames.

ElevenLabs ha ignorato i tag `<break>`: le pause le aggiunge
`voce/aggiungi_pause.py` (5,7 s in tutto, tagliando solo nei silenzi veri; dal 17/10/2026 anche 1,5 s dopo «Token Factory», perché la scena 7 non arrivi di colpo), che scrive
`assets/voce/elevenlabs-finale-pause.mp3`, la traccia usata dal video. La voce
provvisoria (`voce/traccia_provvisoria.py`) resta per eventuali prove.

## Il filo del racconto

Giovanna dall'inizio alla fine, e la sua domanda che si chiude sul medico:
**una domanda → cosa servirebbe → la risposta → cosa c'è dietro → perché ora →
l'ultima parola al medico**. Referto arriva solo dopo il desiderio (scena 2); le
promesse di fiducia stanno prima della demo, che poi le mostra; la frase sul
medico chiude il video invece di stare a metà.

Le animazioni sono scritte sui tempi delle voci di riferimento
(`assets/voce/audio_meta.json`: Isabella in italiano per le scene 3-6, Ava in
inglese per le altre) e vengono spostate sulla traccia da
`voce/sincronizza.py` con le ancore di `voce/sincronia.json`. Con la traccia
nuova: trascriverla, controllare le ancore e rilanciare lo script (vedi
`docs/17-video-presentazione.md`). I tempi della tabella sono quelli della
bozza con la voce provvisoria.

Lingua: il portale e il widget restano in italiano (il prodotto è per pazienti italiani e i testi mostrati sono uscite vere del modello e documenti AIFA ufficiali); didascalie, diagramma e sottotitoli sono in inglese e traducono i passaggi chiave.

Dati sullo schermo: quelli finti del portale "Poliambulatorio Valle Serena"
(`frontend/src/portale/dati.ts`): paziente Giovanna Ferri, referto
«Visita cardiologica con elettrocardiogramma» della Dott.ssa Elena Marchi. Le
statistiche delle scene 1 e 8 vengono da `docs/18-valore-di-business.md`.

Sottotitoli inglesi su tutto il video, generati da `voce/sottotitoli.py` dalle
parole a tempo della traccia: una riga per volta in basso al centro, a sinistra
nella demo (scene 3-4). Vanno rigenerati dopo ogni `voce/sincronizza.py`.

## Scene

| # | Tempo | Voce | Cosa si vede |
|---|---|---|---|
| 1 | 0:00–0:31 | **La domanda** | Sfondo scuro. «Giovanna · 72 · Milan», poi la notifica del fascicolo «New medical report available» e «Next talk with her doctor: in 3 weeks». Il referto vero letto due volte (barra di lettura, «2×», termini che si accendono). Si sfoca: «What does it mean?»; su «She is not alone» (con una pausa) compaiono una alla volta le domande di tanti altri, che restano tenui anche sotto il **58%** (fonte HLS19). Poi il dato sale, le domande spariscono e arrivano le tre strade di oggi (Search online, Ask a chatbot, Call the doctor con *Busy*) e **5,700+** family doctors missing |
| 2 | 0:31–0:50 | **Il desiderio** | Le tre carte di vetro scuro si spengono, arriva «What Giovanna needs» e ogni carta si gira in 3D nella sua promessa, una carta bianca in stile Apple con icona a gradiente e numero: «A source for every answer» (01), «Only what her doctor wrote» (02), «Plain words, right away» (03). Le carte si uniscono al centro e svaniscono; compare il referto con accanto il pulsante «Explain this to me», che pulsa e viene premuto. La luce si allarga, la «R» arriva con un anello che si espande, «Referto» lettera per lettera con un riflesso, e la voce dice lo slogan «Your medical report, explained in plain words.»; una pausa prima della demo |
| 3 | 0:50–1:15 | **Demo: la spiegazione** | Il portale vero (copia di `frontend/`) in una finestra del browser, lasciato in italiano; in alto a sinistra «Built for Italian patients, in Italian» (Captions translate the key steps · other languages next). La camera va sulla riga del referto cardiologico, il cursore clicca «Spiegamelo» e sotto il pulsante compare «“Spiegamelo” = Explain this to me»; si apre il widget. Attesa accorciata (lo si dice sullo schermo), poi «In breve» e «In parole semplici» che si scrivono, con le spiegazioni dei termini evidenziate. Poi «Cosa ha scritto il medico» con l'etichetta «Dal referto», infine visita, strutture, «Come è fatta questa spiegazione» e la striscia di sicurezza. A sinistra, didascalie grandi in inglese a tempo con la voce; quando parlano di una sezione del widget, l'occhiello ne riporta il nome italiano con la traduzione («In breve» · In short, «In parole semplici» · In plain words, «Cosa ha scritto il medico» · What the doctor wrote, «Fonte» · Source) |
| 4 | 1:15–1:27 | **Demo: la domanda** | Si scrive «Cos'è il ritmo sinusale?» nel campo del widget; la domanda entra nella conversazione e la risposta arriva con l'etichetta «Fonte: Glossario di Referto» in evidenza La chat scorre come nell'app: scende solo quando il testo arriva in fondo, segue le parole mentre si scrivono e non torna mai su |
| 5 | 1:27–2:00 | **Integrazioni** | La nota del medico con «ramipril 5 mg» evidenziato; il gettone «ramipril» esce dalla parola, vola con un arco e si posa sul titolo della scheda del prontuario AIFA, che si illumina. Poi il lettore vero del foglietto del Triatec: la domanda «A cosa serve?», i suggerimenti si chiudono e la risposta si scrive parola per parola dalla sezione 1 del foglietto ufficiale, con il pannello che la segue scorrendo fino in fondo, il pulsante «Sezione 1 · Cos’è TRIATEC e a cosa serve» e «Citata nella risposta» sopra la pagina. Poi l'elenco «Si occupano di cardiologia» con le distanze; sul pulsante della mappa entra da destra il pannello della mappa come nel portale (nome, «Ambulatorio, a 2,3 km da casa», mappa grigia Positron, indirizzo e orari) e la camera lo segue. La mappa si avvicina alla struttura, il segnaposto cade e pulsa, poi si accendono la distanza e il riquadro con indirizzo e orari; il pannello resta fino al passaggio alla scena 6, che entra con «Behind the scenes» |
| 6 | 2:00–2:19 | **Come funziona** | Diagramma animato, con le scritte in inglese: Portal (Referto widget, React) → Referto backend (NestJS, Vercel) → Agent (Evolus or direct engine) → Model DeepSeek-V4.1-Flash. Sotto: AIFA drug database e Medical glossary per l'agente; Healthcare facilities (open data) dal backend, con un impulso che porta l'area del referto dall'agente al backend. Si accende la cornice **AMD Token Factory** attorno al modello e la camera ci si avvicina. I pallini corrono sulle linee a velocità costante e passano sotto i riquadri; prima dello zoom su AMD il diagramma resta tutto visibile |
| 7 | 2:19–2:34 | **Le trace** | Entra con una dissolvenza di 1 s sopra lo zoom della scena 6, già fermo su AMD durante la pausa dopo «Token Factory»: sfondo scuro, etichetta *Observability*. La trace di una spiegazione (*Example trace*): richiesta, agente DeepSeek-V4.1, strumenti cercaFarmaci e cercaTermine, risposta in streaming, con durata, tempo al primo testo, token, strumenti ed esito; il riquadro «Report text: never stored in traces». Poi la trace si sposta e arriva il ciclo Trace → Measure → Improve attorno a «version next» |
| 8 | 2:34–3:14 | **Il potenziale** | Sfondo chiaro, «Why now» su «The timing is right», poi quattro tempi con un'etichetta verde. *Why now*: tre schede, **5 days** (DL 179/2012, per tutte le strutture dal marzo 2026), **€1.38bn** (PNRR), **27%** (chi riceve un documento nuovo e apre il fascicolo entro 3 mesi, dal 64% del Veneto all'1% della Basilicata: monitoraggio ufficiale, marzo-maggio 2026). *A growing sector*: «Italian digital health spending», **€2.7bn a year**, «+9% in 2025» (Politecnico di Milano). *How we enter*: Doctors' practices (1 · Today, abbonamento mensile, «like Giovanna's clinic») → Labs and diagnostic centres (2 · Next, compenso per referto spiegato) → Regional health records (3 · Then, licenza per regione). *Beyond Italy*: le stelle dell'UE e **450M** Europeans (EHDS, Regolamento UE 2025/327). |
| 9 | 3:14–3:33 | **L'ultima parola** | Sfondo chiaro: «A report understood is one less question for the doctor.», poi l'icona del medico e «The last word always belongs to your doctor.» con «In an emergency, call 112.». Il verde si allarga: marchio, «Your medical report, finally made clear.», «AMD Developer ACT III · Track Health», crediti in inglese, dissolvenza in nero. Mancano ancora nomi del team e link |

## Testo letto

Testo inglese della traccia finale, scena per scena (1-2 e 3-4 sono una sola
composizione), con le pause `<break time="…" />` da lasciare nel testo dato a
ElevenLabs. Il testo della voce di riferimento è il campo `testo` di
`voce/copione.json`.

**1. La domanda**
> This is Giovanna. Her cardiology report has just landed in her electronic health record, weeks before she can talk to her doctor. She reads it once. Then again. And one question remains: what does it mean? She is not alone. <break time="1.2s" /> More than half of Italians struggle to make sense of health information. So they search online, ask a chatbot, or call a family doctor who is already overloaded.

**2. Il desiderio**
> But none of them reads the report with her. What Giovanna needs is simple: a source for every answer, only what her doctor wrote, and plain words, right away. Something that sits right next to her report. <break time="0.5s" /> Meet Referto. <break time="0.4s" /> Your medical report, explained in plain words. <break time="1.2s" />

**3. Demo: la spiegazione**
> Giovanna opens her clinic's portal, and her report is already there. One click on Explain this to me, and Referto gets to work: first a summary, then a plain explanation, written in real time. The doctor's instructions stay in a separate box, linked to the original document. And if the report leaves questions open, Referto says so.

**4. Demo: la domanda**
> Still have a question? Giovanna can ask in her own words. For instance, what is a sinus rhythm? The answer is provided via a medical glossary, complete with its source. <break time="1.0s" />

**5. Integrazioni**
> Does the report mention a medication, such as ramipril? Referto locates it in the official AIFA, Italian Medicines Agency database, and opens the patient information leaflet, where Giovanna can ask her own questions, like what it is for. The answer comes straight from the leaflet, with the section where to find it. <break time="1.0s" /> Does the doctor recommend a follow-up cardiology appointment? Referto displays the nearest cardiology clinics, with the distance from her home, and shows each one on a map. <break time="2.5s" />

**6. Come funziona**
> Behind the scenes, an AI agent reads the report and checks the AIFA database and a medical glossary. Healthcare facilities come from open data, based on the medical specialty in the report. The language model runs on AMD infrastructure, with AMD Token Factory. <break time="1.5s" />

**7. Le trace**
> And every run leaves a trace: timings, tokens, the tools the agent called, and the outcome. Never the text of the report. We use these traces to measure every version of Referto, and to make the next one better.

**8. Il potenziale**
> The timing is right. Since March 2026, every report in Italy must reach the electronic health record within five days. The country invested 1.38 billion euros in it, yet only one in four patients opens it when a new report arrives. We are entering a growing sector: Italian digital health, worth 2.7 billion euros a year. Referto plugs into the portals that deliver reports: doctors' practices first, like Giovanna's, then labs, then every region's health record. And with the European Health Data Space, the same need reaches 450 million Europeans.

**9. L'ultima parola**
> A report understood is one less question for the doctor. And the last word always belongs to your doctor. Referto. Your medical report, finally made clear.

## Da dove vengono i testi della demo (scene 3 e 4)

- La spiegazione è la **risposta reale** del Mother agent su Evolus a questo
  referto (conversazione del 15/10/2026), riportata parola per parola.
- La risposta del widget non mostra il riquadro dei farmaci: quel giorno l'agente
  ha risposto «Per ramipril 5 mg non ho trovato informazioni nel prontuario
  AIFA» (vedi `docs/14-problemi-noti-e-prossimi-passi.md`). Il prontuario
  compare nella scena 5, dal lettore del foglietto del portale.
- Per questo referto il widget non mostra «Limiti del referto»: la risposta dice
  «Non sono riportati limiti specifici» e il widget lo nasconde. Sulla frase «se
  il referto lascia qualcosa in sospeso» si vedono quindi la spiegazione di come
  è fatta la risposta e la striscia di sicurezza, che l'app mostra davvero.
- La risposta alla domanda è composta dalla voce reale del glossario
  (`backend/data/glossario_medico.json`, `curato:ritmo-sinusale`) secondo le
  regole del prompt (definizione in una frase, dato del referto, riga «Fonte:»).
  Non è un'uscita registrata del modello: il motore diretto non è configurato in
  locale.

## Da dove vengono i dati delle scene 5 e 6

- Scheda del prontuario: risposta reale del backend a `POST /api/farmaci/cerca`
  con «ramipril» (fonte AIFA, CC BY 4.0, aggiornata al 13/10/2026). Con
  «ramipril 5 mg» invece il backend risponde «non trovato»: è il motivo per cui
  il Mother agent su Evolus non ha trovato il farmaco nella risposta del 15/10
  (vedi `docs/14-problemi-noti-e-prossimi-passi.md`). Finché non si corregge,
  nell'app la scena 5 vale per il nome del principio attivo da solo.
- Foglietto: pagina 1 del PDF ufficiale del Triatec (AIC 027161) servito dal
  backend (`/api/foglietti/027161/pdf`), resa in `assets/ui/foglietto-triatec-p1.png`.
  La risposta alla domanda «A cosa serve?» è composta dalla sezione 1 del
  foglietto ufficiale (non è un'uscita registrata del Mother agent), nel formato
  del lettore: testo, pulsante della sezione e «Citata nella risposta».
- Strutture: l'elenco che il portale mostra con «Cerca strutture» sul referto
  cardiologico (`backend/data/strutture-milano.json`). Mappa: il pannello di
  `FinestraMappa` (testata, mappa, indirizzo e orari; il telefono non c'è perché
  la struttura non lo ha). La mappa è quella del portale, MapLibre con lo stile
  Positron di OpenFreeMap a zoom 16 sulle coordinate della struttura, resa una
  volta sola il 17/10/2026 in `assets/mappa/positron-bazzini.png`
  (© OpenStreetMap contributors, © OpenMapTiles).
- Diagramma: segue `docs/15-backend.md`. La frase della scena 6 è stata
  riscritta il 16/10/2026 per essere esatta: le strutture non le chiede
  l'agente (le dà il backend dall'area del referto) e il glossario
  (`cercaTermine`) per ora c'è solo nel motore diretto, per questo l'agente è
  «Evolus o motore diretto».

## Note per la voce

- Le pause `<break time="1.2s" />` servono a dare tempo alle immagini (le
  domande del gancio, il marchio, la risposta del foglietto, la mappa):
  ElevenLabs le legge come silenzi, vanno lasciate nel testo.
- La risposta sul foglietto (scena 5) è scritta dalla sezione 1 del foglietto
  ufficiale AIFA del Triatec (documento del 19/06/2021, pagine 1-2), nel formato
  del lettore del portale: risposta e pulsante della sezione.

- La trascrizione automatica sente «Reverto», «Ramapril» e «Giovanni's» nella
  traccia definitiva, ma sbaglia «Referto» anche sulla voce provvisoria
  («Ruferto»): la pronuncia va verificata a orecchio. Le parole a tempo vengono
  corrette da `voce/aggiungi_pause.py` (CORREZIONI), così ancore e sottotitoli
  restano giusti.
- La frase della scena 6 sulle strutture ora dice «based on the medical
  specialty in the report»: le strutture dipendono dall'area medica del
  referto, non da un luogo scritto nel referto.

- «AMD» nel file è scritto «A M D» perché la voce lo legga lettera per lettera.
- Il nome «Referto» si confonde con la parola comune: nelle scene 3 e 5 il logo
  o il nome devono comparire sullo schermo mentre la voce lo dice.
- Controllo della pronuncia fatto il 16/10/2026 trascrivendo le scene 1, 3, 5 e 6
  (`hyperframes transcribe`, modello `small`, italiano): AMD, Evolus, Token
  Factory, AIFA e ramipril si capiscono.
- La voce legge male «backend» e confonde «l'agente» con «la gente»: nella
  scena 6 si dice «un agente» e «dati aperti». Le parole in inglese vanno
  evitate o provate con una trascrizione prima di tenerle.
