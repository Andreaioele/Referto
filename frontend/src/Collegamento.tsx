import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { naviga } from './percorsi'

/** Link interno: un vero <a href> (si apre anche in una nuova scheda), ma senza ricaricare la pagina. */
export function Collegamento({ href, onClick, ...resto }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function clic(evento: MouseEvent<HTMLAnchorElement>) {
    onClick?.(evento)
    if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey) return
    evento.preventDefault()
    naviga(href)
  }
  return <a href={href} onClick={clic} {...resto} />
}
