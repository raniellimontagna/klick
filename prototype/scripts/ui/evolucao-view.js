// Tela Evolução: indicadores, gráfico, distribuição e histórico.
import { effectiveMs, formatMs, formatSolve, averageOf, bestSingle, stdDevMs, rollingAverages, pbFlags } from '../stats.js';
import { evolutionChart, histogramBins } from './charts.js';
import { relativeTime, truncate, escapeHtml } from './format.js';

const DAY = 86400000;
const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['all', 'Tudo']];

function variation(now, then) {
  if (now === null || then === null || now === Infinity || then === Infinity) return '—';
  const d = now - then;
  if (Math.abs(d) < 10) return 'sem mudança';
  return `${d < 0 ? '▼' : '▲'} ${(Math.abs(d) / 1000).toFixed(2)} s no período`;
}

// ctx: { root, solves, sessions, sessionFilter, period, now }
export function renderEvolucao({ root, solves, sessions, sessionFilter, period, now }) {
  const pool = sessionFilter === 'all' ? solves : solves.filter((x) => x.session === sessionFilter);
  const start = period === 'all' ? -Infinity : now - Number(period) * DAY;
  const offset = pool.findIndex((x) => x.at >= start);
  const first = offset < 0 ? pool.length : offset;
  const before = pool.slice(0, first);
  const inPeriod = pool.slice(first);

  const kpis = [
    ['Recorde', bestSingle(pool), bestSingle(before), true],
    ['Média de 5', averageOf(pool, 5), averageOf(before, 5)],
    ['Média de 12', averageOf(pool, 12), averageOf(before, 12)],
    ['Média de 100', averageOf(pool, 100), averageOf(before, 100)],
  ].map(([label, value, then, pb]) => `<div class="tile"><small>${label}</small><b class="${pb ? 'pb' : ''}">${formatMs(value)}</b><em>${period === 'all' ? '&nbsp;' : variation(value, then)}</em></div>`);
  const sd = stdDevMs(inPeriod);
  kpis.push(`<div class="tile"><small>Desvio</small><b>${sd === null ? '—' : `±${(sd / 1000).toFixed(1)} s`}</b><em>solves do período</em></div>`);

  const r5 = rollingAverages(pool, 5);
  const flags = pbFlags(pool);
  const times = inPeriod.map(effectiveMs);
  const chart = evolutionChart({ times, ao5: r5.slice(first), pb: flags.slice(first) });

  const bins = histogramBins(times);
  const current = averageOf(pool, 5);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const bars = bins.map((b) => `<i class="${current !== null && current >= b.from && current < b.to ? 'hl' : ''}" style="height:${Math.max(2, (b.count / maxCount) * 100)}%" title="${formatMs(b.from)}–${formatMs(b.to)}: ${b.count}"></i>`).join('');
  const axis = bins.length ? `<span>${formatMs(bins[0].from).slice(0, -3)}</span><span>${formatMs(bins[bins.length - 1].to).slice(0, -3)}</span>` : '';

  const rows = inPeriod.slice(-30).reverse().map((x) => {
    const i = pool.indexOf(x);
    const tag = flags[i] ? '<span class="tag pb">recorde</span>' : x.penalty ? `<span class="tag">${x.penalty}</span>` : '';
    return `<tr><td class="num">${i + 1}</td><td>${formatSolve(x)}${tag}</td><td>${formatMs(r5[i])}</td><td class="scr">${escapeHtml(truncate(x.scramble, 28))}</td><td>${relativeTime(x.at, now)}</td></tr>`;
  }).join('');

  const options = [['all', 'Todas as sessões'], ...sessions.map((s) => [s.id, s.name])]
    .map(([v, l]) => `<option value="${escapeHtml(v)}"${v === sessionFilter ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');

  root.innerHTML = `
    <div class="page-h">
      <h1>Evolução</h1>
      <select class="pill" data-evo-session aria-label="Sessão">${options}</select>
      <div class="seg" role="group" aria-label="Período">${PERIODS.map(([v, l]) => `<button data-period="${v}" aria-pressed="${v === period}">${l}</button>`).join('')}</div>
    </div>
    <div class="kpis">${kpis.join('')}</div>
    <div class="evo-grid">
      <div class="card"><div class="label">Todos os solves · média de 5 · recordes</div>${chart}</div>
      <div class="card"><div class="label">Distribuição</div><div class="bars">${bars}</div><div class="bars-x">${axis}</div></div>
    </div>
    <div class="card hist"><table>
      <thead><tr><th>#</th><th>Tempo</th><th>Média de 5</th><th class="scr">Embaralhamento</th><th>Quando</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">Sem solves neste período.</td></tr>'}</tbody>
    </table></div>`;
}
