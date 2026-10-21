// As metas da pessoa: "single abaixo de 11 s", "média de 12 abaixo de 13 s". Puro: a validação do que vem do perfil e do sync, o texto do
// alvo (digitar e mostrar), o alcance e o estado de cada meta. Alcançar é ficar abaixo do alvo (valor < targetMs); ao5 e ao12 são sempre as
// médias com corte de 5% sobre os solves do evento, em ordem cronológica.
import { T } from '../strings';
import { EVENT_IDS } from './events';
import { bestAverage, bestSingle, effectiveMs, rollingAverages } from './stats';
import type { EventId, Solve } from './types';

export type GoalKind = 'single' | 'ao5' | 'ao12';

export interface Goal {
  kind: GoalKind;
  event: EventId;
  targetMs: number;
  startMs: number | null; // o melhor da época em que a meta nasceu (null: ainda sem tempo)
  createdAt: number;
  reachedAt: number | null; // a data em que passou a valer como alcançada; não volta atrás
}

export const GOAL_MAX = 6; // metas vivas no app (o servidor aceita qualquer número de vagas válidas)
export const GOAL_ID = /^[0-9a-z]{3}$/; // 46.656 vagas: dois aparelhos que criam ao mesmo tempo quase nunca sorteiam a mesma
export const GOAL_TARGET_MAX = 3_599_999; // 59:59.999, abaixo de uma hora

const KINDS: readonly GoalKind[] = ['single', 'ao5', 'ao12'];
const KEYS = ['kind', 'event', 'targetMs', 'startMs', 'createdAt', 'reachedAt'];
const AVERAGE_SIZE = { ao5: 5, ao12: 12 } as const;

const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

// Estrito: exatamente as seis chaves, cada uma no seu formato. O que vem do perfil, do sync e da cópia passa por aqui.
export function isGoal(v: unknown): v is Goal {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== KEYS.length || !KEYS.every((k) => k in o)) return false;
  return (
    KINDS.includes(o.kind as GoalKind) &&
    EVENT_IDS.includes(o.event as EventId) &&
    isInt(o.targetMs, 1, GOAL_TARGET_MAX) &&
    (o.startMs === null || isInt(o.startMs, 1)) &&
    isInt(o.createdAt, 0) &&
    (o.reachedAt === null || isInt(o.reachedAt, 0))
  );
}

// As metas de um perfil de fora (o arquivo, a cópia): só as de vaga e valor válidos, o resto fica de fora. undefined quando o campo não é um
// objeto (um perfil de antes das metas): quem lê distingue "sem o campo" de "sem metas" ({}).
export function goalsFrom(v: unknown): Record<string, Goal> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([id, g]) => GOAL_ID.test(id) && isGoal(g))) as Record<string, Goal>;
}

const GOAL_SLOTS = 36 ** 3;
const slotId = (n: number): string => n.toString(36).padStart(3, '0');

// Sorteia uma das vagas de 3 caracteres que ninguém tomou. Com as poucas metas de uma conta, o primeiro sorteio quase sempre serve; depois de
// alguns azares (um sorteio viciado), vale a primeira livre na ordem. Sem vaga livre não há o que devolver.
export function freeGoalId(taken: ReadonlySet<string>, rand: () => number = Math.random): string {
  for (let i = 0; i < 32; i++) {
    const id = slotId(Math.min(GOAL_SLOTS - 1, Math.floor(rand() * GOAL_SLOTS)));
    if (!taken.has(id)) return id;
  }
  for (let n = 0; n < GOAL_SLOTS; n++) if (!taken.has(slotId(n))) return slotId(n);
  throw new Error('sem vaga livre para a meta');
}

// Decimais "5" ou "05" em ms: um dígito vale décimos, dois valem centésimos.
const fraction = (digits: string | undefined): number => (digits ? Number.parseInt(digits.padEnd(2, '0'), 10) * 10 : 0);

export type ParsedTarget = { ok: true; ms: number } | { ok: false; reason: 'empty' | 'bad' | 'range' };

// Segundos como se fala: "15", "14,5", "90", "1:30", "1:02.5". Até duas casas; depois do ":" os segundos têm dois dígitos e ficam abaixo de 60.
export function parseGoalTarget(text: string): ParsedTarget {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: false, reason: 'empty' };
  const plain = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  const clock = /^(\d+):(\d{2})(?:\.(\d{1,2}))?$/.exec(t);
  let ms: number;
  if (plain) ms = Number.parseInt(plain[1]!, 10) * 1000 + fraction(plain[2]);
  else if (clock && Number.parseInt(clock[2]!, 10) < 60) ms = (Number.parseInt(clock[1]!, 10) * 60 + Number.parseInt(clock[2]!, 10)) * 1000 + fraction(clock[3]);
  else return { ok: false, reason: 'bad' };
  if (ms === 0) return { ok: false, reason: 'bad' };
  if (ms > GOAL_TARGET_MAX) return { ok: false, reason: 'range' };
  return { ok: true, ms };
}

// O alvo para mostrar: "13 s", "12.5 s", "14.55 s" abaixo de um minuto; "1:00", "1:30", "1:02.5" daí em diante. Centésimos, sem zeros à direita.
export function formatTarget(ms: number): string {
  const cs = Math.floor(ms / 10) % 100;
  const decimals = cs === 0 ? '' : `.${String(cs).padStart(2, '0').replace(/0$/, '')}`;
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}${decimals} s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}${decimals}`;
}

// "Média de 12 abaixo de 13 s"; goalPhrase é a mesma no meio de uma frase ("média de 12 abaixo de 13 s").
export const goalName = (g: Pick<Goal, 'kind' | 'targetMs'>): string => T.metas.below(T.metas.kind[g.kind], formatTarget(g.targetMs));
export function goalPhrase(g: Pick<Goal, 'kind' | 'targetMs'>): string {
  const name = goalName(g);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

// A série da meta, solve a solve: o tempo do solve (single) ou a média que termina nele (null até haver solves para a janela).
function series(eventSolves: readonly Solve[], kind: GoalKind): (number | null)[] {
  const list = [...eventSolves];
  return kind === 'single' ? list.map(effectiveMs) : rollingAverages(list, AVERAGE_SIZE[kind]);
}

// O que as metas de um evento e tipo leem da série, numa passada só (com 100 mil solves, cada passada custa): o melhor valor (sem DNF), o
// primeiro valor finito (o começo de uma meta sem startMs) e o alcance de qualquer alvo.
export interface GoalSeries {
  best: number | null;
  first: number | null;
  reach: (targetMs: number) => number | null; // o `at` do primeiro solve abaixo do alvo
}

export function goalSeries(eventSolves: readonly Solve[], kind: GoalKind): GoalSeries {
  const values = series(eventSolves, kind);
  // Os recordes da série, na ordem: cada valor finito abaixo de todos os de antes. O primeiro solve abaixo de um alvo é sempre um recorde
  // (os de antes dele ficaram acima), então o alcance é o primeiro recorde abaixo do alvo; como eles só descem, a busca é binária.
  const recordValue: number[] = [];
  const recordAt: number[] = [];
  values.forEach((v, i) => {
    if (v === null || !(v < (recordValue[recordValue.length - 1] ?? Infinity))) return;
    recordValue.push(v);
    recordAt.push(eventSolves[i]!.at);
  });
  const reach = (targetMs: number): number | null => {
    let lo = 0;
    let hi = recordValue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (recordValue[mid]! < targetMs) hi = mid;
      else lo = mid + 1;
    }
    return lo < recordValue.length ? recordAt[lo]! : null;
  };
  return { best: recordValue[recordValue.length - 1] ?? null, first: recordValue[0] ?? null, reach };
}

// O melhor valor do tipo (sem DNF), ou null sem tempo válido.
export function goalBest(eventSolves: readonly Solve[], kind: GoalKind): number | null {
  const list = [...eventSolves];
  return kind === 'single' ? bestSingle(list) : bestAverage(list, AVERAGE_SIZE[kind]);
}

// O `at` do primeiro solve cujo valor (o single, ou a média que termina nele) ficou abaixo do alvo. DNF (Infinity) nunca fica.
export function firstReach(eventSolves: readonly Solve[], kind: GoalKind, targetMs: number): number | null {
  const values = series(eventSolves, kind);
  const i = values.findIndex((v) => v !== null && v < targetMs);
  return i < 0 ? null : eventSolves[i]!.at;
}

export interface GoalInput {
  kind: GoalKind;
  event: EventId;
  targetMs: number;
}

// A meta nova: o ponto de partida é o melhor de agora e, se o histórico já passou do alvo, ela nasce alcançada com a data de quem chegou.
export function makeGoal(input: GoalInput, eventSolves: readonly Solve[], now: number): Goal {
  const s = goalSeries(eventSolves, input.kind);
  return {
    kind: input.kind,
    event: input.event,
    targetMs: input.targetMs,
    startMs: s.best,
    createdAt: now,
    reachedAt: s.reach(input.targetMs),
  };
}

// Editar a meta: tipo, evento e alvo iguais não mudam nada; senão ela se refaz pelo histórico e guarda a data em que nasceu.
export function remakeGoal(old: Goal, input: GoalInput, eventSolves: readonly Solve[], now: number): Goal {
  if (old.kind === input.kind && old.event === input.event && old.targetMs === input.targetMs) return old;
  return { ...makeGoal(input, eventSolves, now), createdAt: old.createdAt };
}

export interface GoalStatus {
  best: number | null;
  reachedAt: number | null;
  start: number | null;
  progress: number; // 0 a 1
  left: number | null; // ms que faltam (null sem tempo ou com a meta alcançada)
}

// O estado para mostrar. Alcançada fora deste aparelho (solves do sync ou importados, sem reachedAt na meta) vale pela data do primeiro
// solve que chegou; sem startMs, o começo é o primeiro valor finito da série. `s` é a série do evento e tipo da meta, que as metas iguais
// nisso dividem (o quadro a calcula uma vez por par).
export function goalStatus(goal: Goal, eventSolves: readonly Solve[], s: GoalSeries = goalSeries(eventSolves, goal.kind)): GoalStatus {
  const best = s.best;
  const reachedAt = goal.reachedAt ?? s.reach(goal.targetMs);
  const start = goal.startMs ?? s.first;
  let progress = 0;
  if (reachedAt !== null) progress = 1;
  else if (best !== null && start !== null && start > goal.targetMs) progress = Math.min(1, Math.max(0, (start - best) / (start - goal.targetMs)));
  return { best, reachedAt, start, progress, left: best === null || reachedAt !== null ? null : best - goal.targetMs };
}

export interface GoalReach {
  id: string;
  at: number;
  celebrate: boolean;
}

// As metas do evento que este solve deixou abaixo do alvo e que ainda não tinham reachedAt, na ordem em que nasceram. `history` são os
// solves anteriores do evento do solve. Se o histórico já tinha chegado (veio de fora), a data é a antiga e não comemora; senão é a deste solve.
export function goalsReachedBy(goals: Readonly<Record<string, Goal>>, history: readonly Solve[], solve: Solve): GoalReach[] {
  const out: GoalReach[] = [];
  const now = effectiveMs(solve);
  const live = Object.entries(goals)
    .filter(([, g]) => g.event === solve.event && g.reachedAt === null)
    .sort(([ia, a], [ib, b]) => a.createdAt - b.createdAt || (ia < ib ? -1 : 1));
  for (const [id, g] of live) {
    // O valor depois do solve: só a janela que termina nele conta.
    let value: number | null = now;
    if (g.kind !== 'single') {
      const n = AVERAGE_SIZE[g.kind];
      const window = [...history.slice(-(n - 1)), solve];
      value = window.length < n ? null : rollingAverages(window, n)[n - 1] ?? null;
    }
    if (value === null || !(value < g.targetMs)) continue;
    const before = firstReach(history, g.kind, g.targetMs);
    out.push(before === null ? { id, at: solve.at, celebrate: true } : { id, at: before, celebrate: false });
  }
  return out;
}
