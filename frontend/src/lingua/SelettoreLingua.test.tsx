import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Struttura } from '../portale/Struttura'
import { cambiaLingua, useLingua } from './lingua'

/** Come App: alla lingua nuova il portale si ridisegna da capo. */
function Portale() {
  const lingua = useLingua()
  return (
    <Struttura key={lingua} percorso="/">
      <p>pagina</p>
    </Struttura>
  )
}

afterEach(() => {
  cleanup()
  act(() => cambiaLingua('it'))
})

describe('SelettoreLingua', () => {
  it("con EN il menu passa all'inglese, con IT torna all'italiano", () => {
    render(<Portale />)
    expect(screen.getByRole('button', { name: 'Italiano' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('link', { name: /Le mie visite/ }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('link', { name: /My appointments/ }).length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Le mie visite')).toHaveLength(0)
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Italiano' }))
    expect(screen.getAllByRole('link', { name: /Le mie visite/ }).length).toBeGreaterThan(0)
  })
})
