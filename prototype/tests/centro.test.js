import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringFor, eyesFor, renderCentro, updateCentro, paletteFor, PALETTES, RING_ORDER } from '../scripts/centro.js';

const N = null;

test('a ordem do anel é horária a partir do canto superior esquerdo', () => {
  assert.deepEqual([...RING_ORDER], [0, 1, 2, 5, 8, 7, 6, 3]);
});

test('anel no parado: só o adesivo da órbita', () => {
  assert.deepEqual(ringFor({ state: 'idle', orbit: 10 }), [N, N, 'idle', N, N, N, N, N]);
  assert.deepEqual(ringFor({ state: 'idle' }), Array(8).fill(N));
});

test('anel na inspeção esvazia e muda de cor aos 8 e 12 s', () => {
  assert.deepEqual(ringFor({ state: 'inspect', inspectElapsed: 0 }), Array(8).fill('U'));
  assert.deepEqual(ringFor({ state: 'inspect', inspectElapsed: 7000 }), ['U', 'U', 'U', 'U', 'U', N, N, N]);
  assert.deepEqual(ringFor({ state: 'inspect', inspectElapsed: 9000 }), ['amber', 'amber', 'amber', 'amber', N, N, N, N]);
  assert.deepEqual(ringFor({ state: 'inspect', inspectElapsed: 13000 }), ['orange', 'orange', N, N, N, N, N, N]);
  assert.deepEqual(ringFor({ state: 'inspect', inspectElapsed: 16000 }), ['amber', 'amber', N, N, N, N, N, N]);
  assert.deepEqual(ringFor({ state: 'inspect', inspectElapsed: 18000 }), ['red', N, 'red', N, 'red', N, 'red', N]);
});

test('anel armando enche de vermelho; pronto fica todo verde; resolvendo apaga', () => {
  assert.deepEqual(ringFor({ state: 'arming', armProgress: 0.5 }), ['red', 'red', 'red', 'red', N, N, N, N]);
  assert.deepEqual(ringFor({ state: 'ready' }), Array(8).fill('green'));
  assert.deepEqual(ringFor({ state: 'running' }), Array(8).fill(N));
});

test('anel e olhos da reação ao resultado', () => {
  assert.deepEqual(ringFor({ state: 'reaction', result: 'pb' }), ['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F']);
  assert.deepEqual(ringFor({ state: 'reaction', result: 'good' }), ['green', 'green', 'green', 'green', 'green', 'green', N, N]);
  assert.deepEqual(ringFor({ state: 'reaction', result: 'slow' }), ['amber', 'amber', 'amber', N, N, N, N, N]);
  assert.deepEqual(ringFor({ state: 'reaction', result: 'plus2' }), ['amber', 'amber', N, N, N, N, N, N]);
  assert.deepEqual(ringFor({ state: 'reaction', result: 'dnf' }), ['red', N, 'red', N, 'red', N, 'red', N]);
  assert.equal(eyesFor({ state: 'reaction', result: 'pb' }), 'happy');
  assert.equal(eyesFor({ state: 'reaction', result: 'dnf' }), 'half');
  assert.equal(eyesFor({ state: 'reaction', result: 'good' }), 'open');
});

test('olhos por estado', () => {
  assert.equal(eyesFor({ state: 'idle' }), 'open');
  assert.equal(eyesFor({ state: 'arming' }), 'half');
  assert.equal(eyesFor({ state: 'ready' }), 'focus');
  assert.equal(eyesFor({ state: 'running' }), 'focus');
  assert.equal(eyesFor({ state: 'sleep' }), 'sleep');
  assert.deepEqual(ringFor({ state: 'sleep' }), ['sleep', N, 'sleep', N, 'sleep', N, 'sleep', N]);
});

test('renderCentro pinta o anel, mostra só os olhos pedidos e acende a evolução', () => {
  const svg = renderCentro({ theme: 'light', ring: ['red', N, N, N, N, N, N, N], eyes: 'half', topLit: 6, sideLit: 4 });
  assert.equal((svg.match(/class="ring/g) || []).length, 8);
  assert.match(svg, /class="ring lit" data-k="0"/);
  assert.match(svg, /data-e="half" opacity="1"/);
  assert.match(svg, /data-e="open" opacity="0"/);
  const gold = PALETTES.light.gold;
  const trail = PALETTES.light.trail;
  assert.equal(svg.split(`fill="${gold}"`).length - 1, 6);
  assert.equal(svg.split(`fill="${trail}"`).length - 1, 4);
});

test('acabamentos mudam o corpo; o tema escuro tem brilho nos adesivos acesos', () => {
  assert.equal(paletteFor('light', 'gelo').body, '#9FC3D6');
  assert.match(renderCentro({ finish: 'carbono' }), /fill="url\(#ct\d+c\)"/);
  assert.match(renderCentro({ finish: 'brilho' }), /fill="url\(#ct\d+g\)"/);
  assert.match(renderCentro({ theme: 'dark', ring: Array(8).fill('green') }), /drop-shadow\(0 0 2.2px/);
  assert.doesNotMatch(renderCentro({ theme: 'light', ring: Array(8).fill('green') }), /drop-shadow/);
});

function stubSvg(theme) {
  const mk = (data) => {
    const el = { dataset: data, attrs: {}, style: {}, cls: new Set() };
    el.setAttribute = (n, v) => { el.attrs[n] = v; };
    el.classList = { toggle: (c, on) => (on ? el.cls.add(c) : el.cls.delete(c)) };
    return el;
  };
  const rings = Array.from({ length: 8 }, (_, k) => mk({ k: String(k) }));
  const eyes = ['open', 'half', 'focus', 'happy', 'sleep'].map((e) => mk({ e }));
  return { dataset: { theme, finish: 'fosco' }, rings, eyes, querySelectorAll: (sel) => (sel === '.ring' ? rings : sel === '.eyes' ? eyes : []) };
}

test('updateCentro usa o tema do próprio SVG e pinta anel e olhos', () => {
  const svg = stubSvg('dark');
  updateCentro(svg, { ring: ['green', N, N, N, N, N, N, N], eyes: 'focus' });
  assert.equal(svg.rings[0].attrs.fill, PALETTES.dark.green);
  assert.match(svg.rings[0].style.filter, /drop-shadow\(0 0 2.2px/);
  assert.ok(svg.rings[0].cls.has('lit'));
  assert.equal(svg.rings[1].attrs.fill, PALETTES.dark.off);
  assert.equal(svg.dataset.eyes, 'focus');
  assert.equal(svg.eyes.find((g) => g.dataset.e === 'focus').attrs.opacity, '1');
  assert.equal(svg.eyes.find((g) => g.dataset.e === 'open').attrs.opacity, '0');
  assert.match(renderCentro({ theme: 'dark' }), /data-theme="dark"/);
});

test('na inspeção, depois de 15 s os olhos ficam semicerrados', () => {
  assert.equal(eyesFor({ state: 'inspect', inspectElapsed: 9000 }), 'open');
  assert.equal(eyesFor({ state: 'inspect', inspectElapsed: 16000 }), 'half');
  assert.equal(eyesFor({ state: 'inspect', inspectElapsed: 18000 }), 'half');
});
