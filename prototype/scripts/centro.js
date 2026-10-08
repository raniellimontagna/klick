// O Centro: cubo 3×3 em projeção cabinet. A frente é o rosto (adesivo central) e o anel (8 adesivos).
// Funções puras geram o SVG; updateCentro() só mexe em atributos de um SVG já renderizado.
export const RING_ORDER = Object.freeze([0, 1, 2, 5, 8, 7, 6, 3]); // posição k no anel → índice do adesivo

export const PALETTES = Object.freeze({
  light: { body: '#1B1B1E', off: '#2E2E33', face: '#F4F1EA', eye: '#1B1B1E', U: '#F4F1EA', R: '#E5484D', F: '#30A46C', D: '#F5C842', L: '#F07A2B', B: '#3E63DD', idle: '#8A857B', sleep: '#5B7BE0', red: '#E5484D', green: '#30A46C', amber: '#F5A524', orange: '#F07A2B', gold: '#D9A21B', trail: '#3E63DD', glow: 0 },
  dark: { body: '#0A0A0B', off: '#232326', face: '#EDEAE3', eye: '#0A0A0B', U: '#EDEAE3', R: '#FF5A5F', F: '#3DD68C', D: '#FFD54A', L: '#FF8A3D', B: '#4C6FE8', idle: '#6F6B64', sleep: '#6E8BFF', red: '#FF5A5F', green: '#3DD68C', amber: '#FFB224', orange: '#FF8A3D', gold: '#F0B84C', trail: '#4C6FE8', glow: 2.2 },
});

export const FINISHES = Object.freeze({
  fosco: {},
  brilho: { gloss: true },
  gelo: { body: '#9FC3D6', off: '#D8E8F0', bodyOpacity: 0.55 },
  carbono: { carbon: true, off: '#2A2A2A' },
});

const PB_RING = ['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F'];
const empty = () => Array(8).fill(null);
const corners = (color) => empty().map((_, k) => (k % 2 === 0 ? color : null));
const first = (n, color) => empty().map((_, k) => (k < n ? color : null));

function inspectRing(e) {
  if (e > 17000) return corners('red');
  if (e > 15000) return first(2, 'amber');
  const lit = Math.ceil((1 - e / 15000) * 8);
  return first(lit, e < 8000 ? 'U' : e < 12000 ? 'amber' : 'orange');
}

function resultRing(kind) {
  if (kind === 'dnf') return corners('red');
  if (kind === 'plus2') return first(2, 'amber');
  if (kind === 'pb') return [...PB_RING];
  if (kind === 'good') return first(6, 'green');
  return first(3, 'amber');
}

// view.state: 'idle' | 'sleep' | 'inspect' | 'arming' | 'ready' | 'running' | 'reaction'
export function ringFor(view) {
  switch (view.state) {
    case 'sleep':
      return corners('sleep');
    case 'idle': {
      const r = empty();
      if (view.orbit !== null && view.orbit !== undefined) r[view.orbit % 8] = 'idle';
      return r;
    }
    case 'inspect':
      return inspectRing(view.inspectElapsed || 0);
    case 'arming':
      return first(Math.min(8, Math.ceil((view.armProgress || 0) * 8)), 'red');
    case 'ready':
      return empty().fill('green');
    case 'reaction':
      return resultRing(view.result);
    default:
      return empty();
  }
}

export function eyesFor(view) {
  switch (view.state) {
    case 'sleep':
      return 'sleep';
    case 'arming':
      return 'half';
    case 'ready':
    case 'running':
      return 'focus';
    case 'reaction':
      if (view.result === 'pb') return 'happy';
      return view.result === 'dnf' || view.result === 'plus2' ? 'half' : 'open';
    case 'inspect':
      return (view.inspectElapsed || 0) > 15000 ? 'half' : 'open';
    default:
      return 'open';
  }
}

export function paletteFor(theme, finish) {
  const f = FINISHES[finish] || FINISHES.fosco;
  return { ...PALETTES[theme === 'dark' ? 'dark' : 'light'], ...(f.body ? { body: f.body } : {}), ...(f.off ? { off: f.off } : {}) };
}

const cell = (i) => [(i % 3) * 33.333 + 3.2, Math.floor(i / 3) * 33.333 + 3.2];
const glowStyle = (p, color) => (p.glow ? ` style="filter:drop-shadow(0 0 ${p.glow}px ${color})"` : '');
// Cor e brilho de um adesivo do anel (usado no render e na atualização).
function ringPaint(p, key) {
  const color = key ? p[key] : p.off;
  return { color, filter: key && p.glow ? `drop-shadow(0 0 ${p.glow}px ${color})` : '' };
}
let uid = 0;

export function renderCentro({ theme = 'light', ring = empty(), eyes = 'open', topLit = 0, sideLit = 0, finish = 'fosco', label = 'Centro' } = {}) {
  const p = paletteFor(theme, finish);
  const f = FINISHES[finish] || FINISHES.fosco;
  const id = `ct${++uid}`;
  const rect = (i, fill, extra = '') => {
    const [x, y] = cell(i);
    return `<rect${extra} x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="26.9" height="26.9" rx="5" fill="${fill}"/>`;
  };
  const gloss = (i) => (f.gloss ? rect(i, `url(#${id}g)`) : '');
  const face = (transform, lit, color) => {
    let s = `<g transform="${transform}">`;
    for (let i = 0; i < 9; i++) s += rect(i, i < lit ? p[color] : p.off, i < lit ? ` class="lit"${glowStyle(p, p[color])}` : '') + gloss(i);
    return `${s}</g>`;
  };
  let s = `<svg class="centro" viewBox="-9 -9 148 148" role="img" aria-label="${label}" data-finish="${finish}" data-theme="${theme === 'dark' ? 'dark' : 'light'}" data-eyes="${eyes}">`;
  s += `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  s += `<pattern id="${id}c" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#151515"/><rect width="3" height="6" fill="#222"/></pattern></defs>`;
  s += `<polygon class="body" points="0,30 30,0 130,0 130,100 100,130 0,130" fill="${f.carbon ? `url(#${id}c)` : p.body}" stroke="${p.body}" stroke-width="14" stroke-linejoin="round"${f.bodyOpacity ? ` opacity="${f.bodyOpacity}"` : ''}/>`;
  s += face('matrix(1,0,0.3,-0.3,0,30)', topLit, 'gold');
  s += face('matrix(0.3,-0.3,0,1,100,30)', sideLit, 'trail');
  s += '<g transform="translate(0 30)">';
  for (let i = 0; i < 9; i++) {
    if (i === 4) {
      s += rect(4, p.face) + gloss(4);
      continue;
    }
    const k = RING_ORDER.indexOf(i);
    const key = ring[k];
    const { color, filter } = ringPaint(p, key);
    s += rect(i, color, ` class="ring${key ? ' lit' : ''}" data-k="${k}"${filter ? ` style="filter:${filter}"` : ''}`) + gloss(i);
  }
  const vis = (name) => `class="eyes" data-e="${name}" opacity="${eyes === name ? 1 : 0}"`;
  const stroke = `fill="none" stroke="${p.eye}" stroke-width="2.6" stroke-linecap="round"`;
  s += `<g ${vis('open')}><rect class="eye" x="41.6" y="42.5" width="6.4" height="12" rx="3.2" fill="${p.eye}"/><rect class="eye" x="52" y="42.5" width="6.4" height="12" rx="3.2" fill="${p.eye}"/></g>`;
  s += `<g ${vis('half')}><rect x="41.6" y="46" width="6.4" height="6.5" rx="3" fill="${p.eye}"/><rect x="52" y="46" width="6.4" height="6.5" rx="3" fill="${p.eye}"/></g>`;
  s += `<g ${vis('focus')}><path d="M41.4 49.5 h6.8 M51.8 49.5 h6.8" ${stroke}/></g>`;
  s += `<g ${vis('happy')}><path d="M41.4 51 q3.4 -5.6 6.8 0 M51.8 51 q3.4 -5.6 6.8 0" ${stroke}/></g>`;
  s += `<g ${vis('sleep')}><path d="M41.4 49 q3.4 3.4 6.8 0 M51.8 49 q3.4 3.4 6.8 0" ${stroke}/></g>`;
  return `${s}</g></svg>`;
}

// Atualiza anel e olhos de um <svg class="centro"> já no DOM, sem recriar (deixa as transições do CSS agirem).
// Tema e acabamento vêm do próprio SVG quando omitidos; trocar tema ou acabamento pede renderCentro de novo.
export function updateCentro(svg, opts = {}) {
  if (!svg) return;
  const { ring = empty(), eyes = 'open', theme = svg.dataset.theme, finish = svg.dataset.finish } = opts;
  const p = paletteFor(theme, finish);
  svg.querySelectorAll('.ring').forEach((r) => {
    const key = ring[Number(r.dataset.k)];
    const { color, filter } = ringPaint(p, key);
    r.setAttribute('fill', color);
    r.classList.toggle('lit', Boolean(key));
    r.style.filter = filter;
  });
  svg.dataset.eyes = eyes;
  svg.querySelectorAll('.eyes').forEach((g) => g.setAttribute('opacity', g.dataset.e === eyes ? '1' : '0'));
}
