/** Icone a tratto (24×24), sempre decorative: il testo accanto dice cosa fanno. */

const TRACCIATI = {
  casa: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  documento: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  pillola: (
    <>
      <path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z" />
      <path d="M7 7l7 7" />
    </>
  ),
  persona: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  piu: <path d="M12 5v14M5 12h14" />,
  orologio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  stetoscopio: (
    <>
      <path d="M6 3v6a4 4 0 0 0 8 0V3" />
      <path d="M10 13v3a5 5 0 0 0 10 0v-3" />
      <circle cx="20" cy="11" r="2" />
    </>
  ),
  telefono: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  ),
  mappa: (
    <>
      <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  luogo: (
    <>
      <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  fattura: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  messaggio: <path d="M4 5h16v11H8l-4 4z" />,
  chiudi: <path d="M6 6l12 12M18 6L6 18" />,
  edificio: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M16 9h2a2 2 0 0 1 2 2v10" />
      <path d="M3 21h18M10 7v4M8 9h4M9 21v-4h2v4" />
    </>
  ),
  prenota: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M12 14v4M10 16h4" />
    </>
  ),
  invia: <path d="M4 12l16-8-6 16-2-7z" />,
  indietro: <path d="M15 6l-6 6 6 6" />,
  avanti: <path d="M9 6l6 6-6 6" />,
  carica: <path d="M12 20V8M7 13l5-5 5 5M5 4h14" />,
  scarica: <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />,
  stampa: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  scudo: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />,
}

export type NomeIcona = keyof typeof TRACCIATI

export function Icona({ nome, dimensione = 24 }: { nome: NomeIcona; dimensione?: number }) {
  return (
    <svg
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRACCIATI[nome]}
    </svg>
  )
}

/** Croce dello studio medico (marchio del portale finto). */
export function MarchioStudio({ dimensione = 24 }: { dimensione?: number }) {
  return (
    <svg width={dimensione} height={dimensione} viewBox="0 0 24 24" fill="#fff" aria-hidden="true" focusable="false">
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />
    </svg>
  )
}
