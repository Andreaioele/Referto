---
tags: [area/progetto]
aggiornato: 2026-10-18
---

# Cover della submission

Torna a [[00-indice]] · Stesso stile di [[19-slide-prodotto]] e [[17-video-presentazione]].

## A cosa serve

L'immagine di copertina da allegare alla submission dell'hackathon: presenta il
prodotto, non il pitch. È in `resources/cover/`, fuori da Vercel:

| File | Cosa |
|---|---|
| `referto-cover.png` | 1920×1080 (16:9), da caricare |
| `referto-cover@2x.png` | 3840×2160, se la piattaforma accetta immagini grandi |
| `index.html` | La cover in HTML (composizione HyperFrames di un'immagine ferma) |
| `assets/` | Nunito Sans e Public Sans (OFL) e `ui/referto-ui.css`, copiati da `resources/slide/assets/` |

## Cosa mostra

- A sinistra: marchio e nome come nel titolo delle slide, lo slogan «Your
  medical report, explained in plain words.», una frase sul prodotto (widget
  nei portali, una fonte per ogni risposta, niente diagnosi né consigli) e
  quattro etichette: AIFA drug database, Medical glossary, Nearby care, Runs
  on AMD Token Factory. In basso «AMD Developer ACT III · Track Health».
- A destra il prodotto: il widget vero (classi di `referto-ui.css`) con «In
  breve» e «In parole semplici» del referto cardiologico del portale
  dimostrativo, davanti la riga del referto con «Spiegamelo» e la scheda AIFA
  di ramipril. Testi accorciati dalla risposta reale usata nel video e nelle
  slide; solo dati finti, mai referti reali.
- Sfondo: il verde del titolo delle slide (#176b58 → #0f5143) con un alone
  chiaro dietro il prodotto.

## Rigenerarla

```bash
cd resources/cover
npm run cover      # referto-cover.png
npm run cover:2x   # referto-cover@2x.png
npm run check
```

`export/` (istantanee intermedie) e `.hyperframes/` sono esclusi da Git. Il
contenitore del prodotto ha la classe `.ui`, che nel tema del frontend dà il
fondo grigio del portale: nella cover è reso trasparente (`#prodotto.ui`).

## Stato

18/10/2026: cover creata, `check` passa senza avvisi (130/130 controlli di
contrasto).
