// O treino de algoritmos (spec 7): o nível de cada caso pelo histórico, o peso no sorteio, o próximo caso e o embaralhamento. Puro: as
// tentativas e o sorteio chegam por parâmetro, então os testes repetem tudo igual. Nada guarda nível: ele sai sempre das tentativas.
import type { Practice } from '../types';
import { casesOf } from './cases';
import { AUF, invertAlg, tidyAlg } from './frame';
import type { CaseSet, TrainCase } from './types';

export const MAX_LEVEL = 4;
export type LevelName = 'novo' | 'aprendendo' | 'firme' | 'dominado';

// Tentativa que conta para o tempo: certa e sem ajuda (com ajuda, o tempo não diz nada).
const clean = (a: Practice): boolean => a.ok && !a.helped;
const byTime = (a: Practice, b: Practice): number => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// As tentativas de cada caso, em ordem de tempo.
export function byCase(practice: readonly Practice[]): Map<string, Practice[]> {
  const out = new Map<string, Practice[]>();
  for (const a of [...practice].sort(byTime)) {
    const list = out.get(a.caseId);
    if (list) list.push(a);
    else out.set(a.caseId, [a]);
  }
  return out;
}

// O nível (0 a 4) pelas tentativas em ordem de tempo: acertar sem ajuda sobe 1; errar ou usar a ajuda volta a 0. null: nunca tentado.
export function levelOf(attempts: readonly Practice[]): number | null {
  let level: number | null = null;
  for (const a of attempts) level = clean(a) ? Math.min(MAX_LEVEL, (level ?? 0) + 1) : 0;
  return level;
}

export const levelName = (level: number | null): LevelName =>
  level === null ? 'novo' : level <= 1 ? 'aprendendo' : level <= 3 ? 'firme' : 'dominado';

export interface CaseStats {
  id: string;
  level: number | null;
  attempts: number;
  okRate: number | null; // 0 a 1; null sem tentativa
  avg5: number | null; // média das últimas 5 certas sem ajuda, em ms
  best: number | null; // o melhor tempo certo sem ajuda
}

export function caseStats(id: string, attempts: readonly Practice[]): CaseStats {
  const good = attempts.filter(clean);
  const last5 = good.slice(-5);
  return {
    id,
    level: levelOf(attempts),
    attempts: attempts.length,
    okRate: attempts.length > 0 ? attempts.filter((a) => a.ok).length / attempts.length : null,
    avg5: last5.length > 0 ? Math.round(last5.reduce((sum, a) => sum + a.ms, 0) / last5.length) : null,
    best: good.length > 0 ? Math.min(...good.map((a) => a.ms)) : null,
  };
}

// Os números de cada caso do conjunto, na ordem da aula.
export function setStats(set: CaseSet, practice: readonly Practice[]): CaseStats[] {
  const groups = byCase(practice);
  return casesOf(set).map((c) => caseStats(c.id, groups.get(c.id) ?? []));
}

// "Firme" conta os casos de nível 2 para cima (spec 7.1).
export const firmCount = (stats: readonly CaseStats[]): number => stats.filter((s) => s.level !== null && s.level >= 2).length;

// Do mais fraco ao mais firme (spec 7.4): o novo primeiro, depois o nível; no empate, o mais lento; depois a ordem da aula.
export function weakestFirst(stats: readonly CaseStats[]): CaseStats[] {
  const rank = (s: CaseStats): number => (s.level === null ? -1 : s.level);
  return [...stats].sort((a, b) => rank(a) - rank(b) || (b.avg5 ?? 0) - (a.avg5 ?? 0));
}

// A média do conjunto: a das médias de 5 dos casos que têm uma (cada caso pesa igual). null: nenhum caso tem.
export function setAverage(stats: readonly CaseStats[]): number | null {
  const avgs = stats.map((s) => s.avg5).filter((v): v is number => v !== null);
  return avgs.length > 0 ? avgs.reduce((sum, v) => sum + v, 0) / avgs.length : null;
}

// O peso no sorteio (spec 7.3): 16 ÷ 2^nível, dobrado se a média das últimas 5 certas passa de 1,25 vez a média do conjunto.
export function weightOf(s: CaseStats, setAvg: number | null): number {
  const base = 16 / 2 ** (s.level ?? 0);
  return s.avg5 !== null && setAvg !== null && s.avg5 > 1.25 * setAvg ? base * 2 : base;
}

// O próximo caso (spec 7.3), entre os do conjunto que não estão fora do sorteio: os nunca tentados primeiro, na ordem da aula; depois
// pelo peso. O mesmo caso nunca sai duas vezes seguidas, a não ser que ele seja o único. null: todos fora do sorteio.
export function nextCase(o: {
  set: CaseSet;
  practice: readonly Practice[];
  off: readonly string[];
  last: string | null;
  rng: () => number;
}): TrainCase | null {
  const pool = casesOf(o.set).filter((c) => !o.off.includes(c.id));
  if (pool.length === 0) return null;
  const candidates = pool.length > 1 ? pool.filter((c) => c.id !== o.last) : pool;
  const groups = byCase(o.practice);
  const fresh = candidates.find((c) => !groups.has(c.id));
  if (fresh) return fresh;
  const avg = setAverage(setStats(o.set, o.practice));
  const weights = candidates.map((c) => weightOf(caseStats(c.id, groups.get(c.id) ?? []), avg));
  let r = o.rng() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// O embaralhamento do caso (spec 5.5): um giro de cima, o inverso do algoritmo escolhido e outro giro de cima, sempre a partir do
// resolvido com amarelo em cima e verde na frente. Os giros saem do sorteio dado.
export function caseScramble(alg: string, rng: () => number): string {
  const auf = (): string => AUF[Math.min(AUF.length - 1, Math.floor(rng() * AUF.length))];
  const pre = auf();
  const post = auf();
  return tidyAlg(`${pre} ${invertAlg(alg)} ${post}`);
}
