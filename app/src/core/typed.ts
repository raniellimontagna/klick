// O tempo digitado à mão (spec do timer completo): "1234" é 0:12.34 e "10234" é 1:02.34 (estilo csTimer: os dois últimos dígitos são os
// centésimos, os dois antes os segundos e o resto os minutos); também vale "12.34", "12,34" e "1:02.34". Um "+" no fim é +2 e "DNF", em
// qualquer caixa, é DNF com ms 0. Uma hora ou mais é recusada, e um tempo zero também (só o DNF tem ms 0). Pura, sem DOM.
import { formatMs } from './stats';
import type { Penalty } from './types';

export type TypedTime = { ok: true; ms: number; penalty: Penalty } | { ok: false };

const HOUR_MS = 3_600_000;
const MAX_DIGITS = 8; // mais que isso passa de uma hora de qualquer jeito

// A leitura do texto, com o motivo da recusa: parseTyped e tooLong olham a mesma conta (e os mesmos limites), cada um com o que precisa.
type Reading = { ok: true; ms: number; penalty: Penalty } | { ok: false; why: 'bad' | 'long' };
const BAD: Reading = { ok: false, why: 'bad' };
const LONG: Reading = { ok: false, why: 'long' };

// Monta o tempo; recusa o zero (só o DNF tem ms 0) e uma hora ou mais.
function timed(minutes: number, seconds: number, cs: number, penalty: Penalty): Reading {
  const ms = (minutes * 60 + seconds) * 1000 + cs * 10;
  if (ms >= HOUR_MS) return LONG;
  return ms > 0 ? { ok: true, ms, penalty } : BAD;
}

// Os centésimos de "5" (meio segundo: 50) ou "05" (5): um dígito só vale dezenas.
const centis = (frac: string | undefined): number => (frac === undefined ? 0 : Number(frac.padEnd(2, '0')));

function read(text: string): Reading {
  const trimmed = text.trim();
  if (/^dnf$/i.test(trimmed)) return { ok: true, ms: 0, penalty: 'DNF' };
  const plus = trimmed.endsWith('+');
  const body = (plus ? trimmed.slice(0, -1) : trimmed).trim();
  const penalty: Penalty = plus ? '+2' : null;

  // Só dígitos: "1234" → 0:12.34.
  if (/^\d+$/.test(body)) {
    const n = Number(body);
    if (n === 0) return BAD;
    if (body.length > MAX_DIGITS) return LONG;
    const seconds = Math.floor(n / 100) % 100;
    if (seconds >= 60) return BAD; // "6000" não é um relógio
    return timed(Math.floor(n / 10000), seconds, n % 100, penalty);
  }
  // Segundos com decimais: "12.34", "12,34", "9.5" (a vírgula é o teclado do celular em português).
  const plain = /^(\d{1,5})[.,](\d{1,2})$/.exec(body);
  if (plain) return timed(0, Number(plain[1]), centis(plain[2]), penalty);
  // Com minutos: "1:02.34", "1:02", "100:00.00".
  const clock = /^(\d{1,3}):(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(body);
  if (clock) {
    const seconds = Number(clock[2]);
    if (seconds >= 60) return BAD;
    return timed(Number(clock[1]), seconds, centis(clock[3]), penalty);
  }
  // Com horas: "1:02:03.45" (já passa do limite, e a mensagem diz isso).
  if (/^\d+:\d{1,2}:\d{1,2}(?:[.,]\d{1,2})?$/.test(body)) return LONG;
  return BAD;
}

export function parseTyped(text: string): TypedTime {
  const r = read(text);
  return r.ok ? r : { ok: false };
}

// O texto é um tempo de verdade, mas de uma hora ou mais: o erro diz o limite, em vez do genérico.
export function tooLong(text: string): boolean {
  const r = read(text);
  return !r.ok && r.why === 'long';
}

// O que o campo mostra enquanto se digita; null quando está vazio ou não vale. `time` é como a tela mostra o tempo ("0:14.34+" para 12.34+,
// que soma os 2 s; "DNF"), `plus2` diz se há a penalidade e `raw` é o tempo cru ("0:12.34"; vazio no DNF, que não tem tempo).
export function previewTyped(text: string): { time: string; plus2: boolean; raw: string } | null {
  const parsed = parseTyped(text);
  if (!parsed.ok) return null;
  if (parsed.penalty === 'DNF') return { time: 'DNF', plus2: false, raw: '' };
  const raw = formatMs(parsed.ms);
  if (parsed.penalty === '+2') return { time: `${formatMs(parsed.ms + 2000)}+`, plus2: true, raw };
  return { time: raw, plus2: false, raw };
}

// O DNF digitado: ms 0 e DNF, sem tempo nenhum por trás. Não há tempo para mostrar, então OK e +2 não existem para ele (o Timer e o detalhe
// desligam os dois); um DNF do cronômetro guarda o tempo cru e volta a OK ou a +2 quando se quer.
export const isTypedDnf = (s: { ms: number; penalty: Penalty }): boolean => s.penalty === 'DNF' && s.ms === 0;
