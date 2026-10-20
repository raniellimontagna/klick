// O tempo digitado à mão (spec do timer completo): "1234" é 0:12.34 e "10234" é 1:02.34 (estilo csTimer: os dois últimos dígitos são os
// centésimos, os dois antes os segundos e o resto os minutos); também vale "12.34", "12,34" e "1:02.34". Um "+" no fim é +2 e "DNF", em
// qualquer caixa, é DNF com ms 0. Uma hora ou mais é recusada, e um tempo zero também (só o DNF tem ms 0). Pura, sem DOM.
import { formatMs } from './stats';
import type { Penalty } from './types';

export type TypedTime = { ok: true; ms: number; penalty: Penalty } | { ok: false };

const HOUR_MS = 3_600_000;
const MAX_DIGITS = 8; // mais que isso passa de uma hora de qualquer jeito
const REFUSED: TypedTime = { ok: false };

// Monta o tempo; recusa o zero e uma hora ou mais.
function timed(minutes: number, seconds: number, cs: number, penalty: Penalty): TypedTime {
  const ms = (minutes * 60 + seconds) * 1000 + cs * 10;
  return ms > 0 && ms < HOUR_MS ? { ok: true, ms, penalty } : REFUSED;
}

// Os centésimos de "5" (meio segundo: 50) ou "05" (5): um dígito só vale dezenas.
const centis = (frac: string | undefined): number => (frac === undefined ? 0 : Number(frac.padEnd(2, '0')));

export function parseTyped(text: string): TypedTime {
  const trimmed = text.trim();
  if (/^dnf$/i.test(trimmed)) return { ok: true, ms: 0, penalty: 'DNF' };
  const plus = trimmed.endsWith('+');
  const body = (plus ? trimmed.slice(0, -1) : trimmed).trim();
  const penalty: Penalty = plus ? '+2' : null;

  // Só dígitos: "1234" → 0:12.34.
  if (/^\d+$/.test(body)) {
    if (body.length > MAX_DIGITS) return REFUSED;
    const n = Number(body);
    const seconds = Math.floor(n / 100) % 100;
    if (seconds >= 60) return REFUSED; // "6000" não é um relógio
    return timed(Math.floor(n / 10000), seconds, n % 100, penalty);
  }
  // Segundos com decimais: "12.34", "12,34", "9.5" (a vírgula é o teclado do celular em português).
  const plain = /^(\d{1,5})[.,](\d{1,2})$/.exec(body);
  if (plain) return timed(0, Number(plain[1]), centis(plain[2]), penalty);
  // Com minutos: "1:02.34", "1:02".
  const clock = /^(\d{1,2}):(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(body);
  if (clock) {
    const seconds = Number(clock[2]);
    if (seconds >= 60) return REFUSED;
    return timed(Number(clock[1]), seconds, centis(clock[3]), penalty);
  }
  return REFUSED;
}

// O que o campo mostra enquanto se digita; null quando está vazio ou não vale.
export function previewTyped(text: string): string | null {
  const parsed = parseTyped(text);
  if (!parsed.ok) return null;
  if (parsed.penalty === 'DNF') return 'DNF';
  return formatMs(parsed.ms) + (parsed.penalty === '+2' ? '+' : '');
}
