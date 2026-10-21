# Estatísticas que ensinam — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na Evolução, as últimas 12 semanas (com o resumo de 28 dias), o ano de treino num calendário com as sequências, e metas próprias (single, ao5, ao12 por evento) sincronizadas com a conta e comemoradas pelo Centro; em Ajustes › Timer, a meta do dia.

**Architecture:** O núcleo ganha três módulos puros: `core/weeks.ts` (semanas e resumo, sobre o `pool` que a Evolução já calcula), `core/year.ts` (o calendário de todos os eventos, com memória de uma entrada) e `core/goals.ts` (a meta, a validação, o alcance e o estado). As metas viram a família `goal.<id>` do catálogo de ajustes da conta (`prefs.ts`), como `lessonAt.*`: o padrão é `null`, que apaga. O Timer confere o alcance no mesmo passo do coach, grava a data e passa a meta ao `pickCoachMessage`. A Evolução ganha três quadros e uma folha.

**Tech Stack:** Svelte 5 (runes), TypeScript strict, `idb`, Cloudflare Worker + DO SQLite (só aceita as chaves novas), Vitest (jsdom e Workers), Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-10-21-klick-estatisticas-design.md` · **Maquete aprovada:** `docs/design/2026-10-21-estatisticas-maquete.html` (respostas do Ranielli: ao alcançar, só a mensagem do Centro; tempos com ponto; a meta guarda o melhor de quando nasceu, para a barra). A maquete pesa 765 KB (fontes embutidas): o controlador deixa no workspace do SDD `maquete-es.css` (as regras `es-*`) e `frames/<quadro>.html` (o HTML de cada quadro, de `1a` a `7f`, sem estilo e com as células do calendário resumidas). Leia esses, não a maquete inteira.

## Global Constraints

- A maquete aprovada é fiel: portar peça por peça (as classes `es-*` viram componentes e CSS do app, em `src/styles/screens.css`), sem "melhorar"; nenhuma cor nova, tudo de `tokens.css`. Conferir lado a lado antes de entregar.
- Fuso do aparelho (como `dayKey`, `monthHeat` e `currentStreak`); semana de segunda 00:00 a domingo; dias de calendário pelo meio-dia (`setDate`), nunca somando 86 400 000 ms, por causa do horário de verão.
- Tempos com ponto: `formatMs` para tempos ("0:13.71"), e o `sec(ms)` de `strings.ts` para diferenças ("0.42 s"). Datas com `shortDate`/`fullDate` de `ui/format.ts`. Milhar com ponto ("2.287").
- Metas: chave `goal.<id>`, id de 2 caracteres `[0-9a-z]` (1.296 vagas: o número de registros por conta fica limitado, como o resto do catálogo); valor `Goal` validado estrito (exatamente as seis chaves) ou `null` (o padrão, que apaga). No máximo `GOAL_MAX = 6` vivas, só no app; o servidor aceita qualquer número de vagas válidas. Alcançar é ficar **abaixo** do alvo (`valor < targetMs`). ao5 e ao12 são sempre `rollingAverages` (corte de 5%), em todos os eventos, sobre os solves do evento em todas as sessões, em ordem cronológica.
- `reachedAt` não volta atrás; uma meta que já nasce alcançada leva a data do primeiro solve que a alcançou e não comemora; só o aparelho do solve comemora (o Timer), uma vez, no lugar da mensagem de recorde (depois só do fim de temporada).
- Nada novo no servidor além de `isPrefValue` aceitar `goal.*` (o Worker importa o mesmo `src/core/sync/prefs.ts`); sem migração de D1. A cópia (arquivo, nuvem, restauração do aparelho) leva as metas; uma cópia de antes delas (sem `goals` no perfil) não apaga as metas de agora.
- Funciona sem rede e sem conta. axe passa em tudo o que é novo (claro e Noite). O calendário é desenho (`aria-hidden`) com um texto para leitor de tela.
- Textos novos em `src/strings.ts`, nas seções novas `T.semanas`, `T.metas`, `T.constancia` e nas existentes (`T.ajustes`, `T.coach`), com o texto exato da maquete (citado nas tasks). Comentários em português, na densidade dos vizinhos.
- Comandos (de `app/`): unit `./node_modules/.bin/vitest run --testTimeout=30000 --maxWorkers=4` (a máquina está carregada; um arquivo que falha só por tempo roda de novo sozinho); Worker `./node_modules/.bin/vitest run -c vitest.worker.config.ts`; check `pnpm --config.verify-deps-before-run=false check`; e2e `./node_modules/.bin/playwright test`; sync e2e `./node_modules/.bin/playwright test -c playwright.sync.config.ts`. Commits com escopo `estatisticas`. Nada de push nem deploy. Ao terminar, matar o que o agente subiu (vite, wrangler, esbuild).

## Review Focus

1. **Cópia de antes das metas:** restaurar (do aparelho ou da nuvem) uma cópia sem `goals` mantém as metas de agora; uma cópia com `goals: {}` as apaga. Testes na Task 3.
2. **Meta alcançada fora deste aparelho:** solves importados ou do sync deixam a meta abaixo do alvo sem `reachedAt`; ela aparece alcançada com a data do primeiro solve que chegou, e um solve novo aqui não comemora (grava a data antiga). Teste na Task 2.
3. **Virada da semana e do dia:** um solve no domingo às 23:59 é da semana anterior ao de segunda às 00:00; semana só de DNF mostra "3 solves · 3 DNF", média e melhor "—". Testes na Task 1.
4. **Valor torto do sync:** `goal.abc` (id longo), uma chave a mais no objeto, `targetMs` 0 ou 3 600 000, evento desconhecido: o servidor recusa e o app ignora. Testes na Task 3.
5. **Sete metas pelo sync:** todas aparecem, "Nova meta" fica desligado com o motivo, e `saveGoal` recusa criar. Testes nas Tasks 4 e 7.

---

### Task 1: O núcleo das semanas e do ano

**Files:**
- Create: `app/src/core/weeks.ts`, `app/src/core/year.ts`
- Modify: `app/src/core/stats.ts` (extrair `heatLevel` de `monthHeat`)
- Test: `app/tests/unit/weeks.test.ts` (novo), `app/tests/unit/year.test.ts` (novo), `app/tests/unit/stats.test.ts`

**Interfaces:**
- Produces (`core/weeks.ts`):
  - `WEEKS = 12`; `weekStart(ts: number): number` (segunda 00:00 local).
  - `weekMean(solves: readonly Solve[]): number | null` — os não-DNF (`effectiveMs` finito), `trimmedMean`; `null` com menos de 5.
  - `interface WeekRow { start: number; current: boolean; count: number; dnf: number; mean: number | null; best: number | null; change: number | null }` — `change` = `mean − mean da semana anterior` (negativo é mais rápida; 0 é "igual"); `null` se falta uma das duas.
  - `weekRows(pool: readonly Solve[], nowTs: number, count = WEEKS): WeekRow[]` — da semana atual para trás; sem as semanas de antes da semana do primeiro solve do `pool`; `[]` quando nenhuma das `count` tem solve. A mais antiga compara com a semana anterior a ela (calculada, não devolvida).
  - `periodSummary(pool: readonly Solve[], nowTs: number): number | null` — `weekMean` dos últimos 28 dias (hoje e os 27 anteriores) menos a dos 28 antes deles; `null` se falta uma.
- Produces (`core/year.ts`):
  - `YEAR_WEEKS = 53`; `interface YearDay { ts: number; count: number; level: 0 | 1 | 2 | 3; today: boolean; future: boolean }` (`ts` ao meio-dia).
  - `interface Streak { days: number; from: number | null; to: number | null }`.
  - `interface YearCalendar { start: number; weeks: YearDay[][]; daysTrained: number; periodDays: number; solves: number; current: Streak; best: Streak; months: { ts: number; days: number; solves: number }[] }` — `weeks`: 53 colunas de 7 dias (seg..dom), a última é a semana de hoje; `start` é a segunda da primeira; os totais contam de `start` até hoje (`periodDays` inclusive: 367 em 21/10/2026); `current` como `currentStreak` (termina hoje ou ontem) com as datas; `best` a maior de todo o histórico (empate: a mais recente); `months` cada mês tocado por `[start, hoje]`, do mais antigo.
  - `yearCalendar(solves: readonly Solve[], nowTs: number): YearCalendar` — todos os eventos e sessões; memória de uma entrada pela identidade do array e o `dayKey` de `nowTs`.
- Produces (`core/stats.ts`): `heatLevel(count: number): 0 | 1 | 2 | 3` (0; 1–4; 5–14; 15+), usado por `monthHeat` e `yearCalendar`.

- [ ] **Step 1: Testes que falham** — `weeks.test.ts` (datas com `new Date(a, m, d, h)`, fuso local): `'weekStart leva domingo 23:59 para a segunda anterior e segunda 00:00 para ela mesma'`; `'weekMean tira os DNF antes do corte e pede 5'` (4 tempos + 2 DNF → null; 5 tempos 10/11/12/13/50 s → 12000); `'weekRows: a semana atual primeiro, current, DNF à parte e melhor sem DNF'`; `'semana só de DNF: count 3, dnf 3, mean e best null'`; `'semana vazia no meio aparece com count 0; as de antes do primeiro solve não'`; `'change compara com a semana anterior, inclusive a mais antiga com a 13ª'`; `'change null quando a anterior não tem média'`; `'nenhum solve nas 12 semanas devolve []'`; `'periodSummary: últimos 28 contra os 28 anteriores, null sem média num deles'`. `year.test.ts`: `'53 colunas de 7, a última é a semana de hoje, os dias depois de hoje são future'`; `'periodDays é 367 em 21/10/2026 e start é a segunda 20/10/2025'`; `'níveis 1–4, 5–14, 15+ e o anel de hoje'`; `'current termina ontem quando hoje não tem solve, com from e to'`; `'best é a maior do histórico inteiro, a mais recente no empate'`; `'months: um por mês tocado, com dias e solves'`; `'a mesma lista no mesmo dia devolve o mesmo objeto'`. `stats.test.ts`: `'heatLevel nos limites 0, 1, 4, 5, 14, 15'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces; `monthHeat` passa a usar `heatLevel` sem mudar o resultado.
- [ ] **Step 4: Rode e confira que passam** — os três arquivos e o check → PASS.
- [ ] **Step 5: Commit** — `feat(estatisticas): semanas, resumo de 28 dias e o calendário do ano no núcleo`.

---

### Task 2: O núcleo das metas e a mensagem do Centro

**Files:**
- Create: `app/src/core/goals.ts`
- Modify: `app/src/core/coach.ts`, `app/src/strings.ts` (`T.metas` com os nomes; `T.coach.goalReached`)
- Test: `app/tests/unit/goals.test.ts` (novo), `app/tests/unit/coach.test.ts`

**Interfaces:**
- Produces (`core/goals.ts`):
  - `type GoalKind = 'single' | 'ao5' | 'ao12'`; `interface Goal { kind: GoalKind; event: EventId; targetMs: number; startMs: number | null; createdAt: number; reachedAt: number | null }`; `GOAL_MAX = 6`; `GOAL_ID = /^[0-9a-z]{2}$/`; `GOAL_TARGET_MAX = 3_599_999`.
  - `isGoal(v: unknown): v is Goal` — objeto com exatamente as seis chaves; `kind` dos três; `event` em `EVENT_IDS`; `targetMs` inteiro de 1 a `GOAL_TARGET_MAX`; `startMs` `null` ou inteiro ≥ 1; `createdAt` inteiro ≥ 0; `reachedAt` `null` ou inteiro ≥ 0.
  - `freeGoalId(taken: ReadonlySet<string>, rand: () => number = Math.random): string` — sorteia entre as 1.296 vagas fora de `taken`.
  - `parseGoalTarget(text: string): { ok: true; ms: number } | { ok: false; reason: 'empty' | 'bad' | 'range' }` — segundos como se fala: "15" → 15000, "14.5" e "14,5" → 14500, "90" → 90000, "1:30" → 90000, "1:02.5" → 62500; até duas casas; espaços nas pontas não contam; "" → `empty`; "12..5", "abc", "0" → `bad`; "3600" e "60:00" → `range`.
  - `formatTarget(ms: number): string` — abaixo de um minuto, segundos sem zeros à direita com " s" ("13 s", "12.5 s"); de um minuto para cima, "1:00", "1:30", "1:02.5".
  - `goalName(g: Pick<Goal, 'kind' | 'targetMs'>): string` ("Média de 12 abaixo de 13 s", "Single abaixo de 11 s") e `goalPhrase(g)` (a mesma em minúscula: "média de 12 abaixo de 13 s", "single abaixo de 11 s").
  - `goalBest(eventSolves: readonly Solve[], kind: GoalKind): number | null` (`bestSingle` ou `bestAverage(…, 5|12)`).
  - `firstReach(eventSolves: readonly Solve[], kind: GoalKind, targetMs: number): number | null` — o `at` do primeiro solve cujo valor (o single, ou a média que termina nele) fica abaixo do alvo.
  - `makeGoal(input: { kind: GoalKind; event: EventId; targetMs: number }, eventSolves: readonly Solve[], now: number): Goal` — `startMs = goalBest`, `reachedAt = firstReach`, `createdAt = now`.
  - `remakeGoal(old: Goal, input, eventSolves, now): Goal` — tipo, evento e alvo iguais devolvem `old`; senão `makeGoal` com o `createdAt` de `old`.
  - `interface GoalStatus { best: number | null; reachedAt: number | null; start: number | null; progress: number; left: number | null }` e `goalStatus(goal: Goal, eventSolves: readonly Solve[]): GoalStatus` — `reachedAt = goal.reachedAt ?? firstReach(…)`; `start = goal.startMs ?? o primeiro valor finito da série`; `progress` 1 se alcançada, 0 sem `best` ou sem `start` ou com `start ≤ targetMs`, senão `(start − best) / (start − targetMs)` entre 0 e 1; `left = best − targetMs` (`null` sem `best` ou alcançada).
  - `goalsReachedBy(goals: Readonly<Record<string, Goal>>, history: readonly Solve[], solve: Solve): { id: string; at: number; celebrate: boolean }[]` — `history` são os anteriores do evento do solve (o `eventList` do Timer). Para cada meta do evento sem `reachedAt` cujo valor depois do solve fica abaixo do alvo: `firstReach(history)` nulo dá `{ at: solve.at, celebrate: true }`; senão `{ at: firstReach(history), celebrate: false }`. Na ordem de `createdAt`. Só calcula `firstReach` de quem ficou abaixo agora.
- Produces (`core/coach.ts`): `CoachInput.goal?: Pick<Goal, 'kind' | 'targetMs'> | null`; com ela, depois do fim de temporada e antes do recorde: `{ id: 'goal', text: T.coach.goalReached(goalPhrase(goal)) }` = "Meta alcançada: single abaixo de 11 s. Essa você escolheu e cumpriu.". Silencioso continua devolvendo `null`.

- [ ] **Step 1: Testes que falham** — `goals.test.ts`: `'isGoal aceita a meta e recusa chave a mais, alvo 0 e 3600000, evento desconhecido e NaN'`; `'freeGoalId nunca devolve uma vaga tomada'`; `'parseGoalTarget lê segundos como se fala'` (cada caso das Interfaces); `'formatTarget e goalName'` ("Média de 12 abaixo de 13 s", "Média de 5 abaixo de 1:00", "Single abaixo de 12.5 s"); `'firstReach da ao5 é o at do solve que fecha a primeira janela abaixo'`; `'DNF nunca alcança e +2 conta'`; `'makeGoal nasce alcançada com a data do primeiro solve que chegou'`; `'remakeGoal igual devolve a mesma; mudar o alvo refaz pelo histórico e guarda createdAt'`; `'goalStatus: progress 0.59 de 14.41 a 13.58 com alvo 13, left 580'`; `'goalStatus sem tempo: best, start e left null, progress 0'`; `'goalsReachedBy comemora o solve que chega primeiro'`; `'alcance que veio de fora (sem reachedAt): o solve novo não comemora e grava a data antiga'`; `'meta já alcançada ou de outro evento fica de fora'`. `coach.test.ts`: `'meta alcançada fala antes do recorde'`; `'silencioso não fala a meta'`; `'o fim da temporada vem antes da meta'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os dois arquivos e o check → PASS.
- [ ] **Step 5: Commit** — `feat(estatisticas): a meta no núcleo — validação, alcance, estado e a mensagem do Centro`.

---

### Task 3: As metas na conta, no sync e nas cópias

**Files:**
- Modify: `app/src/core/types.ts` (`Profile.goals: Record<string, Goal>`), `app/src/core/sync/prefs.ts`, `app/src/core/sync/limits.ts` (comentário: o número de chaves continua limitado), `app/src/core/sync/snapshot.ts` (`accountPrefsOf`), `app/src/data/repository.ts` (`defaultProfile`, import com merge, `replaceAll`), `app/src/data/transfer.ts` (`profileOf`), `app/src/ui/state/app.svelte.ts` (o perfil inicial)
- Test: `app/tests/unit/sync-records.test.ts`, `app/tests/unit/repository-prefs.test.ts`, `app/tests/unit/transfer.test.ts`, `app/tests/unit/repository-restore.test.ts`, `app/tests/unit/sync-snapshot.test.ts`, `app/tests/unit/restore-diff.test.ts`, `app/tests/worker/sync.test.ts`

**Interfaces:**
- Consumes: `Goal`, `isGoal`, `GOAL_ID` (Task 2).
- Produces:
  - `defaultPrefValue('goal.<id>') === null`; `isPrefValue('goal.<id>', v)` = `GOAL_ID` no sufixo e (`v === null` ou `isGoal(v)`).
  - `AccountProfile.goals`; `prefsFromProfile` emite `goal.<id>` por meta; `profileFromPrefs` junta as não nulas em `goals`; `splitProfile`/`joinProfile` levam o campo. Apagar uma meta é tirá-la do mapa: `writeProfile` grava `null` (já é o caminho de `lessonAt`).
  - Arquivo do Klick: `profileOf` lê `goals` (cada entrada com id e valor válidos; o resto sai). Importar com merge junta por id: a daqui vence, com o `reachedAt` mais antigo dos dois.
  - Restaurar: `replaceAll` (`kept`) e `accountPrefsOf` (a base) mantêm as metas de agora quando a cópia não tem `goals`; com `goals` (mesmo `{}`), a cópia vale.

- [ ] **Step 1: Testes que falham** — `sync-records.test.ts`: `'goal.<id> válida passa; id de 3 caracteres, chave a mais e alvo fora não'`; `'o round trip conta → itens → conta leva as metas, e null não vira meta'`. `repository-prefs.test.ts`: `'excluir uma meta grava null na chave dela e só nela'`; `'editar uma meta não regrava as outras'`. `transfer.test.ts`: `'o arquivo leva as metas e o import ignora a torta'`; `'importar com merge junta por id e fica com o reachedAt mais antigo'`. `repository-restore.test.ts`: `'restaurar cópia sem goals mantém as metas; com goals {} apaga'`. `sync-snapshot.test.ts` ou `restore-diff.test.ts`: `'accountPrefsOf de cópia sem goals não apaga as metas da conta'`. `tests/worker/sync.test.ts`: `'o Worker aceita goal.<id> e recusa o torto com valor inválido para a chave'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — a suíte unit inteira, a do Worker e o check → PASS.
- [ ] **Step 5: Commit** — `feat(estatisticas): as metas no catálogo da conta, no sync e nas cópias`.

---

### Task 4: Criar, editar e alcançar pelo app; a meta do dia em Ajustes

**Files:**
- Modify: `app/src/ui/state/app.svelte.ts`, `app/src/ui/timer/TimerScreen.svelte`, `app/src/ui/ajustes/AjustesScreen.svelte`, `app/src/strings.ts` (`T.ajustes`)
- Test: `app/tests/unit/app-goals.test.ts` (novo, no molde dos testes do `AppState` com repositório falso), `app/tests/unit/timer-screen.test.ts`, `app/tests/unit/ajustes-screen.test.ts`

**Interfaces:**
- Consumes: `makeGoal`, `remakeGoal`, `freeGoalId`, `goalsReachedBy`, `GOAL_MAX`, `CoachInput.goal` (Task 2); `Profile.goals` (Task 3).
- Produces (`AppState`), todas pela fila de escrita do perfil que a trilha já usa (`trailJob`), devolvendo `Promise<boolean>`:
  - `saveGoal(input: { id?: string; kind: GoalKind; event: EventId; targetMs: number }): Promise<boolean>` — sem `id` cria (recusa com 6 ou mais vivas); com `id`, `remakeGoal`. Os solves do evento saem de `this.solves`.
  - `deleteGoal(id: string): Promise<boolean>`.
  - `markGoalsReached(marks: readonly { id: string; at: number }[]): Promise<boolean>` — grava `reachedAt` só onde ainda é `null`.
- Timer: no `try` do coach de `finishSolve` (vale para cronômetro e Digitar; o desafio não chega ali), `goalsReachedBy(app.profile.goals, eventList, solve)`; com marcas, `markGoalsReached` sem esperar (erro vai para o `catch` dele, sem derrubar a reação); a primeira com `celebrate` vai como `goal` ao `pickCoachMessage`.
- Ajustes › Timer, última linha: "Meta do dia", legenda "Solves por dia, somando todos os eventos. O coach avisa quando você chega.", `.seg` com `aria-label="Meta do dia"` e os botões 10, 20, 30, 50, 100 (`T.ajustes.dailyGoalOptions`); um valor de antes fora deles entra na ordem dos números, marcado. Grava com `app.updateSettings({ dailyGoal: n })`.

- [ ] **Step 1: Testes que falham** — `app-goals.test.ts`: `'saveGoal cria com id de 2 caracteres, startMs do melhor e nasce alcançada sem comemorar'`; `'com 6 vivas (ou 7 do sync) saveGoal recusa criar e edita'`; `'deleteGoal tira a meta'`; `'markGoalsReached não troca uma data já gravada'`. `timer-screen.test.ts`: `'o solve que alcança a meta mostra "Meta alcançada: single abaixo de 11 s. Essa você escolheu e cumpriu." no lugar do recorde e grava reachedAt'`; `'no silencioso grava reachedAt e não fala'`; `'no Digitar também'`. `ajustes-screen.test.ts`: `'a meta do dia marca 20 e grava 50'`; `'um 35 de antes aparece entre 30 e 50, marcado'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os três arquivos, `coach.test.ts` e o check → PASS.
- [ ] **Step 5: Commit** — `feat(estatisticas): criar, editar e alcançar metas pelo app, e a meta do dia em Ajustes`.

---

### Task 5: O quadro Semanas na Evolução

**Files:**
- Create: `app/src/ui/evolucao/WeeksBoard.svelte`
- Modify: `app/src/ui/evolucao/EvolucaoScreen.svelte`, `app/src/ui/format.ts` (`weekLabel`), `app/src/styles/screens.css` (as regras `es-*` da semana e de `.es-grid`), `app/src/strings.ts` (`T.semanas`)
- Test: `app/tests/unit/weeks-board.test.ts` (novo), `app/tests/unit/evolucao-screen.test.ts`

**Interfaces:**
- Consumes: `weekRows`, `periodSummary`, `WeekRow` (Task 1); `bestSingle` (o losango de recorde).
- Produces:
  - `weekLabel(start: number): string` — "12–18 out"; meses diferentes "28 set–4 out" (meses de `T.date.monthsShort`).
  - `WeeksBoard` com `{ pool: readonly Solve[]; now: number }`; some com `weekRows` vazio.
  - Na Evolução, logo depois de `<PhasesBoard>`: `<div class="evo-grid es-grid">` com o card de Semanas (a Task 7 põe o de Metas ao lado: 2fr e 1fr no desktop, um embaixo do outro no celular).
- Texto exato: cabeçalho "Semanas" e "de seg a dom"; resumo "Nos últimos 28 dias, sua média caiu 0.42 s." / "subiu 0.42 s." / "ficou igual." (o número em `<b>`; sem dado, a linha some); colunas "Semana", "Solves", "Média", "Melhor", "Mudança" (só leitor de tela no celular); "Esta semana" na tinta; "41 solves · 2 DNF", "1 solve", "sem solves"; "melhor 0:11.92" (sem tempo, "—"); o losango com `aria-label="recorde"` quando o melhor da semana é o recorde do `pool`; mudança "▼ 0.18 s" + sr " mais rápida", "▲ 0.07 s" + sr " mais lenta", "igual", "—" (▼/▲ como os chips, sem verde nem vermelho; "igual" e "—" em cinza); nota "A média da semana deixa os DNF de fora e tira 5% de cada lado; com menos de 5 solves, fica “—”.". Tabela de papéis ARIA (`role="table"`, `row`, `cell`, `columnheader`), como a lista; no celular, duas linhas por semana (média e mudança em cima, solves e melhor embaixo), conforme a maquete.

- [ ] **Step 1: Testes que falham** — `weeks-board.test.ts`: `'Esta semana primeiro, com solves, DNF, média, melhor e mudança'`; `'semana vazia diz sem solves'`; `'o losango marca o recorde'`; `'resumo caiu, subiu e igual; some sem dado'`; `'sem solves nas 12 semanas o quadro some'`. `evolucao-screen.test.ts`: `'Semanas segue o evento e a sessão, não o período'`; `'Semanas vem depois de Fases e antes do gráfico'`. `format` (no arquivo de testes de format existente, ou em `weeks-board.test.ts`): `'weekLabel no mesmo mês e entre meses'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** portando o HTML e o CSS das semanas da maquete.
- [ ] **Step 4: Rode e confira que passam** — os arquivos e o check → PASS.
- [ ] **Step 5: Commit** — `feat(estatisticas): o quadro Semanas na Evolução`.

---

### Task 6: O ano de treino

**Files:**
- Create: `app/src/ui/evolucao/YearBoard.svelte`
- Modify: `app/src/ui/evolucao/EvolucaoScreen.svelte`, `app/src/styles/screens.css` (as regras `es-y*`, `es-tip`), `app/src/strings.ts` (`T.constancia`)
- Test: `app/tests/unit/year-board.test.ts` (novo), `app/tests/unit/evolucao-screen.test.ts`

**Interfaces:**
- Consumes: `yearCalendar`, `YearCalendar` (Task 1).
- Produces: `YearBoard` com `{ solves: readonly Solve[]; now: number }` (recebe `app.solves`, todos os eventos), na largura toda, logo depois do `.es-grid`.
- Texto exato: "Constância · todos os eventos" e "53 semanas"; dias "seg", "qua", "sex"; os meses de `T.date.monthsShort` sobre a coluna em que o mês começa; legenda "menos" … "mais"; números "Sequência atual" "6 dias" "desde 16/10", "Maior sequência" "23 dias" "10/08 a 01/09", "Dias treinados" "223 dias" "de 367" ("1 dia"; sequência 0 sem a linha de baixo); datas da maior sequência `shortDate` quando dentro do período do calendário, `fullDate` fora. Leitor de tela (a grade é `aria-hidden`): "Calendário de 20/10/2025 a 21/10/2026, todos os eventos: 223 dias com solves, 2.287 solves. Sequência atual: 6 dias. Maior sequência: 23 dias, de 10/08 a 01/09." e um item por mês, "outubro de 2025: nenhum solve" / "novembro de 2025: 17 dias, 132 solves". A dica do dia (toque e mouse; não abre tela): "31 solves · qua, 14/10/2026" ("1 solve", "nenhum solve"), no balão do aviso (`--ink` com texto em `--bg`); dia futuro sem dica. Os tons `--heat-0..3`, hoje com o anel, sem o dourado do recorde. Colunas esticam no desktop até 12 px; no celular a grade rola para o lado e abre na semana de hoje.

- [ ] **Step 1: Testes que falham** — `year-board.test.ts`: `'53 colunas, níveis e hoje com o anel'`; `'o texto do leitor com período, totais, sequências e um item por mês'`; `'a dica mostra a data e os solves do dia e some ao sair'`; `'maior sequência fora do período mostra o ano'`; `'conta todos os eventos, não o filtro'`. `evolucao-screen.test.ts`: `'o ano vem depois de Semanas e Metas e antes do gráfico'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** portando o HTML e o CSS do ano da maquete.
- [ ] **Step 4: Rode e confira que passam** — os arquivos e o check → PASS.
- [ ] **Step 5: Commit** — `feat(estatisticas): o ano de treino com as sequências`.

---

### Task 7: O quadro Metas e a folha da meta

**Files:**
- Create: `app/src/ui/evolucao/GoalsBoard.svelte`, `app/src/ui/dialogs/GoalDialog.svelte`
- Modify: `app/src/ui/evolucao/EvolucaoScreen.svelte` (Metas no `.es-grid`), `app/src/ui/state/app.svelte.ts` (`DialogId` ganha `'goal'`; `goalRequest: string | null` e `openGoal(id: string | null)`, no molde de `recordRequest`), `app/src/ui/App.svelte` (monta a folha), `app/src/styles/screens.css` (`es-goal*`, `es-bar`, a folha), `app/src/strings.ts` (`T.metas`)
- Test: `app/tests/unit/goals-board.test.ts` (novo), `app/tests/unit/goal-dialog.test.ts` (novo), `app/tests/unit/app-dialogs.test.ts`

**Interfaces:**
- Consumes: `goalStatus`, `goalName`, `formatTarget`, `parseGoalTarget`, `goalBest`, `firstReach`, `GOAL_MAX` (Task 2); `saveGoal`, `deleteGoal` (Task 4); `confirmReady` e o padrão de dois toques de `SolveDialog.remove()`; `modal()`.
- Produces: `GoalsBoard` com `{ app }`; a folha `GoalDialog` com `{ app; open: boolean }` (`aria-labelledby`, `use:modal`).
- Quadro, texto exato: "Metas" e "todos os eventos"; em andamento primeiro, alcançadas no fim, cada grupo por `createdAt`; cada linha é um botão que abre a folha: nome ("Média de 12 abaixo de 13 s"), a etiqueta do evento, "faltam 0.58 s · melhor 0:13.58" / "✓ alcançada em 14/10/2026 · melhor 0:10.84" / "ainda sem média de 12" ("ainda sem média de 5", "ainda sem tempo" no single), a barra (6 px, `--cube-off`, cheia na tinta; alcançada em `--pb` com o texto em `--pb-ink`); `aria-label` "Média de 12 abaixo de 13 s, 3×3: melhor 0:13.58, faltam 0.58 s, 59% do caminho desde 0:14.41. Editar a meta" / "Single abaixo de 11 s, 3×3: alcançada em 14/10/2026, melhor 0:10.84. Editar a meta" / "…, 4×4: ainda sem média de 12. Editar a meta"; botão "Nova meta"; com 6 ou mais, `aria-disabled="true"` (continua no Tab) e "São 6 metas, o máximo. Exclua uma para criar outra." por `aria-describedby`; sem metas, "Escolha um tempo para buscar: um single, uma média de 5 ou de 12, em qualquer evento. O Klick mostra quanto falta e guarda o dia em que você chegar." e o botão "Criar uma meta".
- Folha, texto exato: "Nova meta" + "Um tempo para buscar. O Klick mostra quanto falta." / "Editar meta" + "Mudar o tipo, o evento ou o tempo refaz a meta pelo seu histórico."; "Tipo" (`.seg`: "Single", "Média de 5", "Média de 12"; nova começa em Single, no evento do filtro da Evolução); "Evento" (`<select>` com `EVENTS`); "Abaixo de" (`inputmode="decimal"`, `placeholder="15"`). Primeira linha: vazio "Em segundos: 15 é sub-15, e 90 é 1:30."; válido "Fica média de 5 abaixo de 12.5 s."; só ao salvar, `aria-invalid="true"` e borda `--arm`: "Esse tempo não parece certo. Tente 15, 14.5 ou 90." (`bad`) ou "Até 59:59.99." (`range`). Segunda linha: "Seu melhor agora: 0:12.97. Faltam 0.47 s." (sem alvo válido, só a primeira frase); "Seu melhor já está abaixo: ela nasce alcançada, com a data de 02/10/2026."; sem tempo "Você ainda não tem média de 5 no 4×4." / "Você ainda não tem tempo no 4×4.". Botões "Salvar" (fecha e a meta entra no quadro; não comemora), "Excluir" só ao editar ("Tem certeza? Clique de novo", segundo toque depois de `confirmReady`, e fecha), "Cancelar".

- [ ] **Step 1: Testes que falham** — `goals-board.test.ts`: `'linha em andamento com faltam, melhor, barra a 59% e o aria-label'`; `'alcançada no fim com a data e a barra cheia'`; `'sem tempo: ainda sem média de 12, barra vazia'`; `'sete metas do sync aparecem todas e Nova meta fica aria-disabled com o motivo'`; `'sem metas, o convite e Criar uma meta'`. `goal-dialog.test.ts`: `'a prévia segue o que se digita e o erro só aparece ao salvar'`; `'3600 diz Até 59:59.99.'`; `'Salvar cria e fecha'`; `'nasce alcançada avisa a data'`; `'editar mostra Excluir e pede o segundo toque'`. `app-dialogs.test.ts`: `'openGoal abre a folha nova e a de editar'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** portando o HTML e o CSS das metas e da folha da maquete.
- [ ] **Step 4: Rode e confira que passam** — os arquivos e o check → PASS.
- [ ] **Step 5: Commit** — `feat(estatisticas): o quadro Metas e a folha da meta`.

---

### Task 8: Ponta a ponta, acessibilidade e a conferência com a maquete

**Files:**
- Create: `app/tests/e2e/estatisticas.spec.ts`
- Modify: `app/tests/e2e/a11y.spec.ts`, `app/tests/e2e-sync/` (um caso de metas no arquivo de ajustes da conta, se houver, ou um novo `goals.spec.ts`)

**Interfaces:**
- Consumes: tudo das Tasks 1–7; os helpers de `tests/e2e/helpers.ts` e `tests/e2e-sync/helpers.ts` (`device`, `signIn`, `syncNow`).

- [ ] **Step 1: Testes** — `estatisticas.spec.ts`: `'a Evolução mostra Semanas com Esta semana e o ano com o dia de hoje'`; `'criar uma meta pela folha, alcançar no Digitar com 9.50 e ver a mensagem no Centro e "✓ alcançada em" no quadro'`; `'a meta do dia em Ajustes muda o tile do Timer para meta 50'`. `a11y.spec.ts` (claro e Noite): Evolução com Semanas, Metas e o ano; a folha nova e a de tempo torto. Sync: `'meta criada no aparelho A aparece no B; excluída no B some do A'`.
- [ ] **Step 2: Rode** — e2e, a11y e sync e2e → PASS (um teste que falha por carga da máquina roda de novo sozinho).
- [ ] **Step 3: Conferência com a maquete** — capturas do app a 390 px e 1280 px (claro e Noite) da Evolução com os três quadros, da dica, da folha (nova, torta, seis, editar, excluir), do Timer com a meta alcançada e de Ajustes › Timer, lado a lado com os quadros da maquete; diferenças corrigidas ou listadas no relatório.
- [ ] **Step 4: Commit** — `test(estatisticas): ponta a ponta, acessibilidade e sync das metas`.
