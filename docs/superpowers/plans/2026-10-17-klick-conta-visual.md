# O visual da conta (e-mail do código e cubo vivo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O e-mail do código com "peças do cubo" e o "cubo vivo" (o 3×3 do logo animado) no diálogo de entrar, na nuvem da barra de cima e no "Sincronizar agora", sem mudar fluxo nem lógica.

**Architecture:** O e-mail é só `worker/mail.ts` (HTML de e-mail em tabelas, estilos inline). No app, um componente `LiveCube.svelte` desenha o 3×3 com um estado e quantas peças estão verdes; as regras puras (quantas peças, que estado num momento do sync, se o movimento está reduzido) ficam em `live-cube.ts`. O diálogo de entrar, o indicador e a seção da conta só passam estados para ele. Todo movimento é CSS; `:root[data-reduced-motion='true']` (já existe, `base.css:113`) zera animações, e o JS só consulta o mesmo atributo para não esperar a cascata do código certo.

**Tech Stack:** Svelte 5 (runes), TypeScript estrito, Vitest + jsdom + @testing-library/svelte, Vitest no pool dos Workers para `worker/`. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-17-klick-conta-visual-design.md` (a seção 11 traz decisões já aprovadas). Spec da conta que esta altera: `docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md`.

## Global Constraints

- Comandos a partir de `app/`: `./node_modules/.bin/vitest run tests/unit/<arquivo>`; Worker: `./node_modules/.bin/vitest run -c vitest.worker.config.ts tests/worker/<arquivo>`; tipos: `pnpm --config.verify-deps-before-run=false check` (o `pnpm` puro quebra com `ERR_PNPM_IGNORED_BUILDS` do workerd). Base verde: toda a suíte unitária passa (1799) e a do Worker (75).
- Cores do app sempre pelos tokens (`--ink`, `--arm`, `--go`, `--bg`, `--surface`, `--line`, `--muted`); no e-mail, as cores cruas do tema claro: papel `#f3f0e9`, superfície `#fbfaf7`, tinta `#17171a`, atenuado `#6f6a60`, linha `#e2dcd0`, vermelho `#d93d42`, verde `#23915a`.
- Movimento: curva `var(--ease)`; onda ~600 ms, cascata do código certo ~300 ms no total, vermelho do código errado ~600 ms, verde do "Sincronizado agora" ~1,2 s; "girando" (90°, pausa) repete só enquanto espera; o resto toca uma vez.
- Menos movimento: `:root[data-reduced-motion='true']` já zera animação e transição; o JS lê `document.documentElement.dataset.reducedMotion === 'true'`.
- Nada novo anunciado: cubo e peças com `aria-hidden="true"`; o campo do código continua um `input` só, com rótulo "Código", `inputmode="numeric"`, `autocomplete="one-time-code"`, aceitando colar; o indicador não vira região `aria-live`.
- Seletores que os testes atuais usam continuam: `data-code`, `data-sync`, `data-quiet`, `data-sync-line`, `data-signin-step`, `data-joining`, `.sync-ind`, `[data-slot="conta"]`.
- Textos novos só os do e-mail (ficam em `worker/mail.ts`, que não importa `src/strings.ts`). O app reusa `T.conta.codeIntro` ("Mandamos um código para…") e a linha de `syncLine` ("Sincronizado agora").
- Sem conta, nada é desenhado nem roda: o cubo vivo só aparece dentro de telas que já exigem conta.
- Commits em português no estilo do repositório, terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Nada de push nem deploy.

## Review Focus

- O iPhone sugerindo o código do Mail e o colar "Seu código: 123 456" continuam funcionando com as peças por cima do campo → teste na Task 3.
- Código errado e a pessoa digita de novo durante os ~600 ms: as peças voltam ao normal na hora → teste na Task 3.
- Menos movimento ligado: o código certo segue sem esperar a cascata, e nada fica girando parado no meio → testes nas Tasks 2 e 3.
- Timer rodando com sync em curso: o cubinho da nuvem não gira (`data-quiet`) → teste na Task 4.
- Um sync automático com Ajustes aberto não pisca o verde; só o tocado pela pessoa → teste na Task 5.

---

### Task 1: O e-mail do código com as peças do cubo

**Files:**
- Modify: `app/worker/mail.ts` (`codeEmail`)
- Test: `app/tests/worker/mail.test.ts` (novo)
- Modify: `docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md` (7.4: o e-mail deixa de ser "em texto"; passa a ser HTML com as peças, mais o texto puro de sempre)

**Interfaces:**
- Produces: `codeEmail(code: string): { subject: string; text: string; html: string }` (mesma assinatura; `resendMailer` não muda).

- [ ] **Step 1: Escreva os testes que falham** em `tests/worker/mail.test.ts`:
  - `'o assunto e o texto puro não mudam'`: `subject === 'Seu código do Klick: 482913'`; `text === 'Seu código para entrar no Klick: 482913\n\nEle vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.\n'`.
  - `'seis peças, em ordem, a quinta vermelha'`: `[...html.matchAll(/data-digit="(\d)"[^>]*style="([^"]*)"[^>]*>\s*(\d)\s*</g)]` tem 6 itens; os dígitos (grupo 3) são `['4','8','2','9','1','3']`; o atributo (grupo 1) é igual ao dígito; o estilo do 5º contém `#d93d42`, os outros `#17171a`.
  - `'os textos da direção B e a linha para copiar'`: o HTML sem tags (`html.replace(/<[^>]+>/g, ' ')`) contém `Seu código do Klick`, `Vale por 10 minutos.`, `Código: 482913`, `Se não foi você, ignore este e-mail.`, `Klick · timer de cubo mágico`.
  - `'e-mail de verdade: só claro, sem imagem, script, fonte ou recurso externo'`: o HTML contém `<meta name="color-scheme" content="light"`, um pré-cabeçalho escondido com `Vale por 10 minutos.` (`display:none`) e `max-width:480px`; não casa `/<img|<script|<link|@import|url\(|https?:\/\//i`.
  - `'o cubo do topo: 9 peças, o centro vermelho'`: `[...html.matchAll(/data-cube-piece="(\d)"[^>]*style="([^"]*)"/g)]` tem 9 itens; a de índice 4 contém `#d93d42`, as outras `#17171a`.

- [ ] **Step 2: Rode e confira que falham** — `./node_modules/.bin/vitest run -c vitest.worker.config.ts tests/worker/mail.test.ts` → FAIL (sem `data-digit`, sem `data-cube-piece`).

- [ ] **Step 3: Reescreva o `html` de `codeEmail`** em `worker/mail.ts` conforme a spec 4: documento completo com `<meta name="color-scheme" content="light">` e `<meta name="supported-color-schemes" content="light">`; fundo papel; tabela central `max-width:480px`; o cubo do topo como tabela 3×3 de células `data-cube-piece="0..8"` (14 px, cantos 4 px, vão 3 px); título, validade; as seis peças como células `data-digit="<d>"` (40×48, cantos 10 px, fonte monoespaçada em negrito, fundo tinta e dígito papel; a 5ª com fundo vermelho), em dois grupos de três com um vão maior; a linha `Código: <code>`; o rodapé. Tudo inline, layout em `<table role="presentation">`, pilha de fontes do sistema. Atualize o comentário do topo do arquivo (deixa de dizer "texto simples com uma versão HTML mínima").

- [ ] **Step 4: Rode e confira que passam** — o mesmo comando → PASS; e `./node_modules/.bin/vitest run -c vitest.worker.config.ts` inteiro → 75 + os novos passam (o `abuse.test.ts:166` que compara o corpo enviado ao Resend usa `codeEmail` e deve seguir passando).

- [ ] **Step 5: Atualize a spec da conta (7.4)** e faça o commit: `feat(worker): o e-mail do código com as peças do cubo`.

---

### Task 2: O cubo vivo (componente e regras)

**Files:**
- Create: `app/src/ui/live-cube.ts`, `app/src/ui/LiveCube.svelte`
- Test: `app/tests/unit/live-cube.test.ts`

**Interfaces:**
- Produces (em `live-cube.ts`):
  - `type CubeState = 'idle' | 'wave' | 'turn' | 'fill' | 'solved' | 'error'`
  - `filledPieces(sent: number, total: number): number` — 0 a 9: `total <= 0` → 0; senão `Math.min(9, Math.max(0, Math.floor((sent / total) * 9)))`.
  - `firstSyncCube(progress: SignInSync | null, status: SyncStatus): { state: CubeState; filled: number }` — `'done'` → `{ solved, 9 }`; `'cancelled'` ou `status.phase` `'error'`/`'offline'` → `{ error, 0 }`; `status.progress` com `total > 0` → `{ fill, filledPieces(progress.sent, progress.total) }`; qualquer outro → `{ turn, 0 }`. (`SignInSync` vem de `ui/state/account.svelte`, `SyncStatus` de `sync/engine`.)
  - `motionReduced(): boolean` — `document.documentElement.dataset.reducedMotion === 'true'`.
- Produces (`LiveCube.svelte`): props `{ state: CubeState; filled?: number; size?: 'lg' | 'sm' }` (padrões: `filled = 0`, `size = 'lg'`; `lg` = peças de 14 px para o diálogo; `sm` = 5 px para o botão). Raiz `<span class="live-cube" data-cube={state} data-size={size} aria-hidden="true">` com 9 `<i data-piece>`; o centro (índice 4) com `data-center`; as primeiras `filled` peças com `data-on="true"` no estado `fill`. CSS no próprio componente: `wave` (uma vez, atraso em diagonal), `turn` (rotação de 90° com pausa, `infinite`), `fill` (`data-on` em `var(--go)`), `solved` (escala ~1,1 uma vez, peças na tinta com centro `var(--arm)`), `error` (centro `var(--arm)` destacado, sem movimento), `idle` (o logo).

- [ ] **Step 1: Testes que falham** em `tests/unit/live-cube.test.ts`:
  - `filledPieces`: `(0,100)→0`, `(50,100)→4`, `(100,100)→9`, `(150,100)→9`, `(5,0)→0`.
  - `firstSyncCube`: `('done', idle)` → `{state:'solved', filled:9}`; `('cancelled', idle)` → `error`; `('started', {…idleStatus(), phase:'offline'})` → `error`; `('started', {…, phase:'syncing', progress:{sent:3,total:9,received:0}})` → `{fill, 3}`; `('started', {…, phase:'syncing', progress:{sent:0,total:0,received:40}})` → `{turn, 0}`; `(null, idle)` → `turn`.
  - `motionReduced`: `false` sem o atributo; `true` com `document.documentElement.dataset.reducedMotion = 'true'` (limpe depois).
  - O componente: `render(LiveCube, { state: 'fill', filled: 4 })` → 9 `[data-piece]`, 4 com `data-on="true"`, raiz com `aria-hidden="true"` e `data-cube="fill"`, a peça de índice 4 com `data-center`; `render(LiveCube, { state: 'idle' })` → nenhuma `data-on`.
- [ ] **Step 2: Rode** — `./node_modules/.bin/vitest run tests/unit/live-cube.test.ts` → FAIL (módulos não existem).
- [ ] **Step 3: Implemente** `live-cube.ts` e `LiveCube.svelte` com as interfaces acima.
- [ ] **Step 4: Rode** o arquivo → PASS; `pnpm --config.verify-deps-before-run=false check` → 0 erros.
- [ ] **Step 5: Commit** — `feat(app): o cubo vivo, o 3×3 do logo que conta o que está acontecendo`.

---

### Task 3: O diálogo de entrar com o cubo vivo e o código em peças

**Files:**
- Modify: `app/src/ui/dialogs/SignInDialog.svelte`
- Modify: `app/src/styles/components.css` (só o que for do diálogo: as peças do código, o tremor)
- Test: `app/tests/unit/sign-in-dialog.test.ts`

**Interfaces:**
- Consumes: `LiveCube`, `firstSyncCube`, `motionReduced` (Task 2).
- Produces (marcadores para os testes): no passo do código, `[data-code-pieces]` com 6 `[data-code-piece]` (o texto de cada uma é o dígito digitado ou vazio) e o atributo `data-code-state` = `'typing' | 'ok' | 'bad'`; o cubo de cada passo é o `LiveCube` (procure por `[data-cube]` dentro de `[data-signin-step]`).

Comportamento (spec 5 e decisões 2–5 da seção 11):
- Passo `code`: `LiveCube` em `wave` ao entrar (vindo de `'sent'`), `turn` enquanto `verify` espera, depois `idle`. O `input[data-code]` continua o mesmo elemento, com os mesmos atributos e `onCode`; ele fica por cima das peças (transparente, com o cursor) ou as peças por cima dele sem capturar toque — o que importa: um único campo real, rótulo "Código", colar funciona.
- Código certo: `data-code-state='ok'` (peças verdes em cascata) e o `after(next)` espera ~300 ms; com `motionReduced()`, não espera.
- Código errado: `data-code-state='bad'` (tremor + peças vermelhas) enquanto `error` estiver definido; digitar (`onCode`) limpa `error` e volta a `'typing'` na hora. A mensagem de erro de hoje continua.
- Passo `sync`: `LiveCube` com `firstSyncCube(progress, account.status)` (`state` e `filled`), ao lado da linha `data-sync-line` de hoje.

- [ ] **Step 1: Testes que falham** (no `describe` existente, usando `openDialog`/`typeEmailAndCode`):
  - `'o código em seis peças sobre um campo só: colar enche as peças, o campo continua o do Mail'`: depois de enviar o e-mail, `[data-signin-step="code"] [data-cube]` tem `data-cube="wave"`; colar `'Seu código: 123 456'` → o `input[data-code]` vale `'123456'` e as 6 `[data-code-piece]` têm o texto `1,2,3,4,5,6`; só existe um `input` no passo.
  - `'código errado: as peças ficam vermelhas e voltam ao digitar'`: `typeEmailAndCode('999999')` → `[data-code-pieces]` com `data-code-state="bad"` e o alerta "Código errado"; digitar `'1'` → `data-code-state="typing"` e o alerta some.
  - `'código certo: as peças viram verdes antes de seguir'`: com o `fakeAuth` aceitando, depois do clique `data-code-state="ok"` e o passo ainda é `code`; com `vi.waitFor` o passo vira o seguinte.
  - `'menos movimento: o código certo segue sem esperar'`: com `document.documentElement.dataset.reducedMotion = 'true'`, o passo seguinte chega sem o estado intermediário (`data-signin-step` muda na mesma espera do `vi.waitFor` e nenhum `setTimeout` de ~300 ms é agendado — use `vi.useFakeTimers({ shouldAdvanceTime: true })` e confira que não precisa avançar o relógio); limpe o atributo depois.
  - `'o primeiro sync: o cubo enche, e "Pronto" o resolve'`: no passo `sync`, `[data-cube]` começa em `turn`; quando `signInSync` vira `'done'`, `data-cube="solved"` e a linha diz `T.conta.done`.
- [ ] **Step 2: Rode** `./node_modules/.bin/vitest run tests/unit/sign-in-dialog.test.ts` → os novos FAIL, os antigos PASS.
- [ ] **Step 3: Implemente** no `SignInDialog.svelte` (e o CSS das peças/tremor em `components.css`, sob `.signin`), conforme o comportamento acima. Os testes antigos do arquivo continuam passando sem mudança, exceto os que esperavam a troca de passo imediata depois do código certo: esses passam a usar `vi.waitFor` (anote no relatório quais).
- [ ] **Step 4: Rode** o arquivo → PASS; depois a suíte unitária inteira e o `check` → verdes.
- [ ] **Step 5: Commit** — `feat(conta): o diálogo de entrar com o cubo vivo e o código em peças`.

---

### Task 4: A nuvem com o cubinho como selo

**Files:**
- Modify: `app/src/ui/SyncIndicator.svelte`
- Modify: `app/src/styles/components.css` (`.sync-ind`)
- Test: `app/tests/unit/sync-indicator.test.ts`

**Interfaces:**
- Consumes: `syncIcon` (já existe: `'synced' | 'syncing' | 'waiting' | 'error'`).
- Produces: o mesmo `button.sync-ind` com `data-sync` e `data-quiet` de hoje, mais `data-just-synced="true"` por ~600 ms quando o ícone passa de `syncing` para `synced` (o pulinho). Dentro, um SVG 24×24 (exibido a 22–24 px no botão de 32 px): a nuvem `M15 18.5H8.5a6.5 6.5 0 1 1 6.2-8.5h1.6a4 4 0 0 1 3.4 6.1` só em contorno (traço 1,8, `currentColor`), com uma `<mask>` que recorta o canto do selo (quadrado arredondado em x 15.4, y 14.6, 7,4 × 7,4, raio 2) — o recorte é da máscara, não de uma cor pintada; e o cubinho do selo como 9 `<rect data-badge-piece>` de 1,5 com raio 0,4 em x {16.4, 18.3, 20.2} × y {15.6, 17.5, 19.4}, num `<g data-badge>` girável.

Estados (spec 6): `syncing` → o `<g data-badge>` gira (o CSS de hoje para `.spin` com `data-quiet='false'` passa a valer para ele); `synced` → peças `var(--go)`; `waiting` → contorno tracejado e peças `var(--muted)`; `error` → peças `var(--ink)` com a central `var(--arm)`.

- [ ] **Step 1: Testes que falham** (no `describe` existente):
  - `'a nuvem só em contorno com o cubinho como selo: 9 peças, a do centro vermelha no erro'`: com conta, o botão tem um `svg` com uma `mask` e 9 `[data-badge-piece]`; em `phase:'error'`, `data-sync="error"` e a peça de índice 4 tem o atributo/classe que a pinta de `--arm` (escolha `data-center` como marcador).
  - `'sincronizando → sincronizado: um pulinho, uma vez'`: `phase:'syncing'` e depois `idle` com `lastSyncAt` agora → `data-just-synced="true"`; com `vi.useFakeTimers` avançando 700 ms → o atributo some.
  - `'com o timer ocupado, nada gira'`: o teste de hoje de `data-quiet` continua, e o `g[data-badge]` só ganha a classe de giro com `data-quiet="false"` (confira a classe ou o atributo que liga a animação).
  - Os testes de hoje (quatro estados no `data-sync` e no rótulo, sem `aria-live`, o toque leva a Ajustes) passam sem mudança.
- [ ] **Step 2: Rode** `./node_modules/.bin/vitest run tests/unit/sync-indicator.test.ts` → os novos FAIL.
- [ ] **Step 3: Implemente** o SVG, a máscara, os estados e o `data-just-synced` (um `$effect` que guarda o ícone anterior e liga o atributo por ~600 ms, só se não estiver quieto). CSS em `components.css`, tudo por tokens; no tema escuro o recorte já vem da máscara.
- [ ] **Step 4: Rode** o arquivo e a suíte → verdes; `check` → 0.
- [ ] **Step 5: Commit** — `feat(app): a nuvem da barra com o cubinho como selo`.

---

### Task 5: "Sincronizar agora" com o cubinho, e a spec em dia

**Files:**
- Modify: `app/src/ui/ajustes/AccountSection.svelte`
- Modify: `app/src/styles/components.css` (o verde passageiro da linha)
- Test: `app/tests/unit/account-section.test.ts`
- Modify: `docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md` (9.2, 9.3 e 9.6: o cubo vivo no diálogo, a nuvem com o selo, a regra de menos movimento e "uma vez")

**Interfaces:**
- Consumes: `LiveCube` (Task 2, `size="sm"`).
- Produces: o botão "Sincronizar agora" de hoje com um `LiveCube` à esquerda do texto (`turn` enquanto `status.phase === 'syncing'`, `error` com `status.error`, `wave` uma vez ao terminar bem depois do toque, `idle` no resto); a linha `small[data-sync-line]` ganha `data-fresh="true"` por ~1,2 s quando um sync **pedido pelo toque** termina sem erro (fase volta de `syncing` para `idle`).

- [ ] **Step 1: Testes que falham**:
  - `'o botão com o cubinho: gira enquanto sincroniza, e o toque que termina bem deixa a linha verde por um instante'`: com conta, o botão "Sincronizar agora" contém `[data-cube="idle"]`; clicar e pôr `phase:'syncing'` → `[data-cube="turn"]`; voltar a `idle` com `lastSyncAt` agora → a linha `data-sync-line` diz "Sincronizado agora" e tem `data-fresh="true"`; avançando 1,3 s (fake timers) → o atributo some.
  - `'um sync automático com Ajustes aberto não pisca'`: sem clicar, `syncing` → `idle` → a linha não ganha `data-fresh`.
  - `'erro: o cubinho em erro'`: `phase:'error', error:'server'` → `[data-cube="error"]` no botão.
- [ ] **Step 2: Rode** `./node_modules/.bin/vitest run tests/unit/account-section.test.ts` → os novos FAIL.
- [ ] **Step 3: Implemente** no `AccountSection.svelte`: uma marca local "pedido pelo toque" ligada no clique; um `$effect` que, com a marca ligada, ao ver `syncing → idle` sem erro, liga `data-fresh` por ~1,2 s e põe o cubo em `wave` uma vez, e desliga a marca (também ao ver erro). O verde do `data-fresh` em `components.css` usa `var(--go-ink)` com transição; menos movimento só tira a transição.
- [ ] **Step 4: Rode** o arquivo, a suíte unitária e o `check` → verdes; o e2e de sempre (`./node_modules/.bin/playwright test`) → 31 passam, 4 pulados, como antes.
- [ ] **Step 5: Atualize a spec da conta (9.2, 9.3, 9.6)** em poucas linhas, no estilo dela, e faça o commit: `feat(conta): o "Sincronizar agora" com o cubinho, e a spec com o cubo vivo`.
