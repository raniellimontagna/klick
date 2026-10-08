import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

function block(selectorStart) {
  const at = css.indexOf(selectorStart);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return Object.fromEntries([...css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [frente, fundo, mínimo]. Texto normal pede 4,5; número grande e ícone pedem 3.
const PAIRS = [
  ['ink', 'bg', 4.5], ['ink', 'surface', 4.5], ['ink-2', 'surface-2', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'surface', 4.5], ['pb-ink', 'pb-bg', 4.5],
  ['dec', 'bg', 3], ['arm', 'bg', 3], ['go', 'bg', 3], ['pb', 'bg', 3], ['insp-8', 'bg', 3], ['insp-12', 'bg', 3],
];

for (const [name, selector] of [['claro', ':root {'], ['noite', ":root[data-theme='dark']"]]) {
  test(`contraste AA no tema ${name}`, () => {
    const t = block(selector);
    for (const [fg, bg, min] of PAIRS) {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= min, `${fg} sobre ${bg}: ${r.toFixed(2)} < ${min}`);
    }
  });
}
