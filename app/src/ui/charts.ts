// Gráficos da Evolução como strings SVG, sem dependências (porte de prototype/scripts/ui/charts.js).
// Os nomes acessíveis ficam em strings.ts, em T.chart.
import { T } from '../strings';

const STEP = 5000;
const valid = (v: number | null): v is number => v !== null && v !== Infinity;

export interface EvolutionData {
  times: number[]; // tempos efetivos (Infinity = DNF)
  ao5: (number | null)[]; // a média oficial do evento em cada ponto (Ao5, ou Mo3 no 6×6 e no 7×7); null onde não há
  pb: boolean[]; // true onde o solve bateu o recorde da época
}

export interface ChartSize {
  width?: number;
  height?: number;
  pad?: number;
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

// Menor e maior de uma lista não vazia. Math.min(...lista) estoura o limite de argumentos com um histórico muito grande.
function extent(values: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// Tempo menor fica mais embaixo: a linha desce conforme você melhora.
export function evolutionChart({ times, ao5, pb }: EvolutionData, { width = 600, height = 160, pad = 10 }: ChartSize = {}): string {
  const all = [...times.filter(valid), ...ao5.filter(valid)];
  if (!all.length) return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${T.chart.empty}"></svg>`;
  const { min, max } = extent(all);
  const span = Math.max(1, max - min);
  const n = times.length;
  const x = (i: number): number => (n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (v: number): number => pad + ((max - v) / span) * (height - 2 * pad);
  let dots = '';
  let diamonds = '';
  times.forEach((v, i) => {
    if (!valid(v)) return;
    dots += `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4"/>`;
    if (pb[i]) diamonds += `<path class="pb" d="M${x(i).toFixed(1)} ${(y(v) - 6).toFixed(1)}l6 6-6 6-6-6z"/>`;
  });
  const pts = ao5.map((v, i) => (valid(v) ? `${x(i).toFixed(1)} ${y(v).toFixed(1)}` : null)).filter(Boolean);
  const line = pts.length > 1 ? `<path class="avg" d="M${pts.join(' L')}"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${T.chart.evolution}">${dots}${line}${diamonds}</svg>`;
}

// Faixas de 5 s do menor ao maior tempo (sem DNF).
export function histogramBins(values: number[]): Bin[] {
  const v = values.filter(valid);
  if (!v.length) return [];
  const { min, max } = extent(v);
  const lo = Math.floor(min / STEP) * STEP;
  const count = Math.floor((max - lo) / STEP) + 1;
  const bins = Array.from({ length: count }, (_, i): Bin => ({ from: lo + i * STEP, to: lo + (i + 1) * STEP, count: 0 }));
  for (const x of v) bins[Math.floor((x - lo) / STEP)].count++;
  return bins;
}
