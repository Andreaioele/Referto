---
tags: [area/progetto]
aggiornato: 2026-10-18
---

# Slide del prodotto

Torna a [[00-indice]] · Video in [[17-video-presentazione]] · Prodotto in [[15-backend]] e [[16-frontend]].

## A cosa servono

Un deck di 14 slide che **presenta il prodotto**: cosa vede il paziente, le
regole che Referto rispetta e cosa gira sotto. Non è il pitch: niente mercato,
tempi o modello di business (quelli stanno nel video, scena 8, e in
[[18-valore-di-business]]). Il progetto è in `resources/slide/`, separato dal
video, e resta fuori da Vercel.

Lingua: testi delle slide e note per chi presenta in inglese, come il video;
le schermate del prodotto (widget, foglietto, scheda AIFA) restano in italiano
perché sono testi veri del modello e dell'AIFA, con la traduzione accanto dove
serve («Spiegamelo» = Explain this to me).

## Comandi

```bash
cd resources/slide
npm run dev      # hyperframes present: apre il deck in modalità presentazione (porta 3004)
npm run studio   # Studio, per modificare le slide a mano
npm run check    # lint, layout, contrasto
```

Con il plugin di Claude Code al posto di `npx hyperframes` si usa il launcher
`node ~/.claude/plugins/cache/hyperframes/hyperframes/0.8.164/skills/hyperframes/scripts/plugin-cli.mjs`.
Nella pagina di `present`: frecce o spazio per andare avanti, **P** (o
l'icona Present) apre la scheda per il pubblico e lascia a chi parla la vista
con slide successiva, note modificabili e cronometro. Su Google Meet si
condivide la **scheda** del pubblico, non la finestra. Il deck non si esporta in
MP4: `render` prenderebbe solo la prima slide.

## Come è fatto

- `index.html`: composizione principale (1920×1080) con l'**isola JSON**
  `application/hyperframes-slideshow+json`: ordine delle slide, note per chi
  presenta e frammenti. I frammenti sono **tempi assoluti** del deck (inizio
  della slide + tempo locale).
- `compositions/sNN-*.html`: una sotto-composizione per slide, dentro
  `<template>`, con la sua timeline GSAP in pausa e tempi locali.
- `present` legge l'isola **una volta sola, all'avvio**: dopo averla cambiata va
  riavviato. La navigazione salta (seek) ai punti di sosta senza riprodurre le
  animazioni: una slide senza frammenti si ferma a metà della sua durata, quindi
  ogni entrata deve finire prima (qui entro 1,6 s su slide da 6 s).
- Il player di `present` carica il runtime di HyperFrames solo se la pagina ha
  sotto-composizioni (`data-composition-src`) e se `window.__timelines` esiste
  già: per questo `index.html` lo crea e ogni slide è un file a parte. Con le
  slide scritte tutte dentro `index.html` le scene non venivano riconosciute.
- Gli effetti sonori che `present` cerca in `sfx/` non ci sono: le richieste
  danno 404 nella console, senza conseguenze.
- `assets/deck.css`: tema comune (colori e font di `frontend/src/index.css`,
  Nunito Sans al posto di Avenir come nel video). `assets/ui/referto-ui.css` è
  la copia del tema del frontend generata per il video
  (`resources/video/ui/costruisci_css.py`): il widget nelle slide 4, 5 e 7 usa
  le classi vere dentro `.ui`. Font, foglietto e mappa sono copiati da
  `resources/video/assets/`.
- La slide 2 dichiara da sé i `@font-face` di Public Sans e Nunito Sans:
  senza, il lint dà `font_family_without_font_face`.

## Le slide

| # | Slide | Frammenti | Da dove vengono testi e dati |
|---|---|---|---|
| 1 | Titolo | | Marchio di `frontend/public/favicon.svg` |
| 2 | Cos'è: widget accanto al referto | | Portale finto (`frontend/src/portale/dati.ts`) |
| 3 | Tre passi per il paziente | 3 | [[16-frontend]] |
| 4 | Le quattro parti della spiegazione | 4 | Risposta reale del Mother agent del video (scena 3); il widget scorre fino al riquadro acceso |
| 5 | Domande con fonte | | Voce `curato:ritmo-sinusale` del glossario; risposta fissa `PAROLA_FUORI_DAL_REFERTO` (`backend/src/chat/mother-diretto.ts`); 17.298 voci in `backend/data/glossario_medico.json` |
| 6 | Farmaci solo se scritti dal medico | 2 | Scheda AIFA di «ramipril» (`POST /api/farmaci/cerca`); 12.654 farmaci in `backend/data/aifa_farmaci.json` (13/10/2026) |
| 7 | Domande sul foglietto | | Sezione 1 del foglietto ufficiale del Triatec, come nel video |
| 8 | Strutture vicine | | `backend/data/strutture-milano.json`: 7.687 strutture, open data del Comune di Milano e OpenStreetMap; mappa Positron del video |
| 9 | Regole del prodotto | | `FiltroFonti`, valori e note copiati, striscia di sicurezza ([[15-backend]], [[16-frontend]]) |
| 10 | Architettura | 2 | [[15-backend]]: widget → backend NestJS su Vercel → Mother agent (Evolus o motore diretto) → DeepSeek-V4.1-Flash su AMD Token Factory, riserva DeepSeek-V4-Flash; strumenti `cercaFarmaci`, `cercaTermine` (solo motore diretto) e strutture dal backend |
| 11 | Trace e privacy | | [[09-trace-e-privacy]]; i numeri della trace sono d'esempio, come nel video |
| 12 | Accessibilità | | [[05-webapp-e-interfaccia]], [[16-frontend]] (IT / EN, barra in basso sotto i 760 px, consenso in «I miei dati») |
| 13 | Integrazione in altri portali | | `referto/tipi.ts`, `portale/perReferto.ts`, regola `no-restricted-imports` ([[16-frontend]]) |
| 14 | Chiusura: l'ultima parola al medico | | Come la scena 9 del video |

## Regole per il contenuto

Le stesse del video ([[17-video-presentazione]]): solo dati finti del portale
"Poliambulatorio Valle Serena", mai referti reali; niente diagnosi né consigli;
ogni numero mostrato ha una fonte nel repository (tabella sopra). Se cambia un
dato (prontuario, glossario, strutture) va aggiornata la slide.

## Stato

18/10/2026: deck creato e provato con `present` (14 slide, 21 punti di sosta
nell'ordine giusto); `check` passa con due avvisi informativi previsti (nella
slide 4 il testo scorre sotto la testata del widget). Mancano nomi del team e
link nella chiusura.
