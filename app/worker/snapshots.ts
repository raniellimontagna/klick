// As cópias diárias no R2 (spec 8.3): snap/<userId>/<nome>.json.gz, comprimidas com gzip. O dia é o de Brasília (UTC-3, sem horário de
// verão desde 2019); a cópia sai logo depois da meia-noite de lá. A regra de ciclo de vida do bucket apaga o que passa de 30 dias.
import type { CloudCopy } from '../src/core/sync/types';

export const SNAPSHOTS_ROOT = 'snap/'; // todas as cópias, de todas as contas: o que a recontagem do espaço lista (budget.ts)
export const snapshotPrefix = (userId: string): string => `${SNAPSHOTS_ROOT}${userId}/`;
export const snapshotKey = (userId: string, name: string): string => `${snapshotPrefix(userId)}${name}.json.gz`;
// Uma parte da cópia grande (copy-parts.ts): numa pasta com o nome da cópia, `i` de 1, com 3 dígitos para a lista da pasta sair na ordem.
export const partKey = (userId: string, name: string, i: number): string => `${snapshotPrefix(userId)}${name}/${String(i).padStart(3, '0')}.json.gz`;
export const SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}(T\d{2}-\d{2}-\d{2}Z-antes)?$/;

const BRT = 3 * 3_600_000;
export const dayOf = (t: number): string => new Date(t - BRT).toISOString().slice(0, 10);
// A cópia "antes de restaurar": a data e a hora em UTC, para não sobrescrever a do dia. O dia de Brasília vai nos metadados (dayOf).
export const preRestoreName = (t: number): string => `${new Date(t).toISOString().slice(0, 19).replaceAll(':', '-')}Z-antes`;

// O próximo 03:05 UTC (00:05 em Brasília) depois de `t`.
export function nextSnapshotAt(t: number): number {
  const d = new Date(t);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 5);
  return today > t ? today : today + 86_400_000;
}

// gzipJson e gunzipJson moraram aqui: o app também lê as partes, então vivem em core/gzip.ts, e quem importa daqui segue igual.
export { gunzipJson, gzipJson } from '../src/core/gzip';

const partsOf = (v: string | undefined): number => (v !== undefined && /^\d+$/.test(v) ? Number(v) : 0);

// As cópias da conta no R2, a mais nova primeiro, e quantas páginas a listagem levou (cada uma, uma operação A). A ordem é a da gravação: o
// nome da diária leva o dia de Brasília, e o da de antes de restaurar, a data em UTC, que entre 21h e meia-noite de lá já é o dia seguinte.
// Com `delimiter: '/'` a listagem traz só os objetos de baixo do prefixo da conta: as partes, numa pasta, vão para `delimitedPrefixes` e
// ficam de fora; quem as guarda é o manifesto, que diz quantas são (`parts` nos metadados; sem ele, ou torto, 0: um arquivo só).
// Só `list` do bucket: quem chama passa um que reserva a operação antes de cada página (account-store.ts).
export async function listCopiesIn(bucket: Pick<R2Bucket, 'list'>, userId: string): Promise<{ copies: CloudCopy[]; pages: number }> {
  const prefix = snapshotPrefix(userId);
  const found: { copy: CloudCopy; uploaded: number }[] = [];
  let pages = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, delimiter: '/', include: ['customMetadata'], cursor });
    pages += 1;
    for (const o of page.objects) {
      const name = o.key.slice(prefix.length, -'.json.gz'.length);
      const meta = o.customMetadata ?? {};
      const kind = meta.kind === 'pre-restore' ? 'pre-restore' : 'daily';
      found.push({ copy: { name, day: meta.day ?? name.slice(0, 10), kind, solves: Number(meta.solves ?? 0), parts: partsOf(meta.parts) }, uploaded: o.uploaded.getTime() });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const copies = found.sort((a, b) => b.uploaded - a.uploaded || (a.copy.name < b.copy.name ? 1 : -1)).map((f) => f.copy);
  return { copies, pages };
}
