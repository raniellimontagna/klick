// Gráficos da Evolução como strings SVG, sem dependências (porte de prototype/scripts/ui/charts.js).
// Os nomes acessíveis ficam em strings.ts, em T.chart.
import { T } from '../strings';

const STEP = 5000;
// "Tudo" num histórico grande: até MAX_COLUMNS colunas de pontos (cada uma guarda o menor e o maior tempo) e até MAX_BINS barras.
const MAX_COLUMNS = 600;
const MAX_BINS = 24;
const valid = (v: number | null): v is number => v !== null && v !== Infinity;

export interface EvolutionData {
  times: number[]; // tempos efetivos (Infinity = DNF)
  ao5: (number | null)[]; // a média oficial do evento em cada ponto (Ao5, ou Mo3 no 6×6, no 7×7 e no 3BLD); null onde não há
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
  open?: boolean; // a última faixa, que junta os tempos fora da curva (de `from` até o maior tempo)
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
  const dot = (i: number): string => `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(times[i]).toFixed(1)}" r="2.4"/>`;
  let dots = '';
  let diamonds = '';
  const pts: string[] = [];
  // Até MAX_COLUMNS solves, um ponto por solve. Acima disso, cada coluna desenha só o menor e o maior tempo dela (a faixa do gráfico
  // não muda) e a média ganha um ponto por coluna (o último da coluna). Os recordes são poucos e saem todos.
  const columns = Math.min(n, MAX_COLUMNS);
  for (let c = 0; c < columns; c++) {
    const start = Math.floor((c * n) / columns);
    const end = Math.floor(((c + 1) * n) / columns);
    let lo = -1;
    let hi = -1;
    let avg = -1;
    for (let i = start; i < end; i++) {
      if (valid(times[i])) {
        if (lo < 0 || times[i] < times[lo]) lo = i;
        if (hi < 0 || times[i] > times[hi]) hi = i;
      }
      if (valid(ao5[i])) avg = i;
    }
    if (lo >= 0) dots += dot(lo);
    if (hi >= 0 && hi !== lo) dots += dot(hi);
    if (avg >= 0) pts.push(`${x(avg).toFixed(1)} ${y(ao5[avg] as number).toFixed(1)}`);
  }
  times.forEach((v, i) => {
    if (pb[i] && valid(v)) diamonds += `<path class="pb" d="M${x(i).toFixed(1)} ${(y(v) - 6).toFixed(1)}l6 6-6 6-6-6z"/>`;
  });
  const line = pts.length > 1 ? `<path class="avg" d="M${pts.join(' L')}"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${T.chart.evolution}">${dots}${line}${diamonds}</svg>`;
}

// Faixas de 5 s do menor ao maior tempo (sem DNF). Até MAX_BINS faixas: um tempo fora da curva (o timer esquecido ligado) vai para a
// última, aberta, que vai até o maior tempo, em vez de criar centenas de barras vazias.
export function histogramBins(values: number[]): Bin[] {
  const v = values.filter(valid);
  if (!v.length) return [];
  const { min, max } = extent(v);
  const lo = Math.floor(min / STEP) * STEP;
  const needed = Math.floor((max - lo) / STEP) + 1;
  const count = Math.min(needed, MAX_BINS);
  const bins = Array.from({ length: count }, (_, i): Bin => ({ from: lo + i * STEP, to: lo + (i + 1) * STEP, count: 0 }));
  if (needed > MAX_BINS) Object.assign(bins[count - 1], { to: max + 1, open: true });
  for (const x of v) bins[Math.min(Math.floor((x - lo) / STEP), count - 1)].count++;
  return bins;
}
