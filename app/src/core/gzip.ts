// O gzip das cópias (spec 8.3): só Web APIs (Response, CompressionStream), as mesmas no Worker, no navegador e nos testes. O Worker
// grava as cópias com ele e o app lê as partes de uma cópia grande com o mesmo código (core/sync/copy-parts.ts). O corpo vem de um
// Response, e não de um Blob: o Blob do jsdom (os testes do app) não tem `stream()`.
async function pipe(input: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  const stream = new Response(input as BodyInit).body!.pipeThrough(transform);
  return new Response(stream).arrayBuffer();
}

export function gzipJson(data: unknown): Promise<ArrayBuffer> {
  return pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('gzip'));
}

export async function gunzipJson(bytes: ArrayBuffer): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(bytes), new DecompressionStream('gzip')))) as unknown;
}
