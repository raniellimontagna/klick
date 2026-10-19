// O link do desafio (spec do desafio, seção 4): JSON comprimido (deflate-raw) em base64url, no fragmento `#desafio=`.
import { EVENT_IDS } from '../events';
import type { DuelLink, DuelTime, EventId, Penalty } from '../types';
import { DUEL_SCRAMBLES } from './score';

export const MAX_DUEL_NAME = 20;
export const MAX_DUEL_PAYLOAD = 12_000; // caracteres do payload; acima disso o link não abre
export const MAX_DUEL_MS = 86_400_000; // teto de um tempo: 24 h
const MAX_SCRAMBLE = 1_000; // caracteres por embaralhamento
const MAX_JSON_BYTES = 64 * 1024; // teto do JSON descomprimido: o link de 12 000 caracteres não vira uma bomba de memória
const PARAM = 'desafio=';
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

type Bytes = Uint8Array<ArrayBuffer>;

// Escrever e ler andam juntos: esperar a escrita acabar antes de ler travaria quando a saída enche (contrapressão). Se a escrita
// rejeita (dados inválidos), a leitura rejeita junto. `limit` corta a saída antes de ela crescer demais.
async function pipeThrough(transform: CompressionStream | DecompressionStream, input: Bytes, limit = Infinity): Promise<Bytes> {
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  const write = async () => {
    await writer.write(input);
    await writer.close();
  };
  const read = async () => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return chunks;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error('descompressão passou do teto');
      }
      chunks.push(value);
    }
  };
  const [, chunks] = await Promise.all([write(), read()]);
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Só o alfabeto do base64url, e nunca um resto de 1 caractere (não existe base64 assim): o resto o atob confere.
function fromBase64Url(text: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeDuelLink(link: DuelLink): Promise<string> {
  const packed = await pipeThrough(new CompressionStream('deflate-raw'), new TextEncoder().encode(JSON.stringify(link)));
  return toBase64Url(packed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPenalty(value: unknown): value is Penalty {
  return value === null || value === '+2' || value === 'DNF';
}

function isTime(value: unknown): value is DuelTime {
  return isRecord(value) && typeof value.ms === 'number' && Number.isInteger(value.ms) && value.ms >= 0 && value.ms <= MAX_DUEL_MS && isPenalty(value.penalty);
}

// Nome fora do formato (não string, comprido demais) vira vazio: o link continua valendo.
function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  return name.length > MAX_DUEL_NAME ? '' : name;
}

// Os tempos de um lado: de `min` a sete, todos válidos; senão null.
function cleanSide(value: unknown, min: number): { name: string; times: DuelTime[] } | null {
  if (!isRecord(value) || !Array.isArray(value.times)) return null;
  const times: unknown[] = value.times;
  if (times.length < min || times.length > DUEL_SCRAMBLES || !times.every(isTime)) return null;
  return { name: cleanName(value.name), times: times.map((t) => ({ ms: t.ms, penalty: t.penalty })) };
}

function cleanLink(value: unknown): DuelLink | null {
  if (!isRecord(value) || value.v !== 1) return null;
  if (typeof value.id !== 'string' || !/^[a-z0-9]{8,32}$/.test(value.id)) return null;
  if (typeof value.event !== 'string' || !EVENT_IDS.includes(value.event as EventId)) return null;
  const scrambles: unknown = value.scrambles;
  if (!Array.isArray(scrambles) || scrambles.length !== DUEL_SCRAMBLES) return null;
  if (!scrambles.every((s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_SCRAMBLE)) return null;
  const a = cleanSide(value.a, DUEL_SCRAMBLES);
  if (!a) return null;
  const link: DuelLink = { v: 1, id: value.id, event: value.event as EventId, scrambles: scrambles as string[], a };
  if (value.b !== undefined) {
    const b = cleanSide(value.b, 1);
    if (!b) return null;
    link.b = b;
  }
  return link;
}

// Nunca lança: qualquer falha (base64, descompressão, JSON, formato) é um link que não abre.
export async function decodeDuelLink(text: string): Promise<DuelLink | null> {
  if (typeof text !== 'string' || text.length > MAX_DUEL_PAYLOAD) return null;
  try {
    const packed = fromBase64Url(text);
    if (!packed) return null;
    const json = new TextDecoder('utf-8', { fatal: true }).decode(await pipeThrough(new DecompressionStream('deflate-raw'), packed, MAX_JSON_BYTES));
    return cleanLink(JSON.parse(json));
  } catch {
    return null;
  }
}

export function duelUrl(origin: string, payload: string): string {
  return `${origin}/#${PARAM}${payload}`;
}

// O payload de `#desafio=…` (o `#` é opcional); outro fragmento, ou um vazio, não é desafio.
export function duelPayloadOf(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment.startsWith(PARAM)) return null;
  return fragment.slice(PARAM.length) || null;
}

// 16 caracteres [a-z0-9]. Sem `rand`, vem do crypto, descartando os bytes que enviesariam o resto da divisão por 36.
export function newLinkId(rand?: () => number): string {
  const n = ID_ALPHABET.length;
  let id = '';
  if (rand) {
    while (id.length < 16) id += ID_ALPHABET[Math.min(n - 1, Math.floor(rand() * n))];
    return id;
  }
  const limit = 256 - (256 % n);
  while (id.length < 16) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < limit && id.length < 16) id += ID_ALPHABET[byte % n];
    }
  }
  return id;
}
