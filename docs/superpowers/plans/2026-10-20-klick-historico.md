# O histórico inteiro — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver todos os solves no filtro da Evolução, abrir e corrigir qualquer um, mover e excluir em lote com um "Desfazer", juntar sessões e ver os recordes da sessão (single, ao5, ao12, ao50, ao100, ao1000).

**Architecture:** Os solves continuam na memória (`app.solves`). O núcleo ganha médias móveis incrementais e os recordes com a posição de cada um. O repositório ganha as operações em lote (mover, excluir, restaurar, juntar) numa transação cada, com a fila do sync na ordem certa. A Evolução troca a tabela dos 30 últimos por uma lista virtualizada (só desenha as linhas na tela), e três folhas novas (detalhe do solve, mover, recorde) seguem a maquete aprovada.

**Tech Stack:** Svelte 5 (runes), TypeScript strict, `idb`, Vitest (jsdom), Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-10-20-klick-historico-design.md` · **Maquete aprovada:** `docs/design/2026-10-20-historico-maquete.html` (com as respostas do Ranielli: o quadro repete o atual; o toque longo seleciona; data de outro ano com o ano completo).

## Global Constraints

- A maquete aprovada é fiel: portar peça por peça (`hx-*` vira componente/CSS do app), sem "melhorar"; conferir lado a lado antes de entregar.
- Nada muda no servidor nem no formato do sync. Mover é editar `sessionId` do solve; tudo passa por `syncWrite` + `ctx.track`.
- Mover e juntar só entre sessões do mesmo evento: o repositório recusa outro evento (o sync não recusaria).
- Seleção de até 1.000 solves por vez (`MAX_SELECTION = 1_000`). No detalhe, mudam só penalidade, nota, sessão e lixeira.
- Termos do app: "Excluir"/"excluídos" (não "Apagar"); tempos no formato `formatMs` ("0:13.48"); contagens com `toLocaleString('pt-BR')`; datas da lista: mesmo ano "20/10 14:33", outro ano "12/03/2024".
- Exclusão no detalhe pede o segundo toque (`confirmReady`, `ui/confirm.ts`); a de lote também.
- Os marcos da temporada em curso seguem os solves (como hoje); as temporadas fechadas nunca regridem. Toda edição chama o `checkSeason` como `editSolve` já faz.
- Funciona sem rede e sem conta. axe passa nas telas novas (claro e Noite); teclado e leitor de tela; "reduzir movimento" vale.
- Textos novos em `src/strings.ts`, seção `T.historico`, em português, no tom do app. Comentários em português, na densidade dos arquivos vizinhos.
- Comandos (de `app/`): unit `./node_modules/.bin/vitest run`, check `pnpm --config.verify-deps-before-run=false check`, e2e `./node_modules/.bin/playwright test`. Commits com escopo `historico`. Nada de push nem deploy.

## Review Focus

1. **Mover para uma sessão de outro evento** (pela folha ou pelo lote, ou juntar sessões de eventos diferentes): recusado sem gravar nada — teste na Task 2.
2. **Juntar com o sync ligado:** a exclusão da sessão juntada sobe depois de todas as mudanças de sessão dos solves, e nenhum aparelho apaga em cascata um solve que ainda não mudou — teste na Task 2.
3. **Desfazer depois de um solve novo:** um solve novo encerra o "Desfazer" pendente (de um, de lote, de mover), como hoje — teste na Task 2.
4. **100 mil solves:** as médias móveis e os recordes saem em menos de 1,5 s no Node e a lista desenha só o que está na tela — testes nas Tasks 1 e 3.
5. **Mudar o filtro com a seleção aberta:** a seleção some (nunca age sobre solves que saíram da lista) — teste na Task 3.

---

### Task 1: Médias móveis incrementais e os recordes no núcleo

**Files:**
- Modify: `app/src/core/stats.ts`
- Test: `app/tests/unit/stats.test.ts`, `app/tests/unit/stats-records.test.ts` (novo)

**Interfaces:**
- Produces (`core/stats.ts`):
  - `rollingAverages(solves, n)` mantém assinatura e resultado exatos, em O(N log N) (janela deslizante: árvore de Fenwick sobre os postos dos valores, com contagem e soma; DNF = `Infinity` conta no topo).
  - `RECORD_SIZES = [5, 12, 50, 100, 1000] as const`.
  - `interface RecordEntry { best: number | null; bestEnd: number | null; current: number | null }` — `bestEnd`: índice (no array dado) do último solve da melhor janela (do melhor single, no single).
  - `interface Records { single: RecordEntry; averages: Record<(typeof RECORD_SIZES)[number], RecordEntry> }`.
  - `records(solves: readonly Solve[]): Records` — `best` e `current` como `averageOf`/`bestSingle` (corte de 5%, DNF); `null` sem solves suficientes. No empate, o recorde mais antigo.
  - `windowOf(solves, n, end): { values: number[]; trimmed: boolean[] }` — os `n` tempos que terminam em `end` e quais caem no corte (para a folha do recorde).

- [ ] **Step 1: Testes que falham** — `stats-records.test.ts`: `'rollingAverages incremental é igual ao ingênuo'` (1.000 sequências aleatórias com +2/DNF, n de 3 a 1000, contra uma cópia do algoritmo atual no teste); `'records: melhor e atual de single e das cinco médias, com o índice da melhor janela'`; `'records: média sem solves suficientes é null'`; `'records: empate fica com o recorde mais antigo'`; `'windowOf marca o melhor e o pior na ao5 e os 50 da ao1000'`; `'100 mil solves: records sai em menos de 1,5 s'` (Review Focus 4).
- [ ] **Step 2: Rode e confira que falham** — `./node_modules/.bin/vitest run tests/unit/stats-records.test.ts` → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces; `bestAverage` passa a usar o incremental.
- [ ] **Step 4: Rode e confira que passam** — `stats.test.ts`, `stats-records.test.ts` e o check → PASS.
- [ ] **Step 5: Commit** — `feat(historico): médias móveis incrementais e os recordes da sessão`.

---

### Task 2: Lote no repositório e no estado (mover, excluir, restaurar, juntar, desfazer)

**Files:**
- Modify: `app/src/data/repository.ts`, `app/src/ui/state/app.svelte.ts`, `app/src/ui/timer/TimerScreen.svelte` (só a tecla Z), `app/src/strings.ts`
- Test: `app/tests/unit/repository-bulk.test.ts` (novo), `app/tests/unit/repository-outbox.test.ts`, `app/tests/unit/app-state.test.ts`

**Interfaces:**
- Produces (`Repository`):
  - `moveSolves(ids: readonly string[], sessionId: string): Promise<{ id: string; from: string }[]>` — um `syncWrite(['sessions','solves'])`; o destino precisa existir, estar ativo e ter o mesmo `event` de cada solve, senão rejeita com `Error('move-event')`/`Error('move-session')` sem gravar nada; um `at` para todos (`updatedAt`), `deletionStamp` intacto; `track` de cada; `announceSolves(ids)`. Solves já na sessão de destino ficam de fora do retorno.
  - `deleteSolves(ids): Promise<string[]>` e `restoreSolves(ids): Promise<string[]>` — o lote de `deleteSolve`/`restoreSolve` numa transação (restaurar revive a sessão como `reviveSession`).
  - `mergeSessions(fromId: string, toId: string): Promise<number>` — mesmo evento e as duas ativas (senão `Error('merge-event')`/`Error('merge-session')`); move os solves ativos de `from` (índice `bySession`) para `to` com um `at`, `track` de cada, `ctx.raise(ctx.stamp() + 1)`, e só então exclui `from` (como `deleteSession`, sem solves ativos para levar) e faz `track` dela; devolve quantos solves moveu.
- Produces (`AppState`):
  - `deleteSolves(ids)`, `moveSolves(ids, sessionId)` e `mergeSessions(fromId, toId)`, pelo `write(…)` de sempre, com `checkSeason`.
  - O "Desfazer" passa a ter tipo: `undo: { kind: 'delete'; ids: string[]; until } | { kind: 'move'; moves: { id: string; from: string }[]; until } | null`. `deleteSolve(id)` vira o caso de um. `undoLast(): Promise<boolean>` substitui `undoDelete()` (a tecla Z e o toast chamam ele): `delete` → `restoreSolves`; `move` → `moveSolves` de volta, agrupado por `from`.
  - `mergeSessions` troca a sessão atual para `to` quando `from` era a atual (`switchSession`).
  - Toasts: `T.historico.deleted(n)` ("1 solve excluído"/"N solves excluídos"), `T.historico.moved(n, session)`, `T.historico.merged(n, session)`.

- [ ] **Step 1: Testes que falham** — `repository-bulk.test.ts`: `'mover leva os solves para outra sessão do mesmo evento, com uma data só'`; `'mover para outro evento ou para uma sessão na lixeira recusa sem gravar nada'` (Review Focus 1); `'excluir e restaurar em lote, restaurar revive a sessão'`; `'juntar move os solves, exclui a sessão de origem e a fila põe a exclusão depois das mudanças'` (`outboxBatch` em lotes de 1: todos os solves antes da sessão; Review Focus 2); `'juntar sessões de eventos diferentes recusa'`. `app-state.test.ts`: `'excluir em lote e desfazer devolve todos'`; `'mover e desfazer volta cada solve para a sessão de onde veio'`; `'um solve novo encerra o desfazer de lote e o de mover'` (Review Focus 3); `'juntar a sessão atual troca a atual para a de destino'`; `'a tecla Z desfaz o último lote'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — a unit inteira e o check → PASS.
- [ ] **Step 5: Commit** — `feat(historico): mover, excluir e juntar em lote, com um desfazer`.

---

### Task 3: A lista inteira na Evolução, com seleção

**Files:**
- Create: `app/src/ui/evolucao/SolveList.svelte`, `app/src/ui/evolucao/rows.ts`, `app/src/ui/longpress.ts`, `app/src/ui/dialogs/MoveDialog.svelte`
- Modify: `app/src/ui/evolucao/EvolucaoScreen.svelte`, `app/src/ui/state/app.svelte.ts` (`DialogId` ganha `'move'`, e os ids a mover), `app/src/styles/screens.css` (ou o CSS onde a tabela de hoje mora), `app/src/strings.ts`
- Test: `app/tests/unit/solve-list.test.ts` (novo), `app/tests/unit/evolucao-screen.test.ts`

**Interfaces:**
- Consumes: Task 1 (`rollingAverages` incremental, `pbFlags`), Task 2 (`deleteSolves`, `moveSolves`).
- Produces:
  - `rows.ts`: `rowAt(pool, i, series: { ao5: (number|null)[]; ao12: (number|null)[]; pb: boolean[] }, now: number): Row` — `{ id, number: i + 1, time, plus2, dnf, ao5, ao12, when, note, pb }`; `whenLabel(at, now)`: mesmo ano `"20/10 14:33"`, outro ano `"12/03/2024"`.
  - `longpress.ts`: `longpress(node, { ms: number; onLong: () => void })` (ação Svelte; cancela ao mover mais de 10 px, ao soltar ou no scroll); `LONG_PRESS_MS = 450`.
  - `SolveList.svelte`: props `{ app, pool, series, onOpen: (id: string) => void }`; altura de linha fixa; desenha só as linhas visíveis mais uma margem; cabeçalho grudado; o mais novo em cima; setas andam, Enter abre; "Selecionar" e o toque longo entram na seleção; barra de lote com a contagem, "Mover para…" e "Excluir" (segundo toque); `MAX_SELECTION = 1_000` (acima disso, a caixa não marca e o aviso `T.historico.selectionCap` aparece).
  - `EvolucaoScreen` troca a tabela (`TABLE_ROWS`, `rows`) pela `SolveList` sobre o `pool` inteiro do filtro; a contagem ("10.482 solves") no topo da lista; mudar o filtro limpa a seleção.
  - `app.openMove(ids: string[])` abre `MoveDialog`: as sessões do mesmo evento com a contagem (`toLocaleString('pt-BR')`), a de origem marcada; tocar move (`app.moveSolves`) e mostra o toast com "Desfazer". A barra de lote e, na Task 4, o detalhe do solve usam a mesma folha.

- [ ] **Step 1: Testes que falham** — `solve-list.test.ts`: `'Mover para… lista só as sessões do mesmo evento e move com Desfazer'`; `'com 100 mil solves, desenha só as linhas da tela'` (conta `<tr>`/linhas no DOM ≤ 60; Review Focus 4); `'a linha mostra nº, tempo com +2 e DNF, ao5, ao12, data e o sinal de nota'`; `'data do mesmo ano sem o ano, de outro ano com o ano completo'`; `'setas e Enter abrem o solve'`; `'Selecionar e o toque longo entram na seleção; Excluir pede o segundo toque'`; `'acima de 1.000, a caixa não marca e o aviso aparece'`; `'mudar o filtro limpa a seleção'` (Review Focus 5). `evolucao-screen.test.ts`: os testes da tabela passam a olhar a lista.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces e na maquete (estados 1a–1c, 2a–2b, 4, 7).
- [ ] **Step 4: Rode e confira que passam** — a unit, o check e `tests/e2e/a11y.spec.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(historico): a lista inteira na Evolução, com seleção`.

---

### Task 4: O detalhe do solve e a folha de mover

**Files:**
- Create: `app/src/ui/dialogs/SolveDialog.svelte`, `app/src/ui/clipboard.ts`
- Modify: `app/src/ui/state/app.svelte.ts` (`DialogId` ganha `'solve'`, e o id do solve aberto), `app/src/ui/duel/send.ts` (usa `copyText`), `app/src/ui/evolucao/EvolucaoScreen.svelte` (`onOpen`), `app/src/strings.ts`
- Test: `app/tests/unit/solve-dialog.test.ts` (novo)

**Interfaces:**
- Consumes: Task 1 (`records`, `rollingAverages`), Task 2 (`deleteSolve`, `setPenalty`, `setNote`), Task 3 (`app.openMove`, `MoveDialog`).
- Produces:
  - `clipboard.ts`: `copyText(text: string, nav = navigator): Promise<'copied' | 'failed'>` (o `copyLink` de hoje, generalizado; chamado dentro do gesto).
  - `app.openSolve(id: string)` abre a folha; "Mover" chama `app.openMove([id])` (Task 3).
  - `SolveDialog`: o tempo grande, a penalidade (`.seg` OK/+2/DNF), data e hora, sessão e evento, o embaralhamento com `ScrambleImage` (o ajuste que esconde a imagem vale), a nota (maxlength 80, como `ResultActions`), a ao5 e a ao12 que terminam nele, o selo `T.historico.inRecord(kind)` quando ele está numa janela de recorde (Task 1, `bestEnd`), e as ações Mover, Copiar (`T.historico.copyText(solve)`: tempo, penalidade, embaralhamento e data) e Excluir (segundo toque).

- [ ] **Step 1: Testes que falham** — `solve-dialog.test.ts`: `'abre com tempo, data, sessão, embaralhamento e a ao5/ao12 que terminam nele'`; `'OK/+2/DNF muda a penalidade de um solve antigo e a lista e os recordes acompanham'`; `'a nota se edita e salva'`; `'Excluir pede o segundo toque e manda para a lixeira com Desfazer'`; `'Copiar copia o texto do solve'`; `'Mover abre a folha de mover com este solve'`; `'o selo aparece no solve que faz parte do recorde de ao12'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces e na maquete (estados 3, 8b–8c).
- [ ] **Step 4: Rode e confira que passam** — a unit, o check e o e2e de acessibilidade → PASS.
- [ ] **Step 5: Commit** — `feat(historico): o detalhe de qualquer solve e a folha de mover`.

---

### Task 5: O quadro de recordes e a folha do recorde

**Files:**
- Create: `app/src/ui/evolucao/RecordsBoard.svelte`, `app/src/ui/dialogs/RecordDialog.svelte`
- Modify: `app/src/ui/evolucao/EvolucaoScreen.svelte`, `app/src/ui/evolucao/SolveList.svelte` (rolar até um índice), `app/src/strings.ts`
- Test: `app/tests/unit/records-board.test.ts` (novo)

**Interfaces:**
- Consumes: Task 1 (`records`, `windowOf`, `RECORD_SIZES`), Task 3 (`SolveList`).
- Produces:
  - `RecordsBoard`: props `{ solves: readonly Solve[]; onOpen: (kind: 'single' | 5 | 12 | 50 | 100 | 1000) => void }`; segue o evento e a sessão do filtro e ignora o período; uma linha por recorde no celular e colunas no desktop (maquete 1a/1c); uma média sem solves suficientes não aparece.
  - `SolveList` ganha `scrollToIndex(i: number)` (exportado do componente).
  - `RecordDialog`: na ao5 e na ao12, os tempos com o melhor e o pior entre parênteses (`windowOf`); nas maiores, o intervalo de datas; "Ver na lista" fecha a folha e rola a lista até a janela.

- [ ] **Step 1: Testes que falham** — `records-board.test.ts`: `'o quadro mostra melhor e atual de single e das médias que têm solves'`; `'o quadro ignora o período e segue a sessão'`; `'a folha da ao12 lista os 12 tempos com o melhor e o pior entre parênteses'`; `'a folha da ao100 mostra o intervalo de datas'`; `'Ver na lista rola até o último solve da janela'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces e na maquete (estados 1a, 1c, 5).
- [ ] **Step 4: Rode e confira que passam** — a unit e o check → PASS.
- [ ] **Step 5: Commit** — `feat(historico): o quadro de recordes e a folha do recorde`.

---

### Task 6: Juntar sessões

**Files:**
- Modify: `app/src/ui/dialogs/SessionsDialog.svelte`, `app/src/strings.ts`
- Test: `app/tests/unit/sessions-dialog.test.ts`

**Interfaces:**
- Consumes: Task 2 (`app.mergeSessions`).
- Produces: "Juntar com…" por sessão, abrindo na própria linha como o Renomear (maquete 6a/6b): escolhe uma sessão do mesmo evento, confirma com `T.historico.mergeConfirm(from, count, to)` ("Juntar 'Treino OH antigo' (2.304 solves) com 'OH' — a primeira vai para a lixeira"), e com conta e mais de 4.000 solves acrescenta `T.historico.mergeSlow` ("o resto sobe pelo sync nos próximos dias"); as contagens de solves do diálogo passam a usar `toLocaleString('pt-BR')`.

- [ ] **Step 1: Testes que falham** — `sessions-dialog.test.ts`: `'Juntar com… lista só as sessões do mesmo evento'`; `'confirmar junta, manda a de origem para a lixeira e mostra o toast'`; `'Esc cancela a junção sem mexer em nada'`; `'com conta e mais de 4.000 solves, avisa que o resto sobe pelo sync'`; `'a contagem usa o ponto de milhar'`.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces e na maquete.
- [ ] **Step 4: Rode e confira que passam** — a unit e o check → PASS.
- [ ] **Step 5: Commit** — `feat(historico): juntar sessões`.

---

### Task 7: Ponta a ponta e conferência com a maquete

**Files:**
- Create: `app/tests/e2e/historico.spec.ts`
- Modify: `app/tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Testes que falham** — `historico.spec.ts`: `'abre um solve antigo, dá +2 e põe nota; a lista e os recordes mudam'`; `'seleciona três, exclui e desfaz'`; `'move um solve para outra sessão e desfaz'`; `'junta duas sessões'`; `'no celular (390 px) a lista e as folhas cabem sem rolar de lado'`. `a11y.spec.ts`: axe na Evolução com a lista, no detalhe, em mover e no recorde, claro e Noite.
- [ ] **Step 2: Rode e confira que falham** → FAIL.
- [ ] **Step 3: Ajuste** o que faltar para passar; capture a Evolução, o detalhe e a seleção (390 px e desktop, claro e Noite) e compare lado a lado com a maquete; corrija o que divergir.
- [ ] **Step 4: Rode e confira que passam** — o e2e inteiro, a unit e o check → PASS.
- [ ] **Step 5: Commit** — `test(historico): ponta a ponta e acessibilidade do histórico`.
