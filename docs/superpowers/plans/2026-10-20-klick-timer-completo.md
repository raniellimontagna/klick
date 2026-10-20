# O timer completo, sem hardware — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitar o tempo de cada solve, marcar fases com um toque, escolher como o tempo aparece durante o solve e ouvir "oito"/"doze" na inspeção — tudo ajuste do aparelho, sem mudar o servidor.

**Architecture:** O núcleo ganha os ajustes novos (no `Settings`, logo do aparelho), o campo `phases` do solve, o leitor do tempo digitado e as fases no próprio `core/timer.ts` (o `press` em RUNNING marca a fase até a última, que para), então teclado, zona e toque já funcionam sem mexer no `input.ts`. O Timer troca o tempo grande por um campo no modo "Digitar", mostra o tempo do jeito escolhido e as fases no resultado; o som ganha a voz; o detalhe e a Evolução mostram as fases.

**Tech Stack:** Svelte 5 (runes), TypeScript strict, `idb`, Web Speech (`speechSynthesis`), Vitest (jsdom), Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-10-20-klick-timer-completo-design.md` · **Maquete aprovada:** `docs/design/2026-10-20-timer-completo-maquete.html` (respostas do Ranielli: +2 e DNF no celular depois de salvar; com 4 fases no 3×3, os nomes cruz, F2L, OLL e PLL, senão os números).

## Global Constraints

- A maquete aprovada é fiel: portar peça por peça (`tc-*` vira componente/CSS do app), sem "melhorar"; conferir lado a lado antes de entregar.
- Ajustes novos, todos do aparelho (campos de `Settings`, que `DeviceSettings` já leva): `entry: 'timer' | 'typing'` (padrão `'timer'`), `phases: 0 | 2 | 3 | 4` (padrão `0`, desligado), `liveTime: 'full' | 'seconds' | 'hidden'` (padrão `'full'`), `inspVoice: boolean` (padrão `false`). Nenhuma chave nova no catálogo de ajustes da conta; `sound.insp` continua boolean.
- `Solve.phases?: number[]` — durações em ms das N fases, somando `ms`; só existe com fases ligadas. O sync, o servidor e o protocolo não mudam.
- Desafio e treino da Trilha não mudam: sem fases, sem digitar, sem os modos de tempo (o `TimerScreen` com `duelOn` e o `TrainRound` seguem o cronômetro de hoje).
- Digitar: "1234" → 0:12.34, "10234" → 1:02.34, "12.34", "12,34", "1:02.34"; "+" no fim é +2; "DNF" (qualquer caixa) é DNF com `ms` 0; menos de uma hora. DNF digitado: OK e +2 indisponíveis (resultado e detalhe).
- Fases: N toques; um toque a menos de `PHASE_MIN_GAP_MS = 300` do anterior não conta; nomes: 4 fases no 3×3 → "Cruz", "F2L", "OLL", "PLL"; senão "Fase 1"… .
- Voz: `speechSynthesis` com uma voz `pt-BR` (ou `pt`): "oito" aos 8 s, "doze" aos 12 s; sem voz em português ou sem a API, o bipe. Segue o liga e desliga do aviso (`sound.insp`).
- Funciona sem rede e sem conta. axe passa nas telas novas (claro e Noite); o campo de digitar tem rótulo e `inputmode="decimal"`.
- Textos novos em `src/strings.ts` (seções existentes `T.ajustes`, `T.timer` e uma nova `T.fases` se fizer sentido), em português, no tom do app. Comentários em português, na densidade dos vizinhos.
- Comandos (de `app/`): unit `./node_modules/.bin/vitest run --testTimeout=30000 --maxWorkers=4` (a máquina está carregada por outros apps), check `pnpm --config.verify-deps-before-run=false check`, e2e `./node_modules/.bin/playwright test`. Commits com escopo `timer`. Nada de push nem deploy.

## Review Focus

1. **Desafio e treino da Trilha:** com fases, digitar e "Escondido" ligados, o desafio e o treino cronometram como hoje — testes nas Tasks 3 e 4.
2. **Segundo dedo na tela durante as fases:** no celular, um toque de fase com outro dedo ainda encostado conta (hoje o `touch.ts` ignora até soltar todos) — teste na Task 4.
3. **Atalhos enquanto se digita:** "p", "d", "n", "z", espaço e os números não disparam atalhos do Timer com o campo em foco; Esc solta o campo — teste na Task 3.
4. **Solve com fases editado por um app de antes:** o +2 ou a nota trocados num aparelho com o código de antes não perdem as fases — teste na Task 2.
5. **Sem voz em português:** sem `speechSynthesis` ou sem voz `pt`, toca o bipe, e nada quebra — teste na Task 5.

---

### Task 1: O núcleo — ajustes, fases no cronômetro e o tempo digitado

**Files:**
- Modify: `app/src/core/types.ts` (`Settings`, `DEFAULT_SETTINGS`, `Solve`), `app/src/core/timer.ts`, `app/src/data/transfer.ts` (`SETTING_CHECKS`)
- Create: `app/src/core/typed.ts`, `app/src/core/phases.ts`
- Test: `app/tests/unit/timer.test.ts`, `app/tests/unit/typed.test.ts` (novo), `app/tests/unit/phases.test.ts` (novo)

**Interfaces:**
- Produces:
  - `Settings` com `entry`, `phases`, `liveTime`, `inspVoice` (valores e padrões das Global Constraints); `SETTING_CHECKS` valida cada um.
  - `Solve.phases?: number[]`; `TimerResult` ganha `phases?: number[]`.
  - `core/timer.ts`: `setOptions({ phases?: 0 | 2 | 3 | 4 })` (padrão 0); em RUNNING, com N fases, `press(at)` marca a fase (evento novo `phase: (index: number, ms: number) => void`) até a N-ésima, que para com `result.phases` (durações, somando `ms`); `PHASE_MIN_GAP_MS = 300` exportado; `marks: readonly number[]` (as marcas da rodada, para a tela).
  - `core/typed.ts`: `parseTyped(text: string): { ok: true; ms: number; penalty: Penalty } | { ok: false }` e `previewTyped(text: string): string | null` ("0:12.34", "0:12.34+", "DNF").
  - `core/phases.ts`: `phaseLabels(n: number, event: EventId): string[]`; `phaseAverages(pool: readonly Solve[], last = 12): { n: number; means: number[]; shares: number[]; heaviest: number } | null` (os últimos `last` solves sem DNF com `phases.length` igual ao do mais recente com fases).

- [ ] **Step 1: Testes que falham** — `timer.test.ts`: `'com 4 fases, três toques marcam e o quarto para, com as durações somando o tempo'`; `'um toque a menos de 300 ms do anterior não conta'`; `'sem fases, o primeiro toque para como hoje'`; `'setOptions de fases vale no próximo solve'`. `typed.test.ts`: os formatos aceitos (um caso cada: "1234", "10234", "12.34", "12,34", "1:02.34", "12.34+", "dnf"), os recusados ("", "abc", "1:2:3", "60:00.00"), e `previewTyped`. `phases.test.ts`: `'nomes do CFOP só com 4 fases no 3×3'`; `'phaseAverages usa só os de mesmo número de fases do mais recente, sem DNF'`; `'shares somam 1 e heaviest aponta a maior'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os três arquivos, `transfer.test.ts`, `train-round.test.ts` e o check → PASS.
- [ ] **Step 5: Commit** — `feat(timer): ajustes do timer, fases no cronômetro e o tempo digitado no núcleo`.

---

### Task 2: O solve com fases no repositório, no estado e nos arquivos

**Files:**
- Modify: `app/src/data/repository.ts` (`NewSolve`, `addSolve`), `app/src/ui/state/app.svelte.ts` (`addSolve`), `app/src/data/safety.ts` (a fila de gravações, se levar o literal), `app/src/data/transfer.ts` (csTimer)
- Test: `app/tests/unit/repository.test.ts`, `app/tests/unit/sync-records.test.ts`, `app/tests/unit/transfer.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Solve.phases`).
- Produces: `NewSolve` e `AppState.addSolve({ ms, penalty, at, phases? })` gravam `phases` quando vier. csTimer: a exportação escreve as fases no formato multiphase do csTimer **só se** o implementador confirmar o formato no código aberto do csTimer (cumulativo ou duração, a ordem); confirmado, a importação lê de volta; não confirmado, nada muda no csTimer e o relatório diz por quê.

- [ ] **Step 1: Testes que falham** — `repository.test.ts`: `'addSolve grava as fases'`; `'um app de antes que troca o +2 ou a nota não perde as fases'` (simular: um solve com `phases` vindo pelo sync num repositório, `updateSolve` de penalidade e de nota, e as fases continuam; Review Focus 4). `transfer.test.ts`: `'o arquivo do Klick leva as fases e um Klick de antes o importa'` (o `isSolve` aceita o campo a mais); e, se o formato do csTimer for confirmado, `'exporta e importa as fases no multiphase do csTimer'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — a unit e o check → PASS.
- [ ] **Step 5: Commit** — `feat(timer): o solve com fases no banco, no sync e nos arquivos`.

---

### Task 3: Digitar o tempo no Timer

**Files:**
- Create: `app/src/ui/timer/TypedEntry.svelte`
- Modify: `app/src/ui/timer/TimerScreen.svelte`, `app/src/ui/timer/ResultActions.svelte` (OK/+2 indisponíveis no DNF digitado), `app/src/ui/dialogs/SolveDialog.svelte` (o mesmo no detalhe), `app/src/strings.ts`, CSS do Timer
- Test: `app/tests/unit/typed-entry.test.ts` (novo), `app/tests/unit/timer-screen.test.ts`, `app/tests/unit/solve-dialog.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parseTyped`, `previewTyped`, `settings.entry`), Task 2 (`app.addSolve`).
- Produces: com `settings.entry === 'typing'` e fora do desafio, o Timer mostra `TypedEntry` no lugar do tempo grande e esconde as zonas: o campo (rótulo `T.timer.typedLabel`, `inputmode="decimal"`), a prévia ("Fica 0:12.34"), o erro só ao salvar (`T.timer.typedError`; acima de uma hora, `T.timer.typedTooLong`), Enter ou "Salvar" grava com `at` = agora e traz o próximo embaralhamento; depois de salvar, o último solve com as ações de sempre; no celular, Salvar fecha o teclado. Sem inspeção. Com o campo em foco, nenhum atalho de uma tecla do Timer dispara; Esc tira o foco do campo. DNF digitado (`ms` 0 e `penalty` 'DNF'): OK e +2 com `aria-disabled` e o motivo `T.timer.typedDnfLocked`, no resultado e no detalhe.

- [ ] **Step 1: Testes que falham** — `typed-entry.test.ts`: `'Enter grava o tempo digitado e traz o próximo embaralhamento'`; `'a prévia mostra como o tempo vai ficar'`; `'um tempo torto só mostra o erro ao salvar, e não grava'`; `'com o campo em foco, p, d, n, z, espaço e números não disparam atalhos; Esc solta o campo'` (Review Focus 3); `'DNF digitado deixa OK e +2 indisponíveis, com o motivo'`. `timer-screen.test.ts`: `'no desafio, o modo Digitar não aparece e o cronômetro segue'` (Review Focus 1). `solve-dialog.test.ts`: `'no detalhe de um DNF digitado, OK e +2 ficam indisponíveis'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces e na maquete (estados 2a–2f, 3a–3b).
- [ ] **Step 4: Rode e confira que passam** — a unit, o check e `tests/e2e/a11y.spec.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(timer): digitar o tempo de cada solve`.

---

### Task 4: As fases e o modo do tempo durante o solve

**Files:**
- Modify: `app/src/ui/timer/TimerScreen.svelte`, `app/src/core/touch.ts` (o segundo dedo), `app/src/strings.ts`, CSS do Timer
- Create: `app/src/ui/timer/PhaseBar.svelte` (a barra das fases, a mesma peça do resultado, do detalhe e do quadro)
- Test: `app/tests/unit/timer-screen.test.ts`, `app/tests/unit/touch.test.ts`, `app/tests/unit/phase-bar.test.ts` (novo), `app/tests/unit/train-round.test.ts`

**Interfaces:**
- Consumes: Task 1 (`setOptions({ phases })`, evento `phase`, `marks`, `phaseLabels`, `settings.phases`, `settings.liveTime`), Task 2 (`addSolve` com `phases`).
- Produces:
  - `TimerScreen` passa `phases` ao timer (0 no desafio), grava `result.phases`, mostra as marcas (as peças do progresso do desafio, 12 px, embaixo do tempo) e, em `timeText()` no RUNNING, o tempo conforme `liveTime`: `'full'` como hoje, `'seconds'` só os segundos ("0:09"), `'hidden'` `T.timer.solving` ("Resolvendo"); a inspeção sempre igual; o tempo final sempre inteiro.
  - `PhaseBar.svelte`: props `{ phases: readonly number[]; labels: readonly string[]; heaviest?: number }`; uma barra na proporção de cada fase, a mais pesada na tinta e as outras na peça apagada, as durações em "6.12 s"; acessível (lista com rótulo e valores).
  - O resultado logo depois do solve mostra a `PhaseBar`.
  - `core/touch.ts`: com fases ligadas no timer, um toque novo (outro `pointerId`) enquanto um dedo ainda está na tela conta como marca.

- [ ] **Step 1: Testes que falham** — `timer-screen.test.ts`: `'com 4 fases, as marcas aparecem e o resultado mostra as quatro fases'`; `'Só os segundos e Escondido mudam só o tempo correndo; a inspeção e o tempo final ficam iguais'`; `'no desafio, sem fases e com o tempo inteiro, mesmo com os ajustes ligados'` (Review Focus 1). `touch.test.ts`: `'com fases, um toque de outro dedo com o primeiro ainda encostado marca a fase'` (Review Focus 2). `phase-bar.test.ts`: `'a barra mostra as fases na proporção, com a mais pesada destacada e os rótulos'`. `train-round.test.ts`: `'o treino da Trilha cronometra como antes com fases ligadas'` (Review Focus 1).
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces e na maquete (estados 4a–4c, 5a–5b, 8c).
- [ ] **Step 4: Rode e confira que passam** — a unit e o check → PASS.
- [ ] **Step 5: Commit** — `feat(timer): fases no toque e o tempo do jeito escolhido durante o solve`.

---

### Task 5: Os ajustes e a voz na inspeção

**Files:**
- Modify: `app/src/ui/ajustes/AjustesScreen.svelte`, `app/src/ui/sound.ts`, `app/src/ui/timer/TimerScreen.svelte` (o `warn`), `app/src/strings.ts`
- Test: `app/tests/unit/ajustes-screen.test.ts`, `app/tests/unit/sound.test.ts`

**Interfaces:**
- Consumes: Task 1 (os ajustes novos).
- Produces:
  - Ajustes › Timer: "Como você marca o tempo" (`.seg` Cronômetro | Digitar), "Fases" (`.seg` Desligado | 2 | 3 | 4, com a dica `T.ajustes.phasesHint` no 4), "Tempo durante o solve" (`.seg` Inteiro | Só os segundos | Escondido), como na maquete (1a–1c).
  - Ajustes › Aparência e som: o liga e desliga de hoje passa a se chamar `T.ajustes.inspWarning` ("Aviso da inspeção"); ligado, aparece "Som do aviso" (`.seg` Bipe | Voz) que grava `inspVoice`.
  - `sound.ts`: `speak(text: string): boolean` (usa `speechSynthesis` com uma voz `pt-BR`/`pt`; devolve false sem a API ou sem voz em português); o `warn(ms)` do Timer fala "oito" (8000) ou "doze" (12000) com `inspVoice` e cai no `tick()` quando `speak` devolve false.

- [ ] **Step 1: Testes que falham** — `ajustes-screen.test.ts`: `'as três opções do timer gravam no aparelho'`; `'o Som do aviso só aparece com o aviso ligado e grava a voz'`. `sound.test.ts`: `'speak fala com a voz em português'`; `'sem speechSynthesis ou sem voz em português, speak devolve false'`. `timer-screen.test.ts`: `'com Voz, aos 8 s fala oito e aos 12 s doze; sem voz, o bipe'` (Review Focus 5).
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces e na maquete.
- [ ] **Step 4: Rode e confira que passam** — a unit, o check e o e2e de acessibilidade → PASS.
- [ ] **Step 5: Commit** — `feat(timer): os ajustes do timer e a voz na inspeção`.

---

### Task 6: As fases no detalhe e o quadro "Fases" na Evolução

**Files:**
- Create: `app/src/ui/evolucao/PhasesBoard.svelte`
- Modify: `app/src/ui/dialogs/SolveDialog.svelte`, `app/src/ui/evolucao/EvolucaoScreen.svelte`, `app/src/ui/evolucao/pool-stats.ts` (as fases no cache), `app/src/strings.ts`
- Test: `app/tests/unit/phases-board.test.ts` (novo), `app/tests/unit/solve-dialog.test.ts`, `app/tests/unit/pool-stats.test.ts`

**Interfaces:**
- Consumes: Task 1 (`phaseAverages`, `phaseLabels`), Task 4 (`PhaseBar`).
- Produces: o detalhe do solve com a seção "Fases" (`PhaseBar`) quando o solve tem fases (maquete 6); `PhasesBoard` perto do quadro de recordes, no filtro de evento e sessão da Evolução, com `phaseAverages` (maquete 7a–7b, 8d), sem aparecer quando não há solves com fases; `pool-stats` passa a refazer o cálculo quando as fases de um solve mudam (hoje compara só id e tempo efetivo).

- [ ] **Step 1: Testes que falham** — `phases-board.test.ts`: `'o quadro mostra a média de cada fase dos últimos 12 com fases, a parte de cada uma e a mais pesada'`; `'sem solves com fases, o quadro não aparece'`; `'quem mudou de 3 para 4 fases vê as de 4'`. `solve-dialog.test.ts`: `'o detalhe de um solve com fases mostra a barra com os nomes'`. `pool-stats.test.ts`: `'uma mudança nas fases refaz o cálculo'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces e na maquete.
- [ ] **Step 4: Rode e confira que passam** — a unit, o check e o e2e de acessibilidade → PASS.
- [ ] **Step 5: Commit** — `feat(timer): as fases no detalhe e o quadro Fases na Evolução`.

---

### Task 7: Ponta a ponta e conferência com a maquete

**Files:**
- Create: `app/tests/e2e/timer-completo.spec.ts`
- Modify: `app/tests/e2e/a11y.spec.ts` (só o que faltar)

- [ ] **Step 1: Testes que falham** — `timer-completo.spec.ts`: `'digita 12.34+ e o solve entra com +2, e o próximo embaralhamento aparece'`; `'com 4 fases, quatro espaços marcam e o resultado mostra cruz, F2L, OLL e PLL'`; `'com Escondido, o tempo não aparece correndo e aparece inteiro no fim'`; `'o desafio continua com o cronômetro com os ajustes novos ligados'`; `'no celular (390 px), o campo de digitar e o resultado com fases cabem sem rolar de lado'`.
- [ ] **Step 2: Rode e confira que falham** onde a feature faltar (testes de aceitação podem passar de primeira; anote).
- [ ] **Step 3: Ajuste** o que faltar; capture os estados da maquete (celular e desktop, claro e Noite) e compare lado a lado; corrija o que divergir.
- [ ] **Step 4: Rode e confira que passam** — o e2e inteiro, a unit e o check → PASS.
- [ ] **Step 5: Commit** — `test(timer): ponta a ponta e acessibilidade do timer completo`.
