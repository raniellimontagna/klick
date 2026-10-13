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

  it('evolutionChart não estoura o limite de argumentos e não desenha um círculo por solve', () => {
    const svg = evolutionChart({ times, ao5: times.map(() => null), pb: times.map(() => false) });
    const dots = (svg.match(/class="dot"/g) || []).length;
    expect(dots).toBeGreaterThan(0);
    expect(dots).toBeLessThanOrEqual(1200);
  });
});

// "Tudo" num histórico grande: o SVG não pode ter um círculo por solve, e um tempo absurdo não pode criar centenas de barras.
describe('gráficos: histórico grande e tempos fora da curva', () => {
  it('com muitos solves, cada coluna guarda o menor e o maior tempo: a faixa do gráfico não muda', () => {
    const times = Array.from({ length: 10_000 }, (_, i) => 15_000 + ((i * 7919) % 10_000));
    times[4321] = 9_000; // o melhor
    times[8765] = 40_000; // o pior
    const svg = evolutionChart({ times, ao5: times.map(() => null), pb: times.map(() => false) }, { height: 160, pad: 10 });
    expect((svg.match(/class="dot"/g) || []).length).toBeLessThanOrEqual(1200);
    expect(svg).toMatch(/cy="150.0"/); // o melhor continua no chão
    expect(svg).toMatch(/cy="10.0"/); // o pior continua no teto
  });

  it('a linha da média tem no máximo um ponto por coluna', () => {
    const times = Array.from({ length: 5_000 }, (_, i) => 15_000 + (i % 100) * 10);
    const svg = evolutionChart({ times, ao5: times, pb: times.map(() => false) });
    const line = svg.match(/class="avg" d="M([^"]+)"/)![1];
    expect(line.split(' L').length).toBeLessThanOrEqual(600);
  });

  it('os recordes continuam todos marcados', () => {
    const times = Array.from({ length: 5_000 }, (_, i) => 30_000 - i);
    const pb = times.map((_, i) => i % 1000 === 0);
    const svg = evolutionChart({ times, ao5: times.map(() => null), pb });
    expect((svg.match(/class="pb"/g) || []).length).toBe(5);
  });

  it('um tempo fora da curva vai para a última faixa, aberta, em vez de criar centenas de barras', () => {
    const bins = histogramBins([15_000, 16_000, 21_000, 3_600_000]); // um timer esquecido ligado por uma hora
    expect(bins.length).toBeLessThanOrEqual(24);
    expect(bins.reduce((total, b) => total + b.count, 0)).toBe(4);
    const last = bins[bins.length - 1];
    expect(last.open).toBe(true);
    expect(last.count).toBe(1);
    expect(last.to).toBeGreaterThan(3_600_000);
    expect(bins[0]).toMatchObject({ from: 15_000, to: 20_000, count: 2 });
  });

  it('num evento lento (3 a 10 minutos), a largura da faixa cresce e a distribuição cabe sem faixa aberta', () => {
    const times = Array.from({ length: 200 }, (_, i) => 180_000 + i * 2_100); // 3:00 a ~10:00
    const bins = histogramBins(times);
    expect(bins.length).toBeLessThanOrEqual(24);
    expect(bins.some((b) => b.open)).toBe(false);
    expect(bins[0].to - bins[0].from).toBeGreaterThan(5_000);
    expect((bins[0].to - bins[0].from) % 5_000).toBe(0); // passos redondos: múltiplos de 5 s
    expect(bins.reduce((total, b) => total + b.count, 0)).toBe(200);
  });

  it('sem tempo fora da curva, nenhuma faixa é aberta', () => {
    expect(histogramBins([61000, 62000, 66000]).some((b) => b.open)).toBe(false);
  });
});

// O rótulo vem de T.chart (strings.ts). O caso portado só confere o do gráfico vazio; este fixa o do gráfico com dados.
describe('gráficos: rótulo acessível', () => {
  it('com dados, o SVG se chama "Evolução dos tempos"', () => {
    expect(evolutionChart({ times: [60000], ao5: [null], pb: [false] })).toMatch(/aria-label="Evolução dos tempos"/);
  });
});
