/**
 * Il marchio di Referto: un foglio con l'angolo piegato e la R. È il segno che
 * fa riconoscere Referto dentro un portale qualsiasi, anche a chi non distingue
 * bene i colori: compare su ogni pulsante che apre Referto e nelle sue finestre.
 *
 * - "chiaro": foglio bianco con R verde, da usare su fondo verde;
 * - "scuro": foglio verde con R bianca, da usare su fondo chiaro.
 */
export function MarchioFoglio({ dimensione = 28, variante = 'chiaro' }: { dimensione?: number; variante?: 'chiaro' | 'scuro' }) {
  const foglio = variante === 'chiaro' ? '#ffffff' : 'var(--green)'
  const segno = variante === 'chiaro' ? 'var(--green)' : '#ffffff'
  const piega = variante === 'chiaro' ? '#cfe3da' : 'var(--green-dark)'
  return (
    <svg
      className="marchio-foglio"
      width={dimensione * 0.82}
      height={dimensione}
      viewBox="0 0 23 28"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 0h12l8 8v17a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3z" fill={foglio} />
      <path d="M15 0v5a3 3 0 0 0 3 3h5z" fill={piega} />
      <text
        x="10.5"
        y="21.5"
        textAnchor="middle"
        fill={segno}
        fontFamily="var(--font)"
        fontWeight="800"
        fontSize="15"
      >
        R
      </text>
    </svg>
  )
}
