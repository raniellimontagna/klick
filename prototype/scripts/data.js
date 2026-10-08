// Base fictícia de solves para o protótipo. Determinística a partir de "agora".
import { SCRAMBLES } from './scrambles.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scrambleAt(i) {
  const n = SCRAMBLES.length;
  return SCRAMBLES[((i % n) + n) % n];
}

// [dias atrás, quantidade]. Blocos de no máximo 4 dias seguidos (nenhum chega a 7) e
// os últimos 4 dias seguidos até hoje, com o dia 4 vazio. Total: 212.
const PLAN = [
  [24, 10], [23, 11], [21, 9], [20, 12], [18, 10], [17, 11], [15, 12], [14, 10], [13, 11],
  [11, 12], [10, 10], [9, 13], [8, 11], [6, 12], [5, 10], [3, 12], [2, 13], [1, 11], [0, 12],
];

export const SEED_SESSION = Object.freeze({ id: 's12', name: 'Sessão 12' });

export function buildSeed(nowTs) {
  const rand = mulberry32(20261008);
  const total = PLAN.reduce((a, [, c]) => a + c, 0);
  const solves = [];
  let i = 0;
  const startOfDay = new Date(nowTs).setHours(0, 0, 0, 0);
  for (const [ago, count] of PLAN) {
    const day = new Date(nowTs);
    day.setDate(day.getDate() - ago);
    day.setHours(19, 0, 0, 0);
    for (let j = 0; j < count; j++) {
      // Hoje: espaçamento de 2,5 min, encolhido perto da meia-noite para os solves não caírem em ontem.
      const spacing = ago === 0 ? Math.max(1, Math.min(150000, Math.floor((nowTs - startOfDay) / (count + 1)))) : 150000;
      const at = ago === 0 ? nowTs - (count - j) * spacing : day.getTime() + j * spacing;
      const p = i / (total - 1);
      const base = 92000 - 26000 * p;
      let ms = Math.round((base + (rand() - 0.5) * 14000) / 10) * 10;
      ms = Math.max(ms, 59000);
      let penalty = null;
      if (ago === 3 && j === 5) ms = 54100;
      if (ago === 9 && j === 3) penalty = '+2';
      if (ago === 6 && j === 7) penalty = 'DNF';
      solves.push({ id: i + 1, ms, penalty, at, scramble: scrambleAt(i), note: '', session: SEED_SESSION.id });
      i++;
    }
  }
  return { sessions: [{ ...SEED_SESSION }], solves };
}
