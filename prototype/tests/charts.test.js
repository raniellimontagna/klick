import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evolutionChart, histogramBins } from '../scripts/ui/charts.js';

test('evolutionChart desenha pontos sem DNF, a linha da média e os recordes', () => {
  const svg = evolutionChart({
    times: [70000, Infinity, 65000, 64000, 60000],
    ao5: [null, null, null, null, 65000],
    pb: [false, false, true, true, true],
  });
  assert.equal((svg.match(/class="dot"/g) || []).length, 4);
  assert.equal((svg.match(/class="pb"/g) || []).length, 3);
  assert.doesNotMatch(svg, /class="avg"/);
});

test('evolutionChart: o tempo menor fica mais embaixo e a média vira linha', () => {
  const svg = evolutionChart({ times: [70000, 60000], ao5: [70000, 60000], pb: [false, true] }, { height: 160, pad: 10 });
  assert.match(svg, /cy="10.0"/);
  assert.match(svg, /cy="150.0"/);
  assert.match(svg, /class="avg" d="M10.0 10.0 L590.0 150.0"/);
});

test('evolutionChart sem dados devolve um SVG vazio com rótulo', () => {
  assert.match(evolutionChart({ times: [], ao5: [], pb: [] }), /Sem solves no período/);
});

test('histogramBins agrupa em faixas de 5 s e ignora DNF', () => {
  const bins = histogramBins([61000, 62000, 66000, 71000, Infinity]);
  assert.deepEqual(bins.map((b) => [b.from, b.count]), [[60000, 2], [65000, 1], [70000, 1]]);
  assert.deepEqual(histogramBins([Infinity]), []);
});
