# Cópias na nuvem para contas grandes — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda conta tem cópia na nuvem até a cota, e restaurar um dia funciona para qualquer tamanho de conta, sem sair do grátis.

**Architecture:** A restauração passa a gravar só o que difere entre a conta e a cópia (`diffSlice` no núcleo, o mesmo no aparelho e no servidor). Uma conta com mais de `COPY_PART_RECORDS` registros é copiada em partes, em ordem de chave (`store, id`), com um manifesto no lugar do arquivo de hoje; o servidor compara a cópia com a conta parte a parte, cada parte contra a faixa de chaves dela, com a memória do tamanho de uma parte. Quando as mudanças cabem no dia, o servidor restaura como hoje; quando não cabem, ele responde "pelo aparelho": o app baixa a cópia pelo Worker, guarda a cópia automática local, aplica as diferenças e o sync sobe o resto no ritmo do orçamento.

**Tech Stack:** Svelte 5 (runes), TypeScript strict, `idb`, Vitest (jsdom e Workers pool), Playwright, Cloudflare Worker + Durable Object (SQLite) + R2 + D1.

**Spec:** `docs/superpowers/specs/2026-10-20-klick-copias-grandes-design.md`

## Global Constraints

- Custo zero: nenhum serviço novo; toda leitura e gravação do R2 reserva a operação antes (`takeOps`, `reserveCopy`); toda leitura do SQLite do objeto conta (`countReads`); toda gravação de registro reserva as linhas (`reserveDay`) como hoje.
- Valores em `worker/limits.ts`, com teste: `COPY_PART_RECORDS = 5_000`, `BIG_COPY_EVERY_DAYS = 7`, `COPY_PART_READS_PER_DAY = 200`. Vars: `SNAPSHOT_MAX_RECORDS` vira `"250000"` no beta e na raiz; `RESTORE_MAX_RECORDS` fica `"5000"` e passa a contar mudanças da restauração, não registros da conta.
- Uma conta com até `COPY_PART_RECORDS` registros continua com um arquivo só (`snap/<user>/<nome>.json.gz`, um `KlickExport`), e toda cópia que já existe continua restaurando.
- Uma cópia em partes é o manifesto mais todas as partes, ou nada: as partes vão antes, o manifesto por último; parte sem manifesto não aparece na lista.
- A restauração no servidor continua tudo-ou-nada e sempre com a cópia de antes; a do aparelho sempre com a cópia automática local antes de gravar qualquer coisa.
- O app de antes (sem `device` no pedido) nunca recebe a resposta nova: recebe `too-big`/`write-budget` como hoje.
- Sem conta, nada muda.
- Textos novos em português, no tom do app, em `src/strings.ts` (`T.conta`). Comentários em português, na densidade dos arquivos vizinhos.
- Comandos (de `app/`): unit `./node_modules/.bin/vitest run`, worker `./node_modules/.bin/vitest run -c vitest.worker.config.ts`, check `pnpm --config.verify-deps-before-run=false check`, e2e `./node_modules/.bin/playwright test`, e2e do sync `./node_modules/.bin/playwright test -c playwright.sync.config.ts`, medição `./node_modules/.bin/vitest run -c vitest.perf.config.ts`.
- Commits com escopo `copias` (`feat(copias): …`). Nada de push nem deploy.

## Review Focus

1. **O app de antes restaurando uma cópia cujas mudanças não cabem** (sem `device` no corpo): `413 too-big` ou `429 write-budget`, como hoje, nunca um 200 que ele não entende — teste na Task 4.
2. **O download do aparelho falha no meio** (uma parte 404, a rede cai): nada muda no aparelho, nem a cópia automática local é gravada; o resultado é `'gone'` ou `'failed'` — teste na Task 5.
3. **Uma cópia de antes do treino ou dos desafios** (sem as listas) restaurada por diferenças: o treino e os desafios de agora ficam como estão, no aparelho e no servidor — teste na Task 1.
4. **A cópia do dia recusada no meio das partes** (espaço ou operação na parte k): nenhuma parte fica no R2, o espaço reservado volta, e a cópia pausa com o motivo — teste na Task 3.
5. **Uma cópia igual à conta de agora:** `'ok'`, nada gravado, sem cópia de antes, sem linhas reservadas — teste na Task 4.

---

### Task 1: Restaurar só o que mudou, no núcleo

**Files:**
- Modify: `app/src/core/sync/restore.ts`
- Test: `app/tests/unit/restore-diff.test.ts` (novo), `app/tests/unit/sync-snapshot.test.ts`, `app/tests/unit/repository-restore.test.ts`

**Interfaces:**
- Produces (`src/core/sync/restore.ts`):
  - `type RestoreStep = { kind: 'copy'; store: RecordStore; rec: object } | { kind: 'tombstone'; change: Change }`.
  - `interface SliceDiff { steps: RestoreStep[]; floor: number }` — `floor` é o maior `updatedAt + 1` e `deletionStamp + 1` dos registros de agora que a comparação visitou (0 sem nenhum).
  - `diffSlice(current: Iterable<Change>, copy: RestoreCopy, limit = Infinity): SliceDiff` — `current` são os registros de agora de uma faixa (os `prefs` são ignorados). Monta um `Map` da cópia por `syncKey`, percorre `current` uma vez: um registro igual nos dois lados não dá passo; diferente dá `copy`; só em `current`, ativo, dá `tombstone` (fora `practice`/`duels` quando a lista da cópia é `null`); depois, o que sobrou da cópia dá `copy`. Para assim que `steps.length > limit` (devolve `limit + 1` passos).
  - "Igual" = `(c.deletedAt === null) === (rec.deletedAt == null)` e `canonicalJson(c.data) === canonicalJson(toChange(store, rec com as datas).data)` (`canonicalJson` de `merge.ts`).
  - `stampSteps(steps: readonly RestoreStep[], stamp: number): Change[]` — o carimbo de hoje (o `put` atual para `copy`, `{ ...c, updatedAt: stamp, deletedAt: stamp, deletionStamp: stamp }` para `tombstone`), na ordem de hoje: os `copy` de `sessions`, `solves`, `practice`, `duels`, depois os `tombstone`.
  - `prefsRestoreChanges(current: readonly Change[], prefs: ReadonlyMap<string, unknown> | null, stamp: number): Change[]` — as regras de hoje para `prefs`, sem as chaves cujo valor de agora já é o mesmo (`canonicalJson`), e sem voltar ao padrão uma chave que já está nele.
  - `restoreChanges(current, copy, prefs, stamp)` mantém a assinatura e passa a ser `stampSteps(diffSlice(não-prefs).steps, stamp)` seguido de `prefsRestoreChanges(prefs de current, prefs, stamp)`. O `replaceAll` do aparelho (`src/data/repository.ts`) não muda: passa a gravar e pôr na fila só o que mudou.

- [ ] **Step 1: Testes que falham** — `restore-diff.test.ts`: `'um registro igual nos dois lados não é regravado'`; `'conteúdo diferente, exclusão diferente ou só na cópia: um passo copy'` (um caso cada); `'só agora e ativo: tombstone; só agora e já apagado: nada'`; `'cópia sem practice ou sem duels: os de agora ficam como estão'` (Review Focus 3); `'limit: para no limit + 1'`; `'floor é o maior updatedAt + 1 ou deletionStamp + 1 visitado'`; `'prefs: só as chaves que mudam; a que já está no padrão não volta a ele'`; `'stampSteps: copy por store na ordem de hoje, depois tombstones'`. Em `sync-snapshot.test.ts`, o caso `'restaurar a cópia no servidor'` passa a esperar só as mudanças reais. Em `repository-restore.test.ts`, os casos que esperavam `updatedAt >= t` em todo registro e todo registro na fila passam a esperar isso só dos que mudaram, e `'restaurar uma cópia igual à conta não grava nem enfileira nada'`.
- [ ] **Step 2: Rode e confira que falham** — os três arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — a unit inteira e o check → PASS.
- [ ] **Step 5: Commit** — `feat(copias): restaurar grava só o que mudou`.

---

### Task 2: O formato das partes e a lista

**Files:**
- Create: `app/src/core/sync/copy-parts.ts`, `app/src/core/gzip.ts`
- Modify: `app/src/core/sync/types.ts` (`CloudCopy`), `app/worker/snapshots.ts`, `app/src/sync/api.ts` (`isCopy`)
- Test: `app/tests/unit/copy-parts.test.ts` (novo), `app/tests/worker/snapshots.test.ts`

**Interfaces:**
- Produces (`src/core/gzip.ts`): `gzipJson(data: unknown): Promise<ArrayBuffer>` e `gunzipJson(bytes: ArrayBuffer): Promise<unknown>`, movidos de `worker/snapshots.ts`, que os reexporta (o app também lê as partes).
- Produces (`src/core/sync/copy-parts.ts`):
  - `type CopyKey = readonly [store: string, id: string]`.
  - `interface CopyManifest { format: 'klick-parts'; version: 1; exportedAt: number; day: string; profile: ProfilePatch | null; solves: number; parts: { last: CopyKey; records: number }[] }` — `parts[i].last` é a maior chave da parte `i + 1`, como o SQLite a ordena; `solves`, os ativos.
  - `interface CopyPart { sessions: Session[]; solves: Solve[]; practice: Practice[]; duels: Duel[] }`.
  - `isManifest(v: unknown): v is CopyManifest`, `isCopyPart(v: unknown): v is CopyPart` (formas e tipos dos campos; `parts` com 1 a 999 itens).
  - `sliceOf(m: CopyManifest, i: number): { lo: CopyKey | null; hi: CopyKey | null }` — `i` de 0: `lo` = `parts[i - 1].last` (null em 0), `hi` = `parts[i].last` (null na última, para a faixa cobrir as chaves que vieram depois da cópia).
  - `assembleCopy(m: CopyManifest, parts: readonly CopyPart[]): KlickExport` — junta as listas, com `profile` e `exportedAt` do manifesto, `practice` e `duels` sempre listas.
- Produces (`worker/snapshots.ts`): `partKey(userId: string, name: string, i: number): string` = `snap/<user>/<nome>/<i com 3 dígitos>.json.gz` (`i` de 1). `listCopiesIn` lista com `delimiter: '/'` (as partes, numa pasta, ficam de fora) e lê `parts` dos metadados.
- Produces (`CloudCopy`): mais `parts: number` (0 num arquivo só). `isCopy` do app aceita a cópia sem `parts` (um Worker de antes) como `parts: 0`.

- [ ] **Step 1: Testes que falham** — `copy-parts.test.ts`: `'ida e volta: gzipJson e gunzipJson'`; `'isManifest e isCopyPart recusam formas tortas'` (um caso por campo); `'sliceOf: a primeira sem lo, a última sem hi, as do meio emendadas'`; `'assembleCopy junta as partes com o perfil do manifesto'`. Em `snapshots.test.ts`: `'a lista não mostra as partes, só o manifesto, com parts'` (um manifesto com 3 partes no R2 e uma cópia de arquivo só: duas cópias, `parts` 3 e 0).
- [ ] **Step 2: Rode e confira que falham** — os dois arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — a unit, a worker e o check → PASS.
- [ ] **Step 5: Commit** — `feat(copias): o formato da cópia em partes, e a lista sem as partes`.

---

### Task 3: A cópia em partes, a cada 7 dias numa conta grande

**Files:**
- Modify: `app/worker/limits.ts`, `app/worker/records-sql.ts`, `app/worker/account-store.ts` (`takeSnapshot` e um `writeCopy` novo), `app/wrangler.jsonc` (vars e o comentário do topo)
- Test: `app/tests/worker/copies.test.ts`, `app/tests/worker/snapshots.test.ts`, `app/tests/unit/wrangler-config.test.ts`, `app/tests/worker/quota.test.ts`, `app/tests/worker/budget.test.ts`

**Interfaces:**
- Consumes: Task 2 (`CopyManifest`, `CopyPart`, `partKey`, `gzipJson`).
- Produces (`limits.ts`): `COPY_PART_RECORDS = 5_000`, `BIG_COPY_EVERY_DAYS = 7`, `COPY_PART_READS_PER_DAY = 200`; o comentário de `Caps.snapshotRecords` e de `restoreRecords` diz o sentido novo.
- Produces (`records-sql.ts`): `PAGE_AFTER` (os registros sem `prefs` com `(store, id) > (?, ?)`, em ordem de chave, `LIMIT ?`), `RANGE_AFTER` (o mesmo com `(store, id) <= (?, ?)`), `PREFS_ROWS` (os `prefs`).
- Produces (`account-store.ts`): `private writeCopy(userId: string, name: string, meta: { kind: 'daily' | 'pre-restore'; day: string }, now: number, caps: Caps): Promise<{ gz: number } | CopiesPaused>` — conta os registros (`recordCount(COPY_PART_RECORDS)`); até `COPY_PART_RECORDS`, o arquivo só de hoje; acima, as partes de `COPY_PART_RECORDS` registros por `PAGE_AFTER` (cada uma com `exportFromRecords(página).{sessions, solves, practice, duels}`, `reserveCopy` e `put` em `partKey`), depois o manifesto (o `profile` de `exportFromRecords(PREFS_ROWS)`) com `reserveCopy` e `put` em `snapshotKey`, metadados `{ kind, day, solves, parts }`. Uma reserva recusada no meio apaga as partes já gravadas (apagar no R2 não custa operação), devolve o espaço delas (`releaseStorage`) e volta o motivo. `gz` é a soma dos bytes.
- `takeSnapshot`: depois do `'size'` (`SNAPSHOT_MAX_RECORDS`), uma conta com mais de `recordsPerDay(caps.rowsDay)` registros só copia quando `lastSnapshotDay` falta ou ficou `BIG_COPY_EVERY_DAYS` dias ou mais para trás (`dayOf(now)`); fora disso volta `false` sem pausa e sem marcar `snapshotRev`. A gravação passa por `writeCopy`; o resto (estimativa, `snapshotRev`, `lastSnapshotDay`, `copies`) como hoje.
- `wrangler.jsonc`: `SNAPSHOT_MAX_RECORDS` `"250000"` nos dois ambientes; o comentário do topo troca o "subir esta var espera uma restauração em partes" pelo que vale agora (partes, 7 dias, o aparelho restaura o que não cabe).

- [ ] **Step 1: Testes que falham** — em `copies.test.ts` (com `seedSolves`): `'conta com mais de COPY_PART_RECORDS: partes de 5.000 e o manifesto, na lista como uma cópia'` (5.001 registros dão 2 partes; `parts` 2; os metadados com os solves ativos); `'cada parte reserva o espaço e uma operação A; o manifesto também'`; `'espaço ou operação recusados na parte k: nenhuma parte fica, o espaço volta, a cópia pausa'` (Review Focus 4, um caso para `'space'` e um para `'ops'`); `'conta grande copia só a cada BIG_COPY_EVERY_DAYS dias'` (copiou no dia D; D+1 a D+6 não; D+7 sim); `'conta pequena continua com um arquivo só, todo dia'`. Os casos de hoje com `SNAPSHOT_MAX_RECORDS` mudam para o valor novo. `wrangler-config.test.ts` e `quota.test.ts` esperam `250000`.
- [ ] **Step 2: Rode e confira que falham** — os arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — a worker, a unit e o check → PASS.
- [ ] **Step 5: Commit** — `feat(copias): contas grandes copiadas em partes, a cada 7 dias`.

---

### Task 4: A restauração no servidor por diferenças, e a resposta "pelo aparelho"

**Files:**
- Modify: `app/worker/account-store.ts` (`restoreSnapshot`, `copyPart` novo), `app/worker/router.ts`, `app/src/core/sync/types.ts` (o comentário de `RestoreRefusal`)
- Test: `app/tests/worker/copies.test.ts`, `app/tests/worker/snapshots.test.ts`, `app/tests/worker/rows-cap.test.ts` e `app/tests/worker/quota.test.ts` (os casos de restauração que já existem lá)

**Interfaces:**
- Consumes: Task 1 (`diffSlice`, `stampSteps`, `prefsRestoreChanges`), Task 2 (`isManifest`, `isCopyPart`, `sliceOf`, `partKey`), Task 3 (`writeCopy`, `RANGE_AFTER`, `PAGE_AFTER`, `PREFS_ROWS`, `COPY_PART_READS_PER_DAY`).
- Produces (`account-store.ts`):
  - `restoreSnapshot(name: string, now: number, device = false): Promise<'ok' | { parts: number } | 'not-found' | 'deleted' | RestoreRefusal>`.
  - `copyPart(name: string, index: number, now: number): Promise<ArrayBuffer | 'not-found' | 'deleted' | 'restore-limit' | 'r2-budget'>` — `index` 0 é o objeto de `snapshotKey` (o arquivo só ou o manifesto), 1 a N as partes; confere `deleted`, `userId`, a contagem do dia `partReads` contra `COPY_PART_READS_PER_DAY` (`'restore-limit'`), `takeOps('B', 1)` (`'r2-budget'`), soma `partReads` e lê.
- A ordem de `restoreSnapshot` (substitui a de hoje; atualize o comentário longo acima dela):
  1. `deleted`; `restores`/`attempts`/leituras (`restore-limit`); `userId` null e o atalho da lista guardada (`not-found`) — como hoje.
  2. Saem o `too-big` pela contagem da conta e o `write-budget` do mínimo (`least`): a diferença não se sabe antes de ler a cópia.
  3. `copyRoom` com a estimativa (`no-room`, `r2-budget`); `takeOps('B', 2)`; `attempts` + 1; o `get` do objeto (null: `renewCopies`, `not-found`).
  4. Manifesto: `takeOps('B', parts)` (`r2-budget`). Arquivo só: uma faixa `(null, null)` com as listas dele (`practice`/`duels` null quando não são listas, como hoje).
  5. `limit = min(caps.restoreRecords, recordsPerDay(caps.rowsDay))`. Para cada faixa, em ordem: a parte (null ou torta: `renewCopies`, `not-found`), `diffSlice(registros de agora da faixa, parte, limit - passos)` sobre um gerador que pagina `RANGE_AFTER`/`PAGE_AFTER` (contando as leituras), acumulando os passos e o `floor`; acima de `limit`, para.
  6. `stamp` = o maior entre `now`, o `floor` das faixas e `updatedAt + 1`/`deletionStamp + 1` de cada `prefs` de agora; `changes = stampSteps(passos, stamp)` mais `prefsRestoreChanges(PREFS_ROWS, accountPrefsOf(profile, PREFS_ROWS), stamp)`.
  7. Passou de `limit`: com `device`, a resposta do aparelho; sem, `'too-big'`.
  8. Nenhuma mudança: `restores` + 1 e `'ok'`, sem cópia de antes e sem reservar linhas (Review Focus 5).
  9. As linhas (`rowsOf`) contra o que sobra hoje na conta e no ambiente (`dayRoom`): sem lugar, a resposta do aparelho ou `'write-budget'`.
  10. A cópia de antes por `writeCopy` (o `head` de hoje antes), recusa `no-room`/`r2-budget`; `reserveDay`, recusa a resposta do aparelho ou `'write-budget'`; a transação de hoje.
  - A resposta do aparelho: `restores` + 1 e `{ parts }` (o número de partes do manifesto, 0 num arquivo só).
- Produces (`router.ts`):
  - `POST /api/snapshots/:name/restore` lê o corpo (`readJson`; `device === true` liga o caminho novo); `{ parts }` vira `200 { restore: 'device', parts }`; o resto como hoje.
  - `GET /api/snapshots/:name/parts/:index` (`index` `\d{1,3}`), com `copyName`, `accountGuard` pelo cabeçalho e `API_BURST`: o `ArrayBuffer` sai com `Content-Type: application/octet-stream` e `Cache-Control: no-store`; `'deleted'` 401 `auth`, `'not-found'` 404, `'restore-limit'` 429, `'r2-budget'` 503.

- [ ] **Step 1: Testes que falham** — em `copies.test.ts`: `'restaurar grava só as mudanças, e as linhas reservadas são as delas'`; `'conta grande, um dia ruim (uma sessão com 500 solves apagada): restaura no servidor, com a cópia de antes em partes'`; `'mudanças acima do limite, com device: 200 { restore: "device", parts }, nada gravado, restores + 1'`; `'mudanças acima do limite, sem device: 413 too-big; sem lugar hoje: 429 write-budget'` (Review Focus 1); `'cópia igual à conta: 204, nada gravado, sem cópia de antes'` (Review Focus 5); `'parte que sumiu: 404, nada gravado'`; `'a comparação lê cada registro de agora uma vez só'` (as leituras contadas = registros + prefs); `'GET parts: o índice 0 é o objeto, 1..N as partes; o dia tem COPY_PART_READS_PER_DAY leituras; cada uma reserva uma B'`. Os casos de hoje do `too-big` pela contagem e do `write-budget` do mínimo passam a ser pelas mudanças.
- [ ] **Step 2: Rode e confira que falham** — os arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — a worker, a unit e o check → PASS.
- [ ] **Step 5: Commit** — `feat(copias): a restauração por diferenças no servidor, e a resposta pelo aparelho`.

---

### Task 5: A restauração pelo aparelho no app

**Files:**
- Create: `app/src/sync/cloud-restore.ts`
- Modify: `app/src/sync/api.ts`, `app/src/data/safety.ts`, `app/src/ui/state/account.svelte.ts`, `app/src/ui/dialogs/CloudCopiesDialog.svelte`, `app/src/strings.ts`, `app/public/privacidade/index.html`
- Test: `app/tests/unit/cloud-restore.test.ts` (novo), `app/tests/unit/cloud-account.test.ts`, `app/tests/unit/account-section.test.ts` (ou o teste do diálogo das cópias), `app/tests/unit/safety.test.ts`

**Interfaces:**
- Consumes: Task 2 (`isManifest`, `isCopyPart`, `assembleCopy`, `gunzipJson`, `CloudCopy.parts`), Task 4 (as duas rotas).
- Produces (`api.ts`):
  - `type RestoreAnswer = { restore: 'server' } | { restore: 'device'; parts: number }`.
  - `restoreCloudCopy(name, account): Promise<RestoreAnswer>` — manda `{ device: true }`; 204 é `server`; 200 com `restore: 'device'` e `parts` inteiro de 0 a 999 é `device`; qualquer outra forma, `ApiError('server', status)`.
  - `copyPart(name: string, index: number, account: string): Promise<ArrayBuffer>`.
- Produces (`cloud-restore.ts`): `downloadCopy(api: Pick<SyncApi, 'copyPart'>, name: string, account: string): Promise<KlickExport>` — lê o índice 0; manifesto: as partes 1..N, uma de cada vez, e `assembleCopy`; arquivo só: ele; o que não passar por `isKlickExport` rejeita (hoje privado em `safety.ts`: exporte-o).
- Produces (`safety.ts`): `restoreExport(repo: Repository, data: KlickExport, now: number): Promise<void>` — `createBackup(repo, 'pre-restore', now)` e então `repo.replaceAll(data)`.
- `AccountState.restoreCloudCopy(name): Promise<'ok' | 'device' | 'gone' | 'failed' | RestoreRefusal>` — `server`: como hoje. `device`: espera uma rodada (`await this.syncNow()`), `downloadCopy`, `restoreExport(this.host.repo(), data, this.host.now())`, `void this.syncNow()` e `'device'`; um `ApiError` 404 no download é `'gone'`, qualquer outra falha antes de `restoreExport` é `'failed'` sem nada gravado (Review Focus 2).
- Diálogo: no primeiro clique de uma cópia com `parts > 0`, aparece `<small data-cloud-big>{T.conta.cloudBig}</small>` na linha dela; `'device'` mostra `T.conta.cloudRestoredHere` e fecha.
- Textos (`T.conta`), exatos:
  - `cloudBig: 'Esta conta é grande: a restauração chega a este aparelho na hora e aos outros nos próximos dias.'`
  - `cloudRestoredHere: 'Restaurado neste aparelho. Os outros recebem nos próximos dias, pelo sync.'`
  - `cloudHint: 'Uma por dia (numa conta muito grande, uma por semana), por 30 dias. Restaurar troca a conta inteira pelo dia escolhido, em todos os aparelhos.'`
- Privacidade: "As cópias diárias ficam 30 dias" vira "As cópias (uma por dia; numa conta muito grande, uma por semana) ficam 30 dias"; a data da versão vira a do dia do commit.

- [ ] **Step 1: Testes que falham** — `cloud-restore.test.ts`: `'arquivo só: devolve o KlickExport'`; `'manifesto: baixa 1..N em ordem e junta'`; `'parte torta ou 404 rejeita'`. `cloud-account.test.ts`: `'resposta device: sincroniza, baixa, guarda a cópia local e grava só as diferenças'`; `'download que falha no meio: failed, nenhuma cópia local nova, nada gravado'` e `'parte 404: gone'` (Review Focus 2); `'resposta server: ok, como hoje'`; `'api: 200 torto vira ApiError server'`. Teste do diálogo: `'cópia com parts: o primeiro clique mostra o aviso de conta grande'`; `'device mostra o toast de restaurado neste aparelho'`.
- [ ] **Step 2: Rode e confira que falham** — os arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — a unit e o check → PASS.
- [ ] **Step 5: Commit** — `feat(copias): a restauração grande chega pelo aparelho, e o sync sobe o resto`.

---

### Task 6: Ponta a ponta da restauração pelo aparelho

**Files:**
- Modify: `app/worker/router.ts` (rota do ponta a ponta), `app/playwright.sync.config.ts`
- Create: `app/tests/e2e-sync/copies.spec.ts`
- Test: o próprio e2e e `app/tests/worker/` (a rota nova fora do localhost dá 404)

**Interfaces:**
- Consumes: Tasks 3, 4 e 5.
- Produces: `POST /api/__e2e/snapshot` — só com `E2E_MAILBOX === 'true'` e em localhost (como `e2eCode`), com sessão: `account.snapshot(deps.now())` e `json({ ok })`; senão 404. Em `playwright.sync.config.ts`, a var `RESTORE_MAX_RECORDS:10` (as mudanças acima de 10 vão pelo aparelho).

- [ ] **Step 1: Teste que falha** — `copies.spec.ts`, `'uma restauração que não cabe chega pelo aparelho, e o outro recebe pelo sync'`: A entra, faz 15 solves e sincroniza; a rota tira a cópia; A apaga os 15 e sincroniza; B entra e vê 0; A abre "Cópias na nuvem", restaura a de hoje (dois cliques), vê `cloudRestoredHere` e volta a ter 15; A sincroniza; B sincroniza e vê 15. No worker: `'a rota do e2e é 404 sem E2E_MAILBOX ou fora do localhost'`.
- [ ] **Step 2: Rode e confira que falha** — o e2e do sync → FAIL.
- [ ] **Step 3: Implemente** a rota e a var.
- [ ] **Step 4: Rode e confira que passa** — o e2e do sync inteiro (os 5 de antes e o novo), o e2e, a worker e o check → PASS.
- [ ] **Step 5: Commit** — `test(copias): ponta a ponta da restauração pelo aparelho`.

---

### Task 7: A medição de novo

**Files:**
- Modify: `app/tests/perf/account-100k.perf.ts`, `docs/superpowers/measurements/2026-10-17-conta-100k.md`, `app/README.md` (se um portão de deploy muda)

**Interfaces:**
- Consumes: tudo acima. Os mocks de fase do harness passam a marcar `writeCopy` por parte e `diffSlice` por faixa.

- [ ] **Step 1: Medições novas** — na conta de 100 mil solves: (a) a cópia em partes (memória de pico e CPU, por parte e no total); (b) a restauração de um dia ruim típico (uma sessão de 500 solves apagada) por diferenças: CPU, memória, leituras e linhas; (c) uma restauração acima do limite até a resposta do aparelho (o tempo até parar).
- [ ] **Step 2: Rode** — `./node_modules/.bin/vitest run -c vitest.perf.config.ts`. Passa quando: a memória de pico de (a) e (b) fica abaixo de 64 MB (metade dos 128 MB do objeto) e a CPU abaixo de 15 s (metade dos 30 s); (b) cabe em `RECORDS_PER_DAY`.
- [ ] **Step 3: Escreva** a seção nova da medição (data de hoje), com os números e o que eles decidem; se algo não couber, a ruling no ledger e o valor novo da constante ou da var, com teste.
- [ ] **Step 4: Rode** — a unit, a worker e o check → PASS.
- [ ] **Step 5: Commit** — `docs(copias): a medição da cópia em partes e da restauração por diferenças`.
