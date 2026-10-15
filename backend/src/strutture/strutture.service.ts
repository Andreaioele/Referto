import { Inject, Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { AREE, type Area, type TipoStruttura } from './aree';
import type { FileStrutture, Struttura } from './strutture.types';

export const FILE_STRUTTURE = Symbol('FILE_STRUTTURE');

/** Una struttura con la distanza dal punto di partenza (casa della persona). */
export interface StrutturaVicina extends Struttura {
  distanzaKm: number;
}

/**
 * Gruppi della ricerca per area, nell'ordine in cui si mostrano.
 * Strutture (luoghi):
 * - "specialisti": ambulatori, laboratori, consultori... che dichiarano l'area;
 * - "ospedali": ospedali e case di cura con il reparto (o, per radiologia e
 *   laboratorio, tutti: il servizio c'è anche senza reparto di degenza).
 * Professionisti (persone e loro studi):
 * - "specialisti": studi medici che dichiarano l'area;
 * - "medici": il medico di famiglia o il pediatra (aree medicina generale e pediatria).
 */
export type IdGruppo = 'specialisti' | 'medici' | 'ospedali';

export interface Gruppo {
  id: IdGruppo;
  /** Quante strutture ci sono in tutto in questo gruppo (se ne mostrano al massimo `limite`). */
  totale: number;
  strutture: StrutturaVicina[];
}

export interface RisultatoPerArea {
  area: Pick<Area, 'id' | 'etichetta' | 'reparto'>;
  gruppi: Gruppo[];
}

const OSPEDALI: TipoStruttura[] = ['ospedale', 'casa-di-cura'];
const MEDICI: TipoStruttura[] = ['medico-di-famiglia', 'pediatra'];
/** Persone e loro studi: vanno in "I miei professionisti". */
const PROFESSIONISTI: TipoStruttura[] = [...MEDICI, 'studio-medico'];

/**
 * Strutture sanitarie di Milano dal file costruito da scripts/costruisci-strutture.ts.
 * Ricerca deterministica, tutta in memoria: niente servizi esterni, niente modello.
 */
@Injectable()
export class StruttureService {
  private readonly file: FileStrutture;

  constructor(@Inject(FILE_STRUTTURE) percorso: string) {
    this.file = JSON.parse(readFileSync(percorso, 'utf-8')) as FileStrutture;
  }

  info(): { citta: string; generato: string; totale: number; fonti: FileStrutture['fonti'] } {
    return { citta: this.file.citta, generato: this.file.generato, totale: this.file.strutture.length, fonti: this.file.fonti };
  }

  /** Strutture (luoghi) o professionisti adatti all'area del referto, per gruppo, dal più vicino. */
  perArea(area: Area, lat: number, lon: number, limite: number, categoria: 'strutture' | 'professionisti' = 'strutture'): RisultatoPerArea {
    const vicine = this.vicine(lat, lon);
    const gruppi: Gruppo[] = [];
    const aggiungi = (id: IdGruppo, elenco: StrutturaVicina[]) => {
      if (elenco.length > 0) gruppi.push({ id, totale: elenco.length, strutture: elenco.slice(0, limite) });
    };
    if (categoria === 'professionisti') {
      aggiungi('specialisti', vicine.filter((s) => s.tipo === 'studio-medico' && s.aree.includes(area.id)));
      aggiungi('medici', vicine.filter((s) => MEDICI.includes(s.tipo) && (area.tipi ?? []).includes(s.tipo)));
    } else {
      aggiungi(
        'specialisti',
        vicine.filter((s) => !OSPEDALI.includes(s.tipo) && !PROFESSIONISTI.includes(s.tipo) && s.aree.includes(area.id)),
      );
      aggiungi(
        'ospedali',
        vicine.filter((s) => OSPEDALI.includes(s.tipo) && (area.inTuttiGliOspedali || s.aree.includes(area.id))),
      );
    }
    return { area: { id: area.id, etichetta: area.etichetta, reparto: area.reparto }, gruppi };
  }

  /** Le strutture di un tipo (es. farmacie, medici di famiglia), dalla più vicina. */
  perTipo(tipo: TipoStruttura, lat: number, lon: number, limite: number): Gruppo {
    const elenco = this.vicine(lat, lon).filter((s) => s.tipo === tipo);
    return {
      id: MEDICI.includes(tipo) ? 'medici' : OSPEDALI.includes(tipo) ? 'ospedali' : 'specialisti',
      totale: elenco.length,
      strutture: elenco.slice(0, limite),
    };
  }

  aree(): Array<Pick<Area, 'id' | 'etichetta' | 'reparto'>> {
    return AREE.map(({ id, etichetta, reparto }) => ({ id, etichetta, reparto }));
  }

  private vicine(lat: number, lon: number): StrutturaVicina[] {
    return this.file.strutture
      .map((s) => ({ ...s, distanzaKm: Math.round(distanzaKm(lat, lon, s.lat, s.lon) * 10) / 10 }))
      .sort((a, b) => a.distanzaKm - b.distanzaKm || a.nome.localeCompare(b.nome, 'it'));
  }
}

/** Distanza in linea d'aria (formula dell'emisenoverso). */
export function distanzaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
