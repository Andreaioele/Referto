import { FiltroFonti } from '../src/chat/filtro-fonti';
import { domandaSuParola, paroleChieste, parolaNellaConversazione } from '../src/chat/domanda-su-parola';

/** Manda il testo a pezzi piccoli, come lo streaming del modello. */
function filtra(filtro: FiltroFonti, testo: string, pezzo = 3): string {
  let uscita = '';
  for (let i = 0; i < testo.length; i += pezzo) uscita += filtro.aggiungi(testo.slice(i, i + pezzo));
  return uscita + filtro.fine();
}

describe('FiltroFonti', () => {
  it('toglie una riga "Fonte:" se nessuno strumento ha dato quella fonte', () => {
    const testo = 'Il lobo inferiore è la parte bassa del polmone.\n\nFonte: Glossario di Referto.\n\nQuesta è una spiegazione automatica.';
    expect(filtra(new FiltroFonti(), testo)).toBe('Il lobo inferiore è la parte bassa del polmone.\n\n\nQuesta è una spiegazione automatica.');
  });

  it('lascia le fonti restituite da cercaTermine, anche senza la licenza tra parentesi o con il solo link', () => {
    const filtro = new FiltroFonti();
    filtro.ammettiDa('cercaTermine', JSON.stringify({
      risultati: [{ trovato: true, fonte: 'Wikipedia in italiano (CC BY-SA 4.0)', url: 'https://it.wikipedia.org/wiki/Rene' }],
    }));
    expect(filtra(filtro, 'Il rene è un organo.\nFonte: Wikipedia in italiano, https://it.wikipedia.org/wiki/Rene')).toBe(
      'Il rene è un organo.\nFonte: Wikipedia in italiano, https://it.wikipedia.org/wiki/Rene',
    );
    expect(filtra(filtro, 'Fonte: https://it.wikipedia.org/wiki/Rene\n')).toBe('Fonte: https://it.wikipedia.org/wiki/Rene\n');
    expect(filtra(filtro, 'Fonte: Glossario di Referto\n')).toBe('');
  });

  it('con cercaFarmaci lascia la fonte AIFA', () => {
    const filtro = new FiltroFonti();
    filtro.ammettiDa('cercaFarmaci', JSON.stringify({ risultati: [{ trovato: true }] }));
    expect(filtra(filtro, 'Fonte: prontuario AIFA, aggiornato al 13 ottobre 2026.\n')).toBe(
      'Fonte: prontuario AIFA, aggiornato al 13 ottobre 2026.\n',
    );
  });

  it('non trattiene le righe che iniziano come "Fonte" ma sono altro', () => {
    const filtro = new FiltroFonti();
    expect(filtro.aggiungi('Fonta')).toBe('Fonta');
    expect(filtro.aggiungi('na di Trevi\nFon')).toBe('na di Trevi\n');
    expect(filtro.aggiungi('damentale.')).toBe('Fondamentale.');
  });
});

describe('domandaSuParola', () => {
  it.each([
    "Cos'è la colecisti?",
    'E il lobo inferiore cos è?',
    'Cos’è il colesterolo LDL?',
    'Cosa vuol dire ilo polmonare?',
    'Che cosa significa ipoecogeno?',
    'che vuol dire v.r.?',
  ])('riconosce «%s»', (domanda) => expect(domandaSuParola(domanda)).toBe(true));

  it.each(['Devo preoccuparmi?', 'Me lo spieghi più semplice?', 'Quali sono le cose da fare?', 'Grazie!'])(
    'non riconosce «%s»',
    (domanda) => expect(domandaSuParola(domanda)).toBe(false),
  );
});

describe('parola chiesta e conversazione', () => {
  const referto = 'Piccola area di consolidazione al lobo inferiore destro. Ili polmonari nella norma.';

  it('prende dalla domanda solo le parole del termine', () => {
    expect(paroleChieste("E il lobo inferiore cos'è?")).toEqual(['lobo', 'inferiore']);
    expect(paroleChieste('Cosa vuol dire ilo polmonare?')).toEqual(['ilo', 'polmonare']);
    expect(paroleChieste('Cosa vuol dire?')).toEqual([]);
  });

  it('una parola del referto (anche al singolare) è in tema, una che non c\'è no', () => {
    expect(parolaNellaConversazione('Cosa vuol dire ilo polmonare?', [referto])).toBe(true);
    expect(parolaNellaConversazione('Cosa sono le consolidazioni?', [referto])).toBe(true);
    expect(parolaNellaConversazione("Cos'è la colecisti?", [referto])).toBe(false);
    expect(parolaNellaConversazione('Cosa vuol dire?', [referto])).toBe(true);
  });
});
