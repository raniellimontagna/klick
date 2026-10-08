// Formatação de datas e textos curtos da interface.
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAY = 86400000;

export const dateLabel = (ts) => {
  const d = new Date(ts);
  return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`;
};

export const monthLabel = (ts) => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][new Date(ts).getMonth()];

function calendarDays(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(12, 0, 0, 0);
  y.setHours(12, 0, 0, 0);
  return Math.round((y - x) / DAY);
}

export function daysAgoLabel(ts, now) {
  const d = calendarDays(ts, now);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

export function relativeTime(ts, now) {
  const diff = Math.max(0, now - ts);
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
  if (calendarDays(ts, now) === 0) return `há ${Math.floor(diff / 3600000)} h`;
  return daysAgoLabel(ts, now);
}

export const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
