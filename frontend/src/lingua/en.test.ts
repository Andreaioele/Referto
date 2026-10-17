import { afterEach, describe, expect, it } from 'vitest'
import { documenti, esamiPrescritti, farmaci, messaggioStudio, paziente, visite } from '../portale/dati'
import { PAGINE } from '../portale/pagine'
import { INGLESE } from './en'
import { cambiaLingua, lingua, quanti, t } from './lingua'

// Il codice sorgente come testo, per trovare ogni t('…') scritto a mano.
const sorgenti = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.*', '!./en.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function testiNelCodice(): Set<string> {
  const testi = new Set<string>()
  for (const codice of Object.values(sorgenti)) {
    for (const m of codice.matchAll(/\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) testi.add(m[1] ?? m[2])
    for (const m of codice.matchAll(/\bquanti\([^,]+,\s*'([^']*)',\s*'([^']*)'/g)) testi.add(m[1]).add(m[2])
  }
  return testi
}

/** I testi dei dati del portale che le pagine mostrano con t(...). */
function testiDeiDati(): string[] {
  return [
    ...PAGINE.flatMap((p) => [p.nome, p.breve]),
    ...visite.flatMap((v) => [v.titolo, v.medico, v.specialita, v.luogo, v.daPortare, v.preparazione]),
    ...documenti.flatMap((d) => [d.titolo, d.tipo === 'fattura' ? undefined : d.autore]),
    ...farmaci.flatMap((f) => [f.medico, f.dose, f.validita]),
    ...esamiPrescritti.flatMap((e) => [e.nome, e.medico, e.nota]),
    messaggioStudio,
    paziente.medico.nome,
    paziente.medico.orari,
    paziente.allergie,
    paziente.gruppoSanguigno,
  ].filter((testo): testo is string => Boolean(testo))
}

afterEach(() => cambiaLingua('it'))

describe('traduzioni in inglese', () => {
  it('ogni t("…") del codice ha la sua traduzione', () => {
    const mancanti = [...testiNelCodice()].filter((testo) => !(testo in INGLESE))
    expect(mancanti).toEqual([])
  })

  it('i testi dei dati del portale sono tradotti', () => {
    const mancanti = testiDeiDati().filter((testo) => !(testo in INGLESE))
    expect(mancanti).toEqual([])
  })

  it('ogni traduzione tiene gli stessi segnaposto {…}', () => {
    const segnaposto = (testo: string) => [...testo.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    const diversi = Object.entries(INGLESE).filter(([it, en]) => segnaposto(it).join() !== segnaposto(en).join())
    expect(diversi).toEqual([])
  })
})

describe('t', () => {
  it("in italiano restituisce il testo com'è, in inglese la traduzione", () => {
    expect(lingua()).toBe('it')
    expect(t('Le mie visite')).toBe('Le mie visite')
    cambiaLingua('en')
    expect(t('Le mie visite')).toBe('My appointments')
    expect(document.documentElement.lang).toBe('en')
  })

  it('sostituisce i segnaposto e sceglie singolare o plurale', () => {
    cambiaLingua('en')
    expect(t('Prossime ({n})', { n: 3 })).toBe('Upcoming (3)')
    expect(quanti(1, 'Tra {n} giorno', 'Tra {n} giorni')).toBe('In 1 day')
    expect(quanti(8, 'Tra {n} giorno', 'Tra {n} giorni')).toBe('In 8 days')
  })

  it('un testo senza traduzione resta in italiano', () => {
    cambiaLingua('en')
    expect(t('Dott.ssa Nessuno')).toBe('Dott.ssa Nessuno')
  })

  it('ricorda la scelta', () => {
    cambiaLingua('en')
    expect(window.localStorage.getItem('referto-lingua')).toBe('en')
  })
})
