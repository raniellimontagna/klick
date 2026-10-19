# Desafio por link — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A desafia B por um link com sete embaralhamentos e os tempos de A; B joga ponto a ponto no formato Head-to-Head, manda a resposta por outro link, e os dois guardam a partida no histórico (aparelho, cópia, exportação e sync).

**Architecture:** O núcleo (`src/core/duel/`) tem o placar Head-to-Head e o codec do link (JSON comprimido em base64url, no fragmento da URL). Os desafios vivem numa store nova `duels` no IndexedDB (versão 4 do banco), sincronizada como mais uma store da conta (protocolo 3). A tela do desafio reaproveita as peças do Timer (timer, entrada, tempo, embaralhamento, ações do resultado, Centro), como o treino da Trilha já faz. Nenhuma rota nova no Worker.

**Tech Stack:** Svelte 5 (runes), TypeScript strict, `idb`, Vitest (jsdom e Workers pool), Playwright, Cloudflare Worker + Durable Object (só o núcleo compartilhado muda).

**Spec:** `docs/superpowers/specs/2026-10-19-klick-desafio-design.md`

## Global Constraints

- Nenhuma rota nova no Worker, nenhum custo novo; o desafio viaja só no fragmento (`#desafio=`), que o navegador não manda ao servidor.
- Os solves do desafio ficam só no registro do desafio (store `duels`), nunca em `solves`: médias, recordes, constância, temporada e meta não mudam.
- Nada público, nenhum chat, nenhum texto livre além do nome opcional (até 20 caracteres, texto simples, `trim`), mostrado só a quem recebe o link.
- Sete embaralhamentos (`DUEL_SCRAMBLES = 7`), vence quem chega a 3 pontos (`DUEL_TARGET = 3`); DNF é o pior; dois DNF ou empate no centésimo, ninguém pontua; sem ninguém em 3, mais pontos; empate em pontos, melhor single entre os embaralhamentos jogados; depois, empate.
- B nunca vê o tempo de A de um embaralhamento antes de resolvê-lo e fixar a penalidade dele.
- Um desafio aceito neste aparelho não se refaz: fechar e abrir de novo volta ao ponto em que parou.
- Sem desafio, nada muda para ninguém. O que passa nos testes de hoje continua igual fora destes itens.
- Textos novos em português, no tom do app, em `src/strings.ts` (seção `T.duel`).
- Comandos (de `app/`): unit `./node_modules/.bin/vitest run`, worker `./node_modules/.bin/vitest run -c vitest.worker.config.ts`, check `pnpm --config.verify-deps-before-run=false check`, e2e `./node_modules/.bin/playwright test`.

## Review Focus

1. **Link reaberto no meio do jogo** (B fecha a aba no 4º solve e abre o link de novo): continua do 5º, sem refazer — teste na Task 6.
2. **Link torto, cortado ou de outra versão:** mostra "Este desafio não abre nesta versão do Klick" e não grava nada — testes nas Tasks 1 e 8.
3. **A abre o próprio link de desafio:** mostra o desafio dele (esperando resposta), não joga contra si mesmo — teste na Task 8.
4. **A resposta aberta num aparelho sem o desafio de A** (outro aparelho sem sync, ou um terceiro): mostra a partida só para ver, sem gravar — teste na Task 8.
5. **Penalidade depois de ver o tempo do outro:** B não muda +2/DNF de um ponto já revelado — teste na Task 6.

---

### Task 1: O placar e o link no núcleo

**Files:**
- Create: `app/src/core/duel/score.ts`, `app/src/core/duel/link.ts`
- Modify: `app/src/core/types.ts` (tipos do desafio)
- Test: `app/tests/unit/duel-score.test.ts`, `app/tests/unit/duel-link.test.ts`

**Interfaces:**
- Produces (em `core/types.ts`):
  - `interface DuelTime { ms: number; penalty: Penalty }` (`ms` é o tempo cru; `+2` soma 2000 só na comparação).
  - `type DuelSide = 'a' | 'b'` (a = quem desafia).
  - `interface DuelLink { v: 1; id: string; event: EventId; scrambles: string[]; a: { name: string; times: DuelTime[] }; b?: { name: string; times: DuelTime[] } }`.
- Produces (`core/duel/score.ts`): `DUEL_SCRAMBLES = 7`, `DUEL_TARGET = 3`; `effectiveMs(t: DuelTime): number` (DNF = `Infinity`); `pointOf(a: DuelTime, b: DuelTime): DuelSide | null`; `interface DuelScore { points: Record<DuelSide, number>; perPoint: (DuelSide | null)[]; over: boolean; winner: DuelSide | 'tie' | null }`; `scoreDuel(a: readonly DuelTime[], b: readonly DuelTime[]): DuelScore` (compara índice a índice até o menor dos dois; `over` quando alguém chega a 3 ou os sete foram jogados; `winner` só com `over`).
- Produces (`core/duel/link.ts`): `encodeDuelLink(link: DuelLink): Promise<string>` (JSON → `CompressionStream('deflate-raw')` → base64url sem `=`); `decodeDuelLink(text: string): Promise<DuelLink | null>` (o inverso, validando tudo; qualquer falha dá `null`); `duelUrl(origin: string, payload: string): string` = `${origin}/#desafio=${payload}`; `duelPayloadOf(hash: string): string | null` (lê `#desafio=`); `MAX_DUEL_NAME = 20`; `MAX_DUEL_PAYLOAD = 12_000` (caracteres do payload; acima, `null`); `newLinkId(rand?: () => number): string` (16 caracteres `[a-z0-9]`, por `crypto.getRandomValues` quando `rand` não vem).
- Validação de `decodeDuelLink`: `v === 1`; `id` casa `/^[a-z0-9]{8,32}$/`; `event` em `EVENT_IDS`; `scrambles` com exatamente 7 strings não vazias de até 1.000 caracteres; `a.times` com 7 `DuelTime` válidos (`ms` inteiro ≥ 0, `penalty` em `null | '+2' | 'DNF'`); `b.times`, se houver, com 1 a 7 válidos; nomes string de até 20 caracteres depois de `trim` (nome inválido vira `''`, não recusa o link).

- [ ] **Step 1: Testes que falham** — `duel-score.test.ts`: `'o mais rápido leva o ponto; +2 soma dois segundos na comparação'`; `'DNF é o pior; dois DNF ou empate no centésimo, ninguém pontua'` (`{ms:10_004}` × `{ms:10_009}` empata); `'quem chega a 3 vence e a partida acaba ali'` (`over` e `winner` depois do 3º ponto de B, com só 4 tempos de B); `'sem ninguém em 3 nos sete, vence quem tem mais pontos'`; `'empate em pontos: decide o melhor single jogado; depois, empate'`. `duel-link.test.ts`: `'ida e volta: o que sai de encodeDuelLink volta igual'` (com e sem `b`, com nomes acentuados); `'um 3×3 cabe em menos de 2.000 caracteres e um megaminx em menos de MAX_DUEL_PAYLOAD'`; `'link torto, cortado, de outra versão, com evento ou tempos inválidos dá null'` (um caso por regra); `'nome comprido ou não string vira vazio sem recusar o link'`; `'duelPayloadOf lê #desafio= e ignora outros fragmentos'`.
- [ ] **Step 2: Rode e confira que falham** — os dois arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — os dois arquivos e o check → PASS.
- [ ] **Step 5: Commit** — `feat(desafio): o placar Head-to-Head e o link do desafio no núcleo`.

---

### Task 2: A store `duels` no banco e no repositório

**Files:**
- Modify: `app/src/data/db.ts` (`DB_VERSION` 4, store `duels`), `app/src/data/repository.ts` (métodos, lixeira, exportação, importação, `replaceAll`, `ChangeKind`), `app/src/core/types.ts` (`Duel`, `KlickExport.duels?`), `app/src/data/transfer.ts` (validação de `duels` no arquivo), `app/src/data/safety.ts` (se algo listar stores)
- Test: `app/tests/unit/repository-duels.test.ts`, `app/tests/unit/db.test.ts`, `app/tests/unit/transfer.test.ts`, `app/tests/unit/safety.test.ts`

**Interfaces:**
- Consumes: `DuelTime`, `DuelSide`, `EventId` (Task 1).
- Produces (`core/types.ts`): `type DuelStatus = 'playing' | 'waiting' | 'done'`; `interface Duel { id: string; linkId: string; side: DuelSide; event: EventId; scrambles: string[]; mine: DuelTime[]; theirs: DuelTime[] | null; myName: string; theirName: string; status: DuelStatus; createdAt: number; updatedAt: number; deletedAt: number | null }`. `id` = `${linkId}-${side}` (a mesma partida tem um registro de cada lado; desafiar a si mesmo nunca colide). `KlickExport` ganha `duels?: Duel[]`.
- Produces (`db.ts`): `DB_VERSION = 4`; a versão 4 só cria `duels` (`keyPath: 'id'`, índice `byCreated` em `createdAt`); `StoredDuel = Duel & { deletionStamp: number }`; nada mais muda num banco v3.
- Produces (`Repository`): `listDuels(o?: { includeDeleted?: boolean }): Promise<Duel[]>` (mais novos primeiro); `getDuel(id: string): Promise<Duel | null>`; `saveDuel(d: Omit<Duel, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Duel>` (cria ou substitui, com as datas pelo `ctx.stamp()` e `ctx.track('duels', id)` como `addPractice`); `deleteDuel(id)`, `restoreDuel(id)` (lixeira como os solves). `listTrash()` e `purgeTrash()` incluem os desafios; `exportAll()` e `replaceAll()`/`importAll()` levam `duels`; `ChangeKind` ganha `'duels'`, anunciado nas escritas.
- `transfer.ts`: `duelsFrom(v: unknown): Duel[]` (descarta inválidos e repetidos por id, como `practiceFrom`); um arquivo sem `duels` continua valendo.

- [ ] **Step 1: Testes que falham** — `repository-duels.test.ts`: `'saveDuel cria e substitui, com as datas do relógio do sync'`; `'listDuels traz os mais novos primeiro e esconde a lixeira'`; `'apagar manda para a lixeira; restaurar volta; purgeTrash tira depois de 30 dias'`; `'os desafios não aparecem em listSolves nem mudam as estatísticas'`; `'exportAll leva os desafios; importAll e replaceAll os trazem de volta'`. `db.test.ts`: `'a versão 4 cria duels sem mexer nos dados da v3'`. `transfer.test.ts`: `'arquivo com desafios entra; desafio inválido fica de fora; arquivo sem duels continua valendo'`. `safety.test.ts`: `'a cópia automática leva os desafios e a restauração os devolve'`.
- [ ] **Step 2: Rode e confira que falham** — os quatro arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces. `exportStuckDb` continua com a lista dela (um banco travado é anterior aos desafios).
- [ ] **Step 4: Rode e confira que passam** — os quatro arquivos, a suíte unitária e o check → PASS.
- [ ] **Step 5: Commit** — `feat(desafio): os desafios guardados no aparelho, na lixeira, na cópia e no arquivo`.

---

### Task 3: `duels` no sync da conta

**Files:**
- Modify: `app/src/core/sync/types.ts` (`SyncStore`, `SYNC_STORES`, `SYNC_PROTOCOL` 3), `app/src/core/sync/shape.ts` (validação de `duels`), `app/src/core/sync/limits.ts` (`ACCOUNT_LIMITS.duels`), `app/src/core/sync/restore.ts`, `app/src/core/sync/snapshot.ts`, `app/src/data/repository.ts` (todo ponto que enumera as stores do sync: `recordOf`, `keyParts`, `isKeyed`, `countLocalOnly`, `outboxBatch`, `requeueHeld`, `countRemoteDeletions`, `beginFirstSync`, `wipeData`, `applyRemote`, `replaceAll`, `announceSynced`), `app/src/ui/state/account.svelte.ts` (`SYNCED_KINDS`), `app/worker/account-store.ts` (restauração passa `duels`), `app/tests/unit/sync-fakes.ts`
- Test: `app/tests/unit/sync-apply.test.ts`, `app/tests/unit/sync-limits.test.ts`, `app/tests/unit/repository-sync.test.ts`, `app/tests/unit/sync-engine.test.ts`, `app/tests/unit/sync-snapshot.test.ts`, `app/tests/worker/sync.test.ts`, `app/tests/worker/copies.test.ts`

**Interfaces:**
- Consumes: `Duel`, `StoredDuel`, os métodos da Task 2.
- Produces: `SyncStore` com `'duels'`; `SYNC_PROTOCOL = 3` (o servidor responde 426 ao app de antes, que mostra "Atualize o Klick" e guarda a fila); `ACCOUNT_LIMITS.duels = 10_000` (contado como as outras, com a cota e o teto de bytes de sempre); `RestoreCopy.duels: readonly object[] | null` (com `null`, a restauração não mexe nos desafios, como `practice`); `exportFromRecords` emite `duels`.
- Validação de `duels` em `shape.ts`: `data` com `linkId` (`/^[a-z0-9]{8,32}$/`), `side` em `a | b`, `event` em `EVENT_IDS`, `scrambles` (7 strings), `mine` e `theirs` (`DuelTime[]` de até 7, ou `null` em `theirs`), `myName`/`theirName` (até 20), `status` em `playing | waiting | done`, `createdAt`; o id do registro é `${linkId}-${side}`.

- [ ] **Step 1: Testes que falham** — `sync-apply.test.ts`: `'um desafio válido entra; um com side ou tempos tortos é recusado'`. `sync-limits.test.ts`: `'ACCOUNT_LIMITS.duels é 10 mil e conta na cota'`. `repository-sync.test.ts`: `'salvar um desafio põe na fila; o sync sobe e o outro aparelho recebe'`; `'o primeiro sync leva os desafios do aparelho'`. `sync-engine.test.ts`: `'o FakeServer com o protocolo 3 aceita desafios; o app de antes recebe 426'`. `sync-snapshot.test.ts`: `'a cópia na nuvem leva os desafios'`. Worker `sync.test.ts`: `'desafios sobem e voltam pelo objeto da conta'`; `copies.test.ts`: `'restaurar um dia devolve os desafios daquele dia; uma cópia sem duels não mexe nos de agora'`.
- [ ] **Step 2: Rode e confira que falham** — os arquivos → FAIL.
- [ ] **Step 3: Implemente** como nas Interfaces; atualize o `FakeServer` e o `SYNCED_KINDS`.
- [ ] **Step 4: Rode e confira que passam** — os arquivos, as duas suítes e o check → PASS.
- [ ] **Step 5: Commit** — `feat(desafio): os desafios no sync da conta e nas cópias na nuvem (protocolo 3)`.

---

### Task 4: O nome nos desafios

**Files:**
- Modify: `app/src/core/sync/prefs.ts` (chave `duelName`), `app/src/core/types.ts` (`Profile`/`AccountProfile`), `app/src/data/repository.ts` (perfil e importação), `app/src/data/transfer.ts` (`profileOf`), `app/src/ui/state/app.svelte.ts` (`setDuelName(name: string): Promise<void>`)
- Test: `app/tests/unit/sync-prefs.test.ts` (ou o arquivo dos prefs que existir), `app/tests/unit/transfer.test.ts`, `app/tests/unit/app-state.test.ts`

**Interfaces:**
- Produces: a preferência da conta `duelName` (string, `trim`, até `MAX_DUEL_NAME` = 20, padrão `''`), aceita por `isPrefValue`, com padrão em `defaultPrefValue`, ida e volta em `prefsFromProfile`/`profileFromPrefs`, e no arquivo do Klick; `app.profile.duelName: string`; `AppState.setDuelName(name)` grava pelo `saveProfile`.

- [ ] **Step 1: Testes que falham** — `'duelName é uma preferência da conta: aceita até 20 caracteres, recusa o resto'`; `'setDuelName grava aparado e sobe no sync'`; `'o arquivo do Klick leva e traz o nome'`.
- [ ] **Step 2: Rode e confira que falham.**
- [ ] **Step 3: Implemente.**
- [ ] **Step 4: Rode e confira que passam** — a suíte unitária, a do Worker (o servidor valida prefs) e o check → PASS.
- [ ] **Step 5: Commit** — `feat(desafio): o nome que vai nos desafios`.

---

### Portão: a maquete das telas

O controlador faz a maquete das telas do desafio (começar, jogar como A, receber e jogar como B, mandar, ver a resposta, a lista em Evolução) na linguagem visual aprovada e leva ao Ranielli. As Tasks 5 a 7 só começam com ela aprovada; o arquivo aprovado fica em `docs/design/2026-10-19-desafio-maquete.html` e vale como fonte da verdade das telas (porte fiel, sem "melhorar").

---

### Task 5: O estado do desafio

**Files:**
- Create: `app/src/ui/state/duel.svelte.ts`
- Modify: `app/src/ui/state/app.svelte.ts` (`duelRunning` como os outros sinais de ocupado, avisando a conta; `duel: DuelState`)
- Test: `app/tests/unit/duel-state.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2 e 4; `generateScramble(event)` (`src/scramble/cubing-loader.ts`), `app.repo`, `app.profile.duelName`.
- Produces: `class DuelState` com `current: Duel | null` e `phase: 'idle' | 'loading' | 'solving' | 'reveal' | 'finished' | 'invalid'`; `start(event: EventId): Promise<void>` (gera os 7 embaralhamentos um a um, cria o registro `side 'a'`, `status 'playing'`); `record(t: DuelTime): Promise<void>` (grava o solve atual; como A, avança; como B, passa a `reveal`); `setPenalty(p: Penalty): Promise<void>` (só antes da revelação); `next(): void` (de `reveal` ao próximo embaralhamento, ou `finished` quando `scoreDuel(...).over`); `challengeUrl(origin: string): Promise<string>` (A terminou: o link com os 7 tempos e o nome); `openLink(payload: string): Promise<'accept' | 'resume' | 'own' | 'reply' | 'view' | 'invalid'>` (decide pelo conteúdo e pelo que existe no aparelho: sem `b` e sem registro → `accept`; com registro `-b` → `resume`; com registro `-a` e sem `b` → `own`; com `b` e registro `-a` → grava `theirs` e `status 'done'`, `reply`; com `b` e sem `-a` → `view`, nada gravado; torto → `invalid`); `accept(): Promise<void>` (cria o registro `side 'b'`); `replyUrl(origin: string): Promise<string>` (B terminou: o link com os dois lados); `score: DuelScore | null`.
- `app.duelRunning = true` enquanto `phase` é `solving` ou `reveal` (a aba líder não sincroniza no meio de um solve).

- [ ] **Step 1: Testes que falham** — `'A começa: sete embaralhamentos do evento, registro playing; ao fim, o link leva os sete tempos e o nome'`; `'B aceita e joga: cada solve revela o tempo de A e o ponto; acaba quando alguém chega a 3'`; Review Focus 1: `'reabrir o link no meio volta ao próximo embaralhamento, sem refazer'`; Review Focus 5: `'setPenalty depois da revelação não muda nada'`; `'a resposta no aparelho de A grava os tempos de B e fecha a partida'`; Review Focus 3 e 4: `'o próprio link abre como own; a resposta sem o desafio de A abre como view e não grava'`; `'link torto abre como invalid e não grava'`; `'duelRunning acompanha o solve'`.
- [ ] **Step 2: Rode e confira que falham.**
- [ ] **Step 3: Implemente** como nas Interfaces.
- [ ] **Step 4: Rode e confira que passam** — o arquivo, a suíte unitária e o check → PASS.
- [ ] **Step 5: Commit** — `feat(desafio): o estado do desafio, de começar a responder`.

---

### Task 6: A tela do desafio

**Files:**
- Create: `app/src/ui/duel/DuelScreen.svelte` (e o que a maquete pedir em `app/src/ui/duel/`)
- Modify: `app/src/strings.ts` (`T.duel`), `app/src/ui/App.svelte` (monta a tela quando há desafio aberto)
- Test: `app/tests/unit/duel-screen.test.ts`

**Interfaces:**
- Consumes: `DuelState` (Task 5); as peças do Timer: `createTimer`, `createInputController`, `createTimeLoop`/`paintTime`, `ScrambleBlock`, `ResultActions`, `createCentroLive`/`CentroView` (o treino da Trilha, `TrainRound.svelte`, é o precedente de reuso); `shareFile`/o compartilhar de texto e a cópia (`navigator.share({ text, url })`, sem ela `navigator.clipboard.writeText`).
- Produces: a tela segue a maquete aprovada; o Centro reage a cada ponto (ganhou → `good`, perdeu → `slow`, DNF → `dnf`) e ao resultado, com as falas de `T.duel`; "Mandar o desafio" e "Mandar a resposta" compartilham o link (texto `T.duel.shareText(event)` + URL) ou copiam; "Este desafio não abre nesta versão do Klick" para `invalid`.

- [ ] **Step 1: Testes que falham** — `'como A: resolve os sete e manda o link'`; `'como B: o tempo de A só aparece depois do solve e da penalidade'`; `'o placar mostra os pontos e o fim da partida com o vencedor'`; `'sem Web Share, copia o link e avisa'`; `'link torto mostra o aviso e nada mais'`; `'teclado e leitor de tela: o placar e a revelação são anunciados'`.
- [ ] **Step 2: Rode e confira que falham.**
- [ ] **Step 3: Implemente** pela maquete aprovada.
- [ ] **Step 4: Rode e confira que passam** — o arquivo, a suíte unitária e o check → PASS.
- [ ] **Step 5: Commit** — `feat(desafio): a tela do desafio, com o Centro ponto a ponto`.

---

### Task 7: As entradas: Desafiar, o link ao abrir e os Desafios em Evolução

**Files:**
- Modify: `app/src/ui/App.svelte` (lê `#desafio=` ao iniciar e no `hashchange`, limpa o fragmento com `history.replaceState`), `app/src/ui/timer/TimerScreen.svelte` ou o cabeçalho (o "Desafiar", onde a maquete mandar), `app/src/ui/evolucao/EvolucaoScreen.svelte` (a seção "Desafios" e a partida aberta ponto a ponto), `app/src/strings.ts`, `app/public/privacidade/index.html` (o parágrafo do link)
- Test: `app/tests/unit/app-shell.test.ts`, `app/tests/unit/evolucao-screen.test.ts`, `app/tests/e2e/desafio.spec.ts`

**Interfaces:**
- Consumes: Tasks 5 e 6.
- Produces: abrir `/#desafio=…` abre a tela do desafio no estado que `openLink` devolver, e o fragmento sai da barra; "Desafiar" começa um desafio no evento da sessão atual (trocável); "Desafios" em Evolução lista evento, oponente, placar e data, abre a partida, e manda para a lixeira; a política de privacidade explica o link.

- [ ] **Step 1: Testes que falham** — `app-shell.test.ts`: `'abrir com #desafio= abre o desafio e limpa o fragmento'`; Review Focus 2: `'#desafio= torto mostra o aviso e não grava nada'`; `'um hashchange com desafio abre a tela com o app já aberto'`. `evolucao-screen.test.ts`: `'Desafios lista as partidas e abre uma ponto a ponto'`; `'apagar um desafio manda para a lixeira'`. E2E `desafio.spec.ts`: `'A desafia, B responde noutro navegador sem conta, A vê o resultado'` (dois contextos do Playwright; `noInspection` e `quickSolve` dos helpers).
- [ ] **Step 2: Rode e confira que falham.**
- [ ] **Step 3: Implemente** pela maquete aprovada.
- [ ] **Step 4: Rode e confira que passam** — os arquivos, a suíte unitária, o e2e do desafio e o check → PASS.
- [ ] **Step 5: Commit** — `feat(desafio): Desafiar no Timer, o link que abre o desafio e os Desafios em Evolução`.
