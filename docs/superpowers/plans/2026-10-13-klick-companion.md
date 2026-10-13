# Klick Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Temporadas que acompanham o nível da pessoa (escada adaptada, sem fim, com histórico e acabamentos), um Centro com rosto paramétrico animado sob demanda e um coach com quatro gatilhos novos.

**Architecture:**
- **Núcleo puro em `app/src/core/`.** O novo `core/season.ts` faz a escada, os marcos, a avaliação incremental, a virada e a validação. O `core/coach.ts` ganha os gatilhos novos.
- **Dados em `app/src/data/`.** O repositório grava a temporada no perfil e faz a virada condicional numa transação. Importar e restaurar nunca regridem a temporada.
- **Centro em `app/src/ui/centro/`, em três unidades:**
  - `face.ts` (puro): parâmetros do rosto e caminho dos olhos;
  - `behavior.ts` (puro, com relógio e sorteio injetados): piscar, olhadinha, órbita, respiração, salto e piscada;
  - `animator.ts`: escreve no SVG só quando algo se move.
- **Ligação com o timer.** Um controlador `ui/timer/centro-live.ts` sai do `TimerScreen.svelte`.

**Tech Stack:** Svelte 5 (runes), Vite 8, TypeScript estrito, Vitest + fake-indexeddb + @testing-library/svelte, Playwright, pnpm 11. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-13-klick-companion-design.md`. Leia a seção que a tarefa cita antes de começar.

## Global Constraints

- **Onde rodar:** todo comando roda dentro de `app/` (`cd /Users/raniellimontagna/Projetos/pessoal/klick/app`). A branch é `v2`.
- **Gates:**
  - testes de unidade: `pnpm test` (`vitest run`);
  - tipos: `pnpm check`;
  - e2e: `pnpm test:e2e`, só na Task 13 e na revisão final;
  - com a máquina carregada, use `pnpm test -- --maxWorkers=4`;
  - nunca aumente timeouts para fazer um teste passar.
- **Textos:**
  - todo texto que a pessoa lê fica em `app/src/strings.ts`, em pt-BR;
  - voz calma, sem emoji, sem culpa;
  - nunca dizer que a pessoa perdeu algo.
- **Comentários e testes:**
  - comentários de código em português, no estilo dos que já existem: dizem o porquê e o contrato, não o óbvio;
  - nomes de teste em português.
- **Nada novo de fora:** nenhuma dependência nova e nenhum `@keyframes` novo para o Centro.
- **Regras do Centro (spec 6.4 do sub-projeto 1):**
  - nada anima durante o solve;
  - uma reação por solve: começa 0,4 a 0,6 s depois do tempo e dura no máximo 2,5 s;
  - segurar cancela tudo.
- **Escopo das temporadas:** marcos e temporadas valem só para o 3×3 (`eventInfo(e).milestones`). Contam os solves ativos com `at > startedAt`.
- **Progresso nunca regride:** importar, restaurar ou apagar nunca tira uma temporada fechada nem um acabamento.
- **Commits:**
  - um commit por tarefa (ou mais, se a tarefa pedir), mensagem no estilo `feat(app): …` em português;
  - termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - nunca `git push`, nunca deploy; o controlador cuida disso com o ok do Ranielli.

## Review Focus

1. **Restaurar uma cópia antiga ou sem perfil.** A temporada e o acabamento daqui ficam; nada volta para a T1. Teste na Task 3.
2. **Arquivo do Klick com um acabamento que aqui ainda está bloqueado.** Fica o acabamento daqui. Teste na Task 3.
3. **Apagar (ou desfazer) o solve que acabou de fechar a temporada.** A temporada segue fechada, e a tela mostra a nova sem erro. Teste na Task 4.
4. **Centro oculto.** O Timer completa solve, reação e coach sem SVG na tela. Teste na Task 12.
5. **Movimento reduzido ligado no meio de um salto.** O salto para na hora, o corpo volta ao lugar e não sobra temporizador. Teste na Task 10.

## Mapa de arquivos

| Arquivo | Papel | Tarefas |
|---|---|---|
| `app/src/core/types.ts` | Tipos da temporada; `Profile.season`; `Settings.centro` | 1, 3, 12 |
| `app/src/core/season.ts` (novo) | Escada, marcos, avaliação, virada, validação, rótulos, "perto" | 1, 2, 5, 6 |
| `app/src/core/stats.ts` | Exporta `trimmedMean` e `noon`; sai `createMilestoneTracker` | 2, 6 |
| `app/src/core/coach.ts` | Gatilhos novos e prioridade | 6 |
| `app/src/data/repository.ts` | `season` no perfil, `advanceSeason`, importar e restaurar sem regredir | 3 |
| `app/src/data/transfer.ts` | Valida a temporada e o ajuste `centro` do arquivo | 3, 12 |
| `app/src/ui/state/app.svelte.ts` | `seasonStatus`, `checkSeason` e as chamadas | 3, 4 |
| `app/src/ui/format.ts` | `shortDate`, `fullDate` | 5 |
| `app/src/ui/centro/CentroScreen.svelte` | Temporada, histórico, acabamentos, cartão Centro | 5, 12 |
| `app/src/ui/centro/face.ts` (novo) | Rosto paramétrico | 7 |
| `app/src/ui/centro.ts` | Olhos como `<path>`, corpo em grupo, `paintFace`/`paintRing`/`paintTop` | 8 |
| `app/src/ui/centro/behavior.ts` (novo) | Comportamentos no tempo | 9 |
| `app/src/ui/centro/animator.ts` (novo) | Animador sob demanda | 10 |
| `app/src/ui/timer/centro-live.ts` (novo) | Estado, reação e sono do Centro no Timer | 11 |
| `app/src/ui/timer/TimerScreen.svelte` | Temporada no caminho do solve; usa o controlador e o animador | 6, 11, 12 |
| `app/src/styles/screens.css` | Sai o CSS das animações antigas; entra a respiração por classe | 8, 11 |
| `app/src/strings.ts` | Textos novos | 5, 6, 12 |
| `app/tests/unit/*.test.ts`, `app/tests/e2e/companion.spec.ts` | Testes | todas |

---

### Task 1: Escada, marcos e validação da temporada

Spec: seções 5.1, 5.2, 5.3 e 5.6 (validação).

**Files:**
- Modify: `app/src/core/types.ts` (acrescentar os tipos da temporada, antes de `export interface Profile`)
- Create: `app/src/core/season.ts`
- Test: `app/tests/unit/season.test.ts`

**Interfaces:**
- Produces (em `core/types.ts`): `MarkKind`, `SeasonMark`, `SeasonBasis`, `SeasonState`, `SeasonRecord`, `SeasonProgress`, exatamente como no Step 3.
- Produces (em `core/season.ts`):
  - `T1_MARKS: readonly Readonly<SeasonMark>[]`
  - `stepBelow(x: number): number`
  - `basisOf(solves: Solve[]): SeasonBasis`
  - `marksFor(basis: SeasonBasis): SeasonMark[]`
  - `seasonOne(): SeasonState`
  - `defaultSeason(): SeasonProgress`
  - `seasonFinish(n: number): FinishId | null`
  - `finishUnlocked(finish: FinishId, closed: number): boolean`
  - `seasonFrom(v: unknown): SeasonProgress | null`
  - `moreAdvanced(mine: SeasonProgress, theirs: SeasonProgress | null | undefined): SeasonProgress`

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/season.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  T1_MARKS,
  basisOf,
  defaultSeason,
  finishUnlocked,
  marksFor,
  moreAdvanced,
  seasonFinish,
  seasonFrom,
  seasonOne,
  stepBelow,
} from '../../src/core/season';
import type { SeasonProgress, Solve } from '../../src/core/types';

let id = 0;
const sv = (ms: number, at: number, penalty: Solve['penalty'] = null, event: Solve['event'] = '333'): Solve => ({
  id: `s${++id}`, sessionId: 'x', event, ms, penalty, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null,
});

describe('escada de degraus redondos (spec 5.2)', () => {
  it('o próximo degrau é o múltiplo do passo da faixa, estritamente abaixo', () => {
    expect(stepBelow(91000)).toBe(90000);
    expect(stepBelow(90000)).toBe(85000);
    expect(stepBelow(60010)).toBe(60000);
    expect(stepBelow(60000)).toBe(58000);
    expect(stepBelow(30500)).toBe(30000);
    expect(stepBelow(30000)).toBe(29000);
    expect(stepBelow(18770)).toBe(18000);
    expect(stepBelow(10200)).toBe(10000);
    expect(stepBelow(10000)).toBe(9500);
  });

  it('nenhuma meta fica abaixo de 1 s', () => {
    expect(stepBelow(1200)).toBe(1000);
    expect(stepBelow(800)).toBe(1000);
  });
});

describe('marcos da temporada (spec 5.3)', () => {
  it('a T1 é a de hoje, na ordem de MILESTONES', () => {
    expect(T1_MARKS.map((m) => `${m.kind}:${m.target}`)).toEqual([
      'count:1', 'single:120000', 'count:100', 'single:90000', 'ao5:90000', 'single:60000', 'streak:7', 'ao12:60000', 'count:1000',
    ]);
    expect(seasonOne()).toEqual({ n: 1, startedAt: 0, marks: T1_MARKS.map((m) => ({ ...m })), basis: { single: null, ao5: null, ao12: null } });
    expect(defaultSeason()).toEqual({ current: seasonOne(), past: [] });
  });

  it('da T2 em diante, as metas saem das marcas de quando a temporada começa', () => {
    expect(marksFor({ single: 15210, ao5: 18770, ao12: 19340 })).toEqual([
      { kind: 'count', target: 50 },
      { kind: 'single', target: 15000 },
      { kind: 'ao5', target: 18000 },
      { kind: 'streak', target: 7 },
      { kind: 'ao12', target: 19000 },
      { kind: 'count', target: 300 },
      { kind: 'ao5', target: 17000 },
      { kind: 'steady', target: 1900 },
      { kind: 'ao12', target: 18000 },
    ]);
  });

  it('sem média de 12 cai para a de 5; sem a de 5, para o single; a folga nunca fica abaixo de 1 s', () => {
    const marks = marksFor({ single: 15210, ao5: null, ao12: null });
    expect(marks[2]).toEqual({ kind: 'ao5', target: 15000 });
    expect(marks[4]).toEqual({ kind: 'ao12', target: 15000 });
    expect(marks[7]).toEqual({ kind: 'steady', target: 1500 });
    expect(marksFor({ single: 7000, ao5: 8000, ao12: 8500 })[7]).toEqual({ kind: 'steady', target: 1000 });
  });

  it('as marcas de base vêm dos solves dados (o melhor single e as melhores médias)', () => {
    const list = [20000, 21000, 19000, 22000, 18000, 25000].map((ms, i) => sv(ms, i + 1));
    expect(basisOf(list)).toEqual({ single: 18000, ao5: 20000, ao12: null });
  });
});

describe('acabamentos por temporada (spec 5.1)', () => {
  it('Brilho, Gelo e Carbono saem das três primeiras temporadas fechadas', () => {
    expect([1, 2, 3, 4].map(seasonFinish)).toEqual(['brilho', 'gelo', 'carbono', null]);
    expect(finishUnlocked('fosco', 0)).toBe(true);
    expect(finishUnlocked('brilho', 0)).toBe(false);
    expect(finishUnlocked('brilho', 1)).toBe(true);
    expect(finishUnlocked('gelo', 1)).toBe(false);
    expect(finishUnlocked('gelo', 2)).toBe(true);
    expect(finishUnlocked('carbono', 2)).toBe(false);
    expect(finishUnlocked('carbono', 5)).toBe(true);
  });
});

describe('temporada que vem de fora (spec 5.6)', () => {
  const ok: SeasonProgress = {
    current: { n: 2, startedAt: 10, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 1 })), basis: { single: 1, ao5: null, ao12: null } },
    past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 3, startAo12: null, endAo12: null }],
  };

  it('passa inteira quando bem formada', () => {
    expect(seasonFrom(structuredClone(ok))).toEqual(ok);
  });

  it('qualquer pedaço errado recusa a temporada inteira', () => {
    const bad: unknown[] = [
      null,
      { ...ok, past: 'x' },
      { ...ok, current: { ...ok.current, n: 0 } },
      { ...ok, current: { ...ok.current, n: 1.5 } },
      { ...ok, current: { ...ok.current, startedAt: -1 } },
      { ...ok, current: { ...ok.current, marks: ok.current.marks.slice(1) } },
      { ...ok, current: { ...ok.current, marks: [{ kind: 'outro', target: 1 }, ...ok.current.marks.slice(1)] } },
      { ...ok, current: { ...ok.current, marks: [{ kind: 'count', target: 0 }, ...ok.current.marks.slice(1)] } },
      { ...ok, current: { ...ok.current, basis: { single: 'x', ao5: null, ao12: null } } },
      { ...ok, past: [{ ...ok.past[0], solves: -1 }] },
      { ...ok, past: [ok.past[0], ok.past[0]] },
      { ...ok, past: [{ ...ok.past[0], n: 2 }] },
    ];
    for (const v of bad) expect(seasonFrom(v)).toBeNull();
  });

  it('a mais adiantada é a de mais temporadas fechadas; no empate fica a daqui', () => {
    const fresh = defaultSeason();
    expect(moreAdvanced(fresh, ok)).toBe(ok);
    expect(moreAdvanced(ok, fresh)).toBe(ok);
    expect(moreAdvanced(fresh, null)).toBe(fresh);
    const tie = defaultSeason();
    expect(moreAdvanced(fresh, tie)).toBe(fresh);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/season.test.ts`
Expected: FAIL. O motivo é "Failed to resolve import ../../src/core/season".

- [ ] **Step 3: Escreva os tipos**

Em `app/src/core/types.ts`, logo antes de `export interface Profile {`, acrescente:

```ts
// Temporadas (spec do sub-projeto 3, seção 5). As metas de tempo são em ms e valem estritamente abaixo.
export type MarkKind = 'count' | 'single' | 'ao5' | 'ao12' | 'streak' | 'steady';

export interface SeasonMark {
  kind: MarkKind;
  target: number; // count: solves; single, ao5 e ao12: ms; streak: dias; steady: folga em ms
}

// As marcas que geraram as metas de uma temporada (nulas na T1, que tem metas fixas).
export interface SeasonBasis {
  single: number | null;
  ao5: number | null;
  ao12: number | null;
}

export interface SeasonState {
  n: number; // 1, 2, 3…
  startedAt: number; // contam os solves com at > startedAt (a T1 começa em 0)
  marks: SeasonMark[]; // sempre 9, na ordem da lista
  basis: SeasonBasis;
}

export interface SeasonRecord {
  n: number;
  startedAt: number;
  endedAt: number; // o momento do solve que fechou a temporada
  solves: number; // solves de 3×3 da temporada
  startAo12: number | null; // basis.ao12 (nula na T1)
  endAo12: number | null; // a melhor média de 12 dentro da temporada
}

export interface SeasonProgress {
  current: SeasonState;
  past: SeasonRecord[];
}
```

- [ ] **Step 4: Escreva `core/season.ts`**

Crie `app/src/core/season.ts`:

```ts
// Temporadas do Centro (spec do sub-projeto 3, seção 5): a escada de degraus, os 9 marcos de cada temporada, a validação do que vem de
// fora e os acabamentos. Tudo puro: quem chama passa os solves ativos em ordem de tempo.
import { bestAverage, bestSingle } from './stats';
import type { FinishId, MarkKind, SeasonBasis, SeasonMark, SeasonProgress, SeasonRecord, SeasonState, Solve } from './types';

// A T1 de hoje, na ordem de MILESTONES (stats.ts): os rótulos dela continuam os de MILESTONE_INFO.
export const T1_MARKS: readonly Readonly<SeasonMark>[] = Object.freeze(
  (
    [
      { kind: 'count', target: 1 },
      { kind: 'single', target: 120000 },
      { kind: 'count', target: 100 },
      { kind: 'single', target: 90000 },
      { kind: 'ao5', target: 90000 },
      { kind: 'single', target: 60000 },
      { kind: 'streak', target: 7 },
      { kind: 'ao12', target: 60000 },
      { kind: 'count', target: 1000 },
    ] as SeasonMark[]
  ).map((m) => Object.freeze(m)),
);

const MIN_TARGET = 1000; // nenhuma meta de tempo fica abaixo de 1 s
const FALLBACK_SINGLE = 60000; // sem nenhum tempo (não acontece: a T2 só vem depois de 1.000 solves), as metas partem de 1 minuto

// O passo da faixa de x (spec 5.2): 5 s acima de 1 min, 2 s até 1 min, 1 s até 30 s, 0,5 s até 10 s.
function stepFor(x: number): number {
  if (x > 60000) return 5000;
  if (x > 30000) return 2000;
  if (x > 10000) return 1000;
  return 500;
}

// O próximo degrau redondo abaixo de x: o maior múltiplo do passo da faixa de x estritamente abaixo de x, nunca abaixo de 1 s.
export function stepBelow(x: number): number {
  const s = stepFor(x);
  return Math.max(MIN_TARGET, Math.ceil(x / s) * s - s);
}

// As marcas de base: o melhor single e as melhores médias de 5 e de 12 dos solves dados (quem chama passa só os de 3×3).
export function basisOf(solves: Solve[]): SeasonBasis {
  return { single: bestSingle(solves), ao5: bestAverage(solves, 5), ao12: bestAverage(solves, 12) };
}

// Os 9 marcos da T2 em diante (spec 5.3). Sem média de 12 vale a de 5; sem a de 5, o single.
export function marksFor(basis: SeasonBasis): SeasonMark[] {
  const single = basis.single ?? FALLBACK_SINGLE;
  const ao5 = basis.ao5 ?? single;
  const ao12 = basis.ao12 ?? ao5;
  const ao5First = stepBelow(ao5);
  const ao12First = stepBelow(ao12);
  return [
    { kind: 'count', target: 50 },
    { kind: 'single', target: stepBelow(single) },
    { kind: 'ao5', target: ao5First },
    { kind: 'streak', target: 7 },
    { kind: 'ao12', target: ao12First },
    { kind: 'count', target: 300 },
    { kind: 'ao5', target: stepBelow(ao5First) },
    { kind: 'steady', target: Math.max(MIN_TARGET, Math.round(ao5 / 1000) * 100) }, // 10% da média de 5, arredondado ao décimo
    { kind: 'ao12', target: stepBelow(ao12First) },
  ];
}

export function seasonOne(): SeasonState {
  return { n: 1, startedAt: 0, marks: T1_MARKS.map((m) => ({ ...m })), basis: { single: null, ao5: null, ao12: null } };
}

export function defaultSeason(): SeasonProgress {
  return { current: seasonOne(), past: [] };
}

// O acabamento que cada uma das três primeiras temporadas libera (spec 5.1). Da T4 em diante, nenhum.
const SEASON_FINISH: Readonly<Record<number, FinishId>> = Object.freeze({ 1: 'brilho', 2: 'gelo', 3: 'carbono' });
const UNLOCK_AT: Readonly<Record<FinishId, number>> = Object.freeze({ fosco: 0, brilho: 1, gelo: 2, carbono: 3 });

export const seasonFinish = (n: number): FinishId | null => SEASON_FINISH[n] ?? null;
// `closed` é quantas temporadas a pessoa já fechou (season.past.length).
export const finishUnlocked = (finish: FinishId, closed: number): boolean => closed >= UNLOCK_AT[finish];

// --- O que vem de fora (arquivo do Klick, cópia de segurança) ---

const MARK_KINDS: readonly string[] = ['count', 'single', 'ao5', 'ao12', 'streak', 'steady'];
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPos = (v: unknown): v is number => isNum(v) && v > 0;
const isWhole = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;
const isTime = (v: unknown): v is number | null => v === null || isPos(v);

function markFrom(v: unknown): SeasonMark | null {
  if (!isRec(v)) return null;
  const { kind, target } = v;
  if (typeof kind !== 'string' || !MARK_KINDS.includes(kind) || !isPos(target)) return null;
  return { kind: kind as MarkKind, target };
}

function stateFrom(v: unknown): SeasonState | null {
  if (!isRec(v)) return null;
  const { n, startedAt, marks, basis } = v;
  if (!isWhole(n, 1) || !isNum(startedAt) || startedAt < 0 || !Array.isArray(marks) || marks.length !== 9 || !isRec(basis)) return null;
  const parsed = marks.map(markFrom);
  const { single, ao5, ao12 } = basis;
  if (parsed.some((m) => m === null) || !isTime(single) || !isTime(ao5) || !isTime(ao12)) return null;
  return { n, startedAt, marks: parsed as SeasonMark[], basis: { single, ao5, ao12 } };
}

function recordFrom(v: unknown): SeasonRecord | null {
  if (!isRec(v)) return null;
  const { n, startedAt, endedAt, solves, startAo12, endAo12 } = v;
  if (!isWhole(n, 1) || !isNum(startedAt) || !isNum(endedAt) || !isWhole(solves, 0) || !isTime(startAo12) || !isTime(endAo12)) return null;
  return { n, startedAt, endedAt, solves, startAo12, endAo12 };
}

// Uma temporada que veio de fora: só passa inteira e bem formada (os números das temporadas não se repetem); senão, null.
export function seasonFrom(v: unknown): SeasonProgress | null {
  if (!isRec(v) || !Array.isArray(v.past)) return null;
  const current = stateFrom(v.current);
  const past = v.past.map(recordFrom);
  if (!current || past.some((r) => r === null)) return null;
  const records = past as SeasonRecord[];
  if (new Set([...records.map((r) => r.n), current.n]).size !== records.length + 1) return null;
  return { current, past: records };
}

// A mais adiantada das duas: a de mais temporadas fechadas; no empate, a primeira (a daqui). Progresso nunca regride (spec 5.6).
export const moreAdvanced = (mine: SeasonProgress, theirs: SeasonProgress | null | undefined): SeasonProgress =>
  theirs && theirs.past.length > mine.past.length ? theirs : mine;
```

- [ ] **Step 5: Rode os testes e confira que passam**

Run: `pnpm test -- tests/unit/season.test.ts`
Expected: PASS (todos os casos do arquivo).

Run: `pnpm check`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/season.ts tests/unit/season.test.ts
git commit -m "feat(app): escada de degraus e marcos das temporadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Avaliação incremental e virada da temporada

Spec: seções 5.4 e 5.5.

**Files:**
- Modify: `app/src/core/stats.ts` (exportar `trimmedMean` e `noon`)
- Modify: `app/src/core/season.ts`
- Test: `app/tests/unit/season.test.ts`

**Interfaces:**
- Consumes: os tipos e as funções da Task 1; de `stats.ts`, `dayKey`, `effectiveMs`, `bestAverage` e (agora exportados) `trimmedMean(values: number[]): number` e `noon(key: string): number`.
- Produces (em `core/season.ts`):
  - `interface MarkStatus { mark: SeasonMark; achieved: boolean; at: number | null; current: number | null }`
  - `seasonSolves(solves: Solve[], state: SeasonState): Solve[]`
  - `evaluateSeason(state: SeasonState, solves: Solve[]): MarkStatus[]`
  - `seasonKey(state: SeasonState): string`
  - `interface SeasonTracker { evaluate(state: SeasonState, solves: Solve[]): MarkStatus[]; lastRun(): 'cached' | 'appended' | 'full' }`
  - `createSeasonTracker(): SeasonTracker`
  - `closeRecord(state: SeasonState, solves: Solve[], status: MarkStatus[]): SeasonRecord`
  - `interface SeasonAdvance { fromN: number; record: SeasonRecord; next: SeasonState }`
  - `planAdvance(progress: SeasonProgress, solves: Solve[], now: number, status?: MarkStatus[]): SeasonAdvance | null`
- `solves` é sempre a lista de solves ativos de todos os eventos, em ordem de `at`. O filtro de 3×3 e de início fica dentro de `seasonSolves`.

Ruling registrado. Na virada, `next.startedAt` é `max(now, record.endedAt)`:
- na virada ao vivo, `now` fica a milissegundos do solve que fechou, o que é igual ao `endedAt` da spec na prática;
- na T1 fechada no passado, vale `now`, como a spec pede;
- usar sempre o instante da conferência garante que nenhuma importação faça temporadas em cascata.

- [ ] **Step 1: Escreva os testes que falham**

Acrescente ao fim de `app/tests/unit/season.test.ts`. Junte os novos nomes ao import de `season` e adicione o import de `stats`:

```ts
import {
  closeRecord,
  createSeasonTracker,
  evaluateSeason,
  planAdvance,
  seasonKey,
  seasonSolves,
} from '../../src/core/season';
import { MILESTONES, milestoneProgress } from '../../src/core/stats';
```

```ts
const DAY = 86400000;
const NOON = new Date(2026, 9, 1, 12).getTime();

// 1.000 solves de 3×3 de 50 s, 100 por dia em 10 dias seguidos a partir de NOON: fecham os 9 marcos da T1.
const t1History = (): Solve[] =>
  Array.from({ length: 1000 }, (_, i) => sv(50000, NOON + Math.floor(i / 100) * DAY + (i % 100) * 60000));

describe('avaliação da temporada (spec 5.4)', () => {
  it('a T1 dá os mesmos marcos, nos mesmos solves, que a conta de hoje', () => {
    // Tempos que descem devagar, com um DNF e um +2 no meio, em 12 dias.
    const list = Array.from({ length: 1200 }, (_, i) =>
      sv(130000 - i * 70, NOON + Math.floor(i / 100) * DAY + (i % 100) * 60000, i === 50 ? 'DNF' : i === 51 ? '+2' : null));
    const status = evaluateSeason(seasonOne(), list);
    const today = milestoneProgress(list, NOON + 13 * DAY);
    expect(status.map((m) => m.at)).toEqual(MILESTONES.map((id) => today.find((x) => x.id === id)?.at ?? null));
    expect(status.every((m) => m.achieved)).toBe(true);
  });

  it('só contam solves de 3×3, fora de outros eventos e depois do início', () => {
    const state = { ...seasonOne(), n: 2, startedAt: NOON, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 2 })) };
    const list = [sv(20000, NOON - 1), sv(20000, NOON), sv(20000, NOON + 1, null, '222'), sv(20000, NOON + 2)];
    expect(seasonSolves(list, state).map((s) => s.at)).toEqual([NOON + 2]);
    expect(evaluateSeason(state, list)[0]).toEqual({ mark: { kind: 'count', target: 2 }, achieved: false, at: null, current: 1 });
  });

  it('"abaixo" é estrito; a folga conta 5 seguidos sem DNF, com o +2', () => {
    const state = {
      n: 2, startedAt: 0, basis: { single: null, ao5: null, ao12: null },
      marks: [
        { kind: 'single' as const, target: 15000 },
        { kind: 'steady' as const, target: 2000 },
        ...Array.from({ length: 7 }, () => ({ kind: 'count' as const, target: 99 })),
      ],
    };
    const even = [15000, 16000, 17000, 15500, 16500].map((ms, i) => sv(ms, i + 1));
    let s = evaluateSeason(state, even);
    expect(s[0].achieved).toBe(false); // 15.00 não é abaixo de 15 s
    expect(s[1]).toMatchObject({ achieved: true, current: 2000, at: 5 }); // 17.00 - 15.00 = 2.00, dentro da folga
    const withDnf = [sv(15000, 1), sv(15100, 2, 'DNF'), sv(15200, 3), sv(15300, 4), sv(15400, 5)];
    expect(evaluateSeason(state, withDnf)[1].achieved).toBe(false);
    // O +2 conta com os 2 s: 13.30 vira 15.30, e a variação dos 5 fica em 15.30 - 14.99.
    const plus2 = [sv(15000, 1), sv(13300, 2, '+2'), sv(15200, 3), sv(15300, 4), sv(14990, 5)];
    s = evaluateSeason(state, plus2);
    expect(s[0]).toMatchObject({ achieved: true, at: 5 });
    expect(s[1]).toMatchObject({ achieved: true, current: 310 });
  });

  it('o rastreador continua a conta quando a lista só ganhou solves no fim, e bate com a conta completa', () => {
    const all = t1History();
    const tracker = createSeasonTracker();
    const state = seasonOne();
    tracker.evaluate(state, all.slice(0, 500));
    expect(tracker.lastRun()).toBe('full');
    const grown = all.slice(0, 501);
    expect(tracker.evaluate(state, grown)).toEqual(evaluateSeason(state, grown));
    expect(tracker.lastRun()).toBe('appended');
    expect(tracker.evaluate(state, grown)).toEqual(evaluateSeason(state, grown));
    expect(tracker.lastRun()).toBe('cached');
    const edited = [...grown.slice(0, 10), { ...grown[10], penalty: 'DNF' as const }, ...grown.slice(11)];
    expect(tracker.evaluate(state, edited)).toEqual(evaluateSeason(state, edited));
    expect(tracker.lastRun()).toBe('full');
    const other = { ...state, n: 2 };
    tracker.evaluate(other, edited);
    expect(tracker.lastRun()).toBe('full');
    expect(seasonKey(other)).not.toBe(seasonKey(state));
  });
});

describe('virada da temporada (spec 5.5)', () => {
  it('sem os 9 marcos, não vira', () => {
    expect(planAdvance(defaultSeason(), t1History().slice(0, 999), NOON + 20 * DAY)).toBeNull();
  });

  it('a T1 fechada no passado vai para o histórico e a T2 começa na conferência, com metas das marcas de agora', () => {
    const list = t1History();
    const now = NOON + 20 * DAY;
    const plan = planAdvance(defaultSeason(), list, now)!;
    expect(plan.fromN).toBe(1);
    expect(plan.record).toEqual({
      n: 1,
      startedAt: NOON,
      endedAt: list[999].at,
      solves: 1000,
      startAo12: null,
      endAo12: 50000,
    });
    expect(plan.next.n).toBe(2);
    expect(plan.next.startedAt).toBe(now);
    expect(plan.next.basis).toEqual({ single: 50000, ao5: 50000, ao12: 50000 });
    expect(plan.next.marks[1]).toEqual({ kind: 'single', target: 48000 });
    // Sem cascata: a T2 não tem solve nenhum ainda.
    expect(planAdvance({ current: plan.next, past: [plan.record] }, list, now)).toBeNull();
  });

  it('o registro conta só os solves até o que fechou, e a melhor média de 12 até ali', () => {
    const state = { n: 2, startedAt: NOON, basis: { single: 20000, ao5: 21000, ao12: 22000 }, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 12 })) };
    const list = Array.from({ length: 15 }, (_, i) => sv(19000 + i * 100, NOON + 1 + i));
    const status = evaluateSeason(state, list);
    expect(closeRecord(state, list, status)).toEqual({ n: 2, startedAt: NOON, endedAt: NOON + 12, solves: 12, startAo12: 22000, endAo12: 19550 });
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/season.test.ts`
Expected: FAIL. O vitest não acha os exports `evaluateSeason`, `createSeasonTracker` e os outros.

- [ ] **Step 3: Exporte `trimmedMean` e `noon` em `stats.ts`**

Em `app/src/core/stats.ts`:
- troque `function trimmedMean(values: number[]): number {` por `export function trimmedMean(values: number[]): number {`;
- troque `const noon = (key: string): number => new Date(\`${key}T12:00:00\`).getTime();` por `export const noon = (key: string): number => new Date(\`${key}T12:00:00\`).getTime();`.

Nada mais muda nesse arquivo.

- [ ] **Step 4: Acrescente a avaliação e a virada em `season.ts`**

Atualize os imports do topo de `app/src/core/season.ts`:

```ts
import { eventInfo } from './events';
import { bestAverage, bestSingle, dayKey, effectiveMs, noon, trimmedMean } from './stats';
import type { FinishId, MarkKind, SeasonBasis, SeasonMark, SeasonProgress, SeasonRecord, SeasonState, Solve } from './types';
```

Acrescente ao fim do arquivo:

```ts
// --- Avaliação (spec 5.4) ---

const DAY = 86400000;

export interface MarkStatus {
  mark: SeasonMark;
  achieved: boolean;
  at: number | null; // o at do solve que acendeu o marco
  // count: solves da temporada; single, ao5 e ao12: o melhor até agora (ms); streak: a sequência que termina no último solve (dias);
  // steady: a menor variação entre 5 seguidos sem DNF (ms). null enquanto não há o que medir.
  current: number | null;
}

// Os solves que contam para a temporada: os eventos com marcos no catálogo (o 3×3) e depois do início.
export function seasonSolves(solves: Solve[], state: SeasonState): Solve[] {
  return solves.filter((s) => s.at > state.startedAt && eventInfo(s.event).milestones);
}

// A conta como uma dobra, solve a solve: o estado guarda o que ela precisa para continuar.
interface Fold {
  count: number;
  best: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  run: number;
  bestRun: number;
  prevDay: string | null;
  bestSpread: number | null;
  last: number[]; // os últimos 12 tempos efetivos (Infinity = DNF), do mais antigo ao mais novo
  at: (number | null)[]; // por marco
}

const initFold = (n: number): Fold => ({
  count: 0, best: null, bestAo5: null, bestAo12: null, run: 0, bestRun: 0, prevDay: null, bestSpread: null, last: [], at: Array<number | null>(n).fill(null),
});

// O menor entre o valor e o melhor até agora; DNF (Infinity) não conta.
const lower = (v: number | null, best: number | null): number | null => (v !== null && v !== Infinity && (best === null || v < best) ? v : best);

function met(mark: SeasonMark, f: Fold): boolean {
  switch (mark.kind) {
    case 'count':
      return f.count >= mark.target;
    case 'single':
      return f.best !== null && f.best < mark.target;
    case 'ao5':
      return f.bestAo5 !== null && f.bestAo5 < mark.target;
    case 'ao12':
      return f.bestAo12 !== null && f.bestAo12 < mark.target;
    case 'streak':
      return f.bestRun >= mark.target;
    case 'steady':
      return f.bestSpread !== null && f.bestSpread <= mark.target;
  }
}

function stepFold(f: Fold, marks: readonly SeasonMark[], x: Solve): void {
  const e = effectiveMs(x);
  f.count += 1;
  f.best = lower(e, f.best);
  const k = dayKey(x.at);
  if (k !== f.prevDay) {
    f.run = f.prevDay !== null && Math.round((noon(k) - noon(f.prevDay)) / DAY) === 1 ? f.run + 1 : 1;
    f.bestRun = Math.max(f.bestRun, f.run);
    f.prevDay = k;
  }
  f.last.push(e);
  if (f.last.length > 12) f.last.shift();
  if (f.last.length >= 5) {
    const five = f.last.slice(-5);
    f.bestAo5 = lower(trimmedMean(five), f.bestAo5);
    if (five.every((v) => v !== Infinity)) f.bestSpread = lower(Math.max(...five) - Math.min(...five), f.bestSpread);
  }
  if (f.last.length >= 12) f.bestAo12 = lower(trimmedMean(f.last), f.bestAo12);
  marks.forEach((m, i) => {
    if (f.at[i] === null && met(m, f)) f.at[i] = x.at;
  });
}

function currentOf(mark: SeasonMark, f: Fold): number | null {
  switch (mark.kind) {
    case 'count':
      return f.count;
    case 'single':
      return f.best;
    case 'ao5':
      return f.bestAo5;
    case 'ao12':
      return f.bestAo12;
    case 'streak':
      return f.run;
    case 'steady':
      return f.bestSpread;
  }
}

const statusOf = (marks: readonly SeasonMark[], f: Fold): MarkStatus[] =>
  marks.map((mark, i) => ({ mark: { ...mark }, achieved: f.at[i] !== null, at: f.at[i], current: currentOf(mark, f) }));

// Os marcos da temporada sobre a lista inteira (sem guardar nada). Para a conta de cada solve, use createSeasonTracker.
export function evaluateSeason(state: SeasonState, solves: Solve[]): MarkStatus[] {
  const f = initFold(state.marks.length);
  for (const x of seasonSolves(solves, state)) stepFold(f, state.marks, x);
  return statusOf(state.marks, f);
}

// A identidade de uma temporada para os rastreadores: o número, o início e as metas.
export const seasonKey = (state: SeasonState): string =>
  `${state.n}|${state.startedAt}|${state.marks.map((m) => `${m.kind}:${m.target}`).join(',')}`;

export interface SeasonTracker {
  evaluate(state: SeasonState, solves: Solve[]): MarkStatus[]; // o mesmo que evaluateSeason, sem recontar o que já contou
  lastRun(): 'cached' | 'appended' | 'full'; // como foi a última conta (para os testes e para medir)
}

// Guarda a última lista contada e o estado da dobra. Mesma temporada e uma lista que começa com os mesmos solves (os mesmos objetos,
// na mesma ordem): só os novos do fim entram na conta. Outra temporada, ou qualquer outra mudança na lista, refaz do zero.
export function createSeasonTracker(): SeasonTracker {
  let key = '';
  let marks: SeasonMark[] = [];
  let seen: Solve[] = [];
  let fold = initFold(0);
  let run: 'cached' | 'appended' | 'full' = 'full';
  return {
    evaluate(state, solves) {
      const k = seasonKey(state);
      const list = seasonSolves(solves, state);
      let prefix = k === key && list.length >= seen.length;
      for (let i = 0; prefix && i < seen.length; i++) prefix = list[i] === seen[i];
      if (prefix) {
        run = seen.length === 0 ? 'full' : list.length === seen.length ? 'cached' : 'appended';
      } else {
        key = k;
        marks = state.marks.map((m) => ({ ...m }));
        fold = initFold(marks.length);
        run = 'full';
      }
      for (let i = prefix ? seen.length : 0; i < list.length; i++) stepFold(fold, marks, list[i]);
      seen = list;
      return statusOf(marks, fold);
    },
    lastRun: () => run,
  };
}

// --- Virada (spec 5.5) ---

export interface SeasonAdvance {
  fromN: number; // a temporada que fecha: advanceSeason só grava se ela ainda for a atual
  record: SeasonRecord;
  next: SeasonState;
}

// O registro de uma temporada completa: fecha no solve que deu o último marco. A T1 começa no primeiro solve de 3×3.
export function closeRecord(state: SeasonState, solves: Solve[], status: MarkStatus[]): SeasonRecord {
  const endedAt = Math.max(...status.map((m) => m.at ?? -Infinity));
  const inSeason = seasonSolves(solves, state);
  const upToEnd = inSeason.filter((s) => s.at <= endedAt);
  return {
    n: state.n,
    startedAt: state.n === 1 ? (inSeason[0]?.at ?? state.startedAt) : state.startedAt,
    endedAt,
    solves: upToEnd.length,
    startAo12: state.basis.ao12,
    endAo12: bestAverage(upToEnd, 12),
  };
}

// A virada, quando os 9 marcos estão feitos; null se falta algum. A próxima começa no instante da conferência (na virada ao vivo, a
// milissegundos do solve que fechou) e tira as metas das marcas de todo o histórico de 3×3: sem solve nenhum ainda, ela não fecha na
// hora, e uma importação não vira temporadas em cascata.
export function planAdvance(
  progress: SeasonProgress,
  solves: Solve[],
  now: number,
  status: MarkStatus[] = evaluateSeason(progress.current, solves),
): SeasonAdvance | null {
  const cur = progress.current;
  if (status.length === 0 || !status.every((m) => m.achieved)) return null;
  const record = closeRecord(cur, solves, status);
  const basis = basisOf(solves.filter((s) => eventInfo(s.event).milestones));
  return { fromN: cur.n, record, next: { n: cur.n + 1, startedAt: Math.max(now, record.endedAt), marks: marksFor(basis), basis } };
}
```

- [ ] **Step 5: Rode os testes e confira que passam**

Run: `pnpm test -- tests/unit/season.test.ts tests/unit/stats.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/core/stats.ts src/core/season.ts tests/unit/season.test.ts
git commit -m "feat(app): avaliação incremental e virada da temporada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Temporada no perfil, virada condicional e nunca regredir

Spec: seções 5.1 (modelo), 5.5 (gravação) e 5.6.

**Files:**
- Modify: `app/src/core/types.ts` (campo `season` em `Profile`)
- Modify: `app/src/data/repository.ts`
- Modify: `app/src/data/transfer.ts` (`profileOf`)
- Modify: `app/src/ui/state/app.svelte.ts` (`placeholderProfile`)
- Test: `app/tests/unit/repository.test.ts`, `app/tests/unit/transfer.test.ts`

**Interfaces:**
- Consumes: `defaultSeason`, `finishUnlocked`, `moreAdvanced` e `seasonFrom` (Task 1).
- Produces:
  - `Profile.season: SeasonProgress`
  - `Repository.advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>`: vira numa transação só se a temporada gravada ainda for `fromN`; senão devolve o perfil gravado, sem gravar nem avisar
  - `ProfilePatch.season?: SeasonProgress`, que sai sozinho de `Partial<Profile>`

- [ ] **Step 1: Escreva os testes que falham**

Em `app/tests/unit/repository.test.ts`, acrescente aos imports:

```ts
import { defaultSeason } from '../../src/core/season';
import type { FinishId, Profile, SeasonProgress, SeasonRecord, SeasonState } from '../../src/core/types';
```

Acrescente um `describe` novo ao fim do arquivo:

```ts
describe('temporadas no perfil', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = await fresh();
  });

  const t2 = (startedAt: number): SeasonState => ({
    n: 2,
    startedAt,
    marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 1 })),
    basis: { single: 20000, ao5: 21000, ao12: 22000 },
  });
  const rec1: SeasonRecord = { n: 1, startedAt: 1, endedAt: 2, solves: 1000, startAo12: null, endAo12: 50000 };
  const file = (profile: KlickExport['profile']): KlickExport => ({ format: 'klick', version: 1, exportedAt: t, sessions: [], solves: [], profile });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('perfil novo e perfil antigo, sem temporada, começam na T1', async () => {
    expect((await repo.getProfile()).season).toEqual(defaultSeason());
    const db = await openKlickDb(`klick-test-${++dbn}`);
    const old = { settings: { ...DEFAULT_SETTINGS, sound: { ...DEFAULT_SETTINGS.sound } }, trail: Array<boolean>(9).fill(false), finish: 'fosco', onboarded: true, currentSessionId: null };
    await db.put('profile', old as unknown as Profile, 'current');
    const p = await createRepository(db, { now, channel: null }).getProfile();
    expect(p.season).toEqual(defaultSeason());
    expect(p.onboarded).toBe(true);
  });

  it('advanceSeason vira uma vez só, mesmo com duas chamadas ao mesmo tempo, e avisa uma vez', async () => {
    const heard: string[] = [];
    repo.onChange((k) => heard.push(k));
    const [a, b] = await Promise.all([repo.advanceSeason(1, rec1, t2(5)), repo.advanceSeason(1, rec1, t2(6))]);
    await tick();
    const saved = await repo.getProfile();
    expect(saved.season.past).toEqual([rec1]);
    expect(saved.season.current.n).toBe(2);
    expect(a.season).toEqual(saved.season);
    expect(b.season).toEqual(saved.season);
    expect(heard.filter((k) => k === 'profile')).toHaveLength(1);
  });

  it('advanceSeason de uma temporada que não é mais a atual não grava nada', async () => {
    await repo.advanceSeason(1, rec1, t2(5));
    const again = await repo.advanceSeason(1, { ...rec1, solves: 1 }, t2(9));
    expect(again.season.past).toEqual([rec1]);
    expect(again.season.current.startedAt).toBe(5);
  });

  it('importar fica com a temporada mais adiantada e não aplica um acabamento ainda bloqueado aqui', async () => {
    const ahead: SeasonProgress = { current: t2(5), past: [rec1] };
    await repo.importAll(file({ season: ahead, finish: 'carbono' as FinishId }));
    let p = await repo.getProfile();
    expect(p.season).toEqual(ahead);
    expect(p.finish).toBe('fosco'); // o Carbono pede 3 temporadas fechadas
    await repo.importAll(file({ season: defaultSeason(), finish: 'brilho' }));
    p = await repo.getProfile();
    expect(p.season).toEqual(ahead); // a daqui estava mais adiantada
    expect(p.finish).toBe('brilho'); // o Brilho já está liberado aqui
  });

  it('importar uma temporada malformada deixa a daqui', async () => {
    await repo.advanceSeason(1, rec1, t2(5));
    await repo.importAll(file({ season: { current: 'x', past: [] } as unknown as SeasonProgress }));
    expect((await repo.getProfile()).season.past).toEqual([rec1]);
  });

  it('restaurar uma cópia antiga ou sem perfil não volta a temporada nem o acabamento', async () => {
    await repo.advanceSeason(1, rec1, t2(5));
    await repo.saveProfile({ finish: 'brilho' });
    await repo.replaceAll(file({ finish: 'brilho', onboarded: true }));
    let p = await repo.getProfile();
    expect(p.season.past).toEqual([rec1]);
    expect(p.finish).toBe('brilho');
    expect(p.onboarded).toBe(true);
    await repo.replaceAll(file(null));
    p = await repo.getProfile();
    expect(p.season.current.n).toBe(2);
    await repo.replaceAll(file({ finish: 'gelo', season: { current: 'x' } as unknown as SeasonProgress }));
    p = await repo.getProfile();
    expect(p.season.past).toEqual([rec1]);
    expect(p.finish).toBe('fosco'); // o Gelo da cópia ainda está bloqueado aqui
  });

  it('restaurar sem perfil, sem temporada adiantada, deixa o perfil padrão como antes', async () => {
    await repo.saveProfile({ onboarded: true });
    await repo.replaceAll(file(null));
    const p = await repo.getProfile();
    expect(p.onboarded).toBe(false);
    expect(p.season).toEqual(defaultSeason());
  });
});
```

Em `app/tests/unit/transfer.test.ts`, dentro de `describe('perfil do arquivo, campo por campo', …)`, acrescente:

```ts
    it('a temporada passa só inteira e bem formada', () => {
      const season = {
        current: { n: 2, startedAt: 10, marks: Array.from({ length: 9 }, () => ({ kind: 'count', target: 1 })), basis: { single: 1, ao5: null, ao12: null } },
        past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 3, startAo12: null, endAo12: null }],
      };
      expect(parseKlickJson(withProfile({ season })).profile).toEqual({ season });
      expect(parseKlickJson(withProfile({ season: { ...season, past: [...season.past, season.past[0]] } })).profile).toEqual({});
      expect(parseKlickJson(withProfile({ season: { ...season, current: { ...season.current, marks: season.current.marks.slice(1) } } })).profile).toEqual({});
    });
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/repository.test.ts tests/unit/transfer.test.ts`
Expected: FAIL. `repo.advanceSeason is not a function`, e `season` está ausente do perfil e do resultado do `parseKlickJson`.

- [ ] **Step 3: `Profile.season`**

Em `app/src/core/types.ts`, na interface `Profile`, acrescente o último campo:

```ts
export interface Profile {
  settings: Settings;
  trail: boolean[];
  finish: FinishId;
  onboarded: boolean;
  currentSessionId: string | null;
  season: SeasonProgress; // a temporada atual e as fechadas (spec do sub-projeto 3, seção 5.1)
}
```

- [ ] **Step 4: Repositório**

Em `app/src/data/repository.ts`:

1. **Imports.** Acrescente:

```ts
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
```

e troque o import de tipos por:

```ts
import type { EventId, Meta, Penalty, Profile, SeasonRecord, SeasonState, Session, Settings, Solve } from '../core/types';
```

2. **Contrato.** Em `interface Repository`, logo depois de `saveProfile(...)`, acrescente:

```ts
  // Vira a temporada (spec 5.5) numa transação: só grava se a temporada gravada ainda for fromN. Se outra aba já virou, não grava nem
  // avisa e devolve o perfil gravado.
  advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>;
```

3. **Padrão.** Em `defaultProfile()`, acrescente `season: defaultSeason(),` depois de `currentSessionId: null,`.

4. **Implementação.** Logo depois de `async saveProfile(patch) { … },`, acrescente:

```ts
    async advanceSeason(fromN, record, next) {
      const outcome = await write(['profile'], async (tx) => {
        const store = tx.objectStore('profile');
        const base = profileOrDefault(await store.get('current'));
        if (base.season.current.n !== fromN) return { profile: base, saved: false };
        const advanced: Profile = { ...base, season: { current: next, past: [...base.season.past, record] } };
        await store.put(advanced, 'current');
        return { profile: advanced, saved: true };
      });
      if (outcome.saved) announce('profile');
      return structuredClone(outcome.profile);
    },
```

5. **`importAll`.** No bloco `if (data.profile) { … }`, troque a montagem de `merged` por:

```ts
          // A temporada nunca regride (spec 5.6): fica a mais adiantada. O acabamento do arquivo só vale se estiver liberado por ela.
          const season = moreAdvanced(base.season, seasonFrom(theirs.season));
          const finish = theirs.finish !== undefined && finishUnlocked(theirs.finish, season.past.length) ? theirs.finish : base.finish;
          const merged = mergeProfile(base, {
            ...theirs,
            season,
            finish,
            trail: theirs.trail ? base.trail.map((done, i) => done || theirs.trail?.[i] === true) : base.trail,
            onboarded: base.onboarded || theirs.onboarded === true,
            currentSessionId,
          });
```

6. **`replaceAll`.** Troque a função inteira por:

```ts
    async replaceAll(data) {
      const { sessions, solves, profile } = data;
      await write(['sessions', 'solves', 'profile'], async (tx) => {
        const sessionStore = tx.objectStore('sessions');
        const solveStore = tx.objectStore('solves');
        const profileStore = tx.objectStore('profile');
        // A temporada daqui é lida antes de limpar: a restauração fica com a mais adiantada (spec 5.6), mesmo que a cópia não tenha perfil.
        const mine = profileOrDefault(await profileStore.get('current')).season;
        await Promise.all([sessionStore.clear(), solveStore.clear(), profileStore.clear()]);
        await each(sessions, (s) => sessionStore.put(s));
        await each(solves, (s) => solveStore.put(s));
        const restored = profile ? mergeProfile(defaultProfile(), profile) : null;
        const season = moreAdvanced(mine, seasonFrom(profile?.season));
        // Sem perfil na cópia e sem temporada a guardar, o perfil fica vazio (os padrões), como sempre foi.
        if (restored || season.past.length > 0) {
          const base = restored ?? defaultProfile();
          const finish = finishUnlocked(base.finish, season.past.length) ? base.finish : 'fosco';
          await profileStore.put({ ...base, season, finish }, 'current');
        }
      });
      announce('all');
    },
```

Também troque o comentário do contrato de `replaceAll` em `interface Repository` por:

```ts
  replaceAll(data: KlickExport): Promise<void>; // limpa solves, sessões e perfil e grava os do arquivo; a temporada fica a mais adiantada (a daqui ou a do arquivo)
```

- [ ] **Step 5: Validação do arquivo**

Em `app/src/data/transfer.ts`, acrescente `import { seasonFrom } from '../core/season';`. Em `profileOf`, antes do `return profile;`, acrescente:

```ts
  const season = seasonFrom(v.season);
  if (season) profile.season = season;
```

- [ ] **Step 6: Perfil provisório do AppState**

Em `app/src/ui/state/app.svelte.ts`:
- acrescente `import { defaultSeason } from '../../core/season';`;
- em `placeholderProfile`, acrescente `season: defaultSeason(),` depois de `currentSessionId: null,`.

- [ ] **Step 7: Rode os testes e os tipos**

Run: `pnpm test -- tests/unit/repository.test.ts tests/unit/transfer.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros. Se algum teste ou arquivo montar um `Profile` literal sem `season`, acrescente `season: defaultSeason()` nele (importado de `src/core/season`). Não mude mais nada.

Run: `pnpm test`
Expected: PASS (a suíte inteira).

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/data/repository.ts src/data/transfer.ts src/ui/state/app.svelte.ts tests/unit/repository.test.ts tests/unit/transfer.test.ts
git commit -m "feat(app): temporada no perfil, virada condicional e sem regredir

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Conferência da temporada no AppState

Spec: seção 5.5 (quando conferir, gravação, falha).

**Files:**
- Modify: `app/src/ui/state/app.svelte.ts`
- Test: `app/tests/unit/season-state.test.ts` (novo)

**Interfaces:**
- Consumes: `createSeasonTracker`, `planAdvance`, `seasonKey` e `MarkStatus` (Task 2); `Repository.advanceSeason` (Task 3).
- Produces (métodos públicos de `AppState`):
  - `seasonStatus(list?: Solve[], state?: SeasonState): MarkStatus[]`: os marcos da temporada dada (padrão: a atual) sobre a lista dada (padrão: `this.solves`). O resultado fica guardado por lista e temporada.
  - `checkSeason(): Promise<void>`: na fila de leituras e contas (`serial`); vira a temporada quando os 9 marcos estão feitos.

Atenção: um trabalho que já roda dentro de `serial` não pode **esperar** `checkSeason()`, porque a fila espera o próprio trabalho. Dentro da fila use `void this.checkSeason()`; fora dela, `await`.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/season-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SeasonState, Session, Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type KlickExport, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';

const DAY = 86400000;
const END = new Date(2026, 9, 13, 12).getTime();
let n = 0;

const session: Session = { id: 'hs', name: 'Histórico', event: '333', order: 0, createdAt: END - 20 * DAY, updatedAt: END - 20 * DAY, deletedAt: null };

// 1.000 solves de 3×3 de 50 s, 100 por dia nos 10 dias antes de END: fecham os 9 marcos da T1.
function t1History(): Solve[] {
  return Array.from({ length: 1000 }, (_, i) => {
    const at = END - (10 - Math.floor(i / 100)) * DAY + (i % 100) * 60000;
    return { id: `h${i}`, sessionId: 'hs', event: '333', ms: 50000, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null };
  });
}
const file = (solves: Solve[]): KlickExport => ({ format: 'klick', version: 1, exportedAt: END, sessions: [session], solves, profile: null });
const repoNamed = async (name = `season-${++n}`): Promise<Repository> => createRepository(await openKlickDb(name), { channel: null });
const make = (repo: Repository, now: () => number = () => END + 5000): AppState =>
  new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null, now });

// Uma T2 de teste em que qualquer solve de 3×3 depois do início fecha os 9 marcos.
const easyT2 = (startedAt: number): SeasonState => ({
  n: 2,
  startedAt,
  marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 1 })),
  basis: { single: 50000, ao5: 50000, ao12: 50000 },
});
const rec1 = { n: 1, startedAt: END - 10 * DAY, endedAt: END - DAY, solves: 1000, startAo12: null, endAo12: 50000 };

describe('temporada no AppState', () => {
  it('quem já tem os 9 marcos da T1 abre na T2, com a T1 no histórico', async () => {
    const repo = await repoNamed();
    await repo.importAll(file(t1History()));
    const a = make(repo);
    await a.init();
    const { season } = a.profile;
    expect(season.current.n).toBe(2);
    expect(season.current.startedAt).toBe(END + 5000);
    expect(season.current.basis).toEqual({ single: 50000, ao5: 50000, ao12: 50000 });
    expect(season.current.marks[2]).toEqual({ kind: 'ao5', target: 48000 });
    expect(season.past).toEqual([{ n: 1, startedAt: END - 10 * DAY, endedAt: END - DAY + 99 * 60000, solves: 1000, startAo12: null, endAo12: 50000 }]);
    expect((await repo.getProfile()).season).toEqual(season);
    expect(a.seasonStatus().some((m) => m.achieved)).toBe(false);
  });

  it('um solve que fecha a temporada vira para a seguinte; apagar o solve não desfaz a virada', async () => {
    const repo = await repoNamed();
    await repo.saveProfile({ season: { current: easyT2(END), past: [rec1] } });
    const a = make(repo, () => END + 2000);
    await a.init();
    expect(a.profile.season.current.n).toBe(2);
    const solve = await a.addSolve({ ms: 20000, penalty: null, at: END + 1000 });
    await a.checkSeason(); // espera a conferência que o solve pôs na fila
    expect(a.profile.season.current.n).toBe(3);
    expect(a.profile.season.past.map((r) => r.n)).toEqual([1, 2]);
    expect(a.profile.season.past[1]).toMatchObject({ n: 2, startedAt: END, endedAt: END + 1000, solves: 1, startAo12: 50000 });
    await a.deleteSolve(solve!.id);
    await a.checkSeason();
    expect(a.profile.season.current.n).toBe(3);
    expect((await repo.getProfile()).season.past).toHaveLength(2);
    expect(a.seasonStatus().some((m) => m.achieved)).toBe(false);
  });

  it('duas abas no mesmo banco viram a temporada uma vez só', async () => {
    const name = `season-${++n}`;
    const repo1 = await repoNamed(name);
    await repo1.importAll(file(t1History()));
    const repo2 = await repoNamed(name);
    const a = make(repo1, () => END + 5000);
    const b = make(repo2, () => END + 7000);
    await Promise.all([a.init(), b.init()]);
    const saved = (await repo1.getProfile()).season;
    expect(saved.past).toHaveLength(1);
    expect(a.profile.season).toEqual(saved);
    expect(b.profile.season).toEqual(saved);
  });

  it('a virada que falha avisa, não muda a temporada e entra na conferência seguinte', async () => {
    const repo = await repoNamed();
    await repo.importAll(file(t1History()));
    const advance = repo.advanceSeason.bind(repo);
    let fail = true;
    repo.advanceSeason = async (...args) => {
      if (fail) {
        fail = false;
        throw new Error('quota');
      }
      return advance(...args);
    };
    const a = make(repo);
    await a.init();
    expect(a.toast?.text).toBe(T.data.changeFailed);
    expect(a.profile.season.current.n).toBe(1);
    await a.checkSeason();
    expect(a.profile.season.current.n).toBe(2);
  });

  it('importar um arquivo que completa a T1 vira a temporada no fim da importação', async () => {
    const repo = await repoNamed();
    const a = make(repo);
    await a.init();
    expect(a.profile.season.current.n).toBe(1);
    await a.importKlick(file(t1History()));
    expect(a.profile.season.current.n).toBe(2);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/season-state.test.ts`
Expected: FAIL. `a.seasonStatus is not a function`, e a temporada continua 1.

- [ ] **Step 3: Implemente no AppState**

Em `app/src/ui/state/app.svelte.ts`:

1. **Imports.** Junte ao `import { defaultSeason } from '../../core/season';` da Task 3:

```ts
import { eventInfo } from '../../core/events';
import { createSeasonTracker, defaultSeason, type MarkStatus, planAdvance, seasonKey } from '../../core/season';
```

e acrescente `SeasonState` ao import de tipos de `../../core/types`.

2. **Campos.** Junto dos outros campos `private readonly` da classe:

```ts
  private readonly seasonTracker = createSeasonTracker();
  private readonly seasonMemo = new WeakMap<Solve[], { key: string; status: MarkStatus[] }>();
```

3. **Métodos.** Logo depois de `get eventSolves()`:

```ts
  // Os marcos de uma temporada (a atual, por padrão) sobre uma lista de solves (a de agora, por padrão). Guardado por lista: a mesma
  // lista não se conta duas vezes, e uma lista que só ganhou solves no fim continua a conta de onde parou (createSeasonTracker).
  seasonStatus(list: Solve[] = this.solves, state: SeasonState = this.profile.season.current): MarkStatus[] {
    const key = seasonKey(state);
    const hit = this.seasonMemo.get(list);
    if (hit?.key === key) return hit.status;
    const status = this.seasonTracker.evaluate(state, list);
    this.seasonMemo.set(list, { key, status });
    return status;
  }

  // Fecha a temporada atual quando os 9 marcos estão feitos (spec do sub-projeto 3, seção 5.5). Na fila: vê a lista e o perfil depois
  // das gravações que já estavam nela. A virada é condicional no repositório: se outra aba já virou, o perfil gravado volta e nada vira
  // duas vezes. Uma falha mostra o aviso; os marcos continuam feitos, então a conferência seguinte tenta de novo.
  // Dentro da fila, chame sem esperar (void): a fila espera o trabalho que está rodando.
  checkSeason(): Promise<void> {
    return this.serial(async () => {
      const progress = $state.snapshot(this.profile.season);
      const plan = planAdvance(progress, this.solves, this.now(), this.seasonStatus(this.solves, progress.current));
      if (!plan) return;
      await this.write(async () => {
        this.profile = await this.repo.advanceSeason(plan.fromN, plan.record, plan.next);
      });
    });
  }
```

4. **Onde conferir.** Em todos os pontos abaixo, use o código exato:
   - **`init()`:** logo depois de `await this.ensureSession();`:
     ```ts
         await this.checkSeason(); // quem já tinha os 9 marcos antes desta versão fecha a temporada ao abrir
     ```
   - **`afterSave(solve)`:** logo depois de `this.upsertSolve(solve);`:
     ```ts
         // Este solve pode ter dado o 9º marco: a conferência entra na fila, depois desta conta.
         if (eventInfo(solve.event).milestones) void this.checkSeason();
     ```
   - **`editSolve(change)`:** depois do `await this.write(…)`:
     ```ts
         void this.checkSeason(); // tirar um DNF pode completar uma média
     ```
   - **`undoDelete()`:** antes do `return ok;`:
     ```ts
         if (ok) await this.checkSeason();
     ```
   - **`restoreFromTrash(item)`:** antes do `return ok;`:
     ```ts
         if (ok) await this.checkSeason();
     ```
   - **`importJob(job)`:** logo depois de `await this.refresh();`:
     ```ts
         await this.checkSeason();
     ```
   - **`replaceFromBackup(id)`:** depois de `await this.reload();`:
     ```ts
         await this.checkSeason();
     ```

- [ ] **Step 4: Rode os testes**

Run: `pnpm test -- tests/unit/season-state.test.ts tests/unit/app-state.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS (a suíte inteira).

- [ ] **Step 5: Commit**

```bash
git add src/ui/state/app.svelte.ts tests/unit/season-state.test.ts
git commit -m "feat(app): a temporada vira ao abrir, depois do solve e depois de importar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tela do Centro com a temporada, o histórico e os acabamentos

Spec: seção 8 (palco e cartões 1 a 3) e seção 7.3 (textos dos marcos).

**Files:**
- Modify: `app/src/core/season.ts` (rótulos dos marcos)
- Modify: `app/src/strings.ts`
- Modify: `app/src/ui/format.ts`
- Modify: `app/src/ui/centro/CentroScreen.svelte`
- Test: `app/tests/unit/season.test.ts`, `app/tests/unit/format.test.ts`, `app/tests/unit/centro-screen.test.ts`

**Interfaces:**
- Consumes: `AppState.seasonStatus` (Task 4); `finishUnlocked`, `seasonFinish`, `seasonSolves`, `MarkStatus` e `marksFor` (Tasks 1 e 2).
- Produces:
  - em `core/season.ts`: `targetText(ms: number): string`, `markLabel(n: number, index: number, mark: SeasonMark): string` e `markMessage(n: number, index: number, mark: SeasonMark): string`;
  - em `ui/format.ts`: `shortDate(ts: number): string` ("13/10") e `fullDate(ts: number): string` ("08/10/2025");
  - em `strings.ts`: `T.marks.*`, `T.progress.of`, `T.progress.days`, `T.progress.spread`, `T.centro.topFace(n, since)`, `T.centro.history`, `T.centro.historyEmpty` e `T.centro.historyRow(...)`, mais o novo formato de `T.season(n, done, finish)`.

- [ ] **Step 1: Escreva os testes que falham**

Em `app/tests/unit/season.test.ts`, junte `markLabel`, `markMessage` e `targetText` ao import de `season`. Acrescente `MILESTONE_INFO` ao import de `../../src/strings` (crie esse import) e o teste:

```ts
describe('rótulos dos marcos (spec 7.3)', () => {
  it('a T1 usa os de hoje; da T2 em diante saem do tipo e da meta', () => {
    expect(seasonOne().marks.map((m, i) => markLabel(1, i, m))).toEqual(MILESTONES.map((id) => MILESTONE_INFO[id].label));
    const marks = marksFor({ single: 15210, ao5: 18770, ao12: 61000 });
    expect(marks.map((m, i) => markLabel(2, i, m))).toEqual([
      '50 solves na temporada',
      'Single abaixo de 15 s',
      'Média de 5 abaixo de 18 s',
      '7 dias seguidos',
      'Média de 12 abaixo de 1:00',
      '300 solves na temporada',
      'Média de 5 abaixo de 17 s',
      '5 seguidos dentro de 1.9 s',
      'Média de 12 abaixo de 58 s',
    ]);
    expect(targetText(9500)).toBe('9.5 s');
    expect(targetText(90000)).toBe('1:30');
    expect(markMessage(1, 5, seasonOne().marks[5])).toBe(MILESTONE_INFO.sub1.msg);
    expect(markMessage(2, 2, marks[2])).toBe('Média de 5 abaixo de 18 s');
  });
});
```

Em `app/tests/unit/format.test.ts`, acrescente `shortDate, fullDate` ao import de `../../src/ui/format` e o teste:

```ts
it('datas curtas e completas, no fuso local', () => {
  const ts = new Date(2025, 9, 8, 12).getTime();
  expect(shortDate(ts)).toBe('08/10');
  expect(fullDate(ts)).toBe('08/10/2025');
});
```

Em `app/tests/unit/centro-screen.test.ts`, acrescente os imports `import { marksFor } from '../../src/core/season';` e `import { T } from '../../src/strings';`, e o bloco:

```ts
describe('Centro: temporadas', () => {
  it('na T2 os marcos vêm da escada; o histórico mostra a T1; o Brilho está liberado e o Gelo diz de onde sai', async () => {
    const repo = createRepository(await openKlickDb(`ce-${++n}`), { channel: null });
    const basis = { single: 15210, ao5: 18770, ao12: 19340 };
    await repo.saveProfile({
      season: {
        current: { n: 2, startedAt: new Date(2026, 9, 13, 12).getTime(), marks: marksFor(basis), basis },
        past: [{ n: 1, startedAt: new Date(2025, 9, 8, 12).getTime(), endedAt: new Date(2026, 9, 13, 11).getTime(), solves: 1204, startAo12: null, endAo12: 62310 }],
      },
    });
    const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
    await a.init();
    render(CentroScreen, { app: a });
    expect(await screen.findByText(/Temporada 2 · 0 de 9 marcos · Fosco/)).toBeInTheDocument();
    expect(screen.getByText('Face de cima · Temporada 2, desde 13/10')).toBeInTheDocument();
    expect(screen.getByText('Média de 5 abaixo de 18 s')).toBeInTheDocument();
    expect(screen.getByText('5 seguidos dentro de 1.9 s')).toBeInTheDocument();
    expect(screen.getByText('T1 · 08/10/2025 a 13/10/2026 · 1.204 solves · média de 12 em 1:02.31 · Brilho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Brilho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gelo · sai na T2' })).toBeInTheDocument();
  });

  it('sem temporada fechada, o histórico diz que a primeira está em andamento', async () => {
    const { a } = await app();
    render(CentroScreen, { app: a });
    expect(await screen.findByText(T.centro.historyEmpty)).toBeInTheDocument();
    expect(screen.getByText('Face de cima · Temporada 1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/season.test.ts tests/unit/format.test.ts tests/unit/centro-screen.test.ts`
Expected: FAIL. Faltam `markLabel`, `shortDate` e os textos novos.

- [ ] **Step 3: Textos**

Em `app/src/strings.ts`:

1. **`FINISH_INFO`:** troque os `unlock` por `'padrão'`, `'sai na T1'`, `'sai na T2'` e `'sai na T3'` (fosco, brilho, gelo, carbono).
2. **`progress`:** acrescente, sem mexer nos que existem:
   ```ts
       of: (n: number, total: number) => `${n} de ${total}`,
       days: (n: number, total: number) => `${n} de ${total} dias`,
       spread: (text: string) => `menor variação ${text}`,
   ```
3. **`marks`:** logo depois do bloco `progress`, acrescente:
   ```ts
     // Rótulos dos marcos da T2 em diante (core/season.ts). Os da T1 ficam em MILESTONE_INFO.
     marks: {
       count: (target: number) => `${target} solves na temporada`,
       single: (time: string) => `Single abaixo de ${time}`,
       ao5: (time: string) => `Média de 5 abaixo de ${time}`,
       ao12: (time: string) => `Média de 12 abaixo de ${time}`,
       streak: (days: number) => `${days} dias seguidos`,
       steady: (sec: string) => `5 seguidos dentro de ${sec} s`,
     },
   ```
4. **`centro`:** troque `topFace: 'Face de cima · marcos',` por:
   ```ts
       topFace: (n: number, since: string | null) => (since ? `Face de cima · Temporada ${n}, desde ${since}` : `Face de cima · Temporada ${n}`),
       history: 'Temporadas',
       historyEmpty: 'A primeira temporada ainda está em andamento.',
       // "T1 · 08/10/2025 a 13/10/2026 · 1.204 solves · média de 12 em 1:02.31 · Brilho": sem média ou sem acabamento, a parte some.
       historyRow: (n: number, from: string, to: string, solves: number, ao12: string | null, finish: string | null) =>
         [`T${n}`, `${from} a ${to}`, `${solves.toLocaleString('pt-BR')} ${solves === 1 ? 'solve' : 'solves'}`, ao12 ? `média de 12 em ${ao12}` : null, finish]
           .filter((part) => part !== null)
           .join(' · '),
   ```
5. **`season`:** no fim do arquivo, troque por:
   ```ts
     season: (n: number, done: number, finish: string) => `Temporada ${n} · ${done} de 9 marcos · ${finish}`,
   ```

- [ ] **Step 4: Rótulos em `season.ts` e datas em `format.ts`**

Em `app/src/core/season.ts`:
- troque `import { bestAverage, … } from './stats';` para incluir `MILESTONES`;
- acrescente `import { MILESTONE_INFO, T } from '../strings';`;
- acrescente ao fim:

```ts
// --- Textos dos marcos ---

// A meta redonda como a pessoa fala: "18 s", "9.5 s", "1:30".
export function targetText(ms: number): string {
  if (ms >= 60000) {
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
}

// O rótulo de um marco na lista. A T1 mantém os de hoje (MILESTONE_INFO, na ordem de MILESTONES).
export function markLabel(n: number, index: number, mark: SeasonMark): string {
  if (n === 1) return MILESTONE_INFO[MILESTONES[index]].label;
  switch (mark.kind) {
    case 'count':
      return T.marks.count(mark.target);
    case 'single':
      return T.marks.single(targetText(mark.target));
    case 'ao5':
      return T.marks.ao5(targetText(mark.target));
    case 'ao12':
      return T.marks.ao12(targetText(mark.target));
    case 'streak':
      return T.marks.streak(mark.target);
    case 'steady':
      return T.marks.steady((mark.target / 1000).toFixed(1));
  }
}

// A frase do coach para um marco conquistado. A T1 mantém as de hoje; da T2 em diante, o próprio rótulo.
export function markMessage(n: number, index: number, mark: SeasonMark): string {
  return n === 1 ? MILESTONE_INFO[MILESTONES[index]].msg : markLabel(n, index, mark);
}
```

Em `app/src/ui/format.ts`, acrescente ao fim:

```ts
const two = (n: number): string => String(n).padStart(2, '0');

// "13/10": dia e mês, no fuso local.
export function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
}

// "08/10/2025": dia, mês e ano, no fuso local.
export function fullDate(ts: number): string {
  return `${shortDate(ts)}/${new Date(ts).getFullYear()}`;
}
```

Se `format.ts` já tiver um `two` ou um `pad` com a mesma função, reaproveite em vez de declarar outro.

- [ ] **Step 5: A tela**

Em `app/src/ui/centro/CentroScreen.svelte`:

1. **Comentário e imports.** Troque o comentário de abertura e os imports do `<script>` por:

```ts
  // A tela do Centro: o cubo com a jornada, os acabamentos, os marcos da temporada atual (face de cima), a trilha (face lateral), o
  // histórico das temporadas e o modo silencioso. Os marcos valem só para os solves de 3×3. Os textos ficam em strings.ts.
  import { finishUnlocked, type MarkStatus, markLabel, seasonFinish, seasonSolves } from '../../core/season';
  import { currentStreak, formatMs } from '../../core/stats';
  import type { SeasonRecord } from '../../core/types';
  import { FINISH_INFO, T, TRAIL } from '../../strings';
  import { type Palette, paletteFor, renderCentro, type CentroTheme } from '../centro';
  import { fullDate, shortDate } from '../format';
  import type { AppState } from '../state/app.svelte';
```

2. **Derivados.** Troque `unlocked` e os derivados `milestones`, `done` e `nextMilestone` por:

```ts
  const unlocked = (f: FinishKey): boolean => finishUnlocked(f, app.profile.season.past.length);

  // A temporada atual: os marcos saem dos solves de 3×3 depois do início dela (a conta é do AppState, guardada por lista).
  const season = $derived(app.profile.season.current);
  const status = $derived(app.seasonStatus(app.solves, season));
  const done = $derived(status.filter((m) => m.achieved).length);
  const nextMilestone = $derived(status.findIndex((m) => !m.achieved));
  const streakNow = $derived(currentStreak(seasonSolves(app.solves, season), clock));
  const marks = $derived(
    status.map((m, i) => ({ label: markLabel(season.n, i, m.mark), achieved: m.achieved, progress: m.achieved ? null : progressText(m) })),
  );
  const history = $derived([...app.profile.season.past].reverse());
```

3. **Funções.** Acrescente, junto das outras funções do script:

```ts
  // O que falta num marco pendente: quantos, o melhor até agora, os dias seguidos de agora ou a menor variação.
  function progressText(m: MarkStatus): string | null {
    const { kind, target } = m.mark;
    switch (kind) {
      case 'count':
        return target === 1 ? null : T.progress.of(Math.min(m.current ?? 0, target), target);
      case 'single':
      case 'ao5':
      case 'ao12':
        return m.current === null ? null : T.progress.best(formatMs(m.current));
      case 'streak':
        return T.progress.days(Math.min(streakNow, target), target);
      case 'steady':
        return m.current === null ? null : T.progress.spread(formatMs(m.current));
    }
  }

  function historyRow(r: SeasonRecord): string {
    const finish = seasonFinish(r.n);
    return T.centro.historyRow(r.n, fullDate(r.startedAt), fullDate(r.endedAt), r.solves, r.endAo12 === null ? null : formatMs(r.endAo12), finish ? FINISH_INFO[finish].label : null);
  }
```

4. **Usos de `unlocked`.** Em `pickFinish`, troque `unlocked(f, done)` por `unlocked(f)`. No markup, troque `{@const locked = !unlocked(f, done)}` por `{@const locked = !unlocked(f)}`.

5. **Linha de status.** Troque `{T.season(done, finishName(app.profile.finish))}` por `{T.season(season.n, done, finishName(app.profile.finish))}`.

6. **Cartão da face de cima.** Troque o cartão inteiro (o primeiro `<div class="card">`) por:

```svelte
      <div class="card">
        <div class="label">{T.centro.topFace(season.n, season.n === 1 ? null : shortDate(season.startedAt))}</div>
        <ul class="mlist">
          {#each marks as m, i (i)}
            <li class:done={m.achieved} class:next={!m.achieved && i === nextMilestone}>
              <i></i>{m.label}
              {#if m.achieved}<em>✓</em>{:else if m.progress}<em>{m.progress}</em>{/if}
            </li>
          {/each}
        </ul>
      </div>
```

7. **Cartão do histórico.** Depois do cartão da trilha e antes do cartão do modo silencioso:

```svelte
      <div class="card">
        <div class="label">{T.centro.history}</div>
        {#if history.length === 0}
          <p class="muted">{T.centro.historyEmpty}</p>
        {:else}
          <ul class="mlist">
            {#each history as r (r.n)}
              <li class="done"><i></i>{historyRow(r)}</li>
            {/each}
          </ul>
        {/if}
      </div>
```

8. **Sobras.** Remova os imports e usos que sobraram de `MILESTONES`, `milestoneProgress` e `MILESTONE_INFO`.

- [ ] **Step 6: Rode os testes e os tipos**

Run: `pnpm test -- tests/unit/season.test.ts tests/unit/format.test.ts tests/unit/centro-screen.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS. Se algum teste antigo procurar o texto `Temporada 1 · N de 9 marcos · acabamento X`, atualize para o formato novo, sem a palavra "acabamento".

- [ ] **Step 7: Commit**

```bash
git add src/core/season.ts src/strings.ts src/ui/format.ts src/ui/centro/CentroScreen.svelte tests/unit/season.test.ts tests/unit/format.test.ts tests/unit/centro-screen.test.ts
git commit -m "feat(app): tela do Centro com a temporada, o histórico e os acabamentos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Coach com os gatilhos novos e a temporada no caminho do solve

Spec: seção 7 inteira; seção 8 ("Na virada da temporada").

**Files:**
- Modify: `app/src/core/season.ts` ("quase lá")
- Modify: `app/src/core/coach.ts` (troca o arquivo inteiro)
- Modify: `app/src/core/stats.ts` (sai `createMilestoneTracker`)
- Modify: `app/src/strings.ts` (textos do coach)
- Modify: `app/src/ui/timer/TimerScreen.svelte`
- Test: `app/tests/unit/season.test.ts`, `app/tests/unit/coach.test.ts`, `app/tests/unit/stats.test.ts`, `app/tests/unit/timer-screen.test.ts`

**Interfaces:**
- Consumes: `AppState.seasonStatus` (Task 4); `closeRecord`, `seasonSolves`, `seasonFinish`, `markMessage` e `targetText` (Tasks 2 e 5).
- Produces:
  - em `core/season.ts`: `interface NearMark { index: number; mark: SeasonMark; gap: number }` e `firstNearInSession(marks: readonly SeasonMark[], achieved: readonly boolean[], prior: Solve[], sessionPrior: Solve[], solve: Solve): NearMark | null`;
  - em `core/coach.ts`: `interface SeasonEnd { n: number; solves: number; startAo12: number | null; endAo12: number | null; finish: FinishId | null }`, `interface CoachSeason { state: SeasonState; before: MarkStatus[]; after: MarkStatus[]; prior: Solve[]; end: SeasonEnd | null }`;
  - `CoachInput.season?: CoachSeason` substitui `newMilestones` e `achievedCount`;
  - os ids de mensagem novos são `'season-end'`, `'near'`, `'week'` e `'outlier'`.
- A Task 11 usa a variável `seasonClosed` que este passo cria no `finishSolve`.

- [ ] **Step 1: Escreva os testes que falham**

Em `app/tests/unit/season.test.ts`, junte `firstNearInSession` ao import de `season` e acrescente:

```ts
describe('quase lá (spec 7.2)', () => {
  const filler = Array.from({ length: 8 }, () => ({ kind: 'count' as const, target: 99999 }));

  it('uma vez por marco por sessão: um solve anterior da sessão que já ficou perto cala o seguinte', () => {
    const marks = [{ kind: 'ao5' as const, target: 18000 }, ...filler];
    const prior = [18300, 18400, 18200, 18500].map((ms, i) => sv(ms, i + 1));
    const first = sv(18350, 5);
    expect(firstNearInSession(marks, Array(9).fill(false), prior, prior, first)).toEqual({ index: 0, mark: marks[0], gap: 350 });
    const all = [...prior, first];
    expect(firstNearInSession(marks, Array(9).fill(false), all, all, sv(18300, 6))).toBeNull();
    expect(firstNearInSession(marks, Array(9).fill(false), all, [], sv(18300, 6))).toEqual({ index: 0, mark: marks[0], gap: 350 });
  });

  it('marco já feito, meta batida ou longe demais não ficam perto', () => {
    const marks = [{ kind: 'single' as const, target: 15000 }, ...filler];
    expect(firstNearInSession(marks, [true, ...Array(8).fill(false)], [], [], sv(15200, 1))).toBeNull();
    expect(firstNearInSession(marks, Array(9).fill(false), [], [], sv(14900, 1))).toBeNull();
    expect(firstNearInSession(marks, Array(9).fill(false), [], [], sv(15500, 1))).toBeNull(); // 3,3% acima
    expect(firstNearInSession(marks, Array(9).fill(false), [], [], sv(15000, 1, 'DNF'))).toBeNull();
  });
});
```

Em `app/tests/unit/coach.test.ts`:

1. **Imports.** Acrescente:

```ts
import type { CoachSeason } from '../../src/core/coach';
import { type MarkStatus, seasonOne } from '../../src/core/season';
import type { SeasonMark, SeasonState } from '../../src/core/types';
```

2. **Ajudantes.** Logo depois de `const pick = …`, acrescente:

```ts
// Os marcos de uma temporada, com os índices dados já feitos.
const statusOf = (state: SeasonState, done: number[]): MarkStatus[] =>
  state.marks.map((mark, i) => ({ mark, achieved: done.includes(i), at: done.includes(i) ? NOW : null, current: null }));
const seasonIn = (state: SeasonState, before: number[], after: number[], prior: Solve[] = []): CoachSeason => ({
  state, before: statusOf(state, before), after: statusOf(state, after), prior, end: null,
});
const t1 = (before: number[], after: number[]) => seasonIn(seasonOne(), before, after);
const t2 = (marks: SeasonMark[]): SeasonState => ({ n: 2, startedAt: 0, marks, basis: { single: null, ao5: null, ao12: null } });
// Um marco de teste na frente e 8 que nunca ficam perto.
const pending = (m: SeasonMark): SeasonMark[] => [m, ...Array.from({ length: 8 }, () => ({ kind: 'count' as const, target: 99999 }))];
```

3. **Testes de marco antigos.** Nos testes `'recorde de single tem prioridade máxima'` e `'marco conquistado'`, troque `newMilestones: ['sub1'], achievedCount: 6` por `season: t1([0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5])`.

4. **Teste de marco desconhecido.** Troque o teste `'marco que a interface não conhece é ignorado em vez de quebrar a mensagem'` por:

```ts
  it('da T2 em diante, a mensagem do marco é o rótulo dele', () => {
    const msg = pick({ solve: sv(17000), season: seasonIn(t2(pending({ kind: 'ao5', target: 18000 })), [], [0]) });
    expect(msg?.text).toBe('Média de 5 abaixo de 18 s. Marco 1 de 9.');
  });
```

5. **Gatilhos novos.** Acrescente ao fim do arquivo:

```ts
describe('gatilhos novos do coach (spec do sub-projeto 3, seção 7)', () => {
  it('fim de temporada vem antes de tudo, com a média e o acabamento', () => {
    const season = { ...t1([0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7, 8]), end: { n: 2, solves: 412, startAo12: 18610, endAo12: 17840, finish: 'gelo' as const } };
    const msg = pick({ solve: sv(55000), history: many([59000]), season });
    expect(msg?.id).toBe('season-end');
    expect(msg?.text).toBe('Temporada 2 completa: 412 solves, melhor média de 12 de 0:18.61 para 0:17.84. Gelo liberado.');
  });

  it('o fim da T1 sai sem média; da T4 em diante, sem acabamento', () => {
    expect(T.coach.seasonEnd(1, 1204, null, null, 'Brilho')).toBe('Temporada 1 completa: 1.204 solves. Brilho liberado.');
    expect(T.coach.seasonEnd(4, 1, '0:15.00', '0:14.00', null)).toBe('Temporada 4 completa: 1 solve, melhor média de 12 de 0:15.00 para 0:14.00.');
  });

  it('quase lá na média de 5, uma vez por sessão', () => {
    const state = t2(pending({ kind: 'ao5', target: 18000 }));
    const prior = many([18300, 18400, 18200, 18500]);
    const solve = sv(18350);
    // Ao5 = 18300, 18400 e 18350 (sem 18200 e 18500) = 18350: 0,35 s acima de 18 s (1,9%).
    const msg = pick({ solve, history: prior, sessionSolves: prior, season: seasonIn(state, [], [], prior) });
    expect(msg?.id).toBe('near');
    expect(msg?.text).toBe('Faltam 0.35 s para a média de 5 abaixo de 18 s.');
    const all = [...prior, solve];
    const next = sv(18300, null, NOW + 60000);
    expect(pick({ solve: next, history: all, sessionSolves: all, season: seasonIn(state, [], [], all) })?.id).not.toBe('near');
    expect(pick({ solve: next, history: all, sessionSolves: [], season: seasonIn(state, [], [], all) })?.id).toBe('near');
  });

  it('quase lá no single, no volume e na sequência de dias', () => {
    const single = t2(pending({ kind: 'single', target: 15000 }));
    expect(pick({ solve: sv(15210), history: many([14000]), season: seasonIn(single, [], []) })?.text).toBe('Esse ficou a 0.21 s do single abaixo de 15 s.');
    const count = t2(pending({ kind: 'count', target: 300 }));
    const prior = Array.from({ length: 290 }, (_, i) => sv(20000, null, NOW - DAY + i));
    expect(pick({ solve: sv(20000), history: many([10000]), season: seasonIn(count, [], [], prior) })?.text).toBe('Faltam 9 solves para os 300 da temporada.');
    const streak = t2(pending({ kind: 'streak', target: 7 }));
    const days = Array.from({ length: 5 }, (_, i) => sv(20000, null, NOW - (5 - i) * DAY));
    expect(pick({ solve: sv(20000), history: many([10000]), season: seasonIn(streak, [], [], days) })?.text).toBe('6 dias seguidos. Mais um fecha o marco.');
  });

  it('semana melhor: no primeiro solve do dia, os 7 dias anteriores contra os 7 antes deles', () => {
    const at = (daysAgo: number, k: number) => NOW - daysAgo * DAY - k * 60000;
    const older = Array.from({ length: 12 }, (_, k) => sv(21000, null, at(10, k)));
    const recent = Array.from({ length: 12 }, (_, k) => sv(20000, null, at(3, k)));
    const history = [...older, ...recent].sort((x, y) => x.at - y.at);
    const msg = pick({ solve: sv(30000), history });
    expect(msg?.id).toBe('week');
    expect(msg?.text).toBe('Sua semana no 3×3 foi 1.00 s mais rápida que a anterior.');
    expect(pick({ solve: sv(30000), history: [...history, sv(20000, null, NOW - 60000)] })?.id).not.toBe('week'); // já houve solve hoje
    expect(pick({ solve: sv(30000), history: history.slice(1) })?.id).not.toBe('week'); // só 11 solves na semana mais antiga
  });

  it('fora da curva: o primeiro solve da sessão acima de 1,25 vez a média de 12, sem DNF', () => {
    const session = many(Array.from({ length: 12 }, (_, i) => 20000 + i * 100));
    // Ao12 dos 12 = 20550. 26 s passa de 1,25 × 20,55 s; com ele, a média de 12 fica em 20,65 s.
    const msg = pick({ solve: sv(26000), history: session, sessionSolves: session });
    expect(msg?.id).toBe('outlier');
    expect(msg?.text).toBe('Esse escapou. A média de 12 segue em 0:20.65.');
    const after = [...session, sv(26000)];
    expect(pick({ solve: sv(27000, null, NOW + 60000), history: after, sessionSolves: after })?.id).not.toBe('outlier');
    expect(pick({ solve: sv(26000, 'DNF'), history: session, sessionSolves: session })?.id).toBe('first-dnf');
  });
});
```

Em `app/tests/unit/stats.test.ts`, apague o `describe('marcos: conta que continua de onde parou', …)` inteiro e tire `createMilestoneTracker` do import. A conta incremental agora é testada em `season.test.ts`.

Em `app/tests/unit/timer-screen.test.ts`, dentro de `describe('tela do Timer: solve, reação e nota', …)`, acrescente:

```ts
  it('um solve que fecha a temporada mostra o fim de temporada no coach, segura a face de cima cheia e depois esvazia', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    await repo.saveProfile({
      season: {
        current: { n: 2, startedAt: Date.now() - 1000, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 1 })), basis: { single: 50000, ao5: 50000, ao12: 50000 } },
        past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 1000, startAo12: null, endAo12: 50000 }],
      },
    });
    await a.reload();
    render(TimerScreen, { app: a });
    const litFaces = () => document.querySelectorAll('[data-centro-slot] svg.centro g[transform="matrix(1,0,0.3,-0.3,0,30)"] .lit').length;
    await solveByKeys();
    expect(await screen.findByText('Temporada 2 completa: 1 solve. Gelo liberado.', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(litFaces()).toBe(9);
    await waitFor(() => expect(a.profile.season.current.n).toBe(3));
    await waitFor(() => expect(litFaces()).toBe(0), { timeout: 4000 });
  });
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/season.test.ts tests/unit/coach.test.ts tests/unit/timer-screen.test.ts`
Expected: FAIL. Falta `firstNearInSession`, o coach não conhece `season` e a tela não fala de fim de temporada.

- [ ] **Step 3: "Quase lá" em `season.ts`**

Acrescente ao fim de `app/src/core/season.ts`:

```ts
// --- "Quase lá" (spec 7.2) ---

const NEAR = 1.03; // até 3% acima da meta
const NEAR_COUNT = 10; // faltam até 10 solves

export interface NearMark {
  index: number;
  mark: SeasonMark;
  gap: number; // tempo: ms acima da meta; count: solves que faltam; streak: 1 (falta um dia)
}

// Dias seguidos com solve, terminando no dia do solve `end` (a lista em ordem de tempo).
function runEndingAt(list: Solve[], end: number): number {
  let run = 1;
  let day = dayKey(list[end].at);
  for (let i = end - 1; i >= 0; i--) {
    const k = dayKey(list[i].at);
    if (k === day) continue;
    if (Math.round((noon(day) - noon(k)) / DAY) !== 1) break;
    run += 1;
    day = k;
  }
  return run;
}

// Quanto falta quando o solve `end` da lista (os da temporada, em ordem) deixa o marco perto; null quando não deixa.
function nearGap(mark: SeasonMark, list: Solve[], end: number): number | null {
  const solve = list[end];
  switch (mark.kind) {
    case 'ao5':
    case 'ao12': {
      const n = mark.kind === 'ao5' ? 5 : 12;
      if (end + 1 < n) return null;
      const v = trimmedMean(list.slice(end + 1 - n, end + 1).map(effectiveMs));
      return v !== Infinity && v > mark.target && v <= mark.target * NEAR ? v - mark.target : null;
    }
    case 'single': {
      const e = effectiveMs(solve);
      return e !== Infinity && e > mark.target && e <= mark.target * NEAR ? e - mark.target : null;
    }
    case 'count': {
      const left = mark.target - (end + 1);
      return left >= 1 && left <= NEAR_COUNT ? left : null;
    }
    case 'streak':
      if (end > 0 && dayKey(list[end - 1].at) === dayKey(solve.at)) return null; // só o primeiro solve do dia
      return runEndingAt(list, end) === mark.target - 1 ? 1 : null;
    case 'steady':
      return null;
  }
}

// O primeiro marco pendente que este solve deixou perto e que nenhum solve anterior da sessão já tinha deixado: uma vez por marco por
// sessão, sem memória (a conta refaz os anteriores). `prior` são os solves da temporada antes dele; `sessionPrior`, os da sessão.
export function firstNearInSession(
  marks: readonly SeasonMark[],
  achieved: readonly boolean[],
  prior: Solve[],
  sessionPrior: Solve[],
  solve: Solve,
): NearMark | null {
  const list = [...prior, solve];
  const end = prior.length;
  const inSession = new Set(sessionPrior.map((s) => s.id));
  for (let index = 0; index < marks.length; index++) {
    if (achieved[index]) continue;
    const mark = marks[index];
    const gap = nearGap(mark, list, end);
    if (gap === null) continue;
    let said = false;
    for (let j = 0; j < end && !said; j++) said = inSession.has(list[j].id) && nearGap(mark, list, j) !== null;
    if (!said) return { index, mark: { ...mark }, gap };
  }
  return null;
}
```

- [ ] **Step 4: Textos do coach**

Em `app/src/strings.ts`, no bloco `coach`, acrescente depois de `back`:

```ts
    seasonEnd: (n: number, solves: number, from: string | null, to: string | null, finish: string | null) =>
      `Temporada ${n} completa: ${solves.toLocaleString('pt-BR')} ${solves === 1 ? 'solve' : 'solves'}${from && to ? `, melhor média de 12 de ${from} para ${to}` : ''}.${finish ? ` ${finish} liberado.` : ''}`,
    nearAverage: (n: number, gapMs: number, target: string) => `Faltam ${sec(gapMs)} s para a média de ${n} abaixo de ${target}.`,
    nearSingle: (gapMs: number, target: string) => `Esse ficou a ${sec(gapMs)} s do single abaixo de ${target}.`,
    nearCount: (left: number, target: number, inSeason: boolean) =>
      `Faltam ${left} ${left === 1 ? 'solve' : 'solves'} para os ${target.toLocaleString('pt-BR')}${inSeason ? ' da temporada' : ' solves'}.`,
    nearStreak: (days: number) => `${days - 1} dias seguidos. Mais um fecha o marco.`,
    week: (event: string, diffMs: number) => `Sua semana no ${event} foi ${sec(diffMs)} s mais rápida que a anterior.`,
    outlier: (ao12: string) => `Esse escapou. A média de 12 segue em ${ao12}.`,
```

- [ ] **Step 5: Novo `core/coach.ts`**

Troque o conteúdo inteiro de `app/src/core/coach.ts` por:

```ts
// Escolhe no máximo uma mensagem do coach por solve, pela prioridade da spec do sub-projeto 3 (seção 7.1). Porte de
// prototype/scripts/coach.js, com o recorde de média pela média oficial do evento (Ao5, ou Mo3 no 6×6, no 7×7 e no 3BLD) e os gatilhos
// novos: fim de temporada, quase lá, semana melhor e fora da curva. Tudo sai do histórico, sem estado guardado.
import { FINISH_INFO, T } from '../strings';
import { eventInfo } from './events';
import { firstNearInSession, type MarkStatus, markMessage, type NearMark, targetText } from './season';
import {
  averageOf,
  bestAverage,
  bestMean,
  bestSingle,
  effectiveMs,
  formatMs,
  officialAverage,
  officialAverageLabel,
  solvesOnDay,
  trimmedMean,
} from './stats';
import type { EventId, FinishId, SeasonState, Solve } from './types';

export interface CoachMessage {
  id: string;
  text: string;
}

// O solve fechou a temporada: o resumo que o coach fala.
export interface SeasonEnd {
  n: number;
  solves: number;
  startAo12: number | null;
  endAo12: number | null;
  finish: FinishId | null; // o acabamento que a temporada liberou (só as três primeiras)
}

// A temporada do solve, para os gatilhos de marco e de "quase lá". Só o 3×3 tem.
export interface CoachSeason {
  state: SeasonState; // a temporada em que o solve caiu (a de quando ele começou: a virada pode já ter gravado a próxima)
  before: MarkStatus[]; // os marcos antes do solve
  after: MarkStatus[]; // os marcos depois dele
  prior: Solve[]; // os solves da temporada antes dele
  end: SeasonEnd | null; // o solve fechou a temporada
}

export interface CoachInput {
  solve: Solve; // o solve que acabou de sair
  history: Solve[]; // todos os solves anteriores, do mesmo evento do solve (cronológico): dele saem os recordes
  sessionSolves: Solve[]; // os anteriores da sessão atual
  season?: CoachSeason; // a interface só passa no 3×3
  dailyGoal?: number;
  // A meta do dia e o "de volta" são da pessoa, não do evento, e history só tem o evento. A interface passa estes dois:
  todayCount?: number; // solves de hoje em todos os eventos, contando este; sem ele, conta os de hoje que vieram em history
  prevAnyAt?: number; // momento do solve anterior da pessoa, de qualquer evento; sem ele, o do último solve de history
  silent?: boolean;
  event: EventId; // diz qual é a média oficial: Ao5 ou Mo3
}

const DAY = 86400000;

// Estável: os últimos 5 solves, sem DNF, dentro de 3 s entre o melhor e o pior.
function stableWindow(list: Solve[]): boolean {
  const w = list.slice(-5).map(effectiveMs);
  return w.length === 5 && w.every((v) => v !== Infinity) && Math.max(...w) - Math.min(...w) <= 3000;
}

// Cansaço: 30+ solves na sessão e a média de 5 atual mais de 8% acima da média dos 12 primeiros.
function tired(session: Solve[]): boolean {
  if (session.length < 30) return false;
  const first12 = averageOf(session.slice(0, 12), 12);
  const current5 = averageOf(session, 5);
  return first12 !== null && first12 !== Infinity && current5 !== null && current5 !== Infinity && current5 > first12 * 1.08;
}

// A média nova bate a melhor de antes: precisa ser válida (DNF não é recorde) e estritamente menor. Sem melhor de antes, não bate.
const beats = (current: number, previousBest: number | null): boolean => previousBest !== null && current !== Infinity && current < previousBest;

// Recorde de média, com o tamanho da média que o bateu. Vale a média oficial do evento e, nos eventos de Ao5, também a de 12.
// O Mo3 é média simples, então o melhor de antes sai de bestMean: bestAverage(s, 3) daria a mediana de cada janela.
function averageRecord(history: Solve[], all: Solve[], event: EventId): { n: number; value: number } | null {
  const { n, kind } = officialAverageLabel(event);
  const official = officialAverage(all, event);
  if (official !== null && beats(official, kind === 'mo' ? bestMean(history, n) : bestAverage(history, n))) return { n, value: official };
  if (kind === 'ao') {
    const twelve = averageOf(all, 12);
    if (twelve !== null && beats(twelve, bestAverage(history, 12))) return { n: 12, value: twelve };
  }
  return null;
}

function nearText(n: number, near: NearMark): string {
  const { mark, gap } = near;
  switch (mark.kind) {
    case 'ao5':
      return T.coach.nearAverage(5, gap, targetText(mark.target));
    case 'ao12':
      return T.coach.nearAverage(12, gap, targetText(mark.target));
    case 'single':
      return T.coach.nearSingle(gap, targetText(mark.target));
    case 'count':
      return T.coach.nearCount(gap, mark.target, n > 1);
    default:
      return T.coach.nearStreak(mark.target);
  }
}

// O começo do dia local de ts, `back` dias antes (setDate respeita o horário de verão).
function dayStart(ts: number, back = 0): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - back);
  return d.getTime();
}

const WEEK_MIN = 12; // solves sem DNF em cada janela
const WEEK_GAIN = 0.01; // a semana recente precisa ser pelo menos 1% mais rápida

function finiteMean(list: Solve[]): { n: number; mean: number } {
  const v = list.map(effectiveMs).filter((x) => x !== Infinity);
  return { n: v.length, mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : Infinity };
}

// Semana melhor: no primeiro solve do dia no evento, a média (sem DNF) dos 7 dias anteriores contra a dos 7 antes deles. Devolve
// quanto a semana recente foi mais rápida (ms), ou null.
function weekBetter(history: Solve[], solve: Solve): number | null {
  const today = dayStart(solve.at);
  if (history.some((s) => s.at >= today)) return null;
  const weekAgo = dayStart(solve.at, 7);
  const recent = finiteMean(history.filter((s) => s.at >= weekAgo && s.at < today));
  const before = finiteMean(history.filter((s) => s.at >= dayStart(solve.at, 14) && s.at < weekAgo));
  if (recent.n < WEEK_MIN || before.n < WEEK_MIN) return null;
  const gain = before.mean - recent.mean;
  return gain >= before.mean * WEEK_GAIN ? gain : null;
}

const OUTLIER = 1.25;

// Fora da curva no solve `end` da lista: sem DNF, com 12 antes, acima de 1,25 vez a média de 12 deles, e a média de 12 com ele continua
// válida (a frase diz que ela "segue"). Devolve essa média, ou null.
function outlierAt(list: Solve[], end: number): number | null {
  if (end < 12) return null;
  const e = effectiveMs(list[end]);
  if (e === Infinity) return null;
  const before = trimmedMean(list.slice(end - 12, end).map(effectiveMs));
  if (before === Infinity || e <= before * OUTLIER) return null;
  const withIt = trimmedMean(list.slice(end - 11, end + 1).map(effectiveMs));
  return withIt === Infinity ? null : withIt;
}

// Só o primeiro da sessão: nenhum solve anterior da sessão foi fora da curva.
function outlier(session: Solve[]): number | null {
  const end = session.length - 1;
  const value = outlierAt(session, end);
  if (value === null) return null;
  for (let i = 12; i < end; i++) if (outlierAt(session, i) !== null) return null;
  return value;
}

export function pickCoachMessage({
  solve,
  history,
  sessionSolves,
  season,
  dailyGoal = 20,
  todayCount,
  prevAnyAt,
  silent = false,
  event,
}: CoachInput): CoachMessage | null {
  if (silent || !solve) return null;
  const e = effectiveMs(solve);
  const all = [...history, solve];

  const end = season?.end;
  if (end) {
    const from = end.startAo12 === null ? null : formatMs(end.startAo12);
    const to = end.endAo12 === null ? null : formatMs(end.endAo12);
    return { id: 'season-end', text: T.coach.seasonEnd(end.n, end.solves, from, to, end.finish ? FINISH_INFO[end.finish].label : null) };
  }

  const prevBest = bestSingle(history);
  if (prevBest !== null && e !== Infinity && e < prevBest) return { id: 'pb-single', text: T.coach.pbSingle(prevBest - e) };

  const record = averageRecord(history, all, event);
  if (record) return { id: 'pb-average', text: T.coach.pbAverage(record.n, formatMs(record.value)) };

  if (season) {
    // O marco que este solve acendeu (o último, se foram vários) e, sem marco, o primeiro que ficou perto.
    const fresh = season.after.flatMap((m, i) => (m.achieved && !season.before[i]?.achieved ? [i] : []));
    const lit = fresh.at(-1);
    if (lit !== undefined) {
      const count = season.after.filter((m) => m.achieved).length;
      return { id: 'milestone', text: T.coach.milestone(markMessage(season.state.n, lit, season.state.marks[lit]), count) };
    }
    const near = firstNearInSession(season.state.marks, season.after.map((m) => m.achieved), season.prior, sessionSolves, solve);
    if (near) return { id: 'near', text: nearText(season.state.n, near) };
  }

  // A meta é da pessoa: todayCount já conta todos os eventos. Sem ele, valem os solves de hoje que vieram em history.
  const today = todayCount ?? solvesOnDay(all, solve.at).length;
  if (today === dailyGoal) return { id: 'daily-goal', text: T.coach.dailyGoal(dailyGoal) };

  const week = weekBetter(history, solve);
  if (week !== null) return { id: 'week', text: T.coach.week(eventInfo(event).name, week) };

  // A sequência estável olha o histórico; o cansaço, a sessão. Os dois avisam só ao entrar, não a cada solve.
  if (stableWindow(all) && !stableWindow(history)) return { id: 'stable', text: T.coach.stable };
  if (tired([...sessionSolves, solve]) && !tired(sessionSolves)) return { id: 'fatigue', text: T.coach.fatigue };

  const out = outlier([...sessionSolves, solve]);
  if (out !== null) return { id: 'outlier', text: T.coach.outlier(formatMs(out)) };

  if (solve.penalty === 'DNF' && !sessionSolves.some((x) => x.penalty === 'DNF')) return { id: 'first-dnf', text: T.coach.firstDnf };

  // "De volta" também é da pessoa: prevAnyAt é o solve anterior em qualquer evento. Sem ele, o último de history.
  const prevAt = prevAnyAt ?? history.at(-1)?.at;
  if (prevAt !== undefined && solve.at - prevAt >= 3 * DAY) return { id: 'back', text: T.coach.back };

  return null;
}
```

- [ ] **Step 6: Saída do rastreador antigo**

Em `app/src/core/stats.ts`, apague `interface MilestoneTracker` e `createMilestoneTracker` com os comentários deles. Fica o resto, inclusive `reachedAt`, `milestoneProgress` e `achievedIds`, que os testes de equivalência e `timer-screen.test.ts` usam.

- [ ] **Step 7: Temporada no `TimerScreen`**

Em `app/src/ui/timer/TimerScreen.svelte`:

1. **Imports.** Tire `createMilestoneTracker` e `type MilestoneId` do import de `stats` e acrescente:

```ts
  import type { CoachSeason } from '../../core/coach';
  import { closeRecord, seasonFinish, seasonSolves } from '../../core/season';
  import type { EventId, SeasonState, Solve } from '../../core/types';
```

(o último troca o `import type { EventId, Solve }` que existe).

2. **Contagem da face de cima.** Troque o bloco que vai de `// Os marcos conquistados percorrem o histórico inteiro…` até o `$effect` que define `topLit` (inclui `milestoneSolves`, `achievedMemo`, `tracker` e `achievedOf`) por:

```ts
  // Os marcos da temporada atual, para a face de cima. A conta é do AppState (guardada por lista; continua de onde parou) e roda numa
  // macrotarefa depois de cada mudança dos solves ou da temporada, fora do caminho do solve.
  let topLit = $state(0);
  $effect(() => {
    const list = app.solves;
    const state = app.profile.season.current;
    const later = setTimeout(() => {
      topLit = app.seasonStatus(list, state).filter((m) => m.achieved).length;
    }, 0);
    return () => clearTimeout(later);
  });
  // Na virada, a face de cima segue cheia durante a reação e só depois esvazia (spec 8). null: mostra a contagem de agora.
  let topHold = $state<number | null>(null);
  let topHoldTimer: ReturnType<typeof setTimeout> | undefined;
  const topShown = $derived(topHold ?? topLit);
```

   Apague também a função `milestoneSolves`.

3. **Função `seasonInput`.** Acrescente logo antes de `async function finishSolve`:

```ts
  // A temporada do solve para o coach: os marcos antes e depois dele, os solves da temporada antes dele e, se ele fechou a temporada, o
  // resumo dela. Conta na temporada de quando o solve começou: a virada pode já ter gravado a próxima.
  function seasonInput(state: SeasonState, listBefore: Solve[]): CoachSeason {
    const before = app.seasonStatus(listBefore, state);
    const after = app.seasonStatus(app.solves, state);
    const closed = before.some((m) => !m.achieved) && after.every((m) => m.achieved);
    const record = closed ? closeRecord(state, app.solves, after) : null;
    return {
      state,
      before,
      after,
      prior: seasonSolves(listBefore, state),
      end: record && { n: record.n, solves: record.solves, startAo12: record.startAo12, endAo12: record.endAo12, finish: seasonFinish(record.n) },
    };
  }
```

4. **`finishSolve`, captura.** Logo depois de `const listBefore = app.solves;`:

```ts
    const seasonAtStart = $state.snapshot(app.profile.season.current); // a temporada em que este solve cai
```

5. **`finishSolve`, coach.** Troque o trecho que vai de `const milestone = eventInfo(solve.event).milestones;` até o `pickCoachMessage({ … })` inclusive por:

```ts
    const season = eventInfo(solve.event).milestones ? seasonInput(seasonAtStart, listBefore) : undefined;
    const seasonClosed = season?.end != null;
    const s = app.profile.settings;
    const msg = pickCoachMessage({
      solve,
      history: eventList,
      sessionSolves: sessionList,
      season,
      dailyGoal: s.dailyGoal,
      todayCount: solvesOnDay(app.solves, solve.at).length,
      prevAnyAt,
      silent: s.silent,
      event: solve.event,
    });
```

6. **`finishSolve`, segurar a face cheia.** Logo depois da linha `reaction = { from: …, until: … };`:

```ts
    clearTimeout(topHoldTimer);
    if (seasonClosed) {
      topHold = 9;
      topHoldTimer = setTimeout(() => {
        topHold = null;
      }, REACTION_DELAY + REACTION_MS);
    }
```

7. **`onState`.** No bloco `if (next === 'inspect' || next === 'arming') { … }`, acrescente `topHold = null; clearTimeout(topHoldTimer);`.

8. **Limpeza.** No retorno do `$effect` de limpeza (o que tem `destroyed = true;`), acrescente `clearTimeout(topHoldTimer);`.

9. **Markup.** Troque `<CentroView {theme} finish={app.profile.finish} {topLit} {sideLit} />` por `<CentroView {theme} finish={app.profile.finish} topLit={topShown} {sideLit} />`.

- [ ] **Step 8: Rode os testes e os tipos**

Run: `pnpm test -- tests/unit/season.test.ts tests/unit/coach.test.ts tests/unit/stats.test.ts tests/unit/timer-screen.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/season.ts src/core/coach.ts src/core/stats.ts src/strings.ts src/ui/timer/TimerScreen.svelte tests/unit/season.test.ts tests/unit/coach.test.ts tests/unit/stats.test.ts tests/unit/timer-screen.test.ts
git commit -m "feat(app): coach com fim de temporada, quase lá, semana melhor e fora da curva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Rosto paramétrico

Spec: seção 6.2.

**Files:**
- Create: `app/src/ui/centro/face.ts`
- Test: `app/tests/unit/face.test.ts`

**Interfaces:**
- Produces:
  - `type Eyes = 'open' | 'half' | 'focus' | 'happy' | 'sleep'` (a Task 8 passa a exportá-lo de `ui/centro.ts` a partir daqui)
  - `interface Face { open: number; curve: number; lookX: number; lookY: number; squash: number }`
  - `OPEN_MIN: number` (≈ 0,2167)
  - `EYE_Y = 48.5`
  - `EYE_X = { l: 44.8, r: 55.2 }`
  - `EXPRESSIONS: Readonly<Record<Eyes, Readonly<Face>>>`
  - `eyePath(face: Face, cx: number): string`
  - `APPROACH_K = 15`
  - `approach(cur: Face, target: Face, dt: number, k?: number): Face` (dt em ms)
  - `settled(a: Face, b: Face, eps?: number): boolean`

O caminho de cada olho é sempre `M x0 y C x0 yT x1 yT x1 y C x1 yB x0 yB x0 y Z`. Como a estrutura de comandos não muda, dá para interpolar entre quaisquer duas expressões.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/face.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { approach, EXPRESSIONS, EYE_X, EYE_Y, eyePath, OPEN_MIN, settled } from '../../src/ui/centro/face';

// Os 14 números do caminho: x0 y | x0 yT x1 yT x1 y | x1 yB x0 yB x0 y.
const nums = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
// Com os dois controles na mesma altura, a curva cúbica chega a 3/4 do caminho até eles.
const shape = (d: string) => {
  const [x0, y, , yT, x1, , , , , yB] = nums(d);
  return { width: x1 - x0, top: y + 0.75 * (yT - y), bottom: y + 0.75 * (yB - y), ends: y, left: x0 };
};

describe('rosto do Centro', () => {
  it('todas as expressões têm a mesma estrutura de caminho (interpolam entre si)', () => {
    for (const face of Object.values(EXPRESSIONS)) {
      const d = eyePath(face, EYE_X.l);
      expect(d).toMatch(/^M[\d.]+ [\d.]+C[\d. ]+C[\d. ]+Z$/);
      expect(nums(d)).toHaveLength(14);
    }
  });

  it('aberto: 6,4 de largura e 12 de altura, centrado como o olho de hoje (42,5 a 54,5)', () => {
    const s = shape(eyePath(EXPRESSIONS.open, EYE_X.l));
    expect(s.width).toBeCloseTo(6.4, 2);
    expect(s.top).toBeCloseTo(EYE_Y - 6, 2);
    expect(s.bottom).toBeCloseTo(EYE_Y + 6, 2);
    expect(s.left).toBeCloseTo(EYE_X.l - 3.2, 2);
  });

  it('foco: um traço de 9,4 por 2,6, como a linha de hoje com as pontas redondas', () => {
    const s = shape(eyePath(EXPRESSIONS.focus, EYE_X.r));
    expect(s.width).toBeCloseTo(9.4, 2);
    expect(s.bottom - s.top).toBeCloseTo(2.6, 1); // o caminho sai com 2 casas: a espessura fica a ±0,01
  });

  it('semicerrado mantém a largura do aberto e fica com pouco mais da metade da altura', () => {
    const s = shape(eyePath(EXPRESSIONS.half, EYE_X.l));
    expect(s.width).toBeCloseTo(6.4, 2);
    expect(s.bottom - s.top).toBeCloseTo(12 * 0.55, 2);
  });

  it('feliz arqueia para cima; dormindo, para baixo; a espessura do traço fica', () => {
    const happy = shape(eyePath(EXPRESSIONS.happy, EYE_X.l));
    const sleep = shape(eyePath(EXPRESSIONS.sleep, EYE_X.l));
    expect((happy.top + happy.bottom) / 2).toBeLessThan(happy.ends);
    expect((sleep.top + sleep.bottom) / 2).toBeGreaterThan(sleep.ends);
    expect(happy.bottom - happy.top).toBeCloseTo(OPEN_MIN * 12, 1);
  });

  it('o olhar desloca o olho inteiro', () => {
    const base = nums(eyePath(EXPRESSIONS.open, EYE_X.l));
    const moved = nums(eyePath({ ...EXPRESSIONS.open, lookX: 1.6, lookY: -1 }, EYE_X.l));
    expect(moved[0] - base[0]).toBeCloseTo(1.6, 2);
    expect(moved[1] - base[1]).toBeCloseTo(-1, 2);
  });

  it('a aproximação chega a 95% em 200 ms, igual em qualquer taxa de quadros', () => {
    const from = EXPRESSIONS.open;
    const to = EXPRESSIONS.focus;
    const once = approach(from, to, 200);
    expect((from.open - once.open) / (from.open - to.open)).toBeCloseTo(0.95, 2);
    let stepped = from;
    for (let i = 0; i < 12; i++) stepped = approach(stepped, to, 200 / 12);
    expect(stepped.open).toBeCloseTo(once.open, 10);
    expect(settled(approach(from, to, 2000), to)).toBe(true);
    expect(settled(once, to)).toBe(false);
    expect(approach(from, to, -5)).toEqual(from);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/face.test.ts`
Expected: FAIL. O vitest não acha `../../src/ui/centro/face`.

- [ ] **Step 3: Implemente**

Crie `app/src/ui/centro/face.ts`:

```ts
// O rosto do Centro como parâmetros contínuos (spec do sub-projeto 3, seção 6.2). Puro: nada aqui conhece o DOM.
// Cada olho é um formato preenchido com a borda de cima e a de baixo em curva. Todas as expressões usam a mesma estrutura de comandos,
// então dá para interpolar entre quaisquer duas. A geometria é a da frente do cubo (dentro do translate(0 30) do SVG).

export type Eyes = 'open' | 'half' | 'focus' | 'happy' | 'sleep';

export interface Face {
  open: number; // OPEN_MIN … 1: distância entre as bordas (1 = os 12 de altura do olho aberto)
  curve: number; // -1 … 1: arco das duas bordas (-1 dormindo, para baixo; +1 feliz, para cima)
  lookX: number; // deslocamento do olhar, em unidades do SVG
  lookY: number;
  squash: number; // escala vertical do corpo, pela base (1 = normal)
}

const EYE_H = 12;
const W_OPEN = 6.4;
const W_LINE = 9.4; // o traço de 6,8 de hoje com as pontas redondas de 2,6
const BEND = 2.8; // quanto o meio do arco sobe (feliz) ou desce (dormindo)
export const OPEN_MIN = 2.6 / EYE_H; // a espessura do traço de hoje: foco, feliz e dormindo
export const EYE_Y = 48.5; // o centro dos olhos na frente
export const EYE_X = Object.freeze({ l: 44.8, r: 55.2 });

const base = { lookX: 0, lookY: 0, squash: 1 };
export const EXPRESSIONS: Readonly<Record<Eyes, Readonly<Face>>> = Object.freeze({
  open: Object.freeze({ ...base, open: 1, curve: 0 }),
  half: Object.freeze({ ...base, open: 0.55, curve: 0 }),
  focus: Object.freeze({ ...base, open: OPEN_MIN, curve: 0 }),
  happy: Object.freeze({ ...base, open: OPEN_MIN, curve: 1 }),
  sleep: Object.freeze({ ...base, open: OPEN_MIN, curve: -1 }),
});

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const f2 = (v: number): string => v.toFixed(2);

// O caminho de um olho centrado em cx. Os controles das curvas ficam a 4/3 da meia altura, então o topo e a base chegam à meia altura
// e as laterais começam na vertical (um olho de pontas redondas). Abaixo da metade da abertura, o olho alarga até a largura do traço.
export function eyePath(face: Face, cx: number): string {
  const o = clamp(face.open, OPEN_MIN, 1);
  const k = (4 / 3) * ((EYE_H * o) / 2);
  const w = o >= 0.5 ? W_OPEN : W_OPEN + (W_LINE - W_OPEN) * ((0.5 - o) / (0.5 - OPEN_MIN));
  const bend = clamp(face.curve, -1, 1) * BEND;
  const lift = (4 / 3) * bend;
  const y = EYE_Y + bend / 2 + face.lookY;
  const x0 = cx - w / 2 + face.lookX;
  const x1 = cx + w / 2 + face.lookX;
  const top = y - k - lift;
  const bottom = y + k - lift;
  return `M${f2(x0)} ${f2(y)}C${f2(x0)} ${f2(top)} ${f2(x1)} ${f2(top)} ${f2(x1)} ${f2(y)}C${f2(x1)} ${f2(bottom)} ${f2(x0)} ${f2(bottom)} ${f2(x0)} ${f2(y)}Z`;
}

// Amortecimento exponencial: chega a 95% do alvo em 200 ms (k = 15 por segundo), igual em qualquer taxa de quadros. dt em ms.
export const APPROACH_K = 15;

export function approach(cur: Face, target: Face, dt: number, k = APPROACH_K): Face {
  const a = 1 - Math.exp((-k * Math.max(0, dt)) / 1000);
  const mix = (x: number, y: number): number => x + (y - x) * a;
  return {
    open: mix(cur.open, target.open),
    curve: mix(cur.curve, target.curve),
    lookX: mix(cur.lookX, target.lookX),
    lookY: mix(cur.lookY, target.lookY),
    squash: mix(cur.squash, target.squash),
  };
}

// Perto o bastante para parar de desenhar.
export function settled(a: Face, b: Face, eps = 0.005): boolean {
  return (
    Math.abs(a.open - b.open) < eps &&
    Math.abs(a.curve - b.curve) < eps &&
    Math.abs(a.lookX - b.lookX) < eps &&
    Math.abs(a.lookY - b.lookY) < eps &&
    Math.abs(a.squash - b.squash) < eps
  );
}
```

- [ ] **Step 4: Rode os testes e confira que passam**

Run: `pnpm test -- tests/unit/face.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/ui/centro/face.ts tests/unit/face.test.ts
git commit -m "feat(app): rosto do Centro em parâmetros contínuos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Olhos em caminho e corpo em grupo no SVG

Spec: seção 6.1 (`ui/centro.ts`) e seção 6.2.

**Files:**
- Modify: `app/src/ui/centro.ts`
- Modify: `app/src/styles/screens.css`
- Test: `app/tests/unit/centro.test.ts`

**Interfaces:**
- Consumes: `Eyes`, `Face`, `EXPRESSIONS`, `EYE_X` e `eyePath` (Task 7).
- Produces (em `ui/centro.ts`):
  - `export type { Eyes } from './centro/face'` (o tipo deixa de ser declarado aqui)
  - `paintRing(svg: SVGElement, ring: Ring, theme?: string, finish?: string): void`
  - `paintFace(svg: SVGElement, face: Face, lift?: number): void`
  - `paintTop(svg: SVGElement, dim: number): void`
  - `centroTarget(view: CentroView): { ring: Ring; eyes: Eyes }`
  - `updateCentro` continua com a mesma assinatura; o tour usa assim.
- Contrato do SVG gerado, que o animador (Task 10) e os testes leem:
  - dois `<path class="eye" data-side="l|r">`;
  - um `<g class="cbody">` em volta do corpo, das faces e da frente;
  - a face de cima em `<g class="top" transform="matrix(1,0,0.3,-0.3,0,30)">`; o `transform` não muda, porque `timer-screen.test.ts` o usa;
  - a face lateral em `<g class="side" transform="matrix(0.3,-0.3,0,1,100,30)">`;
  - `data-eyes` com o nome da expressão.

- [ ] **Step 1: Atualize os testes (eles falham com o código de hoje)**

Em `app/tests/unit/centro.test.ts`:

1. **Import.** Troque a linha de import por:

```ts
import { centroTarget, PALETTES, RING_ORDER, eyesFor, paintFace, paintRing, paintTop, paletteFor, renderCentro, ringFor, updateCentro } from '../../src/ui/centro';
import { EXPRESSIONS, EYE_X, eyePath } from '../../src/ui/centro/face';
```

2. **Olhos no render.** No teste `'renderCentro pinta o anel, mostra só os olhos pedidos e acende a evolução'`, troque as duas linhas com `data-e=` por:

```ts
    expect(svg).toMatch(/data-eyes="half"/);
    expect((svg.match(/<path class="eye"/g) || []).length).toBe(2);
    expect(svg).toContain(`d="${eyePath(EXPRESSIONS.half, EYE_X.l)}"`);
    expect(svg).toContain(`d="${eyePath(EXPRESSIONS.half, EYE_X.r)}"`);
```

3. **Stub.** Apague a interface `StubEl`, a função `stubSvg` e o teste `'updateCentro usa o tema do próprio SVG e pinta anel e olhos'`. O mesmo contrato passa a ser testado no DOM, no bloco seguinte.

4. **Olhos no DOM.** Em `'updateCentro atualiza o SVG gerado por renderCentro, com o tema e o acabamento dele'`, troque as duas últimas linhas (`[data-e="happy"]` e `[data-e="open"]`) por:

```ts
    const eyes = svg.querySelectorAll<SVGPathElement>('path.eye');
    expect(eyes).toHaveLength(2);
    expect(eyes[0].getAttribute('d')).toBe(eyePath(EXPRESSIONS.happy, EYE_X.l));
    expect(eyes[1].getAttribute('d')).toBe(eyePath(EXPRESSIONS.happy, EYE_X.r));
```

5. **Pintura por partes.** Acrescente ao `describe('Centro no DOM', …)`:

```ts
  it('paintFace escreve os olhos e o corpo; paintTop apaga a face de cima; paintRing pinta o anel', () => {
    const svg = mount(renderCentro({ theme: 'light' }));
    paintFace(svg, { ...EXPRESSIONS.open, lookX: 1.6, squash: 0.94 }, 3);
    expect(svg.querySelector('path.eye')?.getAttribute('d')).toBe(eyePath({ ...EXPRESSIONS.open, lookX: 1.6 }, EYE_X.l));
    expect(svg.querySelector('g.cbody')?.getAttribute('transform')).toBe('translate(0 -3.00) translate(0 130) scale(1 0.940) translate(0 -130)');
    paintFace(svg, EXPRESSIONS.open);
    expect(svg.querySelector('g.cbody')?.hasAttribute('transform')).toBe(false);
    paintTop(svg, 0.7);
    expect(svg.querySelector<SVGGElement>('g.top')?.style.opacity).toBe('0.3');
    paintTop(svg, 0);
    expect(svg.querySelector<SVGGElement>('g.top')?.style.opacity).toBe('');
    paintRing(svg, ['green', N, N, N, N, N, N, N]);
    expect(svg.querySelector('.ring')?.getAttribute('fill')).toBe(PALETTES.light.green);
  });

  it('a face de cima e a lateral mantêm o transform de hoje', () => {
    const svg = mount(renderCentro({ topLit: 2, sideLit: 1 }));
    expect(svg.querySelector('g.top')?.getAttribute('transform')).toBe('matrix(1,0,0.3,-0.3,0,30)');
    expect(svg.querySelector('g.side')?.getAttribute('transform')).toBe('matrix(0.3,-0.3,0,1,100,30)');
    expect(svg.querySelectorAll('g.top .lit')).toHaveLength(2);
  });

  it('centroTarget junta o anel e a expressão do estado', () => {
    expect(centroTarget({ state: 'ready' })).toEqual({ ring: Array(8).fill('green'), eyes: 'focus' });
  });
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/centro.test.ts`
Expected: FAIL. Faltam os exports `paintFace`, `paintRing`, `paintTop` e `centroTarget`, e os olhos ainda não são `<path>`.

- [ ] **Step 3: Implemente em `ui/centro.ts`**

1. **Imports.** Acrescente:

```ts
import { EXPRESSIONS, EYE_X, type Eyes, eyePath, type Face } from './centro/face';
```

troque `export type Eyes = 'open' | 'half' | 'focus' | 'happy' | 'sleep';` por `export type { Eyes } from './centro/face';`, e atualize o comentário do topo:

```ts
// O Centro: cubo 3×3 em projeção cabinet. A frente é o rosto (adesivo central) e o anel (8 adesivos).
// renderCentro gera o SVG; paintRing, paintFace e paintTop mexem só em atributos de um SVG já renderizado (o animador usa os três;
// updateCentro troca na hora, para o tour). Os olhos são caminhos paramétricos (centro/face.ts).
```

2. **Faces de cima e lateral.** Troque a função interna `face` em `renderCentro` por uma que recebe a classe:

```ts
  const face = (cls: 'top' | 'side', transform: string, lit: number, color: 'gold' | 'trail'): string => {
    let s = `<g class="${cls}" transform="${transform}">`;
    for (let i = 0; i < 9; i++) s += rect(i, i < lit ? p[color] : p.off, i < lit ? ` class="lit"${glowStyle(p, p[color])}` : '') + gloss(i);
    return `${s}</g>`;
  };
```

3. **Corpo em grupo e olhos.** Troque o trecho que vai do `s += \`<polygon class="body" …` até o `return` final por:

```ts
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
```

   Mantenha o `data-eyes="${eyes}"` que a tag `<svg>` já tem.

4. **Pintura.** Troque `updateCentro` e acrescente as funções novas:

```ts
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
```

   Com `lift = 3` e `squash = 0.94`, o `transform` sai `translate(0 -3.00) translate(0 130) scale(1 0.940) translate(0 -130)`, exatamente como o teste espera. No `paintTop`, `1 - 0.7` dá `0.30000000000000004`, por isso o `toFixed(3)` e o `Number(...)`, que deixam `'0.3'`.

- [ ] **Step 4: CSS**

Em `app/src/styles/screens.css`, apague as regras que dependiam dos grupos de olhos que saíram:
- `.centro .eyes { transition: … }`;
- `[data-cview='idle'] .t-centro .eyes[data-e='open'] { … }`;
- o `@keyframes look`.

Fica o resto. A regra `.centro .eye { … animation: blink … }` continua valendo no `<path class="eye">` (transform-box fill-box) até a Task 11.

- [ ] **Step 5: Rode os testes**

Run: `pnpm test -- tests/unit/centro.test.ts tests/unit/timer-screen.test.ts tests/unit/onboarding-tour.test.ts tests/unit/centro-screen.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/centro.ts src/styles/screens.css tests/unit/centro.test.ts
git commit -m "feat(app): olhos do Centro em caminho paramétrico e corpo em grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Comportamentos do Centro no tempo

Spec: seção 6.3 (tabela) e seção 6.4 (só durante transição; nada no solve).

**Files:**
- Create: `app/src/ui/centro/behavior.ts`
- Test: `app/tests/unit/behavior.test.ts`

**Interfaces:**
- Produces:
  - `type Mood = 'idle' | 'inspect' | 'arming' | 'ready' | 'running' | 'reaction' | 'sleep'` (os mesmos valores de `CentroState`)
  - `interface Overlay { blink: number; lookX: number; lift: number; squash: number; topDim: number }`
  - `REST: Readonly<Overlay>`
  - `TIMING` (as constantes abaixo)
  - `interface Behavior { setMood(mood: Mood, now: number): void; setAnimated(on: boolean, now: number): void; trigger(kind: 'pb' | 'seasonEnd', now: number): void; overlay(now: number): Overlay; orbit(now: number): number | null; breath(now: number): boolean | null; busy(now: number): boolean; nextAt(now: number): number | null }`
  - `createBehavior(rng?: () => number): Behavior`
- Regras:
  - **Piscar:** só em `idle` e `inspect`.
  - **Olhadinha:** só em `idle`.
  - **Salto e piscada da face de cima:** só fora de `running`. Qualquer humor que não seja `reaction` os cancela.
  - **Estático:** `overlay` é sempre `REST`, `orbit` e `breath` são `null` e `nextAt` é `null`.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/behavior.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type Behavior, createBehavior, REST, TIMING } from '../../src/ui/centro/behavior';

// Sorteio com semente (mulberry32): os testes repetem tudo igual.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Os instantes em que uma piscada começa (o fechamento sai do zero), amostrando de 5 em 5 ms.
function blinkStarts(b: Behavior, from: number, to: number): number[] {
  const starts: number[] = [];
  let prev = 0;
  for (let t = from; t <= to; t += 5) {
    const v = b.overlay(t).blink;
    if (v > 0 && prev === 0) starts.push(t);
    prev = v;
  }
  return starts;
}

describe('comportamentos do Centro', () => {
  it('parado: pisca a cada 2 a 7 s, com cerca de 10% de piscadas duplas', () => {
    const b = createBehavior(seeded(7));
    b.setMood('idle', 0);
    const groups: number[][] = [];
    for (const s of blinkStarts(b, 0, 3_600_000)) {
      const g = groups.at(-1);
      if (g && s - g[g.length - 1] < 400) g.push(s);
      else groups.push([s]);
    }
    expect(groups.length).toBeGreaterThan(500);
    expect(groups.every((g) => g.length <= 2)).toBe(true);
    const doubles = groups.filter((g) => g.length === 2).length / groups.length;
    expect(doubles).toBeGreaterThan(0.05);
    expect(doubles).toBeLessThan(0.15);
    for (let i = 1; i < groups.length; i++) {
      const prevEnd = groups[i - 1][0] + (groups[i - 1].length === 2 ? 440 : 180);
      const gap = groups[i][0] - prevEnd;
      expect(gap).toBeGreaterThanOrEqual(2000 - 10);
      expect(gap).toBeLessThanOrEqual(7000 + 10);
    }
  });

  it('a olhadinha só acontece no parado e salta, sem valores no meio', () => {
    const b = createBehavior(seeded(3));
    b.setMood('idle', 0);
    const seen = new Set<number>();
    for (let t = 0; t <= 120_000; t += 5) seen.add(b.overlay(t).lookX);
    expect([...seen].every((v) => v === 0 || Math.abs(v) === TIMING.lookReach)).toBe(true);
    expect([...seen].some((v) => v !== 0)).toBe(true);
    const insp = createBehavior(seeded(3));
    insp.setMood('inspect', 0);
    for (let t = 0; t <= 60_000; t += 25) expect(insp.overlay(t).lookX).toBe(0);
  });

  it('no solve nada se move nem fica agendado, mesmo com um salto pedido', () => {
    const b = createBehavior(seeded(1));
    b.setMood('reaction', 0);
    b.trigger('pb', 0);
    b.setMood('running', 10);
    b.trigger('pb', 20);
    for (const t of [10, 100, 300, 5000]) expect(b.overlay(t)).toEqual(REST);
    expect(b.busy(100)).toBe(false);
    expect(b.nextAt(100)).toBeNull();
    expect(b.orbit(100)).toBeNull();
  });

  it('salto do recorde: sobe 4 e volta em 400 ms, com squash na aterrissagem', () => {
    const b = createBehavior(seeded(1));
    b.setMood('reaction', 0);
    b.trigger('pb', 1000);
    expect(b.overlay(1200).lift).toBeCloseTo(4, 5);
    expect(b.overlay(1100).squash).toBe(1);
    expect(b.overlay(1340).squash).toBeCloseTo(0.94, 5);
    expect(b.busy(1300)).toBe(true);
    expect(b.overlay(1400)).toMatchObject({ lift: 0, squash: 1 });
    expect(b.busy(1400)).toBe(false);
  });

  it('fim de temporada: a face de cima apaga uma vez, em 600 ms', () => {
    const b = createBehavior(seeded(1));
    b.setMood('reaction', 0);
    b.trigger('seasonEnd', 0);
    expect(b.overlay(150).topDim).toBeGreaterThan(0);
    expect(b.overlay(300).topDim).toBeCloseTo(0.7, 5);
    expect(b.overlay(600).topDim).toBe(0);
    expect(b.overlay(900).topDim).toBe(0);
  });

  it('segurar de novo (outro humor) cancela o salto e a piscada da face de cima', () => {
    const b = createBehavior(seeded(1));
    b.setMood('reaction', 0);
    b.trigger('pb', 0);
    b.trigger('seasonEnd', 0);
    b.setMood('arming', 100);
    expect(b.overlay(200)).toEqual(REST);
  });

  it('estático: nada se move, nada é agendado; a órbita e a respiração somem', () => {
    const b = createBehavior(seeded(1));
    b.setMood('idle', 0);
    b.setAnimated(false, 0);
    b.trigger('pb', 0);
    for (let t = 0; t <= 30_000; t += 50) expect(b.overlay(t)).toEqual(REST);
    expect(b.nextAt(10)).toBeNull();
    expect(b.orbit(5000)).toBeNull();
    b.setMood('sleep', 100);
    expect(b.breath(3000)).toBeNull();
  });

  it('órbita a cada 0,95 s no parado; a respiração alterna a cada 2 s no sono; nextAt aponta o próximo passo', () => {
    const b = createBehavior(() => 0.99); // piscadas e olhadinhas longe: o próximo evento é a órbita
    b.setMood('idle', 1000);
    expect(b.orbit(1000)).toBe(0);
    expect(b.orbit(1949)).toBe(0);
    expect(b.orbit(1950)).toBe(1);
    expect(b.nextAt(1000)).toBe(1950);
    b.setMood('sleep', 5000);
    expect(b.orbit(5000)).toBeNull();
    expect(b.breath(5000)).toBe(false);
    expect(b.breath(7000)).toBe(true);
    expect(b.breath(9000)).toBe(false);
    expect(b.nextAt(5100)).toBe(7000);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/behavior.test.ts`
Expected: FAIL. O vitest não acha `../../src/ui/centro/behavior`.

- [ ] **Step 3: Implemente**

Crie `app/src/ui/centro/behavior.ts`:

```ts
// Os comportamentos do Centro no tempo (spec do sub-projeto 3, seção 6.3): piscar, olhadinha, órbita, respiração, salto do recorde e
// piscada da face de cima. Puro: o relógio chega por parâmetro e o sorteio é injetado, então os testes repetem tudo igual. Quem
// desenha (animator.ts) pergunta o que aparece agora (overlay), se algo se move (busy) e quando é o próximo evento (nextAt).

export type Mood = 'idle' | 'inspect' | 'arming' | 'ready' | 'running' | 'reaction' | 'sleep';

export interface Overlay {
  blink: number; // 0 aberto … 1 fechado: puxa a abertura para o traço
  lookX: number; // olhadinha, em unidades do SVG
  lift: number; // salto: unidades para cima
  squash: number; // escala vertical do corpo (1 = normal)
  topDim: number; // 0 … 1: quanto a face de cima apaga na piscada do fim de temporada
}

export const REST: Readonly<Overlay> = Object.freeze({ blink: 0, lookX: 0, lift: 0, squash: 1, topDim: 0 });

export const TIMING = Object.freeze({
  blinkGap: [2000, 7000] as const, // entre uma piscada e a próxima
  blinkClose: 60,
  blinkOpen: 120,
  doubleRate: 0.1, // piscadas duplas
  doubleGap: 80, // entre as duas da dupla
  lookGap: [3000, 8000] as const,
  lookHold: [600, 1500] as const,
  lookReach: 1.6,
  jump: 400,
  jumpUp: 4,
  flash: 600,
  orbit: 950, // um passo da órbita do adesivo ocioso
  breath: 2000, // meia respiração (o ciclo é de 4 s)
});

const BLINK_MS = TIMING.blinkClose + TIMING.blinkOpen;
const DOUBLE_MS = 2 * BLINK_MS + TIMING.doubleGap;

export interface Behavior {
  setMood(mood: Mood, now: number): void; // o estado do Centro; trocar de estado recomeça as agendas
  setAnimated(on: boolean, now: number): void; // estático: nada se move, nada é agendado
  trigger(kind: 'pb' | 'seasonEnd', now: number): void; // salto do recorde, piscada da face de cima
  overlay(now: number): Overlay; // o que aparece agora por cima da expressão
  orbit(now: number): number | null; // passos da órbita desde que o parado começou; null fora do parado ou no estático
  breath(now: number): boolean | null; // dormindo e animado: true na metade apagada do ciclo
  busy(now: number): boolean; // algo se move agora (pede quadro)
  nextAt(now: number): number | null; // o próximo instante em que algo começa ou muda (para o setTimeout); null: nada agendado
}

const between = (rng: () => number, [lo, hi]: readonly [number, number]): number => lo + rng() * (hi - lo);

// Fechamento de uma piscada t ms depois do começo: fecha em 60 ms e abre em 120 ms.
function blinkCurve(t: number): number {
  if (t < 0 || t >= BLINK_MS) return 0;
  return t < TIMING.blinkClose ? t / TIMING.blinkClose : 1 - (t - TIMING.blinkClose) / TIMING.blinkOpen;
}

export function createBehavior(rng: () => number = Math.random): Behavior {
  let mood: Mood | null = null;
  let since = 0;
  let animated = true;
  let blink: { at: number; double: boolean } | null = null;
  let look: { at: number; until: number; x: number } | null = null;
  let jumpAt: number | null = null;
  let flashAt: number | null = null;

  const blinkLength = (b: { double: boolean }): number => (b.double ? DOUBLE_MS : BLINK_MS);

  function planBlink(from: number): void {
    blink = animated && (mood === 'idle' || mood === 'inspect') ? { at: from + between(rng, TIMING.blinkGap), double: rng() < TIMING.doubleRate } : null;
  }

  function planLook(from: number): void {
    if (!animated || mood !== 'idle') {
      look = null;
      return;
    }
    const at = from + between(rng, TIMING.lookGap);
    look = { at, until: at + between(rng, TIMING.lookHold), x: (rng() < 0.5 ? -1 : 1) * TIMING.lookReach };
  }

  function restart(now: number): void {
    since = now;
    planBlink(now);
    planLook(now);
  }

  // Passa o que já terminou e agenda o seguinte.
  function advance(now: number): void {
    while (blink && now >= blink.at + blinkLength(blink)) planBlink(blink.at + blinkLength(blink));
    while (look && now >= look.until) planLook(look.until);
    if (jumpAt !== null && now >= jumpAt + TIMING.jump) jumpAt = null;
    if (flashAt !== null && now >= flashAt + TIMING.flash) flashAt = null;
  }

  return {
    setMood(next, now) {
      if (next === mood) return;
      mood = next;
      restart(now);
      // O salto e a piscada da face de cima são da reação: qualquer outro estado (segurar de novo, o solve) os cancela.
      if (next !== 'reaction') {
        jumpAt = null;
        flashAt = null;
      }
    },
    setAnimated(on, now) {
      if (on === animated) return;
      animated = on;
      restart(now);
      if (!on) {
        jumpAt = null;
        flashAt = null;
      }
    },
    trigger(kind, now) {
      if (!animated || mood === 'running') return;
      if (kind === 'pb') jumpAt = now;
      else flashAt = now;
    },
    overlay(now) {
      advance(now);
      let b = 0;
      if (blink) {
        const t = now - blink.at;
        b = Math.max(blinkCurve(t), blink.double ? blinkCurve(t - BLINK_MS - TIMING.doubleGap) : 0);
      }
      const lookX = look && now >= look.at && now < look.until ? look.x : 0;
      let lift = 0;
      let squash = 1;
      if (jumpAt !== null) {
        const t = (now - jumpAt) / TIMING.jump;
        lift = TIMING.jumpUp * Math.sin(Math.PI * t);
        if (t > 0.7) squash = 1 - 0.06 * Math.sin((Math.PI * (t - 0.7)) / 0.3);
      }
      const topDim = flashAt !== null ? 0.7 * Math.sin((Math.PI * (now - flashAt)) / TIMING.flash) : 0;
      return { blink: b, lookX, lift, squash, topDim };
    },
    orbit(now) {
      return animated && mood === 'idle' ? Math.floor((now - since) / TIMING.orbit) : null;
    },
    breath(now) {
      return animated && mood === 'sleep' ? Math.floor((now - since) / TIMING.breath) % 2 === 1 : null;
    },
    busy(now) {
      advance(now);
      return (blink !== null && now >= blink.at) || jumpAt !== null || flashAt !== null;
    },
    nextAt(now) {
      advance(now);
      const times: number[] = [];
      if (blink) times.push(blink.at);
      if (look) times.push(now < look.at ? look.at : look.until);
      if (animated && mood === 'idle') times.push(since + (Math.floor((now - since) / TIMING.orbit) + 1) * TIMING.orbit);
      if (animated && mood === 'sleep') times.push(since + (Math.floor((now - since) / TIMING.breath) + 1) * TIMING.breath);
      const future = times.filter((t) => t > now);
      return future.length > 0 ? Math.min(...future) : null;
    },
  };
}
```

- [ ] **Step 4: Rode os testes e confira que passam**

Run: `pnpm test -- tests/unit/behavior.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/ui/centro/behavior.ts tests/unit/behavior.test.ts
git commit -m "feat(app): comportamentos do Centro no tempo (piscar, olhar, salto, órbita)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Animador sob demanda

Spec: seção 6.4 e seção 6.5 (estático).

**Files:**
- Create: `app/src/ui/centro/animator.ts`
- Test: `app/tests/unit/animator.test.ts`

**Interfaces:**
- Consumes:
  - `paintFace`, `paintRing`, `paintTop`, `ringFor`, `eyesFor` e `CentroView` (Task 8);
  - `Face`, `EXPRESSIONS`, `OPEN_MIN`, `approach` e `settled` (Task 7);
  - `Behavior`, `createBehavior` e `Overlay` (Task 9).
- Produces:
  - `interface Scheduler { now(): number; frame(cb: () => void): () => void; after(ms: number, cb: () => void): () => void }`
  - `browserScheduler: Scheduler`
  - `interface CentroAnimator { show(view: CentroView): void; trigger(kind: 'pb' | 'seasonEnd'): void; freeze(): void; setAnimated(on: boolean): void; setPaused(paused: boolean): void; repaint(): void; destroy(): void }`
  - `createCentroAnimator(opts: { svg: () => SVGElement | null; scheduler?: Scheduler; behavior?: Behavior; animated?: boolean }): CentroAnimator`
- O animador cuida da órbita: um `show({ state: 'idle' })` acende o adesivo ocioso sozinho, a cada passo.
- `show({ state: 'running' })` faz o mesmo que `freeze()`.
- Um `show` com o mesmo estado, o mesmo anel e a mesma expressão não faz nada. A tela chama `show` a cada quadro.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/animator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderCentro } from '../../src/ui/centro';
import { createCentroAnimator, type Scheduler } from '../../src/ui/centro/animator';
import { createBehavior } from '../../src/ui/centro/behavior';
import { EXPRESSIONS, EYE_X, eyePath } from '../../src/ui/centro/face';

// Relógio, quadros e temporizadores de mentira: o teste avança o tempo de 16 em 16 ms.
function fakeScheduler() {
  let t = 0;
  let frames: (() => void)[] = [];
  const timers: { at: number; cb: () => void; on: boolean }[] = [];
  const sch: Scheduler = {
    now: () => t,
    frame: (cb) => {
      frames.push(cb);
      return () => {
        frames = frames.filter((f) => f !== cb);
      };
    },
    after: (ms, cb) => {
      const x = { at: t + ms, cb, on: true };
      timers.push(x);
      return () => {
        x.on = false;
      };
    },
  };
  return {
    sch,
    advance(ms: number): void {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + 16);
        for (const x of timers) {
          if (x.on && x.at <= t) {
            x.on = false;
            x.cb();
          }
        }
        const run = frames;
        frames = [];
        for (const f of run) f();
      }
    },
    frames: () => frames.length,
    timers: () => timers.filter((x) => x.on).length,
  };
}

function mount(): SVGElement {
  const host = document.createElement('div');
  host.innerHTML = renderCentro({ theme: 'light' });
  document.body.append(host);
  return host.querySelector('svg') as SVGElement;
}
const eyeD = (svg: SVGElement) => svg.querySelector('path.eye')?.getAttribute('d');
// Piscadas e olhadinhas longe (o sorteio dá sempre 0,99): os testes veem só o que pediram.
const calm = () => createBehavior(() => 0.99);

describe('animador do Centro', () => {
  it('troca de expressão anima em uns 200 ms, e o laço para quando assenta', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'arming', armProgress: 0.5 });
    clock.advance(48);
    expect(eyeD(svg)).not.toBe(eyePath(EXPRESSIONS.open, EYE_X.l));
    expect(eyeD(svg)).not.toBe(eyePath(EXPRESSIONS.half, EYE_X.l));
    clock.advance(600);
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.half, EYE_X.l));
    expect(svg.dataset.eyes).toBe('half');
    expect(clock.frames()).toBe(0);
    expect(clock.timers()).toBe(0); // armando: sem piscada e sem órbita
  });

  it('parado e assentado: nenhum quadro seguido, só um temporizador; a órbita anda um adesivo a cada 0,95 s', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'idle' });
    clock.advance(300);
    expect(clock.frames()).toBe(0);
    expect(clock.timers()).toBe(1);
    expect(svg.querySelector('.ring.lit')?.getAttribute('data-k')).toBe('0');
    clock.advance(700);
    expect(svg.querySelector('.ring.lit')?.getAttribute('data-k')).toBe('1');
  });

  it('a mesma vista de novo não recomeça nada', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'ready' });
    clock.advance(600);
    const before = clock.frames() + clock.timers();
    anim.show({ state: 'ready' });
    expect(clock.frames() + clock.timers()).toBe(before);
  });

  it('no solve: freeze encaixa o foco, desenha um quadro e não deixa nada agendado', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'reaction', result: 'pb' });
    anim.trigger('pb');
    clock.advance(32);
    anim.freeze();
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.focus, EYE_X.l));
    expect(svg.querySelector('g.cbody')?.hasAttribute('transform')).toBe(false);
    expect(clock.frames() + clock.timers()).toBe(0);
    anim.show({ state: 'running' });
    clock.advance(5000);
    expect(clock.frames() + clock.timers()).toBe(0);
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.focus, EYE_X.l));
  });

  it('estático: troca na hora e não agenda nada', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm(), animated: false });
    anim.show({ state: 'idle' });
    expect(clock.frames() + clock.timers()).toBe(0);
    expect(svg.querySelectorAll('.ring.lit')).toHaveLength(0); // sem órbita
    anim.show({ state: 'arming', armProgress: 1 });
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.half, EYE_X.l));
    expect(clock.frames() + clock.timers()).toBe(0);
  });

  it('passar para estático no meio de um salto para o salto na hora, sem sobrar temporizador', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'reaction', result: 'pb' });
    anim.trigger('pb');
    clock.advance(160);
    expect(svg.querySelector('g.cbody')?.getAttribute('transform')).toMatch(/^translate\(0 -/);
    anim.setAnimated(false);
    expect(svg.querySelector('g.cbody')?.hasAttribute('transform')).toBe(false);
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.happy, EYE_X.l));
    expect(clock.frames() + clock.timers()).toBe(0);
  });

  it('pausado não agenda nada; ao voltar, pinta e agenda de novo', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'idle' });
    anim.setPaused(true);
    expect(clock.frames() + clock.timers()).toBe(0);
    clock.advance(5000);
    expect(clock.frames() + clock.timers()).toBe(0);
    anim.setPaused(false);
    expect(clock.timers()).toBe(1);
  });

  it('fim de temporada apaga a face de cima e a acende de novo, uma vez', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'reaction', result: 'good' });
    anim.trigger('seasonEnd');
    clock.advance(300);
    expect(Number(svg.querySelector<SVGGElement>('g.top')?.style.opacity)).toBeLessThan(0.5);
    clock.advance(400);
    expect(svg.querySelector<SVGGElement>('g.top')?.style.opacity).toBe('');
    expect(clock.frames()).toBe(0);
  });

  it('um SVG refeito recebe o estado atual', () => {
    const clock = fakeScheduler();
    let svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm(), animated: false });
    anim.show({ state: 'ready' });
    svg = mount();
    anim.repaint();
    expect(svg.querySelectorAll('.ring.lit')).toHaveLength(8);
    expect(svg.dataset.eyes).toBe('focus');
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/animator.test.ts`
Expected: FAIL. O vitest não acha `../../src/ui/centro/animator`.

- [ ] **Step 3: Implemente**

Crie `app/src/ui/centro/animator.ts`:

```ts
// O animador do Centro (spec do sub-projeto 3, seção 6.4): um por SVG. Aproxima o rosto do alvo e escreve no SVG só quando algo muda.
// O requestAnimationFrame roda só durante transição, piscada, salto ou piscada da face de cima. Parado e assentado, o próximo evento do
// comportamento (piscada, olhadinha, passo da órbita, respiração) é agendado com setTimeout. No solve, freeze() encaixa o foco, desenha
// um quadro e cancela tudo.
import { type CentroView, eyesFor, paintFace, paintRing, paintTop, ringFor } from '../centro';
import { type Behavior, createBehavior, type Overlay } from './behavior';
import { approach, EXPRESSIONS, type Face, OPEN_MIN, settled } from './face';

export interface Scheduler {
  now(): number;
  frame(cb: () => void): () => void; // pede um quadro; devolve o cancelador
  after(ms: number, cb: () => void): () => void; // agenda; devolve o cancelador
}

export const browserScheduler: Scheduler = {
  now: () => performance.now(),
  frame: (cb) => {
    const id = requestAnimationFrame(() => cb());
    return () => cancelAnimationFrame(id);
  },
  after: (ms, cb) => {
    const id = setTimeout(cb, ms);
    return () => clearTimeout(id);
  },
};

export interface CentroAnimator {
  show(view: CentroView): void; // o estado do momento; "resolvendo" congela (freeze). A mesma vista de novo não faz nada.
  trigger(kind: 'pb' | 'seasonEnd'): void; // salto do recorde, piscada da face de cima
  freeze(): void; // o solve começou: foco, um quadro, nada agendado
  setAnimated(on: boolean): void; // estático: trocas na hora, nada agendado
  setPaused(paused: boolean): void; // página escondida ou Centro fora da tela
  repaint(): void; // o SVG foi refeito (tema, acabamento, marcas): pinta nele o estado atual
  destroy(): void;
}

export interface AnimatorOptions {
  svg: () => SVGElement | null; // o SVG atual: pode mudar quando a tela refaz o markup
  scheduler?: Scheduler;
  behavior?: Behavior;
  animated?: boolean;
}

// O rosto que aparece: a base, com a piscada puxando a abertura para o traço, a olhadinha somada e o squash do salto.
function shown(face: Face, ov: Overlay): Face {
  return { ...face, open: face.open + (OPEN_MIN - face.open) * ov.blink, lookX: face.lookX + ov.lookX, squash: face.squash * ov.squash };
}

export function createCentroAnimator(opts: AnimatorOptions): CentroAnimator {
  const sch = opts.scheduler ?? browserScheduler;
  const behavior = opts.behavior ?? createBehavior();
  let animated = opts.animated ?? true;
  let paused = false;
  let frozen = false;
  let destroyed = false;
  let view: CentroView = { state: 'idle' };
  let viewSig = '';
  let target: Face = EXPRESSIONS.open;
  let face: Face = EXPRESSIONS.open;
  let last = sch.now();
  let cancelFrame: (() => void) | null = null;
  let cancelWake: (() => void) | null = null;
  // O que já está pintado: o anel só é reescrito quando muda, ou num SVG novo.
  let paintedSvg: SVGElement | null = null;
  let paintedRing = '';

  behavior.setAnimated(animated, last);
  behavior.setMood('idle', last);

  function stop(): void {
    cancelFrame?.();
    cancelFrame = null;
    cancelWake?.();
    cancelWake = null;
  }

  function paint(now: number): void {
    const svg = opts.svg();
    if (!svg) return;
    const fresh = svg !== paintedSvg;
    paintedSvg = svg;
    const ring = ringFor({ ...view, orbit: view.state === 'idle' ? behavior.orbit(now) : null });
    const sig = ring.join();
    if (fresh || sig !== paintedRing) {
      paintRing(svg, ring);
      paintedRing = sig;
    }
    const ov = behavior.overlay(now);
    paintFace(svg, shown(face, ov), ov.lift);
    paintTop(svg, ov.topDim);
    svg.classList.toggle('breath-off', behavior.breath(now) === true);
    svg.dataset.eyes = eyesFor(view);
  }

  function frame(): void {
    cancelFrame = null;
    if (destroyed || frozen) return;
    const now = sch.now();
    face = animated ? approach(face, target, now - last) : target;
    last = now;
    if (settled(face, target)) face = target;
    paint(now);
    if (paused) return;
    if (face !== target || behavior.busy(now)) {
      cancelFrame = sch.frame(frame);
      return;
    }
    const at = behavior.nextAt(now);
    if (at !== null) cancelWake = sch.after(Math.max(0, at - now), kick);
  }

  // Recomeça o ciclo agora: pinta e decide entre o próximo quadro e o próximo evento.
  function kick(): void {
    if (destroyed || frozen || paused) return;
    stop();
    last = sch.now();
    frame();
  }

  function freeze(): void {
    if (destroyed || frozen) return;
    frozen = true;
    stop();
    const now = sch.now();
    view = { state: 'running' };
    viewSig = 'running';
    behavior.setMood('running', now);
    target = EXPRESSIONS.focus;
    face = target;
    paint(now);
  }

  return {
    show(next) {
      if (destroyed) return;
      if (next.state === 'running') {
        freeze();
        return;
      }
      const eyes = eyesFor(next);
      const sig = `${next.state}|${ringFor({ ...next, orbit: null }).join()}|${eyes}`;
      if (sig === viewSig && !frozen) return;
      frozen = false;
      viewSig = sig;
      view = next;
      behavior.setMood(next.state, sch.now());
      target = EXPRESSIONS[eyes];
      kick();
    },
    trigger(kind) {
      if (destroyed || frozen) return;
      behavior.trigger(kind, sch.now());
      kick();
    },
    freeze,
    setAnimated(on) {
      if (on === animated) return;
      animated = on;
      behavior.setAnimated(on, sch.now());
      if (!on) face = target;
      if (frozen || paused) {
        if (!on) paint(sch.now());
        return;
      }
      kick();
    },
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) stop();
      else kick();
    },
    repaint() {
      if (destroyed) return;
      paintedSvg = null;
      if (frozen || paused) paint(sch.now());
      else kick();
    },
    destroy() {
      destroyed = true;
      stop();
    },
  };
}
```

- [ ] **Step 4: Rode os testes e confira que passam**

Run: `pnpm test -- tests/unit/animator.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/ui/centro/animator.ts tests/unit/animator.test.ts
git commit -m "feat(app): animador do Centro sob demanda, congelado no solve

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: O Centro do Timer pelo controlador e pelo animador

Spec: seção 6.1 (o controlador sai do `TimerScreen`), seções 6.3 e 6.4, e seção 8 (piscada na virada).

**Files:**
- Create: `app/src/ui/timer/centro-live.ts`
- Modify: `app/src/ui/timer/TimerScreen.svelte`
- Modify: `app/src/styles/screens.css`
- Test: `app/tests/unit/centro-live.test.ts` (novo), `app/tests/unit/timer-screen.test.ts`

**Interfaces:**
- Consumes:
  - `createCentroAnimator` e `CentroAnimator` (Task 10);
  - `TIMING.flash` (Task 9);
  - as variáveis `seasonClosed`, `topHold` e `topHoldTimer` do `finishSolve` (Task 6).
- Produces (em `ui/timer/centro-live.ts`):
  - `REACTION_DELAY = 500`
  - `REACTION_MS = 2500`
  - `SLEEP_AFTER = 300000`
  - `interface TimerLike { readonly state: TimerState; readonly inspectElapsed: number; readonly armProgress: number }`
  - `interface CentroLive { readonly sleeping: boolean; view(now: number): CentroView; paint(now: number): CentroView; react(result: ResultKind | null, t0: number, seasonEnd?: boolean): void; clearReaction(): void; reacting(now: number): boolean; wake(wallNow: number): void; sleepIfIdle(wallNow: number): boolean }`
  - `createCentroLive(timer: TimerLike, animator: CentroAnimator, wallNow: number): CentroLive`

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/centro-live.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { TimerState } from '../../src/core/timer';
import type { CentroAnimator } from '../../src/ui/centro/animator';
import { createCentroLive, REACTION_DELAY, REACTION_MS, SLEEP_AFTER } from '../../src/ui/timer/centro-live';

function fakeAnimator() {
  const shows: string[] = [];
  const triggers: string[] = [];
  const animator: CentroAnimator = {
    show: (v) => {
      shows.push(v.state);
    },
    trigger: (k) => {
      triggers.push(k);
    },
    freeze: vi.fn(),
    setAnimated: vi.fn(),
    setPaused: vi.fn(),
    repaint: vi.fn(),
    destroy: vi.fn(),
  };
  return { animator, shows, triggers };
}
const timerIn = (state: TimerState, extra: { inspectElapsed?: number; armProgress?: number } = {}) => ({ state, inspectElapsed: 0, armProgress: 0, ...extra });

describe('o Centro no Timer', () => {
  it('a reação espera imóvel, dura 2,5 s e dispara o salto e a piscada da face de cima uma vez', () => {
    const { animator, shows, triggers } = fakeAnimator();
    const live = createCentroLive(timerIn('done'), animator, 0);
    live.react('pb', 1000, true);
    expect(live.paint(1000 + REACTION_DELAY - 1).state).toBe('running');
    expect(live.paint(1000 + REACTION_DELAY).state).toBe('reaction');
    live.paint(1000 + REACTION_DELAY + 100);
    expect(triggers).toEqual(['pb', 'seasonEnd']);
    expect(live.reacting(1000 + REACTION_DELAY + REACTION_MS - 1)).toBe(true);
    expect(live.paint(1000 + REACTION_DELAY + REACTION_MS).state).toBe('idle');
    expect(live.reacting(1000 + REACTION_DELAY + REACTION_MS)).toBe(false);
    expect(shows).toContain('reaction');
  });

  it('reação sem recorde nem virada não dispara nada; limpar a reação volta ao parado', () => {
    const { animator, triggers } = fakeAnimator();
    const live = createCentroLive(timerIn('done'), animator, 0);
    live.react('good', 0);
    live.paint(REACTION_DELAY + 10);
    expect(triggers).toEqual([]);
    live.clearReaction();
    expect(live.view(REACTION_DELAY + 20).state).toBe('idle');
  });

  it('o timer manda: inspeção, armando, pronto e resolvendo passam por cima da reação', () => {
    const timer = timerIn('arming', { armProgress: 0.5 });
    const live = createCentroLive(timer, fakeAnimator().animator, 0);
    live.react('good', 0);
    expect(live.view(REACTION_DELAY + 1)).toEqual({ state: 'arming', armProgress: 0.5 });
  });

  it('dorme depois de 5 min parado; uma entrada acorda; com o timer ocupado, não dorme', () => {
    const timer = timerIn('idle');
    const live = createCentroLive(timer, fakeAnimator().animator, 0);
    expect(live.sleepIfIdle(SLEEP_AFTER - 1)).toBe(false);
    expect(live.sleepIfIdle(SLEEP_AFTER)).toBe(true);
    expect(live.view(0).state).toBe('sleep');
    live.wake(SLEEP_AFTER + 10);
    expect(live.sleeping).toBe(false);
    const busy = createCentroLive(timerIn('inspect'), fakeAnimator().animator, 0);
    expect(busy.sleepIfIdle(3 * SLEEP_AFTER)).toBe(false);
  });
});
```

Em `app/tests/unit/timer-screen.test.ts`, dentro de `describe('tela do Timer: solve, reação e nota', …)`, acrescente:

```ts
  it('durante o solve o Centro não muda: nenhum atributo dele é reescrito', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    const svg = () => document.querySelector('[data-centro-slot] svg.centro') as SVGElement;
    key('keydown', 'Space', ' ');
    await sleep(320);
    key('keyup', 'Space', ' ');
    expect(document.body.dataset.tstate).toBe('running');
    await sleep(50);
    const changes: string[] = [];
    const watch = new MutationObserver((list) => list.forEach((m) => changes.push(m.attributeName ?? m.type)));
    watch.observe(svg(), { attributes: true, subtree: true });
    await sleep(1500);
    watch.disconnect();
    key('keydown', 'KeyA', 'a');
    expect(changes).toEqual([]);
    expect(svg().dataset.eyes).toBe('focus');
  });

  it('no recorde, o corpo do Centro salta durante a reação', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() - 60000 });
    render(TimerScreen, { app: a });
    const lifts: string[] = [];
    const watch = new MutationObserver(() => {
      const t = document.querySelector('[data-centro-slot] g.cbody')?.getAttribute('transform');
      if (t) lifts.push(t);
    });
    watch.observe(document.querySelector('[data-centro-slot]')!, { attributes: true, subtree: true, childList: true });
    await solveByKeys();
    await waitFor(() => expect(lifts.length).toBeGreaterThan(0), { timeout: 3000 });
    watch.disconnect();
    expect(lifts[0]).toMatch(/^translate\(0 -/);
  });
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/centro-live.test.ts tests/unit/timer-screen.test.ts`
Expected: FAIL. O vitest não acha `centro-live`, e o corpo nunca recebe `transform`.

- [ ] **Step 3: O controlador**

Crie `app/src/ui/timer/centro-live.ts`:

```ts
// A ligação do Centro com o timer, fora da tela do Timer (spec do sub-projeto 3, seção 6.1): o estado do Centro a cada quadro, a reação
// depois do solve (com o salto do recorde e a piscada da face de cima na virada) e o sono depois de 5 min parado. Quem desenha é o
// animador; a tela repassa os eventos e chama paint() no laço dela.
import type { ResultKind } from '../../core/stats';
import type { TimerState } from '../../core/timer';
import type { CentroView } from '../centro';
import type { CentroAnimator } from '../centro/animator';

// Números do protótipo: a reação começa meio segundo depois da gravação e dura 2,5 s.
export const REACTION_DELAY = 500;
export const REACTION_MS = 2500;
export const SLEEP_AFTER = 5 * 60000; // parado com o timer desligado por 5 min: o Centro dorme

export interface TimerLike {
  readonly state: TimerState;
  readonly inspectElapsed: number;
  readonly armProgress: number;
}

export interface CentroLive {
  readonly sleeping: boolean;
  view(now: number): CentroView; // o estado do Centro neste instante (performance.now)
  paint(now: number): CentroView; // o mesmo, já entregue ao animador (com o salto e a piscada no começo da reação)
  react(result: ResultKind | null, t0: number, seasonEnd?: boolean): void; // a reação ao solve, de t0 + 0,5 s a t0 + 3 s
  clearReaction(): void;
  reacting(now: number): boolean; // a reação ainda está na tela (o laço precisa de quadro)
  wake(wallNow: number): void; // uma entrada da pessoa (Date.now): acorda e conta a inatividade de novo
  sleepIfIdle(wallNow: number): boolean; // dorme se ficou 5 min parado com o timer desligado; true se dormiu agora
}

export function createCentroLive(timer: TimerLike, animator: CentroAnimator, wallNow: number): CentroLive {
  let reaction: { from: number; until: number; result: ResultKind | null; seasonEnd: boolean; triggered: boolean } | null = null;
  let sleeping = false;
  let lastInput = wallNow;

  function view(now: number): CentroView {
    if (sleeping) return { state: 'sleep' };
    if (timer.state === 'inspect') return { state: 'inspect', inspectElapsed: timer.inspectElapsed };
    if (timer.state === 'arming') return { state: 'arming', armProgress: timer.armProgress };
    if (timer.state === 'ready' || timer.state === 'running') return { state: timer.state };
    if (reaction && now < reaction.from) return { state: 'running' }; // ainda imóvel: a reação vem depois
    if (reaction && now < reaction.until) return { state: 'reaction', result: reaction.result ?? undefined };
    return { state: 'idle' };
  }

  return {
    get sleeping() {
      return sleeping;
    },
    view,
    paint(now) {
      const v = view(now);
      animator.show(v);
      if (reaction && v.state === 'reaction' && !reaction.triggered) {
        reaction.triggered = true;
        if (reaction.result === 'pb') animator.trigger('pb');
        if (reaction.seasonEnd) animator.trigger('seasonEnd');
      }
      return v;
    },
    react(result, t0, seasonEnd = false) {
      reaction = { from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + REACTION_MS, result, seasonEnd, triggered: false };
    },
    clearReaction() {
      reaction = null;
    },
    reacting(now) {
      return reaction !== null && now < reaction.until;
    },
    wake(now) {
      lastInput = now;
      sleeping = false;
    },
    sleepIfIdle(now) {
      if (sleeping || now - lastInput < SLEEP_AFTER || (timer.state !== 'idle' && timer.state !== 'done')) return false;
      sleeping = true;
      return true;
    },
  };
}
```

- [ ] **Step 4: A tela do Timer usa o controlador e o animador**

Em `app/src/ui/timer/TimerScreen.svelte`:

1. **Imports.** Troque `import { type CentroView as Vista, eyesFor, ringFor, updateCentro } from '../centro';` por:

```ts
  import type { CentroView as Vista } from '../centro';
  import { createCentroAnimator } from '../centro/animator';
  import { TIMING } from '../centro/behavior';
  import { createCentroLive, REACTION_DELAY, SLEEP_AFTER } from './centro-live';
```

2. **Constantes.** Apague `REACTION_DELAY`, `REACTION_MS`, `SLEEP_AFTER` e `ORBIT_MS` e troque o comentário de cima de `COACH_MS` por `// O coach fala por 6 s (a reação e o sono ficam em centro-live.ts).`. O único uso de `REACTION_MS` na tela é o temporizador da face cheia, que o item 7 troca por `TIMING.flash`.

3. **Animador e controlador.** Logo depois de `const loop = createTimeLoop(paint);`:

```ts
  // O Centro do Timer: o animador desenha (sob demanda, nada no solve) e o controlador diz o estado de cada quadro.
  const animator = createCentroAnimator({ svg: () => screenEl?.querySelector<SVGElement>('[data-centro-slot] svg.centro') ?? null });
  const live = createCentroLive(timer, animator, Date.now());
  let onScreen = $state(true); // o Centro está na área visível (IntersectionObserver)
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;
```

4. **Estado que sai.** Apague `let sleeping = $state(false);`, `let reaction: …`, `let orbit = 0;`, `let lastInput = Date.now();`, `let lastSvg …` e `let lastSig = '';`. Apague as funções `centroView` e `paintCentro`.

5. **`paint()`.** Troque `const view = centroView(now);` por `const view = live.paint(now);` e apague a linha `paintCentro(view);`.

6. **`needsFrame`.** Troque `if (reaction && now < reaction.until) return true;` por `if (live.reacting(now)) return true;`.

7. **`finishSolve`.**
   - Troque `reaction = null;` por `live.clearReaction();`.
   - Troque `reaction = { from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + REACTION_MS };` por `live.react(kind, t0, seasonClosed);`.
   - No temporizador da face cheia (Task 6), troque `REACTION_DELAY + REACTION_MS` por `REACTION_DELAY + TIMING.flash`: a face esvazia logo depois da piscada.
   - No acorde, troque `if (reaction && kind === 'pb' && timer.state === 'done') sound.chord();` por `if (live.reacting(performance.now()) && kind === 'pb' && timer.state === 'done') sound.chord();`.

8. **`removeLast`, `onState` e `resetForSession`.** Troque cada `reaction = null;` por `live.clearReaction();`.

9. **Congelar no solve.** Em `onState`, logo depois de `document.body.classList.toggle('solving', next === 'running');`:

```ts
    if (next === 'running') animator.freeze(); // nada do Centro roda no solve (spec 6.4), já neste quadro
```

10. **`onWake`.** Troque a função inteira por:

```ts
  // Qualquer entrada da pessoa acorda o Centro, conta a inatividade de novo (e destrava o áudio, que o navegador só libera num gesto).
  function onWake(): void {
    const wasSleeping = live.sleeping;
    live.wake(Date.now());
    armSleep();
    sound.unlock();
    if (wasSleeping) paint();
  }

  // O sono depois de 5 min parado: um temporizador só, refeito a cada entrada (sem laço contínuo). Se o timer estiver ocupado na hora,
  // confere de novo em 1 s.
  function armSleep(ms: number = SLEEP_AFTER): void {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      if (destroyed) return;
      if (live.sleepIfIdle(Date.now())) paint();
      else armSleep(1000);
    }, ms);
  }
```

11. **Limpeza.** No `$effect` de limpeza (o que faz `destroyed = true;`), acrescente `animator.destroy();` e `clearTimeout(sleepTimer);`.

12. **Efeitos.** Troque o `$effect` da órbita e do sono (o que tem `setInterval(…, ORBIT_MS)`) por:

```ts
  $effect(() => {
    untrack(() => armSleep());
    return () => clearTimeout(sleepTimer);
  });

  // O animador para com a página escondida, com o Centro fora da tela e fora da aba do Timer.
  $effect(() => {
    animator.setPaused(!pageVisible || !onScreen || app.tab !== 'timer');
  });
  $effect(() => {
    const slot = screenEl?.querySelector('[data-centro-slot]');
    if (!slot || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
    });
    io.observe(slot);
    return () => io.disconnect();
  });
  // Movimento reduzido: o Centro fica estático (a Task 12 junta o ajuste animado/estático/oculto).
  $effect(() => {
    animator.setAnimated(!reduced());
  });
  // O SVG é refeito quando o tema, o acabamento ou as marcas mudam: o animador pinta nele o estado atual.
  $effect(() => {
    void theme;
    void app.profile.finish;
    void topShown;
    void sideLit;
    void tick().then(() => animator.repaint());
  });
```

13. **Sobras.** Se `sleeping` era lido no markup ou em outro lugar, troque por `live.sleeping`. Confira com `grep -n "sleeping\|reaction\|orbit\|lastInput" src/ui/timer/TimerScreen.svelte` e deixe só os usos via `live`.

- [ ] **Step 5: CSS das animações antigas**

Em `app/src/styles/screens.css`, na seção do Centro:
- apague a regra `.centro .eye { transform-box…; animation: blink … }` e o `@keyframes blink`;
- apague `[data-cview='sleep'] .centro .ring.lit { animation: breathe … }` e o `@keyframes breathe`;
- apague `[data-cview='reaction'][data-result='pb'] .t-centro .centro { animation: lift … }` e o `@keyframes lift`;
- logo depois da regra `.centro rect { … }`, acrescente:

```css
/* O anel troca de cor com transição (cor não é movimento) e respira no sono: o animador alterna a classe breath-off a cada 2 s
   (o ciclo é de 4 s), e a transição de opacidade faz o resto. */
.centro .ring {
  transition: fill var(--t-state) var(--ease), opacity 2s ease-in-out;
}

.centro.breath-off .ring.lit {
  opacity: 0.35;
}
```

A regra `body.solving .centro, body.solving .centro * { animation: none !important; transition: none !important; }` fica.

- [ ] **Step 6: Rode os testes**

Run: `pnpm test -- tests/unit/centro-live.test.ts tests/unit/timer-screen.test.ts tests/unit/timer-input.test.ts tests/unit/timer-input-edge.test.ts tests/unit/app-shell.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/timer/centro-live.ts src/ui/timer/TimerScreen.svelte src/styles/screens.css tests/unit/centro-live.test.ts tests/unit/timer-screen.test.ts
git commit -m "feat(app): Centro do Timer pelo animador, sem laço parado e congelado no solve

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Ajuste "Centro: animado, estático ou oculto" e o Centro animado na tela dele

Spec: seção 6.5 e seção 8 (cartão Centro).

Ruling registrado: o tour (`OnboardingDialog.svelte`) continua trocando o Centro na hora, com `updateCentro`.
- **Por quê:** cada passo mostra um quadro fixo, e o tour aparece uma vez.
- **O que o animador faria:** a órbita e o piscar brigariam com o quadro de cada passo.
- **O que a spec queria:** pela tabela 6.5, o tour também seguiria o ajuste.
- **Custo se estiver errado:** trocar `paint()` do tour por um animador com `show()`.

**Files:**
- Modify: `app/src/core/types.ts` (`CentroMode`, `Settings.centro`, `DEFAULT_SETTINGS`)
- Modify: `app/src/data/transfer.ts` (`SETTING_CHECKS`)
- Modify: `app/src/strings.ts`
- Modify: `app/src/ui/centro/CentroScreen.svelte`
- Modify: `app/src/ui/timer/TimerScreen.svelte`
- Test: `app/tests/unit/transfer.test.ts`, `app/tests/unit/centro-screen.test.ts`, `app/tests/unit/timer-screen.test.ts`

**Interfaces:**
- Consumes: `createCentroAnimator` (Task 10); o `animator` do `TimerScreen` (Task 11).
- Produces:
  - `type CentroMode = 'animado' | 'estatico' | 'oculto'`
  - `Settings.centro: CentroMode` (padrão `'animado'`)
  - `T.centro.card`, `T.centro.mode`, `T.centro.modeHint` e `T.centro.modeOptions`

- [ ] **Step 1: Escreva os testes que falham**

Em `app/tests/unit/transfer.test.ts`, no `describe('perfil do arquivo, campo por campo', …)`:

```ts
    it('o ajuste do Centro passa só com um valor conhecido', () => {
      expect(parseKlickJson(withProfile({ settings: { centro: 'oculto' } })).profile).toEqual({ settings: { centro: 'oculto' } });
      expect(parseKlickJson(withProfile({ settings: { centro: 'girando' } })).profile).toEqual({ settings: {} });
    });
```

Em `app/tests/unit/centro-screen.test.ts`, no `describe('Centro: trilha, acabamento e modo silencioso', …)`:

```ts
  it('o controle do Centro grava o ajuste e marca a opção escolhida', async () => {
    const { a } = await app();
    render(CentroScreen, { app: a });
    const group = await screen.findByRole('group', { name: T.centro.mode });
    expect(group.querySelector('[data-val="animado"]')).toHaveAttribute('aria-pressed', 'true');
    (group.querySelector('[data-val="oculto"]') as HTMLButtonElement).click();
    await waitFor(() => expect(a.profile.settings.centro).toBe('oculto'));
    await waitFor(() => expect(group.querySelector('[data-val="oculto"]')).toHaveAttribute('aria-pressed', 'true'));
  });
```

(o `T` já foi importado na Task 5).

Em `app/tests/unit/timer-screen.test.ts`, no `describe('tela do Timer: solve, reação e nota', …)`:

```ts
  it('com o Centro oculto, o Timer não mostra o cubo, e o solve, a reação e o coach seguem', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false, centro: 'oculto' });
    render(TimerScreen, { app: a });
    expect(document.querySelector('[data-centro-slot]')).toBeNull();
    await solveByKeys();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(document.querySelector('.coach')?.textContent).toMatch(/Marco \d de 9/), { timeout: 3000 });
  });

  it('animado, o adesivo ocioso dá a volta; com movimento reduzido, o anel fica parado', async () => {
    const { a } = await app();
    render(TimerScreen, { app: a });
    await waitFor(() => expect(document.querySelectorAll('[data-centro-slot] .ring.lit')).toHaveLength(1));
    await a.updateSettings({ reducedMotion: 'always' });
    await waitFor(() => expect(document.querySelectorAll('[data-centro-slot] .ring.lit')).toHaveLength(0));
  });
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test -- tests/unit/transfer.test.ts tests/unit/centro-screen.test.ts tests/unit/timer-screen.test.ts`
Expected: FAIL. O ajuste `centro` não existe, e o grupo de controle não aparece.

- [ ] **Step 3: Tipo, padrão e validação**

Em `app/src/core/types.ts`:
- acrescente, antes de `export interface Settings`:

```ts
// O Centro no Timer (spec do sub-projeto 3, seção 6.5): animado, estático (sem movimento) ou oculto (fora do Timer).
export type CentroMode = 'animado' | 'estatico' | 'oculto';
```

- em `Settings`, acrescente `centro: CentroMode;` depois de `scrambleImage: boolean;`;
- em `DEFAULT_SETTINGS`, acrescente `centro: 'animado',` depois de `scrambleImage: true,`.

Em `app/src/data/transfer.ts`, em `SETTING_CHECKS`, acrescente `centro: oneOf(['animado', 'estatico', 'oculto']),`.

- [ ] **Step 4: Textos**

Em `app/src/strings.ts`, no bloco `centro`, acrescente:

```ts
    card: 'Centro',
    mode: 'Animação do Centro',
    modeHint: 'Estático não se mexe. Oculto tira o Centro do Timer; os avisos seguem no número e no som.',
    modeOptions: Object.freeze([['animado', 'Animado'], ['estatico', 'Estático'], ['oculto', 'Oculto']] as const),
```

- [ ] **Step 5: Tela do Centro**

Em `app/src/ui/centro/CentroScreen.svelte`:

1. **Imports.** Acrescente `import { tick } from 'svelte';` e `import { createCentroAnimator } from '../centro/animator';`.

2. **Animador.** No script, depois dos derivados:

```ts
  // O Centro grande segue o ajuste: animado ou estático (nesta tela, "oculto" vale como estático). Parado, só pisca, olha e orbita.
  let bigEl = $state<HTMLElement>();
  let reduceMq = $state(false);
  const animator = createCentroAnimator({ svg: () => bigEl?.querySelector<SVGElement>('svg.centro') ?? null });
  $effect(() => {
    const s = app.profile.settings;
    animator.setAnimated(s.centro === 'animado' && s.reducedMotion !== 'always' && !reduceMq);
  });
  // O SVG é refeito quando as marcas, o tema ou o acabamento mudam: o animador pinta nele o parado.
  $effect(() => {
    void svg;
    void tick().then(() => {
      animator.show({ state: 'idle' });
      animator.repaint();
    });
  });
  $effect(() => {
    const sync = (): void => animator.setPaused(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      animator.destroy();
    };
  });
```

3. **Movimento reduzido do sistema.** No `$effect` do `matchMedia` que já existe, leia também `(prefers-reduced-motion: reduce)` para `reduceMq`, do mesmo jeito que `darkMq`. O `sync` passa a fazer as duas leituras e o `addEventListener` vale para as duas listas.

4. **Markup do palco.** Troque `<div class="big">{@html svg}</div>` por `<div class="big" bind:this={bigEl}>{@html svg}</div>`.

5. **Cartão Centro.** Troque o cartão do modo silencioso (`<div class="card silent-row">…</div>`) por:

```svelte
      <div class="card">
        <div class="label">{T.centro.card}</div>
        <div class="seg" role="group" aria-label={T.centro.mode}>
          {#each T.centro.modeOptions as [value, label] (value)}
            <button
              type="button"
              data-set="centro"
              data-val={value}
              aria-pressed={app.profile.settings.centro === value ? 'true' : 'false'}
              onclick={() => app.updateSettings({ centro: value })}>{label}</button
            >
          {/each}
        </div>
        <p class="silent-hint">{T.centro.modeHint}</p>
        <div class="silent-row">
          <input
            type="checkbox"
            class="switch"
            id="silent"
            data-silent
            checked={app.profile.settings.silent}
            onchange={(e) => setSilent(e.currentTarget)}
          />
          <label for="silent">
            <span class="label">{T.timer.coachLabel}</span>
            <span class="silent-hint">{T.centro.silentHint}</span>
          </label>
        </div>
      </div>
```

   Se a linha do modo silencioso perder o layout lado a lado (caixa e texto), acrescente ao `<style>` do componente `.silent-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; }`. Antes, confira se `components.css` já não estiliza `.silent-row`.

- [ ] **Step 6: Tela do Timer**

Em `app/src/ui/timer/TimerScreen.svelte`:

1. **Modo.** Acrescente `const mode = $derived(app.profile.settings.centro);` junto dos outros derivados.

2. **Efeitos.** Troque o efeito `animator.setAnimated(!reduced())` da Task 11 por:

```ts
  // Animado, estático ou oculto (spec 6.5); movimento reduzido vale como estático.
  $effect(() => {
    animator.setAnimated(mode === 'animado' && !reduced());
  });
```

   e, no efeito do `setPaused`, acrescente `|| mode === 'oculto'`.

3. **Markup.** Troque `<CentroView {theme} finish={app.profile.finish} topLit={topShown} {sideLit} />` por:

```svelte
      {#if mode !== 'oculto'}
        <CentroView {theme} finish={app.profile.finish} topLit={topShown} {sideLit} />
      {/if}
```

- [ ] **Step 7: Rode os testes e os tipos**

Run: `pnpm test -- tests/unit/transfer.test.ts tests/unit/centro-screen.test.ts tests/unit/timer-screen.test.ts tests/unit/ajustes-screen.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros. Se algum teste montar `Settings` à mão, acrescente `centro: 'animado'`.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/data/transfer.ts src/strings.ts src/ui/centro/CentroScreen.svelte src/ui/timer/TimerScreen.svelte tests/unit/transfer.test.ts tests/unit/centro-screen.test.ts tests/unit/timer-screen.test.ts
git commit -m "feat(app): ajuste do Centro animado, estático ou oculto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ponta a ponta e acessibilidade

Spec: seção 9 (ponta a ponta) e seção 11 (critérios 1, 3 e 7).

**Files:**
- Create: `app/tests/e2e/companion.spec.ts`

**Interfaces:**
- Consumes:
  - o app inteiro;
  - `fresh`, `noInspection` e `quickSolve` de `tests/e2e/helpers.ts`;
  - o seletor de arquivo de Seus dados (`getByRole('group', { name: 'Seus dados' }).getByLabel('Importar arquivo')`).

- [ ] **Step 1: Escreva os testes**

Crie `app/tests/e2e/companion.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fresh, noInspection, quickSolve } from './helpers';

const DAY = 86400000;

// Um arquivo do Klick com 1.000 solves de 3×3 de 50 s, 100 por dia nos 10 dias antes de hoje: fecham os 9 marcos da T1.
function t1File(season?: unknown): Buffer {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const end = noon.getTime();
  const session = { id: 'imp', name: 'Importada', event: '333', order: 5, createdAt: end - 11 * DAY, updatedAt: end - 11 * DAY, deletedAt: null };
  const solves = Array.from({ length: 1000 }, (_, i) => {
    const at = end - (10 - Math.floor(i / 100)) * DAY + (i % 100) * 60000;
    return { id: `imp${i}`, sessionId: 'imp', event: '333', ms: 50000, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null };
  });
  const data = { format: 'klick', version: 1, exportedAt: Date.now(), sessions: [session], solves, profile: season ? { season } : null };
  return Buffer.from(JSON.stringify(data));
}

async function importFile(page: Page, buffer: Buffer): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('group', { name: 'Seus dados' }).getByLabel('Importar arquivo').setInputFiles({ name: 'klick.json', mimeType: 'application/json', buffer });
  await expect(page.getByText(/1000 solves importados/)).toBeVisible();
}

test('importar 1.000 solves fecha a T1, libera o Brilho e abre a T2 com metas da escada', async ({ page }) => {
  await fresh(page);
  await importFile(page, t1File());
  await page.getByRole('button', { name: 'Centro', exact: true }).first().click();
  const screen = page.locator('[data-screen="companion"]');
  await expect(screen.getByText(/Temporada 2 · 0 de 9 marcos/)).toBeVisible();
  await expect(screen.getByText('Média de 5 abaixo de 48 s')).toBeVisible();
  await expect(screen.getByText(/^T1 · /)).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Brilho', exact: true })).toBeVisible();
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('um solve que fecha a temporada mostra o fim de temporada e libera o Gelo', async ({ page }) => {
  await fresh(page);
  await noInspection(page);
  // Uma T2 já começada em que qualquer solve novo fecha os 9 marcos.
  const season = {
    current: { n: 2, startedAt: Date.now() - 1000, marks: Array.from({ length: 9 }, () => ({ kind: 'count', target: 1 })), basis: { single: 50000, ao5: 50000, ao12: 50000 } },
    past: [{ n: 1, startedAt: Date.now() - 20 * DAY, endedAt: Date.now() - 2 * DAY, solves: 1000, startAo12: null, endAo12: 50000 }],
  };
  await importFile(page, t1File(season));
  await page.getByRole('button', { name: 'Timer', exact: true }).click();
  await quickSolve(page);
  await expect(page.getByText('Temporada 2 completa: 1 solve. Gelo liberado.')).toBeVisible();
  await page.getByRole('button', { name: 'Centro', exact: true }).first().click();
  const screen = page.locator('[data-screen="companion"]');
  await expect(screen.getByText(/Temporada 3 · 0 de 9 marcos/)).toBeVisible();
  await expect(screen.getByText(/^T2 · /)).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Gelo', exact: true })).toBeVisible();
});
```

Sobre os números esperados:
- **Primeiro teste:** os 1.000 solves de 50 s dão `A5 = 50 s`. O degrau abaixo de 50 s é 48 s, por isso "Média de 5 abaixo de 48 s".
- **Segundo teste:** a importação adota a temporada do arquivo, que tem uma temporada fechada contra nenhuma daqui. A conferência do fim da importação não vira, porque nenhum solve veio depois de `startedAt`. O `quickSolve` vem depois e fecha.

- [ ] **Step 2: Rode o ponta a ponta**

Run: `pnpm test:e2e -- companion.spec.ts`
Expected: PASS nos dois projetos (desktop; o mobile só roda `timer` e `sessions`).

Se o botão da aba do Centro tiver outro nome acessível, use o mesmo que `a11y.spec.ts` usa (`getByRole('button', { name: 'Centro', exact: true }).first()`).

Run: `pnpm test:e2e`
Expected: PASS (a suíte inteira, com `a11y.spec.ts` nos dois temas).

- [ ] **Step 3: Rode tudo uma última vez**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm check`
Expected: 0 erros.

Run: `pnpm build`
Expected: o build termina sem erro.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/companion.spec.ts
git commit -m "test(app): ponta a ponta das temporadas do Centro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois do plano (o controlador faz, com o ok do Ranielli)

1. **Beta.** Publicar no beta: `pnpm build && npx wrangler deploy`, dentro de `app/`.
2. **Conferência manual da spec 9:**
   - legibilidade do rosto a 48, 64, 96 e 300 px, nos dois temas e com movimento reduzido;
   - fluidez das reações num Android médio.
3. **Raiz e push.** Raiz (`npx wrangler deploy --env production`) e `git push` só com o ok explícito de cada um.
