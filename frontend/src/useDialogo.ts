import { useEffect, useRef } from 'react'

/**
 * Comportamento comune delle finestre sopra la pagina (widget, lettore,
 * documento): il fuoco va dentro all'apertura e torna dov'era alla chiusura,
 * Esc chiude, la pagina sotto non scorre.
 */
export function useDialogo<T extends HTMLElement>(onChiudi: () => void) {
  const contenitore = useRef<T>(null)
  const chiudi = useRef(onChiudi)

  useEffect(() => {
    chiudi.current = onChiudi
  }, [onChiudi])

  useEffect(() => {
    const precedente = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    contenitore.current?.querySelector<HTMLElement>('[data-fuoco-iniziale]')?.focus()
    const tasto = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') chiudi.current()
    }
    document.addEventListener('keydown', tasto)
    return () => {
      document.removeEventListener('keydown', tasto)
      document.body.style.overflow = overflow
      precedente?.focus?.()
    }
  }, [])

  return contenitore
}
