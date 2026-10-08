// Gráficos da Evolução como strings SVG, sem dependências.
const STEP = 5000;
const valid = (v) => v !== null && v !== Infinity;

// times: tempos efetivos (Infinity = DNF); ao5: média de 5 em cada ponto (null se não houver);
// pb: true onde o solve bateu o recorde da época. Tempo menor fica mais embaixo: a linha desce conforme você melhora.
export function evolutionChart({ times, ao5, pb }, { width = 600, height = 160, pad = 10 } = {}) {
  const all = [...times.filter(valid), ...ao5.filter(valid)];
  if (!all.length) return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sem solves no período"></svg>`;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const n = times.length;
  const x = (i) => (n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (v) => pad + ((max - v) / span) * (height - 2 * pad);
  let dots = '';
  let diamonds = '';
  times.forEach((v, i) => {
    if (!valid(v)) return;
    dots += `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4"/>`;
    if (pb[i]) diamonds += `<path class="pb" d="M${x(i).toFixed(1)} ${(y(v) - 6).toFixed(1)}l6 6-6 6-6-6z"/>`;
  });
  const pts = ao5.map((v, i) => (valid(v) ? `${x(i).toFixed(1)} ${y(v).toFixed(1)}` : null)).filter(Boolean);
  const line = pts.length > 1 ? `<path class="avg" d="M${pts.join(' L')}"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução dos tempos">${dots}${line}${diamonds}</svg>`;
}

// Faixas de 5 s do menor ao maior tempo (sem DNF).
export function histogramBins(values) {
  const v = values.filter(valid);
  if (!v.length) return [];
  const lo = Math.floor(Math.min(...v) / STEP) * STEP;
  const count = Math.floor((Math.max(...v) - lo) / STEP) + 1;
  const bins = Array.from({ length: count }, (_, i) => ({ from: lo + i * STEP, to: lo + (i + 1) * STEP, count: 0 }));
  for (const x of v) bins[Math.floor((x - lo) / STEP)].count++;
  return bins;
}
