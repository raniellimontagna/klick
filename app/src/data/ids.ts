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
