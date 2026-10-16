// As cópias diárias no R2 (spec 8.3): snap/<userId>/<nome>.json.gz, comprimidas com gzip. O dia é o de Brasília (UTC-3, sem horário de
// verão desde 2019); a cópia sai logo depois da meia-noite de lá. A regra de ciclo de vida do bucket apaga o que passa de 30 dias.

export const snapshotPrefix = (userId: string): string => `snap/${userId}/`;
export const snapshotKey = (userId: string, name: string): string => `${snapshotPrefix(userId)}${name}.json.gz`;
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

async function pipe(input: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  const stream = new Blob([input]).stream().pipeThrough(transform);
  return new Response(stream).arrayBuffer();
}

export function gzipJson(data: unknown): Promise<ArrayBuffer> {
  return pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('gzip'));
}

export async function gunzipJson(bytes: ArrayBuffer): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(bytes), new DecompressionStream('gzip')))) as unknown;
}
