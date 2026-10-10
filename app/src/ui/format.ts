// Formatação de datas e textos curtos da interface (porte de prototype/scripts/ui/format.js).
// As palavras (dias, meses, "hoje", "há N min") ficam em strings.ts, em T.date. Os tempos dos solves (formatMs, formatSolve)
// e o dia (dayKey) ficam em core/stats.ts.
import { T } from '../strings';

const DAY = 86400000;

export const dateLabel = (ts: number): string => {
  const d = new Date(ts);
  return `${T.date.weekdaysShort[d.getDay()]}, ${d.getDate()} ${T.date.monthsShort[d.getMonth()]}`;
};

export const monthLabel = (ts: number): string => T.date.months[new Date(ts).getMonth()];

// Hora e minuto (HH:MM) no horário local.
export const timeOfDay = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Dias de calendário entre dois instantes. Compara ao meio-dia para a virada do horário de verão (23 h ou 25 h) não contar um dia a mais ou a menos.
function calendarDays(a: number, b: number): number {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(12, 0, 0, 0);
  y.setHours(12, 0, 0, 0);
  return Math.round((y.getTime() - x.getTime()) / DAY);
}

export function daysAgoLabel(ts: number, now: number): string {
  const d = calendarDays(ts, now);
  return d <= 0 ? T.date.today : d === 1 ? T.date.yesterday : T.date.daysAgo(d);
}

export function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 60000) return T.date.now;
  if (diff < 3600000) return T.date.minutesAgo(Math.floor(diff / 60000));
  if (calendarDays(ts, now) === 0) return T.date.hoursAgo(Math.floor(diff / 3600000));
  return daysAgoLabel(ts, now);
}

export const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
