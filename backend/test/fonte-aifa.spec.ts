import { FogliettoNonDisponibile } from '../src/foglietti/fonte-foglietti';
import { FonteAifa } from '../src/foglietti/fonte-aifa';
import type { Prodotto } from '../src/farmaci/prontuario.types';

/** PDF minimo valido con una pagina per ogni testo (xref con gli offset giusti). */
function pdfDiProva(pagine: string[]): Uint8Array {
  const oggetti: string[] = [];
  const idPagine = pagine.map((_, i) => 3 + i * 2);
  oggetti.push('<< /Type /Catalog /Pages 2 0 R >>');
  oggetti.push(`<< /Type /Pages /Kids [${idPagine.map((id) => `${id} 0 R`).join(' ')}] /Count ${pagine.length} >>`);
  const font = 3 + pagine.length * 2;
  pagine.forEach((testo, i) => {
    const contenuto = `BT /F1 12 Tf 72 720 Td (${testo}) Tj ET`;
    oggetti.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${idPagine[i] + 1} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`);
    oggetti.push(`<< /Length ${contenuto.length} >>\nstream\n${contenuto}\nendstream`);
  });
  oggetti.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let corpo = '%PDF-1.4\n';
  const offset: number[] = [];
  oggetti.forEach((oggetto, i) => {
    offset.push(corpo.length);
    corpo += `${i + 1} 0 obj\n${oggetto}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`;
  corpo += offset.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  corpo += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(corpo);
}

function farmaco(cod: string): Prodotto {
  return { cod, nome: 'PROVAMED', foglietto_url: `https://aifa.example/foglietto/${cod}.pdf` } as Prodotto;
}

/** fetch finto: conta le chiamate e risponde con `risposta()`. */
function scaricaFinto(risposta: () => Response | Promise<Response>) {
  const chiamate: string[] = [];
  const scarica = (async (url: string) => {
    chiamate.push(url);
    return risposta();
  }) as unknown as typeof fetch;
  return { scarica, chiamate };
}

describe('FonteAifa', () => {
  const pdf = pdfDiProva(['Prima pagina del foglio', 'Seconda pagina']);

  it('scarica il PDF ed estrae il testo di ogni pagina', async () => {
    const { scarica, chiamate } = scaricaFinto(() => new Response(pdf.slice()));
    const letto = await new FonteAifa(scarica).leggi(farmaco('000001'));
    expect(chiamate).toEqual(['https://aifa.example/foglietto/000001.pdf']);
    expect(letto.pagine).toBe(2);
    expect(letto.testo[0]).toContain('Prima pagina del foglio');
    expect(letto.testo[1]).toContain('Seconda pagina');
    expect(String.fromCharCode(...letto.pdf.slice(0, 4))).toBe('%PDF');
  });

  it('scarica ogni foglio una sola volta, anche con richieste contemporanee', async () => {
    const { scarica, chiamate } = scaricaFinto(() => new Response(pdf.slice()));
    const fonte = new FonteAifa(scarica);
    const [a, b] = await Promise.all([fonte.leggi(farmaco('000001')), fonte.leggi(farmaco('000001'))]);
    await fonte.leggi(farmaco('000001'));
    expect(chiamate).toHaveLength(1);
    expect(a).toBe(b);
  });

  it('un download fallito non resta in memoria: la volta dopo riprova', async () => {
    let risposte = [new Response('errore', { status: 500 }), new Response(pdf.slice())];
    const { scarica, chiamate } = scaricaFinto(() => risposte.shift()!);
    const fonte = new FonteAifa(scarica);
    await expect(fonte.leggi(farmaco('000001'))).rejects.toBeInstanceOf(FogliettoNonDisponibile);
    await expect(fonte.leggi(farmaco('000001'))).resolves.toMatchObject({ pagine: 2 });
    expect(chiamate).toHaveLength(2);
    risposte = [];
  });

  it('rifiuta un file che non è un PDF anche se la risposta è 200', async () => {
    const { scarica } = scaricaFinto(() => new Response('<html>pagina di errore</html>', { status: 200 }));
    await expect(new FonteAifa(scarica).leggi(farmaco('000001'))).rejects.toBeInstanceOf(FogliettoNonDisponibile);
  });

  it('trasforma un errore di rete in FogliettoNonDisponibile', async () => {
    const scarica = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(new FonteAifa(scarica).leggi(farmaco('000001'))).rejects.toBeInstanceOf(FogliettoNonDisponibile);
  });

  it('tiene in memoria al massimo 30 fogli: oltre, il più vecchio si riscarica', async () => {
    const { scarica, chiamate } = scaricaFinto(() => new Response(pdf.slice()));
    const fonte = new FonteAifa(scarica);
    for (let i = 1; i <= 31; i++) await fonte.leggi(farmaco(String(i).padStart(6, '0')));
    await fonte.leggi(farmaco('000031'));
    expect(chiamate).toHaveLength(31);
    await fonte.leggi(farmaco('000001'));
    expect(chiamate).toHaveLength(32);
  });
});
