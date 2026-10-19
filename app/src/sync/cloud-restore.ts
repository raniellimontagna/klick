// A restauração pelo aparelho (spec das cópias grandes, seção 5): o servidor não deu conta de trocar a conta de uma vez, e o aparelho baixa
// a cópia pelo Worker. Aqui só o download e a conferência; guardar a cópia local e aplicar as diferenças é com restoreExport (data/safety.ts).
import { gunzipJson } from '../core/gzip';
import { assembleCopy, type CopyPart, isCopyPart, isManifest } from '../core/sync/copy-parts';
import type { KlickExport } from '../data/repository';
import { isKlickExport } from '../data/safety';
import type { SyncApi } from './api';

// O objeto 0 é a cópia inteira (um arquivo só) ou o manifesto das partes. As partes 1..N (o N é do manifesto) vêm uma de cada vez e em ordem,
// para a memória ter só uma parte aberta além das já juntas. Rejeita sem devolver nada o que não passa na conferência (bytes que não são
// gzip, uma parte torta, um manifesto torto, um arquivo que não é do Klick); o 404 do ApiError chega como está, e quem chama decide.
export async function downloadCopy(api: Pick<SyncApi, 'copyPart'>, name: string, account: string): Promise<KlickExport> {
  const main = await gunzipJson(await api.copyPart(name, 0, account));
  if (!isManifest(main)) {
    if (!isKlickExport(main)) throw new Error('A cópia não está no formato do Klick.');
    return main;
  }
  const parts: CopyPart[] = [];
  for (let i = 1; i <= main.parts.length; i++) {
    const part = await gunzipJson(await api.copyPart(name, i, account));
    if (!isCopyPart(part)) throw new Error(`A parte ${i} da cópia não está no formato do Klick.`);
    parts.push(part);
  }
  return assembleCopy(main, parts);
}
