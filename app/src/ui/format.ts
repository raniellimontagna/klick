// Formatação de datas e textos curtos da interface (porte de prototype/scripts/ui/format.js).
// Os tempos dos solves (formatMs, formatSolve) e o dia (dayKey) ficam em core/stats.ts.
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DAY = 86400000;

export const dateLabel = (ts: number): string => {
  const d = new Date(ts);
  return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`;
};

export const monthLabel = (ts: number): string => MONTHS[new Date(ts).getMonth()];

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
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

export function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
  if (calendarDays(ts, now) === 0) return `há ${Math.floor(diff / 3600000)} h`;
  return daysAgoLabel(ts, now);
}

export const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
