// Ids de 17 caracteres [0-9a-z] que ordenam como texto na ordem de criação: tempo (9) + contador do mesmo milissegundo (2)
// + sufixo aleatório (6), todos em base 36. O contador vive em variáveis do módulo: ids pedidos no mesmo milissegundo saem na
// ordem do pedido. Passando de 1296 ids no mesmo milissegundo, o contador fica em "zz" e só o sufixo desempata; o tamanho se mantém.

const TIME_DIGITS = 9;
const COUNTER_DIGITS = 2;
const RANDOM_DIGITS = 6;

let lastNow = Number.NaN;
let counter = 0;

// Inteiro em base 36 com `width` dígitos. Valor fora da faixa fica no limite, para o id nunca mudar de tamanho.
function encode(value: number, width: number): string {
  const max = 36 ** width - 1;
  const n = Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 0), max) : 0;
  return n.toString(36).padStart(width, '0');
}

export function newId(now: number = Date.now(), rand: () => number = Math.random): string {
  counter = now === lastNow ? counter + 1 : 0;
  lastNow = now;
  return encode(now, TIME_DIGITS) + encode(counter, COUNTER_DIGITS) + encode(rand() * 36 ** RANDOM_DIGITS, RANDOM_DIGITS);
}
