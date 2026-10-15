import { useEffect, useState } from 'react'

/**
 * Navigazione tra le pagine del portale senza librerie: History API.
 * Su Vercel ogni percorso che non è un file torna a index.html (vercel.json).
 */

const EVENTO = 'cambio-percorso'

export function naviga(percorso: string): void {
  if (percorso === window.location.pathname) return
  window.history.pushState(null, '', percorso)
  window.dispatchEvent(new Event(EVENTO))
  window.scrollTo(0, 0)
}

export function usePercorso(): string {
  const [percorso, setPercorso] = useState(window.location.pathname)
  useEffect(() => {
    const aggiorna = () => setPercorso(window.location.pathname)
    window.addEventListener('popstate', aggiorna)
    window.addEventListener(EVENTO, aggiorna)
    return () => {
      window.removeEventListener('popstate', aggiorna)
      window.removeEventListener(EVENTO, aggiorna)
    }
  }, [])
  return percorso
}
