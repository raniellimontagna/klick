// Baixa um texto como arquivo. Devolve false quando não dá (dentro de iframe, ou o navegador recusou): quem chama então mostra o
// texto para copiar (ExportDialog).
import { isFramed } from './platform';

// A URL do blob só some depois de o download começar: o Safari pode perder o arquivo se a URL for revogada antes.
const REVOKE_MS = 1000;

export function downloadText(name: string, text: string, mime = 'application/json', doc: Document = document): boolean {
  if (isFramed(doc.defaultView ?? undefined)) return false;
  let url: string | null = null;
  try {
    url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = name;
    doc.body.append(link);
    link.click();
    link.remove();
    const pending = url;
    setTimeout(() => URL.revokeObjectURL(pending), REVOKE_MS);
    return true;
  } catch {
    if (url) URL.revokeObjectURL(url);
    return false;
  }
}
