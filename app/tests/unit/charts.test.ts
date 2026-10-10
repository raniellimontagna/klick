import { describe, expect, it } from 'vitest';
import { evolutionChart, histogramBins } from '../../src/ui/charts';

// Casos portados de prototype/tests/charts.test.js.
describe('gráficos', () => {
  it('evolutionChart desenha pontos sem DNF, a linha da média e os recordes', () => {
    const svg = evolutionChart({
      times: [70000, Infinity, 65000, 64000, 60000],
      ao5: [null, null, null, null, 65000],
      pb: [false, false, true, true, true],
    });
    expect((svg.match(/class="dot"/g) || []).length).toBe(4);
    expect((svg.match(/class="pb"/g) || []).length).toBe(3);
    expect(svg).not.toMatch(/class="avg"/);
  });

  it('evolutionChart: o tempo menor fica mais embaixo e a média vira linha', () => {
    const svg = evolutionChart({ times: [70000, 60000], ao5: [70000, 60000], pb: [false, true] }, { height: 160, pad: 10 });
    expect(svg).toMatch(/cy="10.0"/);
    expect(svg).toMatch(/cy="150.0"/);
    expect(svg).toMatch(/class="avg" d="M10.0 10.0 L590.0 150.0"/);
  });

  it('evolutionChart sem dados devolve um SVG vazio com rótulo', () => {
    expect(evolutionChart({ times: [], ao5: [], pb: [] })).toMatch(/Sem solves no período/);
  });

  it('histogramBins agrupa em faixas de 5 s e ignora DNF', () => {
    const bins = histogramBins([61000, 62000, 66000, 71000, Infinity]);
    expect(bins.map((b) => [b.from, b.count])).toEqual([[60000, 2], [65000, 1], [70000, 1]]);
    expect(histogramBins([Infinity])).toEqual([]);
  });
});

// Math.min(...lista) lança RangeError por volta de 130 mil itens (menos no Safari): quem treina todo dia chega lá em poucos anos.
describe('gráficos com histórico grande', () => {
  const times = Array.from({ length: 200_000 }, (_, i) => 50000 + (i % 40) * 1000);

  it('histogramBins não estoura o limite de argumentos', () => {
    const bins = histogramBins(times);
    expect(bins[0].from).toBe(50000);
    expect(bins).toHaveLength(8);
    expect(bins.reduce((total, b) => total + b.count, 0)).toBe(200_000);
  });

  it('evolutionChart não estoura o limite de argumentos', () => {
    const svg = evolutionChart({ times, ao5: times.map(() => null), pb: times.map(() => false) });
    expect((svg.match(/class="dot"/g) || []).length).toBe(200_000);
  });
});

// O rótulo vem de T.chart (strings.ts). O caso portado só confere o do gráfico vazio; este fixa o do gráfico com dados.
describe('gráficos: rótulo acessível', () => {
  it('com dados, o SVG se chama "Evolução dos tempos"', () => {
    expect(evolutionChart({ times: [60000], ao5: [null], pb: [false] })).toMatch(/aria-label="Evolução dos tempos"/);
  });
});
