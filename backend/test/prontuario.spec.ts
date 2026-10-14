import { ProntuarioService } from '../src/farmaci/prontuario.service';
import casi from './fixtures/parita.json';
import { CasoParita, esitoServizio, PERCORSI } from './parita';

describe('ProntuarioService', () => {
  const servizio = new ProntuarioService(PERCORSI);

  describe('parità con farmaci_referti.lookup() (test/fixtures/parita.json)', () => {
    it.each((casi as CasoParita[]).map((caso) => [caso.nome, caso] as const))('%s', (_nome, caso) => {
      expect(esitoServizio(servizio, caso)).toEqual(caso);
    });
  });

  it('collega un nome commerciale italiano a un solo farmaco, anche con il dosaggio', () => {
    const esito = servizio.cerca('Cardioaspirin 100 mg');
    expect(esito?.corrispondenza).toBe('nome commerciale');
    expect(esito?.farmaco?.nome).toBe('CARDIOASPIRIN');
    expect(esito?.principio_attivo).toBe('acido acetilsalicilico');
  });

  it('non sceglie quando il nome è solo il principio attivo', () => {
    const esito = servizio.cerca('ramipril', '', 3);
    expect(esito?.farmaco).toBeNull();
    expect(esito?.corrispondenza).toBe('da scegliere');
    expect(esito?.alternative).toHaveLength(3);
    expect(esito?.alternative_totali).toBeGreaterThan(3);
  });

  it('scrive una descrizione con i soli dati AIFA', () => {
    expect(servizio.cerca('Triatec')?.descrizione).toBe(
      'Triatec è un medicinale che contiene ramipril. Categoria (classificazione ATC): sostanze ad ' +
        "azione sul sistema renina-angiotensina, inibitori dell'enzima di conversione dell'angiotensina (ACE), non associati.",
    );
    expect(servizio.cerca('warfarin')?.descrizione).toMatch(/^Warfarin è il principio attivo di Coumadin/);
  });

  it('restituisce la categoria ATC dal gruppo anatomico al farmacologico', () => {
    expect(servizio.cerca('Cardioaspirin')?.categoria).toEqual([
      'sangue e organi emopoietici',
      'antitrombotici',
      "antiaggreganti piastrinici, esclusa l'eparina",
    ]);
  });

  it('costruisce i link ufficiali AIFA a foglietto e RCP', () => {
    const farmaco = servizio.farmaco('024840');
    expect(farmaco?.foglietto_url).toBe(
      'https://api.aifa.gov.it/aifa-bdf-eif-be/1.0.0/organizzazione/22/farmaci/24840/stampati?ts=FI',
    );
    expect(servizio.farmaco('000000')).toBeNull();
  });

  it('non trova categorie generiche né nomi inesistenti', () => {
    expect(servizio.cerca('mezzo di contrasto')).toBeNull();
    expect(servizio.cerca('Zentrolax 20 mg')).toBeNull();
  });
});
