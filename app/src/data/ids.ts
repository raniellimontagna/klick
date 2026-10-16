// Ids de 17 caracteres [0-9a-z] que ordenam como texto na ordem de criação: tempo (9) + contador do mesmo milissegundo (2)
// + sufixo aleatório (6), todos em base 36. Dentro da aba, um id nunca repete o par (tempo, contador): o relógio parado ou voltando
// usa o último milissegundo entregue, e estourando o contador (1296 ids nele) o tempo avança 1 ms. Assim uma importação de milhares
// de solves no mesmo `now` não depende do sufixo aleatório para não colidir, e o tamanho se mantém.

const TIME_DIGITS = 9;
const COUNTER_DIGITS = 2;
const RANDOM_DIGITS = 6;
const TIME_MAX = 36 ** TIME_DIGITS - 1;
const COUNTER_MAX = 36 ** COUNTER_DIGITS - 1;

let lastMs = -1; // último milissegundo entregue (-1: nenhum ainda)
let counter = 0; // contador desse milissegundo

// Inteiro em base 36 com `width` dígitos. Valor fora da faixa fica no limite, para o id nunca mudar de tamanho.
function encode(value: number, width: number): string {
  const max = 36 ** width - 1;
  const n = Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 0), max) : 0;
  return n.toString(36).padStart(width, '0');
}

// Tempo como o id o guarda: inteiro dentro da faixa (um `now` inválido vira 0).
const timeOf = (now: number): number => (Number.isFinite(now) ? Math.min(Math.max(Math.floor(now), 0), TIME_MAX) : 0);

// Próximo par (milissegundo, contador) desta aba. Só sai um par já entregue se nada mais couber: o contador não passa do limite.
function nextSlot(now: number): { ms: number; count: number } {
  const ms = timeOf(now);
  if (ms > lastMs) {
    lastMs = ms;
    counter = 0;
  } else if (counter < COUNTER_MAX) {
    counter += 1; // o relógio parou ou voltou: segue no último milissegundo entregue
  } else {
    lastMs = Math.min(lastMs + 1, TIME_MAX); // contador estourado: o milissegundo seguinte, a partir de agora
    counter = 0;
  }
  return { ms: lastMs, count: counter };
}

export function newId(now: number = Date.now(), rand: () => number = Math.random): string {
  const slot = nextSlot(now);
  return encode(slot.ms, TIME_DIGITS) + encode(slot.count, COUNTER_DIGITS) + encode(rand() * 36 ** RANDOM_DIGITS, RANDOM_DIGITS);
}

// --- Ids derivados (spec 5.5): o mesmo dado dá o mesmo id em qualquer aparelho ---

// cyrb53 (domínio público, de bryc): um hash de 53 bits, rápido e sem dependência. Duas sementes dão 106 bits, longe de colidir num
// histórico de dezenas de milhares de solves.
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// `prefix` mais 22 caracteres [0-9a-z] tirados das partes. Ids derivados não ordenam pelo tempo, ao contrário de newId.
export function derivedId(prefix: string, parts: readonly (string | number)[]): string {
  const text = parts.join('\u001f');
  return prefix + cyrb53(text, 1).toString(36).padStart(11, '0') + cyrb53(text, 2).toString(36).padStart(11, '0');
}

// A sessão padrão de um aparelho sem sessões (spec 5.5): o mesmo id em todo aparelho novo, e o sync as junta.
export const defaultSessionId = (event: string): string => `default-${event}`;
