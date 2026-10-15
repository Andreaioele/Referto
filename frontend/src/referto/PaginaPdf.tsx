import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'

/**
 * Una pagina del PDF disegnata su canvas. Al 100% occupa la larghezza
 * disponibile (fino a 820 px); lo zoom la ingrandisce e la vista scorre.
 */
export function PaginaPdf({ pdf, numero, zoom, etichetta }: { pdf: PDFDocumentProxy; numero: number; zoom: number; etichetta: string }) {
  const contenitore = useRef<HTMLDivElement>(null)
  const tela = useRef<HTMLCanvasElement>(null)
  const [larghezza, setLarghezza] = useState(0)

  useEffect(() => {
    const elemento = contenitore.current
    if (!elemento) return
    const osservatore = new ResizeObserver(([voce]) => setLarghezza(Math.floor(voce.contentRect.width)))
    osservatore.observe(elemento)
    return () => osservatore.disconnect()
  }, [])

  useEffect(() => {
    if (!larghezza || !tela.current) return
    let annullato = false
    let disegno: RenderTask | null = null
    void pdf.getPage(numero).then((pagina) => {
      if (annullato || !tela.current) return
      const base = pagina.getViewport({ scale: 1 })
      const scala = (Math.min(larghezza, 820) / base.width) * (zoom / 100)
      const vista = pagina.getViewport({ scale: scala })
      const densita = window.devicePixelRatio || 1
      const canvas = tela.current
      canvas.width = Math.floor(vista.width * densita)
      canvas.height = Math.floor(vista.height * densita)
      canvas.style.width = `${Math.floor(vista.width)}px`
      canvas.style.height = `${Math.floor(vista.height)}px`
      disegno = pagina.render({ canvas, viewport: vista, transform: densita !== 1 ? [densita, 0, 0, densita, 0, 0] : undefined })
      disegno.promise.catch(() => undefined)
    })
    return () => {
      annullato = true
      disegno?.cancel()
    }
  }, [pdf, numero, zoom, larghezza])

  return (
    <div className="pagina-pdf" ref={contenitore}>
      <canvas ref={tela} role="img" aria-label={etichetta} />
    </div>
  )
}
