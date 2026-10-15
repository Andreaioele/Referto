import type { FarmacoDaLeggere, PuntoDiPartenza, RefertoDaSpiegare } from '../referto/tipi'
import { classificazioniGiaFatte, paziente, visita as trovaVisita, type Documento, type Farmaco } from './dati'
import { dataLunga, giornoEData } from './date'

/**
 * Adattatore del portale dimostrativo verso Referto: trasforma i suoi dati nei
 * tipi che Referto riceve (`referto/tipi.ts`). Un altro portale scriverebbe il
 * suo adattatore; Referto non cambia.
 */

/** Il referto da spiegare, o undefined se il documento non è un referto. */
export function refertoDaSpiegare(documento: Documento): RefertoDaSpiegare | undefined {
  const referto = documento.referto
  if (!referto) return undefined
  const visita = referto.visitaCollegata ? trovaVisita(referto.visitaCollegata) : undefined
  return {
    id: documento.id,
    titolo: documento.titolo,
    data: dataLunga(documento.giorni),
    testo: referto.testo,
    valori: referto.valori,
    noteMedico: referto.noteMedico,
    visitaCollegata:
      visita && visita.giorni >= 0 ? { titolo: visita.titolo, quando: giornoEData(visita.giorni), href: '/visite' } : undefined,
    classificazione: classificazioniGiaFatte[documento.id],
    doveAndare: `/documenti?referto=${encodeURIComponent(documento.id)}&cerca=strutture`,
    aChiChiedere: `/documenti?referto=${encodeURIComponent(documento.id)}&cerca=professionisti`,
  }
}

/** La casa della paziente, da cui Referto misura le distanze delle strutture. */
export function casaDelPaziente(): PuntoDiPartenza {
  return paziente.casa
}

/** Il farmaco di cui leggere il foglio, o undefined se non è nel prontuario AIFA. */
export function farmacoDaLeggere(farmaco: Farmaco): FarmacoDaLeggere | undefined {
  if (!farmaco.aifa) return undefined
  return {
    codiceAifa: farmaco.aifa.cod,
    confezione: farmaco.aifa.confezione,
    nome: farmaco.aifa.nome,
    descrizione: farmaco.nome,
    doseScritta: farmaco.dose,
  }
}
