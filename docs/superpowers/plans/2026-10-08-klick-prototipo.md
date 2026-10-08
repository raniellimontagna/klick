# Klick v2 — protótipo interativo: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhar.

**Objetivo:** construir o protótipo navegável do Klick v2 em HTML, CSS e JS puros e publicá-lo num link privado. Ele tem timer de verdade, o Centro com todos os estados, coach, evolução, as quatro telas e o modo celular com dois polegares.

**Arquitetura:**
- A lógica fica em módulos ES puros, testados com o runner nativo do Node: estatísticas, base de exemplo, timer, toque, coach, Centro e estado.
- As telas são funções que geram HTML a partir do estado.
- `app.js` liga tudo ao DOM: teclado, toque, loop de quadros, persistência.
- Não há build nem dependência em tempo de execução.

**Tech stack:** HTML; CSS com custom properties; JavaScript em ES modules; Web Audio; `node --test` (Node ≥ 20, e a máquina tem Node 24); Geist e Geist Mono pelo Google Fonts.

**Spec:** `docs/superpowers/specs/2026-10-08-klick-design.md` (as seções 5 a 8 são a fonte da verdade). As referências visuais aprovadas estão em `docs/design/brainstorm/`.

**Onde trabalhar:**
- Repo `~/Projetos/pessoal/klick`, branch `v2`, que já existe e já tem a spec commitada.
- Todo comando roda a partir da raiz do repo, exceto onde o passo diz `cd prototype`.
- Commits só locais: **não dar push**.

**Origem do código:** todo o código abaixo foi escrito e validado antes do plano. São 73 testes passando no Node 24, e o fluxo completo foi exercitado no navegador: desktop, celular emulado, temas claro e noite. Copie os arquivos exatamente como estão.

## Global Constraints

- **Sem build e sem dependência em tempo de execução.** Só arquivos estáticos em `prototype/`, em ES modules com imports relativos e extensão `.js`.
- **Testes:** `node --test`, sem bibliotecas, rodados de dentro de `prototype/` com `npm test`.
- **Textos:** pt-BR, centralizados em `scripts/strings.js`. A voz do coach é calma, curta e com número; sem emoji, sem exclamação, sem culpa (spec 5.7).
- **Tempos:**
  - guardados em milissegundos e exibidos truncados no centésimo (`0:58.42`);
  - médias na convenção do csTimer: descartam `ceil(5% de n)` de cada lado (ao5 e ao12: 1; ao50: 3; ao100: 5);
  - DNF conta como o pior tempo; se sobrar DNF depois do descarte, a média vira DNF (spec 7.4).
- **Inspeção WCA:** 15 s; avisos aos 8 s e 12 s; largar depois de 15 s dá +2; depois de 17 s, DNF (spec 6.3).
- **Padrões:** tempo para armar 0,3 s (opções 0 · 0,3 · 0,55 · 1 s) e armar no celular com "dois polegares" (spec 7.7).
- **Tokens de cor:** os da spec 5.1, com cinco ajustes de contraste AA no tema claro previstos na spec 10: `muted #6f6a60`, `dec #8a857b`, `insp-8 #b7770b`, `insp-12 #c2561a` e `pb #a67908`. Soma-se `--trail` (`#3e63dd` no claro, `#4c6fe8` no noite).
- **Tema:** "sistema" por padrão; `data-theme="light"` ou `"dark"` no `<html>` força o tema. O bloco do tema escuro aparece duas vezes: na media query com `:root:not([data-theme='light'])` e em `:root[data-theme='dark']`.
- **Acessibilidade:**
  - estado nunca só por cor;
  - `aria-live="polite"` anuncia o tempo final e a mensagem do coach;
  - foco visível e alvos de toque com pelo menos 44 px;
  - `prefers-reduced-motion`, ou o ajuste "Sempre", desliga as animações.
- **`localStorage`** é só conveniência: todo acesso fica em `try/catch`, e sem armazenamento o app funciona em memória.
- **Durante o solve:** o Centro não anima, o coach não fala, e tudo fica a 8% de opacidade, menos o tempo e o Centro.
- **Reação:**
  - a reação do Centro começa 500 ms depois do tempo e dura 2,5 s;
  - a mensagem do coach dura 6 s, no máximo uma por solve;
  - segurar de novo cancela tudo.
- **Commits:** em português, no padrão `tipo(prototipo): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Entradas e condições que a spec implica, mas que nenhum teste automático cobre, da mais provável de incomodar para a menos:

1. **Espaço com foco num botão ou numa aba** (depois de um clique com o mouse). O timer deve armar e o botão não deve ser acionado. Verificado no Task 10, passo 6.
2. **Digitar na nota do solve**, inclusive P, D, Z, N e espaço. O texto deve entrar normalmente, sem marcar +2 ou DNF, sem desfazer, sem trocar o embaralhamento e sem armar o timer. Verificado no Task 10, passo 6.
3. **Armazenamento bloqueado ou cheio** (janela privada, cota, iframe do link privado). O app deve abrir e funcionar em memória, sem erro no console. Coberto pelos testes de `loadState`/`saveState` com armazenamento quebrado (Task 7) e pela checagem no link publicado (Task 11, passo 4).
4. **Começar do zero, sem nenhum solve.** As médias devem mostrar "—" e o primeiro solve não deve comemorar recorde. O coach deve dizer "Primeiro solve registrado. Marco 1 de 9." e a face de cima deve ganhar o primeiro dourado. Coberto pelo teste do coach (Task 5) e verificado no Task 10, passo 7.
5. **Tocar ou clicar em qualquer lugar com o timer rodando, inclusive numa aba.** Deve só parar o timer, sem navegar. Verificado no Task 10, passo 6.

---
### Task 1: Infra de testes, textos e estatísticas

**Files:**
- Create: `prototype/package.json`
- Create: `prototype/scripts/strings.js`
- Create: `prototype/scripts/stats.js`
- Test: `prototype/tests/stats.test.js`

**Interfaces:**
- **Consumes:** nada.
- **Produces:**
  - De `stats.js`:
    - `MILESTONES: string[]`, com os ids `first`, `sub2`, `n100`, `sub130`, `ao5sub130`, `sub1`, `streak7`, `ao12sub1` e `n1000`.
    - Tempos:
      - `effectiveMs(solve) → number | Infinity | null`
      - `formatMs(ms) → string`
      - `formatSolve(solve) → string`
    - Médias e recordes:
      - `trimCount(n) → number`
      - `averageOf(solves, n) → number | Infinity | null`
      - `rollingAverages(solves, n) → (number | Infinity | null)[]`
      - `bestSingle(solves) → number | null`
      - `bestSingleSolve(solves) → solve | null`
      - `bestAverage(solves, n) → number | null`
      - `stdDevMs(solves) → number | null`
    - Datas:
      - `dayKey(ts) → 'YYYY-MM-DD'`
      - `solvesOnDay(solves, ts) → solve[]`
      - `currentStreak(solves, nowTs) → number`
    - Resultado de um solve:
      - `solveDeltas(history, solve) → { vsAo5, vsPb, isPb }`
      - `resultKind(history, solve) → 'pb' | 'good' | 'slow' | 'plus2' | 'dnf'`
    - Constância e marcos:
      - `monthHeat(solves, nowTs) → { day, count, level, pb, today }[]`
      - `milestoneProgress(solves, nowTs) → { id, achieved, at, progress }[]`
      - `achievedIds(solves, nowTs) → string[]`
      - `pbFlags(solves) → boolean[]`
  - De `strings.js`: `T`, `MILESTONE_INFO`, `TRAIL` e `FINISH_INFO` (os textos da interface).
- **Formato de um solve:** `{ id, ms, penalty: null | '+2' | 'DNF', at, scramble, note, session }`. As listas chegam em ordem cronológica.

- [ ] **Step 1: Criar o `package.json` do protótipo**

`prototype/package.json`:

```json
{
  "name": "klick-prototype",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "serve": "python3 -m http.server 4173"
  }
}
```

- [ ] **Step 2: Escrever o teste que falha**

`prototype/tests/stats.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveMs, formatMs, formatSolve, trimCount, averageOf, rollingAverages, bestSingle, bestAverage,
  stdDevMs, dayKey, currentStreak, solveDeltas, resultKind, monthHeat, milestoneProgress, achievedIds, pbFlags,
} from '../scripts/stats.js';

const DAY = 86400000;
const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
let id = 0;
const sv = (ms, penalty = null, at = NOW) => ({ id: ++id, ms, penalty, at, scramble: '', note: '', session: 's1' });

test('effectiveMs aplica +2 e DNF', () => {
  assert.equal(effectiveMs(sv(58420)), 58420);
  assert.equal(effectiveMs(sv(58420, '+2')), 60420);
  assert.equal(effectiveMs(sv(58420, 'DNF')), Infinity);
});

test('formatMs trunca no centésimo e trata vazio e DNF', () => {
  assert.equal(formatMs(58429), '0:58.42');
  assert.equal(formatMs(61005), '1:01.00');
  assert.equal(formatMs(Infinity), 'DNF');
  assert.equal(formatMs(null), '—');
  assert.equal(formatSolve(sv(58420, '+2')), '1:00.42+');
  assert.equal(formatSolve(sv(58420, 'DNF')), 'DNF');
});

test('trimCount segue a convenção de 5% arredondado para cima', () => {
  assert.deepEqual([5, 12, 50, 100].map(trimCount), [1, 1, 3, 5]);
});

test('averageOf descarta melhor e pior e arredonda para 10 ms', () => {
  const xs = [60000, 70000, 50000, 65000, 80000].map((ms) => sv(ms));
  assert.equal(averageOf(xs, 5), 65000);
  assert.equal(averageOf(xs.slice(0, 4), 5), null);
});

test('um DNF é descartado; dois DNFs tornam a média de 5 DNF', () => {
  const one = [sv(60000), sv(61000, 'DNF'), sv(62000), sv(63000), sv(64000)];
  assert.equal(averageOf(one, 5), 63000);
  const two = [sv(60000), sv(61000, 'DNF'), sv(62000, 'DNF'), sv(63000), sv(64000)];
  assert.equal(averageOf(two, 5), Infinity);
});

test('rollingAverages e bestAverage', () => {
  const xs = [70000, 60000, 65000, 62000, 61000, 90000].map((ms) => sv(ms));
  const r = rollingAverages(xs, 5);
  assert.deepEqual(r.slice(0, 4), [null, null, null, null]);
  assert.equal(r[4], 62670);
  assert.equal(r[5], 62670);
  assert.equal(bestAverage(xs, 5), 62670);
});

test('bestSingle ignora DNF e soma +2', () => {
  assert.equal(bestSingle([sv(50000, 'DNF'), sv(59000, '+2'), sv(60500)]), 60500);
  assert.equal(bestSingle([]), null);
});

test('stdDevMs ignora DNF e precisa de 2 valores', () => {
  assert.equal(stdDevMs([sv(60000)]), null);
  assert.equal(Math.round(stdDevMs([sv(60000), sv(62000), sv(64000), sv(1, 'DNF')])), 2000);
});

test('currentStreak conta dias seguidos até hoje ou ontem', () => {
  const xs = [sv(60000, null, NOW - 3 * DAY), sv(60000, null, NOW - 2 * DAY), sv(60000, null, NOW - DAY), sv(60000, null, NOW)];
  assert.equal(currentStreak(xs, NOW), 4);
  assert.equal(currentStreak(xs.slice(0, 3), NOW), 3);
  assert.equal(currentStreak([sv(60000, null, NOW - 5 * DAY)], NOW), 0);
  assert.equal(dayKey(NOW), '2026-10-08');
});

test('solveDeltas e resultKind', () => {
  const hist = [62000, 63000, 61000, 64000, 60000].map((ms) => sv(ms));
  assert.deepEqual(solveDeltas(hist, sv(59000)), { vsAo5: 59000 - 62000, vsPb: -1000, isPb: true });
  assert.equal(resultKind(hist, sv(59000)), 'pb');
  assert.equal(resultKind(hist, sv(61500)), 'good');
  assert.equal(resultKind(hist, sv(70000)), 'slow');
  assert.equal(resultKind(hist, sv(50000, 'DNF')), 'dnf');
  assert.equal(resultKind(hist, sv(50000, '+2')), 'plus2');
  assert.equal(resultKind([], sv(80000)), 'good');
});

test('monthHeat marca níveis, hoje e o dia do recorde', () => {
  const xs = [
    ...Array.from({ length: 6 }, () => sv(70000, null, NOW - 2 * DAY)),
    sv(55000, null, NOW - DAY),
    ...Array.from({ length: 15 }, () => sv(68000, null, NOW)),
  ];
  const heat = monthHeat(xs, NOW);
  assert.equal(heat.length, 31);
  assert.equal(heat[5].level, 2);
  assert.equal(heat[6].level, 1);
  assert.equal(heat[6].pb, true);
  assert.equal(heat[7].level, 3);
  assert.equal(heat[7].today, true);
  assert.equal(heat[8].level, 0);
});

test('milestoneProgress reconhece os marcos e mostra o progresso', () => {
  const xs = [sv(130000, null, NOW - DAY), sv(119000, null, NOW - DAY), sv(89000, null, NOW)];
  const m = Object.fromEntries(milestoneProgress(xs, NOW).map((x) => [x.id, x]));
  assert.equal(m.first.achieved, true);
  assert.equal(m.sub2.achieved, true);
  assert.equal(m.sub130.achieved, true);
  assert.equal(m.sub1.achieved, false);
  assert.equal(m.sub1.progress, 'melhor 1:29.00');
  assert.equal(m.n100.progress, '3/100');
  assert.equal(m.streak7.progress, '2/7');
  assert.deepEqual(achievedIds(xs, NOW), ['first', 'sub2', 'sub130']);
});

test('streak7 exige sete dias seguidos', () => {
  const xs = Array.from({ length: 7 }, (_, i) => sv(70000, null, NOW - (6 - i) * DAY));
  assert.ok(achievedIds(xs, NOW).includes('streak7'));
  assert.ok(!achievedIds(xs.slice(1), NOW).includes('streak7'));
});

test('pbFlags marca só quem bateu o recorde da época', () => {
  const xs = [70000, 72000, 65000, 66000, 64000].map((ms) => sv(ms));
  assert.deepEqual(pbFlags(xs), [false, false, true, false, true]);
  assert.deepEqual(pbFlags([sv(60000), sv(50000, 'DNF'), sv(59000)]), [false, false, true]);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd prototype && node --test tests/stats.test.js`
Expected: FAIL com `Cannot find module '…/scripts/stats.js'`.

- [ ] **Step 4: Implementar textos e estatísticas**

`prototype/scripts/strings.js`:

```js
// Todo texto que a pessoa lê passa por aqui (pt-BR). Facilita traduzir depois.
const sec = (ms) => (ms / 1000).toFixed(2);

export const MILESTONE_INFO = Object.freeze({
  first: { label: 'Primeiro solve', msg: 'Primeiro solve registrado' },
  sub2: { label: 'Sub-2:00', msg: 'Primeiro solve abaixo de 2 minutos' },
  n100: { label: '100 solves', msg: 'Cem solves registrados' },
  sub130: { label: 'Sub-1:30', msg: 'Primeiro solve abaixo de 1:30' },
  ao5sub130: { label: 'Média de 5 sub-1:30', msg: 'Média de 5 abaixo de 1:30' },
  sub1: { label: 'Sub-1:00', msg: 'Primeiro solve abaixo de 1 minuto' },
  streak7: { label: '7 dias seguidos', msg: 'Sete dias seguidos de treino' },
  ao12sub1: { label: 'Média de 12 sub-1:00', msg: 'Média de 12 abaixo de 1 minuto' },
  n1000: { label: '1.000 solves', msg: 'Mil solves registrados' },
});

export const TRAIL = Object.freeze([
  'Cruz branca',
  'Cantos brancos',
  'Segunda camada',
  'Cruz amarela',
  'Orientar e permutar',
  'F2L intuitivo',
  'OLL em 2 passos',
  'PLL em 2 passos',
  'F2L com algoritmos',
]);

export const FINISH_INFO = Object.freeze({
  fosco: { label: 'Fosco', unlock: 'padrão' },
  brilho: { label: 'Brilho', unlock: 'temporada 1' },
  gelo: { label: 'Gelo', unlock: 'temporada 2' },
  carbono: { label: 'Carbono', unlock: 'temporada 3' },
});

export const T = Object.freeze({
  coach: {
    idle: 'Quando quiser. Segure espaço para armar.',
    idleTouch: 'Quando quiser. Segure com os dois polegares.',
    idleOne: 'Quando quiser. Toque e segure para armar.',
    inspect: 'Inspeção. Segure para armar quando estiver pronto.',
    arming: 'Armando…',
    ready: 'Solte para começar.',
    pbSingle: (diffMs) => `Novo recorde — ${sec(diffMs)} s mais rápido. Vale lembrar o que funcionou.`,
    pbAverage: (label, value) => `Sua ${label} caiu para ${value}. Isso é consistência, não sorte.`,
    milestone: (msg, k) => `${msg}. Marco ${k} de 9.`,
    dailyGoal: (n) => `Meta de ${n} solves feita. O resto é bônus.`,
    stable: 'Cinco solves dentro de 3 segundos. Ritmo estável.',
    fatigue: 'Seus últimos estão subindo. Uma pausa de 5 minutos costuma ajudar.',
    firstDnf: 'DNF acontece. Respira e segue.',
    back: 'Que bom te ver. Começa leve — o primeiro não conta pra nada.',
  },
  chips: {
    vsAo5: (diffMs) => `${diffMs <= 0 ? '▼' : '▲'} ${sec(Math.abs(diffMs))} s vs média de 5`,
    vsPb: (diffMs) => `▲ ${sec(diffMs)} s do recorde`,
    newPb: (diffMs) => `◆ ${sec(diffMs)} s abaixo do recorde`,
    solveN: (n) => `solve #${n}`,
  },
  aria: {
    final: (text) => `Tempo final: ${text}.`,
  },
  toast: {
    deleted: 'Solve excluído',
    undo: 'Desfazer (Z)',
    exportFail: 'Exportação indisponível neste ambiente.',
  },
  season: (done, finish) => `Temporada 1 · ${done} de 9 marcos · acabamento ${finish}`,
});
```

`prototype/scripts/stats.js`:

```js
// Estatísticas puras. Um solve é { id, ms, penalty: null | '+2' | 'DNF', at, scramble, note, session }.
// As listas chegam em ordem cronológica (mais antigo primeiro).
const DAY = 86400000;

export const MILESTONES = Object.freeze(['first', 'sub2', 'n100', 'sub130', 'ao5sub130', 'sub1', 'streak7', 'ao12sub1', 'n1000']);

export function effectiveMs(solve) {
  if (!solve) return null;
  if (solve.penalty === 'DNF') return Infinity;
  return solve.ms + (solve.penalty === '+2' ? 2000 : 0);
}

// Tempo truncado no centésimo, como no display do stackmat.
export function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms === Infinity) return 'DNF';
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const rest = cs - m * 6000;
  const s = Math.floor(rest / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(rest % 100).padStart(2, '0')}`;
}

export function formatSolve(solve) {
  if (solve.penalty === 'DNF') return 'DNF';
  return formatMs(effectiveMs(solve)) + (solve.penalty === '+2' ? '+' : '');
}

// Convenção do csTimer: descarta 5% de cada lado, arredondando para cima (ao5 e ao12: 1; ao50: 3; ao100: 5).
export const trimCount = (n) => Math.ceil(n * 0.05);

function trimmedMean(values) {
  const t = trimCount(values.length);
  const kept = [...values].sort((a, b) => a - b).slice(t, values.length - t);
  if (kept.some((v) => v === Infinity)) return Infinity;
  return Math.round(kept.reduce((a, b) => a + b, 0) / kept.length / 10) * 10;
}

export function averageOf(solves, n) {
  if (solves.length < n) return null;
  return trimmedMean(solves.slice(-n).map(effectiveMs));
}

export function rollingAverages(solves, n) {
  const eff = solves.map(effectiveMs);
  return eff.map((_, i) => (i + 1 < n ? null : trimmedMean(eff.slice(i + 1 - n, i + 1))));
}

export function bestSingle(solves) {
  let best = null;
  for (const x of solves) {
    const e = effectiveMs(x);
    if (e !== Infinity && (best === null || e < best)) best = e;
  }
  return best;
}

export function bestSingleSolve(solves) {
  let best = null;
  for (const x of solves) {
    const e = effectiveMs(x);
    if (e !== Infinity && (best === null || e < effectiveMs(best))) best = x;
  }
  return best;
}

export function bestAverage(solves, n) {
  let best = null;
  for (const v of rollingAverages(solves, n)) if (v !== null && v !== Infinity && (best === null || v < best)) best = v;
  return best;
}

export function stdDevMs(solves) {
  const v = solves.map(effectiveMs).filter((e) => e !== Infinity);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const noon = (key) => new Date(`${key}T12:00:00`).getTime();

export function solvesOnDay(solves, ts) {
  const k = dayKey(ts);
  return solves.filter((x) => dayKey(x.at) === k);
}

// Dias seguidos terminando hoje (ou ontem, se ainda não houve solve hoje).
export function currentStreak(solves, nowTs) {
  const days = new Set(solves.map((x) => dayKey(x.at)));
  const d = new Date(nowTs);
  d.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function solveDeltas(history, solve) {
  const e = effectiveMs(solve);
  const prevAo5 = averageOf(history, 5);
  const prevPb = bestSingle(history);
  return {
    vsAo5: prevAo5 !== null && prevAo5 !== Infinity && e !== Infinity ? e - prevAo5 : null,
    vsPb: prevPb !== null && e !== Infinity ? e - prevPb : null,
    isPb: prevPb !== null && e !== Infinity && e < prevPb,
  };
}

// Tipo de reação do Centro: 'pb' | 'good' | 'slow' | 'plus2' | 'dnf'.
export function resultKind(history, solve) {
  if (solve.penalty === 'DNF') return 'dnf';
  if (solve.penalty === '+2') return 'plus2';
  const d = solveDeltas(history, solve);
  if (d.isPb) return 'pb';
  return d.vsAo5 === null || d.vsAo5 <= 0 ? 'good' : 'slow';
}

export function monthHeat(solves, nowTs) {
  const now = new Date(nowTs);
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const counts = new Map();
  for (const x of solves) {
    const d = new Date(x.at);
    if (d.getFullYear() === y && d.getMonth() === m) counts.set(d.getDate(), (counts.get(d.getDate()) || 0) + 1);
  }
  const pb = bestSingleSolve(solves);
  const pbDate = pb ? new Date(pb.at) : null;
  const pbDay = pbDate && pbDate.getFullYear() === y && pbDate.getMonth() === m ? pbDate.getDate() : null;
  return Array.from({ length: daysIn }, (_, i) => {
    const day = i + 1;
    const count = counts.get(day) || 0;
    return { day, count, level: count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : 3, pb: day === pbDay, today: day === now.getDate() };
  });
}

// Marcos da temporada 1, com o momento em que cada um foi conquistado e o progresso dos que faltam.
export function milestoneProgress(solves, nowTs) {
  const at = {};
  const r5 = rollingAverages(solves, 5);
  const r12 = rollingAverages(solves, 12);
  let best = null;
  let run = 0;
  let bestRun = 0;
  let prevDay = null;
  solves.forEach((x, i) => {
    const e = effectiveMs(x);
    if (e !== Infinity && (best === null || e < best)) best = e;
    const k = dayKey(x.at);
    if (k !== prevDay) {
      run = prevDay !== null && Math.round((noon(k) - noon(prevDay)) / DAY) === 1 ? run + 1 : 1;
      bestRun = Math.max(bestRun, run);
      prevDay = k;
    }
    const hit = (id, ok) => {
      if (ok && at[id] === undefined) at[id] = x.at;
    };
    const n = i + 1;
    hit('first', n >= 1);
    hit('sub2', best !== null && best < 120000);
    hit('n100', n >= 100);
    hit('sub130', best !== null && best < 90000);
    hit('ao5sub130', r5[i] !== null && r5[i] < 90000);
    hit('sub1', best !== null && best < 60000);
    hit('streak7', bestRun >= 7);
    hit('ao12sub1', r12[i] !== null && r12[i] < 60000);
    hit('n1000', n >= 1000);
  });
  const n = solves.length;
  const progress = {
    first: null,
    sub2: best === null ? null : `melhor ${formatMs(best)}`,
    n100: `${Math.min(n, 100)}/100`,
    sub130: best === null ? null : `melhor ${formatMs(best)}`,
    ao5sub130: `melhor ${formatMs(bestAverage(solves, 5))}`,
    sub1: best === null ? null : `melhor ${formatMs(best)}`,
    streak7: `${currentStreak(solves, nowTs)}/7`,
    ao12sub1: `melhor ${formatMs(bestAverage(solves, 12))}`,
    n1000: `${Math.min(n, 1000)}/1000`,
  };
  return MILESTONES.map((id) => ({ id, achieved: at[id] !== undefined, at: at[id] ?? null, progress: at[id] !== undefined ? null : progress[id] }));
}

export function achievedIds(solves, nowTs) {
  return milestoneProgress(solves, nowTs).filter((m) => m.achieved).map((m) => m.id);
}

// true onde o solve bateu o recorde que existia até ali (o primeiro solve não conta).
export function pbFlags(solves) {
  let best = null;
  return solves.map((x) => {
    const e = effectiveMs(x);
    const flag = best !== null && e !== Infinity && e < best;
    if (e !== Infinity && (best === null || e < best)) best = e;
    return flag;
  });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd prototype && node --test tests/stats.test.js`
Expected: PASS, 14 testes.

- [ ] **Step 6: Commit**

```bash
git add prototype/package.json prototype/scripts/strings.js prototype/scripts/stats.js prototype/tests/stats.test.js
git commit -m "feat(prototipo): textos e estatísticas com médias no padrão csTimer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Embaralhamentos e base de exemplo

**Files:**
- Create: `prototype/scripts/scrambles.js` (40 embaralhamentos random-state gerados com cubing.js 0.63.4; copie a lista exatamente)
- Create: `prototype/scripts/data.js`
- Test: `prototype/tests/data.test.js`

**Interfaces:**
- **Consumes:** `bestSingle`, `bestAverage`, `currentStreak`, `achievedIds` e `solvesOnDay` de `stats.js` (só nos testes).
- **Produces:**
  - `SCRAMBLES: string[]` (40 itens).
  - `mulberry32(seed) → () => number`.
  - `scrambleAt(i) → string` (percorre a lista em ciclo e aceita índice negativo).
  - `SEED_SESSION = { id: 's12', name: 'Sessão 12' }`.
  - `buildSeed(nowTs) → { sessions, solves }`, com 212 solves. A base tem:
    - recorde de 0:54.10;
    - média de 12 nunca abaixo de 1:00;
    - 4 dias seguidos até hoje;
    - 12 solves hoje;
    - 6 marcos conquistados;
    - um +2 e um DNF.

- [ ] **Step 1: Escrever o teste que falha**

`prototype/tests/data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed, mulberry32, scrambleAt } from '../scripts/data.js';
import { SCRAMBLES } from '../scripts/scrambles.js';
import { bestSingle, bestAverage, currentStreak, achievedIds, solvesOnDay } from '../scripts/stats.js';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();

test('mulberry32 é determinístico', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('scrambleAt percorre a lista em ciclo', () => {
  assert.equal(SCRAMBLES.length, 40);
  assert.equal(scrambleAt(0), SCRAMBLES[0]);
  assert.equal(scrambleAt(40), SCRAMBLES[0]);
  assert.equal(scrambleAt(-1), SCRAMBLES[39]);
});

test('a base fictícia bate com o que a spec promete', () => {
  const { sessions, solves } = buildSeed(NOW);
  assert.equal(sessions[0].name, 'Sessão 12');
  assert.equal(solves.length, 212);
  assert.ok(solves.every((x, i) => i === 0 || x.at > solves[i - 1].at), 'ordem cronológica');
  assert.ok(solves.every((x) => x.at <= NOW), 'nada no futuro');
  assert.equal(bestSingle(solves), 54100);
  assert.ok(bestAverage(solves, 12) >= 60000, 'média de 12 ainda não é sub-1:00');
  assert.equal(currentStreak(solves, NOW), 4);
  assert.equal(solvesOnDay(solves, NOW).length, 12);
  assert.deepEqual(achievedIds(solves, NOW), ['first', 'sub2', 'n100', 'sub130', 'ao5sub130', 'sub1']);
  assert.ok(solves.some((x) => x.penalty === '+2'));
  assert.ok(solves.some((x) => x.penalty === 'DNF'));
});

test('a base fictícia é igual para o mesmo "agora"', () => {
  assert.deepEqual(buildSeed(NOW), buildSeed(NOW));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd prototype && node --test tests/data.test.js`
Expected: FAIL com `Cannot find module '…/scripts/data.js'`.

- [ ] **Step 3: Implementar embaralhamentos e base de exemplo**

`prototype/scripts/scrambles.js`:

```js
// 40 embaralhamentos 3×3 random-state gerados com cubing.js 0.63.4 (randomScrambleForEvent('333')).
// O gerador de verdade entra no sub-projeto 2; aqui a lista é fixa e roda em ciclo.
export const SCRAMBLES = Object.freeze([
  "D' F2 R L' B' L' F' B D F2 D2 L2 B R2 B' U2 B2 R2 B' R2 U2",
  "U' B' R' D2 F R' L' B R U L2 F2 U R2 U2 R2 L2 D L2 U' L2",
  "U' L D' R L2 F U2 R' B' U2 R2 F2 D2 L' F2 R' F2 D2 L' F2 R2",
  "R2 F2 D' B2 D2 R2 B2 L2 B2 D' B2 U L' B U' L R U' F D' B'",
  "B2 U F2 U2 L' F2 L' F' D2 B2 U' L2 D' F2 D R2 L2 F2 U2 R2",
  "B2 L2 F2 D' L2 R2 D F2 D U2 R2 F2 R' B' L2 R B' D' F' L' D'",
  "R' B2 F2 D' B2 U' R2 D' B2 D L2 F2 U' F' U F' R D2 B' F2 D2",
  "R' L' B D2 F' U' L2 D' R B2 U2 F2 R' F2 L' F2 R F2 U2 R",
  "F L F' L' D' R F' R' F L U2 B2 U2 R2 D2 L' U2 D2 L' B2 R",
  "R2 L B D F U2 L F U D2 B2 U2 B2 L' U2 D2 F2 L' U2 R' F2",
  "B L' D' R2 F' R2 L2 F' L D2 F2 U' D B2 L2 U2 D' B2 U' F2",
  "F2 L' D F L2 B2 R U' R' U2 R2 L2 D' R2 B2 D F2 R2 U B2 R2",
  "B' D' B2 L2 D2 R2 D' L2 D' F2 D' L2 B2 F' R2 U2 B2 U R' U' B'",
  "F' U B U2 D R' U2 L' U R2 B2 D R2 D' F2 U' D2 R2 B2 D2 B'",
  "D' R' B' R' L U' B' U' F2 B2 U' F2 U' L2 B2 R2 L2 D' R' U' B'",
  "L2 U2 F2 D R' B' R L2 F R2 F2 L2 U D L2 U' B2 U L2 F2 U'",
  "L2 U2 F U2 B L2 B U2 B' D2 F2 U2 R' F2 D F' L2 U R2 D2",
  "L2 D2 R2 F' D L' U' F U' B2 L2 D2 F2 D B2 L2 U2 R2 D L2 R",
  "D R U L' U' D B2 D B R U2 B2 L2 U F2 L2 B2 U R2 D F2",
  "B' U2 L2 F U2 R2 B L2 B2 D2 U2 B' U' F2 L U' L2 B2 L2 R' F2",
  "D' L' D2 L D2 B R F2 R U' F2 U D2 F2 L2 B2 L2 D' R2 D L2",
  "R2 F B R D' R B R2 L2 D' R2 U F2 D2 F2 U D2 L2 F' R' D'",
  "U' F' L D' R D2 R2 B R2 U2 R D2 B2 L2 U2 L' F2 D2 F2 D L",
  "R L' F' R' L F L2 B' D' R' B2 L B2 D2 L' B2 U2 F2 D2",
  "U2 F' U R B2 R' U2 D' R' U R2 F2 U' L2 D L2 B2 U' F2 B2 D",
  "R2 D F2 D' B2 U B2 F2 L2 U' L2 U' R' U' F' L U2 L2 U2 F2 U",
  "F2 L' B' D' F' U2 F' L B' R2 F U2 B2 U2 B' R2 L2 U2 R2 D B2",
  "U2 F2 U2 R2 F2 L2 U L2 R2 U F2 U B D2 U R D U L2 R'",
  "R F L U B U2 F2 L B U B2 R2 U B2 U2 R2 D F2 D R2 D'",
  "D2 R2 B2 D2 U2 L R2 U2 R' U2 F2 D L D' F' U' F D' B' D2",
  "L F2 L2 U B' U' B2 U F2 R' U' F2 R2 D R2 D2 F2 R2 U2 B2 D'",
  "F D' F R F' D L2 F2 B U R2 B2 D R2 L2 U F2 U' D2 R2 L2",
  "B' D2 R2 U' R2 U R2 D L2 U2 F2 U2 R2 L' U R U' B' L D F'",
  "U' B L' F U2 R' D' R U F L2 F' D2 F B2 L2 B2 R2 F' R2 U'",
  "B D F2 R U2 R' D B' L D' L2 D' B2 U' R2 U F2 R2 D' B2 D'",
  "B2 L' U R2 U2 B D' R2 F B2 U' F2 U' R2 U' B2 D' F2 R2 U B2",
  "R D R' U L B D B' R F2 D L2 F2 R2 U2 F2 D F2 L2",
  "R U R' B' D2 B' D B' R F' R2 U2 B2 R2 D2 L2 F' D2 L2 B D2",
  "U2 L U2 R U' D L B R2 U' F2 D R2 D2 L2 D' B2 D B2 L2",
  "R' L' B' U D2 B D2 R' D F2 R2 F U2 B L2 B' U2 R2 U2 F' L2",
]);
```

`prototype/scripts/data.js`:

```js
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
  for (const [ago, count] of PLAN) {
    const day = new Date(nowTs);
    day.setDate(day.getDate() - ago);
    day.setHours(19, 0, 0, 0);
    for (let j = 0; j < count; j++) {
      const at = ago === 0 ? nowTs - (count - j) * 150000 : day.getTime() + j * 150000;
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd prototype && node --test tests/data.test.js`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add prototype/scripts/scrambles.js prototype/scripts/data.js prototype/tests/data.test.js
git commit -m "feat(prototipo): embaralhamentos e base de exemplo determinística" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Máquina de estados do timer

**Files:**
- Create: `prototype/scripts/timer.js`
- Test: `prototype/tests/timer.test.js`

**Interfaces:**
- **Consumes:** nada.
- **Produces:**
  - `STATES`: `{ IDLE: 'idle', INSPECT: 'inspect', ARMING: 'arming', READY: 'ready', RUNNING: 'running', DONE: 'done' }`.
  - `createTimer({ now, holdMs = 300, inspection = true })` devolve um objeto com:
    - **Ações:** `press()`, `release()`, `tick()`.
    - **Getters:** `state`, `armProgress` (0–1), `inspectElapsed` (ms), `elapsed` (ms) e `result` (`{ ms, penalty }`).
    - **Configuração:** `setOptions({ holdMs?, inspection? })` e `reset()`.
    - **Eventos:** `on(event, fn) → unsubscribe`:
      - `'state'` recebe `(next, prev)`;
      - `'warn'` recebe `8000` ou `12000`;
      - `'done'` recebe `{ ms, penalty }`.
- **Regras:**
  - O tempo só avança em `tick()`, porque o relógio é injetado. Isso deixa os testes determinísticos.
  - Com inspeção ligada, apertar e soltar inicia a inspeção.
  - Soltar antes do verde volta ao estado anterior.

- [ ] **Step 1: Escrever o teste que falha**

`prototype/tests/timer.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, STATES } from '../scripts/timer.js';

function rig(opts = {}) {
  let t = 0;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection: false, ...opts });
  const log = { states: [], warns: [], done: [] };
  timer.on('state', (s) => log.states.push(s));
  timer.on('warn', (w) => log.warns.push(w));
  timer.on('done', (r) => log.done.push(r));
  const at = (ms) => {
    t = ms;
    timer.tick();
  };
  return { timer, log, at };
}

test('sem inspeção: segurar 0,3 s arma, soltar larga, apertar para', () => {
  const { timer, log, at } = rig();
  timer.press();
  assert.equal(timer.state, STATES.ARMING);
  at(299);
  assert.equal(timer.state, STATES.ARMING);
  assert.ok(timer.armProgress > 0.99 && timer.armProgress < 1);
  at(300);
  assert.equal(timer.state, STATES.READY);
  timer.release();
  assert.equal(timer.state, STATES.RUNNING);
  at(300 + 58420);
  timer.press();
  assert.equal(timer.state, STATES.DONE);
  assert.deepEqual(log.done, [{ ms: 58420, penalty: null }]);
  assert.equal(timer.elapsed, 58420);
});

test('soltar antes do verde volta ao parado sem resultado', () => {
  const { timer, log, at } = rig();
  timer.press();
  at(150);
  timer.release();
  assert.equal(timer.state, STATES.IDLE);
  assert.equal(log.done.length, 0);
});

test('tempo para armar 0 fica pronto na hora', () => {
  const { timer } = rig({ holdMs: 0 });
  timer.press();
  assert.equal(timer.state, STATES.READY);
});

test('soltar a tecla depois de parar não faz nada', () => {
  const { timer, at } = rig({ holdMs: 0 });
  timer.press();
  timer.release();
  at(1000);
  timer.press();
  timer.release();
  assert.equal(timer.state, STATES.DONE);
});

test('com inspeção: apertar e soltar inicia; segurar arma; soltar larga sem penalidade', () => {
  const { timer, log, at } = rig({ inspection: true });
  timer.press();
  assert.equal(timer.state, STATES.IDLE);
  timer.release();
  assert.equal(timer.state, STATES.INSPECT);
  at(5000);
  assert.equal(timer.inspectElapsed, 5000);
  timer.press();
  at(5300);
  assert.equal(timer.state, STATES.READY);
  timer.release();
  assert.equal(timer.state, STATES.RUNNING);
  at(65300);
  timer.press();
  assert.deepEqual(log.done, [{ ms: 60000, penalty: null }]);
});

test('soltar antes do verde durante a inspeção volta para a inspeção, que continua contando', () => {
  const { timer, at } = rig({ inspection: true });
  timer.press();
  timer.release();
  at(4000);
  timer.press();
  at(4100);
  timer.release();
  assert.equal(timer.state, STATES.INSPECT);
  at(6000);
  assert.equal(timer.inspectElapsed, 6000);
});

test('avisos de 8 s e 12 s saem uma vez só', () => {
  const { timer, log, at } = rig({ inspection: true });
  timer.press();
  timer.release();
  at(7999);
  at(8000);
  at(9000);
  at(12500);
  at(13000);
  assert.deepEqual(log.warns, [8000, 12000]);
});

test('largar depois de 15 s dá +2; depois de 17 s, DNF', () => {
  for (const [startAt, expected] of [[15500, '+2'], [17500, 'DNF']]) {
    const { timer, log, at } = rig({ inspection: true });
    timer.press();
    timer.release();
    at(startAt - 300);
    timer.press();
    at(startAt);
    timer.release();
    at(startAt + 40000);
    timer.press();
    assert.equal(log.done[0].penalty, expected);
  }
});

test('depois de um resultado, o próximo ciclo começa de novo', () => {
  const { timer, at } = rig({ inspection: true });
  timer.press();
  timer.release();
  at(1000);
  timer.press();
  at(1300);
  timer.release();
  at(2000);
  timer.press();
  assert.equal(timer.state, STATES.DONE);
  timer.release();
  timer.press();
  timer.release();
  assert.equal(timer.state, STATES.INSPECT);
  assert.equal(timer.inspectElapsed, 0);
});

test('setOptions vale no próximo ciclo e reset volta ao parado', () => {
  const { timer, at } = rig();
  timer.setOptions({ inspection: true });
  timer.press();
  timer.release();
  assert.equal(timer.state, STATES.INSPECT);
  timer.reset();
  assert.equal(timer.state, STATES.IDLE);
  at(100);
  assert.equal(timer.inspectElapsed, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd prototype && node --test tests/timer.test.js`
Expected: FAIL com `Cannot find module '…/scripts/timer.js'`.

- [ ] **Step 3: Implementar**

`prototype/scripts/timer.js`:

```js
// Máquina de estados do timer. Pura: o relógio é injetado e o tempo avança só em tick().
// parado → (inspeção) → armando → pronto → resolvendo → resultado
export const STATES = Object.freeze({
  IDLE: 'idle',
  INSPECT: 'inspect',
  ARMING: 'arming',
  READY: 'ready',
  RUNNING: 'running',
  DONE: 'done',
});

const PLUS2_AFTER = 15000;
const DNF_AFTER = 17000;
const WARNINGS = [8000, 12000];

export function createTimer({ now = () => performance.now(), holdMs = 300, inspection = true } = {}) {
  let state = STATES.IDLE;
  let base = STATES.IDLE; // para onde volta se soltar antes do verde
  let holdStart = 0;
  let inspStart = 0;
  let startAt = 0;
  let pendingInspect = false;
  let penalty = null;
  let result = null;
  let warned = new Set();
  const listeners = { state: new Set(), warn: new Set(), done: new Set() };

  const emit = (ev, ...args) => listeners[ev].forEach((fn) => fn(...args));
  const set = (next) => {
    if (next === state) return;
    const prev = state;
    state = next;
    emit('state', next, prev);
  };
  const inInspection = () => state === STATES.INSPECT || ((state === STATES.ARMING || state === STATES.READY) && base === STATES.INSPECT);

  function press() {
    if (state === STATES.RUNNING) {
      result = { ms: Math.round(now() - startAt), penalty };
      set(STATES.DONE);
      emit('done', result);
      return;
    }
    if (state === STATES.IDLE || state === STATES.DONE) {
      if (inspection) {
        pendingInspect = true;
        return;
      }
      base = STATES.IDLE;
      holdStart = now();
      set(STATES.ARMING);
      tick();
      return;
    }
    if (state === STATES.INSPECT) {
      base = STATES.INSPECT;
      holdStart = now();
      set(STATES.ARMING);
      tick();
    }
  }

  function release() {
    if (pendingInspect) {
      pendingInspect = false;
      inspStart = now();
      warned = new Set();
      base = STATES.INSPECT;
      set(STATES.INSPECT);
      return;
    }
    if (state === STATES.ARMING) {
      set(base);
      return;
    }
    if (state === STATES.READY) {
      const ie = base === STATES.INSPECT ? now() - inspStart : 0;
      penalty = ie > DNF_AFTER ? 'DNF' : ie > PLUS2_AFTER ? '+2' : null;
      startAt = now();
      base = STATES.IDLE;
      set(STATES.RUNNING);
    }
  }

  function tick() {
    if (state === STATES.ARMING && now() - holdStart >= holdMs) set(STATES.READY);
    if (inInspection()) {
      const e = now() - inspStart;
      for (const w of WARNINGS) {
        if (e >= w && !warned.has(w)) {
          warned.add(w);
          emit('warn', w);
        }
      }
    }
  }

  return {
    press,
    release,
    tick,
    get state() {
      return state;
    },
    get armProgress() {
      if (state === STATES.READY) return 1;
      if (state !== STATES.ARMING) return 0;
      return holdMs <= 0 ? 1 : Math.min(1, (now() - holdStart) / holdMs);
    },
    get inspectElapsed() {
      return inInspection() ? now() - inspStart : 0;
    },
    get elapsed() {
      if (state === STATES.RUNNING) return now() - startAt;
      return state === STATES.DONE && result ? result.ms : 0;
    },
    get result() {
      return result;
    },
    setOptions(opts) {
      if (opts.holdMs !== undefined) holdMs = opts.holdMs;
      if (opts.inspection !== undefined) inspection = opts.inspection;
    },
    reset() {
      pendingInspect = false;
      base = STATES.IDLE;
      set(STATES.IDLE);
    },
    on(ev, fn) {
      listeners[ev].add(fn);
      return () => listeners[ev].delete(fn);
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd prototype && node --test tests/timer.test.js`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add prototype/scripts/timer.js prototype/tests/timer.test.js
git commit -m "feat(prototipo): máquina de estados do timer com inspeção WCA" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Toque com dois polegares

**Files:**
- Create: `prototype/scripts/touch.js`
- Test: `prototype/tests/touch.test.js`

**Interfaces:**
- **Consumes:** `createTimer` e `STATES` de `timer.js` (só nos testes).
- **Produces:**
  - `createTouchArm({ press, release, getState, getInspection, mode = 'two' })` devolve `{ setMode(mode), down(pointerId, zone), up(pointerId), cancelAll() }`.
  - `zone` é `'left'` ou `'right'`; `mode` é `'two'` ou `'one'`.
- **Regras:**
  - No modo dois polegares, arma só com as duas zonas pressionadas.
  - O primeiro polegar que sai larga o timer.
  - Com inspeção ligada, um toque inicia a inspeção.
  - Com o timer rodando, qualquer toque para.

- [ ] **Step 1: Escrever o teste que falha**

`prototype/tests/touch.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, STATES } from '../scripts/timer.js';
import { createTouchArm } from '../scripts/touch.js';

function rig({ inspection = false, mode = 'two' } = {}) {
  let t = 0;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection });
  const touch = createTouchArm({
    press: timer.press,
    release: timer.release,
    getState: () => timer.state,
    getInspection: () => inspection,
    mode,
  });
  const at = (ms) => {
    t = ms;
    timer.tick();
  };
  return { timer, touch, at };
}

test('dois polegares: um só não arma; os dois armam; o primeiro que sai larga', () => {
  const { timer, touch, at } = rig();
  touch.down(1, 'left');
  at(400);
  assert.equal(timer.state, STATES.IDLE);
  touch.down(2, 'right');
  at(800);
  assert.equal(timer.state, STATES.READY);
  touch.up(1);
  assert.equal(timer.state, STATES.RUNNING);
  touch.up(2);
  assert.equal(timer.state, STATES.RUNNING);
  at(5000);
  touch.down(3, 'left');
  assert.equal(timer.state, STATES.DONE);
});

test('dois dedos na mesma zona não armam', () => {
  const { timer, touch, at } = rig();
  touch.down(1, 'left');
  touch.down(2, 'left');
  at(500);
  assert.equal(timer.state, STATES.IDLE);
});

test('com inspeção: um toque inicia a inspeção e depois os dois polegares armam', () => {
  const { timer, touch, at } = rig({ inspection: true });
  touch.down(1, 'left');
  touch.up(1);
  assert.equal(timer.state, STATES.INSPECT);
  at(3000);
  touch.down(2, 'left');
  assert.equal(timer.state, STATES.INSPECT);
  touch.down(3, 'right');
  at(3300);
  assert.equal(timer.state, STATES.READY);
  touch.up(3);
  assert.equal(timer.state, STATES.RUNNING);
});

test('soltar antes do verde volta para a inspeção', () => {
  const { timer, touch, at } = rig({ inspection: true });
  touch.down(1, 'right');
  touch.up(1);
  at(2000);
  touch.down(2, 'left');
  touch.down(3, 'right');
  at(2100);
  touch.up(2);
  assert.equal(timer.state, STATES.INSPECT);
});

test('modo um toque: qualquer dedo arma', () => {
  const { timer, touch, at } = rig({ mode: 'one' });
  touch.down(1, 'left');
  at(300);
  assert.equal(timer.state, STATES.READY);
  touch.up(1);
  assert.equal(timer.state, STATES.RUNNING);
});

test('cancelAll solta o que estiver pressionado', () => {
  const { timer, touch, at } = rig();
  touch.down(1, 'left');
  touch.down(2, 'right');
  at(100);
  touch.cancelAll();
  assert.equal(timer.state, STATES.IDLE);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd prototype && node --test tests/touch.test.js`
Expected: FAIL com `Cannot find module '…/scripts/touch.js'`.

- [ ] **Step 3: Implementar**

`prototype/scripts/touch.js`:

```js
// Traduz toques nas zonas da tela em press()/release() do timer.
// Modo 'two': arma só com as duas zonas (esquerda e direita) pressionadas; o primeiro polegar que sai larga.
// Modo 'one': a área inteira é uma zona só.
export function createTouchArm({ press, release, getState, getInspection, mode = 'two' }) {
  const active = new Map(); // pointerId → 'left' | 'right'
  let pressed = false;

  const bothZones = () => {
    const zones = new Set(active.values());
    return zones.has('left') && zones.has('right');
  };
  const shouldArm = () => (mode === 'one' ? active.size > 0 : bothZones());
  const isRest = (st) => st === 'idle' || st === 'done';

  return {
    setMode(m) {
      mode = m;
    },
    down(pointerId, zone) {
      const st = getState();
      if (st === 'running') {
        press();
        return;
      }
      active.set(pointerId, zone);
      const tapToInspect = isRest(st) && getInspection();
      if (!pressed && (tapToInspect || shouldArm())) {
        pressed = true;
        press();
      }
    },
    up(pointerId) {
      if (!active.has(pointerId)) return;
      active.delete(pointerId);
      if (!pressed) return;
      if (isRest(getState())) {
        // toque que inicia a inspeção: solta quando todos os dedos saem
        if (active.size === 0) {
          pressed = false;
          release();
        }
        return;
      }
      pressed = false;
      release();
    },
    cancelAll() {
      active.clear();
      if (pressed) {
        pressed = false;
        release();
      }
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd prototype && node --test tests/touch.test.js`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add prototype/scripts/touch.js prototype/tests/touch.test.js
git commit -m "feat(prototipo): armar com dois polegares no celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Coach

**Files:**
- Create: `prototype/scripts/coach.js`
- Test: `prototype/tests/coach.test.js`

**Interfaces:**
- **Consumes:** de `stats.js`, `effectiveMs`, `bestSingle`, `bestAverage`, `averageOf`, `dayKey` e `formatMs`; de `strings.js`, `T` e `MILESTONE_INFO`.
- **Produces:**
  - Assinatura: `pickCoachMessage({ solve, history, sessionSolves, newMilestones = [], achievedCount = 0, dailyGoal = 20, silent = false }) → { id, text } | null`.
  - Ids possíveis: `pb-single`, `pb-average`, `milestone`, `daily-goal`, `stable`, `fatigue`, `first-dnf` e `back`.
  - Os ids seguem a ordem de prioridade da spec 6.5.

- [ ] **Step 1: Escrever o teste que falha**

`prototype/tests/coach.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickCoachMessage } from '../scripts/coach.js';

const DAY = 86400000;
const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
let id = 0;
const sv = (ms, penalty = null, at = NOW) => ({ id: ++id, ms, penalty, at, scramble: '', note: '', session: 's1' });
const many = (list, at = NOW) => list.map((ms, i) => sv(ms, null, at - (list.length - i) * 60000));
const pick = (over) => pickCoachMessage({ history: [], sessionSolves: [], ...over });

test('recorde de single tem prioridade máxima', () => {
  const msg = pick({ solve: sv(55000), history: many([59000, 61000]), newMilestones: ['sub1'], achievedCount: 6 });
  assert.equal(msg.id, 'pb-single');
  assert.equal(msg.text, 'Novo recorde — 4.00 s mais rápido. Vale lembrar o que funcionou.');
});

test('recorde de média sem recorde de single', () => {
  const msg = pick({ solve: sv(64000), history: many([90000, 90000, 90000, 66000, 65000, 60000]) });
  assert.equal(msg.id, 'pb-average');
  assert.equal(msg.text, 'Sua média de 5 caiu para 1:05.00. Isso é consistência, não sorte.');
});

test('marco conquistado', () => {
  const msg = pick({ solve: sv(59000), newMilestones: ['sub1'], achievedCount: 6 });
  assert.equal(msg.text, 'Primeiro solve abaixo de 1 minuto. Marco 6 de 9.');
});

test('meta do dia exatamente na meta', () => {
  const msg = pick({ solve: sv(65000), history: many([60000, 61000]), dailyGoal: 3 });
  assert.equal(msg.id, 'daily-goal');
  assert.equal(msg.text, 'Meta de 3 solves feita. O resto é bônus.');
});

test('sequência estável: 5 solves dentro de 3 s', () => {
  const msg = pick({ solve: sv(72500), history: many([70000, 71000, 72000, 70500]) });
  assert.equal(msg.id, 'stable');
});

test('cansaço depois de 30 solves na sessão', () => {
  const session = many([...Array(12).fill(60000), ...Array(13).fill(66000), 66000, 72000, 70000, 74000]);
  const msg = pick({ solve: sv(69000), history: session, sessionSolves: session });
  assert.equal(msg.id, 'fatigue');
});

test('primeiro DNF da sessão', () => {
  const prev = many([60000, 61000, 62000, 63000]);
  assert.equal(pick({ solve: sv(50000, 'DNF'), history: prev, sessionSolves: prev }).id, 'first-dnf');
  const withDnf = [...prev, sv(1000, 'DNF', NOW - 1000)];
  assert.notEqual(pick({ solve: sv(50000, 'DNF'), history: withDnf, sessionSolves: withDnf })?.id, 'first-dnf');
});

test('volta depois de 3 dias ou mais', () => {
  const msg = pick({ solve: sv(70000), history: [sv(60000, null, NOW - 4 * DAY)] });
  assert.equal(msg.id, 'back');
});

test('modo silencioso e solve comum não falam', () => {
  assert.equal(pick({ solve: sv(55000), history: many([59000]), silent: true }), null);
  assert.equal(pick({ solve: sv(69000), history: many([60000, 70000]) }), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd prototype && node --test tests/coach.test.js`
Expected: FAIL com `Cannot find module '…/scripts/coach.js'`.

- [ ] **Step 3: Implementar**

`prototype/scripts/coach.js`:

```js
// Escolhe no máximo uma mensagem do coach por solve, pela prioridade da spec (6.5).
import { effectiveMs, bestSingle, bestAverage, averageOf, dayKey, formatMs } from './stats.js';
import { T, MILESTONE_INFO } from './strings.js';

const DAY = 86400000;

// history: todos os solves anteriores (cronológico). sessionSolves: os anteriores da sessão atual.
// newMilestones: ids conquistados por este solve. achievedCount: total de marcos depois dele.
export function pickCoachMessage({ solve, history, sessionSolves, newMilestones = [], achievedCount = 0, dailyGoal = 20, silent = false }) {
  if (silent || !solve) return null;
  const e = effectiveMs(solve);
  const all = [...history, solve];

  const prevBest = bestSingle(history);
  if (prevBest !== null && e !== Infinity && e < prevBest) return { id: 'pb-single', text: T.coach.pbSingle(prevBest - e) };

  for (const [n, label] of [[5, 'média de 5'], [12, 'média de 12']]) {
    const prevBestAvg = bestAverage(history, n);
    const current = averageOf(all, n);
    if (prevBestAvg !== null && current !== null && current !== Infinity && current < prevBestAvg) {
      return { id: 'pb-average', text: T.coach.pbAverage(label, formatMs(current)) };
    }
  }

  if (newMilestones.length) {
    const id = newMilestones[newMilestones.length - 1];
    return { id: 'milestone', text: T.coach.milestone(MILESTONE_INFO[id].msg, achievedCount) };
  }

  const today = all.filter((x) => dayKey(x.at) === dayKey(solve.at)).length;
  if (today === dailyGoal) return { id: 'daily-goal', text: T.coach.dailyGoal(dailyGoal) };

  const last5 = all.slice(-5).map(effectiveMs);
  if (last5.length === 5 && last5.every((v) => v !== Infinity) && Math.max(...last5) - Math.min(...last5) <= 3000) {
    return { id: 'stable', text: T.coach.stable };
  }

  const session = [...sessionSolves, solve];
  if (session.length >= 30) {
    const first12 = averageOf(session.slice(0, 12), 12);
    const current5 = averageOf(session, 5);
    if (first12 !== null && first12 !== Infinity && current5 !== null && current5 !== Infinity && current5 > first12 * 1.08) {
      return { id: 'fatigue', text: T.coach.fatigue };
    }
  }

  if (solve.penalty === 'DNF' && !sessionSolves.some((x) => x.penalty === 'DNF')) return { id: 'first-dnf', text: T.coach.firstDnf };

  const prev = history[history.length - 1];
  if (prev && solve.at - prev.at >= 3 * DAY) return { id: 'back', text: T.coach.back };

  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd prototype && node --test tests/coach.test.js`
Expected: PASS, 9 testes. O teste "marco conquistado", com histórico vazio, cobre o item 4 do Review Focus no nível da lógica.

- [ ] **Step 5: Commit**

```bash
git add prototype/scripts/coach.js prototype/tests/coach.test.js
git commit -m "feat(prototipo): coach com gatilhos por prioridade" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Centro: anel, olhos e SVG

**Files:**
- Create: `prototype/scripts/centro.js`
- Test: `prototype/tests/centro.test.js`

**Interfaces:**
- **Consumes:** nada.
- **Produces:**
  - `RING_ORDER = [0, 1, 2, 5, 8, 7, 6, 3]`
  - `PALETTES` (`light` / `dark`) e `FINISHES` (`fosco`, `brilho`, `gelo`, `carbono`)
  - `ringFor(view) → (string | null)[8]`
  - `eyesFor(view) → 'open' | 'half' | 'focus' | 'happy' | 'sleep'`
  - `paletteFor(theme, finish) → palette`
  - `renderCentro({ theme, ring, eyes, topLit, sideLit, finish, label }) → string` (o SVG)
  - `updateCentro(svgEl, { theme, finish, ring, eyes })` (mexe só em atributos)
- **`view.state`** pode ser:
  - `idle`, com `orbit?`
  - `sleep`
  - `inspect`, com `inspectElapsed`
  - `arming`, com `armProgress`
  - `ready`
  - `running`
  - `reaction`, com `result: 'pb' | 'good' | 'slow' | 'plus2' | 'dnf'`

- [ ] **Step 1: Escrever o teste que falha**

`prototype/tests/centro.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringFor, eyesFor, renderCentro, paletteFor, PALETTES, RING_ORDER } from '../scripts/centro.js';

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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd prototype && node --test tests/centro.test.js`
Expected: FAIL com `Cannot find module '…/scripts/centro.js'`.

- [ ] **Step 3: Implementar**

`prototype/scripts/centro.js`:

```js
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
  let s = `<svg class="centro" viewBox="-9 -9 148 148" role="img" aria-label="${label}" data-finish="${finish}" data-eyes="${eyes}">`;
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
    const color = key ? p[key] : p.off;
    s += rect(i, color, ` class="ring${key ? ' lit' : ''}" data-k="${k}"${key ? glowStyle(p, color) : ''}`) + gloss(i);
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
export function updateCentro(svg, { theme = 'light', finish = 'fosco', ring = empty(), eyes = 'open' }) {
  if (!svg) return;
  const p = paletteFor(theme, finish);
  svg.querySelectorAll('.ring').forEach((r) => {
    const key = ring[Number(r.dataset.k)];
    const color = key ? p[key] : p.off;
    r.setAttribute('fill', color);
    r.classList.toggle('lit', Boolean(key));
    r.style.filter = key && p.glow ? `drop-shadow(0 0 ${p.glow}px ${color})` : '';
  });
  svg.dataset.eyes = eyes;
  svg.querySelectorAll('.eyes').forEach((g) => g.setAttribute('opacity', g.dataset.e === eyes ? '1' : '0'));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd prototype && node --test tests/centro.test.js`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add prototype/scripts/centro.js prototype/tests/centro.test.js
git commit -m "feat(prototipo): Centro com anel, olhos, evolução e acabamentos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Estado, persistência e som

**Files:**
- Create: `prototype/scripts/store.js`
- Create: `prototype/scripts/sound.js`
- Test: `prototype/tests/store.test.js`
- Test: `prototype/tests/sound.test.js`

**Interfaces:**
- **Consumes:** `buildSeed` de `data.js`.
- **Produces:**
  - De `store.js`:
    - Constantes e estado inicial:
      - `STORAGE_KEY = 'klick.v2.prototype'`
      - `DEFAULT_SETTINGS`, com os campos `inspection`, `holdMs`, `mobileArm`, `theme`, `sound: { klick, insp, pb }`, `silent`, `reducedMotion` e `dailyGoal`
      - `emptyState()`
      - `seededState(nowTs)`
    - Armazenamento:
      - `safeStorage() → Storage | null`
      - `loadState(storage) → state | null`
      - `saveState(storage, state) → boolean`
    - Solves:
      - `addSolve(state, { ms, penalty, at, scramble }) → { state, solve }`
      - `togglePenalty(state, id, '+2' | 'DNF')`
      - `setNote(state, id, note)`
      - `deleteSolve(state, id) → { state, removed }`
      - `restoreSolve(state, removed)`
    - Sessões:
      - `sessionSolves(state, sessionId?)`
      - `createSession(state, name)`
      - `renameSession(state, id, name)`
    - Ajustes: `updateSettings(state, patch)`
  - De `sound.js`: `createSound(initial) → { klick(), tick(), chord(), unlock(), setEnabled(group, on) }`.
- **Formato do estado:** `{ version: 1, solves, sessions, currentSession, settings, trail: boolean[9], finish, onboarded, nextId }`.

- [ ] **Step 1: Escrever os testes que falham**

`prototype/tests/store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, DEFAULT_SETTINGS, emptyState, seededState, loadState, saveState, addSolve, togglePenalty, setNote,
  deleteSolve, restoreSolve, sessionSolves, createSession, renameSession, updateSettings,
} from '../scripts/store.js';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() {} };

test('salvar e carregar faz ida e volta', () => {
  const s = memory();
  const state = seededState(NOW);
  assert.equal(saveState(s, state), true);
  assert.deepEqual(loadState(s), state);
});

test('armazenamento vazio, inválido, quebrado ou ausente devolve null sem lançar', () => {
  const s = memory();
  assert.equal(loadState(s), null);
  s.setItem(STORAGE_KEY, '{nao é json');
  assert.equal(loadState(s), null);
  s.setItem(STORAGE_KEY, JSON.stringify({ version: 99, solves: [] }));
  assert.equal(loadState(s), null);
  assert.equal(loadState(broken), null);
  assert.equal(loadState(null), null);
  assert.equal(saveState(broken, emptyState()), false);
  assert.equal(saveState(null, emptyState()), false);
});

test('ajustes salvos antigos ganham os padrões que faltam', () => {
  const s = memory();
  s.setItem(STORAGE_KEY, JSON.stringify({ ...emptyState(), settings: { theme: 'dark', sound: { pb: false } } }));
  const st = loadState(s);
  assert.equal(st.settings.theme, 'dark');
  assert.equal(st.settings.holdMs, DEFAULT_SETTINGS.holdMs);
  assert.deepEqual(st.settings.sound, { klick: true, insp: true, pb: false });
});

test('addSolve numera, marca a sessão atual e não muda o estado anterior', () => {
  const st = emptyState();
  const { state, solve } = addSolve(st, { ms: 60000, at: NOW, scramble: 'R U' });
  assert.equal(solve.id, 1);
  assert.equal(solve.session, 's1');
  assert.equal(state.nextId, 2);
  assert.equal(st.solves.length, 0);
});

test('togglePenalty liga e desliga; setNote grava a nota', () => {
  let { state } = addSolve(emptyState(), { ms: 60000, at: NOW, scramble: '' });
  state = togglePenalty(state, 1, '+2');
  assert.equal(state.solves[0].penalty, '+2');
  state = togglePenalty(state, 1, 'DNF');
  assert.equal(state.solves[0].penalty, 'DNF');
  state = togglePenalty(state, 1, 'DNF');
  assert.equal(state.solves[0].penalty, null);
  assert.equal(setNote(state, 1, 'cruz ruim').solves[0].note, 'cruz ruim');
});

test('excluir e desfazer devolve o solve na mesma posição', () => {
  const st = seededState(NOW);
  const target = st.solves[10];
  const { state, removed } = deleteSolve(st, target.id);
  assert.equal(state.solves.length, st.solves.length - 1);
  assert.deepEqual(restoreSolve(state, removed), st);
  assert.equal(deleteSolve(st, -1).removed, null);
});

test('sessões: criar troca para a nova; renomear ignora nome vazio; solves por sessão', () => {
  let st = seededState(NOW);
  assert.equal(sessionSolves(st).length, 212);
  st = createSession(st, '  Treino de cruz ');
  assert.equal(st.sessions.length, 2);
  assert.equal(st.sessions[1].name, 'Treino de cruz');
  assert.equal(st.currentSession, st.sessions[1].id);
  assert.equal(sessionSolves(st).length, 0);
  assert.equal(renameSession(st, st.currentSession, '  ').sessions[1].name, 'Treino de cruz');
  assert.equal(renameSession(st, st.currentSession, 'Cruz').sessions[1].name, 'Cruz');
});

test('updateSettings mescla sem perder os outros ajustes', () => {
  const st = updateSettings(emptyState(), { holdMs: 550, sound: { insp: false } });
  assert.equal(st.settings.holdMs, 550);
  assert.equal(st.settings.inspection, true);
  assert.deepEqual(st.settings.sound, { klick: true, insp: false, pb: true });
});
```

`prototype/tests/sound.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSound } from '../scripts/sound.js';

test('sem AudioContext (Node), os sons viram silêncio sem lançar erro', () => {
  const s = createSound();
  assert.doesNotThrow(() => {
    s.unlock();
    s.klick();
    s.tick();
    s.chord();
    s.setEnabled('pb', false);
    s.chord();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd prototype && node --test tests/store.test.js tests/sound.test.js`
Expected: FAIL com `Cannot find module '…/scripts/store.js'` e `'…/scripts/sound.js'`.

- [ ] **Step 3: Implementar**

`prototype/scripts/store.js`:

```js
// Estado do app e persistência em localStorage (só conveniência: pode falhar e o app segue funcionando).
import { buildSeed } from './data.js';

export const STORAGE_KEY = 'klick.v2.prototype';

export const DEFAULT_SETTINGS = Object.freeze({
  inspection: true,
  holdMs: 300,
  mobileArm: 'two',
  theme: 'system',
  sound: Object.freeze({ klick: true, insp: true, pb: true }),
  silent: false,
  reducedMotion: 'system',
  dailyGoal: 20,
});

const cloneSettings = (over = {}) => ({ ...DEFAULT_SETTINGS, ...over, sound: { ...DEFAULT_SETTINGS.sound, ...(over.sound || {}) } });

export function emptyState() {
  return {
    version: 1,
    solves: [],
    sessions: [{ id: 's1', name: 'Sessão 1' }],
    currentSession: 's1',
    settings: cloneSettings(),
    trail: Array(9).fill(false),
    finish: 'fosco',
    onboarded: false,
    nextId: 1,
  };
}

export function seededState(nowTs) {
  const seed = buildSeed(nowTs);
  return {
    ...emptyState(),
    solves: seed.solves,
    sessions: seed.sessions,
    currentSession: seed.sessions[0].id,
    trail: [true, true, true, true, false, false, false, false, false],
    nextId: seed.solves.length + 1,
  };
}

export function safeStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('__klick_probe__', '1');
    s.removeItem('__klick_probe__');
    return s;
  } catch {
    return null;
  }
}

export function loadState(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.solves)) return null;
    return { ...emptyState(), ...data, settings: cloneSettings(data.settings) };
  } catch {
    return null;
  }
}

export function saveState(storage, state) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function addSolve(state, { ms, penalty = null, at, scramble }) {
  const solve = { id: state.nextId, ms, penalty, at, scramble, note: '', session: state.currentSession };
  return { state: { ...state, solves: [...state.solves, solve], nextId: state.nextId + 1 }, solve };
}

export function togglePenalty(state, id, penalty) {
  return { ...state, solves: state.solves.map((x) => (x.id === id ? { ...x, penalty: x.penalty === penalty ? null : penalty } : x)) };
}

export function setNote(state, id, note) {
  return { ...state, solves: state.solves.map((x) => (x.id === id ? { ...x, note } : x)) };
}

export function deleteSolve(state, id) {
  const index = state.solves.findIndex((x) => x.id === id);
  if (index < 0) return { state, removed: null };
  return { state: { ...state, solves: state.solves.filter((x) => x.id !== id) }, removed: { solve: state.solves[index], index } };
}

export function restoreSolve(state, removed) {
  if (!removed) return state;
  const solves = [...state.solves];
  solves.splice(removed.index, 0, removed.solve);
  return { ...state, solves };
}

export function sessionSolves(state, sessionId = state.currentSession) {
  return state.solves.filter((x) => x.session === sessionId);
}

export function createSession(state, name) {
  const n = state.sessions.length + 1;
  const id = `s${Date.now().toString(36)}${n}`;
  const session = { id, name: name && name.trim() ? name.trim() : `Sessão ${n}` };
  return { ...state, sessions: [...state.sessions, session], currentSession: id };
}

export function renameSession(state, id, name) {
  if (!name || !name.trim()) return state;
  return { ...state, sessions: state.sessions.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)) };
}

export function updateSettings(state, patch) {
  return { ...state, settings: cloneSettings({ ...state.settings, ...patch, sound: { ...state.settings.sound, ...(patch.sound || {}) } }) };
}
```

`prototype/scripts/sound.js`:

```js
// Sons sintetizados com Web Audio (sem arquivos). Sem AudioContext (ou se falhar), tudo vira silêncio.
export function createSound(initial = { klick: true, insp: true, pb: true }) {
  const enabled = { ...initial };
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  let ctx = null;

  function ensure() {
    if (!AC) return null;
    try {
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, dur, vol, delay = 0) {
    const c = ensure();
    if (!c) return;
    try {
      const t = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* som é opcional */
    }
  }

  // "klick": rajada curta de ruído filtrado, como um botão mecânico.
  function klick() {
    if (!enabled.klick) return;
    const c = ensure();
    if (!c) return;
    try {
      const len = Math.floor(c.sampleRate * 0.03);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
      const src = c.createBufferSource();
      const bp = c.createBiquadFilter();
      const g = c.createGain();
      src.buffer = buf;
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 3;
      g.gain.value = 0.6;
      src.connect(bp).connect(g).connect(c.destination);
      src.start();
    } catch {
      /* som é opcional */
    }
  }

  return {
    klick,
    tick: () => enabled.insp && tone(1320, 0.05, 0.15),
    chord: () => enabled.pb && [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.35, 0.12, i * 0.04)),
    unlock: () => {
      ensure();
    },
    setEnabled(group, on) {
      enabled[group] = on;
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd prototype && node --test tests/store.test.js tests/sound.test.js`
Expected: PASS, 9 testes. O teste de armazenamento quebrado cobre o item 3 do Review Focus no nível da lógica.

- [ ] **Step 5: Commit**

```bash
git add prototype/scripts/store.js prototype/scripts/sound.js prototype/tests/store.test.js prototype/tests/sound.test.js
git commit -m "feat(prototipo): estado, persistência tolerante a falhas e sons" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tokens e CSS (com teste de contraste AA)

**Files:**
- Create: `prototype/styles/tokens.css`
- Create: `prototype/styles/base.css`
- Create: `prototype/styles/components.css`
- Create: `prototype/styles/screens.css`
- Test: `prototype/tests/contrast.test.js`

**Interfaces:**
- **Consumes:** nada.
- **Produces** as classes e os atributos que as telas e o `app.js` usam:
  - **No `<body>`:**
    - `data-tstate` (estado do timer)
    - `data-cview` (estado visual do Centro)
    - `data-result` (`pb` etc.)
    - `data-insp` (`8`, `12` ou `over`)
    - a classe `solving`
  - **No `<html>`:** `data-theme`, `data-reduced-motion` e `data-arm`.
  - **Componentes:**
    - `.card`, `.chip` (e `.chip.pb`), `.btn`, `.tile`, `.heat`
    - `.seg`, `.switch`, `.sheet`, `.toast`, `.tabbar`
    - `.zones` e `.zone` (com `.down`)
    - `.centro` e `.fade`

- [ ] **Step 1: Escrever o teste que falha**

`prototype/tests/contrast.test.js`:

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd prototype && node --test tests/contrast.test.js`
Expected: FAIL com `ENOENT: no such file or directory, open '…/styles/tokens.css'`.

- [ ] **Step 3: Implementar os tokens**

`prototype/styles/tokens.css`:

```css
/* Tokens semânticos (spec 5.1). Tema "sistema" por padrão; data-theme="light" | "dark" força.
   Ajustes de contraste AA no claro (spec 10): muted, dec, insp-8, insp-12 e pb ficaram mais escuros. */
:root {
  color-scheme: light;
  --bg: #f3f0e9;
  --surface: #fbfaf7;
  --surface-2: #e8e3d9;
  --line: #e2dcd0;
  --ink: #17171a;
  --ink-2: #3a3832;
  --muted: #6f6a60;
  --dec: #8a857b;
  --arm: #d93d42;
  --go: #23915a;
  --insp-8: #b7770b;
  --insp-12: #c2561a;
  --pb: #a67908;
  --pb-bg: #f4e7c3;
  --pb-ink: #7a5a06;
  --heat-0: #e9e4da;
  --heat-1: #cfe7d7;
  --heat-2: #94cda9;
  --heat-3: #2f9e5f;
  --trail: #3e63dd;
  --inner: none;
  --font: 'Geist', 'Inter', system-ui, -apple-system, sans-serif;
  --mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --r-key: 6px;
  --r-btn: 10px;
  --r-tile: 14px;
  --r-card: 16px;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --t-micro: 120ms;
  --t-state: 200ms;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --bg: #121110;
    --surface: #1a1917;
    --surface-2: #23211e;
    --line: #2a2724;
    --ink: #f3f1ec;
    --ink-2: #d6d2c9;
    --muted: #8e8a82;
    --dec: #66625b;
    --arm: #ff5a5f;
    --go: #3dd68c;
    --insp-8: #ffb224;
    --insp-12: #ff8a3d;
    --pb: #f0b84c;
    --pb-bg: #3a2e14;
    --pb-ink: #f0c46a;
    --heat-0: #22201d;
    --heat-1: #1e4a33;
    --heat-2: #2b7a50;
    --heat-3: #3dd68c;
    --trail: #4c6fe8;
    --inner: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #121110;
  --surface: #1a1917;
  --surface-2: #23211e;
  --line: #2a2724;
  --ink: #f3f1ec;
  --ink-2: #d6d2c9;
  --muted: #8e8a82;
  --dec: #66625b;
  --arm: #ff5a5f;
  --go: #3dd68c;
  --insp-8: #ffb224;
  --insp-12: #ff8a3d;
  --pb: #f0b84c;
  --pb-bg: #3a2e14;
  --pb-ink: #f0c46a;
  --heat-0: #22201d;
  --heat-1: #1e4a33;
  --heat-2: #2b7a50;
  --heat-3: #3dd68c;
  --trail: #4c6fe8;
  --inner: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd prototype && node --test tests/contrast.test.js`
Expected: PASS, 2 testes (tema claro e tema noite).

- [ ] **Step 5: Escrever o resto do CSS**

`prototype/styles/base.css`:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

* {
  margin: 0;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  min-height: 100dvh;
  background: var(--bg);
  color: var(--ink);
  font: 500 15px/1.5 var(--font);
  touch-action: manipulation;
  -webkit-font-smoothing: antialiased;
}

button,
input,
select {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

kbd {
  font-family: var(--mono);
}

:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  border-radius: 6px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.skip {
  position: absolute;
  left: 16px;
  top: -48px;
  padding: 8px 12px;
  background: var(--ink);
  color: var(--bg);
  border-radius: var(--r-btn);
  z-index: 10;
}

.skip:focus {
  top: 8px;
}

.label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.muted {
  color: var(--muted);
}

.num {
  font-variant-numeric: tabular-nums;
}

[hidden] {
  display: none !important;
}

/* Reduzir movimento (sistema ou ajuste): nada se desloca; cores e expressões continuam. */
:root[data-reduced-motion='true'] *,
:root[data-reduced-motion='true'] *::before,
:root[data-reduced-motion='true'] *::after {
  animation: none !important;
  transition: none !important;
}
```

`prototype/styles/components.css`:

```css
/* Barra do topo */
.topbar {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 18px 28px;
}

.wordmark {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.035em;
}

.glyph {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  width: 18px;
  height: 18px;
}

.glyph i {
  background: var(--ink);
  border-radius: 2px;
}

.glyph i:nth-child(5) {
  background: var(--arm);
}

.tabs {
  display: flex;
  gap: 4px;
}

.tab {
  position: relative;
  border: 0;
  background: none;
  padding: 6px 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
}

.tab[aria-current='page'] {
  color: var(--ink);
}

.tab[aria-current='page']::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--ink);
  transform: translateX(-50%);
}

.topbar .meta {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--muted);
}

.pill {
  border: 1px solid var(--line);
  background: none;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
}

/* Cartões, chips, botões */
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: 16px 18px;
  box-shadow: var(--inner);
}

.card-h {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chip.pb {
  background: var(--pb-bg);
  color: var(--pb-ink);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 7px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-btn);
  background: var(--surface);
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
}

.btn.primary {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--bg);
}

.btn[aria-pressed='true'] {
  background: var(--surface-2);
  color: var(--ink);
}

.btn kbd,
.key {
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: var(--r-key);
  color: var(--muted);
  background: var(--surface);
}

/* Tiles de métrica */
.tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.tile {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-tile);
  padding: 12px 14px;
  box-shadow: var(--inner);
}

.tile small {
  display: block;
  font-size: 12px;
  color: var(--muted);
}

.tile b {
  display: block;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.025em;
  font-variant-numeric: tabular-nums;
}

.tile em {
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}

.tile b.pb {
  color: var(--pb);
}

/* Mapa de constância */
.heat {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: 4px;
  margin-top: 10px;
}

.heat i {
  aspect-ratio: 1;
  border-radius: 3px;
  background: var(--heat-0);
}

.heat i.l1 { background: var(--heat-1); }
.heat i.l2 { background: var(--heat-2); }
.heat i.l3 { background: var(--heat-3); }
.heat i.pb { background: var(--pb); }

.heat i.today {
  box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink);
}

.heat i.pop {
  animation: pop 450ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pop {
  from {
    transform: scale(1.8);
    opacity: 0;
  }
}

/* Seletor segmentado e toggle */
.seg {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--surface-2);
}

.seg button {
  border: 0;
  background: none;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--muted);
}

.seg button[aria-pressed='true'] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.switch {
  appearance: none;
  width: 40px;
  height: 24px;
  border-radius: 999px;
  background: var(--surface-2);
  position: relative;
  flex-shrink: 0;
  transition: background var(--t-state) var(--ease);
}

.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform var(--t-state) var(--ease);
}

.switch:checked {
  background: var(--ink);
}

.switch:checked::after {
  transform: translateX(16px);
}

/* Diálogos (sessões, atalhos, primeira vez) */
.sheet {
  margin: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: var(--surface);
  color: var(--ink);
  padding: 22px;
  width: min(480px, calc(100vw - 32px));
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
}

.sheet::backdrop {
  background: rgba(10, 10, 12, 0.45);
}

.sheet h2 {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
  margin-bottom: 12px;
}

.sheet table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.sheet td {
  padding: 7px 0;
  border-bottom: 1px solid var(--line);
}

.sheet td:first-child {
  width: 40%;
}

.sheet .row {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.sheet input[type='text'] {
  flex: 1;
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-btn);
  background: var(--bg);
}

.list-btn {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-btn);
  background: var(--bg);
  margin-top: 6px;
  text-align: left;
}

.list-btn[aria-current='true'] {
  border-color: var(--ink);
}

/* Aviso com desfazer */
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 16px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-size: 14px;
  z-index: 20;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}

.toast button {
  border: 0;
  border-radius: 999px;
  padding: 5px 12px;
  background: var(--bg);
  color: var(--ink);
  font-weight: 600;
  font-size: 13px;
}

/* Barra de abas do celular */
.tabbar {
  display: none;
}

/* Em telas de toque: alvos de pelo menos 44 px e sem dicas de tecla. */
@media (pointer: coarse) {
  .btn kbd {
    display: none;
  }

  .btn,
  .pill,
  .seg button,
  .link,
  .list-btn,
  .finish {
    min-height: 44px;
  }
}
```

`prototype/styles/screens.css`:

```css
.screen {
  max-width: 1200px;
  margin: 0 auto;
  padding: 8px 28px 32px;
}

/* ---------- Centro ---------- */
.centro {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.centro rect {
  transition: fill var(--t-state) var(--ease);
}

.centro .eyes {
  transition: opacity 150ms var(--ease);
}

.centro .eye {
  transform-box: fill-box;
  transform-origin: center;
  animation: blink 5.5s infinite;
}

@keyframes blink {
  0%, 94%, 100% { transform: scaleY(1); }
  96.5% { transform: scaleY(0.1); }
}

[data-cview='idle'] .t-centro .eyes[data-e='open'] {
  animation: look 8s ease-in-out infinite;
}

@keyframes look {
  0%, 42%, 100% { transform: translateX(0); }
  50%, 60% { transform: translateX(-1.6px); }
  70%, 80% { transform: translateX(1.6px); }
}

[data-cview='sleep'] .centro .ring.lit {
  animation: breathe 4s ease-in-out infinite;
}

@keyframes breathe {
  50% { opacity: 0.35; }
}

[data-cview='reaction'][data-result='pb'] .t-centro .centro {
  animation: lift 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 2;
}

@keyframes lift {
  45% { transform: translateY(-6%); }
}

/* Durante o solve nenhuma animação do Centro roda. */
body.solving .centro,
body.solving .centro * {
  animation: none !important;
}

/* ---------- Timer ---------- */
.timer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  grid-template-areas:
    'main side'
    'tiles side'
    'zones zones'
    'hints hints';
  column-gap: 32px;
  row-gap: 18px;
  align-items: start;
  user-select: none;
  -webkit-user-select: none;
}

.t-main { grid-area: main; min-width: 0; }
.t-side { grid-area: side; display: flex; flex-direction: column; gap: 12px; }
.t-tiles { grid-area: tiles; }
.t-hints { grid-area: hints; font-size: 12px; }
.zones { grid-area: zones; }

.scramble {
  margin-top: 4px;
  font: 400 16px/1.5 var(--mono);
  color: var(--ink-2);
  word-spacing: 2px;
}

.pb-tag {
  display: inline-block;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--pb-bg);
  color: var(--pb-ink);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.time {
  margin: 14px 0 14px -0.04em;
  font-weight: 600;
  font-size: clamp(96px, 15vw, 220px);
  line-height: 1;
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
  transition: color var(--t-state) var(--ease);
}

.time .dec {
  font-size: 0.6em;
  letter-spacing: -0.02em;
  color: var(--dec);
  transition: color var(--t-state) var(--ease);
}

[data-tstate='arming'] .time,
[data-tstate='arming'] .time .dec { color: var(--arm); }
[data-tstate='ready'] .time,
[data-tstate='ready'] .time .dec { color: var(--go); }
[data-insp='8'] .time { color: var(--insp-8); }
[data-insp='12'] .time { color: var(--insp-12); }
[data-insp='over'] .time { color: var(--arm); }
[data-result='pb'] .time,
[data-result='pb'] .time .dec { color: var(--pb); }

.t-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.t-note {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  max-width: 460px;
}

.t-note input {
  flex: 1;
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-btn);
  background: var(--surface);
}

.t-coach {
  display: grid;
  grid-template-columns: 112px 1fr;
  gap: 16px;
  align-items: center;
  transition: background var(--t-state), border-color var(--t-state);
}

.coach {
  margin-top: 4px;
  min-height: 3em;
  font-size: 14.5px;
  line-height: 1.45;
  transition: opacity var(--t-state) var(--ease);
}

.coach.quiet {
  opacity: 0;
}

/* Foco no solve: tudo some, menos o tempo e o Centro. */
.fade,
.topbar,
.tabbar {
  transition: opacity var(--t-state) var(--ease);
}

body.solving .fade,
body.solving .topbar,
body.solving .tabbar,
body.solving .zones {
  opacity: 0.08;
}

body.solving .t-coach {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

/* Zonas de toque (celular na mesa) */
.zones {
  display: none;
}

@media (pointer: coarse), (max-width: 639px) {
  .zones {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
}

:root[data-arm='one'] .zones {
  grid-template-columns: 1fr;
}

:root[data-arm='one'] .zone[data-zone='right'] {
  display: none;
}

.zone {
  min-height: 28vh;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--line);
  border-radius: 24px;
  color: var(--muted);
  font-size: 13px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.zone.down {
  border-style: solid;
  border-color: var(--arm);
  color: var(--arm);
  background: color-mix(in srgb, var(--arm) 8%, transparent);
}

[data-tstate='ready'] .zone.down {
  border-color: var(--go);
  color: var(--go);
  background: color-mix(in srgb, var(--go) 10%, transparent);
}

/* ---------- Evolução ---------- */
.page-h {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin: 4px 0 16px;
}

.page-h h1 {
  margin-right: auto;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.evo-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.chart {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 10px;
}

.chart .dot { fill: var(--muted); opacity: 0.45; }
.chart .avg { fill: none; stroke: var(--ink); stroke-width: 2.2; stroke-linejoin: round; }
.chart .pb { fill: var(--pb); }

.bars {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 150px;
  margin-top: 12px;
}

.bars i {
  flex: 1;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  background: var(--surface-2);
}

.bars i.hl {
  background: var(--ink);
}

.bars-x {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}

.hist {
  margin-top: 12px;
  overflow-x: auto;
}

.hist table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.hist th {
  padding: 6px 8px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}

.hist td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.hist td.scr {
  font: 400 13px var(--mono);
  color: var(--muted);
}

.tag {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
}

.tag.pb {
  background: var(--pb-bg);
  color: var(--pb-ink);
}

/* ---------- Companion ---------- */
.comp {
  display: grid;
  grid-template-columns: minmax(280px, 400px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.stage {
  padding: 28px 22px 22px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: radial-gradient(60% 50% at 50% 40%, var(--surface) 0%, var(--bg) 100%);
  text-align: center;
}

.stage .big {
  width: min(260px, 70%);
  margin: 0 auto;
}

.stage h2 {
  margin-top: 14px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.stage p {
  font-size: 13px;
  color: var(--muted);
}

.finishes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 18px;
}

.finish {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 0;
  background: none;
  font-size: 12px;
  color: var(--muted);
}

.finish i {
  display: block;
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.finish[aria-pressed='true'] {
  color: var(--ink);
  font-weight: 600;
}

.finish[aria-pressed='true'] i {
  box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink);
}

.finish.locked i {
  opacity: 0.4;
}

.comp-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mlist {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  padding: 0;
  list-style: none;
}

.mlist li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 28px;
  font-size: 14px;
  color: var(--ink-2);
}

.mlist li i {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--surface-2);
}

.mlist li.done i { background: var(--pb); }
.mlist.trail li.done i { background: var(--trail); }
.mlist li.next { color: var(--ink); font-weight: 600; }
.mlist li.next i { background: none; box-shadow: inset 0 0 0 2px var(--ink); }

.mlist li em,
.mlist li .link {
  margin-left: auto;
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}

.link {
  border: 0;
  background: none;
  padding: 4px 6px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.silent-row {
  display: flex;
  align-items: center;
  gap: 12px;
  grid-column: 1 / -1;
}

.silent-row p {
  font-size: 13px;
  color: var(--ink-2);
}

/* ---------- Ajustes ---------- */
.settings {
  max-width: 680px;
}

.settings fieldset {
  margin: 0 0 22px;
  padding: 0;
  border: 0;
}

.settings legend {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.setting small {
  display: block;
  font-size: 12px;
  color: var(--muted);
}

.danger {
  color: var(--arm);
}

/* ---------- Primeira vez ---------- */
.onb .centro-box {
  width: 120px;
  margin: 10px auto 14px;
}

.onb p {
  color: var(--ink-2);
}

.onb .hold {
  width: 100%;
  min-height: 72px;
  margin-top: 14px;
  border: 2px dashed var(--line);
  border-radius: 16px;
  background: none;
  color: var(--muted);
  touch-action: none;
}

.onb .hold.arming { border-color: var(--arm); color: var(--arm); border-style: solid; }
.onb .hold.ready { border-color: var(--go); color: var(--go); border-style: solid; }

.onb .actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

/* ---------- Responsivo ---------- */
@media (max-width: 1023px) {
  .timer {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'main' 'side' 'tiles' 'zones' 'hints';
  }

  .t-side {
    flex-direction: row;
  }

  .t-side > * {
    flex: 1;
  }

  .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .evo-grid,
  .comp { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 639px) {
  .topbar { padding: 14px 16px; gap: 12px; }
  .topbar .tabs,
  .topbar [data-date] { display: none; }
  .screen { padding: 0 16px 96px; }

  .timer {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    text-align: center;
  }

  .t-main,
  .t-side,
  .t-coach,
  .t-coachtext { display: contents; }

  .t-scramble { order: 1; }
  .t-scramble .label { display: none; }
  .t-centro { order: 2; width: 30vw; max-width: 140px; margin: 2px auto 0; }
  .time { order: 3; margin: 4px 0; font-size: 21vw; }
  .t-chips { order: 4; justify-content: center; }
  .t-actions { order: 5; justify-content: center; margin-top: 0; }
  .t-note { order: 6; margin: 0 auto; width: 100%; }
  .t-coachtext .label { display: none; }
  .coach { order: 7; min-height: 2.9em; margin: 0; text-align: center; }
  .zones { order: 8; }
  .t-heat,
  .t-tiles,
  .t-hints { display: none; }

  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hist .scr { display: none; }
  .comp-cols { grid-template-columns: minmax(0, 1fr); }

  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 6px 0 calc(6px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--line);
    background: var(--surface);
  }

  .tabbar button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-height: 44px;
    border: 0;
    background: none;
    font-size: 11px;
    color: var(--muted);
  }

  .tabbar button[aria-current='page'] {
    color: var(--ink);
    font-weight: 600;
  }

  .tabbar svg {
    width: 20px;
    height: 20px;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add prototype/styles/tokens.css prototype/styles/base.css prototype/styles/components.css prototype/styles/screens.css prototype/tests/contrast.test.js
git commit -m "feat(prototipo): tokens Clube claro e noite com contraste AA testado" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Telas: formatação, gráficos, views e diálogos

**Files:**
- Create: `prototype/scripts/ui/format.js`
- Create: `prototype/scripts/ui/charts.js`
- Create: `prototype/scripts/ui/timer-view.js`
- Create: `prototype/scripts/ui/evolucao-view.js`
- Create: `prototype/scripts/ui/companion-view.js`
- Create: `prototype/scripts/ui/ajustes-view.js`
- Create: `prototype/scripts/ui/overlays.js`
- Test: `prototype/tests/format.test.js`
- Test: `prototype/tests/charts.test.js`
- Test: `prototype/tests/views.test.js`

**Interfaces:**
- **Consumes:**
  - `stats.js`, `strings.js` e `centro.js` (Tasks 1 e 6)
  - `buildSeed` e `DEFAULT_SETTINGS` (só nos testes)
- **Produces:**
  - **`format.js`:**
    - `dateLabel(ts)`, por exemplo `'qui, 8 out'`
    - `monthLabel(ts)`
    - `daysAgoLabel(ts, now)`
    - `relativeTime(ts, now)`
    - `truncate(s, n)`
    - `escapeHtml(s)`
  - **`charts.js`:**
    - `evolutionChart({ times, ao5, pb }, { width, height, pad }) → string`
    - `histogramBins(values) → { from, to, count }[]`
  - **`timer-view.js`:**
    - `paintTime(el, text)`
    - `renderTimer({ root, state, session, last, history, number, kind, showResult, scramble, now })`
  - **`evolucao-view.js`:** `renderEvolucao({ root, solves, sessions, sessionFilter, period, now })`, com `period` igual a `'7'`, `'30'` ou `'all'`.
  - **`companion-view.js`:** `renderCompanion({ root, milestones, trail, finish, preview, silent, theme })`
  - **`ajustes-view.js`:** `renderAjustes({ root, settings, confirm })`
  - **`overlays.js`:**
    - `showToast(text, { action, onAction, ms })` e `hideToast()`
    - `announce(text)`
    - `openShortcuts()`
    - `openSessions({ sessions, current, counts, onPick, onCreate, onRename })`
    - `openOnboarding({ theme, holdMs, mode: 'first' | 'review', onExample, onFresh })`
  - **Atributos de ação** que as views emitem e o `app.js` trata:
    - `data-act`
    - `data-tab`
    - `data-period` e `data-evo-session`
    - `data-finish`
    - `data-trail`
    - `data-silent`
    - `data-set` com `data-val`
    - `data-toggle`
    - `data-data`

- [ ] **Step 1: Escrever os testes que falham**

`prototype/tests/format.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel, monthLabel, daysAgoLabel, relativeTime, truncate, escapeHtml } from '../scripts/ui/format.js';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();

test('datas em pt-BR curtas', () => {
  assert.equal(dateLabel(NOW), 'qui, 8 out');
  assert.equal(monthLabel(NOW), 'outubro');
});

test('tempo relativo', () => {
  assert.equal(relativeTime(NOW - 30000, NOW), 'agora');
  assert.equal(relativeTime(NOW - 5 * 60000, NOW), 'há 5 min');
  assert.equal(relativeTime(NOW - 3 * 3600000, NOW), 'há 3 h');
  assert.equal(relativeTime(NOW - 24 * 3600000, NOW), 'ontem');
  assert.equal(relativeTime(NOW - 3 * 86400000, NOW), 'há 3 dias');
  assert.equal(daysAgoLabel(NOW, NOW), 'hoje');
});

test('truncate e escapeHtml', () => {
  assert.equal(truncate('R U R\' U\' F2', 6), 'R U R…');
  assert.equal(truncate('R U', 6), 'R U');
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
```

`prototype/tests/charts.test.js`:

```js
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
```

`prototype/tests/views.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEvolucao } from '../scripts/ui/evolucao-view.js';
import { renderCompanion } from '../scripts/ui/companion-view.js';
import { renderAjustes } from '../scripts/ui/ajustes-view.js';
import { buildSeed } from '../scripts/data.js';
import { milestoneProgress } from '../scripts/stats.js';
import { DEFAULT_SETTINGS } from '../scripts/store.js';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
const seed = buildSeed(NOW);

test('Evolução: indicadores, gráfico, distribuição e histórico com os dados de exemplo', () => {
  const root = { innerHTML: '' };
  renderEvolucao({ root, solves: seed.solves, sessions: seed.sessions, sessionFilter: 'all', period: '30', now: NOW });
  assert.equal((root.innerHTML.match(/class="tile"/g) || []).length, 5);
  assert.match(root.innerHTML, /<b class="pb">0:54.10<\/b>/);
  assert.equal((root.innerHTML.match(/class="dot"/g) || []).length, 211);
  assert.equal((root.innerHTML.match(/<tr><td class="num">/g) || []).length, 30);
  assert.match(root.innerHTML, /aria-pressed="true">30 dias/);
});

test('Evolução: período vazio mostra aviso em vez de quebrar', () => {
  const root = { innerHTML: '' };
  renderEvolucao({ root, solves: [], sessions: seed.sessions, sessionFilter: 'all', period: '7', now: NOW });
  assert.match(root.innerHTML, /Sem solves neste período/);
});

test('Centro: marcos, trilha, acabamento bloqueado e modo silencioso', () => {
  const root = { innerHTML: '' };
  renderCompanion({ root, milestones: milestoneProgress(seed.solves, NOW), trail: [true, true, true, true, false, false, false, false, false], finish: 'fosco', preview: null, silent: true, theme: 'light' });
  assert.match(root.innerHTML, /Temporada 1 · 6 de 9 marcos · acabamento Fosco/);
  assert.equal((root.innerHTML.match(/<li class="done">/g) || []).length, 6 + 4);
  assert.match(root.innerHTML, /<li class="next"><i><\/i>7 dias seguidos<em>4\/7<\/em>/);
  assert.match(root.innerHTML, /class="finish locked" data-finish="gelo"/);
  assert.match(root.innerHTML, /data-silent checked/);
});

test('Ajustes: valores atuais marcados e confirmação em dois cliques', () => {
  const root = { innerHTML: '' };
  renderAjustes({ root, settings: { ...DEFAULT_SETTINGS, holdMs: 550 }, confirm: 'wipe' });
  assert.match(root.innerHTML, /data-set="holdMs" data-val="550" aria-pressed="true"/);
  assert.match(root.innerHTML, /data-set="theme" data-val="system" aria-pressed="true"/);
  assert.match(root.innerHTML, /data-data="wipe">Tem certeza\? Clique de novo/);
  assert.match(root.innerHTML, /data-toggle="inspection" checked/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd prototype && node --test tests/format.test.js tests/charts.test.js tests/views.test.js`
Expected: FAIL com `Cannot find module` para `ui/format.js`, `ui/charts.js` e as views.

- [ ] **Step 3: Implementar formatação e gráficos**

`prototype/scripts/ui/format.js`:

```js
// Formatação de datas e textos curtos da interface.
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAY = 86400000;

export const dateLabel = (ts) => {
  const d = new Date(ts);
  return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`;
};

export const monthLabel = (ts) => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][new Date(ts).getMonth()];

function calendarDays(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(12, 0, 0, 0);
  y.setHours(12, 0, 0, 0);
  return Math.round((y - x) / DAY);
}

export function daysAgoLabel(ts, now) {
  const d = calendarDays(ts, now);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

export function relativeTime(ts, now) {
  const diff = Math.max(0, now - ts);
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
  if (calendarDays(ts, now) === 0) return `há ${Math.floor(diff / 3600000)} h`;
  return daysAgoLabel(ts, now);
}

export const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
```

`prototype/scripts/ui/charts.js`:

```js
// Gráficos da Evolução como strings SVG, sem dependências.
const STEP = 5000;
const valid = (v) => v !== null && v !== Infinity;

// times: tempos efetivos (Infinity = DNF); ao5: média de 5 em cada ponto (null se não houver);
// pb: true onde o solve bateu o recorde da época. Tempo menor fica mais embaixo: a linha desce conforme você melhora.
export function evolutionChart({ times, ao5, pb }, { width = 600, height = 160, pad = 10 } = {}) {
  const all = [...times.filter(valid), ...ao5.filter(valid)];
  if (!all.length) return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sem solves no período"></svg>`;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const n = times.length;
  const x = (i) => (n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (v) => pad + ((max - v) / span) * (height - 2 * pad);
  let dots = '';
  let diamonds = '';
  times.forEach((v, i) => {
    if (!valid(v)) return;
    dots += `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4"/>`;
    if (pb[i]) diamonds += `<path class="pb" d="M${x(i).toFixed(1)} ${(y(v) - 6).toFixed(1)}l6 6-6 6-6-6z"/>`;
  });
  const pts = ao5.map((v, i) => (valid(v) ? `${x(i).toFixed(1)} ${y(v).toFixed(1)}` : null)).filter(Boolean);
  const line = pts.length > 1 ? `<path class="avg" d="M${pts.join(' L')}"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução dos tempos">${dots}${line}${diamonds}</svg>`;
}

// Faixas de 5 s do menor ao maior tempo (sem DNF).
export function histogramBins(values) {
  const v = values.filter(valid);
  if (!v.length) return [];
  const lo = Math.floor(Math.min(...v) / STEP) * STEP;
  const count = Math.floor((Math.max(...v) - lo) / STEP) + 1;
  const bins = Array.from({ length: count }, (_, i) => ({ from: lo + i * STEP, to: lo + (i + 1) * STEP, count: 0 }));
  for (const x of v) bins[Math.floor((x - lo) / STEP)].count++;
  return bins;
}
```

- [ ] **Step 4: Implementar as views e os diálogos**

`prototype/scripts/ui/timer-view.js`:

```js
// Partes "lentas" da tela do Timer (mudam a cada solve, não a cada quadro).
import { formatMs, averageOf, bestSingleSolve, effectiveMs, solveDeltas, monthHeat, currentStreak, solvesOnDay } from '../stats.js';
import { T } from '../strings.js';
import { daysAgoLabel, monthLabel, escapeHtml } from './format.js';

// '0:58.42' → 0:58 + <span class="dec">.42</span>. Textos sem ponto (inspeção, DNF) vão inteiros.
export function paintTime(el, text) {
  const cut = text.indexOf('.');
  el.innerHTML = cut < 0 ? escapeHtml(text) : `${escapeHtml(text.slice(0, cut))}<span class="dec">${escapeHtml(text.slice(cut))}</span>`;
}

// ctx: { root, state, session, last, history, number, kind, showResult, scramble, now }
export function renderTimer(ctx) {
  const { root, state, session, last, history, number, kind, showResult, scramble, now } = ctx;
  root.querySelector('[data-scramble]').textContent = scramble;
  root.querySelector('[data-pbtag]').hidden = !(showResult && kind === 'pb');

  const chips = root.querySelector('[data-chips]');
  if (last) {
    const d = solveDeltas(history, last);
    const parts = [];
    if (d.vsAo5 !== null) parts.push(`<span class="chip">${T.chips.vsAo5(d.vsAo5)}</span>`);
    if (d.isPb) parts.push(`<span class="chip pb">${T.chips.newPb(-d.vsPb)}</span>`);
    else if (d.vsPb !== null) parts.push(`<span class="chip">${T.chips.vsPb(d.vsPb)}</span>`);
    parts.push(`<span class="chip">${T.chips.solveN(number)}</span>`);
    chips.innerHTML = parts.join('');
  } else {
    chips.innerHTML = '';
  }

  const actions = root.querySelector('[data-actions]');
  actions.hidden = !(showResult && last);
  if (last) {
    actions.querySelector('[data-act="plus2"]').setAttribute('aria-pressed', String(last.penalty === '+2'));
    actions.querySelector('[data-act="dnf"]').setAttribute('aria-pressed', String(last.penalty === 'DNF'));
  }

  const best = bestSingleSolve(state.solves);
  const today = solvesOnDay(state.solves, now).length;
  root.querySelector('[data-tiles]').innerHTML = [
    ['Média de 5', formatMs(averageOf(session, 5)), ''],
    ['Média de 12', formatMs(averageOf(session, 12)), ''],
    ['Recorde', best ? formatMs(effectiveMs(best)) : '—', best ? daysAgoLabel(best.at, now) : ''],
    ['Hoje', String(today), `solves · meta ${state.settings.dailyGoal}`],
  ].map(([label, value, sub]) => `<div class="tile"><small>${label}</small><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`).join('');

  const heat = monthHeat(state.solves, now);
  root.querySelector('[data-heatlabel]').textContent = `Constância · ${monthLabel(now)}`;
  const streak = currentStreak(state.solves, now);
  root.querySelector('[data-streak]').textContent = streak === 1 ? '1 dia seguido' : `${streak} dias seguidos`;
  const cells = heat.map((h) => `<i class="${h.pb ? 'pb' : h.level ? `l${h.level}` : ''}${h.today ? ' today' : ''}" title="${h.day}: ${h.count} solves"></i>`);
  while (cells.length < 32) cells.push('<i style="visibility:hidden"></i>');
  root.querySelector('[data-heat]').innerHTML = cells.join('');
}
```

`prototype/scripts/ui/evolucao-view.js`:

```js
// Tela Evolução: indicadores, gráfico, distribuição e histórico.
import { effectiveMs, formatMs, formatSolve, averageOf, bestSingle, stdDevMs, rollingAverages, pbFlags } from '../stats.js';
import { evolutionChart, histogramBins } from './charts.js';
import { relativeTime, truncate, escapeHtml } from './format.js';

const DAY = 86400000;
const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['all', 'Tudo']];

function variation(now, then) {
  if (now === null || then === null || now === Infinity || then === Infinity) return '—';
  const d = now - then;
  if (Math.abs(d) < 10) return 'sem mudança';
  return `${d < 0 ? '▼' : '▲'} ${(Math.abs(d) / 1000).toFixed(2)} s no período`;
}

// ctx: { root, solves, sessions, sessionFilter, period, now }
export function renderEvolucao({ root, solves, sessions, sessionFilter, period, now }) {
  const pool = sessionFilter === 'all' ? solves : solves.filter((x) => x.session === sessionFilter);
  const start = period === 'all' ? -Infinity : now - Number(period) * DAY;
  const offset = pool.findIndex((x) => x.at >= start);
  const first = offset < 0 ? pool.length : offset;
  const before = pool.slice(0, first);
  const inPeriod = pool.slice(first);

  const kpis = [
    ['Recorde', bestSingle(pool), bestSingle(before), true],
    ['Média de 5', averageOf(pool, 5), averageOf(before, 5)],
    ['Média de 12', averageOf(pool, 12), averageOf(before, 12)],
    ['Média de 100', averageOf(pool, 100), averageOf(before, 100)],
  ].map(([label, value, then, pb]) => `<div class="tile"><small>${label}</small><b class="${pb ? 'pb' : ''}">${formatMs(value)}</b><em>${period === 'all' ? '&nbsp;' : variation(value, then)}</em></div>`);
  const sd = stdDevMs(inPeriod);
  kpis.push(`<div class="tile"><small>Desvio</small><b>${sd === null ? '—' : `±${(sd / 1000).toFixed(1)} s`}</b><em>solves do período</em></div>`);

  const r5 = rollingAverages(pool, 5);
  const flags = pbFlags(pool);
  const times = inPeriod.map(effectiveMs);
  const chart = evolutionChart({ times, ao5: r5.slice(first), pb: flags.slice(first) });

  const bins = histogramBins(times);
  const current = averageOf(pool, 5);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const bars = bins.map((b) => `<i class="${current !== null && current >= b.from && current < b.to ? 'hl' : ''}" style="height:${Math.max(2, (b.count / maxCount) * 100)}%" title="${formatMs(b.from)}–${formatMs(b.to)}: ${b.count}"></i>`).join('');
  const axis = bins.length ? `<span>${formatMs(bins[0].from).slice(0, -3)}</span><span>${formatMs(bins[bins.length - 1].to).slice(0, -3)}</span>` : '';

  const rows = inPeriod.slice(-30).reverse().map((x) => {
    const i = pool.indexOf(x);
    const tag = flags[i] ? '<span class="tag pb">recorde</span>' : x.penalty ? `<span class="tag">${x.penalty}</span>` : '';
    return `<tr><td class="num">${i + 1}</td><td>${formatSolve(x)}${tag}</td><td>${formatMs(r5[i])}</td><td class="scr">${escapeHtml(truncate(x.scramble, 28))}</td><td>${relativeTime(x.at, now)}</td></tr>`;
  }).join('');

  const options = [['all', 'Todas as sessões'], ...sessions.map((s) => [s.id, s.name])]
    .map(([v, l]) => `<option value="${escapeHtml(v)}"${v === sessionFilter ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');

  root.innerHTML = `
    <div class="page-h">
      <h1>Evolução</h1>
      <select class="pill" data-evo-session aria-label="Sessão">${options}</select>
      <div class="seg" role="group" aria-label="Período">${PERIODS.map(([v, l]) => `<button data-period="${v}" aria-pressed="${v === period}">${l}</button>`).join('')}</div>
    </div>
    <div class="kpis">${kpis.join('')}</div>
    <div class="evo-grid">
      <div class="card"><div class="label">Todos os solves · média de 5 · recordes</div>${chart}</div>
      <div class="card"><div class="label">Distribuição</div><div class="bars">${bars}</div><div class="bars-x">${axis}</div></div>
    </div>
    <div class="card hist"><table>
      <thead><tr><th>#</th><th>Tempo</th><th>Média de 5</th><th class="scr">Embaralhamento</th><th>Quando</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">Sem solves neste período.</td></tr>'}</tbody>
    </table></div>`;
}
```

`prototype/scripts/ui/companion-view.js`:

```js
// Tela do Centro: corpo com a jornada, acabamentos, marcos, trilha e modo silencioso.
import { renderCentro, paletteFor } from '../centro.js';
import { MILESTONE_INFO, TRAIL, FINISH_INFO, T } from '../strings.js';

const SWATCH = {
  fosco: (p) => p.body,
  brilho: (p) => `linear-gradient(135deg, #8a8a90, ${p.body} 60%)`,
  gelo: () => '#bfd9e6',
  carbono: () => 'repeating-linear-gradient(45deg, #222 0 3px, #151515 3px 6px)',
};

// ctx: { root, milestones, trail, finish, preview, silent, theme }
export function renderCompanion({ root, milestones, trail, finish, preview, silent, theme }) {
  const done = milestones.filter((m) => m.achieved).length;
  const trailDone = trail.filter(Boolean).length;
  const shown = preview || finish;
  const unlocked = (f) => f === 'fosco' || (f === 'brilho' && done === 9);
  const p = paletteFor(theme, 'fosco');
  const nextMilestone = milestones.findIndex((m) => !m.achieved);
  const nextStep = trail.findIndex((x) => !x);

  const finishes = Object.keys(FINISH_INFO).map((f) => {
    const locked = !unlocked(f);
    const sub = locked ? ` · ${FINISH_INFO[f].unlock}` : '';
    return `<button class="finish${locked ? ' locked' : ''}" data-finish="${f}" aria-pressed="${f === shown}"><i style="background:${SWATCH[f](p)}"></i>${FINISH_INFO[f].label}${sub}</button>`;
  }).join('');

  const mlist = milestones.map((m, i) => {
    const cls = m.achieved ? 'done' : i === nextMilestone ? 'next' : '';
    const right = m.achieved ? '<em>✓</em>' : m.progress ? `<em>${m.progress}</em>` : '';
    return `<li class="${cls}"><i></i>${MILESTONE_INFO[m.id].label}${right}</li>`;
  }).join('');

  const tlist = TRAIL.map((name, i) => {
    const cls = trail[i] ? 'done' : i === nextStep ? 'next' : '';
    return `<li class="${cls}"><i></i>${name}<button class="link" data-trail="${i}">${trail[i] ? 'desfazer' : 'já sei'}</button></li>`;
  }).join('');

  root.innerHTML = `
    <div class="comp">
      <div class="stage">
        <div class="big">${renderCentro({ theme, eyes: 'open', topLit: done, sideLit: trailDone, finish: shown, label: `Centro: ${done} de 9 marcos, ${trailDone} de 9 etapas` })}</div>
        <h2>Centro</h2>
        <p>${T.season(done, FINISH_INFO[finish].label)}${preview ? ` · prévia: ${FINISH_INFO[preview].label}` : ''}</p>
        <div class="finishes" role="group" aria-label="Acabamentos">${finishes}</div>
      </div>
      <div class="comp-cols">
        <div class="card"><div class="label">Face de cima · marcos</div><ul class="mlist">${mlist}</ul></div>
        <div class="card"><div class="label">Face lateral · trilha</div><ul class="mlist trail">${tlist}</ul></div>
        <div class="card silent-row">
          <input type="checkbox" class="switch" id="silent" data-silent ${silent ? 'checked' : ''} />
          <label for="silent"><span class="label">Coach</span><p>Modo silencioso — o Centro continua reagindo, mas sem texto.</p></label>
        </div>
      </div>
    </div>`;
}
```

`prototype/scripts/ui/ajustes-view.js`:

```js
// Tela Ajustes. Os controles só emitem data-attributes; o app.js aplica as mudanças.
const seg = (key, current, options) =>
  `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${String(v) === String(current)}">${l}</button>`).join('')}</div>`;

const toggle = (key, checked, label, hint = '') =>
  `<label class="setting"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="switch" data-toggle="${key}" ${checked ? 'checked' : ''} /></label>`;

const row = (label, hint, control) => `<div class="setting"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>${control}</div>`;

// confirm: id do botão de dados que está pedindo confirmação (segundo clique), ou null.
export function renderAjustes({ root, settings, confirm }) {
  const danger = (id, label, confirmLabel) =>
    `<button type="button" class="btn${confirm === id ? ' danger' : ''}" data-data="${id}">${confirm === id ? confirmLabel : label}</button>`;
  root.innerHTML = `
    <div class="page-h"><h1>Ajustes</h1></div>
    <div class="settings">
      <fieldset>
        <legend>Timer</legend>
        ${toggle('inspection', settings.inspection, 'Inspeção de 15 s', 'Avisos aos 8 e 12 s; +2 depois de 15 s; DNF depois de 17 s.')}
        ${row('Tempo para armar', 'Quanto tempo segurar até ficar verde.', seg('holdMs', settings.holdMs, [[0, '0'], [300, '0,3 s'], [550, '0,55 s'], [1000, '1 s']]))}
        ${row('Armar no celular', 'Dois polegares evita disparo sem querer.', seg('mobileArm', settings.mobileArm, [['two', 'Dois polegares'], ['one', 'Um toque']]))}
      </fieldset>
      <fieldset>
        <legend>Aparência e som</legend>
        ${row('Tema', '', seg('theme', settings.theme, [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Noite']]))}
        ${toggle('sound.klick', settings.sound.klick, 'Som "klick"', 'Ao ficar pronto e ao parar.')}
        ${toggle('sound.insp', settings.sound.insp, 'Tique da inspeção', 'Aos 8 e 12 s.')}
        ${toggle('sound.pb', settings.sound.pb, 'Acorde do recorde')}
      </fieldset>
      <fieldset>
        <legend>Coach e acessibilidade</legend>
        ${toggle('silent', settings.silent, 'Modo silencioso', 'O Centro reage, mas o coach não escreve.')}
        ${row('Reduzir movimento', '', seg('reducedMotion', settings.reducedMotion, [['system', 'Seguir o sistema'], ['always', 'Sempre']]))}
        ${row('Idioma', 'Inglês fica para depois.', '<span class="muted">Português (Brasil)</span>')}
      </fieldset>
      <fieldset>
        <legend>Dados</legend>
        ${row('Exportar', 'Baixa seus solves em JSON.', '<button type="button" class="btn" data-data="export">Exportar</button>')}
        ${row('Rever a apresentação', '', '<button type="button" class="btn" data-data="onboarding">Abrir</button>')}
        ${row('Dados de exemplo', 'Troca tudo pelos 212 solves fictícios.', danger('seed', 'Restaurar', 'Tem certeza? Clique de novo'))}
        ${row('Começar do zero', 'Apaga todos os solves deste navegador.', danger('wipe', 'Apagar tudo', 'Tem certeza? Clique de novo'))}
      </fieldset>
    </div>`;
}
```

`prototype/scripts/ui/overlays.js`:

```js
// Aviso com desfazer, anúncios para leitor de tela e os diálogos (atalhos, sessões, primeira vez).
import { renderCentro, ringFor, eyesFor, updateCentro } from '../centro.js';
import { escapeHtml } from './format.js';

const $ = (s) => document.querySelector(s);
let toastTimer = 0;

export function showToast(text, { action, onAction, ms = 6000 } = {}) {
  const el = $('[data-toast]');
  const btn = el.querySelector('[data-toast-action]');
  el.querySelector('[data-toast-text]').textContent = text;
  btn.hidden = !action;
  btn.textContent = action || '';
  btn.onclick = action
    ? () => {
        hideToast();
        onAction();
      }
    : null;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}

export function hideToast() {
  clearTimeout(toastTimer);
  const el = $('[data-toast]');
  if (el) el.hidden = true;
}

export function announce(text) {
  const el = $('[data-live]');
  el.textContent = '';
  setTimeout(() => {
    el.textContent = text;
  }, 50);
}

function bindClose(d) {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
}

const SHORTCUTS = [
  ['espaço', 'Armar (segure) e largar (solte)'],
  ['qualquer tecla', 'Parar'],
  ['P', '+2 no último solve'],
  ['D', 'DNF no último solve'],
  ['M', 'Nota'],
  ['⌫', 'Excluir o último'],
  ['Z', 'Desfazer a exclusão'],
  ['N', 'Novo embaralhamento'],
  ['?', 'Mostrar atalhos'],
  ['1–4', 'Trocar de aba'],
];

export function openShortcuts() {
  const d = $('[data-dialog="shortcuts"]');
  d.innerHTML = `<h2>Atalhos</h2><table><tbody>${SHORTCUTS.map(([k, v]) => `<tr><td><span class="key">${k}</span></td><td>${v}</td></tr>`).join('')}</tbody></table>
    <div class="row"><button type="button" class="btn" data-close>Fechar</button></div>`;
  if (!d.dataset.bound) {
    bindClose(d);
    d.dataset.bound = '1';
  }
  d.showModal();
}

// ctx: { sessions, current, counts, onPick(id), onCreate(name), onRename(name) }
export function openSessions({ sessions, current, counts, onPick, onCreate, onRename }) {
  const d = $('[data-dialog="sessions"]');
  const name = (sessions.find((s) => s.id === current) || {}).name || '';
  d.innerHTML = `<h2>Sessões</h2>
    ${sessions.map((s) => `<button type="button" class="list-btn" data-pick="${escapeHtml(s.id)}" aria-current="${s.id === current}"><span>${escapeHtml(s.name)}</span><span class="muted num">${counts[s.id] || 0} solves</span></button>`).join('')}
    <div class="row"><input type="text" data-newname placeholder="Nome da nova sessão" aria-label="Nome da nova sessão" /><button type="button" class="btn primary" data-create>Criar</button></div>
    <div class="row"><input type="text" data-rename value="${escapeHtml(name)}" aria-label="Renomear a sessão atual" /><button type="button" class="btn" data-dorename>Renomear</button></div>
    <div class="row"><button type="button" class="btn" data-close>Fechar</button></div>`;
  d.onclick = (e) => {
    if (e.target === d || e.target.closest('[data-close]')) return d.close();
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      d.close();
      onPick(pick.dataset.pick);
    } else if (e.target.closest('[data-create]')) {
      const value = d.querySelector('[data-newname]').value;
      d.close();
      onCreate(value);
    } else if (e.target.closest('[data-dorename]')) {
      const value = d.querySelector('[data-rename]').value;
      d.close();
      onRename(value);
    }
  };
  d.showModal();
}

// mode: 'first' (escolhe dados de exemplo ou começar do zero) | 'review' (só fechar).
export function openOnboarding({ theme, holdMs, mode, onExample, onFresh }) {
  const d = $('[data-dialog="onboarding"]');
  let step = 1;
  let chosen = false;
  let pressAt = 0;
  let ready = false;
  let practiced = false;
  let raf = 0;

  const steps = {
    1: {
      title: 'Esse é o Centro',
      text: 'Ele acompanha seus solves e guarda a sua jornada no próprio corpo: os marcos na face de cima, a trilha na face do lado.',
      centro: { ring: [null, null, 'idle', null, null, null, null, null], eyes: 'open' },
    },
    2: {
      title: 'Segure até ficar verde',
      text: 'Segure espaço (ou o botão abaixo). O anel enche de vermelho; quando ficar verde, solte.',
      centro: { ring: Array(8).fill(null), eyes: 'open' },
    },
    3: {
      title: 'Seu primeiro marco',
      text: 'Pare com qualquer tecla. O primeiro solve já acende um adesivo dourado em cima do Centro.',
      centro: { ring: ['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F'], eyes: 'happy', topLit: 1 },
    },
  };

  function render() {
    const s = steps[step];
    const actions =
      step === 1
        ? '<button type="button" class="btn primary" data-next>Continuar</button>'
        : step === 2
          ? `<button type="button" class="btn" data-back>Voltar</button><button type="button" class="btn primary" data-next ${practiced ? '' : 'disabled'}>Continuar</button>`
          : mode === 'first'
            ? '<button type="button" class="btn" data-fresh>Começar do zero</button><button type="button" class="btn primary" data-example>Explorar com dados de exemplo</button>'
            : '<button type="button" class="btn primary" data-close>Fechar</button>';
    d.innerHTML = `<div class="label">${step} de 3</div>
      <div class="centro-box" data-onb-centro>${renderCentro({ theme, ring: s.centro.ring, eyes: s.centro.eyes, topLit: s.centro.topLit || 0 })}</div>
      <h2>${s.title}</h2><p>${s.text}</p>
      ${step === 2 ? `<button type="button" class="hold${practiced ? ' ready' : ''}" data-hold>${practiced ? 'É assim que larga.' : 'Segure aqui'}</button>` : ''}
      <div class="actions">${actions}</div>`;
  }

  function paint(st, progress) {
    updateCentro(d.querySelector('[data-onb-centro] svg'), { theme, ring: ringFor({ state: st, armProgress: progress }), eyes: eyesFor({ state: st }) });
    const hold = d.querySelector('[data-hold]');
    if (hold) hold.className = `hold ${st === 'reaction' ? 'ready' : st}`;
  }

  function frame() {
    const progress = holdMs <= 0 ? 1 : Math.min(1, (performance.now() - pressAt) / holdMs);
    if (progress >= 1) {
      ready = true;
      paint('ready', 1);
      d.querySelector('[data-hold]').textContent = 'Agora solte';
      return;
    }
    paint('arming', progress);
    raf = requestAnimationFrame(frame);
  }

  function down() {
    if (step !== 2 || pressAt) return;
    pressAt = performance.now();
    ready = false;
    raf = requestAnimationFrame(frame);
  }

  function up() {
    if (step !== 2 || !pressAt) return;
    cancelAnimationFrame(raf);
    pressAt = 0;
    if (ready) {
      practiced = true;
      render();
      updateCentro(d.querySelector('[data-onb-centro] svg'), { theme, ring: ringFor({ state: 'reaction', result: 'good' }), eyes: 'open' });
    } else {
      paint('idle', 0);
      d.querySelector('[data-hold]').textContent = 'Segure aqui';
    }
  }

  d.onclick = (e) => {
    if (e.target.closest('[data-next]')) {
      step += 1;
      render();
    } else if (e.target.closest('[data-back]')) {
      step -= 1;
      render();
    } else if (e.target.closest('[data-example]')) {
      chosen = true;
      d.close();
      onExample();
    } else if (e.target.closest('[data-fresh]')) {
      chosen = true;
      d.close();
      onFresh();
    } else if (e.target.closest('[data-close]')) {
      d.close();
    }
  };
  d.onpointerdown = (e) => {
    if (e.target.closest('[data-hold]')) {
      e.preventDefault();
      down();
    }
  };
  d.onpointerup = () => up();
  d.onkeydown = (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (!e.repeat) down();
  };
  d.onkeyup = (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    up();
  };
  d.onclose = () => {
    cancelAnimationFrame(raf);
    if (mode === 'first' && !chosen) onExample();
  };
  render();
  d.showModal();
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd prototype && node --test tests/format.test.js tests/charts.test.js tests/views.test.js`
Expected: PASS, 11 testes.

- [ ] **Step 6: Commit**

```bash
git add prototype/scripts/ui prototype/tests/format.test.js prototype/tests/charts.test.js prototype/tests/views.test.js
git commit -m "feat(prototipo): views do Timer, Evolução, Centro, Ajustes e diálogos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Página e `app.js`: integração e verificação no navegador

**Files:**
- Create: `prototype/index.html`
- Create: `prototype/scripts/app.js`

**Interfaces:**
- **Consumes:** todos os módulos anteriores, com as assinaturas dos blocos **Interfaces** dos Tasks 1 a 9.
- **Produces:** o protótipo completo, que abre em `prototype/index.html` servido por HTTP. O arquivo não abre via `file://`, porque ES modules exigem HTTP.

- [ ] **Step 1: Criar a página**

`prototype/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Klick protótipo</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" />
    <link rel="stylesheet" href="styles/tokens.css" />
    <link rel="stylesheet" href="styles/base.css" />
    <link rel="stylesheet" href="styles/components.css" />
    <link rel="stylesheet" href="styles/screens.css" />
    <script type="module" src="scripts/app.js"></script>
  </head>
  <body data-tstate="idle" data-cview="idle">
    <a class="skip" href="#main">Pular para o conteúdo</a>

    <header class="topbar">
      <div class="wordmark"><span class="glyph" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>klick</div>
      <nav class="tabs" aria-label="Seções">
        <button class="tab" data-tab="timer">Timer</button>
        <button class="tab" data-tab="evolucao">Evolução</button>
        <button class="tab" data-tab="companion">Centro</button>
        <button class="tab" data-tab="ajustes">Ajustes</button>
      </nav>
      <div class="meta">
        <button class="pill" data-session-pill aria-haspopup="dialog"></button>
        <span data-date></span>
      </div>
    </header>

    <main id="main">
      <section class="screen timer" data-screen="timer" aria-label="Timer">
        <div class="t-main">
          <div class="t-scramble fade">
            <div class="label">Embaralhamento</div>
            <p class="scramble" data-scramble></p>
            <span class="pb-tag" data-pbtag hidden>Novo recorde</span>
          </div>
          <div class="time" data-time aria-hidden="true">0:00<span class="dec">.00</span></div>
          <div class="chips t-chips fade" data-chips></div>
          <div class="t-actions fade" data-actions hidden>
            <button class="btn" data-act="plus2" aria-pressed="false">+2 <kbd>P</kbd></button>
            <button class="btn" data-act="dnf" aria-pressed="false">DNF <kbd>D</kbd></button>
            <button class="btn" data-act="note">Nota <kbd>M</kbd></button>
            <button class="btn" data-act="delete">Excluir <kbd>⌫</kbd></button>
          </div>
          <form class="t-note fade" data-noteform hidden>
            <input type="text" name="note" maxlength="80" placeholder="Nota sobre este solve" aria-label="Nota sobre este solve" />
            <button class="btn" type="submit">Salvar</button>
          </form>
        </div>
        <aside class="t-side" aria-label="Coach e constância">
          <div class="card t-coach">
            <div class="t-centro" data-centro-slot></div>
            <div class="t-coachtext">
              <div class="label fade">Coach</div>
              <p class="coach" data-coach></p>
            </div>
          </div>
          <div class="card t-heat fade">
            <div class="card-h"><span class="label" data-heatlabel>Constância</span><span class="muted num" data-streak></span></div>
            <div class="heat" data-heat></div>
          </div>
        </aside>
        <div class="tiles t-tiles fade" data-tiles></div>
        <div class="zones" data-zones aria-hidden="true">
          <div class="zone" data-zone="left">polegar</div>
          <div class="zone" data-zone="right">polegar</div>
        </div>
        <p class="t-hints fade muted">espaço armar · qualquer tecla para · N novo embaralhamento · ? atalhos</p>
      </section>

      <section class="screen" data-screen="evolucao" aria-label="Evolução" hidden></section>
      <section class="screen" data-screen="companion" aria-label="Centro" hidden></section>
      <section class="screen" data-screen="ajustes" aria-label="Ajustes" hidden></section>
    </main>

    <nav class="tabbar" aria-label="Seções">
      <button data-tab="timer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>Timer</button>
      <button data-tab="evolucao"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/></svg>Evolução</button>
      <button data-tab="companion"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>Centro</button>
      <button data-tab="ajustes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>Ajustes</button>
    </nav>

    <div class="toast" data-toast role="status" hidden><span data-toast-text></span><button type="button" data-toast-action hidden></button></div>
    <div class="sr-only" aria-live="polite" data-live></div>

    <dialog class="sheet" data-dialog="sessions" aria-label="Sessões"></dialog>
    <dialog class="sheet" data-dialog="shortcuts" aria-label="Atalhos"></dialog>
    <dialog class="sheet onb" data-dialog="onboarding" aria-label="Primeira vez"></dialog>
  </body>
</html>
```

- [ ] **Step 2: Criar o `app.js`**

`prototype/scripts/app.js`:

```js
// Orquestra o protótipo: estado, timer, entrada (teclado e toque), Centro, telas e persistência.
import { createTimer } from './timer.js';
import { createTouchArm } from './touch.js';
import { createSound } from './sound.js';
import { pickCoachMessage } from './coach.js';
import { ringFor, eyesFor, renderCentro, updateCentro } from './centro.js';
import { achievedIds, milestoneProgress, resultKind, formatMs, formatSolve } from './stats.js';
import { scrambleAt } from './data.js';
import { T } from './strings.js';
import * as store from './store.js';
import { renderTimer, paintTime } from './ui/timer-view.js';
import { renderEvolucao } from './ui/evolucao-view.js';
import { renderCompanion } from './ui/companion-view.js';
import { renderAjustes } from './ui/ajustes-view.js';
import { showToast, hideToast, announce, openShortcuts, openSessions, openOnboarding } from './ui/overlays.js';
import { dateLabel } from './ui/format.js';

const TABS = ['timer', 'evolucao', 'companion', 'ajustes'];
const REACTION_DELAY = 500;
const REACTION_MS = 2500;
const COACH_MS = 6000;
const SLEEP_AFTER = 5 * 60000;
const ORBIT_MS = 950;

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const body = document.body;
const screens = Object.fromEntries(TABS.map((t) => [t, $(`[data-screen="${t}"]`)]));
const timeEl = $('[data-time]');
const coachEl = $('[data-coach]');
const slot = $('[data-centro-slot]');
const noteForm = $('[data-noteform]');

const storage = store.safeStorage();
let state = store.loadState(storage);
const firstRun = !state;
if (!state) state = store.seededState(Date.now());

const sessionSolves = () => store.sessionSolves(state);
const lastOfSession = () => sessionSolves().at(-1) || null;

const ui = {
  tab: 'timer',
  scramble: state.solves.length,
  lastId: lastOfSession()?.id ?? null,
  lastKind: null,
  showResult: false,
  reaction: null,
  coach: null,
  orbit: 0,
  sleeping: false,
  lastInput: Date.now(),
  removed: null,
  preview: null,
  period: '30',
  evoSession: 'all',
  confirm: null,
  looping: false,
  swallowClick: false,
  sig: '',
  text: '',
  coachText: null,
};

const mqDark = matchMedia('(prefers-color-scheme: dark)');
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqCoarse = matchMedia('(pointer: coarse)');
const theme = () => (state.settings.theme === 'system' ? (mqDark.matches ? 'dark' : 'light') : state.settings.theme);
const reduced = () => state.settings.reducedMotion === 'always' || mqReduce.matches;

const timer = createTimer({ now: () => performance.now(), holdMs: state.settings.holdMs, inspection: state.settings.inspection });
const sound = createSound(state.settings.sound);
const touch = createTouchArm({
  press: () => timer.press(),
  release: () => timer.release(),
  getState: () => timer.state,
  getInspection: () => state.settings.inspection,
  mode: state.settings.mobileArm,
});

const lastSolve = () => state.solves.find((x) => x.id === ui.lastId) || null;
const currentScramble = () => scrambleAt(ui.scramble);
const sessionName = () => (state.sessions.find((s) => s.id === state.currentSession) || {}).name || '';

function save() {
  store.saveState(storage, state);
}

function commit(next) {
  state = next;
  save();
  renderAll();
}

function applyPrefs() {
  if (state.settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = state.settings.theme;
  root.dataset.reducedMotion = String(reduced());
  root.dataset.arm = state.settings.mobileArm;
  timer.setOptions({ holdMs: state.settings.holdMs, inspection: state.settings.inspection });
  touch.setMode(state.settings.mobileArm);
  for (const k of ['klick', 'insp', 'pb']) sound.setEnabled(k, state.settings.sound[k]);
}

// ---------- Centro e partes que mudam a cada quadro ----------
function centroView() {
  const now = performance.now();
  if (ui.sleeping) return { state: 'sleep' };
  if (timer.state === 'inspect') return { state: 'inspect', inspectElapsed: timer.inspectElapsed };
  if (timer.state === 'arming') return { state: 'arming', armProgress: timer.armProgress };
  if (timer.state === 'ready' || timer.state === 'running') return { state: timer.state };
  if (ui.reaction && now < ui.reaction.from) return { state: 'running' }; // ainda imóvel: a reação vem depois
  if (ui.reaction && now < ui.reaction.until) return { state: 'reaction', result: ui.reaction.kind };
  return { state: 'idle', orbit: reduced() ? null : ui.orbit };
}

function idleText() {
  if (!mqCoarse.matches) return T.coach.idle;
  return state.settings.mobileArm === 'one' ? T.coach.idleOne : T.coach.idleTouch;
}

function coachText(view) {
  const now = performance.now();
  if (ui.coach && now >= ui.coach.from && now < ui.coach.until) return ui.coach.text;
  if (timer.state === 'inspect') return T.coach.inspect;
  if (timer.state === 'arming') return T.coach.arming;
  if (timer.state === 'ready') return T.coach.ready;
  if (view.state === 'running' || view.state === 'reaction') return '';
  return idleText();
}

function timeText() {
  const e = timer.inspectElapsed;
  if (timer.state === 'running') return formatMs(timer.elapsed);
  if (e > 0 && ['inspect', 'arming', 'ready'].includes(timer.state)) return e > 17000 ? 'DNF' : e > 15000 ? '+2' : String(Math.ceil((15000 - e) / 1000));
  if (timer.state === 'arming' || timer.state === 'ready') return '0:00.00';
  const last = lastSolve();
  return last ? formatSolve(last) : '0:00.00';
}

function paintLive() {
  const view = centroView();
  const ring = ringFor(view);
  const eyes = eyesFor(view);
  const sig = `${theme()}|${state.finish}|${ring.join()}|${eyes}`;
  if (sig !== ui.sig) {
    updateCentro(slot.querySelector('svg'), { theme: theme(), finish: state.finish, ring, eyes });
    ui.sig = sig;
  }
  body.dataset.cview = view.state;
  body.dataset.result = timer.state === 'done' && ui.showResult ? ui.lastKind : '';
  const e = timer.inspectElapsed;
  body.dataset.insp = timer.state === 'inspect' ? (e > 15000 ? 'over' : e >= 12000 ? '12' : e >= 8000 ? '8' : '') : '';
  const text = timeText();
  if (text !== ui.text) {
    paintTime(timeEl, text);
    ui.text = text;
  }
  const said = coachText(view);
  if (said !== ui.coachText) {
    if (said) coachEl.textContent = said;
    coachEl.classList.toggle('quiet', !said);
    ui.coachText = said;
  }
}

function needsFrame() {
  const now = performance.now();
  return ['inspect', 'arming', 'ready', 'running'].includes(timer.state) || (ui.reaction && now < ui.reaction.until) || (ui.coach && now < ui.coach.until);
}

function frame() {
  timer.tick();
  paintLive();
  if (needsFrame()) requestAnimationFrame(frame);
  else ui.looping = false;
}

function kick() {
  if (ui.looping) return;
  ui.looping = true;
  requestAnimationFrame(frame);
}

function mountCentro() {
  slot.innerHTML = renderCentro({
    theme: theme(),
    finish: state.finish,
    topLit: achievedIds(state.solves, Date.now()).length,
    sideLit: state.trail.filter(Boolean).length,
    label: 'Centro',
  });
  ui.sig = '';
}

// ---------- Telas ----------
function renderTimerScreen() {
  const last = lastSolve();
  const idx = last ? state.solves.indexOf(last) : -1;
  const sess = sessionSolves();
  renderTimer({
    root: screens.timer,
    state,
    session: sess,
    last,
    history: idx >= 0 ? state.solves.slice(0, idx) : [],
    number: last ? sess.indexOf(last) + 1 : 0,
    kind: ui.lastKind,
    showResult: ui.showResult && timer.state === 'done',
    scramble: currentScramble(),
    now: Date.now(),
  });
}

function renderAll() {
  const now = Date.now();
  $('[data-session-pill]').textContent = `3×3 · ${sessionName()} ▾`;
  $('[data-date]').textContent = dateLabel(now);
  if (ui.tab === 'timer') renderTimerScreen();
  if (ui.tab === 'evolucao') renderEvolucao({ root: screens.evolucao, solves: state.solves, sessions: state.sessions, sessionFilter: ui.evoSession, period: ui.period, now });
  if (ui.tab === 'companion') renderCompanion({ root: screens.companion, milestones: milestoneProgress(state.solves, now), trail: state.trail, finish: state.finish, preview: ui.preview, silent: state.settings.silent, theme: theme() });
  if (ui.tab === 'ajustes') renderAjustes({ root: screens.ajustes, settings: state.settings, confirm: ui.confirm });
  mountCentro();
  ui.text = '';
  ui.coachText = null;
  paintLive();
}

function go(tab) {
  if (!TABS.includes(tab)) return;
  ui.tab = tab;
  for (const t of TABS) screens[t].hidden = t !== tab;
  document.querySelectorAll('[data-tab]').forEach((b) => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  renderAll();
}

// ---------- Solves ----------
function handleSolve(ms, penalty) {
  const now = Date.now();
  const history = state.solves;
  const sessionBefore = sessionSolves();
  const before = achievedIds(history, now);
  const { state: next, solve } = store.addSolve(state, { ms, penalty, at: now, scramble: currentScramble() });
  const after = achievedIds(next.solves, now);
  const fresh = after.filter((id) => !before.includes(id));
  const msg = pickCoachMessage({
    solve,
    history,
    sessionSolves: sessionBefore,
    newMilestones: fresh,
    achievedCount: after.length,
    dailyGoal: state.settings.dailyGoal,
    silent: state.settings.silent,
  });
  const kind = resultKind(history, solve);
  const t0 = performance.now();
  ui.lastId = solve.id;
  ui.lastKind = kind;
  ui.showResult = true;
  ui.scramble += 1;
  ui.reaction = { kind, from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + REACTION_MS };
  ui.coach = msg ? { text: msg.text, from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + COACH_MS } : null;
  if (kind === 'pb') {
    setTimeout(() => {
      if (ui.reaction && ui.reaction.kind === 'pb' && timer.state === 'done') sound.chord();
    }, REACTION_DELAY);
  }
  announce(`${T.aria.final(formatSolve(solve))}${msg ? ` ${msg.text}` : ''}`);
  commit(next);
  document.querySelector('[data-heat] .today')?.classList.add('pop');
  kick();
}

function act(name) {
  const last = lastSolve();
  if (!last || timer.state !== 'done' || !ui.showResult) return;
  if (name === 'plus2' || name === 'dnf') {
    const next = store.togglePenalty(state, last.id, name === 'plus2' ? '+2' : 'DNF');
    const idx = next.solves.findIndex((x) => x.id === last.id);
    ui.lastKind = resultKind(next.solves.slice(0, idx), next.solves[idx]);
    commit(next);
    announce(T.aria.final(formatSolve(next.solves[idx])));
  } else if (name === 'note') {
    noteForm.hidden = false;
    noteForm.note.value = last.note || '';
    noteForm.note.focus();
  } else if (name === 'delete') {
    const { state: next, removed } = store.deleteSolve(state, last.id);
    ui.removed = removed;
    ui.showResult = false;
    ui.reaction = null;
    ui.coach = null;
    state = next;
    ui.lastId = lastOfSession()?.id ?? null;
    save();
    renderAll();
    showToast(T.toast.deleted, { action: T.toast.undo, onAction: undo });
  }
}

function undo() {
  if (!ui.removed) return;
  const r = ui.removed;
  ui.removed = null;
  ui.lastId = r.solve.id;
  hideToast();
  commit(store.restoreSolve(state, r));
}

function resetUi() {
  timer.reset();
  ui.showResult = false;
  ui.reaction = null;
  ui.coach = null;
  ui.removed = null;
  ui.lastId = lastOfSession()?.id ?? null;
  ui.scramble = state.solves.length;
}

// ---------- Eventos do timer ----------
timer.on('state', (next) => {
  body.dataset.tstate = next;
  body.classList.toggle('solving', next === 'running');
  if (next === 'ready') sound.klick();
  if (next === 'inspect' || next === 'arming') {
    ui.reaction = null;
    ui.coach = null;
    ui.showResult = false;
    noteForm.hidden = true;
    renderTimerScreen();
  }
  kick();
});
timer.on('warn', () => sound.tick());
timer.on('done', ({ ms, penalty }) => {
  sound.klick();
  handleSolve(ms, penalty);
});

// ---------- Entrada: teclado ----------
const typing = (e) => e.target instanceof Element && e.target.closest('input, textarea, select');
const dialogOpen = () => Boolean(document.querySelector('dialog[open]'));

function wake() {
  ui.lastInput = Date.now();
  if (ui.sleeping) {
    ui.sleeping = false;
    paintLive();
  }
}

document.addEventListener('keydown', (e) => {
  wake();
  if (dialogOpen()) return;
  if (timer.state === 'running') {
    e.preventDefault();
    timer.press();
    kick();
    return;
  }
  if (typing(e)) {
    if (e.key === 'Escape') {
      noteForm.hidden = true;
      e.target.blur();
    }
    return;
  }
  if (e.code === 'Space') {
    if (ui.tab !== 'timer') return;
    e.preventDefault();
    if (!e.repeat) {
      sound.unlock();
      timer.press();
      kick();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '?') return openShortcuts();
  if (/^[1-4]$/.test(e.key)) return go(TABS[Number(e.key) - 1]);
  if (ui.tab !== 'timer' || timer.state === 'inspect') return;
  const k = e.key.toLowerCase();
  if (k === 'p') act('plus2');
  else if (k === 'd') act('dnf');
  else if (k === 'm') {
    e.preventDefault();
    act('note');
  } else if (e.key === 'Backspace') act('delete');
  else if (k === 'z') undo();
  else if (k === 'n') {
    ui.scramble += 1;
    renderTimerScreen();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code !== 'Space' || ui.tab !== 'timer' || typing(e) || dialogOpen()) return;
  e.preventDefault();
  timer.release();
  kick();
});

// ---------- Entrada: toque e clique ----------
// Com o timer rodando, qualquer toque para (como no stackmat) e o clique que viria em seguida é engolido.
document.addEventListener(
  'pointerdown',
  (e) => {
    wake();
    sound.unlock();
    if (timer.state === 'running' && !e.target.closest('[data-zone]')) {
      e.preventDefault();
      ui.swallowClick = true;
      timer.press();
      kick();
    }
  },
  true,
);
document.addEventListener(
  'click',
  (e) => {
    if (!ui.swallowClick) return;
    ui.swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

const zones = $('[data-zones]');
const zoneOf = new Map();
zones.addEventListener('contextmenu', (e) => e.preventDefault());
zones.addEventListener('pointerdown', (e) => {
  const z = e.target.closest('[data-zone]');
  if (!z) return;
  e.preventDefault();
  try {
    z.setPointerCapture(e.pointerId);
  } catch {
    /* captura é só conforto; sem ela o toque funciona igual */
  }
  zoneOf.set(e.pointerId, z);
  z.classList.add('down');
  touch.down(e.pointerId, z.dataset.zone);
  kick();
});
const lift = (e) => {
  const z = zoneOf.get(e.pointerId);
  if (!z) return;
  zoneOf.delete(e.pointerId);
  if (![...zoneOf.values()].includes(z)) z.classList.remove('down');
  touch.up(e.pointerId);
  kick();
};
zones.addEventListener('pointerup', lift);
zones.addEventListener('pointercancel', lift);

noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const last = lastSolve();
  noteForm.hidden = true;
  if (last) commit(store.setNote(state, last.id, noteForm.note.value.trim()));
});

function sessionsDialog() {
  const counts = {};
  for (const x of state.solves) counts[x.session] = (counts[x.session] || 0) + 1;
  openSessions({
    sessions: state.sessions,
    current: state.currentSession,
    counts,
    onPick: (id) => {
      state = { ...state, currentSession: id };
      resetUi();
      save();
      renderAll();
    },
    onCreate: (name) => {
      state = store.createSession(state, name);
      resetUi();
      save();
      renderAll();
    },
    onRename: (name) => commit(store.renameSession(state, state.currentSession, name)),
  });
}

function pickFinish(f) {
  const done = achievedIds(state.solves, Date.now()).length;
  if (f === 'fosco' || (f === 'brilho' && done === 9)) {
    ui.preview = null;
    commit({ ...state, finish: f });
    return;
  }
  ui.preview = f; // bloqueado: mostra uma prévia por 3 s
  renderAll();
  setTimeout(() => {
    if (ui.preview === f) {
      ui.preview = null;
      renderAll();
    }
  }, 3000);
}

function exportData() {
  try {
    const data = { app: 'klick-prototype', exportedAt: new Date().toISOString(), sessions: state.sessions, solves: state.solves };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `klick-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    showToast(T.toast.exportFail);
  }
}

function onboarding(mode) {
  openOnboarding({
    theme: theme(),
    holdMs: Math.max(300, state.settings.holdMs),
    mode,
    onExample: () => commit({ ...state, onboarded: true }),
    onFresh: () => {
      state = { ...store.emptyState(), settings: state.settings, onboarded: true };
      resetUi();
      save();
      renderAll();
    },
  });
}

function dataAction(id) {
  if (id === 'export') return exportData();
  if (id === 'onboarding') return onboarding('review');
  if (ui.confirm !== id) {
    ui.confirm = id;
    renderAll();
    setTimeout(() => {
      if (ui.confirm === id) {
        ui.confirm = null;
        renderAll();
      }
    }, 4000);
    return;
  }
  ui.confirm = null;
  const fresh = id === 'seed' ? store.seededState(Date.now()) : store.emptyState();
  state = { ...fresh, settings: state.settings, onboarded: true };
  resetUi();
  save();
  renderAll();
}

function applySetting(patch) {
  state = store.updateSettings(state, patch);
  save();
  applyPrefs();
  renderAll();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) return go(t.dataset.tab);
  const a = e.target.closest('[data-act]');
  if (a) return act(a.dataset.act);
  if (e.target.closest('[data-session-pill]')) return sessionsDialog();
  const per = e.target.closest('[data-period]');
  if (per) {
    ui.period = per.dataset.period;
    return renderAll();
  }
  const fin = e.target.closest('[data-finish]');
  if (fin) return pickFinish(fin.dataset.finish);
  const tr = e.target.closest('[data-trail]');
  if (tr) {
    const trail = [...state.trail];
    trail[Number(tr.dataset.trail)] = !trail[Number(tr.dataset.trail)];
    return commit({ ...state, trail });
  }
  const set = e.target.closest('[data-set]');
  if (set) return applySetting({ [set.dataset.set]: set.dataset.set === 'holdMs' ? Number(set.dataset.val) : set.dataset.val });
  const data = e.target.closest('[data-data]');
  if (data) return dataAction(data.dataset.data);
});

document.addEventListener('change', (e) => {
  const tg = e.target.closest('[data-toggle]');
  if (tg) {
    const key = tg.dataset.toggle;
    return applySetting(key.startsWith('sound.') ? { sound: { [key.slice(6)]: tg.checked } } : { [key]: tg.checked });
  }
  if (e.target.matches('[data-silent]')) return applySetting({ silent: e.target.checked });
  if (e.target.matches('[data-evo-session]')) {
    ui.evoSession = e.target.value;
    renderAll();
  }
});

// Órbita do adesivo ocioso e sono depois de 5 min parado.
setInterval(() => {
  if (!ui.sleeping && Date.now() - ui.lastInput > SLEEP_AFTER && (timer.state === 'idle' || timer.state === 'done')) {
    ui.sleeping = true;
    paintLive();
  }
  if (!document.hidden && centroView().state === 'idle' && !reduced()) {
    ui.orbit += 1;
    paintLive();
  }
}, ORBIT_MS);

for (const mq of [mqDark, mqReduce, mqCoarse]) {
  mq.addEventListener('change', () => {
    applyPrefs();
    renderAll();
  });
}

applyPrefs();
go('timer');
if (firstRun || !state.onboarded) onboarding('first');
```

- [ ] **Step 3: Rodar a suíte inteira**

Run: `cd prototype && npm test`
Expected: PASS, 73 testes, 0 falhas.

- [ ] **Step 4: Servir e abrir**

Run (deixe rodando): `cd prototype && python3 -m http.server 4173 --bind 127.0.0.1`

Abra `http://localhost:4173/` com a página **visível**. O `requestAnimationFrame` não roda em aba oculta, e aí o armar não avança.

Expected:
- O console fica sem erros.
- A "Primeira vez" abre centralizada.
- No passo 2, segurar espaço enche o anel de vermelho e depois fica verde. Ao soltar, o texto diz "É assim que larga." e o botão Continuar fica habilitado.
- No passo 3, "Explorar com dados de exemplo" fecha o diálogo.

- [ ] **Step 5: Critérios de aceite da spec 8.5 (desktop)**

Faça e confira cada item:

1. **Com a inspeção ligada (padrão):**
   - Apertar e soltar espaço mostra a contagem **15** e o anel em branco esvaziando.
   - Segurar espaço deixa o tempo vermelho e o anel enche no sentido horário; em 0,3 s tudo fica verde.
   - Soltar inicia o solve: a interface apaga para 8% e o Centro fica com os olhos fechados, imóvel.
   - Qualquer tecla para o timer.
2. **Avisos da inspeção:** na inspeção, espere passar dos 8 s e dos 12 s. O número fica âmbar e depois laranja, com um tique a cada aviso. Largando depois de 15 s, o resultado é `+2`; depois de 17 s, `DNF`.
3. **Resultado:**
   - Cerca de 0,5 s depois do tempo, o anel reage: 6 verdes abaixo da média de 5, 3 âmbar acima dela, ou as 6 cores no recorde.
   - A reação some em cerca de 2,5 s.
   - No recorde: tempo dourado, chip "◆ … abaixo do recorde", etiqueta "Novo recorde" e acorde.
4. **Ações:**
   - `P` e `D` ligam e desligam +2 e DNF, e o chip e o tempo mudam.
   - `M` abre a nota; Enter salva.
   - `⌫` exclui e mostra o aviso "Solve excluído · Desfazer (Z)", e `Z` restaura.
   - `N` troca o embaralhamento; `?` abre os atalhos; `1` a `4` trocam de aba.
5. **Evolução:** os indicadores mostram recorde 0:54.10, médias e desvio. O gráfico mostra pontos, a linha da média de 5 e losangos dourados nos recordes. Os períodos 7, 30 e Tudo mudam o gráfico.
6. **Centro:**
   - Mostra 6 dourados em cima e 4 azuis do lado.
   - "já sei" acende a trilha.
   - Clicar em "Gelo" mostra uma prévia por 3 s.
   - O modo silencioso tira o texto do coach, mas o anel continua reagindo.
7. **Ajustes:**
   - O tema Noite muda tudo, inclusive o brilho no anel do Centro.
   - Desligar a inspeção faz segurar espaço armar direto.
   - O tempo para armar de 1 s fica visivelmente mais lento.
   - "Reduzir movimento: Sempre" para a órbita e o piscar.
8. **Leitor de tela:** após um solve, o elemento `[data-live]` contém "Tempo final: …" seguido da mensagem do coach, quando houver.

- [ ] **Step 6: Review Focus 1, 2 e 5 (teclado e clique)**

1. Clique na aba "Timer" e aperte espaço. O timer arma e a aba não é acionada de novo; repita com o foco num botão de ação (+2). Pinta o item 1.
2. Abra a nota (`M`) e digite `p d z n` e um espaço. O texto entra no campo, nenhuma penalidade muda, nada é desfeito, o embaralhamento não troca e o timer não arma. `Esc` fecha. Pinta o item 2.
3. Com o timer rodando, clique na aba "Evolução". O timer para e você continua no Timer. Pinta o item 5.

- [ ] **Step 7: Review Focus 4 (começar do zero) e sessões**

1. Em Ajustes, clique em "Apagar tudo" duas vezes. O Timer mostra "—" nas médias.
2. Faça um solve. O coach diz "Primeiro solve registrado. Marco 1 de 9.", não há comemoração de recorde, e a face de cima do Centro ganha 1 dourado. Pinta o item 4.
3. Restaure com "Dados de exemplo", clicando duas vezes.
4. Na pílula de sessão, crie "Treino de cruz": as médias zeram. Volte para "Sessão 12".

- [ ] **Step 8: Celular emulado**

No DevTools, ative a emulação de dispositivo com toque (iPhone, 375×812) e recarregue.

1. Com a inspeção desligada:
   - Um polegar só (zona esquerda) não arma.
   - As duas zonas armam; o primeiro polegar que sai larga.
   - Um toque em qualquer lugar para.
2. Com a inspeção ligada: um toque inicia a inspeção, e as duas zonas armam.
3. "Armar no celular: Um toque" deixa uma zona só.
4. Layout: as zonas ocupam a largura toda, a barra de abas fica embaixo, não há rolagem horizontal, e as dicas de tecla somem dos botões.

- [ ] **Step 9: Commit**

```bash
git add prototype/index.html prototype/scripts/app.js
git commit -m "feat(prototipo): página e integração do timer, Centro, coach e telas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Publicar o link privado e registrar

**Files:**
- Create: `prototype/README.md`
- Modify: `README.md` (raiz do repo, para linkar o protótipo)
- Modify: `~/Projetos/pessoal/second-brain/10-projects/Reconstruir o Klick.md` (fora do repo)

**Interfaces:**
- **Consumes:** o protótipo completo (Task 10).
- **Produces:** um link privado no claude.ai, para abrir no celular.

- [ ] **Step 1: Escrever o README do protótipo**

`prototype/README.md`:

```markdown
# Protótipo do Klick v2

Protótipo interativo do sub-projeto 1 (spec: `../docs/superpowers/specs/2026-10-08-klick-design.md`). HTML, CSS e JS puros, sem build.

## Rodar

    cd prototype
    python3 -m http.server 4173 --bind 127.0.0.1

Abra http://localhost:4173/. Precisa ser por HTTP (ES modules não abrem via `file://`).

## Testar

    cd prototype
    npm test

73 testes com o runner nativo do Node (≥ 20), sem dependências.

## O que é de mentira

- Os 212 solves de exemplo são fictícios (`scripts/data.js`); "Ajustes → Começar do zero" apaga tudo.
- Os embaralhamentos vêm de uma lista fixa de 40 (random-state, gerados com cubing.js 0.63.4). O gerador real entra no sub-projeto 2.
- Os dados ficam no `localStorage` deste navegador, só por conveniência.
```

E acrescente ao `README.md` da raiz, abaixo da lista existente:

```markdown
- Protótipo interativo: [`prototype/`](prototype/) (como rodar em `prototype/README.md`)
```

- [ ] **Step 2: Rodar a suíte inteira uma última vez**

Run: `cd prototype && npm test`
Expected: PASS, 73 testes.

- [ ] **Step 3: Publicar como link privado**

Use a ferramenta **Artifact**. Antes, carregue a skill `artifact-design`, como a ferramenta exige.

Publique assim:
- `file_path`: `prototype/index.html`
- `files`: um mapa com o mesmo caminho relativo de cada arquivo:
  - `styles/tokens.css`, `styles/base.css`, `styles/components.css` e `styles/screens.css`
  - os 11 arquivos de `scripts/*.js` (com `scripts/scrambles.js`)
  - os 7 arquivos de `scripts/ui/*.js`
- `icon`: `timer`
- `description`: "Protótipo interativo do Klick v2: timer com o Centro, coach e evolução."

Os testes, o `package.json` e os READMEs não são publicados.

- [ ] **Step 4: Conferir o link (inclui o Review Focus 3)**

Abra o link publicado.

Expected:
- A página carrega com as fontes Geist.
- O timer funciona.
- O console não mostra erro de módulo.
- Se o iframe bloquear o `localStorage`, o app funciona em memória sem erro. Pinta o item 3.

Abra o link no celular de verdade e repita o Task 10, Step 8, itens 1 e 2. Anote a regra de largada que pareceu natural: o primeiro polegar que sai, ou os dois. A spec 10 pede essa decisão.

- [ ] **Step 5: Commit**

```bash
git add prototype/README.md README.md
git commit -m "docs(prototipo): como rodar, testar e o que é de mentira" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Registrar no vault**

Em `~/Projetos/pessoal/second-brain/10-projects/Reconstruir o Klick.md`:

1. Marque como feitas `- [x] Escrever o plano de implementação do protótipo` e `- [x] Construir e publicar o protótipo num link privado`.
2. Acrescente o link publicado em **Recursos / referências**.
3. Adicione uma linha no **Log** com a data, o link e a decisão sobre a regra de largada.

O vault faz commit e push sozinho pelo obsidian-git, então não é preciso commit manual.
