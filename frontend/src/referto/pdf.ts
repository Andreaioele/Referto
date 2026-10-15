import type { PDFDocumentProxy } from 'pdfjs-dist'

/** pdf.js si carica solo quando serve (è grande): la prima volta che si apre un foglietto. */
export async function apriPdf(url: string): Promise<PDFDocumentProxy> {
  const [pdfjs, lavoratore] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = lavoratore.default
  return pdfjs.getDocument({ url }).promise
}
