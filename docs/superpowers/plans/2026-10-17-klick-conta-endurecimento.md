# Endurecimento da conta antes da raiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar todo caminho para fatura da conta (cota de 100 mil, tetos do R2 e dos e-mails, orçamento diário de gravações, marcas compactadas), com mensagem honesta e nenhum dado perdido, medir uma conta de 100 mil solves e aplicar as sete correções da revisão final do 5a.

**Architecture:** O que o app e o servidor dividem (limites por conta, o motivo "cota", a marca compactada, os campos novos da resposta) mora no núcleo `src/core/sync/`; o protocolo sobe para 2, porque um app antigo leria "cota" e "amanhã" como recusa comum e tiraria da fila o que só existe nele. O Worker conta o mês do R2 e o dia/mês dos e-mails no D1 (migração 0003) e, no SQLite de cada conta, os ativos, as gravações e restaurações do dia e a lista de cópias guardada; os tetos por ambiente vêm de `vars` do wrangler e falham fechados. O app guarda os recusados pela cota numa lista "só neste aparelho" (chave `held` da store meta), fora da fila, e mostra cota, orçamento e cópias pausadas em Ajustes, na linha do sync e no fim do primeiro sync.

**Tech Stack:** Svelte 5 (runes), TypeScript estrito, IndexedDB (idb), Cloudflare Workers + Durable Objects (SQLite) + D1 + R2, Vitest (jsdom e o pool dos Workers); `node:sqlite` só na medição. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-17-klick-conta-endurecimento-design.md` (a seção 7 decide os conflitos: nunca pagar > nunca perder dados > serviço de pé para todos > cota de 100 mil > frequência das cópias). Contexto: `docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md` (seção 16) e `docs/superpowers/specs/2026-10-17-klick-conta-visual-design.md`.

## Global Constraints

- Comandos a partir de `app/`: `./node_modules/.bin/vitest run tests/unit/<arquivo>`; Worker: `./node_modules/.bin/vitest run -c vitest.worker.config.ts tests/worker/<arquivo>`; tipos: `pnpm --config.verify-deps-before-run=false check` (o `pnpm` puro quebra com `ERR_PNPM_IGNORED_BUILDS`). Base verde: unit 1836, Worker 81. No fim de cada task as duas suítes inteiras e o check passam; as contagens só sobem (fora os testes que a task diz reescrever).
- Nunca `git push`, `wrangler deploy`, `wrangler secret put`, `wrangler d1 migrations apply --remote` nem outro comando que toque a conta "Rani" da Cloudflare ou o Resend. A migração 0003 vai para o remoto depois do plano, pelo controlador e só com o ok do Ranielli.
- Nenhum segredo no repositório: o `wrangler.jsonc` só ganha números públicos.
- Sem conta, nada muda: nenhum pedido, tela, mensagem de canal ou escrita nova no IndexedDB. A única exceção é a pedida pela spec 5.2 (os botões da atualização que falhou).
- Textos novos em pt-BR, no tom do app, em `src/strings.ts` (`T.conta`, `T.data`), com a cópia exata deste plano. O Worker não importa `src/strings.ts`: as mensagens dele vão no JSON (`{ code, message }` em abuse.ts, `{ error }` no router).
- Cada valor que pode mudar fica numa constante só (`src/core/sync/limits.ts` no núcleo, `worker/limits.ts` no Worker) ou numa var do wrangler, com um teste que fixa o valor.
- O núcleo continua puro (nada de navegador, banco ou rede); o Worker só importa dele.
- Falha fechada: var de teto ausente, vazia ou que não é inteiro > 0 vale 0 (nada passa) e loga `{ evt: 'cap-missing', name }`.
- Logs do Worker só com ids, contagens, durações e códigos fixos (spec 8.5 do 5a).
- Commits em Conventional Commits em português, no estilo do `git log` (`feat(conta): …`, `fix(conta): …`), um por task, só com os arquivos da task, terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. A marca compactada chega a um aparelho que ainda tem o solve ativo (ficou mais de 30 dias fora) ou que nunca o teve: o primeiro o apaga e guarda o conteúdo dele; o segundo não grava nada; nenhuma cópia ou export leva um solve sem campos → Task 2.
2. Um solve guardado pela cota que a pessoa depois apaga, edita ou restaura da lixeira: apagado, sobe como apagado e sai de "só neste aparelho"; editado, continua guardado; nada some do aparelho → Task 6.
3. O orçamento do dia corta um lote no meio, e o mesmo lote tem recusas da cota: o pedaço aceito sai da fila (o recusado vai para "só neste aparelho"), o resto fica na fila na mesma ordem, o recebimento continua e tudo sobe no dia seguinte (UTC) → Tasks 4 e 6.
4. Uma aba fecha ou congela com o timer rodando: a líder para de esperar por ela depois de `BUSY_STALE_MS`; o sync não fica preso para sempre → Task 9.
5. Uma var de teto ausente ou torta num ambiente (por exemplo `"1GB"`): falha fechada (cópia pausada, operação do R2 recusada, código não enviado) com o log, nunca sem teto → Task 3.

---

### Task 1: O núcleo da cota e o protocolo 2

**Files:**
- Create: `app/src/core/sync/limits.ts`
- Modify: `app/src/core/sync/types.ts:19` (protocolo), `:45-52` (SyncResponse), fim do arquivo (tipos novos)
- Modify: `app/src/core/sync/apply.ts:14-24` (opções e resultado), `:41-97` (cota e contagem)
- Modify: `app/tests/worker/sync.test.ts`, `snapshots.test.ts`, `auth.test.ts` (os `v: 1` viram `v: SYNC_PROTOCOL`; o teste de `426` passa a mandar `v: 1`)
- Test: `app/tests/unit/sync-limits.test.ts` (novo), `app/tests/unit/sync-apply.test.ts`

**Interfaces:**
- Produces (`limits.ts`):
  ```ts
  export type CountedStore = 'solves' | 'sessions' | 'practice';
  export type ActiveCounts = Record<CountedStore, number>;
  export const ACCOUNT_LIMITS: Readonly<ActiveCounts>; // { solves: 100_000, sessions: 1_000, practice: 100_000 }
  export const QUOTA_REASON = 'cota';
  export const isCounted: (store: SyncStore) => store is CountedStore;
  export const zeroCounts: () => ActiveCounts;
  ```
  Ajustes (`prefs`) não têm teto: `isPrefValue` só aceita as chaves do catálogo (trilha, lições, casos), então o número já é limitado.
- Produces (`types.ts`): `SYNC_PROTOCOL = 2`; `type CopiesPaused = 'space' | 'ops'`; `type RestoreRefusal = 'no-room' | 'restore-limit' | 'r2-budget' | 'too-big' | 'write-budget'`; `interface CloudCopies { copies: CloudCopy[]; paused: CopiesPaused | null }`; `SyncResponse` ganha `deferred?: number` (as últimas N mudanças do lote não foram lidas), `retryAt?: number` (quando mandar de novo) e `copiesPaused?: CopiesPaused | null`.
- Produces (`apply.ts`): `ApplyOptions.quota?: { active: ActiveCounts; limits?: Readonly<ActiveCounts> }` (limits padrão `ACCOUNT_LIMITS`) e `ApplyResult.activeDelta: ActiveCounts` (sempre calculado: ativos depois menos antes, dos registros em `writes`, cascata inclusive).

- [ ] **Step 1: Escreva os testes que falham.** Em `sync-limits.test.ts`: `'os limites por conta: 100 mil solves, mil sessões, 100 mil tentativas do treino'` → `expect(ACCOUNT_LIMITS).toEqual({ solves: 100_000, sessions: 1_000, practice: 100_000 })`, `QUOTA_REASON === 'cota'`, `SYNC_PROTOCOL === 2`, `isCounted('prefs') === false`. Em `sync-apply.test.ts`, `describe('a cota (endurecimento 4.1)')`, com `quota: { active: { solves: 2, sessions: 1, practice: 0 }, limits: { solves: 2, sessions: 5, practice: 5 } }`:
  - `'um solve novo além do limite volta com o motivo da cota e não é gravado'` → `rejected` `[{ store: 'solves', id: 'novo', reason: 'cota' }]`, `writes` sem ele.
  - `'editar e apagar um solve ativo passam com a conta cheia'` → `rejected` vazio, `activeDelta.solves` `0` e `-1`.
  - `'restaurar da lixeira com a conta cheia conta como novo'` → recusado com `'cota'`.
  - `'uma exclusão antes, no mesmo lote, abre a vaga do solve que vem depois'` → os dois em `writes`, `activeDelta.solves === 0`.
  - `'activeDelta conta a cascata da sessão apagada'` → sessão apagada com 3 solves ativos: `{ solves: -3, sessions: -1, practice: 0 }`.
  - `'sem quota (o aparelho, a restauração), nada é recusado pela cota'`.
- [ ] **Step 2: Rode e confira que falham** — `./node_modules/.bin/vitest run tests/unit/sync-limits.test.ts tests/unit/sync-apply.test.ts` → FAIL (`limits.ts` não existe).
- [ ] **Step 3: Implemente.** Crie `limits.ts` e os tipos. Em `applyChanges`, um contador corrente parte de `quota.active`: uma mudança aceita que deixa ativo um registro contado que antes não estava (ausente ou na lixeira) só entra se o contador da store estiver abaixo do limite, senão vai para `rejected` com `QUOTA_REASON` e não toca o `overlay`; o que passa a excluído desconta. `activeDelta` sai no fim, comparando cada `writes` com `view.get`. Nos testes do Worker, os pedidos de sync passam a usar `SYNC_PROTOCOL`, e `'pedidos tortos: 426 …'` manda `v: 1`.
- [ ] **Step 4: Rode e confira que passam** — os dois arquivos, depois as duas suítes e o check → PASS.
- [ ] **Step 5: Commit** — `feat(conta): a cota por conta no núcleo do sync e o protocolo 2`.

---

### Task 2: A marca compactada no núcleo

**Files:**
- Modify: `app/src/core/sync/limits.ts` (`TOMBSTONE_KEEP_MS`), `records.ts` (`isCompacted`, `compacted`), `shape.ts:37-57`, `merge.ts:18-21`, `apply.ts:47-68`, `snapshot.ts:20-22`
- Test: `app/tests/unit/sync-merge.test.ts`, `sync-apply.test.ts`, `sync-snapshot.test.ts`, `repository-sync.test.ts`

**Interfaces:**
- Produces: `TOMBSTONE_KEEP_MS = 30 * 86_400_000`; `isCompacted(c: Change): boolean` (solve, `deletedAt !== null`, `data` objeto sem chaves); `compacted(c: Change): Change` (`data: {}`, as datas iguais).
- Regras: `checkChange` aceita a marca compactada; em `contentOf`, conteúdo não compactado vence o compactado antes de comparar datas (sem isso, no empate de `updatedAt`, `'{}'` vence pelo texto canônico, `merge.ts:20`, e apagaria o conteúdo do aparelho); `applyChanges` não grava uma marca compactada de registro que a vista não tem (nos dois modos); `exportFromRecords` deixa as compactadas de fora (elas não têm `at` e quebrariam a ordem e o import).

- [ ] **Step 1: Escreva os testes que falham.**
  - `sync-merge.test.ts`: `'a marca compactada nunca vence o conteúdo, nem no empate de datas'` → `merge(cheio, compactado).data` igual a `cheio.data` e `deletedAt` do compactado; e acrescente marcas compactadas ao gerador das propriedades (comutativa, associativa, idempotente) já existentes.
  - `sync-apply.test.ts`: `'uma marca compactada passa por checkChange'`; `'uma marca compactada de um registro que não existe não é gravada, nos dois modos'` → `writes` vazio, `rejected` vazio.
  - `sync-snapshot.test.ts`: `'a cópia não leva solves compactados'` → `exportFromRecords([..., compactado], T).solves.map((s) => s.id)` sem ele.
  - `repository-sync.test.ts` (Review Focus 1): `'um aparelho que ficou fora mais de 30 dias recebe a marca compactada e guarda o conteúdo dele'` → `applyRemote([compactado])` deixa o solve daqui excluído com `ms`, `scramble` e `sessionId` de antes; `'a marca compactada de um solve que este aparelho nunca teve não é gravada'` → `listSolves({ includeDeleted: true })` sem ele.
- [ ] **Step 2: Rode e confira que falham** — os quatro arquivos → FAIL.
- [ ] **Step 3: Implemente** as regras acima.
- [ ] **Step 4: Rode e confira que passam** — os quatro arquivos, as duas suítes e o check → PASS.
- [ ] **Step 5: Commit** — `feat(conta): a marca compactada do solve apagado, no núcleo do sync`.

---

### Task 3: Os tetos do Worker na configuração e o teto dos e-mails

**Files:**
- Create: `app/worker/migrations/0003_budgets.sql`, `app/worker/limits.ts`, `app/worker/budget.ts`
- Modify: `app/worker/env.ts`, `app/wrangler.jsonc` (`vars` do beta e de `env.production`), `app/worker/abuse.ts:113-138`, `app/src/sync/auth.ts:12,41-45`, `app/src/ui/dialogs/SignInDialog.svelte` (`send`), `app/src/strings.ts` (`T.conta.mailCap`)
- Test: `app/tests/worker/budget.test.ts` (novo), `app/tests/worker/abuse.test.ts`, `app/tests/unit/wrangler-config.test.ts`, `app/tests/unit/sync-auth.test.ts`, `app/tests/unit/sign-in-dialog.test.ts`

**Interfaces:**
- Migração: `r2_ops (month TEXT NOT NULL, class TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (month, class))`; `r2_storage (id INTEGER PRIMARY KEY CHECK (id = 1), bytes INTEGER NOT NULL, counted_at INTEGER NOT NULL)`; `mail_sent (period TEXT PRIMARY KEY, count INTEGER NOT NULL)` (`period` = `d:AAAA-MM-DD` ou `m:AAAA-MM`, em UTC).
- `Env` ganha (strings): `SNAPSHOT_BYTES_CAP`, `R2_CLASS_A_MONTH`, `R2_CLASS_B_MONTH`, `MAIL_PER_DAY`, `MAIL_PER_MONTH`. Valores — beta: `"256000000"`, `"50000"`, `"500000"`, `"10"`, `"250"`; raiz: `"1000000000"`, `"500000"`, `"5000000"`, `"80"`, `"2500"`. Os dois ambientes dividem o Resend e o R2 da conta "Rani", mas cada um tem o próprio D1: a soma fica em 90/dia e 2.750/mês de e-mail (grátis 100 e 3.000), 550 mil A e 5,5 milhões B por mês (grátis 1 milhão e 10 milhões).
- `worker/limits.ts`:
  ```ts
  export interface Caps { snapshotBytes: number; classAMonth: number; classBMonth: number; mailDay: number; mailMonth: number }
  export function capsOf(env: Env): Caps; // falha fechada (Global Constraints)
  export const DAILY_WRITE_BUDGET = 20_000;  // mudanças gravadas por conta por dia UTC (spec 7.6)
  export const RESTORES_PER_DAY = 3;         // restaurações por conta por dia UTC (spec 7.1)
  export const COPIES_CACHE_MS = 600_000;    // a lista de cópias guardada (spec 7.1)
  export const COMPACT_PER_DAY = 2_000;      // marcas compactadas por alarme
  export const STORAGE_HEADROOM = 0.95;      // grava só até 95% do teto do espaço
  export const utcDay: (t: number) => string; export const utcMonth: (t: number) => string; export const nextUtcDay: (t: number) => number;
  ```
- `worker/budget.ts`:
  ```ts
  export type OpClass = 'A' | 'B';
  export function takeOps(db: D1Database, cls: OpClass, n: number, now: number, cap: number): Promise<boolean>; // reserva atômica; false sem mudar nada
  export function countOps(db: D1Database, cls: OpClass, n: number, now: number): Promise<void>;           // conta sem recusar (apagar a conta)
  export function reserveStorage(db: D1Database, bytes: number, now: number, cap: number): Promise<boolean>; // usado + bytes <= cap × STORAGE_HEADROOM
  export function storageUsed(db: D1Database): Promise<number>;
  export function setStorage(db: D1Database, bytes: number, now: number): Promise<void>;
  export function reserveMail(db: D1Database, now: number, caps: Pick<Caps, 'mailDay' | 'mailMonth'>): Promise<boolean>; // dia e mês juntos, ou nenhum
  ```
- `guardSendCode`: depois da linha da hora gravada, `reserveMail`; recusado → `429 { code: 'MAIL_CAP', message: 'Muitos pedidos de código hoje. Tente de novo amanhã.' }` e o log `{ evt: 'limited', route: 'send-code', by: 'mail-cap' }`. Com `E2E_MAILBOX === 'true'` (nada sai de verdade), não conta.
- App: `SendResult` ganha `'mail-cap'` (429 com `code === 'MAIL_CAP'`); `T.conta.mailCap = 'Muitos pedidos de código hoje. Tente de novo amanhã.'`.

- [ ] **Step 1: Escreva os testes que falham.**
  - `wrangler-config.test.ts`: `'os tetos do grátis ficam na configuração, por ambiente'` → os dez valores acima; `'somados, os dois ambientes ficam abaixo do grátis do Resend e do R2'` → `80+10 <= 100`, `2500+250 <= 3000`, A `<= 1_000_000`, B `<= 10_000_000`, espaço `<= 10e9`.
  - `budget.test.ts`: `'as constantes do Worker'` (os seis valores); `'uma var ausente, vazia ou torta ("1GB", "-5", "1.5") vale 0 e loga cap-missing'` (Review Focus 5); `'takeOps reserva até o teto e recusa sem contar; o mês seguinte (UTC) começa do zero'`; `'reserveStorage para em 95% do teto'`; `'reserveMail: o dia e o mês juntos; recusado, nenhum dos dois conta'`.
  - `abuse.test.ts`: `'o teto do dia: o pedido além dele recebe 429 MAIL_CAP e nenhum código sai'` (`testEnv({ MAIL_PER_DAY: '2' })`, `authDeps`, `mailer.sent` com 2); `'o teto do mês vale com o dia livre'`; `'um pedido barrado pelo limite da hora não gasta o teto'`; `'o teto volta no dia seguinte (UTC)'`; `'com MAIL_PER_DAY torto, nenhum código sai'`; `'com E2E_MAILBOX o teto não conta'`.
  - `sync-auth.test.ts`: `'429 MAIL_CAP vira mail-cap; 429 sem código continua limited'`. `sign-in-dialog.test.ts`: `'o teto de e-mails mostra a mensagem própria'` → alerta com `T.conta.mailCap`.
- [ ] **Step 2: Rode e confira que falham** — os cinco arquivos (Worker e unit) → FAIL.
- [ ] **Step 3: Implemente** os arquivos e as vars. `takeOps`/`reserveMail` num `db.batch` (um `INSERT … ON CONFLICT DO NOTHING` da linha do período e um `UPDATE … SET count = count + ? WHERE … AND count + ? <= ?`; `meta.changes` diz se passou). Atualize o comentário do topo do `wrangler.jsonc` (os tetos) e de `abuse.ts`.
- [ ] **Step 4: Rode e confira que passam** — os cinco arquivos, as duas suítes e o check → PASS.
- [ ] **Step 5: Commit** — `feat(conta): os tetos do grátis na configuração e o teto de e-mails do dia e do mês`.

---

### Task 4: A cota, o orçamento do dia e a compactação no objeto da conta

**Files:**
- Create: `app/worker/records-sql.ts` (o que sai de `account-store.ts:14-32,46-53,110-113`, sem `cloudflare:workers`, para a medição da Task 11 usar o mesmo SQL)
- Modify: `app/worker/account-store.ts` (`syncBatch`, `alarm`, `write`), `app/worker/router.ts:237` (log com `deferred`)
- Modify: `app/tests/worker/helpers.ts` (`stubOf(user)`, `setState(user, key, value)` por `runInDurableObject`)
- Test: `app/tests/worker/quota.test.ts` (novo), `app/tests/worker/snapshots.test.ts`

**Interfaces:**
- Consumes: `applyChanges(…, { mode: 'server', quota: { active } })` e `activeDelta` (Task 1); `isCompacted`, `TOMBSTONE_KEEP_MS` (Task 2); `DAILY_WRITE_BUDGET`, `COMPACT_PER_DAY`, `utcDay`, `nextUtcDay` (Task 3).
- Produces (`records-sql.ts`): `type Row`, `rowToChange(r: Row): Change`, `RECORDS_SCHEMA: readonly string[]`, `UPSERT_RECORD: string`.
- Estado novo no objeto (tabela `state`): `active` (JSON `ActiveCounts`; sem ele, nasce de `SELECT store, count(*) … WHERE deleted_at IS NULL GROUP BY store`, para as contas do beta), `writes` (JSON `{ day, n }`, dia UTC). `syncBatch`: `room = max(0, DAILY_WRITE_BUDGET − gravadas hoje)`; só `req.changes.slice(0, room)` entra em `applyChanges`; `active += activeDelta`; `writes.n += writes.length`; a resposta leva `accepted` do pedaço lido, `deferred = req.changes.length − lidas` e `retryAt = nextUtcDay(now)` (os dois só quando `deferred > 0`); o recebimento (`changes`, `cursor`, `more`) segue igual. A restauração (Task 5) também soma `activeDelta`.
- Compactação: no `alarm`, antes da cópia, `UPDATE records SET data = '{}'` nos solves com `deleted_at < now − TOMBSTONE_KEEP_MS` e `data <> '{}'`, no máximo `min(COMPACT_PER_DAY, room)` linhas, sem revisão nova (quem já viu o solve não recebe nada; quem está antes da revisão dele recebe a marca), somadas em `writes`.

- [ ] **Step 1: Escreva os testes que falham** em `quota.test.ts` (os registros via `/api/sync`, os contadores semeados com `setState`):
  - `'com 100 mil solves ativos, o solve novo volta com o motivo "cota"; editar e apagar passam'` (`active` semeado em `{ solves: 100_000, … }`).
  - `'numa conta de antes da cota, o contador nasce da contagem do banco'`.
  - `'passado o orçamento do dia, o resto do lote volta em deferred, com retryAt à meia-noite UTC, e nada dele é gravado'` (`writes` semeado em `19_900`, lote de 500 → `accepted` 100, `deferred` 400, os 400 ausentes num pull de outro aparelho).
  - `'com o orçamento cheio, o recebimento continua'` (`changes`, `cursor` e `more` como sem orçamento).
  - `'no dia seguinte (UTC) o orçamento volta'`.
  - `'cota e orçamento no mesmo lote'` (Review Focus 3): `active` no limite e `writes` em `19_998`, lote [novo, edição, novo2, edição2] → `rejected` [novo], `deferred` 1.
  - Em `snapshots.test.ts`: `'o alarme guarda só a marca dos solves apagados há mais de 30 dias: data {}, mesma revisão, mesmas datas'`; `'no máximo COMPACT_PER_DAY por alarme'`; `'um aparelho que começa do zero recebe a marca e a cópia do dia não a leva'`.
- [ ] **Step 2: Rode e confira que falham** — `./node_modules/.bin/vitest run -c vitest.worker.config.ts tests/worker/quota.test.ts tests/worker/snapshots.test.ts` → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces; `account-store.ts` passa a importar o SQL de `records-sql.ts`.
- [ ] **Step 4: Rode e confira que passam** — os dois arquivos, a suíte do Worker e o check → PASS.
- [ ] **Step 5: Commit** — `feat(conta): a cota, o orçamento de gravações do dia e as marcas compactadas no objeto da conta`.

---

### Task 5: As cópias dentro do grátis do R2

**Files:**
- Modify: `app/worker/account-store.ts` (`takeSnapshot`, `restoreSnapshot`, novo `listCopies`, `syncBatch` com `copiesPaused`), `app/worker/snapshots.ts` (`listCopiesIn`, que sai de `router.ts:166-181`), `app/worker/router.ts:183-189,241-262`, `app/worker/budget.ts` (`recountStorage`), `app/worker/index.ts:14-18`
- Test: `app/tests/worker/copies.test.ts` (novo), `app/tests/worker/cleanup.test.ts`, `app/tests/worker/snapshots.test.ts` (as listas passam a vir como `CloudCopies`)

**Interfaces:**
- Consumes: `capsOf`, `takeOps`, `countOps`, `reserveStorage`, `setStorage`, `RESTORES_PER_DAY`, `COPIES_CACHE_MS`, `DAILY_WRITE_BUDGET` (Task 3); `CloudCopies`, `CopiesPaused`, `RestoreRefusal` (Task 1).
- Produces:
  ```ts
  // snapshots.ts
  export function listCopiesIn(bucket: R2Bucket, userId: string): Promise<{ copies: CloudCopy[]; pages: number }>;
  // AccountStore
  listCopies(now: number): Promise<CloudCopies | 'r2-budget' | 'deleted'>;
  restoreSnapshot(name: string, now: number): Promise<'ok' | 'not-found' | 'deleted' | RestoreRefusal>;
  // budget.ts
  export function recountStorage(env: Env, now: number): Promise<number | null>; // null: sem operações A no mês, o valor fica
  ```
- Regras: a cópia do dia reserva o espaço (`gz.byteLength`) e uma operação A antes do `put`; recusada, não grava, não marca `snapshotRev` (tenta no dia seguinte) e grava `copiesPaused` (`'space'` ou `'ops'`) no estado, que todo `SyncResponse` leva; gravada, `copiesPaused` volta a null. A lista fica no estado (`copies`: `{ at, list, paused }`) por `COPIES_CACHE_MS`; uma cópia gravada e um `not-found` a renovam; sem operação A no mês, devolve a guardada (mesmo velha) ou `'r2-budget'`. Restaurar confere, nesta ordem, antes de qualquer gravação: `deleted`; restaurações do dia (`restore-limit`); duas operações B (`get` e `head`, senão `r2-budget`); a cópia (`not-found`); o número de mudanças de `restoreChanges(...)` maior que `DAILY_WRITE_BUDGET` (`too-big`) ou que o que sobra hoje (`write-budget`); espaço para a cópia de antes (`no-room`, spec 7.3) e uma operação A. As gravações da restauração somam em `writes` e o `activeDelta` dela em `active`; só `'ok'` conta como restauração do dia. Apagar a conta conta as listagens com `countOps`, sem recusar. A limpeza diária reconta o espaço listando `snap/` (uma operação A por página, `takeOps`).
- HTTP: `GET /api/snapshots` → 200 `CloudCopies`, 503 `{ error: 'r2-budget' }` ou, conta apagada, 401 `auth`; restaurar → 204, 404 `not-found`, e `{ error: <RestoreRefusal> }` com `no-room` 409, `restore-limit` 429, `r2-budget` 503, `too-big` 413, `write-budget` 429.

- [ ] **Step 1: Escreva os testes que falham** em `copies.test.ts` (o espaço e as operações semeados direto no D1, `r2_storage` e `r2_ops`):
  - `'perto do teto do espaço a cópia do dia não é gravada, o sync diz paused "space", e com espaço ela volta'`.
  - `'sem operações A no mês, a cópia não sai (paused "ops")'`.
  - `'a lista fica guardada por 10 minutos: o segundo pedido não lista o bucket; uma cópia nova a renova'` (um Proxy em `SNAPSHOTS.list` conta as chamadas, como `holdUploads`).
  - `'sem operações A, devolve a lista guardada; sem lista guardada, 503 r2-budget'`.
  - `'a quarta restauração do dia recebe 429 restore-limit'`.
  - `'sem espaço para a cópia de antes, 409 no-room e nada muda na conta'` (spec 7.3).
  - `'sem operações B, 503 r2-budget antes de ler a cópia'`.
  - `'acima de 20 mil gravações, 413 too-big; acima do que sobra hoje, 429 write-budget'`.
  - `'uma cópia que sumiu (404) renova a lista'`.
  - Em `cleanup.test.ts`: `'a limpeza reconta o espaço listando snap/: o que a regra de 30 dias apagou sai da conta'`; `'sem operações A no mês, não reconta e o valor fica'`.
- [ ] **Step 2: Rode e confira que falham** — `copies.test.ts`, `cleanup.test.ts`, `snapshots.test.ts` → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os três arquivos, a suíte do Worker e o check → PASS.
- [ ] **Step 5: Commit** — `feat(conta): as cópias na nuvem dentro do grátis do R2 — espaço, operações, lista guardada e restaurações por dia`.

---

### Task 6: "Só neste aparelho" e o orçamento no app

**Files:**
- Modify: `app/src/core/sync/types.ts:81-92` (`SyncState`), `app/src/data/db.ts:40` (chave `held` da meta), `app/src/data/repository.ts` (`defaultSyncState` `:279`, `countLocalOnly` `:363`, `confirmSent` `:1065`, `applyRemote` `:1088`, `beginFirstSync`, `forgetAccount`, interface `:96-145`), `app/src/sync/engine.ts` (`SyncStatus`, `exchange`, `round`)
- Modify: `app/tests/unit/sync-fakes.ts` (`FakeServer` com cota e orçamento)
- Test: `app/tests/unit/repository-outbox.test.ts`, `app/tests/unit/sync-engine.test.ts`

**Interfaces:**
- Consumes: `QUOTA_REASON`, `ACCOUNT_LIMITS`, `ActiveCounts` (Task 1); `SyncResponse.deferred/retryAt/copiesPaused` (Task 1).
- Produces:
  - `SyncState` ganha `pushAfter: number | null` (nada sobe antes disso) e `copiesPaused: CopiesPaused | null`; os dois null no padrão.
  - meta `'held'`: `string[]` de chaves `${store}/${id}`.
  - `confirmSent(sent: readonly OutboxEntry[], held?: readonly OutboxEntry[]): Promise<void>` — numa transação (`outbox` e `meta`): tira da fila o que não mudou, e as entradas de `held` que saíram da fila entram na lista; com alguma, avisa `'sync'`.
  - `heldCount(): Promise<number>`; `requeueHeld(): Promise<number>` (põe na fila o que ainda existe, esvazia a lista, avisa `'sync'`, devolve quantos voltaram).
  - `localOnlyCount()` soma a lista (o apagar dos dados recusa com `LocalOnlyError`, decisão 32 do 5a); `beginFirstSync` (quando começa de verdade, não no caminho da mesma conta) e `forgetAccount` esvaziam a lista.
  - `applyRemote(…, after?: Pick<SyncState, 'cursor' | 'lastSyncAt'> & { build?: string; copiesPaused?: CopiesPaused | null; pushAfter?: number | null })`.
  - `SyncStatus.notice: SyncNotice`, com `export type SyncNotice = 'quota' | 'budget' | null` (`idleStatus()` com null).
  - `FakeServer(batch = 500, opts: { limits?: Readonly<ActiveCounts>; budget?: number } = {})` e `newDay()`.
- Motor: `push` só sem `pushAfter` no futuro; da resposta, `taken = sent` menos as últimas `deferred`; os recusados com `QUOTA_REASON` vão em `held`; `confirmSent(taken, held)`; `refused` não conta os guardados; com `deferred > 0` e `retryAt` no futuro, grava `pushAfter = retryAt` pelo `applyRemote` e a rodada só recebe até `more` acabar (com `retryAt <= agora`, não pausa: manda o resto na mesma rodada); enquanto `pushAfter` estiver no futuro com fila, o estado sai com `notice: 'budget'`; uma rodada com algum guardado sai com `notice: 'quota'`. Sem reenvio automático.

- [ ] **Step 1: Escreva os testes que falham.**
  - `repository-outbox.test.ts`: `'confirmSent guarda os recusados pela cota fora da fila e avisa sync'`; `'um recusado gravado de novo durante o pedido fica na fila'`; `'localOnlyCount soma os guardados, e apagar os dados recusa'`; `'requeueHeld põe de volta na fila só o que existe e esvazia a lista'`; `'beginFirstSync e forgetAccount esvaziam a lista'`.
  - `sync-engine.test.ts` (com `FakeServer(500, { limits: { solves: 2, sessions: 10, practice: 10 } })`): `'a cota: o terceiro solve sai da fila, fica só neste aparelho, não volta sozinho, e o estado diz quota'`; `'Enviar de novo com vaga na conta sobe e zera a lista'`; Review Focus 2: `'um solve guardado e depois apagado aqui sobe como apagado e sai da lista'`, `'editado, continua guardado e nada some do aparelho'`, `'restaurado da lixeira com a conta cheia volta para a lista'`.
  - `sync-engine.test.ts` (com `budget: 3`): Review Focus 3: `'o orçamento corta o lote: o resto fica na fila na mesma ordem, a rodada continua recebendo, nada sobe antes de retryAt, e depois sobe'`; `'cota e orçamento no mesmo lote'`; `'a resposta grava copiesPaused no estado do sync'`.
- [ ] **Step 2: Rode e confira que falham** — os dois arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os dois arquivos, a suíte unitária inteira (o `sync-sim.test.ts` e os testes da conta usam o `FakeServer`) e o check → PASS.
- [ ] **Step 5: Commit** — `feat(conta): os recusados pela cota ficam só neste aparelho, e o orçamento do dia deixa o resto para amanhã`.

---

### Task 7: Cota, orçamento e cópias na tela

**Files:**
- Modify: `app/src/sync/api.ts` (`ApiError`, `call`, `cloudCopies`), `app/src/ui/state/account.svelte.ts` (`held`, `refresh`, `resendHeld`, `cloudCopies`, `restoreCloudCopy`), `app/src/ui/sync-status.ts` (`syncLine`), `app/src/ui/ajustes/AccountSection.svelte`, `app/src/ui/dialogs/CloudCopiesDialog.svelte`, `app/src/ui/dialogs/SignInDialog.svelte:366-374`, `app/src/strings.ts`, `app/tests/unit/sync-account.ts` (o falso de `cloudCopies`)
- Test: `app/tests/unit/sync-status.test.ts`, `account-section.test.ts`, `cloud-account.test.ts`, `sign-in-dialog.test.ts`

**Interfaces:**
- Consumes: `heldCount`, `requeueHeld`, `SyncState.copiesPaused`, `SyncStatus.notice` (Task 6); `CloudCopies`, `RestoreRefusal`, `CopiesPaused` (Task 1).
- Produces: `ApiError(kind, status, code: string | null = null)`, com `code` lido do `{ error }` (ou `{ code }`) da resposta que não é ok, sem quebrar se o corpo não for JSON; `SyncApi.cloudCopies(account): Promise<CloudCopies>`; `AccountState.held: number` (`$state`, relido em `refresh`); `AccountState.resendHeld(): Promise<number>` (requeue e "Sincronizar agora"); `AccountState.cloudCopies(): Promise<CloudCopies>`; `AccountState.restoreCloudCopy(name): Promise<'ok' | 'gone' | 'failed' | RestoreRefusal>` (o `code` do `ApiError` quando é um `RestoreRefusal`).
- Cópia exata (`T.conta`):
  ```ts
  quotaFull: 'A conta chegou ao limite de 100 mil solves. Os novos ficam só neste aparelho.',
  budgetDeferred: 'Muita coisa para subir hoje: o resto sobe amanhã.',
  heldCount: (n: number): string => (n === 1 ? '1 registro só neste aparelho' : `${n.toLocaleString('pt-BR')} registros só neste aparelho`),
  heldResend: 'Enviar de novo',
  heldResent: 'De volta à fila. Se a conta continuar cheia, eles ficam só neste aparelho.',
  cloudPaused: (why: CopiesPaused): string =>
    why === 'space' ? 'Cópias na nuvem pausadas: o espaço gratuito encheu.' : 'Cópias na nuvem pausadas até o mês que vem: o limite gratuito do mês acabou.',
  cloudNoRoom: 'Não há espaço para guardar o estado de agora antes de restaurar. Tudo continua como estava.',
  cloudRestoreLimit: 'Já foram restaurações demais hoje. Tente de novo amanhã.',
  cloudOpsLimit: 'As cópias na nuvem pararam até o mês que vem: o limite gratuito acabou. Tudo continua como estava.',
  cloudTooBig: 'Esta conta é grande demais para restaurar uma cópia na nuvem. As cópias deste aparelho continuam valendo.',
  cloudWriteBudget: 'A conta já gravou muita coisa hoje. Tente restaurar amanhã.',
  doneTomorrow: 'Pronto por hoje. O resto sobe amanhã, sozinho.',
  ```
- Onde aparece: `syncLine` na fase `idle` troca "Sincronizado…" por `quotaFull` (notice `'quota'`) ou `budgetDeferred` (`'budget'`); em Ajustes, com `held > 0`, uma linha `heldCount(held)` com a dica `quotaFull` e o botão `heldResend` (toast `heldResent`), logo abaixo da linha do sync; com `copiesPaused`, a dica de "Cópias na nuvem" vira `cloudPaused(...)`, e o diálogo das cópias a mostra no topo; cada `RestoreRefusal` vira o toast dele (`r2-budget` também na lista que não carrega); no passo 4 do diálogo de entrar, com "Pronto" e notice `'budget'`, a linha é `doneTomorrow`, e com `'quota'`, `quotaFull` abaixo de `T.conta.done`.

- [ ] **Step 1: Escreva os testes que falham.**
  - `sync-status.test.ts`: `'idle com a cota cheia diz o limite; com o orçamento, que o resto sobe amanhã'`.
  - `account-section.test.ts`: `'com registros só neste aparelho, Ajustes mostra quantos e "Enviar de novo" os põe na fila'` (toast `heldResent`, `heldCount()` 0 depois); `'sem nenhum, a linha não aparece'`; `'com as cópias pausadas, a dica diz por quê'`.
  - `cloud-account.test.ts`: `'cada recusa da restauração mostra a mensagem dela e nada muda'` (um caso por `RestoreRefusal`); `'a lista sem operações no mês mostra cloudOpsLimit'`; `'o código do erro chega no ApiError; um corpo que não é JSON dá code null'`.
  - `sign-in-dialog.test.ts`: `'primeiro sync com o orçamento do dia cheio: Pronto diz que o resto sobe amanhã'`.
- [ ] **Step 2: Rode e confira que falham** — os quatro arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os quatro arquivos, a suíte unitária e o check → PASS.
- [ ] **Step 5: Commit** — `feat(conta): a cota, o resto que sobe amanhã e as cópias pausadas em Ajustes e no sync`.

---

### Task 8: Correções 5.1, 5.3 e 5.4 da revisão

**Files:**
- Modify: `app/src/data/repository.ts:1260`; `app/worker/router.ts:217-218` (`DELETE /api/account` sem sessão); `app/src/ui/state/account.svelte.ts` (`deleteAccount`); `app/src/ui/dialogs/DeleteAccountDialog.svelte`; `app/src/ui/dialogs/CloudCopiesDialog.svelte:43-64`; `app/src/ui/ajustes/AccountSection.svelte:117-132`; `app/src/strings.ts`
- Create: `app/src/ui/confirm.ts`
- Test: `app/tests/unit/repository-sync.test.ts`, `app/tests/worker/snapshots.test.ts`, `app/tests/unit/cloud-account.test.ts`, `app/tests/unit/account-section.test.ts`

**Interfaces:**
- 5.1: a condição vira `emptied.has(current) || !record || record.deletedAt !== null`.
- 5.3: sem sessão, `DELETE /api/account` com `ACCOUNT_HEADER` de um id que não está em `"user"` no D1 → `401 { error: 'gone' }`; o resto, `401 { error: 'auth' }` como hoje (o id é aleatório, só o aparelho o conhece). `AccountState.deleteAccount(email): Promise<'ok' | 'mismatch' | 'auth' | 'failed'>`: 400 → `'mismatch'`; 401 `gone` → sai da conta como no apagar bem-sucedido (`forgetAccount`) e devolve `'ok'`; outro 401 → `resumeSync()` e `'auth'`; o resto → `'failed'`. O diálogo, em `'auth'`, mostra `T.conta.deleteSignInAgain = 'Sua sessão expirou. Entre de novo para apagar a conta.'` com o botão `T.conta.signInAgain`, que abre o diálogo de entrar.
- 5.4: em `confirm.ts`, `export const CONFIRM_DELAY_MS = 400; export function confirmReady(armedAt: number | null, now: number): boolean` (armado e `now − armedAt >= CONFIRM_DELAY_MS`). "Restaurar este dia" e "Sair de todos os aparelhos" guardam a hora do primeiro clique; um segundo clique antes disso é ignorado e o botão continua armado.

- [ ] **Step 1: Escreva os testes que falham.**
  - `repository-sync.test.ts`: `'a "Sessão 1" padrão que está na lixeira deixa de ser a atual depois do primeiro login'` → `currentSessionId` vira a sessão da conta do mesmo evento.
  - `snapshots.test.ts`: `'apagar a conta sem sessão: 401 gone para uma conta que já não existe, 401 auth para uma que existe'`.
  - `cloud-account.test.ts`: `'400 do servidor diz que o e-mail não confere'`; `'401 de sessão vencida pede para entrar de novo e o sync volta'`; `'401 de conta já apagada sai da conta como no apagar'`; `'o segundo clique em "Restaurar este dia" antes de 400 ms não restaura; depois, restaura'` (relógio falso do Vitest).
  - `account-section.test.ts`: `'o segundo clique em "Sair de todos os aparelhos" antes de 400 ms não confirma'`; `'CONFIRM_DELAY_MS é 400'`.
- [ ] **Step 2: Rode e confira que falham** — os quatro arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os quatro arquivos, as duas suítes e o check → PASS.
- [ ] **Step 5: Commit** — `fix(conta): a "Sessão 1" da lixeira, os erros de apagar a conta e o clique duplo que confirmava`.

---

### Task 9: Correções 5.5, 5.6 e 5.7 da revisão

**Files:**
- Modify: `app/src/ui/state/account.svelte.ts` (mensagem `busy`, `busyChanged`, o `busy` do motor, `stop`), `app/src/ui/state/app.svelte.ts:258-267,316` (`timerBusy`, `pendingInspect` e `trainerRunning` viram getter e setter sobre `$state` privado que chamam `account?.busyChanged()`), `app/src/ui/dialogs/SignInDialog.svelte` (`verify` `:142`, `progress` `:45`, `reset` `:56`)
- Test: `app/tests/unit/account-state.test.ts`, `app/tests/unit/app-state.test.ts`, `app/tests/unit/sign-in-dialog.test.ts`

**Interfaces:**
- 5.5: `Message` ganha `{ type: 'busy'; tab: string; busy: boolean }`; `AccountState.busyChanged(): void` (manda quando o `host.busy()` desta aba muda e, enquanto ocupada, a cada `BUSY_BEAT_MS = 5_000` pelo `env.schedule`, só com a conta dentro); a líder guarda as abas ocupadas com a hora (`host.now()`) em que ouviu cada uma e as solta depois de `BUSY_STALE_MS = 15_000` sem notícia (as duas constantes exportadas de `account.svelte.ts`); o `busy` do motor vira `host.busy() || alguma aba ocupada`; no `'ask'`, uma aba ocupada responde; no `stop()`, manda `busy: false`.
- 5.6: o diálogo guarda que chegou a "Pronto" (`$state`, zerado em `reset`) e mostra "Pronto" até fechar, mesmo com o estado da conta voltando para `'started'` ou `'waiting'`.
- 5.7: `verify` guarda `round` antes de esperar `verifyCode` (nos dois caminhos, com e sem movimento); se o diálogo fechou, não segue para o próximo passo, e no caminho `'other-account'` chama `cancelSignIn()`.

- [ ] **Step 1: Escreva os testes que falham.**
  - `account-state.test.ts`: `'as esperas da aba ocupada: BUSY_BEAT_MS 5 s e BUSY_STALE_MS 15 s'`; `'a líder não começa uma rodada enquanto outra aba está ocupada, e começa quando ela fica livre'`; Review Focus 4: `'uma aba ocupada que some sem avisar deixa de segurar o sync depois de 15 s'`; `'sem conta, nenhuma mensagem busy sai'`.
  - `app-state.test.ts`: `'mudar timerBusy, pendingInspect ou trainerRunning avisa a conta'`.
  - `sign-in-dialog.test.ts`: `'depois de Pronto, outra rodada não tira o Pronto'`; `'depois de Pronto, sair noutra aba não tira o Pronto'`; `'fechar durante a conferência de um primeiro login não continua a entrada'` (nenhum `continueSignIn`); `'fechar durante a conferência de outra conta sai da sessão nova'` (o `signOut` do falso foi chamado).
- [ ] **Step 2: Rode e confira que falham** — os três arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os três arquivos, a suíte unitária e o check → PASS.
- [ ] **Step 5: Commit** — `fix(conta): o sync espera o solve de qualquer aba, o Pronto não volta atrás e fechar na conferência para a entrada`.

---

### Task 10: Correção 5.2 — exportar quando a atualização dos dados falha

**Files:**
- Modify: `app/src/data/db.ts:74-113` (a montagem do arquivo de `migrateToV3` sai para uma função que as duas usam), `app/src/ui/App.svelte:40-41,312-315` (prop `reload`), `app/src/strings.ts` (`T.data`)
- Test: `app/tests/unit/migration-v3.test.ts`, `app/tests/unit/app-shell.test.ts`

**Interfaces:**
- Produces: `exportStuckDb(name: string = DB_NAME, now: number = Date.now()): Promise<KlickExport>` — abre com `openDB(name)` sem versão e sem `upgrade` (a versão que está lá), lê solves, sessões, treino (se a store existir) e o perfil, monta o arquivo como `migrateToV3` monta a cópia "antes da v3", e fecha. App: prop `reload?: () => void` (padrão `() => location.reload()`); "Exportar meus dados" baixa `downloadText(backupFileName(now), JSON.stringify(arquivo))`.
- Cópia exata (`T.data`):
  ```ts
  upgradeFailed: 'Não consegui atualizar seus dados para esta versão. Eles continuam guardados neste aparelho como estavam. Exporte uma cópia agora, libere espaço no aparelho e tente de novo.',
  upgradeExport: 'Exportar meus dados',
  upgradeRetry: 'Tentar de novo',
  upgradeExportFailed: 'Não consegui ler os dados antigos. Libere espaço no aparelho e tente de novo.',
  ```

- [ ] **Step 1: Escreva os testes que falham.**
  - `migration-v3.test.ts`: `'exportStuckDb lê um banco da versão 2 sem mudar a versão nem os dados'` → o arquivo tem as sessões, os solves, o treino e o perfil; reaberto, o banco continua na versão 2 com o mesmo conteúdo; `'num banco da versão 1, o arquivo sai sem treino'`.
  - `app-shell.test.ts`: `'a atualização que falhou oferece exportar (baixa klick-*.json) e tentar de novo (recarrega)'`; `'a leitura que falha mostra upgradeExportFailed'`.
- [ ] **Step 2: Rode e confira que falham** — os dois arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os dois arquivos, a suíte unitária e o check → PASS.
- [ ] **Step 5: Commit** — `fix(dados): a atualização que falha oferece exportar os dados e tentar de novo`.

---

### Task 11: Medir uma conta de 100 mil solves

**Files:**
- Create: `app/vitest.perf.config.ts` (ambiente `node`, `include: ['tests/perf/**/*.perf.ts']`, os processos da medição com `--expose-gc`, prazo de 10 min), `app/tests/perf/account-100k.perf.ts`, `docs/superpowers/measurements/2026-10-17-conta-100k.md` (escrito pela medição)

**Interfaces:**
- Consumes: `RECORDS_SCHEMA`, `UPSERT_RECORD`, `rowToChange` (Task 4); `applyChanges`, `restoreChanges`, `exportFromRecords`, `accountPrefsOf` (núcleo); gzip pelo `CompressionStream` do Node, como `worker/snapshots.ts`.
- Por quê no Node: dentro do workerd o relógio não anda durante a CPU de um pedido, então a CPU só se mede fora dele; o `node:sqlite` roda o mesmo SQL do objeto da conta.
- Contas medidas: N ∈ {1.000, 5.000, 10.000, 25.000, 50.000, 100.000} solves, mais 20 sessões, N/10 tentativas do treino e os ajustes padrão. Para cada N: a cópia diária (ler as linhas, montar o arquivo, gzip), a restauração (gunzip, `restoreChanges`, `applyChanges`, gravar), um pedido de envio do primeiro sync (500 mudanças numa conta de N), um pedido de recebimento (página de 500) e a contagem inicial dos ativos. Métricas: CPU (`process.cpuUsage`), relógio, heap depois de `gc()` e o pico, e o tamanho do gzip.
- Regra de decisão (escrita no documento): o grátis dá 10 ms de CPU por pedido e 128 MB; a medição no Node conta metade, para a diferença do workerd e do SQLite do objeto. Cabe se **CPU ≤ 5 ms e memória ≤ 64 MB**. Por operação: (a) envio ou recebimento a 100 mil que não cabe → o maior de {500, 250, 100, 50} por pedido que cabe; se nem 50 cabe, `ACCOUNT_LIMITS.solves` desce para o maior N em que o sync cabe (o único caso da spec 7.2 em que a cota baixa); (b) cópia → `SNAPSHOT_MAX_RECORDS` = o maior N medido que cabe (0 se nenhum); (c) restauração → `RESTORE_MAX_RECORDS` do mesmo jeito. Tudo cabendo a 100 mil, a Task 12 não roda.

- [ ] **Step 1: Escreva a medição** — `account-100k.perf.ts` monta cada conta num `DatabaseSync(':memory:')` com `RECORDS_SCHEMA`, mede cada operação três vezes (fica a mediana) e escreve o documento com uma tabela por operação (N × CPU ms × relógio ms × memória MB × gzip KB), a regra acima e o veredito de cada operação (`cabe` / `não cabe → valor`).
- [ ] **Step 2: Rode** — `./node_modules/.bin/vitest run -c vitest.perf.config.ts` → o documento existe com as seis contas e um veredito por operação. Ela fica fora de `pnpm test` e de `test:worker`.
- [ ] **Step 3: Confira as suítes** — unit e Worker inteiras e o check → PASS (nada do app mudou).
- [ ] **Step 4: Commit** — `docs(conta): a medição de uma conta de 100 mil solves no plano gratuito`.

---

### Task 12 (só se o documento da Task 11 disser "não cabe"): Os tamanhos que cabem

Roda só se algum veredito da Task 11 for "não cabe". Cada item abaixo entra só se a operação dele não coube; os números são os do documento. A cópia em pedaços ao longo de vários alarmes (a primeira opção da spec 4.4) muda o formato das cópias e fica para uma spec própria, a pedir ao Ranielli: este plano aplica o que a spec 7.2 manda quando dividir não está pronto.

**Files:**
- Modify: `app/worker/limits.ts` (os valores medidos), `app/worker/account-store.ts` (`takeSnapshot`, `restoreSnapshot`, `syncBatch`), `app/src/core/sync/types.ts` (`CopiesPaused` com `'size'`), `app/src/core/sync/limits.ts` (só no caso (a) sem saída), `app/src/strings.ts`
- Test: `app/tests/worker/copies.test.ts`, `app/tests/worker/quota.test.ts`, `app/tests/unit/sync-limits.test.ts`, `app/tests/unit/account-section.test.ts`

**Interfaces:**
- `SNAPSHOT_MAX_RECORDS`, `RESTORE_MAX_RECORDS`, `MAX_WRITES_PER_REQUEST`, `PULL_PAGE` em `worker/limits.ts`, cada um com o valor medido. Acima de `SNAPSHOT_MAX_RECORDS` linhas, a cópia do dia não sai e `copiesPaused` vira `'size'`, com `T.conta.cloudPaused('size') = 'Cópias na nuvem pausadas: a conta passou do tamanho que o plano gratuito copia.'`; acima de `RESTORE_MAX_RECORDS`, a restauração é `'too-big'`. `MAX_WRITES_PER_REQUEST` corta o lote como o orçamento do dia, mas com `retryAt = now` (o motor da Task 6 só pausa quando `retryAt > now`, então manda o resto em seguida); `PULL_PAGE` é o `LIMIT` da página de volta (`more` e o cursor já cobrem). No caso (a) sem saída, `ACCOUNT_LIMITS.solves` e o texto de `quotaFull` mudam juntos.

- [ ] **Step 1: Escreva os testes que falham** — um por item que entra: `'as constantes medidas'`; `'acima de SNAPSHOT_MAX_RECORDS a cópia do dia não sai e o sync diz paused "size"'`; `'acima de RESTORE_MAX_RECORDS, 413 too-big'`; `'um lote maior que MAX_WRITES_PER_REQUEST volta com deferred e retryAt = agora, e o motor manda o resto na mesma rodada'`; `'Ajustes diz que a conta passou do tamanho'`.
- [ ] **Step 2: Rode e confira que falham** — os arquivos da lista → FAIL.
- [ ] **Step 3: Implemente** os itens que entram.
- [ ] **Step 4: Rode e confira que passam** — os arquivos, as duas suítes e o check → PASS; rode a medição de novo e confirme no documento que os valores aplicados cabem.
- [ ] **Step 5: Commit** — `feat(conta): as contas grandes dentro do plano gratuito — os tamanhos medidos`.
