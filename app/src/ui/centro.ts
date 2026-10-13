// O Centro: cubo 3×3 em projeção cabinet. A frente é o rosto (adesivo central) e o anel (8 adesivos).
// renderCentro gera o SVG; paintRing, paintFace e paintTop mexem só em atributos de um SVG já renderizado (o animador usa os três;
// updateCentro troca na hora, para o tour). Os olhos são caminhos paramétricos (centro/face.ts).
// Porte de prototype/scripts/centro.js.
import type { ResultKind } from '../core/stats';
import type { FinishId } from '../core/types';
import { T } from '../strings';
import { EXPRESSIONS, EYE_X, type Eyes, eyePath, type Face } from './centro/face';
import { escapeHtml } from './format';

export type CentroTheme = 'light' | 'dark';
// Cor de um adesivo do anel, pelo nome na paleta: U, R, F, D, L e B são as cores do cubo; as outras são de estado.
export type RingKey = 'U' | 'R' | 'F' | 'D' | 'L' | 'B' | 'idle' | 'sleep' | 'red' | 'green' | 'amber' | 'orange';
// 8 posições no sentido horário (ver RING_ORDER); null é um adesivo apagado.
export type Ring = (RingKey | null)[];
export type { Eyes } from './centro/face';
export type CentroState = 'idle' | 'sleep' | 'inspect' | 'arming' | 'ready' | 'running' | 'reaction';

// O que a tela sabe agora; cada estado lê só o campo que lhe interessa.
export interface CentroView {
  state: CentroState;
  orbit?: number | null; // parado: contador da órbita, o adesivo aceso é orbit % 8
  inspectElapsed?: number; // inspeção: ms desde o começo
  armProgress?: number; // armando: 0 a 1
  result?: ResultKind; // reação: como foi o solve
}

export interface Palette {
  body: string;
  off: string;
  face: string;
  eye: string;
  U: string;
  R: string;
  F: string;
  D: string;
  L: string;
  B: string;
  idle: string;
  sleep: string;
  red: string;
  green: string;
  amber: string;
  orange: string;
  gold: string; // face de cima: os marcos
  trail: string; // face lateral: a trilha
  glow: number; // raio do brilho dos adesivos acesos, 0 = sem brilho
}

// O que um acabamento muda na paleta e no desenho.
export interface FinishSpec {
  gloss?: boolean;
  carbon?: boolean;
  body?: string;
  off?: string;
  bodyOpacity?: number;
}

export const RING_ORDER: readonly number[] = Object.freeze([0, 1, 2, 5, 8, 7, 6, 3]); // posição k no anel → índice do adesivo

export const PALETTES: Readonly<Record<CentroTheme, Readonly<Palette>>> = Object.freeze({
  light: Object.freeze({ body: '#1B1B1E', off: '#2E2E33', face: '#F4F1EA', eye: '#1B1B1E', U: '#F4F1EA', R: '#E5484D', F: '#30A46C', D: '#F5C842', L: '#F07A2B', B: '#3E63DD', idle: '#8A857B', sleep: '#5B7BE0', red: '#E5484D', green: '#30A46C', amber: '#F5A524', orange: '#F07A2B', gold: '#D9A21B', trail: '#3E63DD', glow: 0 }),
  dark: Object.freeze({ body: '#0A0A0B', off: '#232326', face: '#EDEAE3', eye: '#0A0A0B', U: '#EDEAE3', R: '#FF5A5F', F: '#3DD68C', D: '#FFD54A', L: '#FF8A3D', B: '#4C6FE8', idle: '#6F6B64', sleep: '#6E8BFF', red: '#FF5A5F', green: '#3DD68C', amber: '#FFB224', orange: '#FF8A3D', gold: '#F0B84C', trail: '#4C6FE8', glow: 2.2 }),
});

export const FINISHES: Readonly<Record<FinishId, Readonly<FinishSpec>>> = Object.freeze({
  fosco: Object.freeze({}),
  brilho: Object.freeze({ gloss: true }),
  gelo: Object.freeze({ body: '#9FC3D6', off: '#D8E8F0', bodyOpacity: 0.55 }),
  carbono: Object.freeze({ carbon: true, off: '#2A2A2A' }),
});

const PB_RING: Ring = ['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F'];
const empty = (): Ring => Array<RingKey | null>(8).fill(null);
const corners = (color: RingKey): Ring => empty().map((_, k) => (k % 2 === 0 ? color : null));
const first = (n: number, color: RingKey): Ring => empty().map((_, k) => (k < n ? color : null));

function inspectRing(e: number): Ring {
  if (e > 17000) return corners('red');
  if (e > 15000) return first(2, 'amber');
  const lit = Math.ceil((1 - e / 15000) * 8);
  return first(lit, e < 8000 ? 'U' : e < 12000 ? 'amber' : 'orange');
}

function resultRing(kind: ResultKind | undefined): Ring {
  if (kind === 'dnf') return corners('red');
  if (kind === 'plus2') return first(2, 'amber');
  if (kind === 'pb') return [...PB_RING];
  if (kind === 'good') return first(6, 'green');
  return first(3, 'amber');
}

export function ringFor(view: CentroView): Ring {
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

export function eyesFor(view: CentroView): Eyes {
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

// Tema e acabamento chegam também como texto solto (o dataset do SVG, um perfil lido do banco): o que não for conhecido cai em claro e fosco.
const themeOf = (theme: string | undefined): CentroTheme => (theme === 'dark' ? 'dark' : 'light');
const finishOf = (finish: string | undefined): FinishId => (finish !== undefined && Object.hasOwn(FINISHES, finish) ? (finish as FinishId) : 'fosco');

export function paletteFor(theme?: string, finish?: string): Palette {
  const f = FINISHES[finishOf(finish)];
  return { ...PALETTES[themeOf(theme)], ...(f.body ? { body: f.body } : {}), ...(f.off ? { off: f.off } : {}) };
}

const cell = (i: number): [number, number] => [(i % 3) * 33.333 + 3.2, Math.floor(i / 3) * 33.333 + 3.2];
const glowStyle = (p: Palette, color: string): string => (p.glow ? ` style="filter:drop-shadow(0 0 ${p.glow}px ${color})"` : '');
// Cor e brilho de um adesivo do anel (usado no render e na atualização).
function ringPaint(p: Palette, key: RingKey | null | undefined): { color: string; filter: string } {
  const color = key ? p[key] : p.off;
  return { color, filter: key && p.glow ? `drop-shadow(0 0 ${p.glow}px ${color})` : '' };
}
let uid = 0;

export interface RenderOptions {
  theme?: CentroTheme;
  ring?: Ring;
  eyes?: Eyes;
  topLit?: number; // adesivos acesos na face de cima (marcos)
  sideLit?: number; // adesivos acesos na face lateral (trilha)
  finish?: FinishId;
  label?: string; // nome acessível do SVG
}

export function renderCentro({ theme = 'light', ring = empty(), eyes = 'open', topLit = 0, sideLit = 0, finish = 'fosco', label = T.centro.label }: RenderOptions = {}): string {
  const p = paletteFor(theme, finish);
  const finishId = finishOf(finish);
  const f = FINISHES[finishId];
  const id = `ct${++uid}`;
  const rect = (i: number, fill: string, extra = ''): string => {
    const [x, y] = cell(i);
    return `<rect${extra} x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="26.9" height="26.9" rx="5" fill="${fill}"/>`;
  };
  const gloss = (i: number): string => (f.gloss ? rect(i, `url(#${id}g)`) : '');
  const face = (cls: 'top' | 'side', transform: string, lit: number, color: 'gold' | 'trail'): string => {
    let s = `<g class="${cls}" transform="${transform}">`;
    for (let i = 0; i < 9; i++) s += rect(i, i < lit ? p[color] : p.off, i < lit ? ` class="lit"${glowStyle(p, p[color])}` : '') + gloss(i);
    return `${s}</g>`;
  };
  let s = `<svg class="centro" viewBox="-9 -9 148 148" role="img" aria-label="${escapeHtml(label)}" data-finish="${finishId}" data-theme="${themeOf(theme)}" data-eyes="${eyes}">`;
  s += `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  s += `<pattern id="${id}c" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#151515"/><rect width="3" height="6" fill="#222"/></pattern></defs>`;
  s += '<g class="cbody">';
  s += `<polygon class="body" points="0,30 30,0 130,0 130,100 100,130 0,130" fill="${f.carbon ? `url(#${id}c)` : p.body}" stroke="${p.body}" stroke-width="14" stroke-linejoin="round"${f.bodyOpacity ? ` opacity="${f.bodyOpacity}"` : ''}/>`;
  s += face('top', 'matrix(1,0,0.3,-0.3,0,30)', topLit, 'gold');
  s += face('side', 'matrix(0.3,-0.3,0,1,100,30)', sideLit, 'trail');
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
  const look = EXPRESSIONS[eyes];
  s += `<path class="eye" data-side="l" d="${eyePath(look, EYE_X.l)}" fill="${p.eye}"/>`;
  s += `<path class="eye" data-side="r" d="${eyePath(look, EYE_X.r)}" fill="${p.eye}"/>`;
  return `${s}</g></g></svg>`;
}

export interface UpdateOptions {
  ring?: Ring;
  eyes?: Eyes;
  theme?: CentroTheme;
  finish?: FinishId;
}

// Pinta o anel de um SVG do Centro já no DOM. Tema e acabamento vêm do próprio SVG quando omitidos.
export function paintRing(svg: SVGElement, ring: Ring, theme: string | undefined = svg.dataset.theme, finish: string | undefined = svg.dataset.finish): void {
  const p = paletteFor(theme, finish);
  svg.querySelectorAll<SVGElement>('.ring').forEach((r) => {
    const key = ring[Number(r.dataset.k)];
    const { color, filter } = ringPaint(p, key);
    r.setAttribute('fill', color);
    r.classList.toggle('lit', Boolean(key));
    r.style.filter = filter;
  });
}

// Escreve o rosto: os dois olhos e o corpo (salto `lift` em unidades para cima e o squash pela base). Sem salto e sem squash, o
// corpo fica sem transform.
export function paintFace(svg: SVGElement, face: Face, lift = 0): void {
  svg.querySelectorAll<SVGPathElement>('path.eye').forEach((eye) => {
    eye.setAttribute('d', eyePath(face, eye.dataset.side === 'r' ? EYE_X.r : EYE_X.l));
  });
  const body = svg.querySelector<SVGGElement>('g.cbody');
  if (!body) return;
  if (lift === 0 && face.squash === 1) body.removeAttribute('transform');
  else body.setAttribute('transform', `translate(0 ${(-lift).toFixed(2)}) translate(0 130) scale(1 ${face.squash.toFixed(3)}) translate(0 -130)`);
}

// A piscada da face de cima no fim da temporada: dim 0 é a face normal; 0,7 deixa 30% de opacidade.
export function paintTop(svg: SVGElement, dim: number): void {
  const top = svg.querySelector<SVGGElement>('g.top');
  if (top) top.style.opacity = dim > 0 ? String(Number((1 - dim).toFixed(3))) : '';
}

// O anel e a expressão que um estado pede.
export function centroTarget(view: CentroView): { ring: Ring; eyes: Eyes } {
  return { ring: ringFor(view), eyes: eyesFor(view) };
}

// Atualiza anel e olhos de um <svg class="centro"> já no DOM, na hora, sem animação (o tour usa assim).
export function updateCentro(svg: SVGElement | null | undefined, opts: UpdateOptions = {}): void {
  if (!svg) return;
  const { ring = empty(), eyes = 'open', theme = svg.dataset.theme, finish = svg.dataset.finish } = opts;
  paintRing(svg, ring, theme, finish);
  paintFace(svg, EXPRESSIONS[eyes]);
  svg.dataset.eyes = eyes;
}
