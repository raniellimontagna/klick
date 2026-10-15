# Conta e sync (sub-projeto 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conta opcional (código por e-mail e passkey) e sync entre aparelhos no Cloudflare, com marcas de exclusão, cursor de revisão, cópias diárias por 30 dias e restauração, sem mudar nada para quem nunca entra numa conta.

**Architecture:** As regras de conflito e o lote do sync são funções puras em `app/src/core/sync/`, que o app e o Worker importam (provadas por simulação de três aparelhos). O banco local vai à versão 3 (marcas de exclusão em tudo, ajustes da conta em `prefs`, fila de saída `outbox`, relógio do app em `meta['sync']`) e pode ir à raiz sozinho. O Worker do app ganha um script (`app/worker/`): Better Auth no D1 para o login, um Durable Object com SQLite por conta para os registros e as revisões, R2 para as cópias diárias. No app, um motor de sync (`app/src/sync/`) roda numa aba só (Web Locks), por gatilhos, nunca durante um solve; as telas ficam em Ajustes ("Conta e sync"), no diálogo de entrar e no indicador da barra de cima.

**Tech Stack:** Svelte 5 (runes), Vite 8, TypeScript estrito, pnpm 11, idb, Vitest 5 + jsdom + fake-indexeddb + @testing-library/svelte, Playwright + axe. Novos: better-auth 1.7.7 e @better-auth/passkey 1.7.7 (dependências); wrangler 4.149.0, @cloudflare/vitest-plugin 1.4.0 e @cloudflare/workers-types 5.20261004.1 (desenvolvimento). Cloudflare: Workers com arquivos estáticos, Durable Objects com SQLite, D1, R2, rate limiting e Turnstile. Resend para o e-mail.

**Spec:** docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md (com a pesquisa docs/research/2026-10-15-sync-conta-comunidade.md, seção 3.2, que lista as lacunas do banco local)

Leia a seção da spec que a tarefa cita antes de começar. Este plano foi ensaiado numa cópia do app antes de ser escrito: o código das Tasks 1 a 6, 11 a 16 e 18 passou nos testes de unidade, no `pnpm check` e na suíte inteira, e os ponta a ponta de sempre (`pnpm test:e2e`) passaram no estado final; o das Tasks 7, 8, 10 e 17 rodou dentro do workerd com o `@cloudflare/vitest-plugin`; os testes que dependem do Better Auth de verdade (o fluxo de login da Task 9) e os ponta a ponta com o `wrangler dev` (Task 19) foram escritos com a documentação e as fontes das bibliotecas, mas não rodaram no ensaio; pelo mesmo motivo, o `pnpm check` do ensaio conferiu os dois adaptadores do Better Auth (`worker/auth.ts` e `src/sync/auth.ts`) contra declarações mínimas, não contra os tipos da 1.7.7. Copie o código como está. Se um teste das Tasks 9 ou 19, ou o `pnpm check` num desses dois adaptadores, falhar por um detalhe da biblioteca (o nome de um cookie, um código de erro, o tipo de uma resposta, um rótulo), confira na biblioteca e ajuste o teste ou o adaptador, sem mudar o que o adaptador devolve e nunca a regra da spec.

## Decisões tomadas (desvios do texto da spec e da realidade das bibliotecas)

Estas decisões valem por cima do texto da spec. A Task 20 (Step 6) atualiza a spec para registrá-las. Cada uma diz o quê, por quê e o custo se estiver errada.

1. **`@cloudflare/vitest-plugin` no lugar de `@cloudflare/vitest-pool-workers` (spec 11).** O pacote da spec foi renomeado e está descontinuado; a última versão dele pede Vitest 4.1, e o app está no 5. O `@cloudflare/vitest-plugin` 1.4.0 aceita `vitest ^4.1.0 || ^5.0.0`. Os testes do servidor ficam num config próprio (`vitest.worker.config.ts`, `pnpm test:worker`), no mesmo Vitest 5. Custo se errado: um pacote `app/worker` separado, com Vitest 4.1.11 e o `vitest-pool-workers` 0.22.0, rodando os mesmos arquivos de teste.
2. **Limites por hora no D1, não no binding de rate limiting (spec 7.5).** O binding só conta janelas de 10 ou 60 segundos. Os 5 códigos por e-mail e os 20 pedidos por IP por hora contam numa tabela `otp_requests` do D1 (o e-mail entra como hash); o binding fica como trava de rajada (`OTP_BURST`, 5 por minuto por IP; `API_BURST`, 120 por minuto por conta no sync). Custo: uma escrita no D1 por pedido de código.
3. **O bloco sync mora na chave `'sync'` da store `meta`, com três campos a mais (spec 5.4).** `meta.sync` fica separado do `Meta` que as telas leem: o relógio sobe a cada gravação, e o `Meta` de `'current'` não muda por isso. Além de `accountId`, `cursor`, `lastSyncAt` e `clock`, guarda `email` e `signedIn` (Ajustes e o indicador sem rede), `firstSync` (o primeiro login retoma se o app fechar no meio) e `passkey` (a tela de entrar oferece a passkey primeiro, spec 7.2). Custo: nenhum.
4. **A migração grava só as chaves da conta fora do padrão (spec 5.6).** Se gravasse todas com a hora da migração, o aparelho migrado depois, com a trilha zerada, apagaria no primeiro login a trilha do aparelho migrado antes (o mais recente vence). Uma chave ausente lê o padrão. O teste da Task 12 "a trilha marcada no primeiro não some pelo padrão do segundo" segura isso. Custo: nenhum.
5. **A cascata vale nos dois sentidos, e o que ela muda no aparelho entra na fila (spec 6.3, regra 3).** A spec só descreve a exclusão. Um solve ativo mais novo que a exclusão da sessão (gravado offline numa sessão que outro aparelho apagou) devolve a sessão, com o `deletionStamp` dele, como o `addSolve` já faz no aparelho: o invariante "solve ativo ⇒ sessão ativa" do repositório continua valendo depois do sync. E o que a cascata muda no aparelho sobe: sem isso, dois aparelhos ficavam com marcas de exclusão de datas diferentes para sempre (a simulação achou). Custo: nenhum.
6. **O servidor dá revisão nova também ao registro cujo resultado difere do que chegou (spec 6.1, passo 3).** A spec dá revisão só ao que "mudou de fato". Um aparelho que manda uma versão velha (um arquivo antigo importado depois que a lixeira apagou o registro de vez) nunca receberia a vencedora de volta e divergiria para sempre (a simulação achou). Custo: uma revisão a mais, rara.
7. **Versão do protocolo e lista de recusas no `/api/sync` (spec 6.1).** O pedido leva `v: 1`, e uma versão desconhecida recebe 426 ("atualize o app", como a pesquisa recomenda para um app velho em cache). A resposta tem `rejected: [{ store, id, reason }]` além do `accepted`. Custo: nenhum.
8. **A tabela `records` do Durable Object ganha a coluna `parent` (spec 8.2).** É a sessão de cada solve, com índice, para a cascata achar os solves de uma sessão. A tabela `state` guarda também `userId` (o objeto não sabe o próprio nome) e `snapshotRev`. Os métodos do objeto são `syncBatch`, `snapshot`, `restoreSnapshot` e `wipe`. O `data` de marcas antigas não é esvaziado: a spec diz "pode ser", e não há necessidade. Custo: nenhum.
9. **Restaurar uma cópia, no aparelho, manda para a lixeira o que não estava nela (spec 5.5).** Antes, a troca apagava sem rastro. Agora a tela mostra o mesmo de antes, e a lixeira guarda o que saiu por 30 dias. Uma cópia sem perfil volta os ajustes da conta aos padrões gravando cada chave (para o sync levar), e o export passa a ter perfil depois disso. Custo: a lixeira pode encher depois de restaurar uma cópia antiga; ela esvazia sozinha.
10. **Apagar e restaurar continuam mexendo em `updatedAt`, além do `deletionStamp` (spec 5.1).** O arquivo do Klick não leva `deletionStamp`: é pelo `updatedAt` que um arquivo exportado depois de uma exclusão a leva para outro aparelho, e o import segue "o mais recente vence" em solves e sessões. Ao importar, o `deletionStamp` gravado é o daqui quando o estado de exclusão não muda e o `updatedAt` do arquivo quando muda (`importedStamp`). Editar o conteúdo continua mexendo só em `updatedAt`. Custo: nenhum para a regra D5.
11. **O repositório tira as datas do sync de tudo o que devolve.** Telas, exportação e cópias continuam vendo `Solve`, `Session` e `Practice` como hoje; `deletionStamp` (e, no treino, `updatedAt` e `deletedAt`) só existem no IndexedDB e no envelope do sync. Tentativas apagadas não aparecem na lista nem no export. Custo: uma cópia rasa por registro lido.
12. **Apagar os dados do aparelho espera a fila vazia (spec 7.6 e 7.7).** "Sair" com "apagar os dados deste aparelho" e "apagar antes de entrar" na outra conta recusam enquanto há mudanças esperando para subir: apagar perderia o que ainda não está na nuvem. Apagar leva também as cópias locais (o motivo de apagar é privacidade). Depois de sair, o `accountId` fica e a fila continua enchendo: se a mesma conta voltar, sobe o que mudou nesse meio tempo. Custo: quem quer apagar sem rede precisa sincronizar antes.
13. **Ids derivados também nas sessões do csTimer e a sessão padrão só com o id livre (spec 5.5).** A spec deriva só o id do solve; sem derivar o da sessão (`cs-s-` mais o hash do evento, do nome e do primeiro solve), o mesmo arquivo importado em dois aparelhos deixava uma sessão vazia repetida. A sessão padrão usa `default-<evento>` só quando nenhum registro tem esse id (a de antes pode estar na lixeira). Custo: nenhum.
14. **O sync espera também o timer do treino (spec 6.2).** "Nunca durante um solve" vale para `app.timerBusy` e `app.trainerRunning`. Custo: nenhum.
15. **O Turnstile é conferido por um guarda próprio, não pelo plugin `captcha` do Better Auth.** O guarda (`worker/abuse.ts`) já lê o pedido para os limites do D1, e com o verificador injetado os testes não saem da máquina. O token vai no cabeçalho `x-turnstile-token`. Custo: nenhum.
16. **Durable Object com `migrations` e `new_sqlite_classes`.** O wrangler 4 também aceita a forma declarativa nova (`exports`), mas os exemplos do próprio plugin de testes usam `migrations`, e trocar depois é só de ida. Custo: nenhum.
17. **O SQL do Better Auth para o D1 é escrito à mão e conferido por teste (spec 7.1).** A CLI do Better Auth não alcança o D1. `worker/migrations/0001_auth.sql` traz as tabelas do núcleo e da passkey da 1.7.7, e um teste roda o `getMigrations` da biblioteca contra o D1 migrado: se faltar algo, ele falha e mostra o SQL. Custo: nenhum.
18. **`E2E_MAILBOX`, uma chave só do ponta a ponta local.** Com ela, o código vai para uma caixa na memória do Worker (lida em `/api/__e2e/otp`, só em localhost) e o Turnstile aceita o token de teste da Cloudflare: o ponta a ponta não sai da máquina. Um teste garante que o `wrangler.jsonc` nunca a define. Custo: nenhum.
19. **O dia das cópias é o de Brasília (spec 8.3).** A cópia sai às 03:05 UTC (00:05 em Brasília) e se chama `AAAA-MM-DD`; a cópia "antes de restaurar" se chama `AAAA-MM-DDTHH-MM-SSZ-antes`. O `:day` da rota `/api/snapshots/:day/restore` é esse nome. Custo: nenhum.
20. **"Sincronizar agora" no meio de uma rodada pede mais uma depois dela**, uma só, por mais pedidos que cheguem. Senão o que foi gravado durante a rodada esperava o próximo gatilho. Custo: nenhum.
21. **`ACCOUNTS_ENABLED=true` no beta só na etapa 8 (spec 12).** A seção 8.4 diz "assim que o login funcionar"; vale a ordem de entrega da seção 12: até a política de privacidade existir, a conta fica desligada também no beta, e as etapas 4 a 7 são testadas na máquina. Custo: o teste no iPhone começa na etapa 8.
22. **A passkey usa o hostname do próprio ambiente como `rpID`.** Beta e raiz têm D1 separados; uma passkey do beta não vale na raiz de qualquer jeito. Custo: nenhum.
23. **O Better Auth guarda o código em hash (`storeOTP: 'hashed'`) e fica com o limitador dele desligado** (os limites são os do item 2). Custo: nenhum.
24. **`KlickExport` e `ProfilePatch` passam para `core/types.ts`** (o repositório os reexporta), porque o Worker escreve o arquivo do Klick nas cópias diárias. Custo: nenhum.
25. **A cópia "antes da v3" é gravada em JSON puro, dentro da transação da migração (spec 5.6).** A transação de upgrade do IndexedDB não sobrevive a esperar o `CompressionStream`; dentro dela, a cópia e a migração acontecem juntas ou não acontecem. Custo: a cópia ocupa umas três vezes mais que uma comprimida, uma vez.
26. **Os três segredos, o Ranielli coloca.** `TURNSTILE_SECRET` e `RESEND_API_KEY` vêm de painéis dele, e `BETTER_AUTH_SECRET` nasce de `openssl rand` direto para o `wrangler secret put`. Os três entram pelo terminal dele (Portão C, Steps 1 e 3); o Claude recebe só as site keys (públicas) e os registros de DNS, e confere só os nomes com `wrangler secret list`. Custo: dois comandos a mais para o Ranielli no Portão C.

## Global Constraints

- **Onde:** o app fica em `app/` (Svelte 5 runes, Vite 8, TypeScript estrito, pnpm 11), na branch `v2`; todo comando roda dentro de `app/` (`cd /Users/raniellimontagna/Projetos/pessoal/klick/app`).
- **Commits:** um por tarefa, local, mensagem em português no estilo `feat(app): …`, `feat(worker): …`, `feat(sync): …`, `chore(app): …`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git push` sem o ok explícito do Ranielli.
- **Deploy:** o beta (`npx wrangler deploy`) pode, depois dos portões que a tarefa cita; a raiz (`npx wrangler deploy --env production`) só com o ok explícito do Ranielli. `ACCOUNTS_ENABLED` fica `"false"` na produção até o fim deste plano (o teste `wrangler-config.test.ts` segura isso).
- **Segredos:** o repositório é público. `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET` e `RESEND_API_KEY` entram só por `npx wrangler secret put NOME` (e `--env production`), nunca num arquivo do repositório, nunca na conversa. O `wrangler.jsonc` tem só os nomes; a site key do Turnstile é pública e fica nele.
- **Versões fixas:** better-auth 1.7.7, @better-auth/passkey 1.7.7, wrangler 4.149.0, @cloudflare/vitest-plugin 1.4.0, @cloudflare/workers-types 5.20261004.1, instaladas com `-E`. Nenhuma outra dependência nova.
- **Comandos:** um arquivo de teste `pnpm exec vitest run tests/unit/<arquivo>` (não `pnpm test -- <arquivo>`, que roda tudo); a suíte `pnpm test -- --maxWorkers=4`; os testes do servidor `pnpm test:worker` (um arquivo: `pnpm exec vitest run -c vitest.worker.config.ts tests/worker/<arquivo>`); tipos `rtk proxy pnpm check` (o `rtk` sem `proxy` esconde erro de tipo); ponta a ponta `pnpm test:e2e tests/e2e/<arquivo>` e os da conta `pnpm test:e2e:sync` (sem `--`).
- **Sem conta, nada muda (spec 4.1):** quem nunca entra usa o mesmo app; a fila de saída não é preenchida; nenhum pedido sai além de `/api/health`.
- **Local primeiro (spec 4.2):** o sync roda por trás e nunca bloqueia o timer; um solve gravado no aparelho nunca espera a rede; o sync espera `app.timerBusy` e `app.trainerRunning`.
- **Nada some sem rastro (spec 4.3):** exclusão é marca com data; antes do primeiro login, de apagar os dados do aparelho e de um lote do servidor que apaga 50 solves ou mais, uma cópia local `'pre-sync'`.
- **Uma regra para tudo (spec 4.5):** solves, sessões, treino e ajustes da conta no mesmo envelope (`Change`), pelas mesmas funções de `src/core/sync`; a temporada é a única exceção (`mergeSeason`, só no servidor).
- **Núcleo puro:** nada em `src/core/sync/` importa de fora de `src/core` nem usa API do navegador (`sync-boundary.test.ts`).
- **Números da spec:** lotes de 500; novas tentativas em 5 s, 30 s, 2 min e depois a cada 5 min; cópia local antes de um lote que apaga 50 ou mais; sessão de 90 dias, cookie `HttpOnly`, `Secure` e `SameSite=Lax`; código de 6 dígitos, 10 minutos, 5 tentativas; 5 códigos por e-mail e 20 pedidos por IP por hora; cópias diárias por 30 dias; lixeira de 30 dias.
- **Logs (spec 8.5):** só ids, contagens, durações e erros; nunca e-mail, código ou dados de solve.
- **Textos:** tudo o que a pessoa lê é pt-BR e fica em `app/src/strings.ts` (o grupo `T.conta`); voz calma, sem emoji, sem culpa.
- **Acessibilidade (spec 9.6):** todo o fluxo pelo teclado, com foco visível; a região `aria-live` fala só quando o sync falha ou volta; botões do diálogo de entrar com 44 px no celular.
- **Comentários e testes:** comentários de código em português, na densidade do arquivo ao redor; nomes de teste em português.

## Review Focus

Os cinco casos que a spec implica, que mais devem morder alguém de verdade, do mais provável ao menos. Cada um tem o teste que o segura na tarefa dona do código.

1. **O mesmo csTimer importado em dois aparelhos antes da conta, e a "Sessão 1" de cada um.** O primeiro login precisa juntar sem duplicar nada (spec 6.5). Testes: Task 11, "o solve daqui igual a um da conta, com outro id, e a "Sessão 1" vazia de um evento que a conta tem, saem sem subir"; Task 12, "cópia antes, baixa a conta antes de subir, e o solve repetido (outro id) não sobe nem duplica"; Task 6, "o mesmo arquivo importado em dois aparelhos dá os mesmos ids".
2. **O iPhone com o relógio atrasado.** Uma edição feita depois de receber dados mais novos tem de vencer, e nenhuma data nova pode ficar abaixo de uma já vista (spec 5.4). Testes: Task 4, "o relógio do app nunca volta (spec 5.4): duas gravações no mesmo milissegundo, e um aparelho atrasado depois de ver datas mais novas"; Task 3, os aparelhos da simulação com o relógio uma hora atrasado e dois minutos adiantado.
3. **A migração v3 de um aparelho de verdade, e de dois.** Trilha, temporadas, acabamento, escolhas de algoritmo, aulas pela metade, casos fora do sorteio e a lixeira com a cascata de uma sessão precisam ler igual, e dois aparelhos migrados em horas diferentes não podem apagar o progresso um do outro no primeiro login. Testes: Task 4, `migration-v3.test.ts` inteiro ("nenhum dado sai…", "a tela mostra o mesmo de antes…"); Task 12, "a trilha marcada no primeiro não some pelo padrão do segundo, migrado depois".
4. **O aparelho que volta depois de semanas offline, com a lixeira já esvaziada, ou que importa um arquivo velho.** O que foi apagado não pode ressuscitar, e o aparelho tem de convergir (spec 5.5 e 8.2). Testes: Task 3, a simulação (operações "um aparelho fica semanas sem abrir" e "um arquivo velho importado depois que a lixeira apagou o registro de vez"); Task 5, "só some de vez, depois dos 30 dias, o que não espera na fila"; Task 8, "a versão velha que chega depois do purge perde e volta corrigida para quem a mandou".
5. **O iPhone que mata a aba no meio do primeiro sync de 50 mil solves.** Ao abrir de novo, o sync continua de onde parou, sem duplicar e sem deduplicar de menos (spec 6.1 e 6.5). Testes: Task 12, "um sync que cai no meio continua de onde parou" e "se o app fecha no meio do primeiro login, a próxima rodada continua sem duplicar".

---

## File Structure

| Arquivo | Papel | Tarefas |
|---|---|---|
| `app/src/core/sync/types.ts` (novo) | Os tipos do sync: `Change`, `SyncRequest`, `SyncResponse`, `SyncState`, `OutboxEntry`, `CloudCopy` | 1 |
| `app/src/core/sync/merge.ts` (novo) | `merge`, `cascade`, `mergeSeason`, `canonicalJson` | 1 |
| `app/src/core/sync/records.ts`, `prefs.ts`, `shape.ts` (novos) | Registro e mudança; ajustes da conta e do aparelho; a forma de uma mudança | 2 |
| `app/src/core/sync/apply.ts` (novo) | Juntar um lote, no servidor e no aparelho | 3 |
| `app/src/core/sync/restore.ts` (novo) | Restaurar uma cópia como gravação | 6 |
| `app/src/core/sync/snapshot.ts` (novo) | O arquivo do Klick a partir dos registros (cópias diárias) | 17 |
| `app/src/core/types.ts` | `KlickExport` e `ProfilePatch` passam para cá | 4 |
| `app/src/data/db.ts` | Banco versão 3: datas de exclusão, `prefs`, `outbox`, a migração e a cópia "antes da v3" | 4 |
| `app/src/data/repository.ts` | Relógio do app, fila, perfil dividido, lixeira que espera o servidor, restaurar como gravação, lote remoto, primeiro login, apagar e esquecer a conta | 4, 5, 6, 11, 18 |
| `app/src/data/ids.ts`, `transfer.ts` | Ids derivados do csTimer, sessão padrão, import por recência | 6 |
| `app/src/sync/api.ts`, `engine.ts` (novos) | O cliente da API e o motor do sync | 12, 18 |
| `app/src/sync/triggers.ts` (novo) | Gatilhos e a aba líder (Web Locks) | 13 |
| `app/src/sync/auth.ts`, `captcha.ts` (novos) | O cliente do Better Auth e o Turnstile, carregados sob demanda | 14, 15 |
| `app/src/ui/state/account.svelte.ts` (novo) | `AccountState`: conta, sync, login, passkeys, cópias e apagar | 13, 14, 15, 18 |
| `app/src/ui/state/app.svelte.ts`, `boot.ts` | A conta no estado do app; os diálogos novos; o lembrete | 6, 13, 14, 16, 18 |
| `app/src/ui/sync-status.ts` (novo) | A situação do sync em texto e em ícone | 14 |
| `app/src/ui/ajustes/AccountSection.svelte` (novo), `AjustesScreen.svelte` | A seção "Conta e sync" | 14, 18 |
| `app/src/ui/dialogs/SignInDialog.svelte`, `SignOutDialog.svelte`, `CloudCopiesDialog.svelte`, `DeleteAccountDialog.svelte` (novos) | Entrar, sair, cópias na nuvem e apagar a conta | 14, 15, 18 |
| `app/src/ui/dialogs/BackupsDialog.svelte` | O rótulo da cópia "antes da v3" | 4 |
| `app/src/ui/SyncIndicator.svelte` (novo), `App.svelte`, `timer/TimerScreen.svelte` | O indicador na barra de cima e o convite | 15, 16 |
| `app/src/strings.ts`, `app/src/styles/components.css`, `screens.css` | Textos (`T.conta`) e estilos | 4, 13 a 16, 18 |
| `app/worker/index.ts`, `router.ts`, `env.ts`, `tsconfig.json` (novos) | O script do Worker: `/api/*`, o resto vai para os arquivos | 7 a 10, 17 |
| `app/worker/account-store.ts` (novo) | O Durable Object da conta (SQLite, revisões, alarme) | 8, 17 |
| `app/worker/auth.ts`, `mail.ts`, `abuse.ts` (novos) | Better Auth, e-mail (Resend e as caixas de teste), Turnstile e limites | 9, 10 |
| `app/worker/snapshots.ts` (novo) | Nomes, horas e compressão das cópias no R2 | 17 |
| `app/worker/migrations/0001_auth.sql`, `0002_limits.sql` (novos) | As tabelas do D1 | 9, 10 |
| `app/wrangler.jsonc` | Script, `nodejs_compat`, `run_worker_first`, Durable Object, D1, R2, limites e variáveis de cada ambiente | 7 a 10, 17, 19 |
| `app/package.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.gitignore` | Dependências, scripts e tipos | 7, 9, 19 |
| `app/vitest.worker.config.ts` (novo) | Os testes do servidor no workerd | 7, 9, 10 |
| `app/vite.config.ts` | O service worker não troca `/privacidade` nem `/api` pelo app | 19 |
| `app/public/privacidade/index.html` (novo) | A política de privacidade | 19 |
| `app/playwright.sync.config.ts`, `app/tests/e2e-sync/` (novos) | O ponta a ponta com o Worker local | 19 |
| `app/scripts/v1-supabase.mjs`, `v1-supabase-map.mjs` (novos) | O script único do Supabase da v1 | 20 |
| `app/tests/unit/sync-random.ts`, `sync-fakes.ts`, `sync-account.ts` (novos) | Apoio dos testes: sorteio com semente, servidor falso, conta no app | 1, 3, 13 a 15, 18 |
| `app/tests/worker/` (novos) | Testes do servidor, o apoio e os tipos | 7 a 10, 17 |
| `app/tests/unit/*.test.ts` | Testes | todas |
| `app/README.md` | Os testes novos e a conta no deploy | 19 |
| `docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md` | A spec registra as decisões | 20 |

---

## Etapas e portões

As tarefas seguem as etapas da seção 12 da spec. Os portões são os pontos em que o Claude para e espera o Ranielli (spec 13, e os deploys da raiz); as tarefas na máquina podem seguir enquanto um portão espera, menos onde o portão diz o contrário.

| Etapa (spec 12) | Tarefas | Até onde vai | Portão |
|---|---|---|---|
| 1. Regras de conflito e simulação | 1 a 3 | só testes | |
| 2. Banco v3 e repositório | 4 a 6 | beta; a raiz com o ok | A: o ok para a v3 na raiz (sem volta) |
| 3. Worker, Durable Object e `/api/sync`, sem login | 7, 8 | testes no workerd | B: Workers Paid, R2 e alerta de gasto, antes do primeiro deploy com Durable Object |
| 4. Login, Turnstile, limites e passkey | 9, 10 | testes no workerd; beta com a conta desligada | C: Resend, Turnstile e segredos (o DNS o Claude faz), antes de e-mail de verdade |
| 5. O motor no app | 11 a 13 | testes | |
| 6. As telas | 14 a 16 | testes | |
| 7. Cópias diárias, restaurar e apagar a conta | 17, 18 | testes; os buckets com o Portão B feito | |
| 8. Política de privacidade e a conta ligada no beta | 19 | beta, com a conta ligada | D: razão social, CNPJ e e-mail de contato, antes da página ir ao ar |
| 9. O Supabase da v1 | 20 | um script que o Ranielli roda | E: o acesso ao Supabase da v1, na hora |

Dá para pedir os Portões B, C e D de uma vez, logo no começo: são coisas do Ranielli que não dependem do código. A raiz (`--env production`) e o `git push` só saem com o ok explícito dele, em qualquer ponto.

---

### Task 1: As regras de conflito, puras

Spec: seções 4.4, 6.3 e 6.4 (e as decisões 5 e 6 do começo deste plano).

**Files:**
- Create: `app/src/core/sync/types.ts` (os tipos do sync, usados por todas as tarefas seguintes, no app e no Worker)
- Create: `app/src/core/sync/merge.ts`
- Create: `app/tests/unit/sync-random.ts` (apoio: o sorteio com semente; não é arquivo de teste)
- Test: `app/tests/unit/sync-merge.test.ts`, `app/tests/unit/sync-boundary.test.ts`

**Interfaces:**
- Consumes: `Settings`, `SeasonProgress` de `src/core/types.ts`; `defaultSeason` de `src/core/season.ts` (só nos testes).
- Produces (em `core/sync/types.ts`): `SyncStore = 'solves' | 'sessions' | 'practice' | 'prefs'`, `SYNC_STORES`, `Change { store; id; data: unknown; updatedAt; deletedAt: number | null; deletionStamp }`, `SYNC_PROTOCOL = 1`, `SYNC_BATCH = 500`, `SyncRequest { v; deviceId; cursor; clock; changes }`, `Rejected { store; id; reason }`, `SyncResponse { accepted; rejected; changes; cursor; more; serverTime }`, `PrefItem { key; value; updatedAt }`, `DeviceSettings`, `DeviceProfile { settings; currentSessionId }`, `OutboxEntry { store; id; queuedAt }`, `SyncState { accountId; email; signedIn; firstSync; cursor; lastSyncAt; clock; passkey }`, `CloudCopy { name; day; kind: 'daily' | 'pre-restore'; solves }`, `syncKey(store, id): string` (`${store}/${id}`).
- Produces (em `core/sync/merge.ts`): `canonicalJson(v: unknown): string`, `merge(a: Change, b: Change): Change`, `cascade(session: Change, solves: readonly Change[]): { session: Change; solves: Change[] }`, `mergeSeason(stored: Change, received: Change): Change`.
- Produces (em `tests/unit/sync-random.ts`): `seeded(seed: number): () => number`, `pickWith(rnd)`.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/sync-random.ts`:

```ts
// Apoio dos testes do sync: um sorteio com semente fixa (mulberry32), para as simulações e as propriedades se repetirem igual.
// Não é um arquivo de teste.
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pickWith =
  (rnd: () => number) =>
  <T>(list: readonly T[]): T | undefined =>
    list.length === 0 ? undefined : list[Math.floor(rnd() * list.length)];
```

Crie `app/tests/unit/sync-merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { canonicalJson, cascade, merge, mergeSeason } from '../../src/core/sync/merge';
import type { Change } from '../../src/core/sync/types';
import type { SeasonProgress, SeasonRecord } from '../../src/core/types';
import { seeded } from './sync-random';

const solve = (o: Partial<Change> & { data?: Record<string, unknown> } = {}): Change => ({
  store: 'solves',
  id: 'x',
  data: { sessionId: 's', event: '333', ms: 1000, penalty: null, at: 1, scramble: 'R', note: '', createdAt: 1 },
  updatedAt: 10,
  deletedAt: null,
  deletionStamp: 10,
  ...o,
});
const note = (c: Change): unknown => (c.data as { note: unknown }).note;

describe('regras de conflito (spec 6.3)', () => {
  it('regra 1: vence o conteúdo de updatedAt maior', () => {
    const a = solve({ data: { note: 'a' }, updatedAt: 20 });
    const b = solve({ data: { note: 'b' }, updatedAt: 30 });
    expect(note(merge(a, b))).toBe('b');
    expect(merge(a, b).updatedAt).toBe(30);
  });

  it('regra 1: no empate de updatedAt vence o JSON canônico maior, dos dois lados', () => {
    const a = solve({ data: { note: 'a' } });
    const b = solve({ data: { note: 'b' } });
    expect(note(merge(a, b))).toBe('b');
    expect(note(merge(b, a))).toBe('b');
  });

  it('regra 2 (D5): uma edição mais nova não desfaz a exclusão', () => {
    const deleted = solve({ deletedAt: 20, deletionStamp: 20, updatedAt: 20 });
    const edited = solve({ data: { note: 'nota offline' }, updatedAt: 30 });
    const out = merge(deleted, edited);
    expect(out.deletedAt).toBe(20);
    expect(note(out)).toBe('nota offline');
    expect(merge(edited, deleted)).toEqual(out);
  });

  it('regra 2: restaurar (deletionStamp novo) vence a exclusão anterior', () => {
    const deleted = solve({ deletedAt: 20, deletionStamp: 20, updatedAt: 20 });
    const restored = solve({ deletedAt: null, deletionStamp: 40, updatedAt: 40 });
    expect(merge(deleted, restored).deletedAt).toBeNull();
    expect(merge(restored, deleted).deletedAt).toBeNull();
  });

  it('regra 2: no empate de deletionStamp, o excluído vence', () => {
    const deleted = solve({ deletedAt: 20, deletionStamp: 20 });
    const active = solve({ deletedAt: null, deletionStamp: 20 });
    expect(merge(active, deleted).deletedAt).toBe(20);
    expect(merge(deleted, active).deletedAt).toBe(20);
  });

  it('regra 4: desmarcar uma etapa mais tarde vence a marca anterior', () => {
    const on: Change = { store: 'prefs', id: 'trail.2', data: true, updatedAt: 10, deletedAt: null, deletionStamp: 10 };
    const off: Change = { ...on, data: false, updatedAt: 11, deletionStamp: 11 };
    expect(merge(on, off).data).toBe(false);
    expect(merge(off, on).data).toBe(false);
  });

  it('o JSON canônico ignora a ordem das chaves e as chaves undefined', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe(canonicalJson({ a: [2, { d: 3 }], b: 1 }));
    expect(canonicalJson(undefined)).toBe('null');
  });
});

describe('a cascata da sessão apagada (spec 6.3, regra 3)', () => {
  const session = (o: Partial<Change> = {}): Change => ({
    store: 'sessions', id: 's', data: { name: 'S', event: '333', order: 0, createdAt: 1 }, updatedAt: 50, deletedAt: 50, deletionStamp: 50, ...o,
  });

  it('um solve ativo mais antigo que a exclusão recebe a marca da sessão; o já excluído fica como está', () => {
    const live = solve({ id: 'a', updatedAt: 70, deletionStamp: 10 }); // editado offline depois da exclusão: não a ressuscita
    const gone = solve({ id: 'b', deletedAt: 30, deletionStamp: 30 });
    const out = cascade(session(), [live, gone]);
    expect(out.solves).toEqual([{ ...live, deletedAt: 50, deletionStamp: 50 }]);
    expect(out.session.deletedAt).toBe(50);
  });

  it('um solve gravado depois da exclusão devolve a sessão, com o deletionStamp dele', () => {
    const newer = solve({ id: 'n', deletionStamp: 80, updatedAt: 80 });
    const older = solve({ id: 'o', deletionStamp: 10 });
    const out = cascade(session(), [newer, older]);
    expect(out.session).toMatchObject({ deletedAt: null, deletionStamp: 80 });
    expect(out.solves.map((s) => s.id)).toEqual(['o']);
  });

  it('sessão ativa: nada muda', () => {
    expect(cascade(session({ deletedAt: null }), [solve()])).toEqual({ session: session({ deletedAt: null }), solves: [] });
  });
});

describe('temporadas (spec 6.4): o servidor decide', () => {
  const rec = (n: number, endedAt: number): SeasonRecord => ({ n, startedAt: 0, endedAt, solves: 1000, startAo12: null, endAo12: null });
  const season = (past: SeasonRecord[]): SeasonProgress => ({ ...defaultSeason(), past, current: { ...defaultSeason().current, n: past.length + 1 } });
  const pref = (data: SeasonProgress, updatedAt: number): Change => ({ store: 'prefs', id: 'season', data, updatedAt, deletedAt: null, deletionStamp: updatedAt });

  it('1: vence o lado com mais temporadas fechadas', () => {
    const out = mergeSeason(pref(season([rec(1, 100)]), 5), pref(season([rec(1, 100), rec(2, 200)]), 3));
    expect((out.data as SeasonProgress).past).toHaveLength(2);
    expect(out.updatedAt).toBe(5);
  });

  it('2: com o mesmo número, vence a virada mais antiga', () => {
    const out = mergeSeason(pref(season([rec(1, 300)]), 5), pref(season([rec(1, 200)]), 9));
    expect((out.data as SeasonProgress).past[0].endedAt).toBe(200);
  });

  it('3: sem fechadas ou no empate exato, fica a armazenada, com updatedAt do maior (o outro aparelho recebe de volta)', () => {
    const stored = pref(season([rec(1, 200)]), 5);
    const out = mergeSeason(stored, pref(season([{ ...rec(1, 200), solves: 1 }]), 9));
    expect((out.data as SeasonProgress).past[0].solves).toBe(1000);
    expect(out.updatedAt).toBe(9);
    expect((mergeSeason(pref(defaultSeason(), 1), pref(defaultSeason(), 2)).data as SeasonProgress).past).toEqual([]);
  });
});

describe('propriedades de merge (spec 11): comutativa, associativa e idempotente', () => {
  const rnd = seeded(20261015);
  const int = (n: number): number => Math.floor(rnd() * n);
  // Domínios pequenos, para empatar de propósito em updatedAt, deletionStamp e conteúdo.
  const gen = (): Change =>
    solve({
      data: { note: ['a', 'b', 'c'][int(3)], ms: int(2) },
      updatedAt: 10 + int(3),
      deletedAt: rnd() < 0.5 ? 20 + int(2) : null,
      deletionStamp: 10 + int(3),
    });

  it('vale em 5.000 trincas sorteadas', () => {
    for (let i = 0; i < 5000; i++) {
      const [a, b, c] = [gen(), gen(), gen()];
      expect(canonicalJson(merge(a, b))).toBe(canonicalJson(merge(b, a)));
      expect(canonicalJson(merge(merge(a, b), c))).toBe(canonicalJson(merge(a, merge(b, c))));
      expect(canonicalJson(merge(a, a))).toBe(canonicalJson(a));
    }
  });
});
```

Crie `app/tests/unit/sync-boundary.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// O Worker importa src/core/sync (spec 6.3): nada ali pode puxar o navegador, o banco ou a tela. Só imports dentro de src/core.
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/core/sync');

describe('src/core/sync é puro', () => {
  it('nenhum arquivo importa de fora de src/core', () => {
    const outside: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const text = readFileSync(resolve(dir, file), 'utf8');
      for (const m of text.matchAll(/from '([^']+)'/g)) {
        const target = m[1].startsWith('.') ? resolve(dir, m[1]) : m[1];
        if (!target.startsWith(resolve(dir, '..'))) outside.push(`${file}: ${m[1]}`);
      }
      if (/\b(window|document|indexedDB|localStorage|navigator)\b/.test(text)) outside.push(`${file}: usa API do navegador`);
    }
    expect(outside).toEqual([]);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/sync-merge.test.ts tests/unit/sync-boundary.test.ts`
Expected: FAIL. `sync-merge.test.ts` não abre (`Failed to resolve import "../../src/core/sync/merge"`), e `sync-boundary.test.ts` falha com `ENOENT: no such file or directory, scandir '…/src/core/sync'`.

- [ ] **Step 3: Os tipos do sync**

Os tipos ficam todos aqui desde já (as tarefas seguintes só os usam). Nada neste arquivo existe em tempo de execução, menos `SYNC_STORES`, `SYNC_PROTOCOL`, `SYNC_BATCH` e `syncKey`.

Crie `app/src/core/sync/types.ts`:

```ts
// O envelope do sync (spec 6.1) e os tipos que o app e o Worker dividem. Tudo aqui é puro: nada de navegador, banco ou rede, porque o
// Worker importa os mesmos arquivos (worker/tsconfig.json inclui src/core).
import type { Settings } from '../types';

export type SyncStore = 'solves' | 'sessions' | 'practice' | 'prefs';
export const SYNC_STORES: readonly SyncStore[] = Object.freeze(['solves', 'sessions', 'practice', 'prefs'] as const);

// Uma mudança: o registro inteiro, com as datas fora de `data`. Em prefs, `id` é a chave, `data` é o valor, deletedAt é sempre null e
// deletionStamp é sempre igual a updatedAt.
export interface Change {
  store: SyncStore;
  id: string;
  data: unknown;
  updatedAt: number;
  deletedAt: number | null;
  deletionStamp: number; // a data da última mudança no estado de exclusão (apagar ou restaurar); editar não mexe nela
}

export const SYNC_PROTOCOL = 1; // sobe quando o formato do pedido muda: o servidor responde 426 a uma versão que não conhece
export const SYNC_BATCH = 500; // mudanças por pedido, nos dois sentidos

export interface SyncRequest {
  v: number;
  deviceId: string;
  cursor: number;
  clock: number;
  changes: Change[];
}

export interface Rejected {
  store: string;
  id: string;
  reason: string;
}

export interface SyncResponse {
  accepted: number;
  rejected: Rejected[];
  changes: Change[];
  cursor: number;
  more: boolean;
  serverTime: number;
}

// Um item da conta (store prefs, spec 5.2).
export interface PrefItem {
  key: string;
  value: unknown;
  updatedAt: number;
}

// O perfil do aparelho (store profile, spec 5.2): o que nunca sobe.
export type DeviceSettings = Omit<Settings, 'inspection' | 'dailyGoal'>;
export interface DeviceProfile {
  settings: DeviceSettings;
  currentSessionId: string | null;
}

// Uma entrada da fila de saída (store outbox, spec 5.3), na chave `${store}/${id}`.
export interface OutboxEntry {
  store: SyncStore;
  id: string;
  queuedAt: number;
}

// O bloco sync do meta (spec 5.4), na chave 'sync' da store meta. `accountId` fica depois de sair (spec 7.6); `signedIn` diz se há
// sessão; `firstSync` diz que o primeiro login começou e a deduplicação (spec 6.5) ainda não terminou: se o app fechar no meio, ele
// continua daí; `passkey` lembra que este aparelho criou uma passkey (a tela de entrar a oferece primeiro).
export interface SyncState {
  accountId: string | null;
  email: string | null;
  signedIn: boolean;
  firstSync: boolean;
  cursor: number;
  lastSyncAt: number | null;
  clock: number;
  passkey: boolean;
}

export const syncKey = (store: string, id: string): string => `${store}/${id}`;

// Uma cópia na nuvem (spec 8.3): `name` é o nome do arquivo sem extensão (o dia, ou o dia e a hora da cópia de antes de uma restauração).
export interface CloudCopy {
  name: string;
  day: string; // AAAA-MM-DD, em Brasília
  kind: 'daily' | 'pre-restore';
  solves: number; // solves ativos na cópia
}
```

- [ ] **Step 4: As regras**

Os dois lados (conteúdo e exclusão) são decididos em separado, cada um por um máximo numa ordem total: por isso `merge` é comutativa, associativa e idempotente. A cascata devolve a sessão quando há um solve ativo mais novo que a exclusão dela (decisão 5).

Crie `app/src/core/sync/merge.ts`:

```ts
// As regras de conflito (spec 6.3 e 6.4), como funções puras. O app e o Worker importam este arquivo. `merge` é comutativa,
// associativa e idempotente (tests/unit/sync-merge.test.ts); a temporada é a exceção e só o servidor a decide (mergeSeason).
import type { SeasonProgress } from '../types';
import type { Change } from './types';

// JSON com as chaves em ordem: o mesmo valor dá o mesmo texto nos dois lados, e o desempate converge.
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

// Regra 1: o conteúdo de updatedAt maior; no empate, o JSON canônico maior (arbitrário, mas igual nos dois lados).
function contentOf(a: Change, b: Change): Change {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return canonicalJson(a.data) >= canonicalJson(b.data) ? a : b;
}

// Regra 2: a exclusão de deletionStamp maior; no empate, a marca maior (excluído vence ativo).
function deletionOf(a: Change, b: Change): Change {
  if (a.deletionStamp !== b.deletionStamp) return a.deletionStamp > b.deletionStamp ? a : b;
  return (a.deletedAt ?? -Infinity) >= (b.deletedAt ?? -Infinity) ? a : b;
}

// O mesmo registro (mesma store e id) visto pelos dois lados. Conteúdo e exclusão são decididos em separado: uma edição concorrente
// nunca desfaz uma exclusão (D5), e restaurar (deletionStamp novo) vence a exclusão anterior.
export function merge(a: Change, b: Change): Change {
  const c = contentOf(a, b);
  const d = deletionOf(a, b);
  return { store: a.store, id: a.id, data: c.data, updatedAt: c.updatedAt, deletedAt: d.deletedAt, deletionStamp: d.deletionStamp };
}

// Regra 3, a cascata da sessão apagada, aplicada depois de juntar um lote. Um solve ativo com deletionStamp menor ou igual ao da sessão
// recebe a exclusão dela (uma edição offline não ressuscita a sessão). Um solve ativo mais novo que a exclusão (gravado offline numa
// sessão que outro aparelho apagou) devolve a sessão, com o deletionStamp dele: é o que addSolve faz no aparelho, e o invariante
// "solve ativo => sessão ativa" do repositório vale também depois do sync. Devolve só o que mudou.
export function cascade(session: Change, solves: readonly Change[]): { session: Change; solves: Change[] } {
  if (session.deletedAt === null) return { session, solves: [] };
  const changed: Change[] = [];
  let newest = -Infinity;
  for (const s of solves) {
    if (s.deletedAt !== null) continue;
    if (session.deletionStamp >= s.deletionStamp) changed.push({ ...s, deletedAt: session.deletedAt, deletionStamp: session.deletionStamp });
    else newest = Math.max(newest, s.deletionStamp);
  }
  if (newest === -Infinity) return { session, solves: changed };
  return { session: { ...session, deletedAt: null, deletionStamp: newest }, solves: changed };
}

// A temporada (spec 6.4), só no servidor: temporadas fechadas nunca voltam (vence quem tem mais); com o mesmo número e pelo menos uma,
// vence a virada mais antiga; sem nenhuma, ou num empate exato, fica a armazenada. updatedAt sobe para o maior: o aparelho que mandou a
// perdedora recebe a vencedora de volta (o registro muda e ganha revisão).
export function mergeSeason(stored: Change, received: Change): Change {
  const a = stored.data as SeasonProgress;
  const b = received.data as SeasonProgress;
  let winner = stored;
  if (b.past.length > a.past.length) winner = received;
  else if (b.past.length === a.past.length && b.past.length > 0 && b.past[b.past.length - 1].endedAt < a.past[a.past.length - 1].endedAt) {
    winner = received;
  }
  const updatedAt = Math.max(stored.updatedAt, received.updatedAt);
  return { store: 'prefs', id: stored.id, data: winner.data, updatedAt, deletedAt: null, deletionStamp: updatedAt };
}
```

- [ ] **Step 5: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/sync-merge.test.ts tests/unit/sync-boundary.test.ts`
Expected: PASS (14 + 1 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/core/sync/types.ts src/core/sync/merge.ts tests/unit/sync-random.ts tests/unit/sync-merge.test.ts tests/unit/sync-boundary.test.ts
git commit -m "feat(sync): regras de conflito puras, com as propriedades testadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Registros, ajustes da conta e a forma de uma mudança

Spec: seções 5.2, 6.1 (passo 1) e 6.6 (mudança rejeitada); decisão 4 do começo deste plano.

**Files:**
- Create: `app/src/core/sync/records.ts`
- Create: `app/src/core/sync/prefs.ts`
- Create: `app/src/core/sync/shape.ts`
- Test: `app/tests/unit/sync-records.test.ts`

**Interfaces:**
- Consumes: `Change`, `PrefItem`, `DeviceProfile`, `DeviceSettings`, `SYNC_STORES` (Task 1); `canonicalJson` (Task 1); `defaultSeason`, `seasonFrom` (`core/season.ts`); `caseById` (`core/trail/cases.ts`); `EVENT_IDS` (`core/events.ts`); `defaultSettings`, `Profile`, `Settings`, `FinishId`, `SeasonProgress` (`core/types.ts`).
- Produces (em `core/sync/records.ts`): `RecordStore = Exclude<SyncStore, 'prefs'>`, `StampedRecord { id; updatedAt; deletedAt; deletionStamp }`, `toChange(store: RecordStore, record: StampedRecord): Change`, `fromChange<R extends StampedRecord>(change: Change): R`, `prefToChange(item: PrefItem): Change`, `changeToPref(change: Change): PrefItem`.
- Produces (em `core/sync/prefs.ts`): `TRAIL_STEPS = 9`, `AccountProfile` (trail, lessonAt, algChoice, trainOff, finish, onboarded, season e `settings: { inspection; dailyGoal }`), `defaultPrefValue(key: string): unknown`, `isPrefValue(key: string, value: unknown): boolean`, `prefsFromProfile(p: AccountProfile, o?: { withDefaults?: boolean }): Map<string, unknown>`, `profileFromPrefs(items: Iterable<PrefItem>): AccountProfile`, `defaultDeviceProfile(): DeviceProfile`, `splitProfile(p: Profile): { device: DeviceProfile; account: AccountProfile }`, `joinProfile(device: DeviceProfile | undefined, account: AccountProfile): Profile`.
- Produces (em `core/sync/shape.ts`): `MAX_DATA_CHARS = 16_384`, `MAX_SEASON_CHARS = 65_536`, `Checked = { ok: true; change: Change } | { ok: false; reason: string }`, `checkChange(raw: unknown): Checked` (os motivos: `'mudança não é objeto'`, `'store desconhecida'`, `'id inválido'`, `'datas inválidas'`, `'grande demais'`, `'prefs sem exclusão'`, `'valor inválido para a chave'`, `'solve inválido'`, `'sessão inválida'`, `'tentativa inválida'`, `'data não é objeto'`).

As chaves da conta são as da spec 5.2: `trail.0` a `trail.8`, `lessonAt.<etapa>` (número ou `null`), `algChoice.<caseId>` (índice; `0` é o padrão), `trainOff.<caseId>` (booleano), `finish`, `onboarded`, `settings.inspection`, `settings.dailyGoal` e `season`. O resto do perfil (tema, sons, armar no celular, tempo para armar, reduzir movimento, modo do Centro, modo silencioso, imagem do embaralhamento e a sessão atual) é do aparelho.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/sync-records.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { defaultDeviceProfile, defaultPrefValue, isPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../../src/core/sync/prefs';
import { changeToPref, fromChange, prefToChange, toChange } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import type { Change } from '../../src/core/sync/types';
import { defaultSettings, type Profile } from '../../src/core/types';

const profile = (o: Partial<Profile> = {}): Profile => ({
  settings: defaultSettings(),
  trail: Array<boolean>(9).fill(false),
  finish: 'fosco',
  onboarded: false,
  currentSessionId: null,
  season: defaultSeason(),
  lessonAt: {},
  algChoice: {},
  trainOff: [],
  ...o,
});

describe('registro e mudança (spec 6.1)', () => {
  it('as datas vão para o envelope; o resto, inclusive um campo desconhecido, vai em data e volta igual', () => {
    const rec = { id: 'a', sessionId: 's', event: '333', ms: 1, penalty: null, at: 2, scramble: 'R', note: '', createdAt: 2, updatedAt: 3, deletedAt: null, deletionStamp: 2, extra: 'x' };
    const c = toChange('solves', rec);
    expect(c).toEqual({
      store: 'solves', id: 'a', updatedAt: 3, deletedAt: null, deletionStamp: 2,
      data: { sessionId: 's', event: '333', ms: 1, penalty: null, at: 2, scramble: 'R', note: '', createdAt: 2, extra: 'x' },
    });
    expect(fromChange(c)).toEqual(rec);
  });

  it('um item da conta vira mudança com deletedAt null e deletionStamp igual a updatedAt', () => {
    const c = prefToChange({ key: 'trail.3', value: true, updatedAt: 9 });
    expect(c).toEqual({ store: 'prefs', id: 'trail.3', data: true, updatedAt: 9, deletedAt: null, deletionStamp: 9 });
    expect(changeToPref(c)).toEqual({ key: 'trail.3', value: true, updatedAt: 9 });
  });
});

describe('perfil da conta e do aparelho (spec 5.2)', () => {
  it('dividir e juntar devolve o mesmo perfil', () => {
    const p = profile({
      trail: [true, true, false, false, false, false, false, false, false], finish: 'gelo', onboarded: true, currentSessionId: 's1',
      lessonAt: { 2: 4 }, algChoice: { 'oll2-h': 1 }, trainOff: ['pll2-t'],
      settings: { ...defaultSettings(), inspection: false, dailyGoal: 30, theme: 'dark', holdMs: 550 },
    });
    const { device, account } = splitProfile(p);
    expect(device).toEqual({ settings: { ...defaultDeviceProfile().settings, theme: 'dark', holdMs: 550 }, currentSessionId: 's1' });
    expect(Object.keys(device.settings)).not.toContain('inspection');
    expect(joinProfile(device, profileFromPrefs([...prefsFromProfile(account)].map(([key, value]) => ({ key, value, updatedAt: 1 }))))).toEqual(p);
  });

  it('sem withDefaults, só as chaves fora do padrão; com ele, todas', () => {
    const { account } = splitProfile(profile({ trail: [false, true, false, false, false, false, false, false, false] }));
    expect([...prefsFromProfile(account).keys()]).toEqual(['trail.1']);
    expect(prefsFromProfile(account, { withDefaults: true }).size).toBe(9 + 5);
  });

  it('um item inválido ou de chave desconhecida fica de fora; null em lessonAt e 0 em algChoice são "sem valor"', () => {
    const p = profileFromPrefs([
      { key: 'trail.1', value: 'sim', updatedAt: 1 },
      { key: 'trail.9', value: true, updatedAt: 1 },
      { key: 'lessonAt.2', value: null, updatedAt: 1 },
      { key: 'algChoice.oll2-h', value: 0, updatedAt: 1 },
      { key: 'algChoice.nao-existe', value: 1, updatedAt: 1 },
      { key: 'futuro', value: 1, updatedAt: 1 },
      { key: 'settings.dailyGoal', value: 0, updatedAt: 1 },
    ]);
    expect(p).toEqual(profileFromPrefs([]));
  });

  it('os casos fora do sorteio saem na ordem em que foram tirados', () => {
    const p = profileFromPrefs([
      { key: 'trainOff.pll2-t', value: true, updatedAt: 5 },
      { key: 'trainOff.oll2-h', value: true, updatedAt: 9 },
      { key: 'trainOff.oll2-l', value: false, updatedAt: 7 },
    ]);
    expect(p.trainOff).toEqual(['pll2-t', 'oll2-h']);
  });

  it('o valor padrão de cada família de chaves', () => {
    expect(['trail.0', 'lessonAt.1', 'algChoice.x', 'trainOff.x', 'finish', 'settings.inspection'].map(defaultPrefValue)).toEqual([false, null, 0, false, 'fosco', true]);
    expect(isPrefValue('season', defaultSeason())).toBe(true);
    expect(isPrefValue('season', { past: 'x' })).toBe(false);
  });
});

describe('forma da mudança (spec 6.1, passo 1)', () => {
  const ok: Change = {
    store: 'solves', id: 'a1', updatedAt: 3, deletedAt: null, deletionStamp: 2,
    data: { sessionId: 's', event: '333', ms: 1, penalty: '+2', at: 2, scramble: 'R', note: '', createdAt: 2, futuro: true },
  };

  it('aceita um solve, uma sessão, uma tentativa e um item da conta bem formados', () => {
    expect(checkChange(ok)).toEqual({ ok: true, change: ok });
    expect(checkChange({ store: 'sessions', id: 'default-333', data: { name: 'Sessão 1', event: '333', order: 0, createdAt: 1 }, updatedAt: 1, deletedAt: 5, deletionStamp: 5 }).ok).toBe(true);
    expect(checkChange({ store: 'practice', id: 'p1', data: { caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: 1 }, updatedAt: 1, deletedAt: null, deletionStamp: 1 }).ok).toBe(true);
    expect(checkChange({ store: 'prefs', id: 'trail.0', data: true, updatedAt: 1, deletedAt: null, deletionStamp: 1 }).ok).toBe(true);
  });

  it.each([
    ['store desconhecida', { ...ok, store: 'profile' }, 'store desconhecida'],
    ['id com espaço', { ...ok, id: 'a b' }, 'id inválido'],
    ['data negativa', { ...ok, updatedAt: -1 }, 'datas inválidas'],
    ['evento desconhecido', { ...ok, data: { ...(ok.data as object), event: 'fto' } }, 'solve inválido'],
    ['nota grande demais', { ...ok, data: { ...(ok.data as object), note: 'x'.repeat(20_000) } }, 'grande demais'],
    ['prefs com exclusão', { store: 'prefs', id: 'trail.0', data: true, updatedAt: 1, deletedAt: 1, deletionStamp: 1 }, 'prefs sem exclusão'],
    ['chave da conta desconhecida', { store: 'prefs', id: 'theme', data: 'dark', updatedAt: 1, deletedAt: null, deletionStamp: 1 }, 'valor inválido para a chave'],
  ])('recusa %s, com o motivo', (_name, raw, reason) => {
    expect(checkChange(raw)).toEqual({ ok: false, reason });
  });

  it('o envelope sai só com os seis campos', () => {
    const r = checkChange({ ...ok, rev: 9 });
    expect(r.ok && Object.keys(r.change).sort()).toEqual(['data', 'deletedAt', 'deletionStamp', 'id', 'store', 'updatedAt']);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/sync-records.test.ts`
Expected: FAIL: o arquivo não abre (`Failed to resolve import` de `src/core/sync/records`, `prefs` ou `shape`).

- [ ] **Step 3: Registro e mudança**

Crie `app/src/core/sync/records.ts`:

```ts
// Registro gravado <-> mudança do sync (spec 6.1). O registro guarda as datas ao lado dos campos; a mudança as tira para o envelope e
// leva o resto em `data`, inclusive campos que esta versão não conhece (passam intactos).
import type { Change, PrefItem, SyncStore } from './types';

export type RecordStore = Exclude<SyncStore, 'prefs'>;

export interface StampedRecord {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  deletionStamp: number;
}

export function toChange(store: RecordStore, record: StampedRecord): Change {
  const { id, updatedAt, deletedAt, deletionStamp, ...data } = record as StampedRecord & Record<string, unknown>;
  return { store, id, data, updatedAt, deletedAt, deletionStamp };
}

export function fromChange<R extends StampedRecord>(change: Change): R {
  const data = (typeof change.data === 'object' && change.data !== null ? change.data : {}) as Record<string, unknown>;
  return { ...data, id: change.id, updatedAt: change.updatedAt, deletedAt: change.deletedAt, deletionStamp: change.deletionStamp } as unknown as R;
}

export const prefToChange = (item: PrefItem): Change => ({
  store: 'prefs',
  id: item.key,
  data: item.value,
  updatedAt: item.updatedAt,
  deletedAt: null,
  deletionStamp: item.updatedAt,
});

export const changeToPref = (change: Change): PrefItem => ({ key: change.id, value: change.data, updatedAt: change.updatedAt });
```

- [ ] **Step 4: Os ajustes da conta e do aparelho**

`prefsFromProfile` sem `withDefaults` devolve só o que difere do padrão: é o que a migração grava (decisão 4). `profileFromPrefs` aceita só itens válidos (`isPrefValue`): um item de uma versão futura do app fica de fora.

Crie `app/src/core/sync/prefs.ts`:

```ts
// Os ajustes da conta (store prefs) e os do aparelho (store profile), spec 5.2. O app monta o mesmo Profile de sempre a partir das
// duas partes (joinProfile), e as telas não percebem a divisão. Cada chave da conta segue "o mais recente vence", com a temporada à parte.
import { defaultSeason, seasonFrom } from '../season';
import { caseById } from '../trail/cases';
import { defaultSettings, type FinishId, type Profile, type SeasonProgress, type Settings } from '../types';
import { canonicalJson } from './merge';
import type { DeviceProfile, DeviceSettings, PrefItem } from './types';

export const TRAIL_STEPS = 9;
const FINISHES: readonly FinishId[] = ['fosco', 'brilho', 'gelo', 'carbono'];

// O que do perfil é da conta: trilha, aulas, treino, acabamento, tour, inspeção, meta diária e temporada.
export interface AccountProfile {
  trail: boolean[];
  lessonAt: Profile['lessonAt'];
  algChoice: Record<string, number>;
  trainOff: string[];
  finish: FinishId;
  onboarded: boolean;
  season: SeasonProgress;
  settings: Pick<Settings, 'inspection' | 'dailyGoal'>;
}

const isWhole = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;
const stepOf = (key: string, prefix: string): number | null => {
  const m = key.slice(prefix.length);
  return /^[0-8]$/.test(m) ? Number(m) : null;
};

// O valor que uma chave tem quando ninguém a gravou. Sumir uma aula, uma escolha ou um caso fora do sorteio é gravar este valor.
export function defaultPrefValue(key: string): unknown {
  if (key.startsWith('trail.')) return false;
  if (key.startsWith('lessonAt.')) return null;
  if (key.startsWith('algChoice.')) return 0;
  if (key.startsWith('trainOff.')) return false;
  switch (key) {
    case 'finish':
      return 'fosco';
    case 'onboarded':
      return false;
    case 'settings.inspection':
      return true;
    case 'settings.dailyGoal':
      return 20;
    case 'season':
      return defaultSeason();
    default:
      return undefined;
  }
}

// A chave existe e o valor tem o tipo dela. O servidor recusa o resto (spec 6.1, passo 1); o app ignora.
export function isPrefValue(key: string, value: unknown): boolean {
  if (key.startsWith('trail.')) return stepOf(key, 'trail.') !== null && typeof value === 'boolean';
  if (key.startsWith('lessonAt.')) return stepOf(key, 'lessonAt.') !== null && (value === null || isWhole(value, 0));
  if (key.startsWith('algChoice.')) {
    const c = caseById(key.slice('algChoice.'.length));
    return c !== undefined && isWhole(value, 0) && value < c.algs.length;
  }
  if (key.startsWith('trainOff.')) return caseById(key.slice('trainOff.'.length)) !== undefined && typeof value === 'boolean';
  switch (key) {
    case 'finish':
      return typeof value === 'string' && (FINISHES as readonly string[]).includes(value);
    case 'onboarded':
    case 'settings.inspection':
      return typeof value === 'boolean';
    case 'settings.dailyGoal':
      return isWhole(value, 1);
    case 'season':
      return seasonFrom(value) !== null;
    default:
      return false;
  }
}

// O perfil da conta como itens. Sem `withDefaults`, só as chaves com valor diferente do padrão: é o que a migração grava (spec 5.6), e
// um aparelho com tudo no padrão não apaga o progresso do outro no primeiro login.
export function prefsFromProfile(p: AccountProfile, { withDefaults = false }: { withDefaults?: boolean } = {}): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (let i = 0; i < TRAIL_STEPS; i++) out.set(`trail.${i}`, p.trail[i] === true);
  for (const [step, at] of Object.entries(p.lessonAt)) if (at !== undefined) out.set(`lessonAt.${step}`, at);
  for (const [id, index] of Object.entries(p.algChoice)) if (index !== 0) out.set(`algChoice.${id}`, index);
  for (const id of p.trainOff) out.set(`trainOff.${id}`, true);
  out.set('finish', p.finish);
  out.set('onboarded', p.onboarded);
  out.set('settings.inspection', p.settings.inspection);
  out.set('settings.dailyGoal', p.settings.dailyGoal);
  out.set('season', p.season);
  if (withDefaults) return out;
  for (const [key, value] of out) if (canonicalJson(value) === canonicalJson(defaultPrefValue(key))) out.delete(key);
  return out;
}

// O perfil da conta a partir dos itens: o padrão por baixo, e cada item válido por cima. Um item que esta versão não conhece fica de fora.
// Os casos fora do sorteio saem na ordem em que foram tirados (updatedAt, depois a chave).
export function profileFromPrefs(items: Iterable<PrefItem>): AccountProfile {
  const p: AccountProfile = {
    trail: Array<boolean>(TRAIL_STEPS).fill(false),
    lessonAt: {},
    algChoice: {},
    trainOff: [],
    finish: 'fosco',
    onboarded: false,
    season: defaultSeason(),
    settings: { inspection: true, dailyGoal: 20 },
  };
  const off: PrefItem[] = [];
  for (const item of items) {
    const { key, value } = item;
    if (!isPrefValue(key, value)) continue;
    if (key.startsWith('trail.')) p.trail[stepOf(key, 'trail.')!] = value as boolean;
    else if (key.startsWith('lessonAt.')) {
      if (value !== null) (p.lessonAt as Record<number, number>)[stepOf(key, 'lessonAt.')!] = value as number;
    } else if (key.startsWith('algChoice.')) {
      if (value !== 0) p.algChoice[key.slice('algChoice.'.length)] = value as number;
    } else if (key.startsWith('trainOff.')) {
      if (value === true) off.push(item);
    } else if (key === 'finish') p.finish = value as FinishId;
    else if (key === 'onboarded') p.onboarded = value as boolean;
    else if (key === 'settings.inspection') p.settings.inspection = value as boolean;
    else if (key === 'settings.dailyGoal') p.settings.dailyGoal = value as number;
    else if (key === 'season') p.season = seasonFrom(value)!;
  }
  p.trainOff = off
    .sort((a, b) => a.updatedAt - b.updatedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((i) => i.key.slice('trainOff.'.length));
  return p;
}

export function defaultDeviceProfile(): DeviceProfile {
  const { inspection: _i, dailyGoal: _d, ...settings } = defaultSettings();
  return { settings, currentSessionId: null };
}

// Divide o perfil da tela nas duas partes.
export function splitProfile(p: Profile): { device: DeviceProfile; account: AccountProfile } {
  const { inspection, dailyGoal, ...settings } = p.settings;
  return {
    device: { settings: settings as DeviceSettings, currentSessionId: p.currentSessionId },
    account: {
      trail: p.trail,
      lessonAt: p.lessonAt,
      algChoice: p.algChoice,
      trainOff: p.trainOff,
      finish: p.finish,
      onboarded: p.onboarded,
      season: p.season,
      settings: { inspection, dailyGoal },
    },
  };
}

// Junta as duas partes no Profile de sempre. Um perfil do aparelho de antes (sem algum ajuste) lê os padrões por baixo.
export function joinProfile(device: DeviceProfile | undefined, account: AccountProfile): Profile {
  const base = defaultDeviceProfile();
  const d = device ?? base;
  return {
    settings: { ...base.settings, ...d.settings, sound: { ...base.settings.sound, ...d.settings?.sound }, ...account.settings },
    trail: account.trail,
    finish: account.finish,
    onboarded: account.onboarded,
    currentSessionId: d.currentSessionId ?? null,
    season: account.season,
    lessonAt: account.lessonAt,
    algChoice: account.algChoice,
    trainOff: account.trainOff,
  };
}
```

- [ ] **Step 5: A forma de uma mudança**

Crie `app/src/core/sync/shape.ts`:

```ts
// A forma de uma mudança (spec 6.1, passo 1): store conhecida, id, datas, tamanho e os campos que o Klick usa de cada registro. Campos
// a mais em `data` passam intactos. O servidor recusa o que não bate, com o motivo; o app ignora o que vier torto do servidor.
import { EVENT_IDS } from '../events';
import { canonicalJson } from './merge';
import { isPrefValue } from './prefs';
import { SYNC_STORES, type Change, type SyncStore } from './types';

export const MAX_DATA_CHARS = 16_384;
export const MAX_SEASON_CHARS = 65_536;
const ID = /^[\w.-]{1,96}$/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStamp = (v: unknown): v is number => isNum(v) && v >= 0;
const isEvent = (v: unknown): boolean => typeof v === 'string' && (EVENT_IDS as readonly string[]).includes(v);
const isPenalty = (v: unknown): boolean => v === null || v === '+2' || v === 'DNF';

function dataProblem(store: SyncStore, id: string, d: unknown, change: Record<string, unknown>): string | null {
  if (store === 'prefs') {
    if (change.deletedAt !== null || change.deletionStamp !== change.updatedAt) return 'prefs sem exclusão';
    return isPrefValue(id, d) ? null : 'valor inválido para a chave';
  }
  if (!isRec(d)) return 'data não é objeto';
  switch (store) {
    case 'solves':
      return typeof d.sessionId === 'string' && d.sessionId !== '' && isEvent(d.event) && isNum(d.ms) && d.ms >= 0 && isPenalty(d.penalty) &&
        isNum(d.at) && typeof d.scramble === 'string' && typeof d.note === 'string' && isNum(d.createdAt)
        ? null
        : 'solve inválido';
    case 'sessions':
      return typeof d.name === 'string' && isEvent(d.event) && isNum(d.order) && isNum(d.createdAt) ? null : 'sessão inválida';
    case 'practice':
      return typeof d.caseId === 'string' && d.caseId !== '' && isNum(d.ms) && d.ms >= 0 && typeof d.ok === 'boolean' &&
        typeof d.helped === 'boolean' && isNum(d.at)
        ? null
        : 'tentativa inválida';
  }
}

export type Checked = { ok: true; change: Change } | { ok: false; reason: string };

export function checkChange(raw: unknown): Checked {
  if (!isRec(raw)) return { ok: false, reason: 'mudança não é objeto' };
  const { store, id, data, updatedAt, deletedAt, deletionStamp } = raw;
  if (typeof store !== 'string' || !(SYNC_STORES as readonly string[]).includes(store)) return { ok: false, reason: 'store desconhecida' };
  if (typeof id !== 'string' || !ID.test(id)) return { ok: false, reason: 'id inválido' };
  if (!isStamp(updatedAt) || !isStamp(deletionStamp) || !(deletedAt === null || isStamp(deletedAt))) return { ok: false, reason: 'datas inválidas' };
  const limit = store === 'prefs' && id === 'season' ? MAX_SEASON_CHARS : MAX_DATA_CHARS;
  if (canonicalJson(data).length > limit) return { ok: false, reason: 'grande demais' };
  const problem = dataProblem(store as SyncStore, id, data, raw);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, change: { store: store as SyncStore, id, data, updatedAt, deletedAt, deletionStamp } };
}
```

- [ ] **Step 6: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/sync-records.test.ts`
Expected: PASS (16 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add src/core/sync/records.ts src/core/sync/prefs.ts src/core/sync/shape.ts tests/unit/sync-records.test.ts
git commit -m "feat(sync): registros, ajustes da conta e a forma de uma mudança

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Juntar um lote, e a simulação de três aparelhos

Spec: seções 6.1, 6.3, 6.4 e 11 (regras de conflito e simulação); decisões 5 e 6 do começo deste plano.

**Files:**
- Create: `app/src/core/sync/apply.ts`
- Create: `app/tests/unit/sync-fakes.ts` (apoio: o servidor falso, usado também pelos testes do motor; não é arquivo de teste)
- Test: `app/tests/unit/sync-sim.test.ts`

**Interfaces:**
- Consumes: `merge`, `cascade`, `mergeSeason`, `canonicalJson` (Task 1); `checkChange` (Task 2); `Change`, `Rejected`, `SyncStore`, `SyncRequest`, `SyncResponse`, `syncKey` (Task 1); `seeded`, `pickWith` (Task 1); `seasonOne` (`core/season.ts`).
- Produces (em `core/sync/apply.ts`): `RecordView { get(store, id): Change | undefined; solvesOf(sessionId): Change[] }`, `ApplyOptions { mode: 'server' | 'client'; pending?: (store, id) => boolean }`, `ApplyResult { writes: Change[]; derived: string[]; rejected: Rejected[]; deletedSolves: number }`, `sameChange(a, b): boolean`, `applyChanges(view: RecordView, incoming: readonly unknown[], opts: ApplyOptions): ApplyResult`.
- Produces (em `tests/unit/sync-fakes.ts`): `class MapView implements RecordView` (sobre um `Map<string, Change>`), `class FakeServer { records; rev; now; requests; batch; sync(req: SyncRequest): SyncResponse; active(): Map<string, Change> }`.

`applyChanges` é o mesmo código nos três lugares: o Durable Object (Task 8) o chama no modo `'server'`, o repositório (Task 11) no modo `'client'`, e a simulação nos dois. No servidor, a temporada passa por `mergeSeason`, e um registro cujo resultado difere do que chegou volta em `writes` (decisão 6). No aparelho, a temporada do servidor é adotada, a não ser que a daqui espere na fila; `derived` traz as chaves que a cascata mudou, para irem à fila (decisão 5).

- [ ] **Step 1: Escreva o servidor falso e a simulação, que falham**

A simulação sorteia, com semente fixa, mil rodadas de gravações, edições, exclusões e restaurações de solves e sessões, trocas da trilha, viradas de temporada, aparelhos que saem e voltam da rede, aparelhos que ficam semanas fechados (a lixeira deles esvazia) e arquivos velhos importados depois disso. Os relógios de dois aparelhos estão errados: um hora atrasado, outro dois minutos adiantado. No fim, todos sincronizam, e os registros de cada um têm de ser os do servidor; nenhum solve que ninguém apagou (nem a sessão dele) pode ter sumido; e nenhum solve ativo fica numa sessão excluída.

Crie `app/tests/unit/sync-fakes.ts`:

```ts
// Apoio dos testes do sync: um servidor falso, com o mesmo applyChanges do Durable Object (spec 11). Não é um arquivo de teste: a
// simulação e os testes do motor importam daqui.
import { applyChanges, type RecordView } from '../../src/core/sync/apply';
import { syncKey, type Change, type SyncRequest, type SyncResponse, type SyncStore } from '../../src/core/sync/types';

export class MapView implements RecordView {
  readonly records: Map<string, Change>;
  constructor(records: Map<string, Change>) {
    this.records = records;
  }
  get(store: SyncStore, id: string): Change | undefined {
    return this.records.get(syncKey(store, id));
  }
  solvesOf(sessionId: string): Change[] {
    return [...this.records.values()].filter((c) => c.store === 'solves' && (c.data as { sessionId?: unknown }).sessionId === sessionId);
  }
}

// O servidor de uma conta: registros com revisão, um pedido por vez. `batch` é o tamanho do lote na volta (pequeno nos testes, para
// exercitar `more`); `now` é a hora do servidor.
export class FakeServer {
  readonly records = new Map<string, Change & { rev: number }>();
  rev = 0;
  now = 0;
  requests = 0;
  readonly batch: number;
  constructor(batch = 500) {
    this.batch = batch;
  }
  sync(req: SyncRequest): SyncResponse {
    this.requests++;
    const view = new MapView(this.records);
    const result = applyChanges(view, req.changes, { mode: 'server' });
    for (const w of result.writes) this.records.set(syncKey(w.store, w.id), { ...w, rev: ++this.rev });
    const after = [...this.records.values()].filter((r) => r.rev > req.cursor).sort((a, b) => a.rev - b.rev);
    const page = after.slice(0, this.batch);
    return {
      accepted: req.changes.length - result.rejected.length,
      rejected: result.rejected,
      changes: page.map(({ rev: _rev, ...c }) => c),
      cursor: page.length > 0 ? page[page.length - 1].rev : req.cursor,
      more: after.length > page.length,
      serverTime: this.now,
    };
  }
  // O que está ativo no servidor (prefs inclusive), sem a revisão.
  active(): Map<string, Change> {
    const out = new Map<string, Change>();
    for (const [k, { rev: _rev, ...c }] of this.records) if (c.deletedAt === null) out.set(k, c);
    return out;
  }
}
```

Crie `app/tests/unit/sync-sim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyChanges, sameChange } from '../../src/core/sync/apply';
import { syncKey, type Change, type SyncStore } from '../../src/core/sync/types';
import { seasonOne } from '../../src/core/season';
import type { SeasonProgress } from '../../src/core/types';
import { FakeServer, MapView } from './sync-fakes';
import { pickWith, seeded } from './sync-random';

const DAY = 86_400_000;

// Um aparelho falso: registros, fila de saída, cursor e o relógio do app (spec 5.4), com o relógio do sistema adiantado ou atrasado.
class Device {
  readonly records = new Map<string, Change>();
  readonly outbox = new Map<string, number>();
  cursor = 0;
  clock = 0;
  online = true;
  readonly name: string;
  readonly skew: number;
  private readonly sim: { now: number };
  constructor(name: string, skew: number, sim: { now: number }) {
    this.name = name;
    this.skew = skew;
    this.sim = sim;
  }
  stamp(): number {
    this.clock = Math.max(this.sim.now + this.skew, this.clock + 1);
    return this.clock;
  }
  put(c: Change): void {
    this.records.set(syncKey(c.store, c.id), c);
    this.outbox.set(syncKey(c.store, c.id), this.clock);
  }
  get(store: SyncStore, id: string): Change | undefined {
    return this.records.get(syncKey(store, id));
  }
  all(store: SyncStore): Change[] {
    return [...this.records.values()].filter((c) => c.store === store);
  }
  // O mesmo laço do motor (spec 6.1): manda até `batch` da fila, tira da fila o que não mudou durante o pedido, aplica a volta e repete
  // enquanto houver fila ou `more`. O que a cascata muda aqui entra na fila.
  sync(server: FakeServer, batch: number): void {
    for (let guard = 0; guard < 10_000; guard++) {
      const keys = [...this.outbox.keys()].slice(0, batch);
      const sent = keys.map((k) => ({ k, q: this.outbox.get(k)!, c: this.records.get(k) })).filter((x) => x.c !== undefined);
      const res = server.sync({ v: 1, deviceId: this.name, cursor: this.cursor, clock: this.clock, changes: sent.map((x) => x.c!) });
      for (const k of keys) if (!this.records.has(k)) this.outbox.delete(k);
      for (const x of sent) if (this.outbox.get(x.k) === x.q) this.outbox.delete(x.k);
      const result = applyChanges(new MapView(this.records), res.changes, { mode: 'client', pending: (s, id) => this.outbox.has(syncKey(s, id)) });
      for (const w of result.writes) this.records.set(syncKey(w.store, w.id), w);
      this.clock = Math.max(this.clock, res.serverTime, ...res.changes.map((c) => Math.max(c.updatedAt, c.deletionStamp)));
      for (const k of result.derived) this.outbox.set(k, this.clock);
      this.cursor = res.cursor;
      if (this.outbox.size === 0 && !res.more) return;
    }
    throw new Error(`${this.name}: o sync não terminou`);
  }
  // A lixeira de 30 dias (spec 5.5): só some de vez o que não espera na fila.
  purge(now: number): void {
    for (const [k, c] of this.records) {
      if (c.store !== 'prefs' && c.deletedAt !== null && c.deletedAt < now - 30 * DAY && !this.outbox.has(k)) this.records.delete(k);
    }
  }
}

const solveData = (sessionId: string, n: number, at: number) => ({
  sessionId, event: '333', ms: 10_000 + n, penalty: null, at, scramble: "R U R'", note: '', createdAt: at,
});
const sessionData = (n: number, at: number) => ({ name: `Sessão ${n}`, event: '333', order: n, createdAt: at });
// Uma temporada válida (seasonFrom) com `ends` como as viradas já fechadas.
const seasonAfter = (ends: number[]): SeasonProgress => ({
  current: { ...seasonOne(), n: ends.length + 1 },
  past: ends.map((endedAt, i) => ({ n: i + 1, startedAt: 0, endedAt, solves: 1000, startAo12: null, endAo12: null })),
});

// Três aparelhos e um servidor, gravando, editando, apagando, restaurando e trocando a trilha ao acaso (spec 11). No fim, todos iguais
// ao servidor, e nenhum solve que não foi apagado (nem a sessão dele) sumiu.
function simulate(seed: number, rounds: number, batch: number): void {
  const rnd = seeded(seed);
  const pick = pickWith(rnd);
  const sim = { now: 1_791_500_000_000 };
  const server = new FakeServer(batch);
  const devices = [new Device('A', 0, sim), new Device('B', -3_600_000, sim), new Device('C', 120_000, sim)];
  const created = new Map<string, string>(); // solve -> sessão
  const touchedByDelete = new Set<string>(); // solves e sessões que alguém apagou
  const memories: { d: Device; c: Change }[] = [];
  let n = 0;

  for (let round = 0; round < rounds; round++) {
    sim.now += Math.floor(rnd() * 600_000);
    server.now = sim.now;
    const d = pick(devices)!;
    const op = rnd();
    if (op < 0.06) {
      const s = d.stamp();
      d.put({ store: 'sessions', id: `ses${++n}`, data: sessionData(n, s), updatedAt: s, deletedAt: null, deletionStamp: s });
    } else if (op < 0.35) {
      const session = pick(d.all('sessions').filter((c) => c.deletedAt === null)) ?? pick(d.all('sessions'));
      if (!session) continue;
      const s = d.stamp();
      const id = `sol${++n}`;
      created.set(id, session.id);
      d.put({ store: 'solves', id, data: solveData(session.id, n, s), updatedAt: s, deletedAt: null, deletionStamp: s });
      if (session.deletedAt !== null) d.put({ ...session, deletedAt: null, deletionStamp: s, updatedAt: s }); // addSolve revive a sessão
    } else if (op < 0.48) {
      const x = pick(d.all('solves'));
      if (!x) continue;
      const s = d.stamp();
      d.put({ ...x, data: { ...(x.data as object), note: `nota ${++n}` }, updatedAt: s });
    } else if (op < 0.58) {
      const x = pick(d.all('solves').filter((c) => c.deletedAt === null));
      if (!x) continue;
      const s = d.stamp();
      touchedByDelete.add(x.id);
      d.put({ ...x, deletedAt: s, deletionStamp: s, updatedAt: s });
    } else if (op < 0.64) {
      const x = pick(d.all('solves').filter((c) => c.deletedAt !== null));
      if (!x) continue;
      const s = d.stamp();
      d.put({ ...x, deletedAt: null, deletionStamp: s, updatedAt: s });
      const session = d.get('sessions', (x.data as { sessionId: string }).sessionId);
      if (session && session.deletedAt !== null) d.put({ ...session, deletedAt: null, deletionStamp: s, updatedAt: s });
    } else if (op < 0.69) {
      const session = pick(d.all('sessions').filter((c) => c.deletedAt === null));
      if (!session) continue;
      const s = d.stamp();
      touchedByDelete.add(session.id);
      d.put({ ...session, deletedAt: s, deletionStamp: s, updatedAt: s });
      for (const x of d.all('solves')) {
        if (x.deletedAt === null && (x.data as { sessionId: string }).sessionId === session.id) d.put({ ...x, deletedAt: s, deletionStamp: s, updatedAt: s });
      }
    } else if (op < 0.73) {
      const session = pick(d.all('sessions').filter((c) => c.deletedAt !== null));
      if (!session) continue;
      const s = d.stamp();
      d.put({ ...session, deletedAt: null, deletionStamp: s, updatedAt: s });
      for (const x of d.all('solves')) {
        const mine = (x.data as { sessionId: string }).sessionId === session.id;
        if (mine && x.deletedAt === session.deletedAt) d.put({ ...x, deletedAt: null, deletionStamp: s, updatedAt: s });
      }
    } else if (op < 0.8) {
      const s = d.stamp();
      d.put({ store: 'prefs', id: `trail.${Math.floor(rnd() * 9)}`, data: rnd() < 0.5, updatedAt: s, deletedAt: null, deletionStamp: s });
    } else if (op < 0.82) {
      const past = ((d.get('prefs', 'season')?.data as SeasonProgress | undefined)?.past ?? []).map((r) => r.endedAt);
      const s = d.stamp();
      d.put({ store: 'prefs', id: 'season', data: seasonAfter([...past, s]), updatedAt: s, deletedAt: null, deletionStamp: s });
    } else if (op < 0.84) {
      const x = pick(d.all('solves'));
      if (x) memories.push({ d, c: structuredClone(x) });
    } else if (op < 0.85) {
      // Um arquivo velho importado depois que a lixeira apagou o registro de vez: a versão velha sobe e precisa perder.
      const m = pick(memories.filter((x) => x.d === d && !d.records.has(syncKey(x.c.store, x.c.id))));
      if (m) d.put(structuredClone(m.c));
    } else if (op < 0.87) {
      d.online = !d.online;
    } else if (op < 0.89) {
      sim.now += 40 * DAY; // um aparelho fica semanas sem abrir: a lixeira dele esvazia
      d.purge(sim.now + d.skew);
    } else if (d.online) {
      d.sync(server, batch);
    }
  }

  for (const d of devices) d.online = true;
  for (let i = 0; i < 2; i++) for (const d of devices) d.sync(server, batch);

  const active = server.active();
  for (const d of devices) {
    const mine = new Map([...d.records].filter(([, c]) => c.deletedAt === null));
    expect([...mine.keys()].sort(), `${d.name}, semente ${seed}`).toEqual([...active.keys()].sort());
    for (const [k, c] of active) expect(sameChange(mine.get(k), c), `${d.name} em ${k}, semente ${seed}`).toBe(true);
    // As marcas de exclusão que o aparelho ainda tem são as do servidor.
    for (const [k, c] of d.records) {
      const { rev: _rev, ...stored } = server.records.get(k)!;
      expect(sameChange(c, stored), `${d.name} em ${k}, semente ${seed}`).toBe(true);
    }
  }
  for (const [id, sessionId] of created) {
    if (touchedByDelete.has(id) || touchedByDelete.has(sessionId)) continue;
    expect(server.records.get(syncKey('solves', id))?.deletedAt, `solve ${id} sumiu, semente ${seed}`).toBeNull();
  }
  for (const c of active.values()) {
    if (c.store !== 'solves') continue;
    expect(active.has(syncKey('sessions', (c.data as { sessionId: string }).sessionId)), `solve ativo ${c.id} sem sessão ativa`).toBe(true);
  }
}

describe('simulação do sync (spec 11): três aparelhos, um servidor, mil rodadas', () => {
  it.each([
    [1, 500],
    [2, 7],
    [3, 3],
    [4, 1],
    [5, 50],
    [6, 7],
    [7, 3],
    [8, 500],
  ])('semente %i, lote de %i: todos terminam iguais ao servidor e nada que não foi apagado some', (seed, batch) => {
    simulate(seed, 1000, batch);
  });
});
```

- [ ] **Step 2: Rode a simulação e confira que falha**

Run: `pnpm exec vitest run tests/unit/sync-sim.test.ts`
Expected: FAIL: o arquivo não abre (`Failed to resolve import "../../src/core/sync/apply"`).

- [ ] **Step 3: Juntar um lote**

Crie `app/src/core/sync/apply.ts`:

```ts
// Juntar um lote (spec 6.1 e 6.3), o mesmo código no servidor, no aparelho e na simulação. Quem chama dá uma vista dos registros
// (RecordView) e grava o que voltar em `writes`. Puro: a vista do aparelho é um mapa lido do IndexedDB antes; a do servidor, o SQLite do
// Durable Object.
import { canonicalJson, cascade, merge, mergeSeason } from './merge';
import { checkChange } from './shape';
import { syncKey, type Change, type Rejected, type SyncStore } from './types';

export interface RecordView {
  get(store: SyncStore, id: string): Change | undefined;
  solvesOf(sessionId: string): Change[]; // todos os solves gravados da sessão, ativos e excluídos
}

export interface ApplyOptions {
  mode: 'server' | 'client';
  pending?: (store: SyncStore, id: string) => boolean; // no aparelho: o registro espera na fila de saída
}

export interface ApplyResult {
  writes: Change[]; // o resultado de cada registro que muda (um por chave)
  derived: string[]; // chaves que mudaram pela cascata, não pelo lote: no aparelho, vão para a fila de saída
  rejected: Rejected[];
  deletedSolves: number; // solves ativos na vista que terminam excluídos (a proteção da spec 6.6)
}

export function sameChange(a: Change | undefined, b: Change | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.updatedAt === b.updatedAt && a.deletedAt === b.deletedAt && a.deletionStamp === b.deletionStamp && canonicalJson(a.data) === canonicalJson(b.data)
  );
}

const sessionOf = (c: Change | undefined): string | null => {
  const d = c?.data as { sessionId?: unknown } | undefined;
  return typeof d?.sessionId === 'string' ? d.sessionId : null;
};

// No servidor, a temporada é decidida por mergeSeason; no aparelho, o valor do servidor é adotado, a não ser que o daqui ainda espere na
// fila (ele sobe, o servidor decide e o resultado volta). O resto segue merge. No servidor, um registro cujo resultado difere do que
// chegou também volta em `writes` (ganha revisão): o aparelho que mandou uma versão velha recebe a vencedora.
export function applyChanges(view: RecordView, incoming: readonly unknown[], opts: ApplyOptions): ApplyResult {
  const overlay = new Map<string, Change>();
  const rejected: Rejected[] = [];
  const sessions = new Set<string>();
  const current = (store: SyncStore, id: string): Change | undefined => overlay.get(syncKey(store, id)) ?? view.get(store, id);

  for (const raw of incoming) {
    const checked = checkChange(raw);
    if (!checked.ok) {
      const r = raw as { store?: unknown; id?: unknown } | null;
      rejected.push({ store: String(r?.store), id: String(r?.id), reason: checked.reason });
      continue;
    }
    const change = checked.change;
    const before = current(change.store, change.id);
    let next: Change;
    if (change.store === 'prefs' && change.id === 'season') {
      if (opts.mode === 'server') next = before ? mergeSeason(before, change) : change;
      else next = before && opts.pending?.('prefs', 'season') ? before : change;
    } else {
      next = before ? merge(before, change) : change;
    }
    const stale = opts.mode === 'server' && !sameChange(change, next);
    if (!sameChange(before, next) || stale) overlay.set(syncKey(next.store, next.id), next);
    if (change.store === 'sessions') sessions.add(change.id);
    const sid = change.store === 'solves' ? sessionOf(next) : null;
    if (sid) sessions.add(sid);
  }

  const derived = new Set<string>();
  for (const sid of sessions) {
    const session = current('sessions', sid);
    if (!session) continue;
    const solves = new Map<string, Change>();
    for (const s of view.solvesOf(sid)) solves.set(s.id, overlay.get(syncKey('solves', s.id)) ?? s);
    for (const c of overlay.values()) if (c.store === 'solves' && sessionOf(c) === sid) solves.set(c.id, c);
    const out = cascade(session, [...solves.values()]);
    for (const s of out.solves) {
      overlay.set(syncKey('solves', s.id), s);
      derived.add(syncKey('solves', s.id));
    }
    if (!sameChange(session, out.session)) {
      overlay.set(syncKey('sessions', sid), out.session);
      derived.add(syncKey('sessions', sid));
    }
  }

  let deletedSolves = 0;
  for (const c of overlay.values()) if (c.store === 'solves' && c.deletedAt !== null && view.get('solves', c.id)?.deletedAt === null) deletedSolves++;
  return { writes: [...overlay.values()], derived: [...derived], rejected, deletedSolves };
}
```

- [ ] **Step 4: Rode a simulação, os tipos e confira que ela pega os dois erros que as decisões 5 e 6 evitam**

Run: `pnpm exec vitest run tests/unit/sync-sim.test.ts`
Expected: PASS (8 testes, menos de 1 s).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Para conferir que a simulação morde (não commite isto): em `apply.ts`, troque `const stale = opts.mode === 'server' && !sameChange(change, next);` por `const stale = false;` e rode de novo: 4 das 8 sementes falham. Volte a linha. Depois, em `sync-sim.test.ts`, comente `for (const k of result.derived) this.outbox.set(k, this.clock);`: pelo menos uma semente falha. Volte a linha.

- [ ] **Step 5: Commit**

```bash
git add src/core/sync/apply.ts tests/unit/sync-fakes.ts tests/unit/sync-sim.test.ts
git commit -m "feat(sync): juntar um lote e a simulação de três aparelhos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Banco versão 3: a migração, as datas de exclusão e o perfil dividido

Spec: seções 5.1, 5.2, 5.4, 5.6 e 11 (migração v3); decisões 3, 4, 9 a 11, 24 e 25 do começo deste plano.

**Files:**
- Modify: `app/src/core/types.ts` (`KlickExport` e `ProfilePatch` mudam para cá)
- Modify: `app/src/data/db.ts` (versão 3, a migração e os tipos gravados; o arquivo inteiro)
- Modify: `app/src/data/repository.ts` (`syncWrite`, datas do relógio, perfil dividido, treino com marca de exclusão)
- Modify: `app/src/strings.ts`, `app/src/ui/dialogs/BackupsDialog.svelte` (o motivo `'pre-sync'` e o rótulo "antes da v3")
- Modify: `app/tests/unit/db.test.ts`, `app/tests/unit/repository-practice.test.ts`
- Modify (testes que conferiam detalhes de antes): `app/tests/unit/repository.test.ts`, `app/tests/unit/app-state.test.ts`, `app/tests/unit/season-state.test.ts`, `app/tests/unit/sessions-dialog.test.ts`
- Test: `app/tests/unit/migration-v3.test.ts`, `app/tests/unit/repository-prefs.test.ts`

**Interfaces:**
- Consumes: `prefsFromProfile`, `profileFromPrefs`, `joinProfile`, `splitProfile`, `defaultPrefValue` (Task 2); `canonicalJson` (Task 1); `DeviceProfile`, `PrefItem`, `OutboxEntry`, `SyncState`, `SyncStore`, `syncKey` (Task 1).
- Produces (em `data/db.ts`): `DB_VERSION = 3`; `StoredSolve = Solve & { deletionStamp }`, `StoredSession = Session & { deletionStamp }`, `StoredPractice = Practice & { updatedAt; deletedAt; deletionStamp }`; `BackupRecord.reason` ganha `'pre-sync'` e `BackupRecord.label?: 'v3'`; stores `prefs` (keyPath `key`) e `outbox` (chave `${store}/${id}`, índice `byQueued`); a chave `'sync'` da store `meta` guarda o `SyncState`; `openKlickDb(name?, events?, version?, now?: () => number)`.
- Produces (em `data/repository.ts`): `export type { KlickExport, ProfilePatch }` (de `core/types.ts`); `defaultSyncState(): SyncState`. Por dentro: `syncWrite(stores, work(tx, ctx))` com `ctx.stamp()` (a data desta escrita, uma por transação: `max(agora, clock + 1)`) e `ctx.track(store, id)` (a fila de saída, só com `accountId`); toda gravação de solve, sessão, tentativa e item da conta passa por ele. `deletePractice` vira marca de exclusão; `listPractice` e o export só mostram as que existem; tudo o que o repositório devolve sai sem as datas do sync.

O app abre a versão 3 sozinho: `boot.ts` já chama `openKlickDb` com `DB_VERSION`. Uma aba antiga, na versão 2, recebe `blocking` e mostra o aviso de recarregar, como na migração anterior. A versão 3 não tem volta (spec 5.6): o teste "não tem volta" registra isso.

- [ ] **Step 1: Escreva os testes que falham**

A migração é conferida com um aparelho de verdade gravado na versão 2: sessões e solves com a lixeira (um solve apagado sozinho e outro que saiu com a sessão), treino, trilha, duas temporadas fechadas, o acabamento Gelo, escolha de algoritmo, aula pela metade, caso fora do sorteio e ajustes dos dois tipos (Review Focus 3).

Crie `app/tests/unit/migration-v3.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seasonOne } from '../../src/core/season';
import { defaultSettings, type KlickExport, type Meta, type Practice, type Profile, type Session, type Solve } from '../../src/core/types';
import { DB_VERSION, openKlickDb, type StoredSolve } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
const T0 = 1_791_500_000_000;
const MIGRATED_AT = T0 + 9_000_000;
const DAY = 86_400_000;

// Um aparelho de verdade na versão 2 (spec 11, "Migração v3"): sessões e solves com lixeira (inclusive a cascata de uma sessão
// apagada), treino, trilha, temporadas fechadas, acabamento, escolhas de algoritmo, aulas pela metade e ajustes dos dois tipos.
function fixture() {
  const at = (i: number) => T0 - 5 * DAY + i * 60_000;
  const sessions: Session[] = [
    { id: 'main', name: 'Principal', event: '333', order: 0, createdAt: at(0), updatedAt: at(0), deletedAt: null },
    { id: 'gone', name: 'Velha', event: '222', order: 1, createdAt: at(1), updatedAt: at(50), deletedAt: at(50) },
  ];
  const solve = (id: string, sessionId: string, i: number, deletedAt: number | null = null): Solve => ({
    id, sessionId, event: sessionId === 'gone' ? '222' : '333', ms: 30_000 + i, penalty: i === 3 ? '+2' : null, at: at(i),
    scramble: `R U ${i}`, note: i === 2 ? 'boa' : '', createdAt: at(i), updatedAt: deletedAt ?? at(i), deletedAt,
  });
  const solves: Solve[] = [
    solve('a', 'main', 2),
    solve('b', 'main', 3),
    solve('c', 'main', 4, at(40)), // na lixeira sozinho
    solve('d', 'gone', 5, at(50)), // saiu junto com a sessão
  ];
  const practice: Practice[] = [{ id: 'p1', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: at(10) }];
  const profile: Profile = {
    settings: { ...defaultSettings(), inspection: false, dailyGoal: 30, theme: 'dark', holdMs: 550, sound: { klick: false, insp: true, pb: true } },
    trail: [true, true, true, false, false, false, false, false, false],
    finish: 'gelo',
    onboarded: true,
    currentSessionId: 'main',
    season: {
      current: { ...seasonOne(), n: 3, startedAt: at(30) },
      past: [
        { n: 1, startedAt: 0, endedAt: at(20), solves: 1000, startAo12: null, endAo12: 40_000 },
        { n: 2, startedAt: at(20), endedAt: at(30), solves: 50, startAo12: 40_000, endAo12: 35_000 },
      ],
    },
    lessonAt: { 3: 4 },
    algChoice: { 'oll2-h': 1 },
    trainOff: ['pll2-t'],
  };
  const meta = { schemaVersion: 1, deviceId: 'dev', solvesSinceBackup: 3, trailPromptDismissed: true } as Partial<Meta>;
  return { sessions, solves, practice, profile, meta };
}

// Grava a fixture direto na versão 2, como o app daquela versão gravava.
async function v2Device(): Promise<{ name: string; data: ReturnType<typeof fixture> }> {
  const name = `migracao-${++n}`;
  const data = fixture();
  const db = await openKlickDb(name, {}, 2);
  for (const s of data.sessions) await db.put('sessions', s as never);
  for (const s of data.solves) await db.put('solves', s as never);
  for (const p of data.practice) await db.put('practice', p as never);
  await db.put('profile', data.profile as never, 'current');
  await db.put('meta', data.meta as Meta, 'current');
  db.close();
  return { name, data };
}

describe('migração para a versão 3 (spec 5.6)', () => {
  it('nenhum dado sai: solves, sessões, lixeira, treino e o perfil inteiro leem igual', async () => {
    const { name, data } = await v2Device();
    const db = await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT);
    const repo = createRepository(db, { now: () => T0, channel: null });
    expect(await repo.listSessions({ includeDeleted: true })).toEqual(data.sessions);
    expect(await repo.listSolves({ includeDeleted: true })).toEqual(data.solves);
    expect(await repo.listTrash()).toEqual({ sessions: [data.sessions[1]], solves: [data.solves[3], data.solves[2]] });
    expect(await repo.listPractice()).toEqual(data.practice);
    expect(await repo.getProfile()).toEqual(data.profile);
    expect(await repo.getMeta()).toMatchObject(data.meta);
  });

  it('as datas novas: deletionStamp = deletedAt ou createdAt; no treino, updatedAt = at; o perfil dividido em aparelho e conta', async () => {
    const { name, data } = await v2Device();
    const db = await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT);
    const stored = (await db.getAll('solves')) as StoredSolve[];
    expect(stored.map((s) => [s.id, s.deletionStamp])).toEqual(data.solves.map((s) => [s.id, s.deletedAt ?? s.createdAt]));
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
    expect((await db.getAll('sessions')).sort(byId).map((s) => s.deletionStamp)).toEqual([...data.sessions].sort(byId).map((s) => s.deletedAt ?? s.createdAt));
    expect(await db.getAll('practice')).toEqual([{ ...data.practice[0], updatedAt: data.practice[0].at, deletedAt: null, deletionStamp: data.practice[0].at }]);
    const device = await db.get('profile', 'current');
    expect(Object.keys(device!.settings)).not.toContain('inspection');
    expect(device).toMatchObject({ currentSessionId: 'main', settings: { theme: 'dark', holdMs: 550 } });
    // Só as chaves da conta fora do padrão viram itens, com a hora da migração.
    const prefs = await db.getAll('prefs');
    expect(prefs.map((p) => p.key).sort()).toEqual(
      ['algChoice.oll2-h', 'finish', 'lessonAt.3', 'onboarded', 'season', 'settings.dailyGoal', 'settings.inspection', 'trail.0', 'trail.1', 'trail.2', 'trainOff.pll2-t'].sort(),
    );
    expect(new Set(prefs.map((p) => p.updatedAt))).toEqual(new Set([MIGRATED_AT]));
    expect(await db.getAll('outbox')).toEqual([]);
    expect(await db.get('meta', 'sync')).toBeUndefined();
  });

  it('antes de migrar, grava a cópia "antes da v3" com tudo, e não grava outra na próxima abertura', async () => {
    const { name, data } = await v2Device();
    (await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT)).close();
    const db = await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT + 1);
    const backups = await db.getAll('backups');
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ reason: 'pre-sync', label: 'v3', createdAt: MIGRATED_AT, solveCount: 2, encoding: 'json' });
    const copy = JSON.parse(backups[0].payload) as KlickExport;
    expect(copy).toMatchObject({ format: 'klick', version: 1, sessions: data.sessions, solves: data.solves, practice: data.practice, profile: data.profile });
  });

  it('um banco novo nasce na versão 3 sem cópia nenhuma', async () => {
    const db = await openKlickDb(`migracao-${++n}`);
    expect(await db.getAll('backups')).toEqual([]);
    expect([...db.objectStoreNames].sort()).toEqual(['backups', 'meta', 'outbox', 'practice', 'prefs', 'profile', 'sessions', 'solves']);
  });

  it('não tem volta: a versão 2 do app não abre o banco migrado', async () => {
    const { name } = await v2Device();
    (await openKlickDb(name)).close();
    await expect(openKlickDb(name, {}, 2)).rejects.toMatchObject({ name: 'VersionError' });
  });

  it('a tela mostra o mesmo de antes: sessões, solves, perfil e treino no AppState', async () => {
    const { name, data } = await v2Device();
    const repo = createRepository(await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT), { now: () => T0, channel: null });
    const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), now: () => T0, storage: null, storageManager: null });
    await app.init();
    expect(app.sessions).toEqual([data.sessions[0]]);
    expect(app.solves).toEqual(data.solves.slice(0, 2));
    expect(app.profile).toEqual(data.profile);
    expect(app.practice).toEqual(data.practice);
    expect(app.profile.season.past).toHaveLength(2);
  });
});
```

Crie `app/tests/unit/repository-prefs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seasonOne } from '../../src/core/season';
import type { SyncState } from '../../src/core/sync/types';
import type { SeasonRecord } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, defaultSyncState } from '../../src/data/repository';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;

async function fresh() {
  const db = await openKlickDb(`prefs-${++n}`);
  return { db, repo: createRepository(db, { now, channel: null }) };
}

describe('perfil dividido (spec 5.2): o aparelho na store profile, a conta em prefs', () => {
  it('um ajuste do aparelho não vira item da conta; um da conta vira, com a data do relógio', async () => {
    const { db, repo } = await fresh();
    await repo.saveProfile({ settings: { theme: 'dark', holdMs: 550 } });
    expect(await db.getAll('prefs')).toEqual([]);
    expect((await db.get('profile', 'current'))?.settings).toMatchObject({ theme: 'dark', holdMs: 550 });
    t += 1000;
    await repo.saveProfile({ settings: { inspection: false }, trail: [true, false, false, false, false, false, false, false, false] });
    expect(await db.getAll('prefs')).toEqual([
      { key: 'settings.inspection', value: false, updatedAt: t },
      { key: 'trail.0', value: true, updatedAt: t },
    ]);
    expect(await repo.getProfile()).toMatchObject({ settings: { theme: 'dark', inspection: false }, trail: [true, false, false, false, false, false, false, false, false] });
  });

  it('o que some vira o valor padrão gravado: a aula concluída (null), a escolha que volta ao padrão (0), o caso que volta ao sorteio (false)', async () => {
    const { db, repo } = await fresh();
    await repo.saveProfile({ lessonAt: { 2: 5 }, algChoice: { 'oll2-h': 1 }, trainOff: ['pll2-t'] });
    t += 1000;
    await repo.saveProfile({ lessonAt: {}, algChoice: {}, trainOff: [] });
    const items = Object.fromEntries((await db.getAll('prefs')).map((p) => [p.key, p.value]));
    expect(items).toMatchObject({ 'lessonAt.2': null, 'algChoice.oll2-h': 0, 'trainOff.pll2-t': false });
    expect(await repo.getProfile()).toMatchObject({ lessonAt: {}, algChoice: {}, trainOff: [] });
  });

  it('virar a temporada grava o item "season"', async () => {
    const { db, repo } = await fresh();
    const record: SeasonRecord = { n: 1, startedAt: 0, endedAt: t, solves: 1000, startAo12: null, endAo12: 40_000 };
    await repo.advanceSeason(1, record, { ...seasonOne(), n: 2, startedAt: t });
    const item = await db.get('prefs', 'season');
    expect(item?.value).toMatchObject({ past: [record], current: { n: 2 } });
    expect((await repo.getProfile()).season.past).toEqual([record]);
  });

  it('o relógio do app nunca volta (spec 5.4): duas gravações no mesmo milissegundo, e um aparelho atrasado depois de ver datas mais novas', async () => {
    const { db, repo } = await fresh();
    await repo.saveProfile({ onboarded: true });
    await repo.saveProfile({ onboarded: false }); // no mesmo milissegundo: a segunda data é maior
    expect(await db.get('prefs', 'onboarded')).toEqual({ key: 'onboarded', value: false, updatedAt: t + 1 });
    // O servidor mandou datas de uma hora à frente: o relógio do app subiu. O relógio do sistema continua atrasado.
    const ahead = t + 3_600_000;
    await db.put('meta', { ...defaultSyncState(), clock: ahead } satisfies SyncState, 'sync');
    await repo.saveProfile({ trail: [false, true, false, false, false, false, false, false, false] });
    expect((await db.get('prefs', 'trail.1'))?.updatedAt).toBe(ahead + 1);
    expect(((await db.get('meta', 'sync')) as SyncState).clock).toBe(ahead + 1);
  });

  it('o export leva o perfil montado das duas partes; sem nada gravado, nenhum', async () => {
    const { repo } = await fresh();
    expect((await repo.exportAll()).profile).toBeNull();
    await repo.saveProfile({ settings: { theme: 'light' }, finish: 'fosco' });
    expect((await repo.exportAll()).profile).toEqual(await repo.getProfile());
  });
});
```

Acrescente ao fim de `app/tests/unit/db.test.ts` os testes da versão 3, e troque o teste de migração de `repository-practice.test.ts`, que usava o repositório de hoje num banco da versão 1 (o repositório agora só abre a versão atual):

Em `app/tests/unit/db.test.ts`:

Troque:

```ts
    db.close();
  });
});
```

por:

```ts
    db.close();
  });
});

describe('versão 3 do banco (spec 5.1)', () => {
  it('as stores da conta e da fila de saída, com o índice da fila pela data', async () => {
    const db = await openKlickDb(fresh());
    expect(db.transaction('prefs').objectStore('prefs').keyPath).toBe('key');
    const outbox = db.transaction('outbox').objectStore('outbox');
    expect(outbox.keyPath).toBeNull(); // a chave é `${store}/${id}`, fora do registro
    expect([...outbox.indexNames]).toEqual(['byQueued']);
    db.close();
  });

  it('abrir a versão 2 (como fazem os testes de migração) não cria as stores da 3', async () => {
    const db = await openKlickDb(fresh(), {}, 2);
    expect(db.objectStoreNames.contains('prefs')).toBe(false);
    expect(db.objectStoreNames.contains('outbox')).toBe(false);
    expect(db.objectStoreNames.contains('practice')).toBe(true);
    db.close();
  });
});
```

Em `app/tests/unit/repository-practice.test.ts`:

1. Troque:

```ts
import { describe, expect, it } from 'vitest';
import type { Practice, Profile } from '../../src/core/types';
import { DB_VERSION, openKlickDb } from '../../src/data/db';
import { createRepository, type ChangeKind, type KlickExport, type Repository } from '../../src/data/repository';
import { createBackup, restoreBackup } from '../../src/data/safety';
import { parseKlickJson, toKlickJson } from '../../src/data/transfer';
```

por:

```ts
import { describe, expect, it } from 'vitest';
import type { DeviceProfile } from '../../src/core/sync/types';
import type { Meta, Practice } from '../../src/core/types';
import { DB_VERSION, openKlickDb, type StoredSession, type StoredSolve } from '../../src/data/db';
import { createRepository, type ChangeKind, type KlickExport, type Repository } from '../../src/data/repository';
import { createBackup, restoreBackup } from '../../src/data/safety';
import { parseKlickJson, toKlickJson } from '../../src/data/transfer';
```

2. Troque:

```ts
});

describe('banco versão 2: a migração cria o treino e não mexe no resto (spec 9.1)', () => {
  it('um banco da versão 1 com solves, sessão, perfil e meta abre na 2 com tudo igual e o treino vazio', async () => {
    const db = name();
    const v1 = createRepository(await openKlickDb(db, {}, 1), { now, channel: null });
    const session = await v1.createSession({ event: '333' });
    const solve = await v1.addSolve({ sessionId: session.id, event: '333', ms: 61_000, penalty: null, at: t, scramble: "R U R'" });
    await v1.saveProfile({ trail: [true, true, false, false, false, false, false, false, false], finish: 'fosco', currentSessionId: session.id });
    const meta = await v1.saveMeta({ solvesSinceBackup: 7 });
    v1.close();

    const handle = await openKlickDb(db);
    expect(handle.version).toBe(DB_VERSION);
    expect([...handle.objectStoreNames].sort()).toEqual(['backups', 'meta', 'practice', 'profile', 'sessions', 'solves']);
    const v2 = createRepository(handle, { now, channel: null });
    expect(await v2.listSolves()).toEqual([solve]);
    expect(await v2.listSessions()).toEqual([session]);
    const profile = await v2.getProfile();
    expect(profile.trail.slice(0, 3)).toEqual([true, true, false]);
    expect(profile.currentSessionId).toBe(session.id);
    expect((await v2.getMeta()).solvesSinceBackup).toBe(meta.solvesSinceBackup);
    expect(await v2.listPractice()).toEqual([]);
    v2.close();
  });

  it('perfil e meta gravados antes do treino leem os padrões novos: {}, {}, [] e o aviso não dispensado', async () => {
    const db = await openKlickDb(name());
    const old = { settings: (await createRepository(db, { channel: null }).getProfile()).settings, trail: Array<boolean>(9).fill(false), finish: 'fosco', onboarded: true, currentSessionId: null };
    await db.put('profile', old as unknown as Profile, 'current');
    const repo = createRepository(db, { now, channel: null });
    const p = await repo.getProfile();
    expect([p.lessonAt, p.algChoice, p.trainOff]).toEqual([{}, {}, []]);
    expect((await repo.getMeta()).trailPromptDismissed).toBe(false);
  });
});
```

por:

```ts
});

describe('banco versão 2: a migração cria o treino e não mexe no resto (spec 9.1)', () => {
  // Gravado direto no banco da versão 1, como a versão daquela época gravava: o repositório de hoje só abre a versão atual.
  it('um banco da versão 1 com solves, sessão, perfil e meta abre na versão atual com tudo igual e o treino vazio', async () => {
    const db = name();
    const v1 = await openKlickDb(db, {}, 1);
    const session = { id: 's1', name: 'Sessão 1', event: '333', order: 0, createdAt: t, updatedAt: t, deletedAt: null } as const;
    const solve = { id: 'x1', sessionId: 's1', event: '333', ms: 61_000, penalty: null, at: t, scramble: "R U R'", note: '', createdAt: t, updatedAt: t, deletedAt: null } as const;
    await v1.put('sessions', session as unknown as StoredSession);
    await v1.put('solves', solve as unknown as StoredSolve);
    const settings = (await createRepository(await openKlickDb(name()), { channel: null }).getProfile()).settings;
    const old = { settings, trail: [true, true, false, false, false, false, false, false, false], finish: 'fosco', onboarded: true, currentSessionId: 's1' };
    await v1.put('profile', old as unknown as DeviceProfile, 'current');
    await v1.put('meta', { schemaVersion: 1, deviceId: 'd1', solvesSinceBackup: 7 } as Meta, 'current');
    v1.close();

    const handle = await openKlickDb(db);
    expect(handle.version).toBe(DB_VERSION);
    expect([...handle.objectStoreNames].sort()).toEqual(['backups', 'meta', 'outbox', 'practice', 'prefs', 'profile', 'sessions', 'solves']);
    const repo = createRepository(handle, { now, channel: null });
    expect(await repo.listSolves()).toEqual([solve]);
    expect(await repo.listSessions()).toEqual([session]);
    const profile = await repo.getProfile();
    expect(profile.trail.slice(0, 3)).toEqual([true, true, false]);
    expect(profile.currentSessionId).toBe('s1');
    expect([profile.lessonAt, profile.algChoice, profile.trainOff]).toEqual([{}, {}, []]);
    expect((await repo.getMeta()).solvesSinceBackup).toBe(7);
    expect((await repo.getMeta()).trailPromptDismissed).toBe(false);
    expect(await repo.listPractice()).toEqual([]);
    repo.close();
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/migration-v3.test.ts tests/unit/repository-prefs.test.ts tests/unit/db.test.ts tests/unit/repository-practice.test.ts`
Expected: FAIL (10 testes). Os motivos são `NotFoundError: No objectStore named prefs in this database`, `expected [ 'backups', 'meta', 'practice', …(3) ] to deeply equal [ 'backups', 'meta', 'outbox', …(5) ]`, o `deletionStamp` que não existe e a abertura da versão 2 que não rejeita.

- [ ] **Step 3: O arquivo do Klick muda de casa**

O Worker vai escrever o arquivo do Klick (as cópias diárias, Task 17) sem importar o repositório.

Em `app/src/core/types.ts`:

Troque:

```ts
  trailPromptDismissed: boolean; // o aviso "Já resolve? Marque o que já sabe" foi dispensado neste aparelho
}

// Congelado por inteiro, inclusive o grupo de sons: quem precisar alterar trabalha numa cópia (defaultSettings).
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  inspection: true,
```

por:

```ts
  trailPromptDismissed: boolean; // o aviso "Já resolve? Marque o que já sabe" foi dispensado neste aparelho
}

// Alteração do perfil. Os ajustes (e o grupo de sons) podem vir parciais: o repositório junta com o que está gravado dentro
// da própria transação, e duas abas que mudam ajustes diferentes não desfazem uma à outra.
export type ProfilePatch = Omit<Partial<Profile>, 'settings'> & {
  settings?: Partial<Omit<Settings, 'sound'>> & { sound?: Partial<Settings['sound']> };
};

// O arquivo do Klick (exportar, importar, cópias). Mora aqui, e não no repositório, porque o Worker também o escreve (as cópias diárias).
export interface KlickExport {
  format: 'klick';
  version: 1;
  exportedAt: number;
  sessions: Session[];
  solves: Solve[];
  profile: ProfilePatch | null; // o export sai completo; o que vem de um arquivo pode faltar campo (quem grava junta com o perfil daqui)
  practice?: Practice[]; // o treino (spec do sub-projeto 4, seção 9.3); um arquivo de antes do treino não tem
}

// Congelado por inteiro, inclusive o grupo de sons: quem precisar alterar trabalha numa cópia (defaultSettings).
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  inspection: true,
```

- [ ] **Step 4: O banco: versão 3 e a migração**

A migração roda dentro da transação de upgrade: grava a cópia `'pre-sync'` rotulada "antes da v3" (em JSON puro, decisão 25), põe o `deletionStamp` em solves e sessões, as datas no treino, e divide o perfil em `profile` (o aparelho) e `prefs` (a conta, só o que difere do padrão, decisão 4). Um erro em qualquer passo aborta o upgrade inteiro: o banco fica na versão 2, intacto. Um banco novo (versão 0) só ganha as stores.

Substitua `app/src/data/db.ts` inteiro por:

```ts
// Esquema do IndexedDB do Klick. Quem abre o banco é o repositório (repository.ts); nada fora de data/ fala com o IndexedDB.
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { seasonFrom } from '../core/season';
import { joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import type { DeviceProfile, OutboxEntry, PrefItem, SyncState } from '../core/sync/types';
import type { EventId, KlickExport, Meta, Practice, Profile, Session, Solve } from '../core/types';
import { newId } from './ids';

export const DB_NAME = 'klick';
export const DB_VERSION = 3;

// O que fica gravado a partir da versão 3 (spec 5.1): o registro da tela mais as datas do sync. O repositório tira essas datas antes de
// devolver um registro, e a tela continua vendo Solve, Session e Practice.
export type StoredSolve = Solve & { deletionStamp: number };
export type StoredSession = Session & { deletionStamp: number };
export type StoredPractice = Practice & { updatedAt: number; deletedAt: number | null; deletionStamp: number };

// Cópia de segurança guardada no próprio banco. `payload` é o KlickExport em JSON, ou comprimido com gzip em base64.
export interface BackupRecord {
  id: string;
  createdAt: number;
  reason: 'auto50' | 'daily' | 'manual' | 'pre-restore' | 'pre-sync';
  label?: 'v3'; // a 'pre-sync' que a migração para a versão 3 grava: o diálogo das cópias mostra "Antes da v3"
  solveCount: number;
  encoding: 'gzip-base64' | 'json';
  payload: string;
}

export interface KlickDB extends DBSchema {
  solves: {
    key: string;
    value: StoredSolve;
    indexes: { bySession: [string, number]; byEvent: [EventId, number] }; // [sessionId | event, at]
  };
  sessions: { key: string; value: StoredSession };
  profile: { key: 'current'; value: DeviceProfile }; // só os ajustes do aparelho (spec 5.2); os da conta ficam em prefs
  // 'current' guarda o Meta; 'folderHandle', o handle da pasta de cópias (o IndexedDB guarda handles por clone estruturado); 'sync', o
  // estado do sync e o relógio do app (spec 5.4).
  meta: { key: 'current' | 'folderHandle' | 'sync'; value: Meta | FileSystemDirectoryHandle | SyncState };
  backups: { key: string; value: BackupRecord; indexes: { byCreated: number } };
  // O treino de algoritmos (versão 2): uma tentativa por registro, fora dos solves.
  practice: { key: string; value: StoredPractice; indexes: { byCase: [string, number]; byAt: number } }; // [caseId, at]
  // Versão 3: os ajustes da conta, um item por chave, e a fila de saída do sync, na chave `${store}/${id}`.
  prefs: { key: string; value: PrefItem };
  outbox: { key: string; value: OutboxEntry; indexes: { byQueued: number } };
}

// O que acontece com a conexão por causa de outras abas ou do navegador. Quem abre o banco decide o que mostrar.
export interface DbEvents {
  blocking?: () => void; // outra aba pede uma versão mais nova: esta conexão já foi fechada para não prender a outra
  blocked?: () => void; // esta abertura espera uma aba antiga largar o banco (uma versão velha do app, sem `blocking`)
  terminated?: () => void; // o navegador derrubou a conexão (falta de espaço, aba suspensa): quem abriu reabre
}

type UpgradeTx = IDBPTransaction<KlickDB, StoreNames<KlickDB>[], 'versionchange'>;

// O perfil gravado antes da versão 3 (um Profile inteiro) com os padrões por baixo, para o que faltar.
function fullProfile(old: Partial<Profile> | undefined): Profile {
  const base = joinProfile(undefined, profileFromPrefs([]));
  if (!old) return base;
  const kept = Object.fromEntries(Object.entries(old).filter(([, v]) => v !== undefined)) as Partial<Profile>;
  return {
    ...base,
    ...kept,
    season: seasonFrom(old.season) ?? base.season,
    settings: { ...base.settings, ...old.settings, sound: { ...base.settings.sound, ...old.settings?.sound } },
  };
}

// A migração para a versão 3 (spec 5.6), dentro da transação de upgrade: ou tudo acontece, ou nada. Só acrescenta; nenhum dado sai.
// A cópia "antes da v3" vai em JSON puro: a transação de upgrade não sobrevive a esperar o CompressionStream.
async function migrateToV3(tx: UpgradeTx, at: number): Promise<void> {
  const solves = tx.objectStore('solves');
  const sessions = tx.objectStore('sessions');
  const practice = tx.objectStore('practice');
  const profile = tx.objectStore('profile');
  const prefs = tx.objectStore('prefs');
  const [allSolves, allSessions, allPractice, stored] = await Promise.all([
    solves.getAll() as Promise<Solve[]>,
    sessions.getAll() as Promise<Session[]>,
    practice.getAll() as Promise<Practice[]>,
    profile.get('current') as Promise<Partial<Profile> | undefined>,
  ]);
  if (allSolves.length + allSessions.length + allPractice.length === 0 && stored === undefined) return; // banco vazio: nada a migrar
  // Na ordem do export (exportAll): sessões pela ordem, solves e treino pelo instante.
  const copy: KlickExport = {
    format: 'klick',
    version: 1,
    exportedAt: at,
    sessions: [...allSessions].sort((a, b) => a.order - b.order),
    solves: [...allSolves].sort((a, b) => a.at - b.at),
    profile: stored ? fullProfile(stored) : null,
    practice: [...allPractice].sort((a, b) => a.at - b.at),
  };
  const solveCount = allSolves.filter((s) => s.deletedAt === null).length;
  const pending: Promise<unknown>[] = [
    tx.objectStore('backups').put({ id: newId(at), createdAt: at, reason: 'pre-sync', label: 'v3', solveCount, encoding: 'json', payload: JSON.stringify(copy) }),
  ];
  for (const s of allSolves) pending.push(solves.put({ ...s, deletionStamp: s.deletedAt ?? s.createdAt }));
  for (const s of allSessions) pending.push(sessions.put({ ...s, deletionStamp: s.deletedAt ?? s.createdAt }));
  for (const p of allPractice) pending.push(practice.put({ ...p, updatedAt: p.at, deletedAt: null, deletionStamp: p.at }));
  const { device, account } = splitProfile(fullProfile(stored));
  if (stored) pending.push(profile.put(device, 'current'));
  for (const [key, value] of prefsFromProfile(account)) pending.push(prefs.put({ key, value, updatedAt: at }));
  await Promise.all(pending);
}

// `version` só muda nos testes (simulam a aba de uma versão nova, ou abrem uma versão antiga para conferir a migração); o app abre sempre
// DB_VERSION. `now` dá a hora da migração.
export async function openKlickDb(
  name: string = DB_NAME,
  events: DbEvents = {},
  version: number = DB_VERSION,
  now: () => number = () => Date.now(),
): Promise<IDBPDatabase<KlickDB>> {
  let opened: IDBPDatabase<KlickDB> | null = null;
  opened = await openDB<KlickDB>(name, version, {
    blocked() {
      events.blocked?.();
    },
    // Sem fechar aqui, a aba da versão nova fica presa até esta fechar: a migração nunca termina.
    blocking() {
      opened?.close();
      events.blocking?.();
    },
    terminated() {
      events.terminated?.();
    },
    // `newVersion` é a versão pedida: um teste que abre a versão 1 (para conferir a migração) não ganha as stores das seguintes.
    upgrade(db, oldVersion, newVersion, transaction) {
      const target = newVersion ?? version;
      if (oldVersion < 1) {
        const solves = db.createObjectStore('solves', { keyPath: 'id' });
        solves.createIndex('bySession', ['sessionId', 'at']);
        solves.createIndex('byEvent', ['event', 'at']);
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('profile'); // uma chave só: 'current'
        db.createObjectStore('meta'); // 'current', 'folderHandle' e 'sync'
        const backups = db.createObjectStore('backups', { keyPath: 'id' });
        backups.createIndex('byCreated', 'createdAt');
      }
      // Versão 2: o treino. Solves, sessões, perfil, meta e cópias passam intactos.
      if (oldVersion < 2 && target >= 2) {
        const practice = db.createObjectStore('practice', { keyPath: 'id' });
        practice.createIndex('byCase', ['caseId', 'at']);
        practice.createIndex('byAt', 'at');
      }
      // Versão 3: conta e sync (spec 5). Um erro na migração aborta o upgrade inteiro: o banco fica na versão de antes, intacto.
      if (oldVersion < 3 && target >= 3) {
        db.createObjectStore('prefs', { keyPath: 'key' });
        db.createObjectStore('outbox').createIndex('byQueued', 'queuedAt');
        if (oldVersion > 0) {
          migrateToV3(transaction, now()).catch(() => {
            try {
              transaction.abort();
            } catch {
              // a transação já terminou
            }
          });
        }
      }
    },
  });
  return opened;
}
```

- [ ] **Step 5: O repositório: o relógio, a fila e o perfil dividido**

As mudanças, na ordem do arquivo: os imports; os ajudantes do topo (`composeProfile` no lugar de `profileOrDefault`, os `bare*` que tiram as datas do sync, `importedStamp` (decisão 10), `defaultSyncState` e o `SyncCtx`); `reviveSession` e `writeProfile`; `syncWrite`, `changeSolve` e `storedProfile` dentro de `createRepository`; e cada método que grava, que passa a usar `ctx.stamp()` e `ctx.track()`. `writeProfile` grava os ajustes do aparelho em `profile` e, da conta, só as chaves que mudaram, com a data do relógio; uma chave que some grava o valor padrão (a mudança precisa viajar).

Em `app/src/data/repository.ts`:

1. Troque:

```ts
// Leitura: o que sai do IndexedDB já é cópia. Os padrões (perfil e meta) são montados novos a cada chamada, nunca compartilhados.
import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb';
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { practiceFrom } from '../core/trail/validate';
import { defaultSettings } from '../core/types';
import type { EventId, Meta, Penalty, Practice, Profile, SeasonRecord, SeasonState, Session, Settings, Solve } from '../core/types';
import { T } from '../strings';
import type { BackupRecord, KlickDB } from './db';
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'all';
```

por:

```ts
// Leitura: o que sai do IndexedDB já é cópia. Os padrões (perfil e meta) são montados novos a cada chamada, nunca compartilhados.
import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb';
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { canonicalJson } from '../core/sync/merge';
import { defaultPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import { syncKey, type DeviceProfile, type PrefItem, type SyncState, type SyncStore } from '../core/sync/types';
import { practiceFrom } from '../core/trail/validate';
import { defaultSettings } from '../core/types';
import type { EventId, KlickExport, Meta, Penalty, Practice, Profile, ProfilePatch, SeasonRecord, SeasonState, Session, Solve } from '../core/types';
import { T } from '../strings';
import type { BackupRecord, KlickDB, StoredPractice, StoredSession, StoredSolve } from './db';
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'all';
```

2. Troque:

```ts
  scramble: string;
}

export interface KlickExport {
  format: 'klick';
  version: 1;
  exportedAt: number;
  sessions: Session[];
  solves: Solve[];
  profile: ProfilePatch | null; // o export sai completo; o que vem de um arquivo pode faltar campo (quem grava junta com o perfil daqui)
  practice?: Practice[]; // o treino (spec do sub-projeto 4, seção 9.3); um arquivo de antes do treino não tem
}

export interface ImportReport {
  sessionsAdded: number;
```

por:

```ts
  scramble: string;
}

// O formato do arquivo mora em core/types.ts (o Worker também o escreve); quem importava daqui continua importando.
export type { KlickExport, ProfilePatch } from '../core/types';

export interface ImportReport {
  sessionsAdded: number;
```

3. Troque:

```ts
  solvesUpdated: number;
  skipped: number;
}

// Alteração do perfil. Os ajustes (e o grupo de sons) podem vir parciais: o repositório junta com o que está gravado dentro
// da própria transação, e duas abas que mudam ajustes diferentes não desfazem uma à outra.
export type ProfilePatch = Omit<Partial<Profile>, 'settings'> & {
  settings?: Partial<Omit<Settings, 'sound'>> & { sound?: Partial<Settings['sound']> };
};

export interface Repository {
  listSessions(o?: { includeDeleted?: boolean }): Promise<Session[]>; // ordenadas por order
```

por:

```ts
  solvesUpdated: number;
  skipped: number;
}

export interface Repository {
  listSessions(o?: { includeDeleted?: boolean }): Promise<Session[]>; // ordenadas por order
```

4. Troque:

```ts
  };
}

// O que está gravado com os padrões por baixo, para um campo que um dia seja acrescentado não aparecer como undefined.
const profileOrDefault = (stored: Profile | undefined): Profile => mergeProfile(defaultProfile(), stored);
const metaOrNew = (stored: Meta | undefined, at: number): Meta =>
  stored ? { ...META_DEFAULTS, ...stored } : { ...META_DEFAULTS, deviceId: newId(at) };
```

por:

```ts
  };
}

// O perfil da tela (spec 5.2): os ajustes do aparelho (store profile) mais os itens da conta (store prefs), com os padrões por baixo.
const composeProfile = (device: DeviceProfile | undefined, items: readonly PrefItem[]): Profile => joinProfile(device, profileFromPrefs(items));

// O que a tela recebe: os registros sem as datas do sync (só o repositório e o sync as usam).
const bareSolve = ({ deletionStamp: _d, ...solve }: StoredSolve): Solve => solve;
const bareSession = ({ deletionStamp: _d, ...session }: StoredSession): Session => session;
const barePractice = ({ updatedAt: _u, deletedAt: _x, deletionStamp: _d, ...practice }: StoredPractice): Practice => practice;

// O deletionStamp de um solve ou sessão que vem de um arquivo (importar, restaurar). Num registro novo, como na migração (spec 5.6):
// a marca de exclusão ou a criação. Num que já existe, o daqui quando o estado de exclusão não muda; quando muda, a data do arquivo
// (excluir e restaurar mexem em updatedAt), para a exclusão ou a volta que o arquivo traz também valer no sync.
function importedStamp(
  local: { deletedAt: number | null; deletionStamp: number } | undefined,
  incoming: { deletedAt: number | null; createdAt: number; updatedAt: number },
): number {
  if (!local) return incoming.deletedAt ?? incoming.createdAt;
  return local.deletedAt === incoming.deletedAt ? local.deletionStamp : incoming.updatedAt;
}

// O estado do sync antes do primeiro login (spec 5.4).
export const defaultSyncState = (): SyncState => ({
  accountId: null,
  email: null,
  signedIn: false,
  firstSync: false,
  cursor: 0,
  lastSyncAt: null,
  clock: 0,
  passkey: false,
});
const syncStateOrDefault = (stored: SyncState | undefined): SyncState => ({ ...defaultSyncState(), ...stored });

// O que uma escrita acompanhada pelo sync recebe (syncWrite): a próxima data do relógio e a fila de saída.
interface SyncCtx {
  stamp(): number; // a data desta escrita, uma só por transação: max(agora, clock + 1), nunca menor que uma data já vista (spec 5.4)
  track(store: SyncStore, id: string): Promise<void>; // põe o registro na fila de saída, se o aparelho tem conta (spec 5.3)
}
const metaOrNew = (stored: Meta | undefined, at: number): Meta =>
  stored ? { ...META_DEFAULTS, ...stored } : { ...META_DEFAULTS, deviceId: newId(at) };
```

5. Troque:

```ts

// O que reviveSession usa da store de sessões, dentro de uma transação de escrita.
type SessionStore = Pick<IDBPObjectStore<KlickDB, StoreNames<KlickDB>[], 'sessions', 'readwrite'>, 'get' | 'put'>;

// Mantém o invariante (ver o topo do arquivo) quando a transação grava um solve ativo: se a sessão dele está na lixeira, devolve o
// registro dela, e só ele. Diz se a sessão voltou. Um sessionId que não é string nem é consultado: uma chave inválida lança
// DataError no IndexedDB e desfaria a gravação do próprio solve, que não pode se perder por isso.
async function reviveSession(sessions: SessionStore, sessionId: unknown, at: number): Promise<boolean> {
  if (typeof sessionId !== 'string') return false;
  const session = await sessions.get(sessionId);
  if (!session || session.deletedAt === null) return false;
  await sessions.put({ ...session, deletedAt: null, updatedAt: at });
  return true;
}

// Quem assina os avisos entre abas: um id e uma sequência que sobe de um em um. A página cria um e o passa a cada conexão que abre
```

por:

```ts

// O que reviveSession usa da store de sessões, dentro de uma transação de escrita.
type SessionStore = Pick<IDBPObjectStore<KlickDB, StoreNames<KlickDB>[], 'sessions', 'readwrite'>, 'get' | 'put'>;
type WriteTx = IDBPTransaction<KlickDB, StoreNames<KlickDB>[], 'readwrite'>;

// Mantém o invariante (ver o topo do arquivo) quando a transação grava um solve ativo: se a sessão dele está na lixeira, devolve o
// registro dela, e só ele. Diz se a sessão voltou. Um sessionId que não é string nem é consultado: uma chave inválida lança
// DataError no IndexedDB e desfaria a gravação do próprio solve, que não pode se perder por isso.
async function reviveSession(sessions: SessionStore, sessionId: unknown, ctx: SyncCtx): Promise<boolean> {
  if (typeof sessionId !== 'string') return false;
  const session = await sessions.get(sessionId);
  if (!session || session.deletedAt === null) return false;
  const at = ctx.stamp();
  await sessions.put({ ...session, deletedAt: null, updatedAt: at, deletionStamp: at });
  await ctx.track('sessions', sessionId);
  return true;
}

// Grava o perfil inteiro `next` por cima de `base` (os dois montados por composeProfile): os ajustes do aparelho na store profile e,
// da conta, só as chaves que mudaram, com a data do relógio. Uma chave que some (uma aula concluída, uma escolha que volta ao padrão)
// grava o valor padrão: a mudança precisa viajar. `all` grava todas as chaves da conta (restaurar uma cópia, spec 5.5). O perfil do
// aparelho é gravado sempre que muda ou ainda não existe: um perfil salvo sai no export, como antes da divisão.
async function writeProfile(tx: WriteTx, base: Profile, next: Profile, ctx: SyncCtx, all = false): Promise<void> {
  const before = splitProfile(base);
  const after = splitProfile(next);
  const profile = tx.objectStore('profile');
  if (canonicalJson(before.device) !== canonicalJson(after.device) || (await profile.count('current')) === 0) await profile.put(after.device, 'current');
  const old = prefsFromProfile(before.account, { withDefaults: true });
  const now = prefsFromProfile(after.account, { withDefaults: true });
  const prefs = tx.objectStore('prefs');
  for (const key of new Set([...old.keys(), ...now.keys()])) {
    const value = now.has(key) ? now.get(key) : defaultPrefValue(key);
    if (!all && canonicalJson(value) === canonicalJson(old.has(key) ? old.get(key) : defaultPrefValue(key))) continue;
    await prefs.put({ key, value, updatedAt: ctx.stamp() });
    await ctx.track('prefs', key);
  }
}

// Quem assina os avisos entre abas: um id e uma sequência que sobe de um em um. A página cria um e o passa a cada conexão que abre
```

6. Troque:

```ts
    }
  }

  // Lê o solve, deixa `change` montar o novo (ou null se nada muda) e grava, tudo numa transação.
  async function changeSolve(id: string, change: (solve: Solve, at: number) => Solve | null): Promise<Solve> {
    const { solve, changed } = await write(['solves'], async (tx) => {
      const store = tx.objectStore('solves');
      const current = await store.get(id);
      if (!current) throw new Error(`Solve não encontrado: ${id}`);
      const next = change(current, now());
      if (next) await store.put(next);
      return { solve: next ?? current, changed: next !== null };
    });
    if (changed) announceSolves([id]);
    return solve;
  }

  return {
    async listSessions({ includeDeleted = false } = {}) {
      const all = await db.getAll('sessions');
      return all.filter((s) => includeDeleted || s.deletedAt === null).sort(bySessionOrder);
    },

    async createSession({ event, name }) {
      const session = await write(['sessions'], async (tx) => {
        const store = tx.objectStore('sessions');
        const all = await store.getAll();
        const at = now();
        // A numeração parte do maior "Sessão N" entre as sessões ativas do evento.
        const lastNumber = Math.max(0, ...all.filter((s) => s.event === event && s.deletedAt === null).map((s) => T.session.defaultNameNumber(s.name) ?? 0));
        const created: Session = {
          id: newId(at),
          name: name?.trim() || T.session.defaultName(lastNumber + 1),
          event,
```

por:

```ts
    }
  }

  // Uma escrita que o sync acompanha (spec 5.3 e 5.4): a mesma transação lê e grava o relógio (meta 'sync') e a fila de saída. `stamp()`
  // é a próxima data, max(agora, clock + 1); `track(store, id)` põe o registro na fila quando o aparelho tem conta (accountId). Sem
  // conta, a fila não é preenchida, e o relógio só garante que nenhuma data volta para trás.
  async function syncWrite<R>(stores: StoreNames<KlickDB>[], work: (tx: WriteTx, ctx: SyncCtx) => Promise<R>): Promise<R> {
    return write([...stores, 'meta', 'outbox'], async (tx) => {
      const meta = tx.objectStore('meta');
      const state = syncStateOrDefault((await meta.get('sync')) as SyncState | undefined);
      const outbox = tx.objectStore('outbox');
      let clock = state.clock;
      let at: number | null = null;
      const ctx: SyncCtx = {
        stamp: () => (at ??= clock = Math.max(now(), clock + 1)),
        track: async (store, id) => {
          if (state.accountId !== null) await outbox.put({ store, id, queuedAt: clock }, syncKey(store, id));
        },
      };
      const result = await work(tx, ctx);
      if (clock !== state.clock) await meta.put({ ...state, clock }, 'sync');
      return result;
    });
  }

  // Lê o solve, deixa `change` montar o novo (ou null se nada muda) e grava, tudo numa transação. `at` é a data do relógio.
  async function changeSolve(id: string, change: (solve: StoredSolve, at: () => number) => StoredSolve | null): Promise<Solve> {
    const { solve, changed } = await syncWrite(['solves'], async (tx, ctx) => {
      const store = tx.objectStore('solves');
      const current = await store.get(id);
      if (!current) throw new Error(`Solve não encontrado: ${id}`);
      const next = change(current, ctx.stamp);
      if (next) {
        await store.put(next);
        await ctx.track('solves', id);
      }
      return { solve: next ?? current, changed: next !== null };
    });
    if (changed) announceSolves([id]);
    return bareSolve(solve);
  }

  // O perfil gravado agora, dentro da transação (as duas stores).
  async function storedProfile(tx: WriteTx): Promise<Profile> {
    const [device, items] = await Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]);
    return composeProfile(device, items);
  }

  return {
    async listSessions({ includeDeleted = false } = {}) {
      const all = await db.getAll('sessions');
      return all.filter((s) => includeDeleted || s.deletedAt === null).map(bareSession).sort(bySessionOrder);
    },

    async createSession({ event, name }) {
      const session = await syncWrite(['sessions'], async (tx, ctx) => {
        const store = tx.objectStore('sessions');
        const all = await store.getAll();
        const at = ctx.stamp();
        // A numeração parte do maior "Sessão N" entre as sessões ativas do evento.
        const lastNumber = Math.max(0, ...all.filter((s) => s.event === event && s.deletedAt === null).map((s) => T.session.defaultNameNumber(s.name) ?? 0));
        const created: StoredSession = {
          id: newId(at),
          name: name?.trim() || T.session.defaultName(lastNumber + 1),
          event,
```

7. Troque:

```ts
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        await store.add(created);
        return created;
      });
      announce('sessions');
      return session;
    },

    async renameSession(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const changed = await write(['sessions'], async (tx) => {
        const store = tx.objectStore('sessions');
        const session = await store.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.name === trimmed) return false;
        await store.put({ ...session, name: trimmed, updatedAt: now() });
        return true;
      });
      if (changed) announce('sessions');
    },

    async deleteSession(id) {
      const touched = await write(['sessions', 'solves'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt !== null) return null;
        const at = now();
        await sessions.put({ ...session, deletedAt: at, updatedAt: at });
        // Os solves já excluídos antes ficam com a marca antiga, para restoreSession não trazê-los de volta.
        const solves = tx.objectStore('solves');
        const live = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === null);
        await each(live, (s) => solves.put({ ...s, deletedAt: at, updatedAt: at }));
        return live.map((s) => s.id);
      });
      if (touched === null) return;
```

por:

```ts
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
          deletionStamp: at,
        };
        await store.add(created);
        await ctx.track('sessions', created.id);
        return created;
      });
      announce('sessions');
      return bareSession(session);
    },

    async renameSession(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const changed = await syncWrite(['sessions'], async (tx, ctx) => {
        const store = tx.objectStore('sessions');
        const session = await store.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.name === trimmed) return false;
        await store.put({ ...session, name: trimmed, updatedAt: ctx.stamp() });
        await ctx.track('sessions', id);
        return true;
      });
      if (changed) announce('sessions');
    },

    async deleteSession(id) {
      const touched = await syncWrite(['sessions', 'solves'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt !== null) return null;
        const at = ctx.stamp();
        await sessions.put({ ...session, deletedAt: at, updatedAt: at, deletionStamp: at });
        await ctx.track('sessions', id);
        // Os solves já excluídos antes ficam com a marca antiga, para restoreSession não trazê-los de volta.
        const solves = tx.objectStore('solves');
        const live = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === null);
        await each(live, (s) => solves.put({ ...s, deletedAt: at, updatedAt: at, deletionStamp: at }));
        await each(live, (s) => ctx.track('solves', s.id));
        return live.map((s) => s.id);
      });
      if (touched === null) return;
```

8. Troque:

```ts
    },

    async restoreSession(id) {
      const touched = await write(['sessions', 'solves'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt === null) return null;
        const at = now();
        await sessions.put({ ...session, deletedAt: null, updatedAt: at });
        // Volta só o que saiu junto com a sessão: os solves com a mesma marca de exclusão.
        const solves = tx.objectStore('solves');
        const together = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === session.deletedAt);
        await each(together, (s) => solves.put({ ...s, deletedAt: null, updatedAt: at }));
        return together.map((s) => s.id);
      });
      if (touched === null) return;
```

por:

```ts
    },

    async restoreSession(id) {
      const touched = await syncWrite(['sessions', 'solves'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt === null) return null;
        const at = ctx.stamp();
        await sessions.put({ ...session, deletedAt: null, updatedAt: at, deletionStamp: at });
        await ctx.track('sessions', id);
        // Volta só o que saiu junto com a sessão: os solves com a mesma marca de exclusão.
        const solves = tx.objectStore('solves');
        const together = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === session.deletedAt);
        await each(together, (s) => solves.put({ ...s, deletedAt: null, updatedAt: at, deletionStamp: at }));
        await each(together, (s) => ctx.track('solves', s.id));
        return together.map((s) => s.id);
      });
      if (touched === null) return;
```

9. Troque:

```ts
    },

    async listSolves({ sessionId, event, includeDeleted = false } = {}) {
      let list: Solve[];
      if (sessionId !== undefined) {
        list = await db.getAllFromIndex('solves', 'bySession', keyRange(sessionId));
        if (event !== undefined) list = list.filter((s) => s.event === event);
```

por:

```ts
    },

    async listSolves({ sessionId, event, includeDeleted = false } = {}) {
      let list: StoredSolve[];
      if (sessionId !== undefined) {
        list = await db.getAllFromIndex('solves', 'bySession', keyRange(sessionId));
        if (event !== undefined) list = list.filter((s) => s.event === event);
```

10. Troque:

```ts
      } else {
        list = (await db.getAll('solves')).sort(bySolveTime);
      }
      return includeDeleted ? list : list.filter((s) => s.deletedAt === null);
    },

    async addSolve(s) {
      const stamp = now();
      const id = s.id ?? newId(stamp);
      const { solve, sessionBack } = await write(['solves', 'sessions'], async (tx) => {
        const solves = tx.objectStore('solves');
        // Um id já gravado é o mesmo solve: a repetição não escreve nada. Uma tentativa atrasada não pode desfazer uma edição
        // feita depois (penalidade, nota). O que já está gravado vale.
        const stored = await solves.get(id);
        const solve: Solve = stored ?? {
          id,
          sessionId: s.sessionId,
          event: s.event,
```

por:

```ts
      } else {
        list = (await db.getAll('solves')).sort(bySolveTime);
      }
      return (includeDeleted ? list : list.filter((s) => s.deletedAt === null)).map(bareSolve);
    },

    async addSolve(s) {
      const id = s.id ?? newId(now());
      const { solve, sessionBack } = await syncWrite(['solves', 'sessions'], async (tx, ctx) => {
        const solves = tx.objectStore('solves');
        // Um id já gravado é o mesmo solve: a repetição não escreve nada. Uma tentativa atrasada não pode desfazer uma edição
        // feita depois (penalidade, nota). O que já está gravado vale.
        const stored = await solves.get(id);
        if (stored) {
          const back = stored.deletedAt === null && (await reviveSession(tx.objectStore('sessions'), stored.sessionId, ctx));
          return { solve: stored, sessionBack: back };
        }
        const stamp = ctx.stamp();
        const solve: StoredSolve = {
          id,
          sessionId: s.sessionId,
          event: s.event,
```

11. Troque:

```ts
          createdAt: stamp,
          updatedAt: stamp,
          deletedAt: null,
        };
        if (stored === undefined) await solves.put(solve);
        // Uma aba que ainda mostra uma sessão que outra aba excluiu: o solve não se perde nem fica escondido, e a sessão volta.
        // Só solve ativo pede a sessão ativa (o invariante do topo).
        const back = solve.deletedAt === null && (await reviveSession(tx.objectStore('sessions'), solve.sessionId, stamp));
        return { solve, sessionBack: back };
      });
      announceSolves([solve.id]);
      if (sessionBack) announce('sessions');
      return solve;
    },

    updateSolve(id, patch) {
```

por:

```ts
          createdAt: stamp,
          updatedAt: stamp,
          deletedAt: null,
          deletionStamp: stamp,
        };
        await solves.put(solve);
        await ctx.track('solves', id);
        // Uma aba que ainda mostra uma sessão que outra aba excluiu: o solve não se perde nem fica escondido, e a sessão volta.
        // Só solve ativo pede a sessão ativa (o invariante do topo).
        const back = await reviveSession(tx.objectStore('sessions'), solve.sessionId, ctx);
        return { solve, sessionBack: back };
      });
      announceSolves([solve.id]);
      if (sessionBack) announce('sessions');
      return bareSolve(solve);
    },

    updateSolve(id, patch) {
```

12. Troque:

```ts
          ...solve,
          penalty: patch.penalty === undefined ? solve.penalty : patch.penalty,
          note: patch.note ?? solve.note,
          updatedAt: at,
        };
      });
    },

    async deleteSolve(id) {
      await changeSolve(id, (solve, at) => (solve.deletedAt === null ? { ...solve, deletedAt: at, updatedAt: at } : null));
    },

    async restoreSolve(id) {
      const restored = await write(['solves', 'sessions'], async (tx) => {
        const solves = tx.objectStore('solves');
        const solve = await solves.get(id);
        if (!solve) throw new Error(`Solve não encontrado: ${id}`);
        if (solve.deletedAt === null) return null;
        const at = now();
        await solves.put({ ...solve, deletedAt: null, updatedAt: at });
        // Invariante: o solve volta ativo, então a sessão dele, se estiver na lixeira, volta junto: só o registro dela. Os outros
        // solves excluídos da sessão continuam na lixeira e voltam um a um.
        return { session: await reviveSession(tx.objectStore('sessions'), solve.sessionId, at) };
      });
      if (restored === null) return;
      announceSolves([id]);
```

por:

```ts
          ...solve,
          penalty: patch.penalty === undefined ? solve.penalty : patch.penalty,
          note: patch.note ?? solve.note,
          updatedAt: at(),
        };
      });
    },

    async deleteSolve(id) {
      await changeSolve(id, (solve, at) => {
        if (solve.deletedAt !== null) return null;
        const stamp = at();
        return { ...solve, deletedAt: stamp, updatedAt: stamp, deletionStamp: stamp };
      });
    },

    async restoreSolve(id) {
      const restored = await syncWrite(['solves', 'sessions'], async (tx, ctx) => {
        const solves = tx.objectStore('solves');
        const solve = await solves.get(id);
        if (!solve) throw new Error(`Solve não encontrado: ${id}`);
        if (solve.deletedAt === null) return null;
        const at = ctx.stamp();
        await solves.put({ ...solve, deletedAt: null, updatedAt: at, deletionStamp: at });
        await ctx.track('solves', id);
        // Invariante: o solve volta ativo, então a sessão dele, se estiver na lixeira, volta junto: só o registro dela. Os outros
        // solves excluídos da sessão continuam na lixeira e voltam um a um.
        return { session: await reviveSession(tx.objectStore('sessions'), solve.sessionId, ctx) };
      });
      if (restored === null) return;
      announceSolves([id]);
```

13. Troque:

```ts
    },

    async getSolves(ids) {
      return read(['solves'], (tx) => {
        const store = tx.objectStore('solves');
        return Promise.all(ids.map((id) => store.get(id)));
      });
    },

    async listTrash() {
```

por:

```ts
    },

    async getSolves(ids) {
      const found = await read(['solves'], (tx) => {
        const store = tx.objectStore('solves');
        return Promise.all(ids.map((id) => store.get(id)));
      });
      return found.map((s) => (s ? bareSolve(s) : undefined));
    },

    async listTrash() {
```

14. Troque:

```ts
        Promise.all([tx.objectStore('sessions').getAll(), tx.objectStore('solves').getAll()]),
      );
      return {
        sessions: sessions.filter((s) => s.deletedAt !== null).sort(newestDeletedFirst),
        solves: solves.filter((s) => s.deletedAt !== null).sort(newestDeletedFirst),
      };
    },
```

por:

```ts
        Promise.all([tx.objectStore('sessions').getAll(), tx.objectStore('solves').getAll()]),
      );
      return {
        sessions: sessions.filter((s) => s.deletedAt !== null).map(bareSession).sort(newestDeletedFirst),
        solves: solves.filter((s) => s.deletedAt !== null).map(bareSolve).sort(newestDeletedFirst),
      };
    },
```

15. Troque:

```ts
    },

    async getProfile() {
      return profileOrDefault(await db.get('profile', 'current'));
    },

    async saveProfile(patch) {
      const profile = await write(['profile'], async (tx) => {
        const store = tx.objectStore('profile');
        const merged = mergeProfile(profileOrDefault(await store.get('current')), patch);
        await store.put(merged, 'current');
        return merged;
      });
      announce('profile');
```

por:

```ts
    },

    async getProfile() {
      const [device, items] = await read(['profile', 'prefs'], (tx) =>
        Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]),
      );
      return composeProfile(device, items);
    },

    async saveProfile(patch) {
      const profile = await syncWrite(['profile', 'prefs'], async (tx, ctx) => {
        const base = await storedProfile(tx);
        const merged = mergeProfile(base, patch);
        await writeProfile(tx, base, merged, ctx);
        return merged;
      });
      announce('profile');
```

16. Troque:

```ts
    },

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
```

por:

```ts
    },

    async advanceSeason(fromN, record, next) {
      const outcome = await syncWrite(['profile', 'prefs'], async (tx, ctx) => {
        const base = await storedProfile(tx);
        if (base.season.current.n !== fromN) return { profile: base, saved: false };
        const advanced: Profile = { ...base, season: { current: next, past: [...base.season.past, record] } };
        await writeProfile(tx, base, advanced, ctx);
        return { profile: advanced, saved: true };
      });
      if (outcome.saved) announce('profile');
```

17. Troque:

```ts

    async exportAll({ includeDeleted = true } = {}) {
      // Uma transação só, para sessões, solves, perfil e treino virem do mesmo instante.
      const [sessions, solves, profile, practice] = await read(['sessions', 'solves', 'profile', 'practice'], (tx) =>
        Promise.all([
          tx.objectStore('sessions').getAll(),
          tx.objectStore('solves').getAll(),
          tx.objectStore('profile').get('current'),
          tx.objectStore('practice').getAll(),
        ]),
      );
      const kept = <V extends { deletedAt: number | null }>(list: V[]): V[] => (includeDeleted ? list : list.filter((x) => x.deletedAt === null));
      return {
        format: 'klick',
        version: 1,
        exportedAt: now(),
        sessions: kept(sessions).sort(bySessionOrder),
        solves: kept(solves).sort(bySolveTime),
        profile: profile ? profileOrDefault(profile) : null,
        practice: practice.sort(byPracticeTime),
      };
    },

    async importAll(data) {
      const report: ImportReport = { sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 };
      const outcome = await write(['sessions', 'solves', 'profile', 'practice'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const profile = tx.objectStore('profile');
        const practice = tx.objectStore('practice');

        // Sessão que já existe fica como está (e não conta); só entram as novas.
```

por:

```ts

    async exportAll({ includeDeleted = true } = {}) {
      // Uma transação só, para sessões, solves, perfil e treino virem do mesmo instante.
      const [sessions, solves, device, items, practice] = await read(['sessions', 'solves', 'profile', 'prefs', 'practice'], (tx) =>
        Promise.all([
          tx.objectStore('sessions').getAll(),
          tx.objectStore('solves').getAll(),
          tx.objectStore('profile').get('current'),
          tx.objectStore('prefs').getAll(),
          tx.objectStore('practice').getAll(),
        ]),
      );
      const kept = <V extends { deletedAt: number | null }>(list: V[]): V[] => (includeDeleted ? list : list.filter((x) => x.deletedAt === null));
      // As marcas de exclusão do treino são do sync: o arquivo leva só as tentativas que existem.
      return {
        format: 'klick',
        version: 1,
        exportedAt: now(),
        sessions: kept(sessions).map(bareSession).sort(bySessionOrder),
        solves: kept(solves).map(bareSolve).sort(bySolveTime),
        profile: device || items.length > 0 ? composeProfile(device, items) : null,
        practice: practice.filter((p) => p.deletedAt === null).map(barePractice).sort(byPracticeTime),
      };
    },

    async importAll(data) {
      const report: ImportReport = { sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 };
      const outcome = await syncWrite(['sessions', 'solves', 'profile', 'prefs', 'practice'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const practice = tx.objectStore('practice');

        // Sessão que já existe fica como está (e não conta); só entram as novas.
```

18. Troque:

```ts
          newSessions.push(s);
        }
        report.sessionsAdded = newSessions.length;
        await each(newSessions, (s) => sessions.put(s));

        // Solve por id: entra o que não existe, substitui o de updatedAt menor, e o resto é pulado.
        const knownSolves = new Map<string, number>();
        for (const s of await solves.getAll()) knownSolves.set(s.id, s.updatedAt);
        const incoming: Solve[] = [];
        for (const s of data.solves) {
          const have = knownSolves.get(s.id);
          if (have === undefined) report.solvesAdded++;
          else if (s.updatedAt > have) report.solvesUpdated++;
          else {
            report.skipped++;
            continue;
          }
          knownSolves.set(s.id, s.updatedAt);
          incoming.push(s);
        }
        await each(incoming, (s) => solves.put(s));

        // Invariante: solve ativo que chegou do arquivo não pode ficar sob uma sessão na lixeira (a daqui, por exemplo, que foi
        // excluída): ela volta, só o registro dela. Isso não entra no relatório.
        const at = now();
        let sessionBack = false;
        for (const id of new Set(incoming.filter((s) => s.deletedAt === null).map((s) => s.sessionId))) {
          if (await reviveSession(sessions, id, at)) sessionBack = true;
        }

        // O perfil do arquivo vale por cima do daqui: os ajustes e o acabamento são os do arquivo, a trilha soma as duas (nada
```

por:

```ts
          newSessions.push(s);
        }
        report.sessionsAdded = newSessions.length;
        await each(newSessions, (s) => sessions.put({ ...s, deletionStamp: importedStamp(undefined, s) }));
        await each(newSessions, (s) => ctx.track('sessions', s.id));

        // Solve por id: entra o que não existe, substitui o de updatedAt menor, e o resto é pulado.
        const knownSolves = new Map<string, StoredSolve>();
        for (const s of await solves.getAll()) knownSolves.set(s.id, s);
        const incoming: StoredSolve[] = [];
        for (const s of data.solves) {
          const have = knownSolves.get(s.id);
          if (have === undefined) report.solvesAdded++;
          else if (s.updatedAt > have.updatedAt) report.solvesUpdated++;
          else {
            report.skipped++;
            continue;
          }
          const stored: StoredSolve = { ...s, deletionStamp: importedStamp(have, s) };
          knownSolves.set(s.id, stored);
          incoming.push(stored);
        }
        await each(incoming, (s) => solves.put(s));
        await each(incoming, (s) => ctx.track('solves', s.id));

        // Invariante: solve ativo que chegou do arquivo não pode ficar sob uma sessão na lixeira (a daqui, por exemplo, que foi
        // excluída): ela volta, só o registro dela. Isso não entra no relatório.
        let sessionBack = false;
        for (const id of new Set(incoming.filter((s) => s.deletedAt === null).map((s) => s.sessionId))) {
          if (await reviveSession(sessions, id, ctx)) sessionBack = true;
        }

        // O perfil do arquivo vale por cima do daqui: os ajustes e o acabamento são os do arquivo, a trilha soma as duas (nada
```

19. Troque:

```ts
        let profileSaved = false;
        if (data.profile) {
          const theirs = data.profile;
          const stored = await profile.get('current');
          const base = profileOrDefault(stored);
          let currentSessionId = base.currentSessionId;
          if (typeof theirs.currentSessionId === 'string' && theirs.currentSessionId !== currentSessionId) {
            const target = await sessions.get(theirs.currentSessionId);
```

por:

```ts
        let profileSaved = false;
        if (data.profile) {
          const theirs = data.profile;
          const [stored, items] = await Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]);
          const base = composeProfile(stored, items);
          let currentSessionId = base.currentSessionId;
          if (typeof theirs.currentSessionId === 'string' && theirs.currentSessionId !== currentSessionId) {
            const target = await sessions.get(theirs.currentSessionId);
```

20. Troque:

```ts
          });
          // Mesma ordem de chaves nos dois (mergeProfile monta ambos), então o JSON compara o conteúdo.
          if (!stored || JSON.stringify(merged) !== JSON.stringify(base)) {
            await profile.put(merged, 'current');
            profileSaved = true;
          }
        }

        // O treino junta pelo id (spec do sub-projeto 4, seção 9.3): entra o que não existe; o que já existe fica como está.
        const knownPractice = new Set(await practice.getAllKeys());
        const newPractice = practiceFrom(data.practice).filter((p) => !knownPractice.has(p.id));
        await each(newPractice, (p) => practice.put(p));
        return { profileSaved, sessionBack, practiceAdded: newPractice.length };
      });
      const changed = report.sessionsAdded + report.solvesAdded + report.solvesUpdated + outcome.practiceAdded > 0;
```

por:

```ts
          });
          // Mesma ordem de chaves nos dois (mergeProfile monta ambos), então o JSON compara o conteúdo.
          if (!stored || JSON.stringify(merged) !== JSON.stringify(base)) {
            await writeProfile(tx, base, merged, ctx);
            profileSaved = true;
          }
        }

        // O treino junta pelo id (spec do sub-projeto 4, seção 9.3): entra o que não existe; o que já existe (até uma marca de exclusão)
        // fica como está.
        const knownPractice = new Set(await practice.getAllKeys());
        const newPractice = practiceFrom(data.practice).filter((p) => !knownPractice.has(p.id));
        await each(newPractice, (p) => practice.put({ ...p, updatedAt: p.at, deletedAt: null, deletionStamp: p.at }));
        await each(newPractice, (p) => ctx.track('practice', p.id));
        return { profileSaved, sessionBack, practiceAdded: newPractice.length };
      });
      const changed = report.sessionsAdded + report.solvesAdded + report.solvesUpdated + outcome.practiceAdded > 0;
```

21. Troque:

```ts
      // Uma cópia de antes do treino (sem `practice`, ou com algo que não é lista) não apaga o treino daqui; com a lista, mesmo vazia, o
      // treino é o dela.
      const practice = Array.isArray(data.practice) ? practiceFrom(data.practice) : null;
      await write(['sessions', 'solves', 'profile', 'practice'], async (tx) => {
        const sessionStore = tx.objectStore('sessions');
        const solveStore = tx.objectStore('solves');
        const profileStore = tx.objectStore('profile');
        const practiceStore = tx.objectStore('practice');
        // O perfil daqui é lido antes de limpar: a restauração fica com a temporada mais adiantada (spec 5.6), mesmo que a cópia não
        // tenha perfil, e uma cópia sem perfil também não tira o acabamento que a pessoa escolheu.
        const local = profileOrDefault(await profileStore.get('current'));
        const mine = local.season;
        await Promise.all([sessionStore.clear(), solveStore.clear(), profileStore.clear(), ...(practice ? [practiceStore.clear()] : [])]);
        await each(sessions, (s) => sessionStore.put(s));
        await each(solves, (s) => solveStore.put(s));
        if (practice) await each(practice, (p) => practiceStore.put(p));
        // O que é do treino e a cópia não traz (uma cópia de antes do treino) fica o daqui.
        const kept: ProfilePatch = { lessonAt: local.lessonAt, algChoice: local.algChoice, trainOff: local.trainOff };
        const restored = profile ? mergeProfile(defaultProfile(), { ...kept, ...profile }) : null;
```

por:

```ts
      // Uma cópia de antes do treino (sem `practice`, ou com algo que não é lista) não apaga o treino daqui; com a lista, mesmo vazia, o
      // treino é o dela.
      const practice = Array.isArray(data.practice) ? practiceFrom(data.practice) : null;
      await syncWrite(['sessions', 'solves', 'profile', 'prefs', 'practice'], async (tx, ctx) => {
        const sessionStore = tx.objectStore('sessions');
        const solveStore = tx.objectStore('solves');
        const profileStore = tx.objectStore('profile');
        const prefsStore = tx.objectStore('prefs');
        const practiceStore = tx.objectStore('practice');
        // O perfil daqui é lido antes de limpar: a restauração fica com a temporada mais adiantada (spec 5.6), mesmo que a cópia não
        // tenha perfil, e uma cópia sem perfil também não tira o acabamento que a pessoa escolheu.
        const local = await storedProfile(tx);
        const mine = local.season;
        await Promise.all([sessionStore.clear(), solveStore.clear(), profileStore.clear(), prefsStore.clear(), ...(practice ? [practiceStore.clear()] : [])]);
        await each(sessions, (s) => sessionStore.put({ ...s, deletionStamp: importedStamp(undefined, s) }));
        await each(solves, (s) => solveStore.put({ ...s, deletionStamp: importedStamp(undefined, s) }));
        if (practice) await each(practice, (p) => practiceStore.put({ ...p, updatedAt: p.at, deletedAt: null, deletionStamp: p.at }));
        // O que é do treino e a cópia não traz (uma cópia de antes do treino) fica o daqui.
        const kept: ProfilePatch = { lessonAt: local.lessonAt, algChoice: local.algChoice, trainOff: local.trainOff };
        const restored = profile ? mergeProfile(defaultProfile(), { ...kept, ...profile }) : null;
```

22. Troque:

```ts
        if (restored || season.past.length > 0) {
          const base = restored ?? mergeProfile(defaultProfile(), { ...kept, finish: local.finish });
          const finish = finishUnlocked(base.finish, season.past.length) ? base.finish : 'fosco';
          await profileStore.put({ ...base, season, finish }, 'current');
        }
      });
      announce('all');
    },

    async addPractice(p) {
      const outcome = await write(['practice'], async (tx) => {
        const store = tx.objectStore('practice');
        const stored = await store.get(p.id);
        if (stored) return { practice: stored, added: false };
        await store.add(p);
        return { practice: p, added: true };
      });
      if (outcome.added) announce('practice');
      return structuredClone(outcome.practice);
    },

    async listPractice({ caseId } = {}) {
      const list = caseId === undefined ? await db.getAll('practice') : await db.getAllFromIndex('practice', 'byCase', keyRange(caseId));
      return list.sort(byPracticeTime);
    },

    async updatePractice(id, patch) {
      const updated = await write(['practice'], async (tx) => {
        const store = tx.objectStore('practice');
        const current = await store.get(id);
        if (!current) throw new Error(`Tentativa não encontrada: ${id}`);
        const next: Practice = { ...current, ...definedOnly(patch) };
        await store.put(next);
        return next;
      });
      announce('practice');
      return updated;
    },

    async deletePractice(id) {
      await write(['practice'], async (tx) => {
        await tx.objectStore('practice').delete(id);
      });
      announce('practice');
    },
```

por:

```ts
        if (restored || season.past.length > 0) {
          const base = restored ?? mergeProfile(defaultProfile(), { ...kept, finish: local.finish });
          const finish = finishUnlocked(base.finish, season.past.length) ? base.finish : 'fosco';
          await writeProfile(tx, defaultProfile(), { ...base, season, finish }, ctx);
        }
      });
      announce('all');
    },

    async addPractice(p) {
      const outcome = await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const stored = await store.get(p.id);
        if (stored) return { practice: stored, added: false };
        const at = ctx.stamp();
        const record: StoredPractice = { ...p, updatedAt: at, deletedAt: null, deletionStamp: at };
        await store.add(record);
        await ctx.track('practice', p.id);
        return { practice: record, added: true };
      });
      if (outcome.added) announce('practice');
      return structuredClone(barePractice(outcome.practice));
    },

    async listPractice({ caseId } = {}) {
      const list = caseId === undefined ? await db.getAll('practice') : await db.getAllFromIndex('practice', 'byCase', keyRange(caseId));
      return list.filter((p) => p.deletedAt === null).map(barePractice).sort(byPracticeTime);
    },

    // Corrigir o acerto muda updatedAt (spec 5.1). Uma tentativa apagada não se corrige.
    async updatePractice(id, patch) {
      const updated = await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const current = await store.get(id);
        if (!current || current.deletedAt !== null) throw new Error(`Tentativa não encontrada: ${id}`);
        const next: StoredPractice = { ...current, ...definedOnly(patch), updatedAt: ctx.stamp() };
        await store.put(next);
        await ctx.track('practice', id);
        return next;
      });
      announce('practice');
      return barePractice(updated);
    },

    // Apagar uma tentativa vira marca de exclusão (spec 5.1): a remoção de verdade ressuscitaria a tentativa no sync.
    async deletePractice(id) {
      await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const current = await store.get(id);
        if (!current || current.deletedAt !== null) return;
        const at = ctx.stamp();
        await store.put({ ...current, deletedAt: at, updatedAt: at, deletionStamp: at });
        await ctx.track('practice', id);
      });
      announce('practice');
    },
```

- [ ] **Step 6: O motivo novo das cópias**

Em `app/src/strings.ts`:

Troque:

```ts
      daily: 'Automática, do dia',
      manual: 'Manual',
      'pre-restore': 'Antes de uma restauração',
    }),
    solves: (n: number): string => `${n} ${n === 1 ? 'solve' : 'solves'}`,
    restore: 'Restaurar',
    restoreAria: (when: string): string => `Restaurar a cópia de ${when}`,
```

por:

```ts
      daily: 'Automática, do dia',
      manual: 'Manual',
      'pre-restore': 'Antes de uma restauração',
      'pre-sync': 'Antes de juntar com a conta',
    }),
    label: Object.freeze({ v3: 'Antes da atualização para a conta e o sync' }),
    solves: (n: number): string => `${n} ${n === 1 ? 'solve' : 'solves'}`,
    restore: 'Restaurar',
    restoreAria: (when: string): string => `Restaurar a cópia de ${when}`,
```

Em `app/src/ui/dialogs/BackupsDialog.svelte`:

Troque:

```svelte
      {#each backups as b (b.id)}
        {@const when = `${dateLabel(b.createdAt)}, ${timeOfDay(b.createdAt)}`}
        <li class="setting">
          <span>{T.backupsDialog.reason[b.reason]}<small>{when} · {T.backupsDialog.solves(b.solveCount)}</small></span>
          <button
            type="button"
            class="btn{asking === b.id ? ' danger' : ''}"
```

por:

```svelte
      {#each backups as b (b.id)}
        {@const when = `${dateLabel(b.createdAt)}, ${timeOfDay(b.createdAt)}`}
        <li class="setting">
          <span>{b.label ? T.backupsDialog.label[b.label] : T.backupsDialog.reason[b.reason]}<small>{when} · {T.backupsDialog.solves(b.solveCount)}</small></span>
          <button
            type="button"
            class="btn{asking === b.id ? ' danger' : ''}"
```

- [ ] **Step 7: Ajuste os testes que conferiam detalhes de antes**

O comportamento que a pessoa vê não muda; estes testes conferiam detalhes de armazenamento ou de tempo que mudaram, cada um pelo motivo do comentário:

- `repository.test.ts`: com o relógio do app (spec 5.4), gravações no mesmo milissegundo ganham datas que sobem de 1 em 1 (o tempo do teste é parado); e um perfil "antigo" só existe antes da versão 3, então o teste o grava na versão 2 e deixa a migração agir.
- `app-state.test.ts`: a gravação do solve agora leva o relógio e a fila na mesma transação, e anda em mais voltas do banco de teste, que corre no relógio falso: os passos ficam mais curtos, com o mesmo total.
- `season-state.test.ts`: o solve gravado direto no banco tem o `deletionStamp` da versão 3.
- `sessions-dialog.test.ts`: o teste esperava a lixeira do banco e logo depois conferia a tela, que relê um pouco depois; agora espera a tela.

Em `app/tests/unit/repository.test.ts`:

1. Troque:

```ts
import { defaultSeason } from '../../src/core/season';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import type { FinishId, Profile, SeasonProgress, SeasonRecord, SeasonState } from '../../src/core/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, createSender, type ChannelLike, type KlickExport, type Repository } from '../../src/data/repository';
```

por:

```ts
import { defaultSeason } from '../../src/core/season';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import type { FinishId, Profile, SeasonProgress, SeasonRecord, SeasonState } from '../../src/core/types';
import type { DeviceProfile } from '../../src/core/sync/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, createSender, type ChannelLike, type KlickExport, type Repository } from '../../src/data/repository';
```

2. Troque:

```ts
    await repo.addSolve(ns(s.id, 58000, 1000));
    const list = await repo.listSolves({ sessionId: s.id });
    expect(list.map((x) => x.ms)).toEqual([58000, 60000]);
    expect(list[0]).toMatchObject({ note: '', penalty: null, deletedAt: null, createdAt: t, updatedAt: t });
    expect((await repo.listSolves({ event: '333' })).length).toBe(2);
    expect((await repo.listSolves({ event: '222' })).length).toBe(0);
  });
```

por:

```ts
    await repo.addSolve(ns(s.id, 58000, 1000));
    const list = await repo.listSolves({ sessionId: s.id });
    expect(list.map((x) => x.ms)).toEqual([58000, 60000]);
    // As datas vêm do relógio do app (spec 5.4): com o tempo parado do teste, cada gravação sobe 1 ms.
    expect(list[0]).toMatchObject({ note: '', penalty: null, deletedAt: null, createdAt: t + 2, updatedAt: t + 2 });
    expect((await repo.listSolves({ event: '333' })).length).toBe(2);
    expect((await repo.listSolves({ event: '222' })).length).toBe(0);
  });
```

3. Troque:

```ts
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.deleteSolve(a.id);
    const firstAt = t;
    t += 5000;
    await repo.deleteSolve(a.id);
    expect((await repo.listTrash()).solves[0].deletedAt).toBe(firstAt);
```

por:

```ts
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.deleteSolve(a.id);
    const firstAt = (await repo.listTrash()).solves[0].deletedAt;
    t += 5000;
    await repo.deleteSolve(a.id);
    expect((await repo.listTrash()).solves[0].deletedAt).toBe(firstAt);
```

4. Troque:

```ts
    const day = 86_400_000;
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.deleteSolve(a.id);
    await repo.deleteSession(s.id); // o solve e a sessão com a mesma marca de exclusão
    t += 30 * day; // exatamente 30 dias depois
    expect(await repo.purgeTrash(30 * day)).toBe(0);
    const trash = await repo.listTrash();
    expect(trash.solves.map((x) => x.id)).toEqual([a.id]);
```

por:

```ts
    const day = 86_400_000;
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.deleteSession(s.id); // o solve e a sessão com a mesma marca de exclusão
    t = (await repo.listTrash()).sessions[0].deletedAt! + 30 * day; // exatamente 30 dias depois
    expect(await repo.purgeTrash(30 * day)).toBe(0);
    const trash = await repo.listTrash();
    expect(trash.solves.map((x) => x.id)).toEqual([a.id]);
```

5. Troque:

```ts

  it('perfil novo e perfil antigo, sem temporada, começam na T1', async () => {
    expect((await repo.getProfile()).season).toEqual(defaultSeason());
    const db = await openKlickDb(`klick-test-${++dbn}`);
    const old = { settings: { ...DEFAULT_SETTINGS, sound: { ...DEFAULT_SETTINGS.sound } }, trail: Array<boolean>(9).fill(false), finish: 'fosco', onboarded: true, currentSessionId: null };
    await db.put('profile', old as unknown as Profile, 'current');
    const p = await createRepository(db, { now, channel: null }).getProfile();
    expect(p.season).toEqual(defaultSeason());
    expect(p.onboarded).toBe(true);
```

por:

```ts

  it('perfil novo e perfil antigo, sem temporada, começam na T1', async () => {
    expect((await repo.getProfile()).season).toEqual(defaultSeason());
    // O perfil antigo só existe antes da versão 3: gravado na versão 2, ele passa pela migração.
    const name = `klick-test-${++dbn}`;
    const v2 = await openKlickDb(name, {}, 2);
    const old = { settings: { ...DEFAULT_SETTINGS, sound: { ...DEFAULT_SETTINGS.sound } }, trail: Array<boolean>(9).fill(false), finish: 'fosco', onboarded: true, currentSessionId: null };
    await v2.put('profile', old as unknown as DeviceProfile, 'current');
    v2.close();
    const db = await openKlickDb(name);
    const p = await createRepository(db, { now, channel: null }).getProfile();
    expect(p.season).toEqual(defaultSeason());
    expect(p.onboarded).toBe(true);
```

Em `app/tests/unit/app-state.test.ts`:

Troque:

```ts
      const adding = app.addSolve(newSolve(61_000));
      let done = false;
      void adding.then(() => { done = true; });
      // O banco de teste também anda no relógio falso: avança em passos, bem além dos 8 s do prazo da contagem.
      for (let i = 0; i < 20 && !done; i++) await vi.advanceTimersByTimeAsync(2_500);
      expect(done).toBe(true);
      expect((await adding)?.ms).toBe(61_000);
      expect(app.solves.map((x) => x.ms)).toEqual([61_000]);
```

por:

```ts
      const adding = app.addSolve(newSolve(61_000));
      let done = false;
      void adding.then(() => { done = true; });
      // O banco de teste também anda no relógio falso: avança em passos curtos (a gravação do solve, com o relógio do sync e a fila de
      // saída na mesma transação, leva várias voltas e não pode passar dos 8 s do prazo dela), até bem além dos 8 s do prazo da contagem.
      for (let i = 0; i < 200 && !done; i++) await vi.advanceTimersByTimeAsync(250);
      expect(done).toBe(true);
      expect((await adding)?.ms).toBe(61_000);
      expect(app.solves.map((x) => x.ms)).toEqual([61_000]);
```

Em `app/tests/unit/season-state.test.ts`:

1. Troque:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SeasonTracker } from '../../src/core/season';
import type { SeasonState, Session, Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type KlickExport, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
```

por:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SeasonTracker } from '../../src/core/season';
import type { SeasonState, Session, Solve } from '../../src/core/types';
import { openKlickDb, type StoredSolve } from '../../src/data/db';
import { createRepository, type KlickExport, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
```

2. Troque:

```ts
    // Gravado direto no banco, sem a validação do repositório: um solve de "fto" de uma versão mais nova, depois de voltar a esta.
    const db = await openKlickDb(name);
    const at = END - 10 * DAY + 50 * 60000 + 1;
    await db.put('solves', { id: 'alien', sessionId: 'hs', event: 'fto', ms: 1000, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null } as unknown as Solve);
    db.close();
    const a = make(repo);
    await a.init();
```

por:

```ts
    // Gravado direto no banco, sem a validação do repositório: um solve de "fto" de uma versão mais nova, depois de voltar a esta.
    const db = await openKlickDb(name);
    const at = END - 10 * DAY + 50 * 60000 + 1;
    await db.put('solves', { id: 'alien', sessionId: 'hs', event: 'fto', ms: 1000, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null, deletionStamp: at } as unknown as StoredSolve);
    db.close();
    const a = make(repo);
    await a.init();
```

Em `app/tests/unit/sessions-dialog.test.ts`:

Troque:

```ts
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: /^Excluir Descartável/ }));
    await vi.waitFor(async () => expect((await repo.listTrash()).sessions.map((s) => s.id)).toContain(id), { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /^Descartável/ })).toBeNull();
  });

  it('clicar no respiro não fecha; clicar no fundo fecha e libera app.dialog', async () => {
```

por:

```ts
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: /^Excluir Descartável/ }));
    await vi.waitFor(async () => expect((await repo.listTrash()).sessions.map((s) => s.id)).toContain(id), { timeout: 3000 });
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /^Descartável/ })).toBeNull());
  });

  it('clicar no respiro não fecha; clicar no fundo fecha e libera app.dialog', async () => {
```

- [ ] **Step 8: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/migration-v3.test.ts tests/unit/repository-prefs.test.ts tests/unit/db.test.ts tests/unit/repository-practice.test.ts`
Expected: PASS (6 + 5 + 6 + 14 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS (a suíte inteira).

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/data/db.ts src/data/repository.ts src/strings.ts src/ui/dialogs/BackupsDialog.svelte tests/unit/migration-v3.test.ts tests/unit/repository-prefs.test.ts tests/unit/db.test.ts tests/unit/repository-practice.test.ts tests/unit/repository.test.ts tests/unit/app-state.test.ts tests/unit/season-state.test.ts tests/unit/sessions-dialog.test.ts
git commit -m "feat(app): banco versão 3, com as datas do sync e o perfil dividido entre conta e aparelho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: A fila de saída, o estado do sync e a lixeira que espera o servidor

Spec: seções 5.3, 5.4, 5.5 (lixeira) e 6.6 (forma); Review Focus 4.

**Files:**
- Modify: `app/src/data/repository.ts` (`ChangeKind` ganha `'sync'`; `getSyncState`, `saveSyncState`; `purgeTrash` poupa o que está na fila)
- Test: `app/tests/unit/repository-outbox.test.ts`

**Interfaces:**
- Consumes: `syncWrite`, `defaultSyncState` (Task 4); `toChange`, `prefToChange`, `checkChange` (Task 2, nos testes).
- Produces: `ChangeKind` com `'sync'`; `Repository.getSyncState(): Promise<SyncState>`; `Repository.saveSyncState(patch: Partial<SyncState>): Promise<SyncState>` (avisa `'sync'`; o `clock` só sobe); `purgeTrash` apaga de vez só o que não está na fila de saída, e leva junto as marcas de exclusão do treino (sem contá-las).

A fila já é preenchida pela Task 4 (`ctx.track`), mas só com `accountId`: até aqui ninguém tem conta, e nada entra nela. Esta tarefa dá o jeito de ligar a conta nos testes e confere a fila de ponta a ponta, inclusive que tudo o que o app põe nela tem a forma que o servidor aceita (spec 6.6).

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/repository-outbox.test.ts`:

```ts
import type { IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import { prefToChange, toChange, type RecordStore } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import type { Change } from '../../src/core/sync/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, type ChangeKind, type Repository } from '../../src/data/repository';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const DAY = 86_400_000;
const ns = (sessionId: string, ms: number) => ({ sessionId, event: '333' as const, ms, penalty: null, at: t, scramble: "R U R'" });

async function fresh(account: string | null = 'conta-1'): Promise<{ db: IDBPDatabase<KlickDB>; repo: Repository }> {
  const db = await openKlickDb(`outbox-${++n}`);
  const repo = createRepository(db, { now, channel: null });
  if (account) await repo.saveSyncState({ accountId: account, signedIn: true });
  return { db, repo };
}
const keys = async (db: IDBPDatabase<KlickDB>): Promise<string[]> => ((await db.getAllKeys('outbox')) as string[]).sort();

// O registro atual de cada entrada da fila, como o motor vai mandar (spec 6.1).
async function pendingChanges(db: IDBPDatabase<KlickDB>): Promise<Change[]> {
  const out: Change[] = [];
  for (const e of await db.getAll('outbox')) {
    if (e.store === 'prefs') out.push(prefToChange((await db.get('prefs', e.id))!));
    else out.push(toChange(e.store as RecordStore, (await db.get(e.store, e.id))!));
  }
  return out;
}

describe('fila de saída (spec 5.3)', () => {
  it('sem conta, nenhuma gravação entra na fila', async () => {
    const { db, repo } = await fresh(null);
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    await repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false] });
    expect(await keys(db)).toEqual([]);
  });

  it('com conta, cada registro gravado entra uma vez, na mesma transação, com a data da gravação', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.updateSolve(a.id, { note: 'um' });
    await repo.updateSolve(a.id, { note: 'dois' }); // várias edições do mesmo registro viram uma entrada só
    const p = await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.updatePractice(p.id, { ok: false });
    await repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false], settings: { theme: 'dark' } });
    expect(await keys(db)).toEqual([`practice/p1`, 'prefs/trail.0', `sessions/${s.id}`, `solves/${a.id}`]);
    const solveEntry = await db.get('outbox', `solves/${a.id}`);
    expect(solveEntry).toEqual({ store: 'solves', id: a.id, queuedAt: (await db.get('solves', a.id))!.updatedAt });
  });

  it('excluir a sessão põe na fila a sessão e os solves que saíram junto; restaurar também', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    await db.clear('outbox');
    await repo.deleteSession(s.id);
    expect(await keys(db)).toEqual([`sessions/${s.id}`, `solves/${a.id}`, `solves/${b.id}`].sort());
    await db.clear('outbox');
    await repo.restoreSession(s.id);
    expect(await keys(db)).toEqual([`sessions/${s.id}`, `solves/${a.id}`, `solves/${b.id}`].sort());
  });

  it('apagar uma tentativa do treino vira marca de exclusão, fora da lista e do export, e entra na fila', async () => {
    const { db, repo } = await fresh();
    const p = await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.deletePractice(p.id);
    expect(await repo.listPractice()).toEqual([]);
    expect((await repo.exportAll()).practice).toEqual([]);
    expect(await db.get('practice', 'p1')).toMatchObject({ deletedAt: expect.any(Number), deletionStamp: expect.any(Number) });
    expect(await keys(db)).toEqual(['practice/p1']);
    await expect(repo.updatePractice('p1', { ok: false })).rejects.toThrow('p1');
  });

  it('toda mudança que o app põe na fila tem a forma que o servidor aceita (spec 6.6)', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333oh', name: 'Uma mão' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    await repo.updateSolve(a.id, { penalty: 'DNF', note: 'escorregou' });
    await repo.deleteSolve(b.id);
    await repo.renameSession(s.id, 'Só a direita');
    await repo.addPractice({ id: 'p1', caseId: 'f2l-03', ms: 3000, ok: false, helped: true, at: t });
    await repo.deletePractice('p1');
    await repo.saveProfile({
      trail: [true, true, false, false, false, false, false, false, false], finish: 'fosco', onboarded: true, lessonAt: { 4: 2 },
      algChoice: { 'oll2-h': 1 }, trainOff: ['pll2-t'], settings: { inspection: false, dailyGoal: 40 },
    });
    await repo.saveProfile({ lessonAt: {} });
    const changes = await pendingChanges(db);
    expect(changes.length).toBeGreaterThan(8);
    for (const c of changes) expect(checkChange(c), `${c.store}/${c.id}`).toEqual({ ok: true, change: c });
  });

  it('o estado do sync: padrão antes de entrar; salvar avisa "sync"; o relógio nunca desce', async () => {
    const { repo } = await fresh(null);
    expect(await repo.getSyncState()).toEqual({ accountId: null, email: null, signedIn: false, firstSync: false, cursor: 0, lastSyncAt: null, clock: 0, passkey: false });
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    await repo.saveSyncState({ accountId: 'u', email: 'a@b.c', clock: 500 });
    await repo.saveSyncState({ clock: 100, cursor: 7 });
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'u', email: 'a@b.c', clock: 500, cursor: 7 });
    expect(heard).toEqual(['sync', 'sync']);
  });
});

describe('lixeira com sync (spec 5.5)', () => {
  it('só some de vez, depois dos 30 dias, o que não espera na fila', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    await repo.deleteSolve(a.id);
    await repo.deleteSolve(b.id);
    await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.deletePractice('p1');
    await db.delete('outbox', `solves/${a.id}`); // o servidor confirmou a exclusão de a; a de b ainda espera
    await db.delete('outbox', 'practice/p1');
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(1);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([b.id]);
    expect(await db.get('practice', 'p1')).toBeUndefined();
  });

  it('sem conta, a lixeira esvazia como antes', async () => {
    const { repo } = await fresh(null);
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.deleteSolve(a.id);
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(1);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/repository-outbox.test.ts`
Expected: FAIL (6 testes): `TypeError: repo.saveSyncState is not a function` e `repo.getSyncState is not a function`.

- [ ] **Step 3: O estado do sync e a lixeira**

Em `app/src/data/repository.ts`:

1. Troque:

```ts
import type { BackupRecord, KlickDB, StoredPractice, StoredSession, StoredSolve } from './db';
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'all';
// De onde veio o aviso: 'local' é desta aba (já está na memória de quem gravou); 'remote' é de outra aba (o canal).
export type ChangeOrigin = 'local' | 'remote';
// `solveIds` vem só nos avisos de solves: quais mudaram (gravados, editados, excluídos, restaurados ou apagados de vez). Sem ele (aviso
```

por:

```ts
import type { BackupRecord, KlickDB, StoredPractice, StoredSession, StoredSolve } from './db';
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'sync' | 'all';
// De onde veio o aviso: 'local' é desta aba (já está na memória de quem gravou); 'remote' é de outra aba (o canal).
export type ChangeOrigin = 'local' | 'remote';
// `solveIds` vem só nos avisos de solves: quais mudaram (gravados, editados, excluídos, restaurados ou apagados de vez). Sem ele (aviso
```

2. Troque:

```ts
  deleteSolve(id: string): Promise<void>;
  restoreSolve(id: string): Promise<void>; // devolve o solve; se a sessão dele está na lixeira, devolve também o registro dela (só ele: os outros solves excluídos da sessão continuam na lixeira)
  listTrash(): Promise<{ sessions: Session[]; solves: Solve[] }>; // o excluído mais recentemente primeiro, sessões e solves
  purgeTrash(olderThanMs: number): Promise<number>; // apaga de vez o excluído antes de now - olderThanMs (no limite exato ainda fica); devolve quantos itens (sessões e solves)
  getProfile(): Promise<Profile>; // padrão se ausente (e não grava o padrão)
  saveProfile(patch: ProfilePatch): Promise<Profile>; // settings faz merge raso, sound faz merge
  // Vira a temporada (spec 5.5) numa transação: só grava se a temporada gravada ainda for fromN. Se outra aba já virou, não grava nem
```

por:

```ts
  deleteSolve(id: string): Promise<void>;
  restoreSolve(id: string): Promise<void>; // devolve o solve; se a sessão dele está na lixeira, devolve também o registro dela (só ele: os outros solves excluídos da sessão continuam na lixeira)
  listTrash(): Promise<{ sessions: Session[]; solves: Solve[] }>; // o excluído mais recentemente primeiro, sessões e solves
  // Apaga de vez o excluído antes de now - olderThanMs (no limite exato ainda fica), menos o que espera na fila de saída: a marca de exclusão
  // só some depois que o servidor a tem (spec 5.5). Devolve quantos itens (sessões e solves); as marcas do treino saem junto, sem contar.
  purgeTrash(olderThanMs: number): Promise<number>;
  getProfile(): Promise<Profile>; // padrão se ausente (e não grava o padrão)
  saveProfile(patch: ProfilePatch): Promise<Profile>; // settings faz merge raso, sound faz merge
  // Vira a temporada (spec 5.5) numa transação: só grava se a temporada gravada ainda for fromN. Se outra aba já virou, não grava nem
```

3. Troque:

```ts
  advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>;
  getMeta(): Promise<Meta>; // padrão se ausente (deviceId novo), gravado na primeira leitura
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  getFolderHandle(): Promise<unknown | null>;
  saveFolderHandle(h: unknown | null): Promise<void>;
  saveBackup(r: BackupRecord): Promise<void>;
```

por:

```ts
  advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>;
  getMeta(): Promise<Meta>; // padrão se ausente (deviceId novo), gravado na primeira leitura
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  getSyncState(): Promise<SyncState>; // o bloco sync do meta (spec 5.4); o padrão antes do primeiro login
  // Muda o estado do sync e avisa 'sync'. O relógio só sobe: um clock menor que o gravado é ignorado.
  saveSyncState(patch: Partial<SyncState>): Promise<SyncState>;
  getFolderHandle(): Promise<unknown | null>;
  saveFolderHandle(h: unknown | null): Promise<void>;
  saveBackup(r: BackupRecord): Promise<void>;
```

4. Troque:

```ts
}

const CHANNEL_NAME = 'klick-data';
const CHANGE_KINDS: readonly string[] = ['solves', 'sessions', 'profile', 'meta', 'practice', 'all'];
const TRAIL_LENGTH = 9;

const isChangeKind = (v: unknown): v is ChangeKind => typeof v === 'string' && CHANGE_KINDS.includes(v);
```

por:

```ts
}

const CHANNEL_NAME = 'klick-data';
const CHANGE_KINDS: readonly string[] = ['solves', 'sessions', 'profile', 'meta', 'practice', 'sync', 'all'];
const TRAIL_LENGTH = 9;

const isChangeKind = (v: unknown): v is ChangeKind => typeof v === 'string' && CHANGE_KINDS.includes(v);
```

5. Troque:

```ts
    async purgeTrash(olderThanMs) {
      const limit = now() - olderThanMs;
      const expired = ({ deletedAt }: { deletedAt: number | null }) => deletedAt !== null && deletedAt < limit;
      const removed = await write(['sessions', 'solves'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const oldSessions = (await sessions.getAll()).filter(expired);
        const oldSolves = (await solves.getAll()).filter(expired);
        await each(oldSessions, (s) => sessions.delete(s.id));
        await each(oldSolves, (s) => solves.delete(s.id));
        return { sessions: oldSessions.length, solves: oldSolves.map((s) => s.id) };
      });
      if (removed.solves.length > 0) announceSolves(removed.solves);
```

por:

```ts
    async purgeTrash(olderThanMs) {
      const limit = now() - olderThanMs;
      const expired = ({ deletedAt }: { deletedAt: number | null }) => deletedAt !== null && deletedAt < limit;
      const removed = await write(['sessions', 'solves', 'practice', 'outbox'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const practice = tx.objectStore('practice');
        const waiting = new Set(await tx.objectStore('outbox').getAllKeys());
        const gone = (store: SyncStore) => (r: { id: string; deletedAt: number | null }) => expired(r) && !waiting.has(syncKey(store, r.id));
        const oldSessions = (await sessions.getAll()).filter(gone('sessions'));
        const oldSolves = (await solves.getAll()).filter(gone('solves'));
        const oldPractice = (await practice.getAll()).filter(gone('practice'));
        await each(oldSessions, (s) => sessions.delete(s.id));
        await each(oldSolves, (s) => solves.delete(s.id));
        await each(oldPractice, (p) => practice.delete(p.id));
        return { sessions: oldSessions.length, solves: oldSolves.map((s) => s.id) };
      });
      if (removed.solves.length > 0) announceSolves(removed.solves);
```

6. Troque:

```ts
      });
      announce('meta');
      return meta;
    },

    async getFolderHandle() {
```

por:

```ts
      });
      announce('meta');
      return meta;
    },

    async getSyncState() {
      return syncStateOrDefault((await db.get('meta', 'sync')) as SyncState | undefined);
    },

    async saveSyncState(patch) {
      const state = await write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        const stored = syncStateOrDefault((await store.get('sync')) as SyncState | undefined);
        const merged: SyncState = { ...stored, ...definedOnly(patch), clock: Math.max(stored.clock, patch.clock ?? 0) };
        await store.put(merged, 'sync');
        return merged;
      });
      announce('sync');
      return state;
    },

    async getFolderHandle() {
```

- [ ] **Step 4: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/repository-outbox.test.ts`
Expected: PASS (8 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/repository.ts tests/unit/repository-outbox.test.ts
git commit -m "feat(app): fila de saída, estado do sync e lixeira que espera o servidor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: As correções da pesquisa: ids do csTimer, sessão padrão, import por recência e restaurar como gravação

Spec: seção 5.5 (as quatro correções) e 5.1 (sessões no import); decisões 9, 10 e 13 do começo deste plano; Review Focus 1.

**Files:**
- Create: `app/src/core/sync/restore.ts`
- Modify: `app/src/data/ids.ts` (`derivedId`, `defaultSessionId`)
- Modify: `app/src/data/transfer.ts` (ids derivados no `csTimerToKlick`; o `ctx.newId` sai)
- Modify: `app/src/data/repository.ts` (`createSession` com `id`; sessões no import pelo mais recente; `replaceAll` restaura como gravação)
- Modify: `app/src/ui/state/app.svelte.ts` (a sessão padrão com id fixo; a chamada do `csTimerToKlick`)
- Modify (testes que conferiam o comportamento de antes): `app/tests/unit/repository.test.ts`, `app/tests/unit/transfer.test.ts`
- Test: `app/tests/unit/repository-restore.test.ts`

**Interfaces:**
- Consumes: `toChange`, `fromChange`, `prefToChange`, `changeToPref`, `defaultPrefValue`, `prefsFromProfile`, `splitProfile` (Task 2); `syncWrite`, `importedStamp`, `composeProfile`, `writeProfile` (Task 4).
- Produces (em `core/sync/restore.ts`): `RestoreCopy { sessions: readonly object[]; solves: readonly object[]; practice: readonly object[] | null }`, `restoreChanges(current: readonly Change[], copy: RestoreCopy, prefs: ReadonlyMap<string, unknown> | null, stamp: number): Change[]` (o Worker a usa na Task 17).
- Produces (em `data/ids.ts`): `derivedId(prefix: string, parts: readonly (string | number)[]): string` (o prefixo mais 22 caracteres [0-9a-z]); `defaultSessionId(event: string): string` (`default-<evento>`).
- Produces (em `data/transfer.ts`): `csTimerSolveId(event, s: { at; ms; scramble }): string` (`cs-` mais o hash); `csTimerToKlick(parsed, mapping, ctx: { now; existingSessions; existingSolves })`.
- Produces (em `data/repository.ts`): `createSession(o: { event; name?; id? })` (o `id` vale se nenhum registro o usa); `importAll` troca a sessão de `updatedAt` menor (sem contar no relatório); `replaceAll` grava cada registro da cópia com a data do relógio, manda para a lixeira o que não está nela e põe tudo na fila; o perfil restaurado é o mesmo de antes, gravado inteiro (todas as chaves da conta).

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/repository-restore.test.ts`:

```ts
import type { IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { defaultSessionId } from '../../src/data/ids';
import { createRepository, type Repository } from '../../src/data/repository';
import { createBackup, restoreBackup } from '../../src/data/safety';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const ns = (sessionId: string, ms: number) => ({ sessionId, event: '333' as const, ms, penalty: null, at: t, scramble: "R U R'" });

async function fresh(account: string | null = null): Promise<{ db: IDBPDatabase<KlickDB>; repo: Repository }> {
  const db = await openKlickDb(`restore-${++n}`);
  const repo = createRepository(db, { now, channel: null });
  if (account) await repo.saveSyncState({ accountId: account, signedIn: true });
  return { db, repo };
}

describe('a sessão padrão de um aparelho novo (spec 5.5)', () => {
  it('dois aparelhos novos criam a mesma "Sessão 1", com id fixo por evento', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { repo } = await fresh();
      const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R' }), now, storage: null, storageManager: null });
      await app.init();
      ids.push(app.sessions[0].id);
    }
    expect(ids).toEqual([defaultSessionId('333'), defaultSessionId('333')]);
  });

  it('com o id padrão já usado (a sessão está na lixeira), a sessão nova ganha um id novo', async () => {
    const { repo } = await fresh();
    const first = await repo.createSession({ event: '333', id: defaultSessionId('333') });
    await repo.deleteSession(first.id);
    const second = await repo.createSession({ event: '333', id: defaultSessionId('333') });
    expect(first.id).toBe('default-333');
    expect(second.id).not.toBe('default-333');
  });
});

describe('restaurar uma cópia é gravação (spec 5.5)', () => {
  it('sem conta, a tela fica como a cópia; o que não estava nela vai para a lixeira', async () => {
    const { repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const kept = await repo.addSolve(ns(s.id, 1000));
    const backup = await createBackup(repo, 'manual', t);
    t += 1000;
    const extra = await repo.addSolve(ns(s.id, 2000));
    await repo.updateSolve(kept.id, { note: 'depois da cópia' });
    t += 1000;
    await restoreBackup(repo, backup.id, t);
    expect((await repo.listSolves()).map((x) => [x.id, x.note])).toEqual([[kept.id, '']]);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([extra.id]);
    expect((await repo.listSessions()).map((x) => x.id)).toEqual([s.id]);
  });

  it('com conta, cada registro da cópia ganha data nova e tudo entra na fila, inclusive as chaves da conta', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    const kept = await repo.addSolve(ns(s.id, 1000));
    await repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false] });
    const backup = await createBackup(repo, 'manual', t);
    t += 1000;
    const extra = await repo.addSolve(ns(s.id, 2000));
    await repo.saveProfile({ trail: [true, true, false, false, false, false, false, false, false], lessonAt: { 3: 2 } });
    await db.clear('outbox');
    t += 60_000;
    await restoreBackup(repo, backup.id, t);
    const restored = (await db.get('solves', kept.id))!;
    expect(restored).toMatchObject({ deletedAt: null });
    expect(restored.updatedAt).toBeGreaterThanOrEqual(t);
    expect(restored.deletionStamp).toBe(restored.updatedAt);
    expect((await db.get('solves', extra.id))!.deletedAt).toBe(restored.updatedAt);
    const queued = (await db.getAllKeys('outbox')) as string[];
    expect(queued).toEqual(expect.arrayContaining([`solves/${kept.id}`, `solves/${extra.id}`, `sessions/${s.id}`, 'prefs/trail.1', 'prefs/lessonAt.3', 'prefs/finish']));
    expect(await db.get('prefs', 'trail.1')).toMatchObject({ value: false });
    expect(await db.get('prefs', 'lessonAt.3')).toMatchObject({ value: null });
    expect((await repo.getProfile()).trail.slice(0, 2)).toEqual([true, false]);
  });
});

describe('importar sessões (spec 5.5)', () => {
  it('a sessão segue "o mais recente vence": renomear e excluir no outro aparelho chegam pelo arquivo', async () => {
    const { repo: phone } = await fresh();
    const { repo: desktop } = await fresh();
    const s = await phone.createSession({ event: '333', name: 'Treino' });
    await desktop.importAll(await phone.exportAll());
    t += 1000;
    await phone.renameSession(s.id, 'Treino da manhã');
    t += 1000;
    await phone.deleteSession(s.id);
    await desktop.importAll(await phone.exportAll());
    expect(await desktop.listSessions()).toEqual([]);
    expect((await desktop.listTrash()).sessions).toMatchObject([{ id: s.id, name: 'Treino da manhã' }]);
  });
});
```

Em `app/tests/unit/transfer.test.ts`, o contexto do conversor perde o `newId` e os ids passam a ser derivados (o teste novo confere o mesmo arquivo em dois aparelhos):

Em `app/tests/unit/transfer.test.ts`:

1. Troque:

```ts
// Caminho relativo a este arquivo. Não usa `new URL(\`../fixtures/${name}\`, import.meta.url)`: no ambiente jsdom o Vite o
// reescreve para resolver contra self.location e o fs recusa a URL (mesmo motivo do contrast.test.ts).
const fixture = (name: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures', name), 'utf8');
let seq = 0;
const ctx = (existingSessions: Session[] = [], existingSolves: Solve[] = []) => ({
  now: 1_791_500_000_000, newId: () => `id${String(++seq).padStart(15, '0')}`, existingSessions, existingSolves,
});

// --- Apoio dos testes acrescentados (os do plano ficam como vieram) ---
```

por:

```ts
// Caminho relativo a este arquivo. Não usa `new URL(\`../fixtures/${name}\`, import.meta.url)`: no ambiente jsdom o Vite o
// reescreve para resolver contra self.location e o fs recusa a URL (mesmo motivo do contrast.test.ts).
const fixture = (name: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures', name), 'utf8');
const ctx = (existingSessions: Session[] = [], existingSolves: Solve[] = []) => ({ now: 1_791_500_000_000, existingSessions, existingSolves });

// --- Apoio dos testes acrescentados (os do plano ficam como vieram) ---
```

2. Troque:

```ts
      ]);
      const ids = [...r.sessions.map((s) => s.id), ...r.solves.map((s) => s.id)];
      expect(new Set(ids).size).toBe(6);
      expect(main.id < r.solves[0].id).toBe(true); // a sessão ganha o id antes dos solves dela
    });

    it('sem sessões que existam, a ordem parte de 0', () => {
```

por:

```ts
      ]);
      const ids = [...r.sessions.map((s) => s.id), ...r.solves.map((s) => s.id)];
      expect(new Set(ids).size).toBe(6);
      // Ids derivados do dado (spec 5.5): `cs-s-` nas sessões e `cs-` nos solves, mais 22 caracteres do hash.
      expect(r.sessions.every((s) => /^cs-s-[0-9a-z]{22}$/.test(s.id))).toBe(true);
      expect(r.solves.every((s) => /^cs-[0-9a-z]{22}$/.test(s.id))).toBe(true);
    });

    it('o mesmo arquivo importado em dois aparelhos dá os mesmos ids, mesmo em horas e com sessões diferentes (spec 5.5)', () => {
      const parsed = parseCsTimer(fixture('cstimer-export.txt'));
      const phone = csTimerToKlick(parsed, { session3: '333' }, ctx());
      const desktop = csTimerToKlick(parsed, { session3: '333' }, { ...ctx([mkSession({ order: 4 })]), now: NOW + 3_600_000 });
      expect(desktop.sessions.map((s) => s.id)).toEqual(phone.sessions.map((s) => s.id));
      expect(desktop.solves.map((s) => s.id)).toEqual(phone.solves.map((s) => s.id));
      expect(desktop.sessions[0].createdAt).not.toBe(phone.sessions[0].createdAt);
    });

    it('sem sessões que existam, a ordem parte de 0', () => {
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/repository-restore.test.ts tests/unit/transfer.test.ts`
Expected: FAIL (17 testes): `TypeError: defaultSessionId is not a function`, os conversores do csTimer que ainda chamam `ctx.newId` (`TypeError: ctx.newId is not a function`) e as restaurações que ainda apagam sem marca.

- [ ] **Step 3: Ids derivados e a sessão padrão**

Em `app/src/data/ids.ts`:

Troque:

```ts
  const slot = nextSlot(now);
  return encode(slot.ms, TIME_DIGITS) + encode(slot.count, COUNTER_DIGITS) + encode(rand() * 36 ** RANDOM_DIGITS, RANDOM_DIGITS);
}
```

por:

```ts
  const slot = nextSlot(now);
  return encode(slot.ms, TIME_DIGITS) + encode(slot.count, COUNTER_DIGITS) + encode(rand() * 36 ** RANDOM_DIGITS, RANDOM_DIGITS);
}

// --- Ids derivados (spec 5.5): o mesmo dado dá o mesmo id em qualquer aparelho ---

// cyrb53 (domínio público, de bryc): um hash de 53 bits, rápido e sem dependência. Duas sementes dão 106 bits, longe de colidir num
// histórico de dezenas de milhares de solves.
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// `prefix` mais 22 caracteres [0-9a-z] tirados das partes. Ids derivados não ordenam pelo tempo, ao contrário de newId.
export function derivedId(prefix: string, parts: readonly (string | number)[]): string {
  const text = parts.join('\u001f');
  return prefix + cyrb53(text, 1).toString(36).padStart(11, '0') + cyrb53(text, 2).toString(36).padStart(11, '0');
}

// A sessão padrão de um aparelho sem sessões (spec 5.5): o mesmo id em todo aparelho novo, e o sync as junta.
export const defaultSessionId = (event: string): string => `default-${event}`;
```

- [ ] **Step 4: Os ids do csTimer**

O id do solve sai do evento, do instante, do tempo e do embaralhamento; o da sessão, do evento, do nome e do instante do primeiro solve dela no arquivo (decisão 13). O mesmo arquivo dá os mesmos ids em qualquer aparelho, e o sync junta em vez de duplicar.

Em `app/src/data/transfer.ts`:

1. Troque:

```ts
import { algChoiceFrom, lessonAtFrom, practiceFrom, trainOffFrom } from '../core/trail/validate';
import type { EventId, FinishId, Penalty, Session, Settings, Solve } from '../core/types';
import { T, TRAIL } from '../strings';
import type { KlickExport, ProfilePatch } from './repository';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
```

por:

```ts
import { algChoiceFrom, lessonAtFrom, practiceFrom, trainOffFrom } from '../core/trail/validate';
import type { EventId, FinishId, Penalty, Session, Settings, Solve } from '../core/types';
import { T, TRAIL } from '../strings';
import { derivedId } from './ids';
import type { KlickExport, ProfilePatch } from './repository';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
```

2. Troque:

```ts
// exato, exportar para o csTimer e importar o arquivo de volta duplicaria tudo.
const timeKey = (ms: number, at: number): string => `${ms}@${Math.floor(at / 1000)}`;

// Cada sessão do arquivo vira uma sessão nova. Fica de fora a que não tem evento (nem do tipo de embaralhamento, nem do
// mapeamento) e a que só traz solves que já existem; os que já existem (inclusive os excluídos, como vieram em ctx) ou se
// repetem no próprio arquivo contam em `duplicates`.
export function csTimerToKlick(
  parsed: CsTimerSession[],
  mapping: Record<string, EventId | undefined>,
  ctx: { now: number; newId: () => string; existingSessions: Session[]; existingSolves: Solve[] },
): ImportResult {
  const result: ImportResult = { sessions: [], solves: [], duplicates: 0, skippedSessions: 0 };
  const seen = new Set(ctx.existingSolves.map((s) => timeKey(s.ms, s.at)));
```

por:

```ts
// exato, exportar para o csTimer e importar o arquivo de volta duplicaria tudo.
const timeKey = (ms: number, at: number): string => `${ms}@${Math.floor(at / 1000)}`;

// Os ids vêm do próprio dado (spec 5.5): o mesmo arquivo importado em dois aparelhos dá os mesmos ids, e o sync junta em vez de
// duplicar. O solve é `cs-` mais um hash do evento, do instante, do tempo e do embaralhamento; a sessão, `cs-s-` mais um hash do
// evento, do nome e do instante do primeiro solve dela no arquivo.
export const csTimerSolveId = (event: EventId, s: Pick<CsTimerSolve, 'at' | 'ms' | 'scramble'>): string => derivedId('cs-', [event, s.at, s.ms, s.scramble]);
const csTimerSessionId = (event: EventId, p: CsTimerSession): string => derivedId('cs-s-', [event, p.name, p.solves[0]?.at ?? 0]);

// Cada sessão do arquivo vira uma sessão (nova, ou a mesma que outro aparelho criou com o mesmo arquivo). Fica de fora a que não tem
// evento (nem do tipo de embaralhamento, nem do mapeamento) e a que só traz solves que já existem; os que já existem (inclusive os
// excluídos, como vieram em ctx) ou se repetem no próprio arquivo contam em `duplicates`.
export function csTimerToKlick(
  parsed: CsTimerSession[],
  mapping: Record<string, EventId | undefined>,
  ctx: { now: number; existingSessions: Session[]; existingSolves: Solve[] },
): ImportResult {
  const result: ImportResult = { sessions: [], solves: [], duplicates: 0, skippedSessions: 0 };
  const seen = new Set(ctx.existingSolves.map((s) => timeKey(s.ms, s.at)));
```

3. Troque:

```ts
      fresh.push(s);
    }
    if (fresh.length === 0) continue;
    const sessionId = ctx.newId();
    result.sessions.push({ id: sessionId, name: p.name, event, order: order++, createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null });
    for (const s of fresh) {
      result.solves.push({
        id: ctx.newId(), sessionId, event, ms: s.ms, penalty: s.penalty, at: s.at, scramble: s.scramble, note: s.note,
        createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null,
      });
    }
```

por:

```ts
      fresh.push(s);
    }
    if (fresh.length === 0) continue;
    const sessionId = csTimerSessionId(event, p);
    result.sessions.push({ id: sessionId, name: p.name, event, order: order++, createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null });
    for (const s of fresh) {
      result.solves.push({
        id: csTimerSolveId(event, s), sessionId, event, ms: s.ms, penalty: s.penalty, at: s.at, scramble: s.scramble, note: s.note,
        createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null,
      });
    }
```

- [ ] **Step 5: Restaurar como gravação, puro**

O mesmo do servidor (Task 17): cada registro da cópia com a data `stamp`; o que existe e não está nela, com marca de exclusão; as chaves da conta, todas, com a data nova (as que existem aqui e não estão nela voltam ao padrão). Uma cópia sem treino (`practice: null`) não mexe no treino daqui.

Crie `app/src/core/sync/restore.ts`:

```ts
// Restaurar uma cópia como gravação (spec 5.5 e 8.3), o mesmo no aparelho e no servidor. Cada registro da cópia é gravado de novo com
// a data `stamp`; o que existe agora e não está na cópia ganha marca de exclusão. Nada é apagado: a restauração viaja pelo sync como
// qualquer gravação, e a lixeira e as cópias a desfazem.
import { defaultPrefValue } from './prefs';
import { toChange, type RecordStore, type StampedRecord } from './records';
import { syncKey, type Change } from './types';

export interface RestoreCopy {
  sessions: readonly object[]; // os registros do arquivo do Klick (sem deletionStamp)
  solves: readonly object[];
  practice: readonly object[] | null; // null: uma cópia de antes do treino, e o treino daqui fica como está
}

// `prefs`: as chaves da conta restaurada, todas (prefsFromProfile com withDefaults), ou null para não mexer nos itens da conta. Uma chave
// que existe aqui e não está nelas (uma aula, uma escolha, um caso fora) volta ao valor padrão.
export function restoreChanges(current: readonly Change[], copy: RestoreCopy, prefs: ReadonlyMap<string, unknown> | null, stamp: number): Change[] {
  const out: Change[] = [];
  const inCopy = new Set<string>();
  const put = (store: RecordStore, list: readonly object[]): void => {
    for (const rec of list) {
      const r = rec as { id: string; deletedAt?: number | null };
      inCopy.add(syncKey(store, r.id));
      const stamped = { ...rec, id: r.id, updatedAt: stamp, deletedAt: r.deletedAt ?? null, deletionStamp: stamp } as StampedRecord;
      out.push(toChange(store, stamped));
    }
  };
  put('sessions', copy.sessions);
  put('solves', copy.solves);
  if (copy.practice) put('practice', copy.practice);
  for (const c of current) {
    if (c.store === 'prefs' || (c.store === 'practice' && copy.practice === null)) continue;
    if (c.deletedAt !== null || inCopy.has(syncKey(c.store, c.id))) continue;
    out.push({ ...c, updatedAt: stamp, deletedAt: stamp, deletionStamp: stamp });
  }
  if (prefs) {
    for (const [key, value] of prefs) out.push({ store: 'prefs', id: key, data: value, updatedAt: stamp, deletedAt: null, deletionStamp: stamp });
    for (const c of current) {
      if (c.store === 'prefs' && !prefs.has(c.id)) out.push({ ...c, data: defaultPrefValue(c.id), updatedAt: stamp, deletionStamp: stamp });
    }
  }
  return out;
}
```

- [ ] **Step 6: O repositório**

Em `app/src/data/repository.ts`:

1. Troque:

```ts
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { canonicalJson } from '../core/sync/merge';
import { defaultPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import { syncKey, type DeviceProfile, type PrefItem, type SyncState, type SyncStore } from '../core/sync/types';
import { practiceFrom } from '../core/trail/validate';
import { defaultSettings } from '../core/types';
import type { EventId, KlickExport, Meta, Penalty, Practice, Profile, ProfilePatch, SeasonRecord, SeasonState, Session, Solve } from '../core/types';
```

por:

```ts
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { canonicalJson } from '../core/sync/merge';
import { defaultPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import { changeToPref, fromChange, prefToChange, toChange } from '../core/sync/records';
import { restoreChanges } from '../core/sync/restore';
import { syncKey, type Change, type DeviceProfile, type PrefItem, type SyncState, type SyncStore } from '../core/sync/types';
import { practiceFrom } from '../core/trail/validate';
import { defaultSettings } from '../core/types';
import type { EventId, KlickExport, Meta, Penalty, Practice, Profile, ProfilePatch, SeasonRecord, SeasonState, Session, Solve } from '../core/types';
```

2. Troque:

```ts

export interface Repository {
  listSessions(o?: { includeDeleted?: boolean }): Promise<Session[]>; // ordenadas por order
  createSession(o: { event: EventId; name?: string }): Promise<Session>; // nome padrão "Sessão N" por evento
  renameSession(id: string, name: string): Promise<void>; // ignora nome vazio
  deleteSession(id: string): Promise<void>; // marca a sessão e os solves dela
  restoreSession(id: string): Promise<void>; // restaura a sessão e os solves excluídos junto
```

por:

```ts

export interface Repository {
  listSessions(o?: { includeDeleted?: boolean }): Promise<Session[]>; // ordenadas por order
  // Nome padrão "Sessão N" por evento. `id` é o da sessão padrão (defaultSessionId): vale se ainda não existe registro com ele; senão, um novo.
  createSession(o: { event: EventId; name?: string; id?: string }): Promise<Session>;
  renameSession(id: string, name: string): Promise<void>; // ignora nome vazio
  deleteSession(id: string): Promise<void>; // marca a sessão e os solves dela
  restoreSession(id: string): Promise<void>; // restaura a sessão e os solves excluídos junto
```

3. Troque:

```ts
  getBackup(id: string): Promise<BackupRecord | undefined>;
  deleteBackup(id: string): Promise<void>;
  exportAll(o?: { includeDeleted?: boolean }): Promise<KlickExport>; // includeDeleted padrão true
  importAll(data: KlickExport): Promise<ImportReport>; // junta por id; fica o de updatedAt maior. Sessão da lixeira que recebe solve ativo do arquivo volta (sem entrar no relatório; avisa sessions). O perfil do arquivo vale por cima do daqui (ver importAll). O treino junta pelo id, sem duplicar (fora do relatório)
  replaceAll(data: KlickExport): Promise<void>; // limpa solves, sessões e perfil e grava os do arquivo; a temporada fica a mais adiantada (a daqui ou a do arquivo). O treino troca junto, se o arquivo o tiver
  onChange(fn: ChangeListener): () => void; // mudanças locais e de outras abas, com a origem (e, nos solves, os ids que mudaram)
  getSolves(ids: readonly string[]): Promise<(Solve | undefined)[]>; // vários solves por id numa leitura; o que não existe vem undefined
  // O treino (spec do sub-projeto 4, seção 9.1). Cada escrita avisa 'practice'. A tela só usa update e delete na correção da última.
```

por:

```ts
  getBackup(id: string): Promise<BackupRecord | undefined>;
  deleteBackup(id: string): Promise<void>;
  exportAll(o?: { includeDeleted?: boolean }): Promise<KlickExport>; // includeDeleted padrão true
  importAll(data: KlickExport): Promise<ImportReport>; // junta por id; fica o de updatedAt maior, em solves e sessões (spec 5.5). Sessão da lixeira que recebe solve ativo do arquivo volta (sem entrar no relatório; avisa sessions). O perfil do arquivo vale por cima do daqui (ver importAll). O treino junta pelo id, sem duplicar (fora do relatório)
  // Restaura a cópia como gravação (spec 5.5): cada registro dela é gravado de novo, com a data do relógio; o que existe aqui e não está nela
  // vai para a lixeira; tudo entra na fila de saída. A temporada fica a mais adiantada (a daqui ou a da cópia). O treino troca junto, se a
  // cópia o tiver.
  replaceAll(data: KlickExport): Promise<void>;
  onChange(fn: ChangeListener): () => void; // mudanças locais e de outras abas, com a origem (e, nos solves, os ids que mudaram)
  getSolves(ids: readonly string[]): Promise<(Solve | undefined)[]>; // vários solves por id numa leitura; o que não existe vem undefined
  // O treino (spec do sub-projeto 4, seção 9.1). Cada escrita avisa 'practice'. A tela só usa update e delete na correção da última.
```

4. Troque:

```ts
      return all.filter((s) => includeDeleted || s.deletedAt === null).map(bareSession).sort(bySessionOrder);
    },

    async createSession({ event, name }) {
      const session = await syncWrite(['sessions'], async (tx, ctx) => {
        const store = tx.objectStore('sessions');
        const all = await store.getAll();
        const at = ctx.stamp();
        // A numeração parte do maior "Sessão N" entre as sessões ativas do evento.
        const lastNumber = Math.max(0, ...all.filter((s) => s.event === event && s.deletedAt === null).map((s) => T.session.defaultNameNumber(s.name) ?? 0));
        const created: StoredSession = {
          id: newId(at),
          name: name?.trim() || T.session.defaultName(lastNumber + 1),
          event,
          order: Math.max(-1, ...all.map((s) => s.order)) + 1,
```

por:

```ts
      return all.filter((s) => includeDeleted || s.deletedAt === null).map(bareSession).sort(bySessionOrder);
    },

    async createSession({ event, name, id }) {
      const session = await syncWrite(['sessions'], async (tx, ctx) => {
        const store = tx.objectStore('sessions');
        const all = await store.getAll();
        const at = ctx.stamp();
        const free = id !== undefined && !all.some((s) => s.id === id);
        // A numeração parte do maior "Sessão N" entre as sessões ativas do evento.
        const lastNumber = Math.max(0, ...all.filter((s) => s.event === event && s.deletedAt === null).map((s) => T.session.defaultNameNumber(s.name) ?? 0));
        const created: StoredSession = {
          id: free ? id : newId(at),
          name: name?.trim() || T.session.defaultName(lastNumber + 1),
          event,
          order: Math.max(-1, ...all.map((s) => s.order)) + 1,
```

5. Troque:

```ts
        const solves = tx.objectStore('solves');
        const practice = tx.objectStore('practice');

        // Sessão que já existe fica como está (e não conta); só entram as novas.
        const knownSessions = new Set(await sessions.getAllKeys());
        const newSessions: Session[] = [];
        for (const s of data.sessions) {
          if (knownSessions.has(s.id)) continue;
          knownSessions.add(s.id);
          newSessions.push(s);
        }
        report.sessionsAdded = newSessions.length;
        await each(newSessions, (s) => sessions.put({ ...s, deletionStamp: importedStamp(undefined, s) }));
        await each(newSessions, (s) => ctx.track('sessions', s.id));

        // Solve por id: entra o que não existe, substitui o de updatedAt menor, e o resto é pulado.
        const knownSolves = new Map<string, StoredSolve>();
```

por:

```ts
        const solves = tx.objectStore('solves');
        const practice = tx.objectStore('practice');

        // Sessão por id, como o solve (spec 5.5): entra a nova (e conta), substitui a de updatedAt menor (renomear e excluir no outro
        // aparelho chegam), e o resto fica como está.
        const knownSessions = new Map<string, StoredSession>();
        for (const s of await sessions.getAll()) knownSessions.set(s.id, s);
        const sessionWrites: StoredSession[] = [];
        for (const s of data.sessions) {
          const have = knownSessions.get(s.id);
          if (have !== undefined && s.updatedAt <= have.updatedAt) continue;
          if (have === undefined) report.sessionsAdded++;
          const stored: StoredSession = { ...s, deletionStamp: importedStamp(have, s) };
          knownSessions.set(s.id, stored);
          sessionWrites.push(stored);
        }
        await each(sessionWrites, (s) => sessions.put(s));
        await each(sessionWrites, (s) => ctx.track('sessions', s.id));

        // Solve por id: entra o que não existe, substitui o de updatedAt menor, e o resto é pulado.
        const knownSolves = new Map<string, StoredSolve>();
```

6. Troque:

```ts
        const newPractice = practiceFrom(data.practice).filter((p) => !knownPractice.has(p.id));
        await each(newPractice, (p) => practice.put({ ...p, updatedAt: p.at, deletedAt: null, deletionStamp: p.at }));
        await each(newPractice, (p) => ctx.track('practice', p.id));
        return { profileSaved, sessionBack, practiceAdded: newPractice.length };
      });
      const changed = report.sessionsAdded + report.solvesAdded + report.solvesUpdated + outcome.practiceAdded > 0;
      if (outcome.profileSaved || changed) announce('all');
      if (outcome.sessionBack) announce('sessions');
      return report;
    },

    async replaceAll(data) {
      const { sessions, solves, profile } = data;
      // Uma cópia de antes do treino (sem `practice`, ou com algo que não é lista) não apaga o treino daqui; com a lista, mesmo vazia, o
      // treino é o dela.
      const practice = Array.isArray(data.practice) ? practiceFrom(data.practice) : null;
      await syncWrite(['sessions', 'solves', 'profile', 'prefs', 'practice'], async (tx, ctx) => {
        const sessionStore = tx.objectStore('sessions');
        const solveStore = tx.objectStore('solves');
        const profileStore = tx.objectStore('profile');
        const prefsStore = tx.objectStore('prefs');
        const practiceStore = tx.objectStore('practice');
        // O perfil daqui é lido antes de limpar: a restauração fica com a temporada mais adiantada (spec 5.6), mesmo que a cópia não
        // tenha perfil, e uma cópia sem perfil também não tira o acabamento que a pessoa escolheu.
        const local = await storedProfile(tx);
        const mine = local.season;
        await Promise.all([sessionStore.clear(), solveStore.clear(), profileStore.clear(), prefsStore.clear(), ...(practice ? [practiceStore.clear()] : [])]);
        await each(sessions, (s) => sessionStore.put({ ...s, deletionStamp: importedStamp(undefined, s) }));
        await each(solves, (s) => solveStore.put({ ...s, deletionStamp: importedStamp(undefined, s) }));
        if (practice) await each(practice, (p) => practiceStore.put({ ...p, updatedAt: p.at, deletedAt: null, deletionStamp: p.at }));
        // O que é do treino e a cópia não traz (uma cópia de antes do treino) fica o daqui.
        const kept: ProfilePatch = { lessonAt: local.lessonAt, algChoice: local.algChoice, trainOff: local.trainOff };
        const restored = profile ? mergeProfile(defaultProfile(), { ...kept, ...profile }) : null;
        const season = moreAdvanced(mine, seasonFrom(profile?.season));
        // Sem perfil na cópia e sem temporada a guardar, o perfil fica vazio (os padrões), como sempre foi. Sem perfil na cópia e com
        // temporada a guardar, o perfil é o padrão com o acabamento daqui; com perfil, vale o acabamento da cópia. Nos dois, só se
        // estiver liberado pelas temporadas fechadas.
        if (restored || season.past.length > 0) {
          const base = restored ?? mergeProfile(defaultProfile(), { ...kept, finish: local.finish });
          const finish = finishUnlocked(base.finish, season.past.length) ? base.finish : 'fosco';
          await writeProfile(tx, defaultProfile(), { ...base, season, finish }, ctx);
        }
      });
      announce('all');
    },
```

por:

```ts
        const newPractice = practiceFrom(data.practice).filter((p) => !knownPractice.has(p.id));
        await each(newPractice, (p) => practice.put({ ...p, updatedAt: p.at, deletedAt: null, deletionStamp: p.at }));
        await each(newPractice, (p) => ctx.track('practice', p.id));
        return { profileSaved, sessionBack, practiceAdded: newPractice.length, sessionsWritten: sessionWrites.length };
      });
      const changed = outcome.sessionsWritten + report.solvesAdded + report.solvesUpdated + outcome.practiceAdded > 0;
      if (outcome.profileSaved || changed) announce('all');
      if (outcome.sessionBack) announce('sessions');
      return report;
    },

    async replaceAll(data) {
      const { profile } = data;
      // Uma cópia de antes do treino (sem `practice`, ou com algo que não é lista) não mexe no treino daqui; com a lista, mesmo vazia, o
      // treino é o dela.
      const practice = Array.isArray(data.practice) ? practiceFrom(data.practice) : null;
      await syncWrite(['sessions', 'solves', 'profile', 'prefs', 'practice'], async (tx, ctx) => {
        const [sessions, solves, practices, device, items] = await Promise.all([
          tx.objectStore('sessions').getAll(),
          tx.objectStore('solves').getAll(),
          tx.objectStore('practice').getAll(),
          tx.objectStore('profile').get('current'),
          tx.objectStore('prefs').getAll(),
        ]);
        // A restauração fica com a temporada mais adiantada (spec 5.6), mesmo que a cópia não tenha perfil, e uma cópia sem perfil também
        // não tira o acabamento que a pessoa escolheu.
        const local = composeProfile(device, items);
        // O que é do treino e a cópia não traz (uma cópia de antes do treino) fica o daqui.
        const kept: ProfilePatch = { lessonAt: local.lessonAt, algChoice: local.algChoice, trainOff: local.trainOff };
        const restored = profile ? mergeProfile(defaultProfile(), { ...kept, ...profile }) : null;
        const season = moreAdvanced(local.season, seasonFrom(profile?.season));
        // Sem perfil na cópia e sem temporada a guardar, o perfil volta aos padrões, como sempre foi. Sem perfil na cópia e com temporada a
        // guardar, o perfil é o padrão com o acabamento daqui; com perfil, vale o acabamento da cópia. Nos dois, só se estiver liberado
        // pelas temporadas fechadas.
        const keepsProfile = restored !== null || season.past.length > 0;
        let target = defaultProfile();
        if (keepsProfile) {
          const base = restored ?? mergeProfile(defaultProfile(), { ...kept, finish: local.finish });
          target = { ...base, season, finish: finishUnlocked(base.finish, season.past.length) ? base.finish : 'fosco' };
        }
        const current: Change[] = [
          ...sessions.map((s) => toChange('sessions', s)),
          ...solves.map((s) => toChange('solves', s)),
          ...practices.map((p) => toChange('practice', p)),
          ...items.map(prefToChange),
        ];
        const copy = { sessions: data.sessions, solves: data.solves, practice };
        const changes = restoreChanges(current, copy, prefsFromProfile(splitProfile(target).account, { withDefaults: true }), ctx.stamp());
        for (const c of changes) {
          if (c.store === 'prefs') await tx.objectStore('prefs').put(changeToPref(c));
          else if (c.store === 'solves') await tx.objectStore('solves').put(fromChange<StoredSolve>(c));
          else if (c.store === 'sessions') await tx.objectStore('sessions').put(fromChange<StoredSession>(c));
          else await tx.objectStore('practice').put(fromChange<StoredPractice>(c));
          await ctx.track(c.store, c.id);
        }
        if (keepsProfile) await tx.objectStore('profile').put(splitProfile(target).device, 'current');
        else await tx.objectStore('profile').delete('current');
      });
      announce('all');
    },
```

- [ ] **Step 7: A sessão padrão no app**

Em `app/src/ui/state/app.svelte.ts`:

1. Troque:

```ts
import type { EventId, Meta, Penalty, Practice, Profile, SeasonState, Session, Solve } from '../../core/types';
import type { BackupRecord } from '../../data/db';
import { backupFileName, type DirHandleLike, folderGranted, pickFolder, saveToFolder } from '../../data/folder';
import { newId } from '../../data/ids';
import type { ChangeKind, KlickExport, NewSolve, ProfilePatch, Repository } from '../../data/repository';
import {
  countSolveSaved,
```

por:

```ts
import type { EventId, Meta, Penalty, Practice, Profile, SeasonState, Session, Solve } from '../../core/types';
import type { BackupRecord } from '../../data/db';
import { backupFileName, type DirHandleLike, folderGranted, pickFolder, saveToFolder } from '../../data/folder';
import { defaultSessionId, newId } from '../../data/ids';
import type { ChangeKind, KlickExport, NewSolve, ProfilePatch, Repository } from '../../data/repository';
import {
  countSolveSaved,
```

2. Troque:

```ts
        repo,
      );
      const now = this.now();
      const plan = csTimerToKlick(sessions, mapping, { now, newId: () => newId(now), existingSessions, existingSolves });
      const report = await this.repo.importAll({
        format: 'klick',
        version: 1,
```

por:

```ts
        repo,
      );
      const now = this.now();
      const plan = csTimerToKlick(sessions, mapping, { now, existingSessions, existingSolves });
      const report = await this.repo.importAll({
        format: 'klick',
        version: 1,
```

3. Troque:

```ts

  // Sem sessão atual viva: a primeira que sobrou assume (ou uma de 3×3, se não sobrou nenhuma), e a escolha é gravada.
  private async replaceCurrent(): Promise<Session> {
    const session = this.sessions[0] ?? (await this.repo.createSession({ event: DEFAULT_EVENT }));
    await this.repo.saveProfile({ currentSessionId: session.id });
    await this.reload();
    return this.currentSession ?? session;
```

por:

```ts

  // Sem sessão atual viva: a primeira que sobrou assume (ou uma de 3×3, se não sobrou nenhuma), e a escolha é gravada.
  private async replaceCurrent(): Promise<Session> {
    // Sem sessão nenhuma, a padrão tem id fixo por evento (spec 5.5): dois aparelhos novos criam a mesma, e o sync as junta.
    const session = this.sessions[0] ?? (await this.repo.createSession({ event: DEFAULT_EVENT, id: defaultSessionId(DEFAULT_EVENT) }));
    await this.repo.saveProfile({ currentSessionId: session.id });
    await this.reload();
    return this.currentSession ?? session;
```

- [ ] **Step 8: Ajuste os testes que conferiam o comportamento de antes**

Três mudanças que a spec pede (5.5): restaurar uma cópia vazia manda o que existia para a lixeira, em vez de apagar sem rastro; a sessão do arquivo mais novo troca a daqui; e uma cópia sem perfil volta o perfil aos padrões (gravados, para o sync levar), em vez de deixar o perfil vazio.

Em `app/tests/unit/repository.test.ts`:

1. Troque:

```ts
    edited.solves[0].note = 'mais novo';
    edited.solves[0].updatedAt += 10;
    expect((await other.importAll(edited)).solvesUpdated).toBe(1);
    await other.replaceAll({ ...data, solves: [], sessions: [] });
    expect(await other.listSolves({ includeDeleted: true })).toEqual([]);
  });

  it('guarda e lista cópias, mais recente primeiro', async () => {
```

por:

```ts
    edited.solves[0].note = 'mais novo';
    edited.solves[0].updatedAt += 10;
    expect((await other.importAll(edited)).solvesUpdated).toBe(1);
    // Restaurar uma cópia vazia é gravação (spec 5.5): o que existia vai para a lixeira, nada some sem rastro.
    await other.replaceAll({ ...data, solves: [], sessions: [] });
    expect(await other.listSolves()).toEqual([]);
    expect((await other.listTrash()).solves.map((x) => x.id)).toEqual(data.solves.map((x) => x.id));
  });

  it('guarda e lista cópias, mais recente primeiro', async () => {
```

2. Troque:

```ts
    const base = await repo.addSolve(ns(s.id, 60000, 1000));
    const odd: unknown[] = [null, undefined, true, {}];
    const solves = odd.map((sessionId, i) => ({ ...base, id: `estranho-${i}`, sessionId: sessionId as never, deletedAt: t, updatedAt: t }));
    await repo.replaceAll({ format: 'klick', version: 1, exportedAt: t, sessions: [s], solves, profile: null });
    expect((await repo.listTrash()).solves).toHaveLength(odd.length);
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));

    for (const solve of solves) await repo.restoreSolve(solve.id); // sem DataError
    expect((await repo.listSolves()).map((x) => x.id)).toEqual(solves.map((x) => x.id));
    expect((await repo.listTrash()).solves).toEqual([]);
    expect(seen).toEqual(odd.map(() => 'solves')); // nenhuma sessão envolvida, nenhum aviso de sessions
  });
```

por:

```ts
    const base = await repo.addSolve(ns(s.id, 60000, 1000));
    const odd: unknown[] = [null, undefined, true, {}];
    const solves = odd.map((sessionId, i) => ({ ...base, id: `estranho-${i}`, sessionId: sessionId as never, deletedAt: t, updatedAt: t }));
    await repo.replaceAll({ format: 'klick', version: 1, exportedAt: t, sessions: [s], solves: [base, ...solves], profile: null });
    expect((await repo.listTrash()).solves).toHaveLength(odd.length);
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));

    for (const solve of solves) await repo.restoreSolve(solve.id); // sem DataError
    expect((await repo.listSolves()).map((x) => x.id)).toEqual([base.id, ...solves.map((x) => x.id)]);
    expect((await repo.listTrash()).solves).toEqual([]);
    expect(seen).toEqual(odd.map(() => 'solves')); // nenhuma sessão envolvida, nenhum aviso de sessions
  });
```

3. Troque:

```ts
    expect(p?.settings).toEqual({ ...DEFAULT_SETTINGS, holdMs: 450 });
  });

  it('importar não troca a sessão que já existe, mesmo com o arquivo mais novo, e não a conta', async () => {
    const s = await repo.createSession({ event: '333', name: 'Original' });
    const data = await repo.exportAll();
    const other = await fresh();
```

por:

```ts
    expect(p?.settings).toEqual({ ...DEFAULT_SETTINGS, holdMs: 450 });
  });

  it('importar troca a sessão que já existe quando o arquivo é mais novo (spec 5.5), sem contá-la como nova', async () => {
    const s = await repo.createSession({ event: '333', name: 'Original' });
    const data = await repo.exportAll();
    const other = await fresh();
```

4. Troque:

```ts
    renamed.sessions[0].name = 'Renomeada';
    renamed.sessions[0].updatedAt += 10;
    expect(await other.importAll(renamed)).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 });
    expect((await other.listSessions())[0]).toMatchObject({ id: s.id, name: 'Original' });
  });

  it('importar traz a exclusão mais nova, pula o mais velho e junta solves repetidos no arquivo', async () => {
```

por:

```ts
    renamed.sessions[0].name = 'Renomeada';
    renamed.sessions[0].updatedAt += 10;
    expect(await other.importAll(renamed)).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 });
    expect((await other.listSessions())[0]).toMatchObject({ id: s.id, name: 'Renomeada' });
    expect(await other.importAll(data)).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 }); // o mais velho não volta
    expect((await other.listSessions())[0]).toMatchObject({ name: 'Renomeada' });
  });

  it('importar traz a exclusão mais nova, pula o mais velho e junta solves repetidos no arquivo', async () => {
```

5. Troque:

```ts
    expect(await repo.getFolderHandle()).toEqual({ name: 'pasta' });

    await repo.replaceAll({ format: 'klick', version: 1, exportedAt: t, sessions: [], solves: [], profile: null });
    expect((await repo.exportAll()).profile).toBeNull(); // o arquivo sem perfil limpa o perfil
  });

  it('importar com um solve inválido no meio desfaz tudo: nada do arquivo entra e nada do que já existia muda', async () => {
```

por:

```ts
    expect(await repo.getFolderHandle()).toEqual({ name: 'pasta' });

    await repo.replaceAll({ format: 'klick', version: 1, exportedAt: t, sessions: [], solves: [], profile: null });
    expect(await repo.getProfile()).toEqual(await (await fresh()).getProfile()); // o arquivo sem perfil volta o perfil aos padrões
  });

  it('importar com um solve inválido no meio desfaz tudo: nada do arquivo entra e nada do que já existia muda', async () => {
```

- [ ] **Step 9: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/repository-restore.test.ts tests/unit/transfer.test.ts tests/unit/repository.test.ts`
Expected: PASS (5 + 265 + 98 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

Run: `pnpm test:e2e`
Expected: PASS (a suíte inteira: nada mudou para quem não tem conta).

- [ ] **Step 10: Commit**

```bash
git add src/core/sync/restore.ts src/data/ids.ts src/data/transfer.ts src/data/repository.ts src/ui/state/app.svelte.ts tests/unit/repository-restore.test.ts tests/unit/repository.test.ts tests/unit/transfer.test.ts
git commit -m "feat(app): ids derivados do csTimer, sessão padrão fixa, import por recência e restaurar como gravação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Portão A: A etapa 2 vai ao beta e, com o ok do Ranielli, à raiz

Spec: seções 12 (etapa 2: "pode ir à raiz sem nada de servidor, e ninguém percebe; a partir daí não tem volta") e 15 (a migração v3 não tem volta).

O `wrangler.jsonc` ainda é o de hoje (só arquivos): este é o último deploy antes do Worker ganhar script. A raiz muda o banco de todo mundo para a versão 3, sem volta: **PARE e peça o ok**.

- [ ] **Step 1: Os portões de qualidade**

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test:e2e`
Expected: PASS (nada mudou na tela).

- [ ] **Step 2: O beta**

Run: `pnpm build && npx wrangler deploy`
Expected: o deploy de `klick-app-beta` termina. Abra `https://beta.klick.ranimontagna.com` num navegador que já usava o beta: os solves, a lixeira, a trilha, as temporadas e o treino estão como antes, e Ajustes > Cópias automáticas mostra "Antes da atualização para a conta e o sync".

- [ ] **Step 3: PARE. Pergunte ao Ranielli**

Mande, nestas palavras ou parecidas: "A versão 3 do banco está no beta (sem nada de servidor; ninguém percebe). Antes de abrir, o app guarda uma cópia 'antes da v3'. Depois de ir à raiz, não dá para voltar o deploy para a versão anterior (o navegador recusa abrir um banco mais novo). Posso publicar na raiz agora?"

- **Com o ok:** `npx wrangler deploy --env production` e confira `https://klick.ranimontagna.com` como no Step 2.
- **Sem o ok (ou sem resposta):** a raiz fica como está, e o plano segue: as próximas tarefas não dependem dela.

---

### Task 7: O Worker ganha um script: /api/health e a chave ACCOUNTS_ENABLED

Spec: seções 8.1 e 8.4; decisões 1 e 18 do começo deste plano.

**Files:**
- Create: `app/worker/env.ts`, `app/worker/router.ts`, `app/worker/index.ts`, `app/worker/tsconfig.json`
- Create: `app/vitest.worker.config.ts`
- Create: `app/tests/worker/env.d.ts`, `app/tests/worker/tsconfig.json`, `app/tests/worker/helpers.ts` (apoio; não é arquivo de teste)
- Modify: `app/wrangler.jsonc` (o arquivo inteiro: `main`, `nodejs_compat`, `observability`, o binding `ASSETS` com `run_worker_first: ["/api/*"]` e as variáveis de cada ambiente)
- Modify: `app/package.json` (as três dependências de desenvolvimento e os scripts), `app/tsconfig.app.json`, `app/tsconfig.node.json`, `app/.gitignore`
- Test: `app/tests/worker/health.test.ts`, `app/tests/unit/wrangler-config.test.ts`

**Interfaces:**
- Produces (em `worker/env.ts`): `Env { ASSETS: Fetcher; ACCOUNTS_ENABLED: string; APP_ORIGIN: string; TURNSTILE_SITE_KEY: string; MAIL_FROM: string }` (as tarefas seguintes acrescentam campos).
- Produces (em `worker/router.ts`): `Deps { now: () => number }` (cresce nas tarefas seguintes), `defaultDeps(env: Env): Deps`, `accountsOn(env: Env): boolean`, `handle(request: Request, env: Env, ctx: ExecutionContext, deps: Deps): Promise<Response>`. `/api/health` responde `{ ok: true, accounts, turnstileSiteKey }` (a site key só com a conta ligada), com `Cache-Control: no-store`; com `ACCOUNTS_ENABLED` diferente de `'true'`, o resto de `/api` é 404; o que não é `/api` vai para `env.ASSETS`.
- Produces (em `tests/worker/helpers.ts`): `ORIGIN`, `T0`, `testEnv(over?)` (a conta ligada), `testDeps(over?)`, `call(path, init?, o?: { env?; deps? })`, `postJson(body, headers?)`.

O app passa a perguntar `/api/health` na Task 13; até lá, nada no app muda. No `vite preview` dos ponta a ponta de sempre, `/api/health` devolve o `index.html`, e o app entende "sem servidor".

- [ ] **Step 1: As dependências de desenvolvimento**

Run: `pnpm add -D -E wrangler@4.149.0 @cloudflare/vitest-plugin@1.4.0 @cloudflare/workers-types@5.20261004.1`
Expected: o `package.json` ganha as três, sem `^`, e o `pnpm-lock.yaml` muda. (O `@cloudflare/vitest-plugin` 1.4.0 é o primeiro que aceita o Vitest 5; ele traz o wrangler 4.149.0, a mesma versão fixada aqui.)

- [ ] **Step 2: O config dos testes do servidor e os scripts**

Os testes do servidor rodam dentro do workerd, com o `wrangler.jsonc` de verdade; o `pnpm test` (jsdom) não os vê, e o `tsconfig.app.json` os deixa de fora (têm os tipos do runtime, não os do navegador).

Crie `app/vitest.worker.config.ts`:

```ts
import { mkdirSync } from 'node:fs';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Os testes do servidor (spec 11) rodam dentro do workerd, com o wrangler.jsonc de verdade (o ambiente beta, de cima) e os bancos locais
// do Miniflare. O `pnpm test` (vitest.config.ts, jsdom) não os vê: rodam com `pnpm test:worker`.
export default defineConfig(() => {
  mkdirSync('dist', { recursive: true }); // a pasta dos arquivos do app: o plugin pede que ela exista; os testes não precisam do build
  return {
    plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
    test: { include: ['tests/worker/**/*.test.ts'] },
  };
});
```

Em `app/package.json`, troque os scripts:

```json
    "test:e2e": "playwright test",
    "check": "svelte-check --tsconfig ./tsconfig.app.json && tsc -p tsconfig.node.json"
  },
```

por:

```json
    "test:e2e": "playwright test",
    "check": "svelte-check --tsconfig ./tsconfig.app.json && tsc -p tsconfig.node.json && tsc -p worker/tsconfig.json && tsc -p tests/worker/tsconfig.json",
    "test:worker": "vitest run -c vitest.worker.config.ts"
  },
```

Em `app/tsconfig.app.json`:

Troque:

```json
    "moduleDetection": "force",
    "strict": true
  },
  "include": ["src/**/*.ts", "src/**/*.js", "src/**/*.svelte", "tests/**/*.ts"]
}
```

por:

```json
    "moduleDetection": "force",
    "strict": true
  },
  "include": ["src/**/*.ts", "src/**/*.js", "src/**/*.svelte", "tests/**/*.ts"],
  // Os testes do Worker rodam no workerd, com os tipos dele (tests/worker/tsconfig.json).
  "exclude": ["tests/worker"]
}
```

Em `app/tsconfig.node.json`:

Troque:

```json
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

por:

```json
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "vitest.worker.config.ts", "playwright.config.ts"]
}
```

Em `app/.gitignore`:

Troque:

```
dist-ssr
*.local

# Klick: cubing.js empacotado (gerado), relatórios do Playwright, build
public/vendor/
test-results/
playwright-report/
dist/
```

por:

```
dist-ssr
*.local

# Klick: cubing.js empacotado (gerado), relatórios do Playwright, build, o estado local do wrangler e os segredos locais
public/vendor/
.wrangler/
.dev.vars*
test-results/
playwright-report/
dist/
```

- [ ] **Step 3: Escreva os testes que falham**

Crie `app/tests/worker/env.d.ts`:

```ts
// O env dos testes do Worker (`env` de cloudflare:workers): as ligações do wrangler.jsonc, o tipo de worker/env.ts.
type KlickWorkerEnv = import('../../worker/env').Env;

declare namespace Cloudflare {
  interface Env extends KlickWorkerEnv {}
}
```

Crie `app/tests/worker/tsconfig.json`:

```json
{
  // Os testes do Worker rodam dentro do workerd (vitest.worker.config.ts): os tipos do runtime e os de cloudflare:test.
  "compilerOptions": {
    "target": "es2023",
    "lib": ["es2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-plugin/types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["./**/*.ts", "../../worker/**/*.ts"]
}
```

Crie `app/tests/worker/helpers.ts`:

```ts
// Apoio dos testes do Worker: chama o router como o Worker chamaria, com o env do wrangler.jsonc (conta ligada) e as trocas de cada teste.
// Não é um arquivo de teste.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Env } from '../../worker/env';
import { handle, type Deps } from '../../worker/router';

export const ORIGIN = 'https://beta.klick.ranimontagna.com';
export const T0 = 1_791_500_000_000;

export function testEnv(over: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', ...over };
}

export function testDeps(over: Partial<Deps> = {}): Deps {
  return { now: () => T0, ...over };
}

export async function call(path: string, init: RequestInit = {}, o: { env?: Env; deps?: Deps } = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await handle(new Request(ORIGIN + path, init), o.env ?? testEnv(), ctx, o.deps ?? testDeps());
  await waitOnExecutionContext(ctx);
  return res;
}

export const postJson = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
  body: JSON.stringify(body),
});
```

Crie `app/tests/worker/health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { call, testEnv } from './helpers';

describe('/api/health e a chave ACCOUNTS_ENABLED (spec 8.4)', () => {
  it('com a conta ligada, diz que está ligada e manda a site key do Turnstile', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, accounts: true, turnstileSiteKey: '1x00000000000000000000BB' });
  });

  it('com a conta desligada, /api/health responde e o resto de /api é 404', async () => {
    const off = testEnv({ ACCOUNTS_ENABLED: 'false' });
    expect(await (await call('/api/health', {}, { env: off })).json()).toEqual({ ok: true, accounts: false, turnstileSiteKey: null });
    expect((await call('/api/sync', { method: 'POST' }, { env: off })).status).toBe(404);
    expect((await call('/api/auth/get-session', {}, { env: off })).status).toBe(404);
  });

  it('o que não é /api vai para os arquivos do app', async () => {
    const seen: string[] = [];
    const assets = {
      fetch: async (r: Request) => {
        seen.push(new URL(r.url).pathname);
        return new Response('app');
      },
    } as unknown as Fetcher;
    const res = await call('/evolucao', {}, { env: testEnv({ ASSETS: assets }) });
    expect(await res.text()).toBe('app');
    expect(seen).toEqual(['/evolucao']);
  });
});
```

Crie `app/tests/unit/wrangler-config.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// O wrangler.jsonc vai para o repositório público: nenhum segredo nele, e a conta desligada na raiz até o ok do Ranielli (spec 8.4).
const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../wrangler.jsonc'), 'utf8');
const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
  vars: Record<string, string>;
  assets: { run_worker_first: string[] };
  env: { production: { vars: Record<string, string>; assets: { run_worker_first: string[] } } };
};
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];

describe('wrangler.jsonc', () => {
  it('a conta fica desligada na raiz', () => {
    expect(config.env.production.vars.ACCOUNTS_ENABLED).toBe('false');
  });

  it('nenhum segredo (nem a caixa do ponta a ponta) nas variáveis de nenhum ambiente', () => {
    for (const vars of [config.vars, config.env.production.vars]) for (const name of SECRETS) expect(vars).not.toHaveProperty(name);
    expect(text).not.toMatch(/re_[A-Za-z0-9]{8,}/); // uma chave do Resend colada por engano
  });

  it('o script roda antes dos arquivos só em /api/*', () => {
    expect(config.assets.run_worker_first).toEqual(['/api/*']);
    expect(config.env.production.assets.run_worker_first).toEqual(['/api/*']);
  });
});
```

- [ ] **Step 4: Rode os testes e confira que falham**

Run: `pnpm test:worker`
Expected: FAIL: o `wrangler.jsonc` ainda não tem `main` (o plugin recusa o config) ou `Failed to resolve import "../../worker/router"`.

Run: `pnpm exec vitest run tests/unit/wrangler-config.test.ts`
Expected: FAIL: o `wrangler.jsonc` de hoje não tem `vars` nem `run_worker_first`.

- [ ] **Step 5: O Worker**

Crie `app/worker/env.ts`:

```ts
// As ligações do Worker (wrangler.jsonc, spec 8.1 e 8.4). Os segredos chegam por `wrangler secret put`, por ambiente; nos testes, pelo
// vitest.worker.config.ts. O repositório é público: aqui só há nomes.
export interface Env {
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
  MAIL_FROM: string;
}
```

Crie `app/worker/router.ts`:

```ts
// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// O que não é /api são os arquivos do app. Os logs levam só ids, contagens, durações e erros (spec 8.5).
import type { Env } from './env';

export interface Deps {
  now: () => number;
}

export function defaultDeps(_env: Env): Deps {
  return { now: () => Date.now() };
}

const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string): Response => json({ error }, status);
export const accountsOn = (env: Env): boolean => env.ACCOUNTS_ENABLED === 'true';

export async function handle(request: Request, env: Env, _ctx: ExecutionContext, _deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');
  return fail(404, 'not-found');
}
```

Crie `app/worker/index.ts`:

```ts
// O Worker do Klick (spec 8.1): /api para a conta e o sync (router.ts); o resto, os arquivos do app (env.ASSETS), como antes.
import type { Env } from './env';
import { defaultDeps, handle } from './router';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx, defaultDeps(env));
  },
} satisfies ExportedHandler<Env>;
```

Crie `app/worker/tsconfig.json`:

```json
{
  // O Worker e o núcleo que ele importa (src/core), sem os tipos do navegador: só os do runtime da Cloudflare.
  "compilerOptions": {
    "target": "es2023",
    "lib": ["es2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 6: O wrangler.jsonc**

A conta fica desligada nos dois ambientes (`ACCOUNTS_ENABLED: "false"`); a site key é a de teste da Cloudflare (sempre passa) até o Portão C pôr as de verdade.

Substitua `app/wrangler.jsonc` inteiro por:

```jsonc
// Publica o app (dist/) e o servidor da conta e do sync (worker/index.ts) num Worker só (spec 8.1).
// - `npx wrangler deploy`: beta.klick.ranimontagna.com, para conferir antes.
// - `npx wrangler deploy --env production`: a raiz, klick.ranimontagna.com.
// Os dois são domínios próprios do Worker (custom_domain): o Cloudflare cria e mantém o registro DNS de cada um. O script só roda antes
// dos arquivos em /api/* (run_worker_first); o resto sai direto dos arquivos, como antes.
// Cada ambiente tem as próprias ligações (D1, Durable Objects, R2): nada do beta toca os dados da raiz. Os segredos (BETTER_AUTH_SECRET,
// TURNSTILE_SECRET, RESEND_API_KEY) entram só por `npx wrangler secret put NOME [--env production]`: o repositório é público.
{
  "name": "klick-app-beta",
  "account_id": "3a9dc0a9d9f05ff97021ce237e3ed92f",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "worker/index.ts",
  "workers_dev": false,
  "observability": { "enabled": true },
  "routes": [{ "pattern": "beta.klick.ranimontagna.com", "custom_domain": true }],
  "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "vars": {
    "ACCOUNTS_ENABLED": "false",
    "APP_ORIGIN": "https://beta.klick.ranimontagna.com",
    "TURNSTILE_SITE_KEY": "1x00000000000000000000BB",
    "MAIL_FROM": "Klick <nao-responda@klick.ranimontagna.com>"
  },
  "env": {
    "production": {
      "name": "klick-app",
      "workers_dev": false,
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "vars": {
        "ACCOUNTS_ENABLED": "false",
        "APP_ORIGIN": "https://klick.ranimontagna.com",
        "TURNSTILE_SITE_KEY": "1x00000000000000000000BB",
        "MAIL_FROM": "Klick <nao-responda@klick.ranimontagna.com>"
      }
    }
  }
}
```

- [ ] **Step 7: Rode os testes, os tipos e as suítes**

Run: `pnpm test:worker`
Expected: PASS (3 testes; a primeira rodada leva uns 15 s para subir o workerd).

Run: `pnpm exec vitest run tests/unit/wrangler-config.test.ts`
Expected: PASS (3 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

Run: `pnpm test:e2e`
Expected: PASS (o `vite preview` não usa o Worker).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.app.json tsconfig.node.json .gitignore wrangler.jsonc vitest.worker.config.ts worker/env.ts worker/router.ts worker/index.ts worker/tsconfig.json tests/worker/env.d.ts tests/worker/tsconfig.json tests/worker/helpers.ts tests/worker/health.test.ts tests/unit/wrangler-config.test.ts
git commit -m "feat(worker): o Worker ganha script, com /api/health e a chave ACCOUNTS_ENABLED

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: O Durable Object da conta e POST /api/sync

Spec: seções 6.1, 8.1 e 8.2; decisões 6 a 8 do começo deste plano; Review Focus 4.

**Files:**
- Create: `app/worker/account-store.ts`
- Modify: `app/worker/env.ts` (`ACCOUNT`, `API_BURST`), `app/worker/router.ts` (a rota do sync), `app/worker/index.ts` (exporta a classe)
- Modify: `app/wrangler.jsonc` (a migração `new_sqlite_classes`, o binding do objeto e o limite de rajada, nos dois ambientes)
- Modify: `app/tests/worker/helpers.ts` (o limite que sempre deixa passar; quem tem sessão)
- Test: `app/tests/worker/sync.test.ts`

**Interfaces:**
- Consumes: `applyChanges`, `RecordView` (Task 3); `SYNC_BATCH`, `SYNC_PROTOCOL`, `Change`, `SyncRequest`, `SyncResponse` (Task 1).
- Produces (em `worker/account-store.ts`): `class AccountStore extends DurableObject<Env>` com o SQLite da spec 8.2 (mais a coluna `parent`) e `syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse>`.
- Produces (em `worker/router.ts`): `User { id; email }`, `Deps { now; resolveUser(request, env, ctx): Promise<User | null> }`, `MAX_BODY = 2_000_000`, `parseSyncRequest(body: unknown): SyncRequest | 'update' | null`. `POST /api/sync`: 401 sem sessão; 415 sem JSON; 403 de outra origem; 429 na rajada; 413 grande demais; 426 com outra versão do protocolo; 400 torto ou com mais de 500 mudanças; 200 com o `SyncResponse`. O log leva o id da conta, as contagens e a duração.
- Produces (em `tests/worker/helpers.ts`): `allow: RateLimit`; `testDeps({ user })` (quem tem sessão, sem passar pelo login).

Ainda sem login (etapa 3 da spec): o `defaultDeps` não acha sessão nenhuma, e a rota responde 401 fora dos testes. A Task 9 liga o Better Auth.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/worker/sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Change, SyncResponse } from '../../src/core/sync/types';
import { call, postJson, T0, testDeps, testEnv } from './helpers';

const solve = (id: string, o: Partial<Change> & { note?: string; sessionId?: string } = {}): Change => ({
  store: 'solves',
  id,
  data: { sessionId: o.sessionId ?? 's1', event: '333', ms: 9000, penalty: null, at: T0, scramble: "R U R'", note: o.note ?? '', createdAt: T0 },
  updatedAt: o.updatedAt ?? T0,
  deletedAt: o.deletedAt ?? null,
  deletionStamp: o.deletionStamp ?? T0,
});
const session: Change = { store: 'sessions', id: 's1', data: { name: 'Sessão 1', event: '333', order: 0, createdAt: T0 }, updatedAt: T0, deletedAt: null, deletionStamp: T0 };

async function sync(user: string, changes: unknown[], cursor = 0, device = 'd1'): Promise<SyncResponse> {
  const res = await call('/api/sync', postJson({ v: 1, deviceId: device, cursor, clock: T0, changes }), { deps: testDeps({ user }) });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

describe('POST /api/sync (spec 6.1 e 8.2)', () => {
  it('sem sessão, 401', async () => {
    expect((await call('/api/sync', postJson({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: [] }))).status).toBe(401);
  });

  it('aceita o lote, dá revisões e devolve o que mudou desde o cursor; o outro aparelho recebe', async () => {
    const first = await sync('conta-a', [session, solve('x1')]);
    expect(first).toMatchObject({ accepted: 2, rejected: [], cursor: 2, more: false, serverTime: T0 });
    expect(first.changes.map((c) => c.id)).toEqual(['s1', 'x1']);
    const other = await sync('conta-a', [], 0, 'd2');
    expect(other.changes.map((c) => `${c.store}/${c.id}`)).toEqual(['sessions/s1', 'solves/x1']);
    expect((await sync('conta-a', [], 2, 'd2')).changes).toEqual([]);
  });

  it('lotes de 500: `more` diz que há mais, e o cursor avança', async () => {
    const changes = Array.from({ length: 500 }, (_, i) => solve(`b${String(i).padStart(3, '0')}`));
    await sync('conta-lotes', changes);
    await sync('conta-lotes', [solve('b500')]);
    const page = await sync('conta-lotes', [], 0, 'd2');
    expect([page.changes.length, page.more, page.cursor]).toEqual([500, true, 500]);
    const rest = await sync('conta-lotes', [], page.cursor, 'd2');
    expect([rest.changes.length, rest.more]).toEqual([1, false]);
  });

  it('uma conta não lê nem grava na outra', async () => {
    await sync('conta-1', [solve('so-da-1')]);
    expect((await sync('conta-2', [])).changes).toEqual([]);
    await sync('conta-2', [solve('so-da-1', { note: 'da conta 2' })]);
    const one = await sync('conta-1', [], 0, 'd9');
    expect(one.changes.map((c) => (c.data as { note: string }).note)).toEqual(['']);
  });

  it('a exclusão vence a edição feita depois (D5), nos dois sentidos de chegada', async () => {
    await sync('conta-d5', [session, solve('x')]);
    await sync('conta-d5', [solve('x', { deletedAt: T0 + 10, deletionStamp: T0 + 10, updatedAt: T0 + 10 })]);
    const res = await sync('conta-d5', [solve('x', { note: 'editado offline', updatedAt: T0 + 20 })], 0, 'd2');
    const x = res.changes.find((c) => c.id === 'x')!;
    expect(x).toMatchObject({ deletedAt: T0 + 10, data: { note: 'editado offline' } });
  });

  it('a versão velha que chega depois do purge perde e volta corrigida para quem a mandou', async () => {
    await sync('conta-purge', [solve('y', { deletedAt: T0 + 5, deletionStamp: T0 + 5, updatedAt: T0 + 5 })]);
    const before = await sync('conta-purge', [], 0, 'd2');
    const stale = await sync('conta-purge', [solve('y')], before.cursor, 'd2');
    expect(stale.changes.map((c) => [c.id, c.deletedAt])).toEqual([['y', T0 + 5]]);
  });

  it('uma mudança inválida volta com o motivo e não derruba o lote', async () => {
    const res = await sync('conta-forma', [solve('ok'), { ...solve('ruim'), data: { sessionId: 's1' } }, { store: 'profile', id: 'x' }]);
    expect(res.accepted).toBe(1);
    expect(res.rejected).toEqual([
      { store: 'solves', id: 'ruim', reason: 'solve inválido' },
      { store: 'profile', id: 'x', reason: 'store desconhecida' },
    ]);
  });

  it('pedidos tortos: 426 para outra versão do protocolo, 415 sem JSON, 403 de outra origem, 400 com mais de 500 mudanças, 429 na rajada', async () => {
    const deps = testDeps({ user: 'conta-x' });
    expect((await call('/api/sync', postJson({ v: 2, deviceId: 'd', cursor: 0, clock: 0, changes: [] }), { deps })).status).toBe(426);
    expect((await call('/api/sync', { method: 'POST', body: '{}' }, { deps })).status).toBe(415);
    expect((await call('/api/sync', postJson({ v: 1 }, { Origin: 'https://outro.site' }), { deps })).status).toBe(403);
    const many = Array.from({ length: 501 }, (_, i) => solve(`m${i}`));
    expect((await call('/api/sync', postJson({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: many }), { deps })).status).toBe(400);
    const busy = testEnv({ API_BURST: { limit: async () => ({ success: false }) } });
    expect((await call('/api/sync', postJson({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: [] }), { deps, env: busy })).status).toBe(429);
  });
});
```

Em `app/tests/worker/helpers.ts`:

Troque:

```ts
export const ORIGIN = 'https://beta.klick.ranimontagna.com';
export const T0 = 1_791_500_000_000;

export function testEnv(over: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', ...over };
}

export function testDeps(over: Partial<Deps> = {}): Deps {
  return { now: () => T0, ...over };
}

export async function call(path: string, init: RequestInit = {}, o: { env?: Env; deps?: Deps } = {}): Promise<Response> {
```

por:

```ts
export const ORIGIN = 'https://beta.klick.ranimontagna.com';
export const T0 = 1_791_500_000_000;

// O limite de rajada sempre deixa passar nos testes (o binding do Miniflare conta de verdade); os testes de limite passam o deles.
export const allow: RateLimit = { limit: async () => ({ success: true }) };

export function testEnv(over: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', API_BURST: allow, ...over };
}

// `user`: quem tem sessão neste pedido (sem login de verdade, etapa 3); null, ninguém.
export function testDeps(over: Partial<Deps> & { user?: string | null } = {}): Deps {
  const { user = null, ...rest } = over;
  return { now: () => T0, resolveUser: async () => (user ? { id: user, email: `${user}@exemplo.com` } : null), ...rest };
}

export async function call(path: string, init: RequestInit = {}, o: { env?: Env; deps?: Deps } = {}): Promise<Response> {
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test:worker`
Expected: FAIL: os testes do sync recebem 404 (a rota ainda não existe), e o tipo de `Deps` ainda não tem `resolveUser`.

- [ ] **Step 3: O Durable Object da conta**

Tudo do sync roda dentro de `transactionSync`, sem espera no meio: um pedido por vez, e as revisões em ordem. A validação, as regras e a cascata são as de `src/core/sync`.

Crie `app/worker/account-store.ts`:

```ts
// O Durable Object de uma conta (spec 8.2): um SQLite com os registros da conta, cada um com a revisão em que mudou. Um pedido por vez: o
// sync roda inteiro numa transação síncrona, sem espera no meio, então as revisões saem em ordem sem lock extra. As regras são as mesmas do
// app (src/core/sync).
import { DurableObject } from 'cloudflare:workers';
import { applyChanges, type RecordView } from '../src/core/sync/apply';
import { SYNC_BATCH, type Change, type SyncRequest, type SyncResponse, type SyncStore } from '../src/core/sync/types';
import type { Env } from './env';

type Row = {
  store: string;
  id: string;
  data: string;
  updated_at: number;
  deleted_at: number | null;
  deletion_stamp: number;
  rev: number;
  parent: string | null;
};

const rowToChange = (r: Row): Change => ({
  store: r.store as SyncStore,
  id: r.id,
  data: JSON.parse(r.data) as unknown,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  deletionStamp: r.deletion_stamp,
});

// O solve guarda a sessão dele em `parent`: a cascata (spec 6.3) acha os solves de uma sessão pelo índice.
const parentOf = (c: Change): string | null => {
  const d = c.data as { sessionId?: unknown } | null;
  return c.store === 'solves' && typeof d === 'object' && d !== null && typeof d.sessionId === 'string' ? d.sessionId : null;
};

export class AccountStore extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.migrate();
  }

  private migrate(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS records (
      store TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      updated_at INTEGER NOT NULL, deleted_at INTEGER, deletion_stamp INTEGER NOT NULL,
      rev INTEGER NOT NULL, parent TEXT, PRIMARY KEY (store, id)
    )`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS records_rev ON records (rev)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS records_parent ON records (store, parent)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)'); // rev, userId, snapshotRev, lastSnapshotDay
    this.sql.exec('CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, last_sync_at INTEGER NOT NULL)');
  }

  private getState(key: string): string | null {
    return this.sql.exec<{ value: string }>('SELECT value FROM state WHERE key = ?', key).toArray()[0]?.value ?? null;
  }

  private setState(key: string, value: string): void {
    this.sql.exec('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }

  private view(): RecordView {
    return {
      get: (store, id) => {
        const row = this.sql.exec<Row>('SELECT * FROM records WHERE store = ? AND id = ?', store, id).toArray()[0];
        return row ? rowToChange(row) : undefined;
      },
      solvesOf: (sessionId) => this.sql.exec<Row>("SELECT * FROM records WHERE store = 'solves' AND parent = ?", sessionId).toArray().map(rowToChange),
    };
  }

  // Grava cada registro que mudou com a próxima revisão da conta.
  private write(changes: readonly Change[]): void {
    let rev = Number(this.getState('rev') ?? '0');
    for (const c of changes) {
      rev += 1;
      this.sql.exec(
        `INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(store, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
         deletion_stamp = excluded.deletion_stamp, rev = excluded.rev, parent = excluded.parent`,
        c.store, c.id, JSON.stringify(c.data), c.updatedAt, c.deletedAt, c.deletionStamp, rev, parentOf(c),
      );
    }
    this.setState('rev', String(rev));
  }

  // POST /api/sync (spec 6.1): valida e junta o lote, dá revisão ao que mudou e devolve o que mudou desde o cursor, até SYNC_BATCH.
  async syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse> {
    return this.ctx.storage.transactionSync((): SyncResponse => {
      if (this.getState('userId') === null) this.setState('userId', userId);
      const result = applyChanges(this.view(), req.changes, { mode: 'server' });
      this.write(result.writes);
      this.sql.exec(
        'INSERT INTO devices (device_id, last_sync_at) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
        req.deviceId, now,
      );
      const rows = this.sql.exec<Row>('SELECT * FROM records WHERE rev > ? ORDER BY rev LIMIT ?', req.cursor, SYNC_BATCH + 1).toArray();
      const page = rows.slice(0, SYNC_BATCH);
      return {
        accepted: req.changes.length - result.rejected.length,
        rejected: result.rejected,
        changes: page.map(rowToChange),
        cursor: page.length > 0 ? page[page.length - 1].rev : req.cursor,
        more: rows.length > SYNC_BATCH,
        serverTime: now,
      };
    });
  }
}
```

- [ ] **Step 4: A rota, as ligações e a exportação da classe**

Em `app/worker/env.ts`:

Troque:

```ts
// As ligações do Worker (wrangler.jsonc, spec 8.1 e 8.4). Os segredos chegam por `wrangler secret put`, por ambiente; nos testes, pelo
// vitest.worker.config.ts. O repositório é público: aqui só há nomes.
export interface Env {
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
```

por:

```ts
// As ligações do Worker (wrangler.jsonc, spec 8.1 e 8.4). Os segredos chegam por `wrangler secret put`, por ambiente; nos testes, pelo
// vitest.worker.config.ts. O repositório é público: aqui só há nomes.
import type { AccountStore } from './account-store';

export interface Env {
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNT: DurableObjectNamespace<AccountStore>; // um objeto por conta, idFromName(userId)
  API_BURST: RateLimit; // rajada de pedidos de sync por conta (o binding só conta janelas de 10 ou 60 s)
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
```

Substitua `app/worker/router.ts` inteiro por:

```ts
// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// As rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos do app. Os logs levam só ids,
// contagens, durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import type { Env } from './env';

export interface User {
  id: string;
  email: string;
}

export interface Deps {
  now: () => number;
  resolveUser: (request: Request, env: Env, ctx: ExecutionContext) => Promise<User | null>; // a sessão do pedido; os testes passam um falso
}

export const MAX_BODY = 2_000_000; // 500 mudanças de até 4 KB

// Ainda sem login (etapa 3 da spec): ninguém tem sessão, e as rotas da conta respondem 401.
export function defaultDeps(_env: Env): Deps {
  return { now: () => Date.now(), resolveUser: async () => null };
}

const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string): Response => json({ error }, status);
const log = (entry: Record<string, string | number>): void => console.log(JSON.stringify(entry));
export const accountsOn = (env: Env): boolean => env.ACCOUNTS_ENABLED === 'true';

// As escritas pedem JSON e a mesma origem (spec 7.3): um formulário de outro site não chega aqui.
function writeGuard(request: Request, env: Env): Response | null {
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) return fail(415, 'json');
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== env.APP_ORIGIN) return fail(403, 'origin');
  return null;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) return fail(413, 'too-big');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail(400, 'json');
  }
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// O pedido de sync (spec 6.1). Uma versão de protocolo que o servidor não conhece pede um app mais novo (426).
export function parseSyncRequest(body: unknown): SyncRequest | 'update' | null {
  if (!isRec(body)) return null;
  if (body.v !== SYNC_PROTOCOL) return 'update';
  const { deviceId, cursor, clock, changes } = body;
  if (typeof deviceId !== 'string' || deviceId === '' || deviceId.length > 64) return null;
  if (!Number.isInteger(cursor) || (cursor as number) < 0 || typeof clock !== 'number' || !Number.isFinite(clock)) return null;
  if (!Array.isArray(changes) || changes.length > SYNC_BATCH) return null;
  return { v: SYNC_PROTOCOL, deviceId, cursor: cursor as number, clock, changes };
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');

  const user = await deps.resolveUser(request, env, ctx);
  if (!user) return fail(401, 'auth');
  const account = env.ACCOUNT.get(env.ACCOUNT.idFromName(user.id));

  if (path === '/api/sync' && request.method === 'POST') {
    const guard = writeGuard(request, env);
    if (guard) return guard;
    if (!(await env.API_BURST.limit({ key: user.id })).success) return fail(429, 'limited');
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const req = parseSyncRequest(body);
    if (req === 'update') return fail(426, 'update');
    if (req === null) return fail(400, 'bad-request');
    const started = deps.now();
    // O tipo do stub (RPC) não acompanha `data: unknown`; o objeto que volta é o SyncResponse do Durable Object.
    const res = (await account.syncBatch(user.id, req, started)) as unknown as SyncResponse;
    log({ evt: 'sync', user: user.id, pushed: req.changes.length, rejected: res.rejected.length, pulled: res.changes.length, ms: deps.now() - started });
    return json(res);
  }

  return fail(404, 'not-found');
}
```

Em `app/worker/index.ts`:

Troque:

```ts
// O Worker do Klick (spec 8.1): /api para a conta e o sync (router.ts); o resto, os arquivos do app (env.ASSETS), como antes.
import type { Env } from './env';
import { defaultDeps, handle } from './router';

export default {
  fetch(request, env, ctx) {
```

por:

```ts
// O Worker do Klick (spec 8.1): /api para a conta e o sync (router.ts); o resto, os arquivos do app (env.ASSETS), como antes.
import type { Env } from './env';
import { defaultDeps, handle } from './router';

export { AccountStore } from './account-store';

export default {
  fetch(request, env, ctx) {
```

- [ ] **Step 5: O wrangler.jsonc**

Em `app/wrangler.jsonc`:

1. Troque:

```jsonc
  "observability": { "enabled": true },
  "routes": [{ "pattern": "beta.klick.ranimontagna.com", "custom_domain": true }],
  "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "vars": {
    "ACCOUNTS_ENABLED": "false",
    "APP_ORIGIN": "https://beta.klick.ranimontagna.com",
```

por:

```jsonc
  "observability": { "enabled": true },
  "routes": [{ "pattern": "beta.klick.ranimontagna.com", "custom_domain": true }],
  "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  // Um Durable Object com SQLite por conta (spec 8.2). As migrações valem para os dois ambientes; cada um tem o próprio namespace.
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AccountStore"] }],
  "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
  "ratelimits": [{ "name": "API_BURST", "namespace_id": "1101", "simple": { "limit": 120, "period": 60 } }],
  "vars": {
    "ACCOUNTS_ENABLED": "false",
    "APP_ORIGIN": "https://beta.klick.ranimontagna.com",
```

2. Troque:

```jsonc
      "workers_dev": false,
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "vars": {
        "ACCOUNTS_ENABLED": "false",
        "APP_ORIGIN": "https://klick.ranimontagna.com",
```

por:

```jsonc
      "workers_dev": false,
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
      "ratelimits": [{ "name": "API_BURST", "namespace_id": "2101", "simple": { "limit": 120, "period": 60 } }],
      "vars": {
        "ACCOUNTS_ENABLED": "false",
        "APP_ORIGIN": "https://klick.ranimontagna.com",
```

- [ ] **Step 6: Rode os testes e os tipos**

Run: `pnpm test:worker`
Expected: PASS (3 + 8 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add worker/account-store.ts worker/env.ts worker/router.ts worker/index.ts wrangler.jsonc tests/worker/helpers.ts tests/worker/sync.test.ts
git commit -m "feat(worker): o Durable Object da conta e POST /api/sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Portão B: Workers Paid antes do primeiro deploy do Worker com Durable Object

Spec: seções 3 (D12) e 13 ("antes da etapa 3: passar a conta da Cloudflare para o Workers Paid; é pagamento, então o Claude não faz").

Daqui em diante, um `npx wrangler deploy` cria o namespace do Durable Object (e, nas próximas tarefas, usa o D1 e o R2). **PARE e peça ao Ranielli.** As Tasks 9 a 18 podem seguir na máquina enquanto isso; só os deploys esperam.

- [ ] **Step 1: PARE. Peça ao Ranielli**

Mande: "Para o servidor da conta subir no beta, preciso que você faça três coisas no painel da Cloudflare (conta `3a9dc0a9d9f05ff97021ce237e3ed92f`), porque envolvem pagamento: (1) assinar o Workers Paid (US$ 5 por mês); (2) ativar o R2 (o plano grátis basta; o painel pede o cartão); (3) criar um alerta de gasto em Billing > Notifications (por exemplo, US$ 10 no mês). Me avise quando estiver feito."

- [ ] **Step 2: Depois do ok, o primeiro deploy do Worker no beta**

O deploy exige que cada ligação do `wrangler.jsonc` exista na nuvem: se a Task 9 já está feita, os bancos D1 existem (Step 1 dela); se a Task 17 já está feita, crie antes os buckets (Task 17, Step 8).

Run: `pnpm build && npx wrangler deploy`
Expected: o deploy de `klick-app-beta` termina e cria o Durable Object `AccountStore`. `curl -s https://beta.klick.ranimontagna.com/api/health` responde `{"ok":true,"accounts":false,"turnstileSiteKey":null}`, e o app abre como antes.

Sem o ok: não faça deploy do beta até ele chegar; siga as tarefas na máquina.

---

### Task 9: O login: Better Auth no D1 e o código por e-mail

Spec: seções 7.1, 7.2, 7.3, 7.4 e 11 (servidor: login por código, com o envio de e-mail falso; uma conta não lê nem grava na outra); decisões 17, 18, 22 e 23 do começo deste plano.

**Files:**
- Create: `app/worker/migrations/0001_auth.sql`
- Create: `app/worker/auth.ts`, `app/worker/mail.ts`
- Modify: `app/worker/env.ts` (`DB`, `BETTER_AUTH_SECRET`, `E2E_MAILBOX`), `app/worker/router.ts` (`/api/auth/*`, a caixa do ponta a ponta, a sessão de verdade)
- Modify: `app/wrangler.jsonc` (o D1 de cada ambiente), `app/vitest.worker.config.ts` (as migrações e o segredo dos testes), `app/package.json` (as duas dependências)
- Create: `app/tests/worker/apply-migrations.ts`; Modify: `app/tests/worker/env.d.ts`, `app/tests/worker/helpers.ts`
- Test: `app/tests/worker/auth.test.ts`; Modify: `app/tests/unit/wrangler-config.test.ts`

**Interfaces:**
- Consumes: `Deps`, `handle` (Tasks 7 e 8).
- Produces (em `worker/auth.ts`): `SESSION_DAYS = 90`, `createAuth(env: Env, ctx: ExecutionContext, mailer: Mailer)` (o Better Auth deste pedido: D1, `basePath: '/api/auth'`, `trustedOrigins: [APP_ORIGIN]`, sessão de 90 dias renovada a cada dia de uso, cookie `HttpOnly`, `SameSite=Lax` e `Secure` em https, IP de `cf-connecting-ip`, `emailOTP` de 6 dígitos, 10 minutos, 5 tentativas e guardado em hash, `passkey` com o `rpID` do ambiente), `User { id; email }`, `sessionUser(request, env, ctx, mailer): Promise<User | null>`.
- Produces (em `worker/mail.ts`): `Mailer { sendCode(email, code): Promise<void> }`, `codeEmail(code): { subject; text; html }`, `e2eMailbox: Map<string, string>`, `e2eMailer`, `missingMailer`.
- Produces (em `worker/router.ts`): `Deps` ganha `mailer: Mailer`; `User` passa a vir de `auth.ts`. `/api/auth/*` vai ao Better Auth; `/api/__e2e/otp?email=` responde `{ code }` só com `E2E_MAILBOX=true` e em localhost (404 no resto).
- Produces (em `tests/worker/helpers.ts`): `fakeMailer()` (guarda `sent`), `authDeps()` (o login de verdade, com o carteiro falso), `signIn(email, deps): Promise<string>` (o cookie da sessão).

As rotas do Better Auth que o app usa (Tasks 14 e 15): `POST /api/auth/email-otp/send-verification-otp` (`{ email, type: 'sign-in' }`), `POST /api/auth/sign-in/email-otp` (`{ email, otp }`), `GET /api/auth/get-session`, `POST /api/auth/sign-out`, `POST /api/auth/revoke-sessions` e as da passkey (`/api/auth/passkey/*`, `/api/auth/sign-in/passkey`). Pedir o código com um e-mail que não tem conta cria a conta ao entrar (entrar e criar conta são o mesmo fluxo, spec 7.2); a resposta do pedido é a mesma nos dois casos.

- [ ] **Step 1: Os dois bancos D1**

Os bancos não dependem do Workers Paid; criar não publica nada. A dica `enam` (leste dos EUA) deixa o D1 onde a política de privacidade diz que os dados ficam (spec 9.5); o Durable Object, pedido do Brasil, também nasce no leste dos EUA (pesquisa, seção 8.4). O `--update-config=false` deixa o `wrangler.jsonc` para o Step 7.

Run: `npx wrangler d1 create klick-auth-beta --location enam --update-config=false`
Expected: o wrangler imprime o bloco do binding, com `"database_id": "<um uuid>"`. Guarde o uuid.

Run: `npx wrangler d1 create klick-auth --location enam --update-config=false`
Expected: o mesmo, com outro uuid. Guarde também.

- [ ] **Step 2: As dependências do login**

Run: `pnpm add -E better-auth@1.7.7 @better-auth/passkey@1.7.7`
Expected: as duas em `dependencies`, sem `^` (o app usa o cliente das duas nas Tasks 14 e 15; o Worker, o servidor).

- [ ] **Step 3: Escreva os testes que falham**

O teste do esquema roda o `getMigrations` do próprio Better Auth contra o D1 migrado: se o SQL escrito à mão (Step 5) não cobrir uma tabela ou coluna da 1.7.7, ele falha e mostra o SQL que falta (decisão 17).

Crie `app/tests/worker/apply-migrations.ts`:

```ts
// Aplica worker/migrations no D1 local antes dos testes. Os arquivos de setup rodam fora do isolamento de cada arquivo de teste, e talvez
// mais de uma vez: applyD1Migrations só aplica o que falta.
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

Crie `app/tests/worker/auth.test.ts`:

```ts
import { createExecutionContext } from 'cloudflare:test';
import { getMigrations } from 'better-auth/db/migration';
import { describe, expect, it } from 'vitest';
import type { SyncResponse } from '../../src/core/sync/types';
import { createAuth, SESSION_DAYS } from '../../worker/auth';
import { codeEmail, e2eMailbox } from '../../worker/mail';
import { defaultDeps, handle } from '../../worker/router';
import { authDeps, call, fakeMailer, postJson, signIn, T0, testEnv } from './helpers';

const syncBody = (changes: unknown[] = []) => ({ v: 1, deviceId: 'd1', cursor: 0, clock: T0, changes });
const solve = (id: string) => ({
  store: 'solves', id, updatedAt: T0, deletedAt: null, deletionStamp: T0,
  data: { sessionId: 's', event: '333', ms: 1, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0 },
});

describe('login por código (spec 7.1 a 7.3)', () => {
  it('o SQL de worker/migrations cobre o esquema do Better Auth', async () => {
    const { toBeCreated, toBeAdded, compileMigrations } = await getMigrations(createAuth(testEnv(), createExecutionContext(), fakeMailer()).options);
    if (toBeCreated.length + toBeAdded.length > 0) throw new Error(`Falta no worker/migrations/0001_auth.sql:\n${await compileMigrations()}`);
  });

  it('o código chega com 6 dígitos; entrar dá o cookie de sessão de 90 dias, HttpOnly, Secure e SameSite=Lax', async () => {
    const deps = authDeps();
    const send = await call('/api/auth/email-otp/send-verification-otp', postJson({ email: 'ranielli@exemplo.com', type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
    expect(send.status).toBe(200);
    const { code } = deps.mailer.sent.at(-1)!;
    expect(code).toMatch(/^\d{6}$/);
    const res = await call('/api/auth/sign-in/email-otp', postJson({ email: 'ranielli@exemplo.com', otp: code }), { deps });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(Number(/Max-Age=(\d+)/i.exec(cookie)?.[1])).toBe(SESSION_DAYS * 86_400);
  });

  it('pedir o código responde igual para um e-mail com conta e sem conta', async () => {
    const deps = authDeps();
    await signIn('ja-tem@exemplo.com', deps);
    const ask = (email: string) => call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
    const [known, unknown] = await Promise.all([ask('ja-tem@exemplo.com'), ask('nunca-veio@exemplo.com')]);
    expect([known.status, await known.text()]).toEqual([unknown.status, await unknown.text()]);
  });

  it('5 tentativas erradas esgotam o código (spec 7.1)', async () => {
    const deps = authDeps();
    const email = 'tentativas@exemplo.com';
    await call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
    const { code } = deps.mailer.sent.at(-1)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await call('/api/auth/sign-in/email-otp', postJson({ email, otp: wrong }), { deps });
    const res = await call('/api/auth/sign-in/email-otp', postJson({ email, otp: code }), { deps });
    expect(res.status).not.toBe(200);
    expect(await res.text()).toContain('TOO_MANY_ATTEMPTS');
  });

  it('com a sessão, /api/sync funciona; uma conta não lê nem grava na outra', async () => {
    const deps = authDeps();
    const a = await signIn('a@exemplo.com', deps);
    const b = await signIn('b@exemplo.com', deps);
    expect((await call('/api/sync', postJson(syncBody([solve('da-a')]), { Cookie: a }), { deps })).status).toBe(200);
    const seen = (await (await call('/api/sync', postJson(syncBody(), { Cookie: b }), { deps })).json()) as SyncResponse;
    expect(seen.changes).toEqual([]);
    expect((await call('/api/sync', postJson(syncBody()), { deps })).status).toBe(401);
  });

  it('o e-mail tem só o código, a validade e o aviso, em texto e em HTML (spec 7.4)', () => {
    const mail = codeEmail('123456');
    expect(mail.subject).toBe('Seu código do Klick: 123456');
    expect(mail.text).toBe('Seu código para entrar no Klick: 123456\n\nEle vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.\n');
    expect(mail.html).toContain('123456');
  });

  it('a caixa do ponta a ponta só existe com E2E_MAILBOX e em localhost; com ela, nada é enviado', async () => {
    expect((await call('/api/__e2e/otp?email=x@exemplo.com')).status).toBe(404);
    const env = testEnv({ E2E_MAILBOX: 'true' });
    expect((await call('/api/__e2e/otp?email=x@exemplo.com', {}, { env })).status).toBe(404); // beta.klick..., não localhost
    const deps = defaultDeps(env);
    const local = (path: string, init?: RequestInit) => handle(new Request(`http://localhost:8787${path}`, init), env, createExecutionContext(), deps);
    await deps.mailer.sendCode('E2E@exemplo.com', '654321');
    expect(e2eMailbox.get('e2e@exemplo.com')).toBe('654321');
    expect(await (await local('/api/__e2e/otp?email=e2e@exemplo.com')).json()).toEqual({ code: '654321' });
  });
});
```

Substitua `app/tests/worker/env.d.ts` inteiro por:

```ts
// O env dos testes do Worker (`env` de cloudflare:workers): as ligações do wrangler.jsonc, o tipo de worker/env.ts, e a lista de migrações
// do D1 que o vitest.worker.config.ts passa.
type KlickWorkerEnv = import('../../worker/env').Env;

declare namespace Cloudflare {
  interface Env extends KlickWorkerEnv {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
```

Em `app/tests/worker/helpers.ts`:

1. Troque:

```ts
// Não é um arquivo de teste.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Env } from '../../worker/env';
import { handle, type Deps } from '../../worker/router';

export const ORIGIN = 'https://beta.klick.ranimontagna.com';
```

por:

```ts
// Não é um arquivo de teste.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { sessionUser } from '../../worker/auth';
import type { Env } from '../../worker/env';
import type { Mailer } from '../../worker/mail';
import { handle, type Deps } from '../../worker/router';

export const ORIGIN = 'https://beta.klick.ranimontagna.com';
```

2. Troque:

```ts
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', API_BURST: allow, ...over };
}

// `user`: quem tem sessão neste pedido (sem login de verdade, etapa 3); null, ninguém.
export function testDeps(over: Partial<Deps> & { user?: string | null } = {}): Deps {
  const { user = null, ...rest } = over;
  return { now: () => T0, resolveUser: async () => (user ? { id: user, email: `${user}@exemplo.com` } : null), ...rest };
}

export async function call(path: string, init: RequestInit = {}, o: { env?: Env; deps?: Deps } = {}): Promise<Response> {
```

por:

```ts
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', API_BURST: allow, ...over };
}

// Um carteiro falso: guarda o que seria enviado.
export function fakeMailer(): Mailer & { sent: { email: string; code: string }[] } {
  const sent: { email: string; code: string }[] = [];
  return {
    sent,
    async sendCode(email, code) {
      sent.push({ email, code });
    },
  };
}

// `user`: quem tem sessão neste pedido, sem passar pelo login; null, ninguém.
export function testDeps(over: Partial<Deps> & { user?: string | null } = {}): Deps {
  const { user = null, ...rest } = over;
  return { now: () => T0, mailer: fakeMailer(), resolveUser: async () => (user ? { id: user, email: `${user}@exemplo.com` } : null), ...rest };
}

// Com o login de verdade (Better Auth no D1 local) e o carteiro falso.
export function authDeps(): Deps & { mailer: ReturnType<typeof fakeMailer> } {
  const mailer = fakeMailer();
  return { now: () => T0, mailer, resolveUser: (request, e, ctx) => sessionUser(request, e, ctx, mailer) };
}

// Pede o código, entra com ele e devolve o cookie de sessão, pronto para o cabeçalho Cookie.
export async function signIn(email: string, deps: ReturnType<typeof authDeps>): Promise<string> {
  const send = await call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
  if (send.status !== 200) throw new Error(`pedir o código deu ${send.status}`);
  const code = deps.mailer.sent.at(-1)!.code;
  const res = await call('/api/auth/sign-in/email-otp', postJson({ email, otp: code }), { deps });
  if (res.status !== 200) throw new Error(`entrar deu ${res.status}`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

export async function call(path: string, init: RequestInit = {}, o: { env?: Env; deps?: Deps } = {}): Promise<Response> {
```

Substitua `app/vitest.worker.config.ts` inteiro por:

```ts
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Os testes do servidor (spec 11) rodam dentro do workerd, com o wrangler.jsonc de verdade (o ambiente beta, de cima) e os bancos locais
// do Miniflare. O `pnpm test` (vitest.config.ts, jsdom) não os vê: rodam com `pnpm test:worker`. Os segredos daqui valem só nos testes.
export default defineConfig(async () => {
  mkdirSync('dist', { recursive: true }); // a pasta dos arquivos do app: o plugin pede que ela exista; os testes não precisam do build
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'worker/migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, BETTER_AUTH_SECRET: 'segredo-so-dos-testes-0123456789abcdef' } },
      }),
    ],
    test: { include: ['tests/worker/**/*.test.ts'], setupFiles: ['tests/worker/apply-migrations.ts'] },
  };
});
```

Em `app/tests/unit/wrangler-config.test.ts`:

1. Troque:

```ts

// O wrangler.jsonc vai para o repositório público: nenhum segredo nele, e a conta desligada na raiz até o ok do Ranielli (spec 8.4).
const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../wrangler.jsonc'), 'utf8');
const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
  vars: Record<string, string>;
  assets: { run_worker_first: string[] };
  env: { production: { vars: Record<string, string>; assets: { run_worker_first: string[] } } };
};
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];
```

por:

```ts

// O wrangler.jsonc vai para o repositório público: nenhum segredo nele, e a conta desligada na raiz até o ok do Ranielli (spec 8.4).
const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../wrangler.jsonc'), 'utf8');
interface D1 {
  binding: string;
  database_name: string;
  database_id: string;
}
const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
  vars: Record<string, string>;
  assets: { run_worker_first: string[] };
  d1_databases: D1[];
  env: { production: { vars: Record<string, string>; assets: { run_worker_first: string[] }; d1_databases: D1[] } };
};
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];
```

2. Troque:

```ts
    expect(config.assets.run_worker_first).toEqual(['/api/*']);
    expect(config.env.production.assets.run_worker_first).toEqual(['/api/*']);
  });
});
```

por:

```ts
    expect(config.assets.run_worker_first).toEqual(['/api/*']);
    expect(config.env.production.assets.run_worker_first).toEqual(['/api/*']);
  });

  it('cada ambiente tem o próprio D1, com o id que o `wrangler d1 create` deu (spec 8.1)', () => {
    const [beta] = config.d1_databases;
    const [root] = config.env.production.d1_databases;
    expect([beta.binding, root.binding]).toEqual(['DB', 'DB']);
    expect([beta.database_name, root.database_name]).toEqual(['klick-auth-beta', 'klick-auth']);
    for (const db of [beta, root]) expect(db.database_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(beta.database_id).not.toBe(root.database_id);
  });
});
```

- [ ] **Step 4: Rode os testes e confira que falham**

Run: `pnpm test:worker`
Expected: FAIL: `readD1Migrations` não acha `worker/migrations`, ou `Failed to resolve import "../../worker/auth"`.

Run: `pnpm exec vitest run tests/unit/wrangler-config.test.ts`
Expected: FAIL: o `wrangler.jsonc` ainda não tem `d1_databases`.

- [ ] **Step 5: As tabelas do Better Auth no D1**

Crie `app/worker/migrations/0001_auth.sql`:

```sql
-- As tabelas do Better Auth 1.7.7 (núcleo e passkey) no D1, no formato que o adaptador Kysely dele escreve no SQLite: datas em "date",
-- booleanos em integer. O teste tests/worker/auth.test.ts confere este arquivo contra o esquema da biblioteca (getMigrations): se uma versão
-- nova mudar o esquema, o teste falha e mostra o SQL que falta.
CREATE TABLE "user" ("id" text NOT NULL PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL UNIQUE, "emailVerified" integer NOT NULL, "image" text, "createdAt" date NOT NULL, "updatedAt" date NOT NULL);
CREATE TABLE "session" ("id" text NOT NULL PRIMARY KEY, "expiresAt" date NOT NULL, "token" text NOT NULL UNIQUE, "createdAt" date NOT NULL, "updatedAt" date NOT NULL, "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE);
CREATE TABLE "account" ("id" text NOT NULL PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date NOT NULL, "updatedAt" date NOT NULL);
CREATE TABLE "verification" ("id" text NOT NULL PRIMARY KEY, "identifier" text NOT NULL, "value" text NOT NULL, "expiresAt" date NOT NULL, "createdAt" date NOT NULL, "updatedAt" date NOT NULL);
CREATE TABLE "passkey" ("id" text NOT NULL PRIMARY KEY, "name" text, "publicKey" text NOT NULL, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "credentialID" text NOT NULL, "counter" integer NOT NULL, "deviceType" text NOT NULL, "backedUp" integer NOT NULL, "transports" text, "createdAt" date, "aaguid" text);
CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX "passkey_userId_idx" ON "passkey" ("userId");
CREATE INDEX "passkey_credentialID_idx" ON "passkey" ("credentialID");
```

- [ ] **Step 6: O e-mail e o login**

Crie `app/worker/mail.ts`:

```ts
// O e-mail com o código (spec 7.4): só o código, a validade e "se não foi você, ignore", em texto simples com uma versão HTML mínima. Nos
// testes, um carteiro falso; no ponta a ponta local, a caixa do E2E_MAILBOX; o envio de verdade (Resend) entra com a conta dele.

export interface Mailer {
  sendCode(email: string, code: string): Promise<void>;
}

export function codeEmail(code: string): { subject: string; text: string; html: string } {
  return {
    subject: `Seu código do Klick: ${code}`,
    text: `Seu código para entrar no Klick: ${code}\n\nEle vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.\n`,
    html:
      '<p>Seu código para entrar no Klick:</p>' +
      `<p style="font-size:24px;font-weight:600;letter-spacing:4px">${code}</p>` +
      '<p>Ele vale por 10 minutos.</p><p>Se não foi você, ignore este e-mail.</p>',
  };
}

// A caixa do ponta a ponta local: o último código de cada e-mail. Só existe com E2E_MAILBOX=true (o router recusa o resto).
export const e2eMailbox = new Map<string, string>();
export const e2eMailer: Mailer = {
  async sendCode(email, code) {
    e2eMailbox.set(email.toLowerCase(), code);
  },
};

export const missingMailer: Mailer = {
  async sendCode() {
    throw new Error('mail-not-configured');
  },
};
```

Crie `app/worker/auth.ts`:

```ts
// O login (spec 7): o Better Auth com as tabelas no D1, o código por e-mail (6 dígitos, 10 minutos, 5 tentativas, guardado em hash) e a
// passkey. Um por pedido: o env e o ctx são do pedido.
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import type { Env } from './env';
import type { Mailer } from './mail';

export const SESSION_DAYS = 90; // spec 7.3; renova com o uso (updateAge)

export function createAuth(env: Env, ctx: ExecutionContext, mailer: Mailer) {
  const origin = env.APP_ORIGIN;
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: '/api/auth',
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    rateLimit: { enabled: false }, // os limites são os de abuse.ts, no D1: o do Better Auth fica em memória, por isolate
    session: { expiresIn: SESSION_DAYS * 86_400, updateAge: 86_400 },
    advanced: {
      useSecureCookies: origin.startsWith('https://'),
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        // Sem esperar o envio (a resposta não denuncia nada pelo tempo); o waitUntil segura o Worker até o e-mail sair.
        async sendVerificationOTP({ email, otp }) {
          ctx.waitUntil(mailer.sendCode(email, otp).catch((err: unknown) => console.error(JSON.stringify({ evt: 'mail-failed', error: String(err) }))));
        },
      }),
      passkey({ rpID: new URL(origin).hostname, rpName: 'Klick', origin }),
    ],
  });
}

export interface User {
  id: string;
  email: string;
}

export async function sessionUser(request: Request, env: Env, ctx: ExecutionContext, mailer: Mailer): Promise<User | null> {
  const session = await createAuth(env, ctx, mailer).api.getSession({ headers: request.headers });
  return session ? { id: session.user.id, email: session.user.email } : null;
}
```

Em `app/worker/env.ts`:

Troque:

```ts
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNT: DurableObjectNamespace<AccountStore>; // um objeto por conta, idFromName(userId)
  API_BURST: RateLimit; // rajada de pedidos de sync por conta (o binding só conta janelas de 10 ou 60 s)
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
  MAIL_FROM: string;
}
```

por:

```ts
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNT: DurableObjectNamespace<AccountStore>; // um objeto por conta, idFromName(userId)
  API_BURST: RateLimit; // rajada de pedidos de sync por conta (o binding só conta janelas de 10 ou 60 s)
  DB: D1Database; // as contas, as sessões e as passkeys (Better Auth)
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
  MAIL_FROM: string;
  BETTER_AUTH_SECRET: string; // segredo
  E2E_MAILBOX?: string; // 'true' só no wrangler dev dos ponta a ponta: o código fica numa caixa local, nunca é enviado
}
```

Em `app/worker/router.ts`:

1. Troque:

```ts
// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// As rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos do app. Os logs levam só ids,
// contagens, durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import type { Env } from './env';

export interface User {
  id: string;
  email: string;
}

export interface Deps {
  now: () => number;
  resolveUser: (request: Request, env: Env, ctx: ExecutionContext) => Promise<User | null>; // a sessão do pedido; os testes passam um falso
}

export const MAX_BODY = 2_000_000; // 500 mudanças de até 4 KB

// Ainda sem login (etapa 3 da spec): ninguém tem sessão, e as rotas da conta respondem 401.
export function defaultDeps(_env: Env): Deps {
  return { now: () => Date.now(), resolveUser: async () => null };
}

const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
```

por:

```ts
// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// /api/auth/* é do Better Auth; as outras rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos
// do app. Os logs levam só ids, contagens, durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import { createAuth, sessionUser, type User } from './auth';
import type { Env } from './env';
import { e2eMailbox, e2eMailer, missingMailer, type Mailer } from './mail';

export interface Deps {
  now: () => number;
  mailer: Mailer;
  resolveUser: (request: Request, env: Env, ctx: ExecutionContext) => Promise<User | null>; // a sessão do pedido; os testes passam um falso
}

export const MAX_BODY = 2_000_000; // 500 mudanças de até 4 KB

export function defaultDeps(env: Env): Deps {
  const mailer = env.E2E_MAILBOX === 'true' ? e2eMailer : missingMailer;
  return { now: () => Date.now(), mailer, resolveUser: (request, e, ctx) => sessionUser(request, e, ctx, mailer) };
}

const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
```

2. Troque:

```ts

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// O pedido de sync (spec 6.1). Uma versão de protocolo que o servidor não conhece pede um app mais novo (426).
export function parseSyncRequest(body: unknown): SyncRequest | 'update' | null {
  if (!isRec(body)) return null;
```

por:

```ts

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// A caixa do ponta a ponta local (E2E_MAILBOX): só com a variável ligada e só em localhost. Na nuvem, 404.
function e2eCode(url: URL, env: Env): Response {
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (env.E2E_MAILBOX !== 'true' || !local) return fail(404, 'not-found');
  return json({ code: e2eMailbox.get((url.searchParams.get('email') ?? '').toLowerCase()) ?? null });
}

// O pedido de sync (spec 6.1). Uma versão de protocolo que o servidor não conhece pede um app mais novo (426).
export function parseSyncRequest(body: unknown): SyncRequest | 'update' | null {
  if (!isRec(body)) return null;
```

3. Troque:

```ts
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');

  const user = await deps.resolveUser(request, env, ctx);
  if (!user) return fail(401, 'auth');
```

por:

```ts
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');
  if (path === '/api/__e2e/otp') return e2eCode(url, env);
  if (path.startsWith('/api/auth/')) return createAuth(env, ctx, deps.mailer).handler(request);

  const user = await deps.resolveUser(request, env, ctx);
  if (!user) return fail(401, 'auth');
```

- [ ] **Step 7: O D1 de cada ambiente no wrangler.jsonc**

Em `app/wrangler.jsonc`:

1. Troque:

```jsonc
  "main": "worker/index.ts",
  "workers_dev": false,
  "observability": { "enabled": true },
  "routes": [{ "pattern": "beta.klick.ranimontagna.com", "custom_domain": true }],
  "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  // Um Durable Object com SQLite por conta (spec 8.2). As migrações valem para os dois ambientes; cada um tem o próprio namespace.
```

por:

```jsonc
  "main": "worker/index.ts",
  "workers_dev": false,
  "observability": { "enabled": true },
  "d1_databases": [{ "binding": "DB", "database_name": "klick-auth-beta", "database_id": "ID_DO_KLICK_AUTH_BETA", "migrations_dir": "worker/migrations" }],
  "routes": [{ "pattern": "beta.klick.ranimontagna.com", "custom_domain": true }],
  "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  // Um Durable Object com SQLite por conta (spec 8.2). As migrações valem para os dois ambientes; cada um tem o próprio namespace.
```

2. Troque:

```jsonc
    "production": {
      "name": "klick-app",
      "workers_dev": false,
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
```

por:

```jsonc
    "production": {
      "name": "klick-app",
      "workers_dev": false,
      "d1_databases": [{ "binding": "DB", "database_name": "klick-auth", "database_id": "ID_DO_KLICK_AUTH", "migrations_dir": "worker/migrations" }],
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
```

Troque `ID_DO_KLICK_AUTH_BETA` e `ID_DO_KLICK_AUTH` pelos dois uuids do Step 1 (o do `klick-auth-beta` em cima, o do `klick-auth` em `env.production`). O teste `wrangler-config.test.ts` confere que são uuids, e diferentes.

- [ ] **Step 8: Rode os testes e os tipos**

Run: `pnpm test:worker`
Expected: PASS (3 + 8 + 7 testes). Se o teste do esquema falhar, o erro traz o SQL que falta: acrescente-o a `0001_auth.sql` (a 1.7.7 mudou algo) e rode de novo. Se um teste do fluxo falhar por um detalhe da biblioteca (o nome do cookie, o texto do erro de tentativas), confira na resposta e ajuste o teste, mantendo o que ele garante.

Run: `pnpm exec vitest run tests/unit/wrangler-config.test.ts`
Expected: PASS (4 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros. Se o tipo de uma opção do `betterAuth` ou do `emailOTP` não bater com a 1.7.7, ajuste `worker/auth.ts` à API dela, com os mesmos números (6 dígitos, 600 s, 5 tentativas, em hash, 90 dias).

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml wrangler.jsonc vitest.worker.config.ts worker/migrations/0001_auth.sql worker/auth.ts worker/mail.ts worker/env.ts worker/router.ts tests/worker/apply-migrations.ts tests/worker/env.d.ts tests/worker/helpers.ts tests/worker/auth.test.ts tests/unit/wrangler-config.test.ts
git commit -m "feat(worker): login por código com o Better Auth no D1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Abuso, o Resend e o Turnstile no servidor

Spec: seções 7.4, 7.5 e 11 (os limites); decisões 2, 15 e 18 do começo deste plano.

**Files:**
- Create: `app/worker/migrations/0002_limits.sql`, `app/worker/abuse.ts`
- Modify: `app/worker/mail.ts` (`resendMailer`), `app/worker/env.ts` (`OTP_BURST`, `TURNSTILE_SECRET`, `RESEND_API_KEY`), `app/worker/router.ts` (o guarda antes do Better Auth; `verifyCaptcha` nos deps)
- Modify: `app/wrangler.jsonc` (o limite de rajada dos códigos), `app/vitest.worker.config.ts` (o segredo de teste do Turnstile), `app/tests/worker/helpers.ts`
- Test: `app/tests/worker/abuse.test.ts`

**Interfaces:**
- Consumes: `Deps`, `defaultDeps`, `handle` (Task 9); `Mailer`, `codeEmail` (Task 9).
- Produces (em `worker/abuse.ts`): `CODES_PER_EMAIL_HOUR = 5`, `CODES_PER_IP_HOUR = 20`, `CAPTCHA_HEADER = 'x-turnstile-token'` (o mesmo de `src/sync/auth.ts`, Task 14), `E2E_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'`, `VerifyCaptcha = (token, ip) => Promise<boolean>`, `guardSendCode(request, env, deps: { now; verifyCaptcha }): Promise<Response | null>` (null: segue; 429 genérico no limite; 403 sem token ou com token recusado; nada é contado sem o Turnstile), `turnstileVerifier(secret, fetcher?)`, `emailKeyOf(email): Promise<string>` (o hash que o D1 guarda).
- Produces (em `worker/mail.ts`): `resendMailer(apiKey: string, from: string, fetcher?): Mailer`.
- Produces (em `worker/router.ts`): `Deps.verifyCaptcha`; `defaultDeps` usa o Resend quando há `RESEND_API_KEY` (sem ele, `missingMailer`: nenhum e-mail sai) e o Turnstile de verdade; com `E2E_MAILBOX`, a caixa local e o token de teste.
- Produces (em `tests/worker/helpers.ts`): `captchaOk` (o token `'ok'` passa).

A passkey já está configurada desde a Task 9 (`passkey({ rpID, rpName, origin })`); o teste dela é no aparelho, com o Ranielli (spec 11).

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/worker/abuse.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CODES_PER_EMAIL_HOUR, CODES_PER_IP_HOUR, E2E_TOKEN, guardSendCode, turnstileVerifier } from '../../worker/abuse';
import { codeEmail, resendMailer } from '../../worker/mail';
import { defaultDeps } from '../../worker/router';
import { call, captchaOk, ORIGIN, postJson, T0, testDeps, testEnv } from './helpers';

let now = T0;
const deps = { now: () => now, verifyCaptcha: captchaOk };
const ask = (email: string, ip: string, token = 'ok') =>
  new Request(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, 'x-turnstile-token': token },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });

describe('abuso no pedido de código (spec 7.5)', () => {
  it(`${CODES_PER_EMAIL_HOUR} códigos por e-mail por hora; depois de uma hora, libera`, async () => {
    for (let i = 0; i < CODES_PER_EMAIL_HOUR; i++) expect(await guardSendCode(ask('limite@exemplo.com', `10.0.0.${i}`), testEnv(), deps)).toBeNull();
    const blocked = await guardSendCode(ask(' Limite@Exemplo.com ', '10.0.1.1'), testEnv(), deps);
    expect(blocked?.status).toBe(429);
    now += 3_600_001;
    expect(await guardSendCode(ask('limite@exemplo.com', '10.0.1.1'), testEnv(), deps)).toBeNull();
  });

  it(`${CODES_PER_IP_HOUR} pedidos por IP por hora, com e-mails diferentes`, async () => {
    for (let i = 0; i < CODES_PER_IP_HOUR; i++) expect(await guardSendCode(ask(`p${i}@exemplo.com`, '10.9.9.9'), testEnv(), deps)).toBeNull();
    expect((await guardSendCode(ask('mais-um@exemplo.com', '10.9.9.9'), testEnv(), deps))?.status).toBe(429);
  });

  it('a resposta do limite não diz se o e-mail tem conta', async () => {
    const blocked = await guardSendCode(ask('x@exemplo.com', '10.8.8.8'), testEnv({ OTP_BURST: { limit: async () => ({ success: false }) } }), deps);
    expect(blocked?.status).toBe(429);
    expect(await blocked?.json()).toEqual({ code: 'TOO_MANY_REQUESTS', message: 'Tente de novo mais tarde.' });
  });

  it('sem o token do Turnstile, ou com um token recusado, 403 e nada é contado', async () => {
    expect((await guardSendCode(ask('t@exemplo.com', '10.7.7.7', ''), testEnv(), deps))?.status).toBe(403);
    expect((await guardSendCode(ask('t@exemplo.com', '10.7.7.7', 'recusado'), testEnv(), deps))?.status).toBe(403);
    const rows = await env.DB.prepare("SELECT count(*) AS n FROM otp_requests WHERE key = 'i:10.7.7.7'").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it('a rota passa pelo guarda antes do Better Auth', async () => {
    const res = await call('/api/auth/email-otp/send-verification-otp', postJson({ email: 'g@exemplo.com', type: 'sign-in' }), { deps: testDeps() });
    expect(res.status).toBe(403); // sem o cabeçalho do token
  });

  it('o e-mail no D1 é um hash, nunca o endereço', async () => {
    await guardSendCode(ask('privado@exemplo.com', '10.6.6.6'), testEnv(), deps);
    const keys = await env.DB.prepare('SELECT key FROM otp_requests').all<{ key: string }>();
    expect(keys.results.some((r) => r.key.includes('privado'))).toBe(false);
  });
});

describe('Turnstile no servidor e envio pelo Resend', () => {
  it('a verificação manda o segredo, o token e o IP, e só passa com success: true', async () => {
    const seen: unknown[] = [];
    const verify = turnstileVerifier('segredo', async (url, init) => {
      seen.push([url, JSON.parse(String(init?.body))]);
      return Response.json({ success: true });
    });
    expect(await verify('tok', '1.2.3.4')).toBe(true);
    expect(seen).toEqual([['https://challenges.cloudflare.com/turnstile/v0/siteverify', { secret: 'segredo', response: 'tok', remoteip: '1.2.3.4' }]]);
    expect(await turnstileVerifier('s', async () => Response.json({ success: false }))('t', 'ip')).toBe(false);
    expect(await turnstileVerifier('s', async () => Promise.reject(new Error('rede')))('t', 'ip')).toBe(false);
  });

  it('o Resend recebe o remetente fixo, o texto e o HTML; um erro dele vira exceção sem o e-mail nem o código', async () => {
    let sent: { url: string; init?: RequestInit } | null = null;
    const mailer = resendMailer('re_teste', 'Klick <nao-responda@klick.ranimontagna.com>', async (url, init) => {
      sent = { url, init };
      return Response.json({ id: 'x' });
    });
    await mailer.sendCode('a@exemplo.com', '123456');
    expect(sent!.url).toBe('https://api.resend.com/emails');
    expect(new Headers(sent!.init?.headers).get('Authorization')).toBe('Bearer re_teste');
    const mail = codeEmail('123456');
    expect(JSON.parse(String(sent!.init?.body))).toEqual({ from: 'Klick <nao-responda@klick.ranimontagna.com>', to: ['a@exemplo.com'], subject: mail.subject, text: mail.text, html: mail.html });
    const failing = resendMailer('re_teste', 'x', async () => new Response('', { status: 422 }));
    await expect(failing.sendCode('a@exemplo.com', '123456')).rejects.toThrow('resend 422');
  });

  it('no ponta a ponta local, o token de teste passa sem falar com a Cloudflare', async () => {
    const deps = defaultDeps(testEnv({ E2E_MAILBOX: 'true' }));
    expect(await deps.verifyCaptcha(E2E_TOKEN, '127.0.0.1')).toBe(true);
    expect(await deps.verifyCaptcha('outro', '127.0.0.1')).toBe(false);
  });
});
```

Em `app/tests/worker/helpers.ts`:

1. Troque:

```ts
export const allow: RateLimit = { limit: async () => ({ success: true }) };

export function testEnv(over: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', API_BURST: allow, ...over };
}

// Um carteiro falso: guarda o que seria enviado.
export function fakeMailer(): Mailer & { sent: { email: string; code: string }[] } {
```

por:

```ts
export const allow: RateLimit = { limit: async () => ({ success: true }) };

export function testEnv(over: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', API_BURST: allow, OTP_BURST: allow, ...over };
}

// O Turnstile falso: o token 'ok' passa.
export const captchaOk = async (token: string): Promise<boolean> => token === 'ok';

// Um carteiro falso: guarda o que seria enviado.
export function fakeMailer(): Mailer & { sent: { email: string; code: string }[] } {
```

2. Troque:

```ts
// `user`: quem tem sessão neste pedido, sem passar pelo login; null, ninguém.
export function testDeps(over: Partial<Deps> & { user?: string | null } = {}): Deps {
  const { user = null, ...rest } = over;
  return { now: () => T0, mailer: fakeMailer(), resolveUser: async () => (user ? { id: user, email: `${user}@exemplo.com` } : null), ...rest };
}

// Com o login de verdade (Better Auth no D1 local) e o carteiro falso.
export function authDeps(): Deps & { mailer: ReturnType<typeof fakeMailer> } {
  const mailer = fakeMailer();
  return { now: () => T0, mailer, resolveUser: (request, e, ctx) => sessionUser(request, e, ctx, mailer) };
}

// Pede o código, entra com ele e devolve o cookie de sessão, pronto para o cabeçalho Cookie.
```

por:

```ts
// `user`: quem tem sessão neste pedido, sem passar pelo login; null, ninguém.
export function testDeps(over: Partial<Deps> & { user?: string | null } = {}): Deps {
  const { user = null, ...rest } = over;
  return {
    now: () => T0,
    mailer: fakeMailer(),
    verifyCaptcha: captchaOk,
    resolveUser: async () => (user ? { id: user, email: `${user}@exemplo.com` } : null),
    ...rest,
  };
}

// Com o login de verdade (Better Auth no D1 local) e o carteiro falso.
export function authDeps(): Deps & { mailer: ReturnType<typeof fakeMailer> } {
  const mailer = fakeMailer();
  return { now: () => T0, mailer, verifyCaptcha: captchaOk, resolveUser: (request, e, ctx) => sessionUser(request, e, ctx, mailer) };
}

// Pede o código, entra com ele e devolve o cookie de sessão, pronto para o cabeçalho Cookie.
```

Em `app/vitest.worker.config.ts`:

Troque:

```ts
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, BETTER_AUTH_SECRET: 'segredo-so-dos-testes-0123456789abcdef' } },
      }),
    ],
    test: { include: ['tests/worker/**/*.test.ts'], setupFiles: ['tests/worker/apply-migrations.ts'] },
```

por:

```ts
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: 'segredo-so-dos-testes-0123456789abcdef',
            TURNSTILE_SECRET: '1x0000000000000000000000000000000AA', // a chave de teste da Cloudflare (sempre passa); os testes trocam o verificador
          },
        },
      }),
    ],
    test: { include: ['tests/worker/**/*.test.ts'], setupFiles: ['tests/worker/apply-migrations.ts'] },
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm test:worker`
Expected: FAIL: `Failed to resolve import "../../worker/abuse"`.

- [ ] **Step 3: Os pedidos de código da última hora**

Crie `app/worker/migrations/0002_limits.sql`:

```sql
-- Os pedidos de código da última hora (spec 7.5): uma linha por pedido, com a chave do e-mail (hash) ou do IP. O binding de rate limiting
-- só conta janelas de 10 ou 60 s; a hora fica aqui.
CREATE TABLE otp_requests (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX otp_requests_key_at ON otp_requests (key, at);
```

- [ ] **Step 4: O guarda, o Turnstile e o Resend**

Crie `app/worker/abuse.ts`:

```ts
// Abuso no pedido de código (spec 7.5): o Turnstile, uma rajada por IP (binding de rate limiting) e os limites por hora no D1: 5 códigos por
// e-mail e 20 pedidos por IP. As respostas não dizem se o e-mail tem conta.
import type { Env } from './env';

export const CODES_PER_EMAIL_HOUR = 5;
export const CODES_PER_IP_HOUR = 20;
export const CAPTCHA_HEADER = 'x-turnstile-token'; // o mesmo de src/sync/auth.ts
const HOUR = 3_600_000;

export type VerifyCaptcha = (token: string, ip: string) => Promise<boolean>;

// O token de teste do Turnstile: o ponta a ponta local (E2E_MAILBOX) o aceita sem falar com a Cloudflare.
export const E2E_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const limited = (): Response => Response.json({ code: 'TOO_MANY_REQUESTS', message: 'Tente de novo mais tarde.' }, { status: 429 });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// null: pode seguir para o Better Auth. O e-mail vira hash antes de ir para o D1.
export async function guardSendCode(request: Request, env: Env, deps: { now: () => number; verifyCaptcha: VerifyCaptcha }): Promise<Response | null> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'sem-ip';
  if (!(await env.OTP_BURST.limit({ key: `ip:${ip}` })).success) return limited();
  let email = '';
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return Response.json({ code: 'BAD_REQUEST' }, { status: 400 });
  }
  const token = request.headers.get(CAPTCHA_HEADER) ?? '';
  if (token === '' || !(await deps.verifyCaptcha(token, ip))) return Response.json({ code: 'CAPTCHA', message: 'Confirme que você é uma pessoa.' }, { status: 403 });
  const now = deps.now();
  const since = now - HOUR;
  const emailKey = `e:${await sha256(email)}`;
  const ipKey = `i:${ip}`;
  const [, byEmail, byIp] = await env.DB.batch<{ n: number }>([
    env.DB.prepare('DELETE FROM otp_requests WHERE at < ?').bind(since),
    env.DB.prepare('SELECT count(*) AS n FROM otp_requests WHERE key = ? AND at >= ?').bind(emailKey, since),
    env.DB.prepare('SELECT count(*) AS n FROM otp_requests WHERE key = ? AND at >= ?').bind(ipKey, since),
  ]);
  if ((byEmail.results[0]?.n ?? 0) >= CODES_PER_EMAIL_HOUR || (byIp.results[0]?.n ?? 0) >= CODES_PER_IP_HOUR) return limited();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind(emailKey, now),
    env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind(ipKey, now),
  ]);
  return null;
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

// A verificação do Turnstile no servidor: o token vale uma vez e por 5 minutos.
export function turnstileVerifier(secret: string, fetcher: Fetcher = (i, o) => fetch(i, o)): VerifyCaptcha {
  return async (token, ip) => {
    try {
      const res = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
      });
      if (!res.ok) return false;
      return ((await res.json()) as { success?: unknown }).success === true;
    } catch {
      return false;
    }
  };
}

// Apagar a conta (spec 7.7) também tira os pedidos de código do e-mail.
export async function emailKeyOf(email: string): Promise<string> {
  return `e:${await sha256(email.trim().toLowerCase())}`;
}
```

Em `app/worker/mail.ts`:

1. Troque:

```ts
// O e-mail com o código (spec 7.4): só o código, a validade e "se não foi você, ignore", em texto simples com uma versão HTML mínima. Nos
// testes, um carteiro falso; no ponta a ponta local, a caixa do E2E_MAILBOX; o envio de verdade (Resend) entra com a conta dele.

export interface Mailer {
  sendCode(email: string, code: string): Promise<void>;
```

por:

```ts
// O e-mail com o código (spec 7.4): só o código, a validade e "se não foi você, ignore", em texto simples com uma versão HTML mínima. Envio
// pelo Resend. Nos testes, um carteiro falso; no ponta a ponta local, a caixa do E2E_MAILBOX.

export interface Mailer {
  sendCode(email: string, code: string): Promise<void>;
```

2. Troque:

```ts
  };
}

// A caixa do ponta a ponta local: o último código de cada e-mail. Só existe com E2E_MAILBOX=true (o router recusa o resto).
export const e2eMailbox = new Map<string, string>();
export const e2eMailer: Mailer = {
```

por:

```ts
  };
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export function resendMailer(apiKey: string, from: string, fetcher: Fetcher = (i, o) => fetch(i, o)): Mailer {
  return {
    async sendCode(email, code) {
      const message = codeEmail(code);
      const res = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`); // o log leva só o status, nunca o e-mail nem o código
    },
  };
}

// A caixa do ponta a ponta local: o último código de cada e-mail. Só existe com E2E_MAILBOX=true (o router recusa o resto).
export const e2eMailbox = new Map<string, string>();
export const e2eMailer: Mailer = {
```

Em `app/worker/env.ts`:

Troque:

```ts
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNT: DurableObjectNamespace<AccountStore>; // um objeto por conta, idFromName(userId)
  API_BURST: RateLimit; // rajada de pedidos de sync por conta (o binding só conta janelas de 10 ou 60 s)
  DB: D1Database; // as contas, as sessões e as passkeys (Better Auth)
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
  MAIL_FROM: string;
  BETTER_AUTH_SECRET: string; // segredo
  E2E_MAILBOX?: string; // 'true' só no wrangler dev dos ponta a ponta: o código fica numa caixa local, nunca é enviado
}
```

por:

```ts
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNT: DurableObjectNamespace<AccountStore>; // um objeto por conta, idFromName(userId)
  API_BURST: RateLimit; // rajada de pedidos de sync por conta (o binding só conta janelas de 10 ou 60 s)
  DB: D1Database; // as contas, as sessões e as passkeys (Better Auth), e os pedidos de código da última hora
  OTP_BURST: RateLimit; // rajada de pedidos de código por IP
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
  MAIL_FROM: string;
  BETTER_AUTH_SECRET: string; // segredo
  TURNSTILE_SECRET: string; // segredo
  RESEND_API_KEY?: string; // segredo; sem ele, nenhum e-mail sai
  E2E_MAILBOX?: string; // 'true' só no wrangler dev dos ponta a ponta: o código fica numa caixa local, nunca é enviado
}
```

Em `app/worker/router.ts`:

1. Troque:

```ts
// /api/auth/* é do Better Auth; as outras rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos
// do app. Os logs levam só ids, contagens, durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import { createAuth, sessionUser, type User } from './auth';
import type { Env } from './env';
import { e2eMailbox, e2eMailer, missingMailer, type Mailer } from './mail';

export interface Deps {
  now: () => number;
  mailer: Mailer;
  resolveUser: (request: Request, env: Env, ctx: ExecutionContext) => Promise<User | null>; // a sessão do pedido; os testes passam um falso
}

export const MAX_BODY = 2_000_000; // 500 mudanças de até 4 KB

export function defaultDeps(env: Env): Deps {
  const mailer = env.E2E_MAILBOX === 'true' ? e2eMailer : missingMailer;
  return { now: () => Date.now(), mailer, resolveUser: (request, e, ctx) => sessionUser(request, e, ctx, mailer) };
}

const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
```

por:

```ts
// /api/auth/* é do Better Auth; as outras rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos
// do app. Os logs levam só ids, contagens, durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import { E2E_TOKEN, guardSendCode, turnstileVerifier, type VerifyCaptcha } from './abuse';
import { createAuth, sessionUser, type User } from './auth';
import type { Env } from './env';
import { e2eMailbox, e2eMailer, missingMailer, resendMailer, type Mailer } from './mail';

export interface Deps {
  now: () => number;
  mailer: Mailer;
  verifyCaptcha: VerifyCaptcha;
  resolveUser: (request: Request, env: Env, ctx: ExecutionContext) => Promise<User | null>; // a sessão do pedido; os testes passam um falso
}

export const MAX_BODY = 2_000_000; // 500 mudanças de até 4 KB

// Na nuvem: o Resend e o Turnstile de verdade. No ponta a ponta local (E2E_MAILBOX, só no wrangler dev), a caixa local e o token de teste.
export function defaultDeps(env: Env): Deps {
  const e2e = env.E2E_MAILBOX === 'true';
  const mailer = e2e ? e2eMailer : env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM) : missingMailer;
  const verifyCaptcha: VerifyCaptcha = e2e ? async (token) => token === E2E_TOKEN : turnstileVerifier(env.TURNSTILE_SECRET);
  return { now: () => Date.now(), mailer, verifyCaptcha, resolveUser: (request, e, ctx) => sessionUser(request, e, ctx, mailer) };
}

const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
```

2. Troque:

```ts
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');
  if (path === '/api/__e2e/otp') return e2eCode(url, env);
  if (path.startsWith('/api/auth/')) return createAuth(env, ctx, deps.mailer).handler(request);

  const user = await deps.resolveUser(request, env, ctx);
  if (!user) return fail(401, 'auth');
```

por:

```ts
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');
  if (path === '/api/__e2e/otp') return e2eCode(url, env);
  if (path.startsWith('/api/auth/')) {
    if (path === '/api/auth/email-otp/send-verification-otp' && request.method === 'POST') {
      const blocked = await guardSendCode(request, env, deps);
      if (blocked) return blocked;
    }
    return createAuth(env, ctx, deps.mailer).handler(request);
  }

  const user = await deps.resolveUser(request, env, ctx);
  if (!user) return fail(401, 'auth');
```

- [ ] **Step 5: O limite de rajada no wrangler.jsonc**

Em `app/wrangler.jsonc`:

1. Troque:

```jsonc
  // Um Durable Object com SQLite por conta (spec 8.2). As migrações valem para os dois ambientes; cada um tem o próprio namespace.
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AccountStore"] }],
  "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
  "ratelimits": [{ "name": "API_BURST", "namespace_id": "1101", "simple": { "limit": 120, "period": 60 } }],
  "vars": {
    "ACCOUNTS_ENABLED": "false",
    "APP_ORIGIN": "https://beta.klick.ranimontagna.com",
```

por:

```jsonc
  // Um Durable Object com SQLite por conta (spec 8.2). As migrações valem para os dois ambientes; cada um tem o próprio namespace.
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AccountStore"] }],
  "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
  "ratelimits": [
    { "name": "API_BURST", "namespace_id": "1101", "simple": { "limit": 120, "period": 60 } },
    { "name": "OTP_BURST", "namespace_id": "1102", "simple": { "limit": 5, "period": 60 } }
  ],
  "vars": {
    "ACCOUNTS_ENABLED": "false",
    "APP_ORIGIN": "https://beta.klick.ranimontagna.com",
```

2. Troque:

```jsonc
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
      "ratelimits": [{ "name": "API_BURST", "namespace_id": "2101", "simple": { "limit": 120, "period": 60 } }],
      "vars": {
        "ACCOUNTS_ENABLED": "false",
        "APP_ORIGIN": "https://klick.ranimontagna.com",
```

por:

```jsonc
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
      "ratelimits": [
        { "name": "API_BURST", "namespace_id": "2101", "simple": { "limit": 120, "period": 60 } },
        { "name": "OTP_BURST", "namespace_id": "2102", "simple": { "limit": 5, "period": 60 } }
      ],
      "vars": {
        "ACCOUNTS_ENABLED": "false",
        "APP_ORIGIN": "https://klick.ranimontagna.com",
```

- [ ] **Step 6: Rode os testes e os tipos**

Run: `pnpm test:worker`
Expected: PASS (3 + 8 + 7 + 9 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add worker/migrations/0002_limits.sql worker/abuse.ts worker/mail.ts worker/env.ts worker/router.ts wrangler.jsonc vitest.worker.config.ts tests/worker/helpers.ts tests/worker/abuse.test.ts
git commit -m "feat(worker): Turnstile, limites de pedido de código e o envio pelo Resend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Portão C: Resend, DNS, Turnstile e segredos, antes do envio de e-mail de verdade

Spec: seções 3 (D13), 7.4, 8.4 e 13 ("antes da etapa 4: criar a conta no Resend; o DNS o Claude configura pela Cloudflare"); decisão 26 do começo deste plano.

Até aqui, os testes usam o carteiro falso, e o beta não manda e-mail (sem `RESEND_API_KEY`, o `missingMailer` falha e o log registra `mail-failed`). **PARE e peça ao Ranielli** o que só ele pode fazer. As tarefas seguintes podem seguir na máquina enquanto isso.

- [ ] **Step 1: PARE. Peça ao Ranielli**

Mande: "Para o código de entrar chegar por e-mail, preciso de você em três painéis (nenhuma chave passa por mim): (1) Resend: crie a conta no plano grátis, adicione o domínio `klick.ranimontagna.com` e me mande os registros de DNS que ele mostrar (só os registros, que são públicos); crie uma API key só de envio e, no terminal, dentro de `app/`, rode `npx wrangler secret put RESEND_API_KEY` e `npx wrangler secret put RESEND_API_KEY --env production`, colando a chave quando ele pedir. (2) Turnstile: crie um widget no modo invisível com os hostnames `beta.klick.ranimontagna.com` e `klick.ranimontagna.com`, me mande a site key (pública) e rode `npx wrangler secret put TURNSTILE_SECRET` e `npx wrangler secret put TURNSTILE_SECRET --env production` com a secret key. (3) Me avise quando terminar."

- [ ] **Step 2: Depois da resposta, o DNS**

Pelo MCP da Cloudflare, na zona `ranimontagna.com`, crie exatamente os registros que o Resend pediu (o SPF e o MX do subdomínio de envio e o TXT do DKIM, `resend._domainkey.klick`), e o DMARC: TXT `_dmarc.klick.ranimontagna.com` com `v=DMARC1; p=none; adkim=r; aspf=r`. Confira no painel do Resend que o domínio ficou verificado.

- [ ] **Step 3: O segredo do Better Auth, pelo Ranielli**

O Claude não grava segredo em sistema nenhum. Peça ao Ranielli para rodar no terminal dele, dentro de `app/`, as duas linhas abaixo (o segredo nasce e vai direto para a Cloudflare, sem aparecer em lugar nenhum):

```bash
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET --env production
```

Expected (ele confirma): "Success! Uploaded secret BETTER_AUTH_SECRET" nas duas. Confira só os nomes com `npx wrangler secret list` e `npx wrangler secret list --env production`.

- [ ] **Step 4: A site key no wrangler.jsonc**

Em `app/wrangler.jsonc`, troque nas duas linhas `"TURNSTILE_SITE_KEY": "1x00000000000000000000BB",` (a de cima e a de `env.production`) o valor pela site key que o Ranielli mandou. Rode `pnpm exec vitest run tests/unit/wrangler-config.test.ts` (PASS) e commite:

```bash
git add wrangler.jsonc
git commit -m "chore(worker): a site key do Turnstile de verdade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: As tabelas no D1 da nuvem e o deploy do beta (com o Portão B feito)**

Run: `npx wrangler d1 migrations apply DB --remote` e `npx wrangler d1 migrations apply DB --remote --env production`
Expected: as duas migrações (`0001_auth.sql` e `0002_limits.sql`) aplicadas em cada banco.

Se a Task 17 já está feita, os buckets dela (Step 8) precisam existir antes deste deploy.

Run: `pnpm build && npx wrangler deploy`
Expected: o beta sobe com a conta ainda desligada (`/api/health` diz `accounts: false`). A conta liga no beta na Task 19.

---

### Task 11: O repositório do sync: a fila que sobe, o lote que chega e o primeiro login

Spec: seções 5.3, 6.1 (passos 1 e 4), 6.3, 6.4, 6.5, 6.6 e 7.6; decisões 5, 6 e 12 do começo deste plano; Review Focus 1.

**Files:**
- Modify: `app/src/data/repository.ts`
- Test: `app/tests/unit/repository-sync.test.ts`

**Interfaces:**
- Consumes: `applyChanges`, `RecordView` (Task 3); `checkChange` (Task 2); `toChange`, `fromChange`, `prefToChange`, `changeToPref` (Task 2); `SYNC_STORES`, `syncKey`, `Change`, `OutboxEntry`, `SyncState` (Task 1); `SyncCtx`, `getSyncState`, `saveSyncState`, `defaultSyncState` e a fila preenchida pelas gravações (Task 5).
- Produces (no `Repository`):
  - `outboxBatch(limit: number): Promise<{ changes: Change[]; sent: OutboxEntry[] }>` (as mais antigas primeiro, cada uma com o registro atual);
  - `confirmSent(sent: readonly OutboxEntry[]): Promise<void>` (só sai da fila o que não mudou durante o pedido);
  - `outboxCount(): Promise<number>`;
  - `countRemoteDeletions(changes: readonly unknown[]): Promise<number>` (quantos solves ativos daqui o lote apagaria; não grava);
  - `applyRemote(changes: readonly unknown[], serverTime: number): Promise<RemoteResult>` (`RemoteResult { applied: number; rejected: number }`): junta no modo `'client'`, põe na fila o que a cascata mudou (`derived`), sobe o relógio até a hora do servidor e as datas recebidas e avisa as telas, desta aba e das outras, com a origem `'remote'`;
  - `enqueueAll(): Promise<void>`;
  - `dedupeFirstLogin(): Promise<{ solves: number; sessions: number }>` (o solve daqui igual a um da conta pela marca evento, instante, tempo, penalidade e embaralhamento, e a sessão daqui vazia com o nome padrão de um evento que a conta já tem, ganham marca de exclusão e saem da fila);
  - `wipeData(): Promise<void>` (solves, sessões, treino, ajustes da conta, fila e cópias; ficam os ajustes do aparelho e o relógio);
  - `raise(at: number): void` no `SyncCtx`.

O aviso das telas: um lote que chega é uma mudança de fora (`'remote'`), mesmo nesta aba, porque a memória do `AppState` não sabe dele.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/repository-sync.test.ts`:

```ts
import type { IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import { seasonOne } from '../../src/core/season';
import { toChange } from '../../src/core/sync/records';
import type { Change } from '../../src/core/sync/types';
import type { SeasonProgress } from '../../src/core/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, type ChangeKind, type ChangeOrigin, type Repository } from '../../src/data/repository';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const ns = (sessionId: string, ms: number, at = t) => ({ sessionId, event: '333' as const, ms, penalty: null, at, scramble: "R U R'" });

async function fresh(account: string | null = 'conta-1'): Promise<{ db: IDBPDatabase<KlickDB>; repo: Repository }> {
  const db = await openKlickDb(`sync-repo-${++n}`);
  const repo = createRepository(db, { now, channel: null });
  if (account) await repo.saveSyncState({ accountId: account, signedIn: true });
  return { db, repo };
}

// Um solve como chega do servidor (o envelope da spec 6.1).
const remoteSolve = (id: string, sessionId: string, o: Partial<Change> & { note?: string; ms?: number; at?: number } = {}): Change => ({
  store: 'solves',
  id,
  data: { sessionId, event: '333', ms: o.ms ?? 9000, penalty: null, at: o.at ?? t, scramble: "R U R'", note: o.note ?? '', createdAt: t },
  updatedAt: o.updatedAt ?? t,
  deletedAt: o.deletedAt ?? null,
  deletionStamp: o.deletionStamp ?? t,
});
const remoteSession = (id: string, o: Partial<Change> & { name?: string } = {}): Change => ({
  store: 'sessions',
  id,
  data: { name: o.name ?? 'Da conta', event: '333', order: 0, createdAt: t },
  updatedAt: o.updatedAt ?? t,
  deletedAt: o.deletedAt ?? null,
  deletionStamp: o.deletionStamp ?? t,
});

describe('a fila no envio (spec 5.3 e 6.1)', () => {
  it('o lote sai da mais antiga para a mais nova, com o registro atual; só sai da fila o que não mudou durante o pedido', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    t += 10;
    const a = await repo.addSolve(ns(s.id, 1000));
    const batch = await repo.outboxBatch(500);
    expect(batch.changes.map((c) => `${c.store}/${c.id}`)).toEqual([`sessions/${s.id}`, `solves/${a.id}`]);
    expect(batch.changes[1]).toEqual(toChange('solves', (await db.get('solves', a.id))!));
    t += 10;
    await repo.updateSolve(a.id, { note: 'durante o pedido' });
    await repo.confirmSent(batch.sent);
    expect(await db.getAllKeys('outbox')).toEqual([`solves/${a.id}`]);
    expect(await repo.outboxCount()).toBe(1);
    expect((await repo.outboxBatch(1)).changes).toHaveLength(1);
  });
});

describe('juntar um lote do servidor (spec 6.1 e 6.3)', () => {
  it('o mais novo vence de cada lado; o relógio sobe com o servidor; a tela relê como mudança de fora', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const mine = await repo.addSolve(ns(s.id, 1000));
    await repo.updateSolve(mine.id, { note: 'daqui, mais nova' });
    const heard: [ChangeKind, ChangeOrigin][] = [];
    repo.onChange((k, o) => heard.push([k, o]));
    const result = await repo.applyRemote(
      [remoteSolve(mine.id, s.id, { note: 'velha', updatedAt: t - 5000 }), remoteSolve('novo', s.id, { updatedAt: t + 50 })],
      t + 3_600_000,
    );
    expect(result).toEqual({ applied: 1, rejected: 0 });
    expect((await db.get('solves', mine.id))?.note).toBe('daqui, mais nova');
    expect((await db.get('solves', 'novo'))?.ms).toBe(9000);
    expect((await repo.getSyncState()).clock).toBe(t + 3_600_000);
    expect(heard).toEqual([['solves', 'remote']]);
    expect(await db.getAllKeys('outbox')).not.toContain('solves/novo'); // o que veio do servidor não volta para lá
  });

  it('a exclusão que chega vence a edição daqui (D5), e a cascata da sessão entra na fila', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const x = await repo.addSolve(ns(s.id, 1000));
    await db.clear('outbox');
    t += 100;
    await repo.updateSolve(x.id, { note: 'edição offline' });
    const gone = t - 50; // a sessão foi apagada no outro aparelho antes desta edição
    await repo.applyRemote([remoteSession(s.id, { deletedAt: gone, deletionStamp: gone, updatedAt: gone, name: 'Sessão 1' })], t);
    expect((await db.get('sessions', s.id))?.deletedAt).toBe(gone);
    expect(await db.get('solves', x.id)).toMatchObject({ deletedAt: gone, note: 'edição offline' });
    expect(await db.getAllKeys('outbox')).toContain(`solves/${x.id}`);
  });

  it('conta os solves ativos que o lote apagaria, sem gravar nada', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    const later = t + 1000;
    const batch = [a, b].map((x) => remoteSolve(x.id, s.id, { deletedAt: later, deletionStamp: later, updatedAt: later }));
    expect(await repo.countRemoteDeletions(batch)).toBe(2);
    expect((await db.get('solves', a.id))?.deletedAt).toBeNull();
  });

  it('a temporada do servidor é adotada, a não ser que a daqui ainda espere na fila (spec 6.4)', async () => {
    const { db, repo } = await fresh();
    const theirs: SeasonProgress = { current: { ...seasonOne(), n: 2 }, past: [{ n: 1, startedAt: 0, endedAt: t, solves: 1000, startAo12: null, endAo12: null }] };
    const change: Change = { store: 'prefs', id: 'season', data: theirs, updatedAt: t - 10, deletedAt: null, deletionStamp: t - 10 };
    await repo.applyRemote([change], t);
    expect((await repo.getProfile()).season.past).toHaveLength(1);
    await repo.advanceSeason(2, { n: 2, startedAt: t, endedAt: t + 1, solves: 50, startAo12: null, endAo12: null }, { ...seasonOne(), n: 3 });
    await repo.applyRemote([{ ...change, updatedAt: t + 99, deletionStamp: t + 99 }], t + 100);
    expect((await repo.getProfile()).season.past).toHaveLength(2); // a daqui sobe primeiro; o servidor decide
    await db.clear('outbox');
    await repo.applyRemote([{ ...change, updatedAt: t + 200, deletionStamp: t + 200 }], t + 200);
    expect((await repo.getProfile()).season.past).toHaveLength(1);
  });

  it('uma mudança torta é ignorada e contada', async () => {
    const { repo } = await fresh();
    expect(await repo.applyRemote([{ store: 'solves', id: 'x', data: {}, updatedAt: 1, deletedAt: null, deletionStamp: 1 }, null], t)).toEqual({
      applied: 0,
      rejected: 2,
    });
  });
});

describe('primeiro login num aparelho com dados (spec 6.5)', () => {
  it('o solve daqui igual a um da conta, com outro id, e a "Sessão 1" vazia de um evento que a conta tem, saem sem subir', async () => {
    const { db, repo } = await fresh();
    const local = await repo.createSession({ event: '333' }); // "Sessão 1", deste aparelho
    const extra = await repo.createSession({ event: '333', name: 'Treino daqui' });
    const twin = await repo.addSolve(ns(extra.id, 9000, t - 99)); // o mesmo csTimer importado antes, com id diferente
    const own = await repo.addSolve(ns(extra.id, 12_000, t - 50));
    await repo.enqueueAll();
    expect((await db.getAllKeys('outbox')).length).toBe(4);
    // A conta inteira chega (pull) antes de subir qualquer coisa.
    await repo.applyRemote([remoteSession('conta-s'), remoteSolve('conta-x', 'conta-s', { ms: 9000, at: t - 99 })], t);
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 1, sessions: 1 });
    expect((await db.get('solves', twin.id))?.deletedAt).not.toBeNull();
    expect((await db.get('sessions', local.id))?.deletedAt).not.toBeNull();
    expect(((await db.getAllKeys('outbox')) as string[]).sort()).toEqual([`sessions/${extra.id}`, `solves/${own.id}`].sort());
    expect((await repo.listSolves()).map((s) => s.id).sort()).toEqual(['conta-x', own.id].sort());
  });
});

describe('apagar os dados deste aparelho (spec 7.6 e 7.7)', () => {
  it('limpa dados, fila e cópias; ficam os ajustes do aparelho e o relógio', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    await repo.saveProfile({ settings: { theme: 'dark' }, trail: [true, false, false, false, false, false, false, false, false], currentSessionId: s.id });
    await repo.saveBackup({ id: 'b', createdAt: t, reason: 'manual', solveCount: 1, encoding: 'json', payload: '{}' });
    const clock = (await repo.getSyncState()).clock;
    await repo.wipeData();
    expect(await repo.listSolves({ includeDeleted: true })).toEqual([]);
    expect(await repo.listSessions({ includeDeleted: true })).toEqual([]);
    expect(await repo.listBackups()).toEqual([]);
    expect(await db.getAllKeys('outbox')).toEqual([]);
    const p = await repo.getProfile();
    expect([p.settings.theme, p.trail[0], p.currentSessionId]).toEqual(['dark', false, null]);
    expect(await repo.getSyncState()).toMatchObject({ accountId: null, signedIn: false, cursor: 0, clock });
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/repository-sync.test.ts`
Expected: FAIL (8 testes): `TypeError: repo.outboxBatch is not a function` (e o mesmo para `applyRemote`, `countRemoteDeletions`, `enqueueAll` e `wipeData`).

- [ ] **Step 3: Os métodos do sync no repositório**

Tudo o que lê e grava registros passa pela mesma transação de `syncWrite` (Task 5): o relógio e a fila mudam junto com os dados ou não mudam.

Em `app/src/data/repository.ts`:

1. Troque:

```ts
// Leitura: o que sai do IndexedDB já é cópia. Os padrões (perfil e meta) são montados novos a cada chamada, nunca compartilhados.
import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb';
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { canonicalJson } from '../core/sync/merge';
import { defaultPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import { changeToPref, fromChange, prefToChange, toChange } from '../core/sync/records';
import { restoreChanges } from '../core/sync/restore';
import { syncKey, type Change, type DeviceProfile, type PrefItem, type SyncState, type SyncStore } from '../core/sync/types';
import { practiceFrom } from '../core/trail/validate';
import { defaultSettings } from '../core/types';
import type { EventId, KlickExport, Meta, Penalty, Practice, Profile, ProfilePatch, SeasonRecord, SeasonState, Session, Solve } from '../core/types';
```

por:

```ts
// Leitura: o que sai do IndexedDB já é cópia. Os padrões (perfil e meta) são montados novos a cada chamada, nunca compartilhados.
import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb';
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { applyChanges, type RecordView } from '../core/sync/apply';
import { canonicalJson } from '../core/sync/merge';
import { defaultPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import { changeToPref, fromChange, prefToChange, toChange } from '../core/sync/records';
import { restoreChanges } from '../core/sync/restore';
import { SYNC_STORES, syncKey, type Change, type DeviceProfile, type OutboxEntry, type PrefItem, type SyncState, type SyncStore } from '../core/sync/types';
import { practiceFrom } from '../core/trail/validate';
import { defaultSettings } from '../core/types';
import type { EventId, KlickExport, Meta, Penalty, Practice, Profile, ProfilePatch, SeasonRecord, SeasonState, Session, Solve } from '../core/types';
```

2. Troque:

```ts
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'sync' | 'all';
// De onde veio o aviso: 'local' é desta aba (já está na memória de quem gravou); 'remote' é de outra aba (o canal).
export type ChangeOrigin = 'local' | 'remote';
// `solveIds` vem só nos avisos de solves: quais mudaram (gravados, editados, excluídos, restaurados ou apagados de vez). Sem ele (aviso
// de uma versão antiga do app, ou mudança grande demais), quem ouve relê todos os solves.
```

por:

```ts
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'sync' | 'all';
// De onde veio o aviso: 'local' é desta aba (já está na memória de quem gravou); 'remote' é de outra aba (o canal) ou do servidor (o que o
// sync acabou de juntar: a memória desta aba também precisa reler).
export type ChangeOrigin = 'local' | 'remote';
// `solveIds` vem só nos avisos de solves: quais mudaram (gravados, editados, excluídos, restaurados ou apagados de vez). Sem ele (aviso
// de uma versão antiga do app, ou mudança grande demais), quem ouve relê todos os solves.
```

3. Troque:

```ts
  advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>;
  getMeta(): Promise<Meta>; // padrão se ausente (deviceId novo), gravado na primeira leitura
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  getSyncState(): Promise<SyncState>; // o bloco sync do meta (spec 5.4); o padrão antes do primeiro login
  // Muda o estado do sync e avisa 'sync'. O relógio só sobe: um clock menor que o gravado é ignorado.
  saveSyncState(patch: Partial<SyncState>): Promise<SyncState>;
```

por:

```ts
  advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>;
  getMeta(): Promise<Meta>; // padrão se ausente (deviceId novo), gravado na primeira leitura
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  // --- Sync (spec 5.3 e 6) ---
  // Até `limit` entradas da fila, as mais antigas primeiro, com o registro atual de cada uma: várias edições do mesmo registro sobem uma vez.
  outboxBatch(limit: number): Promise<{ changes: Change[]; sent: OutboxEntry[] }>;
  confirmSent(sent: readonly OutboxEntry[]): Promise<void>; // tira da fila as entradas que não mudaram desde que saíram
  outboxCount(): Promise<number>;
  countRemoteDeletions(changes: readonly unknown[]): Promise<number>; // quantos solves ativos daqui o lote apagaria (spec 6.6)
  // Junta um lote do servidor (applyChanges, no modo do aparelho): grava o que muda, põe na fila o que a cascata mudou, sobe o relógio e
  // avisa as telas (desta aba e das outras) como uma mudança de fora.
  applyRemote(changes: readonly unknown[], serverTime: number): Promise<RemoteResult>;
  enqueueAll(): Promise<void>; // primeiro login (spec 6.5): todo registro daqui entra na fila
  // Depois de baixar a conta inteira no primeiro login (spec 6.5): um solve daqui igual a um da conta, com outro id, e uma sessão daqui vazia
  // com o nome padrão, de um evento que já tem sessão na conta, recebem marca de exclusão e saem da fila. "Daqui" é o que está na fila.
  dedupeFirstLogin(): Promise<{ solves: number; sessions: number }>;
  // Apaga os dados deste aparelho (spec 7.6 e 7.7): solves, sessões, treino, conta, fila e cópias. Ficam os ajustes do aparelho; o estado
  // do sync volta ao padrão, com o relógio.
  wipeData(): Promise<void>;
  getSyncState(): Promise<SyncState>; // o bloco sync do meta (spec 5.4); o padrão antes do primeiro login
  // Muda o estado do sync e avisa 'sync'. O relógio só sobe: um clock menor que o gravado é ignorado.
  saveSyncState(patch: Partial<SyncState>): Promise<SyncState>;
```

4. Troque:

```ts
interface SyncCtx {
  stamp(): number; // a data desta escrita, uma só por transação: max(agora, clock + 1), nunca menor que uma data já vista (spec 5.4)
  track(store: SyncStore, id: string): Promise<void>; // põe o registro na fila de saída, se o aparelho tem conta (spec 5.3)
}
const metaOrNew = (stored: Meta | undefined, at: number): Meta =>
  stored ? { ...META_DEFAULTS, ...stored } : { ...META_DEFAULTS, deviceId: newId(at) };
```

por:

```ts
interface SyncCtx {
  stamp(): number; // a data desta escrita, uma só por transação: max(agora, clock + 1), nunca menor que uma data já vista (spec 5.4)
  track(store: SyncStore, id: string): Promise<void>; // põe o registro na fila de saída, se o aparelho tem conta (spec 5.3)
  raise(at: number): void; // o relógio sobe até `at` (a hora do servidor e as datas recebidas, spec 5.4)
}

// Um lote do servidor, como o motor recebe e o repositório junta (spec 6.1).
export interface RemoteResult {
  applied: number; // registros que mudaram aqui
  rejected: number; // mudanças tortas, ignoradas
}

// Uma mudança é da store `store` e tem id de texto (o resto, applyChanges confere).
const isKeyed = (c: unknown): c is Change =>
  typeof c === 'object' && c !== null && (SYNC_STORES as readonly unknown[]).includes((c as Change).store) && typeof (c as Change).id === 'string';
const sessionIdOf = (c: Change): string | null => {
  const d = c.data as { sessionId?: unknown } | null;
  return typeof d === 'object' && d !== null && typeof d.sessionId === 'string' ? d.sessionId : null;
};
// A marca de um solve para a deduplicação do primeiro login (spec 6.5): evento, instante, tempo, penalidade e embaralhamento.
const fingerprint = (s: Solve): string => JSON.stringify([s.event, s.at, s.ms, s.penalty, s.scramble]);
const metaOrNew = (stored: Meta | undefined, at: number): Meta =>
  stored ? { ...META_DEFAULTS, ...stored } : { ...META_DEFAULTS, deviceId: newId(at) };
```

5. Troque:

```ts
        track: async (store, id) => {
          if (state.accountId !== null) await outbox.put({ store, id, queuedAt: clock }, syncKey(store, id));
        },
      };
      const result = await work(tx, ctx);
      if (clock !== state.clock) await meta.put({ ...state, clock }, 'sync');
```

por:

```ts
        track: async (store, id) => {
          if (state.accountId !== null) await outbox.put({ store, id, queuedAt: clock }, syncKey(store, id));
        },
        raise: (to) => {
          if (Number.isFinite(to)) clock = Math.max(clock, to);
        },
      };
      const result = await work(tx, ctx);
      if (clock !== state.clock) await meta.put({ ...state, clock }, 'sync');
```

6. Troque:

```ts
    });
    if (changed) announceSolves([id]);
    return bareSolve(solve);
  }

  // O perfil gravado agora, dentro da transação (as duas stores).
```

por:

```ts
    });
    if (changed) announceSolves([id]);
    return bareSolve(solve);
  }

  // Os registros daqui que um lote toca, lidos antes (spec 6.3): os do lote, as sessões afetadas e todos os solves delas. applyChanges é
  // síncrono; a vista é um mapa.
  async function loadView(tx: IDBPTransaction<KlickDB, StoreNames<KlickDB>[], 'readonly' | 'readwrite'>, changes: readonly unknown[]): Promise<RecordView> {
    const records = new Map<string, Change>();
    const bySession = new Map<string, Change[]>();
    const recordOf = async (store: SyncStore, id: string): Promise<Change | undefined> => {
      if (store === 'prefs') {
        const item = await tx.objectStore('prefs').get(id);
        return item && prefToChange(item);
      }
      const rec = await tx.objectStore(store).get(id);
      return rec && toChange(store, rec);
    };
    const sessions = new Set<string>();
    const keyed = changes.filter(isKeyed);
    await Promise.all(
      keyed.map(async (c) => {
        const rec = await recordOf(c.store, c.id);
        if (rec) records.set(syncKey(c.store, c.id), rec);
        if (c.store === 'sessions') sessions.add(c.id);
        const sid = c.store === 'solves' ? sessionIdOf(c) : null;
        if (sid) sessions.add(sid);
      }),
    );
    await Promise.all(
      [...sessions].map(async (sid) => {
        const session = await recordOf('sessions', sid);
        if (session) records.set(syncKey('sessions', sid), session);
        const solves = (await tx.objectStore('solves').index('bySession').getAll(keyRange(sid))).map((s) => toChange('solves', s));
        bySession.set(sid, solves);
        for (const s of solves) records.set(syncKey('solves', s.id), s);
      }),
    );
    return { get: (store, id) => records.get(syncKey(store, id)), solvesOf: (sid) => bySession.get(sid) ?? [] };
  }

  // O aviso do que o sync mudou: chega às telas desta aba como mudança de fora ('remote') e vai às outras pelo canal.
  function announceSynced(writes: readonly { store: SyncStore; id: string }[]): void {
    const solveIds = writes.filter((c) => c.store === 'solves').map((c) => c.id);
    const kinds = new Set(writes.map((c) => c.store));
    if (solveIds.length > 0) {
      const ids = solveIds.length <= MAX_NOTIFY_IDS ? solveIds : undefined;
      if (!closed) emit('solves', 'remote', ids);
      post(ids ? { kind: 'solves', solveIds: ids } : { kind: 'solves' });
    }
    const others: ChangeKind[] = [];
    if (kinds.has('sessions')) others.push('sessions');
    if (kinds.has('practice')) others.push('practice');
    if (kinds.has('prefs')) others.push('profile');
    for (const kind of others) {
      if (!closed) emit(kind, 'remote');
      post({ kind });
    }
  }

  // O perfil gravado agora, dentro da transação (as duas stores).
```

7. Troque:

```ts
      });
      announce('meta');
      return meta;
    },

    async getSyncState() {
```

por:

```ts
      });
      announce('meta');
      return meta;
    },

    async outboxBatch(limit) {
      return read(['outbox', 'solves', 'sessions', 'practice', 'prefs'], async (tx) => {
        const sent = await tx.objectStore('outbox').index('byQueued').getAll(undefined, limit);
        const changes: Change[] = [];
        for (const e of sent) {
          if (e.store === 'prefs') {
            const item = await tx.objectStore('prefs').get(e.id);
            if (item) changes.push(prefToChange(item));
          } else {
            const rec = await tx.objectStore(e.store).get(e.id);
            if (rec) changes.push(toChange(e.store, rec));
          }
        }
        return { changes, sent };
      });
    },

    async confirmSent(sent) {
      await write(['outbox'], async (tx) => {
        const outbox = tx.objectStore('outbox');
        for (const e of sent) {
          const key = syncKey(e.store, e.id);
          const now = await outbox.get(key);
          if (now && now.queuedAt === e.queuedAt) await outbox.delete(key); // mudou durante o pedido: fica para o próximo
        }
      });
    },

    async outboxCount() {
      return db.count('outbox');
    },

    async countRemoteDeletions(changes) {
      return read(['solves', 'sessions', 'practice', 'prefs', 'outbox'], async (tx) => {
        const view = await loadView(tx, changes);
        const waiting = new Set(await tx.objectStore('outbox').getAllKeys());
        return applyChanges(view, changes, { mode: 'client', pending: (s, id) => waiting.has(syncKey(s, id)) }).deletedSolves;
      });
    },

    async applyRemote(changes, serverTime) {
      const outcome = await syncWrite(['solves', 'sessions', 'practice', 'prefs'], async (tx, ctx) => {
        const view = await loadView(tx, changes);
        const waiting = new Set(await tx.objectStore('outbox').getAllKeys());
        const result = applyChanges(view, changes, { mode: 'client', pending: (s, id) => waiting.has(syncKey(s, id)) });
        ctx.raise(serverTime);
        for (const c of changes.filter(isKeyed)) ctx.raise(Math.max(Number(c.updatedAt), Number(c.deletionStamp)));
        for (const c of result.writes) {
          if (c.store === 'prefs') await tx.objectStore('prefs').put(changeToPref(c));
          else if (c.store === 'solves') await tx.objectStore('solves').put(fromChange<StoredSolve>(c));
          else if (c.store === 'sessions') await tx.objectStore('sessions').put(fromChange<StoredSession>(c));
          else await tx.objectStore('practice').put(fromChange<StoredPractice>(c));
        }
        for (const key of result.derived) {
          const [store, ...rest] = key.split('/');
          await ctx.track(store as SyncStore, rest.join('/'));
        }
        return result;
      });
      announceSynced(outcome.writes);
      return { applied: outcome.writes.length, rejected: outcome.rejected.length };
    },

    async enqueueAll() {
      await syncWrite(['solves', 'sessions', 'practice', 'prefs'], async (tx, ctx) => {
        const [solves, sessions, practice, prefs] = await Promise.all([
          tx.objectStore('solves').getAllKeys(),
          tx.objectStore('sessions').getAllKeys(),
          tx.objectStore('practice').getAllKeys(),
          tx.objectStore('prefs').getAllKeys(),
        ]);
        await each(solves, (id) => ctx.track('solves', id));
        await each(sessions, (id) => ctx.track('sessions', id));
        await each(practice, (id) => ctx.track('practice', id));
        await each(prefs, (id) => ctx.track('prefs', id));
      });
    },

    async dedupeFirstLogin() {
      const outcome = await syncWrite(['solves', 'sessions'], async (tx, ctx) => {
        const outbox = tx.objectStore('outbox');
        const waiting = new Set(await outbox.getAllKeys());
        const mine = (store: SyncStore, id: string): boolean => waiting.has(syncKey(store, id));
        const solves = tx.objectStore('solves');
        const sessions = tx.objectStore('sessions');
        const live = (await solves.getAll()).filter((s) => s.deletedAt === null);
        const theirs = new Set(live.filter((s) => !mine('solves', s.id)).map(fingerprint));
        const twins = live.filter((s) => mine('solves', s.id) && theirs.has(fingerprint(s)));
        const at = twins.length > 0 ? ctx.stamp() : 0;
        for (const s of twins) {
          await solves.put({ ...s, deletedAt: at, updatedAt: at, deletionStamp: at });
          await outbox.delete(syncKey('solves', s.id)); // a marca não sobe: o solve da conta é o mesmo
        }
        const gone = new Set(twins.map((s) => s.id));
        const used = new Set(live.filter((s) => !gone.has(s.id)).map((s) => s.sessionId));
        const allSessions = (await sessions.getAll()).filter((s) => s.deletedAt === null);
        const accountEvents = new Set(allSessions.filter((s) => !mine('sessions', s.id)).map((s) => s.event));
        const empty = allSessions.filter(
          (s) => mine('sessions', s.id) && !used.has(s.id) && T.session.defaultNameNumber(s.name) !== null && accountEvents.has(s.event),
        );
        const stamp = empty.length > 0 ? ctx.stamp() : 0;
        for (const s of empty) {
          await sessions.put({ ...s, deletedAt: stamp, updatedAt: stamp, deletionStamp: stamp });
          await outbox.delete(syncKey('sessions', s.id));
        }
        return { solves: twins.map((s) => s.id), sessions: empty.map((s) => s.id) };
      });
      announceSynced([...outcome.solves.map((id) => ({ store: 'solves' as const, id })), ...outcome.sessions.map((id) => ({ store: 'sessions' as const, id }))]);
      return { solves: outcome.solves.length, sessions: outcome.sessions.length };
    },

    async wipeData() {
      await write(['solves', 'sessions', 'practice', 'prefs', 'outbox', 'backups', 'profile', 'meta'], async (tx) => {
        await Promise.all(['solves', 'sessions', 'practice', 'prefs', 'outbox', 'backups'].map((name) => tx.objectStore(name as 'solves').clear()));
        const device = await tx.objectStore('profile').get('current');
        if (device) await tx.objectStore('profile').put({ ...device, currentSessionId: null }, 'current');
        const meta = tx.objectStore('meta');
        const state = syncStateOrDefault((await meta.get('sync')) as SyncState | undefined);
        await meta.put({ ...defaultSyncState(), clock: state.clock }, 'sync');
      });
      announce('all', 'sync');
    },

    async getSyncState() {
```

- [ ] **Step 4: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/repository-sync.test.ts`
Expected: PASS (8 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/repository.ts tests/unit/repository-sync.test.ts
git commit -m "feat(sync): o repositório junta lotes do servidor, com a fila e o primeiro login

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: O motor do sync

Spec: seções 6.1, 6.2 ("nunca durante um solve"), 6.5 e 6.6; decisões 4, 14 e 20 do começo deste plano; Review Focus 1, 3 e 5.

**Files:**
- Create: `app/src/sync/api.ts`, `app/src/sync/engine.ts`
- Test: `app/tests/unit/sync-engine.test.ts`

**Interfaces:**
- Consumes: os métodos do sync do `Repository` (Tasks 5 e 11); `FakeServer`, `MapView` (Task 3); `SYNC_BATCH`, `SYNC_PROTOCOL`, `SyncRequest`, `SyncResponse` (Task 1).
- Produces (em `sync/api.ts`): `ApiErrorKind = 'offline' | 'auth' | 'update' | 'server' | 'client'`, `class ApiError { kind; status }`, `Health { accounts: boolean; turnstileSiteKey: string | null }`, `SyncApi { health(): Promise<Health | null>; sync(req): Promise<SyncResponse> }`, `Fetcher`, `createSyncApi(fetcher?, base?): SyncApi`. `health()` devolve `null` sem servidor (sem rede, ou uma resposta que não é JSON, como o `index.html` do `vite preview`).
- Produces (em `sync/engine.ts`): `RETRY_MS = [5_000, 30_000, 120_000, 300_000]`, `MASS_DELETE = 50`, `SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error'`, `SyncStatus { phase; error: 'server' | 'auth' | 'update' | null; pending; lastSyncAt; progress }`, `idleStatus()`, `EngineDeps { repo; api; backup; now?; busy?; onStatus?; schedule?; sleep?; log? }`, `SyncEngine { run(); firstLogin(account); status(); stop() }`, `createSyncEngine(deps): SyncEngine`.

Uma rodada: espera o timer parar; manda até 500 mudanças da fila com o cursor; antes de juntar a resposta, se ela apaga 50 solves ou mais, pede a cópia local; junta; tira da fila o que subiu; guarda o cursor; repete enquanto há fila ou `more`. Um 5xx agenda a próxima tentativa (5 s, 30 s, 2 min e então a cada 5 min); um 401 para com o erro de sessão; sem rede, fica "esperando rede". O primeiro login guarda a cópia, põe tudo na fila, baixa a conta inteira sem subir nada (`changes: []` até `more` acabar), deduplica e só então sobe; `firstSync` no estado do sync faz a próxima rodada continuar se o app fechar no meio.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/sync-engine.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { createBackup } from '../../src/data/safety';
import { ApiError, createSyncApi } from '../../src/sync/api';
import { createSyncEngine, MASS_DELETE, RETRY_MS, type EngineDeps, type SyncStatus } from '../../src/sync/engine';
import { FakeServer } from './sync-fakes';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const ns = (sessionId: string, ms: number, at = t) => ({ sessionId, event: '333' as const, ms, penalty: null, at, scramble: "R U R'" });

async function device(account: string | null = 'conta-1'): Promise<Repository> {
  const repo = createRepository(await openKlickDb(`engine-${++n}`), { now, channel: null });
  if (account) await repo.saveSyncState({ accountId: account, email: 'a@b.c', signedIn: true });
  return repo;
}

// O servidor falso atrás de uma "rede": a resposta é clonada, como se viesse em JSON. `fail` faz o próximo pedido falhar.
function network(server: FakeServer) {
  const calls: SyncRequest[] = [];
  let fail: ApiError | null = null;
  return {
    calls,
    failNext(err: ApiError) {
      fail = err;
    },
    api: {
      async sync(req: SyncRequest): Promise<SyncResponse> {
        calls.push(structuredClone(req));
        if (fail) {
          const err = fail;
          fail = null;
          throw err;
        }
        return structuredClone(server.sync(structuredClone(req)));
      },
    },
  };
}

function engineFor(repo: Repository, net: ReturnType<typeof network>, extra: Partial<EngineDeps> = {}) {
  const statuses: SyncStatus[] = [];
  const backups: number[] = [];
  const engine = createSyncEngine({
    repo: () => repo,
    api: net.api,
    now,
    backup: async () => {
      backups.push(t);
      await createBackup(repo, 'pre-sync', t);
    },
    onStatus: (s) => statuses.push(s),
    sleep: async () => undefined,
    log: () => undefined,
    ...extra,
  });
  return { engine, statuses, backups };
}

describe('motor do sync (spec 6.1 e 6.2)', () => {
  it('sem conta, não fala com o servidor', async () => {
    const repo = await device(null);
    const net = network(new FakeServer());
    const { engine } = engineFor(repo, net);
    expect((await engine.run()).phase).toBe('off');
    expect(net.calls).toEqual([]);
  });

  it('um solve feito num aparelho aparece no outro', async () => {
    const server = new FakeServer();
    const phone = await device();
    const desktop = await device();
    const s = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(s.id, 12_345));
    const a = engineFor(phone, network(server));
    expect(await a.engine.run()).toMatchObject({ phase: 'idle', pending: 0, error: null, lastSyncAt: t });
    await engineFor(desktop, network(server)).engine.run();
    expect((await desktop.listSolves()).map((x) => x.ms)).toEqual([12_345]);
    expect((await desktop.getSyncState()).cursor).toBe(server.rev);
  });

  it('em lotes: repete enquanto há fila ou `more`, e cada lote avança o cursor', async () => {
    const server = new FakeServer(2);
    const phone = await device();
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < 5; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    await engineFor(desktop, net).engine.run();
    expect(net.calls.map((c) => c.cursor)).toEqual([0, 2, 4]);
    expect(await desktop.listSolves()).toHaveLength(5);
  });

  it('um sync que cai no meio continua de onde parou', async () => {
    const server = new FakeServer(2);
    const phone = await device();
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < 5; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    const { engine } = engineFor(desktop, net, { schedule: () => () => undefined });
    const real = net.api.sync;
    let calls = 0;
    net.api.sync = async (req) => {
      if (++calls === 2) throw new ApiError('server', 503);
      return real(req);
    };
    expect((await engine.run()).error).toBe('server');
    expect((await desktop.getSyncState()).cursor).toBe(2);
    await engine.run();
    expect(await desktop.listSolves()).toHaveLength(5);
  });

  it('5xx: tenta de novo em 5 s, 30 s, 2 min e depois a cada 5 min; um sucesso zera', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    const waits: number[] = [];
    const queued: (() => void)[] = [];
    const { engine } = engineFor(repo, net, {
      schedule: (fn, ms) => {
        waits.push(ms);
        queued.push(fn);
        return () => undefined;
      },
    });
    for (let i = 0; i < 5; i++) {
      net.failNext(new ApiError('server', 500));
      await engine.run();
    }
    expect(waits).toEqual([...RETRY_MS, RETRY_MS[3]]);
    await engine.run(); // deu certo
    net.failNext(new ApiError('server', 500));
    await engine.run();
    expect(waits.at(-1)).toBe(RETRY_MS[0]);
  });

  it('401: erro de sessão, sem nova tentativa, e a fila guarda tudo; sem rede: esperando rede', async () => {
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    const net = network(new FakeServer());
    const schedule = vi.fn(() => () => undefined);
    const { engine } = engineFor(repo, net, { schedule });
    net.failNext(new ApiError('auth', 401));
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'auth', pending: 2 });
    expect(schedule).not.toHaveBeenCalled();
    net.failNext(new ApiError('offline', 0));
    expect(await engine.run()).toMatchObject({ phase: 'offline', error: null, pending: 2 });
  });

  it('nunca durante um solve: espera o timer parar (spec 6.2)', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    let busy = true;
    const { engine } = engineFor(repo, net, {
      busy: () => busy,
      sleep: async () => {
        expect(net.calls).toHaveLength(0);
        busy = false;
      },
    });
    await engine.run();
    expect(net.calls).toHaveLength(1);
  });

  it(`um lote que apaga ${MASS_DELETE} solves ou mais pede antes a cópia local; um menor, não (spec 6.6)`, async () => {
    const server = new FakeServer();
    const phone = await device();
    const desktop = await device();
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < MASS_DELETE; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const d = engineFor(desktop, network(server));
    await d.engine.run();
    expect(d.backups).toEqual([]);
    t += 1000;
    await phone.deleteSession(s.id);
    await engineFor(phone, network(server)).engine.run();
    await d.engine.run();
    expect(d.backups).toHaveLength(1);
    expect((await desktop.listBackups())[0].reason).toBe('pre-sync');
    expect(await desktop.listSolves()).toEqual([]);
  });

  it('a mudança recusada sai da fila e vai para o log local, só com store, id e motivo', async () => {
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    const x = await repo.addSolve(ns(s.id, 1000));
    const net = network(new FakeServer());
    const lines: string[] = [];
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real({ ...req, changes: req.changes.filter((c) => c.store !== 'solves') });
      return { ...res, rejected: [{ store: 'solves', id: x.id, reason: 'solve inválido' }] };
    };
    await engineFor(repo, net, { log: (l) => lines.push(l) }).engine.run();
    expect(lines).toEqual([`sync: o servidor recusou solves/${x.id} (solve inválido)`]);
    expect(await repo.outboxCount()).toBe(0);
  });
});

describe('primeiro login (spec 6.5)', () => {
  it('cópia antes, baixa a conta antes de subir, e o solve repetido (outro id) não sobe nem duplica', async () => {
    const server = new FakeServer(3);
    const phone = await device();
    const ps = await phone.createSession({ event: '333', name: 'Do celular' });
    for (let i = 0; i < 4; i++) await phone.addSolve(ns(ps.id, 9000 + i, t - 1000 + i));
    await engineFor(phone, network(server)).engine.run();

    // O computador tem dados de antes da conta: o mesmo csTimer importado (outros ids) e um solve só dele.
    const desktop = await device(null);
    const ds = await desktop.createSession({ event: '333', name: 'Do csTimer' });
    for (let i = 0; i < 4; i++) await desktop.addSolve({ ...ns(ds.id, 9000 + i, t - 1000 + i), id: `cs-velho-${i}` });
    await desktop.addSolve(ns(ds.id, 7777));
    const net = network(server);
    const d = engineFor(desktop, net);
    expect(await d.engine.firstLogin({ accountId: 'conta-1', email: 'a@b.c' })).toMatchObject({ phase: 'idle', pending: 0 });
    expect(d.backups).toHaveLength(1);
    const firstPush = net.calls.findIndex((c) => c.changes.length > 0);
    expect(net.calls.slice(0, firstPush).every((c) => c.changes.length === 0)).toBe(true);
    expect(net.calls[firstPush - 1].cursor).toBeGreaterThan(0); // a conta inteira chegou antes da primeira subida
    const active = [...server.active().values()].filter((c) => c.store === 'solves');
    expect(active.map((c) => (c.data as { ms: number }).ms).sort()).toEqual([7777, 9000, 9001, 9002, 9003]);
    expect((await desktop.getSyncState()).firstSync).toBe(false);
    expect(await desktop.listSolves()).toHaveLength(5);
  });

  it('se o app fecha no meio do primeiro login, a próxima rodada continua sem duplicar', async () => {
    const server = new FakeServer(2);
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    for (let i = 0; i < 3; i++) await phone.addSolve(ns(ps.id, 5000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device(null);
    const ds = await desktop.createSession({ event: '333' });
    for (let i = 0; i < 3; i++) await desktop.addSolve({ ...ns(ds.id, 5000 + i, t + i), id: `outro-${i}` });
    const net = network(server);
    const real = net.api.sync;
    let calls = 0;
    net.api.sync = async (req) => {
      if (++calls === 2) throw new ApiError('offline', 0);
      return real(req);
    };
    const d = engineFor(desktop, net);
    expect((await d.engine.firstLogin({ accountId: 'conta-1', email: 'a@b.c' })).phase).toBe('offline');
    expect((await desktop.getSyncState()).firstSync).toBe(true);
    await d.engine.run();
    expect([...server.active().values()].filter((c) => c.store === 'solves')).toHaveLength(3);
  });
});

describe('dois aparelhos migrados da versão 2 em horas diferentes (spec 5.6 e 6.5)', () => {
  // Gravado direto na versão 2 e aberto na atual (a migração), com o relógio da migração dado.
  async function migrated(trail: boolean[], migratedAt: number): Promise<Repository> {
    const name = `engine-v2-${++n}`;
    const v2 = await openKlickDb(name, {}, 2);
    const settings = { inspection: true, holdMs: 300, mobileArm: 'two', theme: 'system', sound: { klick: true, insp: true, pb: true }, silent: false, reducedMotion: 'system', dailyGoal: 20, scrambleImage: true, centro: 'animado' };
    await v2.put('profile', { settings, trail, finish: 'fosco', onboarded: true, currentSessionId: null } as never, 'current');
    v2.close();
    return createRepository(await openKlickDb(name, {}, undefined, () => migratedAt), { now, channel: null });
  }

  it('a trilha marcada no primeiro não some pelo padrão do segundo, migrado depois', async () => {
    const server = new FakeServer();
    const phone = await migrated([true, true, false, false, false, false, false, false, false], t - 3_600_000);
    const desktop = await migrated(Array<boolean>(9).fill(false), t - 60_000);
    await engineFor(phone, network(server)).engine.firstLogin({ accountId: 'conta-1', email: 'a@b.c' });
    await engineFor(desktop, network(server)).engine.firstLogin({ accountId: 'conta-1', email: 'a@b.c' });
    await engineFor(phone, network(server)).engine.run();
    expect((await desktop.getProfile()).trail.slice(0, 2)).toEqual([true, true]);
    expect((await phone.getProfile()).trail.slice(0, 2)).toEqual([true, true]);
  });
});

describe('cliente HTTP (spec 6.1)', () => {
  it('erros viram tipos: sem rede, 401, 426 e 5xx; /api/health sem servidor é null', async () => {
    const answer = (status: number) => createSyncApi(async () => new Response('{}', { status }));
    await expect(createSyncApi(async () => Promise.reject(new TypeError('rede'))).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'offline' });
    await expect(answer(401).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'auth' });
    await expect(answer(426).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'update' });
    await expect(answer(503).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'server' });
    expect(await createSyncApi(async () => new Response('<!doctype html>', { status: 200 })).health()).toBeNull();
    expect(await createSyncApi(async () => Response.json({ accounts: true, turnstileSiteKey: 'k' })).health()).toEqual({ accounts: true, turnstileSiteKey: 'k' });
  });

  it('o pedido de sync vai como JSON, na mesma origem', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const api = createSyncApi(async (url, init) => {
      seen.push({ url, init });
      return Response.json({ accepted: 0, rejected: [], changes: [], cursor: 0, more: false, serverTime: 1 });
    });
    await api.sync({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: [] });
    expect(seen[0].url).toBe('/api/sync');
    expect(seen[0].init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/sync-engine.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/sync/api"`.

- [ ] **Step 3: O cliente da API**

Crie `app/src/sync/api.ts`:

```ts
// O cliente HTTP do servidor do Klick (spec 6.1 e 8.1): mesma origem, com o cookie da sessão. Os erros viram tipos que o motor e as telas
// entendem; nada aqui guarda estado.
import type { SyncRequest, SyncResponse } from '../core/sync/types';

export type ApiErrorKind = 'offline' | 'auth' | 'update' | 'server' | 'client';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  constructor(kind: ApiErrorKind, status: number) {
    super(`api: ${kind} (${status})`);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

// O que /api/health diz: se a conta está ligada neste ambiente (spec 8.4) e a site key do Turnstile.
export interface Health {
  accounts: boolean;
  turnstileSiteKey: string | null;
}

export interface SyncApi {
  health(): Promise<Health | null>; // null: sem servidor (sem rede, ou o app servido sem o Worker, como no vite preview)
  sync(req: SyncRequest): Promise<SyncResponse>;
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const kindOf = (status: number): ApiErrorKind =>
  status === 401 ? 'auth' : status === 426 ? 'update' : status >= 500 ? 'server' : 'client';

export function createSyncApi(fetcher: Fetcher = (input, init) => fetch(input, init), base = ''): SyncApi {
  async function call(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetcher(base + path, { credentials: 'same-origin', ...init });
    } catch {
      throw new ApiError('offline', 0);
    }
    if (!res.ok) throw new ApiError(kindOf(res.status), res.status);
    return res;
  }
  const post = (path: string, body: unknown): Promise<Response> =>
    call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async health() {
      try {
        const data = (await (await call('/api/health')).json()) as Partial<Health> | null;
        if (typeof data?.accounts !== 'boolean') return null;
        return { accounts: data.accounts, turnstileSiteKey: typeof data.turnstileSiteKey === 'string' ? data.turnstileSiteKey : null };
      } catch {
        return null; // sem servidor, ou uma resposta que não é a dele (o index.html do vite preview)
      }
    },
    async sync(req) {
      return (await (await post('/api/sync', req)).json()) as SyncResponse;
    },
  };
}
```

- [ ] **Step 4: O motor**

Crie `app/src/sync/engine.ts`:

```ts
// O motor do sync no app (spec 6): manda a fila em lotes, recebe o que mudou desde o cursor, junta pelo repositório e repete enquanto
// houver fila ou `more`. Cada lote avança o cursor: um sync que cai no meio continua de onde parou. Nunca roda com o timer ocupado.
// Uma rodada por vez: quem pede durante uma rodada ganha mais uma, logo depois dela.
import { SYNC_BATCH, SYNC_PROTOCOL } from '../core/sync/types';
import type { Repository } from '../data/repository';
import { ApiError, type SyncApi } from './api';

export const RETRY_MS: readonly number[] = Object.freeze([5_000, 30_000, 120_000, 300_000]); // spec 6.6: 5 s, 30 s, 2 min e então a cada 5 min
export const MASS_DELETE = 50; // spec 6.6: um lote que apaga isso ou mais pede uma cópia local antes
const BUSY_POLL_MS = 1000;

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase; // off: sem conta, ou fora da conta
  error: 'server' | 'auth' | 'update' | null; // auth: a sessão expirou (401); update: o servidor pede um app mais novo (426)
  pending: number; // mudanças na fila de saída
  lastSyncAt: number | null;
  progress: { sent: number; total: number; received: number } | null; // durante uma rodada
}

export const idleStatus = (): SyncStatus => ({ phase: 'off', error: null, pending: 0, lastSyncAt: null, progress: null });

export interface EngineDeps {
  repo: () => Repository; // o repositório atual (o AppState troca a conexão quando o iOS a derruba)
  api: Pick<SyncApi, 'sync'>;
  backup: () => Promise<void>; // a cópia local 'pre-sync' (spec 6.5 e 6.6)
  now?: () => number;
  busy?: () => boolean; // o timer está ocupado: o sync espera (spec 6.2)
  onStatus?: (s: SyncStatus) => void;
  schedule?: (fn: () => void, ms: number) => () => void; // as novas tentativas; devolve o cancelamento
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void; // o log local das mudanças recusadas (spec 6.6): store, id e motivo, nunca o conteúdo
}

export interface SyncEngine {
  run(): Promise<SyncStatus>;
  // O primeiro login neste aparelho (spec 6.5), ou juntar à conta nova (spec 7.6): cópia 'pre-sync', tudo na fila, baixa a conta inteira,
  // deduplica e só então sobe. Se o app fechar no meio, a próxima rodada continua (firstSync).
  firstLogin(account: { accountId: string; email: string }): Promise<SyncStatus>;
  status(): SyncStatus;
  stop(): void; // cancela a nova tentativa agendada; a rodada em andamento termina
}

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
};

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const now = deps.now ?? (() => Date.now());
  const schedule = deps.schedule ?? defaultSchedule;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((line: string) => console.warn(line));
  let status = idleStatus();
  let running: Promise<SyncStatus> | null = null;
  let retries = 0;
  let cancelRetry: (() => void) | null = null;
  let stopped = false;

  function set(patch: Partial<SyncStatus>): void {
    status = { ...status, ...patch };
    deps.onStatus?.(status);
  }

  async function waitIdle(): Promise<void> {
    while (deps.busy?.()) await sleep(BUSY_POLL_MS);
  }

  // Um pedido: manda até SYNC_BATCH da fila (ou nada, só recebendo) e junta a volta.
  async function exchange(push: boolean): Promise<{ more: boolean; sent: number; received: number }> {
    await waitIdle();
    const repo = deps.repo();
    const [state, meta] = await Promise.all([repo.getSyncState(), repo.getMeta()]);
    const batch = push ? await repo.outboxBatch(SYNC_BATCH) : { changes: [], sent: [] };
    const res = await deps.api.sync({ v: SYNC_PROTOCOL, deviceId: meta.deviceId, cursor: state.cursor, clock: state.clock, changes: batch.changes });
    await repo.confirmSent(batch.sent); // antes de juntar: a temporada daqui que acabou de subir deixa de estar "na fila"
    for (const r of res.rejected) log(`sync: o servidor recusou ${r.store}/${r.id} (${r.reason})`);
    if (res.changes.length >= MASS_DELETE && (await repo.countRemoteDeletions(res.changes)) >= MASS_DELETE) await deps.backup();
    await repo.applyRemote(res.changes, res.serverTime);
    await repo.saveSyncState({ cursor: res.cursor, lastSyncAt: now(), clock: res.serverTime });
    return { more: res.more, sent: batch.sent.length, received: res.changes.length };
  }

  async function round(): Promise<void> {
    const repo = deps.repo();
    const state = await repo.getSyncState();
    if (!state.signedIn || state.accountId === null) {
      set({ ...idleStatus(), pending: await repo.outboxCount() });
      return;
    }
    const progress = { sent: 0, total: await repo.outboxCount(), received: 0 };
    set({ phase: 'syncing', progress: { ...progress } });
    if (state.firstSync) {
      for (let more = true; more; ) {
        const r = await exchange(false); // a conta inteira chega antes de subir qualquer coisa
        progress.received += r.received;
        set({ progress: { ...progress } });
        more = r.more;
      }
      await repo.dedupeFirstLogin();
      await repo.saveSyncState({ firstSync: false });
      progress.total = await repo.outboxCount();
    }
    for (let guard = 0; guard < 100_000; guard++) {
      const r = await exchange(true);
      progress.sent += r.sent;
      progress.received += r.received;
      set({ progress: { ...progress } });
      if (!r.more && (await repo.outboxCount()) === 0) break;
    }
    const after = await repo.getSyncState();
    set({ phase: 'idle', error: null, pending: await repo.outboxCount(), lastSyncAt: after.lastSyncAt, progress: null });
  }

  function retryLater(): void {
    if (stopped) return;
    cancelRetry?.();
    const ms = RETRY_MS[Math.min(retries, RETRY_MS.length - 1)];
    retries += 1;
    cancelRetry = schedule(() => {
      cancelRetry = null;
      void run();
    }, ms);
  }

  async function guarded(): Promise<SyncStatus> {
    cancelRetry?.();
    cancelRetry = null;
    try {
      await round();
      retries = 0;
    } catch (err) {
      const pending = await deps.repo().outboxCount().catch(() => status.pending);
      const kind = err instanceof ApiError ? err.kind : 'server';
      if (kind === 'offline') set({ phase: 'offline', error: null, pending, progress: null }); // volta com o evento online
      else if (kind === 'auth') set({ phase: 'error', error: 'auth', pending, progress: null }); // Ajustes pede para entrar de novo
      else if (kind === 'update') set({ phase: 'error', error: 'update', pending, progress: null });
      else {
        set({ phase: 'error', error: 'server', pending, progress: null });
        retryLater();
      }
    }
    return status;
  }

  // Pedido durante uma rodada: mais uma rodada depois dela (uma só, por mais pedidos que cheguem), para nada gravado no meio ficar para trás.
  let again: Promise<SyncStatus> | null = null;
  function run(): Promise<SyncStatus> {
    if (running) {
      again ??= running.then(() => {
        again = null;
        return run();
      });
      return again;
    }
    running = guarded().finally(() => (running = null));
    return running;
  }

  return {
    run,
    async firstLogin({ accountId, email }) {
      await running; // uma rodada de antes termina antes
      const repo = deps.repo();
      await deps.backup();
      await repo.saveSyncState({ accountId, email, signedIn: true, firstSync: true, cursor: 0, lastSyncAt: null });
      await repo.enqueueAll();
      return run();
    },
    status: () => status,
    stop() {
      stopped = true;
      cancelRetry?.();
      cancelRetry = null;
    },
  };
}
```

- [ ] **Step 5: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/sync-engine.test.ts`
Expected: PASS (14 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/sync/api.ts src/sync/engine.ts tests/unit/sync-engine.test.ts
git commit -m "feat(sync): o motor do sync, com lotes, novas tentativas e o primeiro login

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Gatilhos, uma aba só e a conta no estado do app

Spec: seções 6.2, 8.4 (o app pergunta `/api/health`) e 9.6 (a região `aria-live`); decisão 14 do começo deste plano.

**Files:**
- Create: `app/src/sync/triggers.ts`, `app/src/ui/state/account.svelte.ts`
- Modify: `app/src/ui/state/app.svelte.ts` (`AppDeps.account`, `app.account`, o aviso 'sync'), `app/src/ui/state/boot.ts` (a API de verdade), `app/src/strings.ts` (`T.conta`, os anúncios)
- Create: `app/tests/unit/sync-account.ts` (apoio dos testes da conta: o ambiente manual, a API falsa sobre o `FakeServer`, o canal e um `AppState` com conta; não é arquivo de teste)
- Test: `app/tests/unit/sync-triggers.test.ts`, `app/tests/unit/account-state.test.ts`

**Interfaces:**
- Consumes: `createSyncEngine`, `SyncStatus`, `idleStatus` (Task 12); `SyncApi`, `Health` (Task 12); `getSyncState`, `defaultSyncState`, `ChangeKind` (Task 5); `ChannelLike` (o canal entre abas que o repositório já usa); `FakeServer` (Task 3).
- Produces (em `sync/triggers.ts`): `WRITE_DELAY_MS = 5_000`, `EVERY_MS = 300_000`, `LOCK_NAME = 'klick-sync'`, `TriggerEnv { onOnline; onVisible; schedule; every }`, `Triggers { wrote(); stop() }`, `startTriggers(run, env): Triggers` (ao abrir, ao voltar online, ao ficar visível, a cada 5 min e 5 s depois da última gravação), `browserTriggerEnv()`, `LocksLike`, `acquireLeadership(locks, onLeader): () => void` (sem a Web Locks API, a aba lidera sozinha).
- Produces (em `ui/state/account.svelte.ts`): `AccountDeps { api; locks?; channel?; env? }`, `AccountHost { repo(); busy(); now(); announce(text) }`, `class AccountState { available; sync; status; leader; siteKey; get signedIn; start(); checkHealth(); refresh(); changed(kind); syncNow(); stop() }`. A aba líder roda o motor; as outras pedem "agora" pelo `BroadcastChannel('klick-sync')` e recebem o estado.
- Produces (no `AppState`): `AppDeps.account?: AccountDeps | null`, `readonly account: AccountState | null`. Sem `account` nos deps (os testes de antes), nada de conta existe.
- Produces (em `tests/unit/sync-account.ts`): `manualEnv()`, `fakeApi(server, health?)`, `bus()`, `appWithAccount(api, o?)`.

O `busy` do motor é `app.timerBusy || app.trainerRunning` (decisão 14). A região `aria-live` fala só quando o sync passa a falhar e quando volta.

- [ ] **Step 1: Escreva o apoio e os testes que falham**

Crie `app/tests/unit/sync-account.ts`:

```ts
// Apoio dos testes da conta: um AppState ligado a um servidor falso, com gatilhos e canal falsos. Não é um arquivo de teste.
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import type { Health, SyncApi } from '../../src/sync/api';
import type { TriggerEnv } from '../../src/sync/triggers';
import { AppState, type AppDeps } from '../../src/ui/state/app.svelte';
import { FakeServer } from './sync-fakes';

let n = 0;

// Os gatilhos falsos: o teste dispara o "5 s depois" e o resto na mão.
export function manualEnv() {
  const delayed: (() => void)[] = [];
  const env: TriggerEnv = {
    onOnline: () => () => undefined,
    onVisible: () => () => undefined,
    schedule: (fn) => {
      delayed.push(fn);
      return () => {
        const i = delayed.indexOf(fn);
        if (i >= 0) delayed.splice(i, 1);
      };
    },
    every: () => () => undefined,
  };
  return { env, fireDelayed: () => delayed.splice(0).forEach((fn) => fn()) };
}

// A API falsa: /api/health e /api/sync, com o servidor falso de uma conta.
export function fakeApi(server: FakeServer, health: Health | null = { accounts: true, turnstileSiteKey: '1x00000000000000000000BB' }) {
  let failure: Error | null = null;
  const api: SyncApi = {
    health: async () => health,
    sync: async (req: SyncRequest): Promise<SyncResponse> => {
      if (failure) throw failure;
      return structuredClone(server.sync(structuredClone(req)));
    },
  };
  return { api, fail: (e: Error | null) => (failure = e) };
}

// Um canal entre "abas" na memória.
export function bus() {
  const members: ChannelLike[] = [];
  return () => {
    const ch: ChannelLike = {
      onmessage: null,
      postMessage(data) {
        for (const m of members) if (m !== ch) m.onmessage?.({ data });
      },
    };
    members.push(ch);
    return ch;
  };
}

export async function appWithAccount(
  api: SyncApi,
  o: { now?: () => number; signedIn?: boolean; env?: TriggerEnv; repo?: Repository; locks?: AppDeps['account'] extends infer A ? (A extends { locks?: infer L } ? L : never) : never; channel?: ChannelLike | null } = {},
): Promise<{ app: AppState; repo: Repository }> {
  const now = o.now ?? (() => Date.now());
  const repo = o.repo ?? createRepository(await openKlickDb(`conta-${++n}`), { now, channel: null });
  if (o.signedIn) await repo.saveSyncState({ accountId: 'conta-1', email: 'ranielli@exemplo.com', signedIn: true });
  const app = new AppState({
    repo,
    queue: createScrambleQueue({ generate: async () => 'R U' }),
    now,
    storage: null,
    storageManager: null,
    account: { api, env: o.env ?? manualEnv().env, locks: o.locks ?? null, channel: o.channel ?? null },
  });
  await app.init();
  return { app, repo };
}
```

Crie `app/tests/unit/sync-triggers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { acquireLeadership, EVERY_MS, startTriggers, WRITE_DELAY_MS, type LocksLike, type TriggerEnv } from '../../src/sync/triggers';

// Um ambiente falso: guarda os ouvintes e os timers, e o teste os dispara.
function fakeEnv() {
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  let online: (() => void) | null = null;
  let visible: (() => void) | null = null;
  const env: TriggerEnv = {
    onOnline: (fn) => ((online = fn), () => (online = null)),
    onVisible: (fn) => ((visible = fn), () => (visible = null)),
    schedule: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => (t.live = false);
    },
    every: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => (t.live = false);
    },
  };
  return { env, timers, fire: { online: () => online?.(), visible: () => visible?.() } };
}

describe('quando sincronizar (spec 6.2)', () => {
  it('ao abrir, ao voltar online, ao ficar visível e a cada 5 min', () => {
    const { env, timers, fire } = fakeEnv();
    let runs = 0;
    startTriggers(() => runs++, env);
    expect(runs).toBe(1);
    fire.online();
    fire.visible();
    expect(runs).toBe(3);
    const every = timers.find((t) => t.ms === EVERY_MS)!;
    every.fn();
    expect(runs).toBe(4);
  });

  it('5 s depois da ÚLTIMA gravação: gravações seguidas adiam a ida', () => {
    const { env, timers } = fakeEnv();
    let runs = 0;
    const triggers = startTriggers(() => runs++, env);
    triggers.wrote();
    triggers.wrote();
    const delays = timers.filter((t) => t.ms === WRITE_DELAY_MS);
    expect(delays.map((t) => t.live)).toEqual([false, true]);
    delays[1].fn();
    expect(runs).toBe(2);
  });

  it('parar desliga tudo', () => {
    const { env, timers, fire } = fakeEnv();
    let runs = 0;
    const triggers = startTriggers(() => runs++, env);
    triggers.wrote();
    triggers.stop();
    fire.online();
    expect(timers.every((t) => !t.live)).toBe(true);
    expect(runs).toBe(1);
  });
});

describe('uma aba só (spec 6.2): o lock klick-sync', () => {
  // Um gerenciador de locks falso, com fila, como o do navegador.
  function fakeLocks(): LocksLike {
    let held: Promise<unknown> = Promise.resolve();
    return {
      request(_name, callback) {
        const turn = held.then(() => callback());
        held = turn.catch(() => undefined);
        return turn;
      },
    };
  }

  it('a primeira aba lidera; a segunda espera e assume quando a primeira solta', async () => {
    const locks = fakeLocks();
    const leaders: string[] = [];
    const releaseA = acquireLeadership(locks, () => leaders.push('A'));
    acquireLeadership(locks, () => leaders.push('B'));
    await Promise.resolve();
    await Promise.resolve();
    expect(leaders).toEqual(['A']);
    releaseA();
    await new Promise((r) => setTimeout(r, 0));
    expect(leaders).toEqual(['A', 'B']);
  });

  it('sem a Web Locks API, a aba lidera sozinha', () => {
    const leaders: string[] = [];
    acquireLeadership(null, () => leaders.push('só'));
    expect(leaders).toEqual(['só']);
  });
});
```

Crie `app/tests/unit/account-state.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { T } from '../../src/strings';
import { ApiError } from '../../src/sync/api';
import { appWithAccount, bus, fakeApi, manualEnv } from './sync-account';
import { FakeServer } from './sync-fakes';

describe('a conta no app (spec 6.2 e 8.4)', () => {
  it('com a conta desligada no ambiente (ou sem servidor), nada de conta aparece', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null }).api);
    await vi.waitFor(() => expect(app.account!.siteKey).toBeNull());
    expect(app.account!.available).toBe(false);
    const offline = await appWithAccount(fakeApi(new FakeServer(), null).api);
    expect(offline.app.account!.available).toBe(false);
  });

  it('um aparelho que já está numa conta mostra a conta mesmo sem servidor', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer(), null).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.available).toBe(true));
    expect(app.account!.sync.email).toBe('ranielli@exemplo.com');
  });

  it('o solve feito no "iPhone" aparece no "computador" (objetivo da spec, seção 2)', async () => {
    const server = new FakeServer();
    const phone = manualEnv();
    const iphone = await appWithAccount(fakeApi(server).api, { signedIn: true, env: phone.env });
    const desktop = await appWithAccount(fakeApi(server).api, { signedIn: true });
    await iphone.app.addSolve({ ms: 10_234, penalty: null, at: Date.now() });
    phone.fireDelayed(); // 5 s depois da última gravação
    await vi.waitFor(() => expect([...server.records.keys()].some((k) => k.startsWith('solves/'))).toBe(true));
    await desktop.app.account!.syncNow();
    await vi.waitFor(() => expect(desktop.app.solves.map((s) => s.ms)).toEqual([10_234]));
    expect(desktop.app.sessions.map((s) => s.id)).toEqual(iphone.app.sessions.map((s) => s.id)); // a mesma "Sessão 1" padrão
  });

  it('a região aria-live fala só quando o sync falha e quando volta (spec 9.6)', async () => {
    const server = new FakeServer();
    const net = fakeApi(server);
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    net.fail(new ApiError('server', 500));
    await app.account!.syncNow();
    await vi.waitFor(() => expect(app.live).toBe(T.conta.syncFailedLive));
    await app.account!.syncNow(); // falha de novo: sem novo anúncio
    expect(app.live).toBe(T.conta.syncFailedLive);
    net.fail(null);
    await app.account!.syncNow();
    await vi.waitFor(() => expect(app.live).toBe(T.conta.syncBackLive));
  });

  it('uma aba só sincroniza: a outra pede "agora" pelo canal e recebe o estado (spec 6.2)', async () => {
    const server = new FakeServer();
    const make = bus();
    let leaderTaken = false;
    const locks = {
      request: (_name: string, cb: () => Promise<void>) => {
        if (leaderTaken) return new Promise(() => undefined); // a segunda aba fica na fila
        leaderTaken = true;
        return cb();
      },
    };
    const net = fakeApi(server);
    const syncs = vi.spyOn(net.api, 'sync');
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make() });
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: first.repo });
    expect([first.app.account!.leader, second.app.account!.leader]).toEqual([true, false]);
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    const before = syncs.mock.calls.length;
    await second.app.account!.syncNow();
    await vi.waitFor(() => expect(syncs.mock.calls.length).toBeGreaterThan(before));
    await vi.waitFor(() => expect(second.app.account!.status.phase).toBe('idle'));
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/sync-triggers.test.ts tests/unit/account-state.test.ts`
Expected: FAIL: `sync-triggers.test.ts` não abre (`Failed to resolve import "../../src/sync/triggers"`), e os 5 testes de `account-state.test.ts` falham com `TypeError: Cannot read properties of undefined` (`app.account` ainda não existe).

- [ ] **Step 3: Os gatilhos e a aba líder**

Crie `app/src/sync/triggers.ts`:

```ts
// Quando sincronizar (spec 6.2): ao abrir, ao voltar a ficar online ou visível, 5 s depois da última gravação, a cada 5 min com o app
// aberto e em "Sincronizar agora". Só na aba que pegou o lock 'klick-sync' (Web Locks); as outras recebem as mudanças pelo canal de sempre
// entre as abas. O motor já espera o timer parar.

export const WRITE_DELAY_MS = 5_000;
export const EVERY_MS = 300_000;
export const LOCK_NAME = 'klick-sync';

// O que os gatilhos usam do navegador. Os testes passam um falso.
export interface TriggerEnv {
  onOnline(fn: () => void): () => void;
  onVisible(fn: () => void): () => void;
  schedule(fn: () => void, ms: number): () => void;
  every(fn: () => void, ms: number): () => void;
}

export interface Triggers {
  wrote(): void; // uma gravação local ou de outra aba: o sync sai 5 s depois da última
  stop(): void;
}

export function startTriggers(run: () => void, env: TriggerEnv): Triggers {
  let pending: (() => void) | null = null;
  const stops = [env.onOnline(run), env.onVisible(run), env.every(run, EVERY_MS)];
  run(); // ao abrir
  return {
    wrote() {
      pending?.();
      pending = env.schedule(() => {
        pending = null;
        run();
      }, WRITE_DELAY_MS);
    },
    stop() {
      pending?.();
      pending = null;
      for (const s of stops) s();
    },
  };
}

// O ambiente de verdade: window, document e os timers.
export function browserTriggerEnv(): TriggerEnv {
  return {
    onOnline(fn) {
      addEventListener('online', fn);
      return () => removeEventListener('online', fn);
    },
    onVisible(fn) {
      const handler = (): void => {
        if (document.visibilityState === 'visible') fn();
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
    schedule(fn, ms) {
      const h = setTimeout(fn, ms);
      return () => clearTimeout(h);
    },
    every(fn, ms) {
      const h = setInterval(fn, ms);
      return () => clearInterval(h);
    },
  };
}

// O que a liderança usa da Web Locks API.
export interface LocksLike {
  request(name: string, callback: () => Promise<void>): Promise<unknown>;
}

// Pede o lock e o segura enquanto a aba vive: `onLeader` roda quando esta aba vira a que sincroniza. Sem a API (navegador antigo, testes),
// a aba lidera sozinha. Devolve a função que solta o lock.
export function acquireLeadership(locks: LocksLike | null, onLeader: () => void): () => void {
  if (!locks) {
    onLeader();
    return () => undefined;
  }
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks
    .request(LOCK_NAME, () => {
      onLeader();
      return held;
    })
    .catch(() => undefined);
  return () => release();
}
```

- [ ] **Step 4: A conta no estado do app**

Crie `app/src/ui/state/account.svelte.ts`:

```ts
// A conta e o sync na tela (spec 7 e 9): o estado que Ajustes, o diálogo de entrar e o indicador leem. O motor (sync/engine.ts) e os
// gatilhos (sync/triggers.ts) ficam por trás. Só a aba líder (o lock 'klick-sync') sincroniza; as outras recebem o estado pelo canal
// 'klick-sync' e pedem "Sincronizar agora" por ele.
import type { SyncState } from '../../core/sync/types';
import { defaultSyncState, type ChangeKind, type ChannelLike, type Repository } from '../../data/repository';
import { createBackup } from '../../data/safety';
import { T } from '../../strings';
import type { SyncApi } from '../../sync/api';
import { createSyncEngine, idleStatus, type SyncEngine, type SyncStatus } from '../../sync/engine';
import { acquireLeadership, browserTriggerEnv, startTriggers, type LocksLike, type TriggerEnv, type Triggers } from '../../sync/triggers';

const CHANNEL = 'klick-sync';

export interface AccountDeps {
  api: SyncApi;
  locks?: LocksLike | null; // padrão: navigator.locks; null: a aba lidera sozinha
  channel?: ChannelLike | null; // padrão: BroadcastChannel('klick-sync'); null: sem canal
  env?: TriggerEnv; // padrão: window, document e os timers
}

// O que a conta usa do app.
export interface AccountHost {
  repo(): Repository;
  busy(): boolean; // o timer (ou o do treino) está ocupado: o sync espera
  now(): number;
  announce(text: string): void; // a região aria-live
}

type Message = { type: 'now' } | { type: 'status'; status: SyncStatus };

function defaultChannel(): ChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHANNEL) as unknown as ChannelLike;
  } catch {
    return null;
  }
}

const SYNCED_KINDS: readonly ChangeKind[] = ['solves', 'sessions', 'practice', 'profile', 'all'];

export class AccountState {
  available = $state(false); // a conta está ligada neste ambiente (spec 8.4), ou este aparelho já está numa conta
  sync = $state<SyncState>(defaultSyncState()); // o bloco sync do meta, relido a cada aviso 'sync'
  status = $state<SyncStatus>(idleStatus());
  leader = $state(false); // esta aba é a que sincroniza
  siteKey = $state<string | null>(null); // a site key do Turnstile, de /api/health

  protected readonly host: AccountHost;
  protected readonly deps: AccountDeps;
  protected readonly engine: SyncEngine;
  private readonly channel: ChannelLike | null;
  private triggers: Triggers | null = null;
  private release: (() => void) | null = null;
  private started: Promise<void> | null = null;
  private settled: SyncStatus['phase'] = 'off'; // a última fase fora de 'syncing': os anúncios comparam com ela

  constructor(host: AccountHost, deps: AccountDeps) {
    this.host = host;
    this.deps = deps;
    this.channel = deps.channel === undefined ? defaultChannel() : deps.channel;
    this.engine = createSyncEngine({
      repo: () => host.repo(),
      api: deps.api,
      now: () => host.now(),
      busy: () => host.busy(),
      backup: async () => {
        await createBackup(host.repo(), 'pre-sync', host.now());
      },
      onStatus: (s) => this.publish(s),
    });
  }

  get signedIn(): boolean {
    return this.sync.signedIn && this.sync.accountId !== null;
  }

  // Ao abrir (AppState.init): lê o estado, pergunta ao servidor se a conta está ligada e disputa a liderança. Não espera a rede.
  start(): Promise<void> {
    this.started ??= this.begin();
    return this.started;
  }

  private async begin(): Promise<void> {
    await this.refresh();
    void this.checkHealth();
    if (this.channel) this.channel.onmessage = (ev) => this.receive(ev.data);
    const locks = this.deps.locks === undefined ? ((globalThis.navigator as Navigator | undefined)?.locks ?? null) : this.deps.locks;
    this.release = acquireLeadership(locks as LocksLike | null, () => {
      this.leader = true;
      this.triggers = startTriggers(() => void this.engine.run(), this.deps.env ?? browserTriggerEnv());
    });
  }

  async checkHealth(): Promise<void> {
    const health = await this.deps.api.health();
    this.available = health?.accounts === true || this.signedIn;
    this.siteKey = health?.turnstileSiteKey ?? null;
  }

  async refresh(): Promise<void> {
    this.sync = await this.host.repo().getSyncState();
    if (this.signedIn) this.available = true;
  }

  // Um aviso do repositório (desta aba ou de outra): uma gravação dispara o sync 5 s depois da última, se há o que mandar.
  changed(kind: ChangeKind): void {
    if (kind === 'sync') void this.refresh();
    else if (SYNCED_KINDS.includes(kind)) this.triggers?.wrote();
  }

  // "Sincronizar agora" (spec 6.2): na aba líder, roda; nas outras, pede pelo canal.
  async syncNow(): Promise<void> {
    await this.started;
    if (this.leader) await this.engine.run();
    else this.channel?.postMessage({ type: 'now' } satisfies Message);
  }

  stop(): void {
    this.triggers?.stop();
    this.engine.stop();
    this.release?.();
    if (this.channel) this.channel.onmessage = null;
  }

  // O anúncio na região aria-live sai só quando o sync falha ou volta a funcionar (spec 9.6).
  private publish(next: SyncStatus): void {
    if (next.phase !== 'syncing') {
      if (this.settled !== 'error' && next.phase === 'error') this.host.announce(T.conta.syncFailedLive);
      if (this.settled === 'error' && next.phase === 'idle') this.host.announce(T.conta.syncBackLive);
      this.settled = next.phase;
    }
    this.status = next;
    if (this.leader) this.channel?.postMessage({ type: 'status', status: next } satisfies Message);
  }

  private receive(data: unknown): void {
    const m = data as Partial<Message> | null;
    if (m?.type === 'now' && this.leader) void this.engine.run();
    else if (m?.type === 'status' && !this.leader && typeof m.status === 'object' && m.status !== null) this.status = m.status;
  }
}
```

Em `app/src/strings.ts`:

Troque:

```ts
    later: 'Agora não',
  }),
  season: (n: number, done: number, finish: string) => `Temporada ${n} · ${done} de 9 marcos · ${finish}`,
});
```

por:

```ts
    later: 'Agora não',
  }),
  season: (n: number, done: number, finish: string) => `Temporada ${n} · ${done} de 9 marcos · ${finish}`,
  // Conta e sync (sub-projeto 5a): Ajustes, o diálogo de entrar, o indicador e os avisos. Voz calma; nada de culpa.
  conta: Object.freeze({
    syncFailedLive: 'O sync parou. Seus solves continuam salvos neste aparelho.',
    syncBackLive: 'O sync voltou a funcionar.',
  }),
});
```

Em `app/src/ui/state/app.svelte.ts`:

1. Troque:

```ts
import { downloadText } from '../download';
import { isIOS, isStandalone } from '../platform';
import { type ShareFile, shareFile } from '../share';

export type Tab = 'timer' | 'evolucao' | 'trilha' | 'companion' | 'ajustes';
// Onde a aba Trilha está (spec do sub-projeto 4, seção 8.2): o começo, a aula de uma etapa, um conjunto do treino ou a rodada dele.
```

por:

```ts
import { downloadText } from '../download';
import { isIOS, isStandalone } from '../platform';
import { type ShareFile, shareFile } from '../share';
import { AccountState, type AccountDeps } from './account.svelte';

export type Tab = 'timer' | 'evolucao' | 'trilha' | 'companion' | 'ajustes';
// Onde a aba Trilha está (spec do sub-projeto 4, seção 8.2): o começo, a aula de uma etapa, um conjunto do treino ou a rodada dele.
```

2. Troque:

```ts
  storageManager?: StorageLike | null; // armazenamento persistente (padrão: navigator.storage)
  reopen?: () => Promise<Repository>; // abre uma conexão nova com o banco; sem ela, uma conexão morta não é trocada
  share?: ShareFile | null; // exportar pela folha de compartilhar (padrão: a do sistema no iPhone e no iPad; nos outros, o download)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
```

por:

```ts
  storageManager?: StorageLike | null; // armazenamento persistente (padrão: navigator.storage)
  reopen?: () => Promise<Repository>; // abre uma conexão nova com o banco; sem ela, uma conexão morta não é trocada
  share?: ShareFile | null; // exportar pela folha de compartilhar (padrão: a do sistema no iPhone e no iPad; nos outros, o download)
  account?: AccountDeps | null; // a conta e o sync (sub-projeto 5a); sem eles (os testes de antes), nada de conta aparece
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
```

3. Troque:

```ts
  trailFlashes = $state(0); // soma 1 a cada vez que uma etapa nova fica marcada: o Centro da Trilha pisca a face lateral
  trainerRunning = $state(false); // o timer do treino está rodando: os atalhos da tela do Timer esperam (a tecla que para não troca de aba)

  private repo: Repository; // troca quando a conexão é reaberta (useRepo)
  private readonly queue: ScrambleQueue;
  private readonly now: () => number;
```

por:

```ts
  trailFlashes = $state(0); // soma 1 a cada vez que uma etapa nova fica marcada: o Centro da Trilha pisca a face lateral
  trainerRunning = $state(false); // o timer do treino está rodando: os atalhos da tela do Timer esperam (a tecla que para não troca de aba)

  readonly account: AccountState | null; // a conta e o sync; null sem os deps (AppDeps.account)
  private repo: Repository; // troca quando a conexão é reaberta (useRepo)
  private readonly queue: ScrambleQueue;
  private readonly now: () => number;
```

4. Troque:

```ts
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
    this.storageManager = deps.storageManager === undefined ? defaultStorageManager() : deps.storageManager;
    this.share = deps.share === undefined ? (isIOS() ? shareFile : null) : deps.share;
    // A arrow function: a fila grava pelo repositório atual, não pelo que existia quando ela foi criada.
    this.saves = createSaveQueue((s) => this.saveWatched(s), {
      // A fila só avisa numa falha (n > 0) e quando esvazia depois dela (0). Nos dois casos o número é o que ela tem agora.
```

por:

```ts
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
    this.storageManager = deps.storageManager === undefined ? defaultStorageManager() : deps.storageManager;
    this.share = deps.share === undefined ? (isIOS() ? shareFile : null) : deps.share;
    this.account = deps.account
      ? new AccountState(
          {
            repo: () => this.repo,
            busy: () => this.timerBusy || this.trainerRunning,
            now: () => this.now(),
            announce: (text) => this.announce(text),
          },
          deps.account,
        )
      : null;
    // A arrow function: a fila grava pelo repositório atual, não pelo que existia quando ela foi criada.
    this.saves = createSaveQueue((s) => this.saveWatched(s), {
      // A fila só avisa numa falha (n > 0) e quando esvazia depois dela (0). Nos dois casos o número é o que ela tem agora.
```

5. Troque:

```ts
    // casca. backup() e copyToFolder() já tratam as próprias falhas (com aviso); o catch só evita uma rejeição sem dono.
    void this.openingCopies(plan).catch(() => undefined);
    void this.checkFolderPermission();
  }

  private async openingCopies(plan: SafetyPlan): Promise<void> {
```

por:

```ts
    // casca. backup() e copyToFolder() já tratam as próprias falhas (com aviso); o catch só evita uma rejeição sem dono.
    void this.openingCopies(plan).catch(() => undefined);
    void this.checkFolderPermission();
    // A conta e o sync (spec 6.2): o primeiro sync sai daqui, sem segurar a abertura.
    void this.account?.start();
  }

  private async openingCopies(plan: SafetyPlan): Promise<void> {
```

6. Troque:

```ts
  private subscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.repo.onChange((kind, origin, solveIds) => {
      if (origin === 'local') return;
      if (kind === 'solves' && solveIds) void this.refreshSolveIds(solveIds);
      else void this.refreshKinds(readsOf(kind));
    });
```

por:

```ts
  private subscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.repo.onChange((kind, origin, solveIds) => {
      this.account?.changed(kind); // as gravações daqui e das outras abas disparam o sync; 'sync' relê o estado da conta
      if (origin === 'local' || kind === 'sync') return;
      if (kind === 'solves' && solveIds) void this.refreshSolveIds(solveIds);
      else void this.refreshKinds(readsOf(kind));
    });
```

Em `app/src/ui/state/boot.ts`:

1. Troque:

```ts
import { createRepository, createSender } from '../../data/repository';
import { generateScramble } from '../../scramble/cubing-loader';
import { createScrambleQueue } from '../../scramble/queue';
import { AppState } from './app.svelte';
import { clearingCloseOthers, dbEvents } from './db-notice.svelte';
```

por:

```ts
import { createRepository, createSender } from '../../data/repository';
import { generateScramble } from '../../scramble/cubing-loader';
import { createScrambleQueue } from '../../scramble/queue';
import { createSyncApi } from '../../sync/api';
import { AppState } from './app.svelte';
import { clearingCloseOthers, dbEvents } from './db-notice.svelte';
```

2. Troque:

```ts
  const repo = createRepository(await open(), { sender });
  const queue = createScrambleQueue({ generate: (event) => generateScramble(event) });
  // A conexão nova para quando o iOS derruba a antiga (o AppState chama isto ao receber um erro de conexão).
  app = new AppState({ repo, queue, reopen: async () => createRepository(await open(), { sender }) });
  await app.init();
  return app;
}
```

por:

```ts
  const repo = createRepository(await open(), { sender });
  const queue = createScrambleQueue({ generate: (event) => generateScramble(event) });
  // A conexão nova para quando o iOS derruba a antiga (o AppState chama isto ao receber um erro de conexão).
  app = new AppState({ repo, queue, reopen: async () => createRepository(await open(), { sender }), account: { api: createSyncApi() } });
  await app.init();
  return app;
}
```

- [ ] **Step 5: Rode os testes, os tipos e as suítes**

Run: `pnpm exec vitest run tests/unit/sync-triggers.test.ts tests/unit/account-state.test.ts`
Expected: PASS (5 + 5 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS (os testes de antes não passam `account`, e nada muda para eles).

Run: `pnpm test:e2e`
Expected: PASS. No `vite preview`, `/api/health` devolve o `index.html`: o app entende "sem servidor" e não mostra nada de conta.

- [ ] **Step 6: Commit**

```bash
git add src/sync/triggers.ts src/ui/state/account.svelte.ts src/ui/state/app.svelte.ts src/ui/state/boot.ts src/strings.ts tests/unit/sync-account.ts tests/unit/sync-triggers.test.ts tests/unit/account-state.test.ts
git commit -m "feat(sync): gatilhos, uma aba só e a conta no estado do app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: O cliente de login e a seção "Conta e sync"

Spec: seções 7.2, 7.6, 7.7 e 9.1; decisão 12 do começo deste plano.

**Files:**
- Create: `app/src/sync/auth.ts` (o adaptador do cliente do Better Auth, carregado sob demanda)
- Create: `app/src/ui/sync-status.ts`
- Create: `app/src/ui/ajustes/AccountSection.svelte`, `app/src/ui/dialogs/SignOutDialog.svelte`
- Modify: `app/src/ui/state/account.svelte.ts`, `app/src/ui/state/app.svelte.ts`, `app/src/ui/ajustes/AjustesScreen.svelte`, `app/src/strings.ts`, `app/src/styles/screens.css`
- Modify: `app/tests/unit/sync-account.ts` (o cliente de login falso)
- Test: `app/tests/unit/account-section.test.ts`

**Interfaces:**
- Consumes: `AccountState` (Task 13); `wipeData`, `enqueueAll`, `saveSyncState` (Tasks 5 e 11); `SyncEngine.firstLogin` (Task 12); as rotas do Better Auth (Task 9).
- Produces (em `sync/auth.ts`): `AuthUser { id; email }`, `SendResult = 'sent' | 'limited' | 'failed'`, `VerifyResult`, `PasskeyInfo { id; name; createdAt }`, `AuthClientLike { sendCode(email, captchaToken); verifyCode(email, code); passkeySignIn(); addPasskey(); listPasskeys(); removePasskey(id); signOut(); signOutEverywhere() }`, `CAPTCHA_HEADER = 'x-turnstile-token'`, `loadAuthClient(): Promise<AuthClientLike>` (importa `better-auth/client`, `better-auth/client/plugins` e `@better-auth/passkey/client` só quando chamado: quem não entra não baixa nada disso).
- Produces (em `ui/sync-status.ts`): `SyncIcon = 'synced' | 'syncing' | 'waiting' | 'error'`, `syncIcon(s)`, `syncLine(s, now)` ("Sincronizado há 2 min", "4 mudanças esperando rede").
- Produces (no `AccountState`): `AccountDeps.auth?: () => Promise<AuthClientLike>`, `AccountHost.afterWipe()`, `SignInNext = 'first' | 'resume' | 'other-account'`, `VerifyOutcome`, `passkeys`, `sendCode(email, token)`, `verifyCode(email, code)`, `passkeySignIn()`, `continueSignIn(mode: 'join' | 'erase' | 'resume')`, `cancelSignIn()`, `signOut(erase)`, `signOutEverywhere()`, `loadPasskeys()`, `addPasskey()`, `removePasskey(id)`. `signOut(true)` e `continueSignIn('erase')` respondem `'pending'` com mudanças na fila (decisão 12).
- Produces (no `AppState`): `DialogId` ganha `'signin'` (o diálogo de entrar, que a Task 15 cria) e `'signout'`; `afterWipe()` relê tudo e cria a sessão padrão. A seção "Conta e sync" é a primeira de Ajustes.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/account-section.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';
import { appWithAccount, fakeApi, fakeAuth } from './sync-account';
import { FakeServer } from './sync-fakes';

describe('Ajustes: "Conta e sync" (spec 9.1)', () => {
  it('com a conta desligada no ambiente, a seção não aparece', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null }).api);
    render(AjustesScreen, { app });
    await screen.findByText('Ajustes');
    expect(screen.queryByText('Conta e sync')).toBeNull();
  });

  it('sem conta: a frase e "Entrar ou criar conta", que abre o diálogo; é a primeira seção da lista', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api);
    await vi.waitFor(() => expect(app.account!.available).toBe(true));
    render(AjustesScreen, { app });
    expect(await screen.findByText('Guarde seus solves na nuvem e use em outros aparelhos.')).toBeInTheDocument();
    expect(document.querySelector('.settings > fieldset')?.getAttribute('data-slot')).toBe('conta');
    await fireEvent.click(screen.getByRole('button', { name: 'Entrar ou criar conta' }));
    expect(app.dialog).toBe('signin');
  });

  it('com conta: o e-mail, a situação, "Sincronizar agora", passkeys e sair', async () => {
    const { auth } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(AjustesScreen, { app });
    expect(await screen.findByText('ranielli@exemplo.com')).toBeInTheDocument();
    expect(document.querySelector('[data-sync-line]')?.textContent).toBe('Sincronizado agora');
    const sync = vi.spyOn(app.account!, 'syncNow');
    await fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }));
    expect(sync).toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Criar passkey' }));
    expect(await screen.findByRole('button', { name: /^Remover a passkey criada em/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Sair$/ }));
    expect(app.dialog).toBe('signout');
  });

  it('sair deixa os dados no aparelho; apagar só sem mudanças esperando (spec 7.7)', async () => {
    const { auth, calls } = fakeAuth();
    const server = new FakeServer();
    const net = fakeApi(server);
    const { app, repo } = await appWithAccount(net.api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: /^Sair$/ }));
    await fireEvent.click(document.querySelector('[data-erase]')!);
    await fireEvent.click(screen.getAllByRole('button', { name: /^Sair$/ }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda não');
    expect(await repo.listSolves()).toHaveLength(1);
    await fireEvent.click(document.querySelector('[data-erase]')!); // desmarca: só sair
    await fireEvent.click(screen.getAllByRole('button', { name: /^Sair$/ }).at(-1)!);
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
    expect(calls).toContain('sign-out');
    expect(await repo.listSolves()).toHaveLength(1);
    expect((await repo.getSyncState()).accountId).toBe('conta-1'); // fica, para a spec 7.6
  });

  it('sair de todos os aparelhos pede o segundo clique', async () => {
    const { auth, calls } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    render(AjustesScreen, { app });
    const button = await screen.findByRole('button', { name: 'Sair de todos os aparelhos' });
    await fireEvent.click(button);
    expect(calls).not.toContain('sign-out-everywhere');
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(calls).toContain('sign-out-everywhere'));
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
  });
});
```

Em `app/tests/unit/sync-account.ts`:

1. Troque:

```ts
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import type { Health, SyncApi } from '../../src/sync/api';
import type { TriggerEnv } from '../../src/sync/triggers';
import { AppState, type AppDeps } from '../../src/ui/state/app.svelte';
import { FakeServer } from './sync-fakes';
```

por:

```ts
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import type { Health, SyncApi } from '../../src/sync/api';
import type { AuthClientLike } from '../../src/sync/auth';
import type { TriggerEnv } from '../../src/sync/triggers';
import { AppState, type AppDeps } from '../../src/ui/state/app.svelte';
import { FakeServer } from './sync-fakes';
```

2. Troque:

```ts

export async function appWithAccount(
  api: SyncApi,
  o: { now?: () => number; signedIn?: boolean; env?: TriggerEnv; repo?: Repository; locks?: AppDeps['account'] extends infer A ? (A extends { locks?: infer L } ? L : never) : never; channel?: ChannelLike | null } = {},
): Promise<{ app: AppState; repo: Repository }> {
  const now = o.now ?? (() => Date.now());
  const repo = o.repo ?? createRepository(await openKlickDb(`conta-${++n}`), { now, channel: null });
```

por:

```ts

export async function appWithAccount(
  api: SyncApi,
  o: {
    now?: () => number;
    signedIn?: boolean;
    env?: TriggerEnv;
    repo?: Repository;
    locks?: NonNullable<AppDeps['account']>['locks'];
    channel?: ChannelLike | null;
    auth?: AuthClientLike;
  } = {},
): Promise<{ app: AppState; repo: Repository }> {
  const now = o.now ?? (() => Date.now());
  const repo = o.repo ?? createRepository(await openKlickDb(`conta-${++n}`), { now, channel: null });
```

3. Troque:

```ts
    now,
    storage: null,
    storageManager: null,
    account: { api, env: o.env ?? manualEnv().env, locks: o.locks ?? null, channel: o.channel ?? null },
  });
  await app.init();
  return { app, repo };
}
```

por:

```ts
    now,
    storage: null,
    storageManager: null,
    account: { api, env: o.env ?? manualEnv().env, locks: o.locks ?? null, channel: o.channel ?? null, auth: async () => o.auth ?? fakeAuth().auth },
  });
  await app.init();
  return { app, repo };
}

// O cliente de login falso: o código certo é 123456; `user` é quem entra.
export function fakeAuth(user = { id: 'conta-1', email: 'ranielli@exemplo.com' }) {
  const calls: string[] = [];
  const state = { passkeys: [] as { id: string; name: string | null; createdAt: number }[], revokeOk: true };
  const auth: AuthClientLike = {
    async sendCode(email, token) {
      calls.push(`send:${email}:${token}`);
      return 'sent';
    },
    async verifyCode(email, code) {
      calls.push(`verify:${email}:${code}`);
      return code === '123456' ? { ok: true, user } : { ok: false, reason: 'bad-code' };
    },
    async passkeySignIn() {
      calls.push('passkey-sign-in');
      return user;
    },
    async addPasskey() {
      state.passkeys.push({ id: `pk${state.passkeys.length + 1}`, name: null, createdAt: 1_791_500_000_000 });
      return true;
    },
    async listPasskeys() {
      return [...state.passkeys];
    },
    async removePasskey(id) {
      state.passkeys = state.passkeys.filter((p) => p.id !== id);
      return true;
    },
    async signOut() {
      calls.push('sign-out');
    },
    async signOutEverywhere() {
      calls.push('sign-out-everywhere');
      return state.revokeOk;
    },
  };
  return { auth, calls, state };
}
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/account-section.test.ts`
Expected: FAIL (4 de 5 testes): `Unable to find an element with the text: Guarde seus solves na nuvem e use em outros aparelhos.` e `Unable to find role="button" and name "Sair de todos os aparelhos"`. O primeiro ("com a conta desligada no ambiente, a seção não aparece") já passa.

- [ ] **Step 3: O adaptador do cliente de login**

As rotas e os códigos de erro são os do Better Auth 1.7.7 (`INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`); o token do Turnstile vai no cabeçalho que o guarda da Task 10 lê.

Crie `app/src/sync/auth.ts`:

```ts
// O login (spec 7): o cliente do Better Auth, carregado só quando a pessoa mexe na conta (fica fora do código da abertura). O resto do app
// fala com AuthClientLike, e os testes passam um falso.

export interface AuthUser {
  id: string;
  email: string;
}

export type SendResult = 'sent' | 'limited' | 'failed';
export type VerifyResult = { ok: true; user: AuthUser } | { ok: false; reason: 'bad-code' | 'expired' | 'too-many' | 'failed' };

export interface PasskeyInfo {
  id: string;
  name: string | null;
  createdAt: number;
}

export interface AuthClientLike {
  sendCode(email: string, captchaToken: string): Promise<SendResult>; // o código de 6 dígitos por e-mail (spec 7.2)
  verifyCode(email: string, code: string): Promise<VerifyResult>;
  passkeySignIn(): Promise<AuthUser | null>; // null: cancelado ou sem passkey neste aparelho
  addPasskey(): Promise<boolean>;
  listPasskeys(): Promise<PasskeyInfo[]>;
  removePasskey(id: string): Promise<boolean>;
  signOut(): Promise<void>; // sem rede, sai só aqui: o cookie expira sozinho
  signOutEverywhere(): Promise<boolean>; // revoga todas as sessões da conta (spec 7.7)
}

// O cabeçalho em que o servidor espera o token do Turnstile (worker/abuse.ts).
export const CAPTCHA_HEADER = 'x-turnstile-token';

type Failure = { status?: number; code?: string } | null | undefined;

const verifyFailure = (error: Failure): VerifyResult => {
  const reason = error?.code === 'INVALID_OTP' ? 'bad-code' : error?.code === 'OTP_EXPIRED' ? 'expired' : error?.code === 'TOO_MANY_ATTEMPTS' ? 'too-many' : 'failed';
  return { ok: false, reason };
};

const userOf = (data: unknown): AuthUser | null => {
  const user = (data as { user?: { id?: unknown; email?: unknown } } | null)?.user;
  return typeof user?.id === 'string' && typeof user.email === 'string' ? { id: user.id, email: user.email } : null;
};

export async function loadAuthClient(): Promise<AuthClientLike> {
  const [{ createAuthClient }, { emailOTPClient }, { passkeyClient }] = await Promise.all([
    import('better-auth/client'),
    import('better-auth/client/plugins'),
    import('@better-auth/passkey/client'),
  ]);
  const client = createAuthClient({ basePath: '/api/auth', plugins: [emailOTPClient(), passkeyClient()] });
  return {
    async sendCode(email, captchaToken) {
      try {
        const { error } = await client.emailOtp.sendVerificationOtp({ email, type: 'sign-in', fetchOptions: { headers: { [CAPTCHA_HEADER]: captchaToken } } });
        if (!error) return 'sent';
        return error.status === 429 ? 'limited' : 'failed';
      } catch {
        return 'failed';
      }
    },
    async verifyCode(email, code) {
      try {
        const { data, error } = await client.signIn.emailOtp({ email, otp: code });
        const user = userOf(data);
        return !error && user ? { ok: true, user } : verifyFailure(error);
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
    async passkeySignIn() {
      try {
        const { data, error } = await client.signIn.passkey();
        if (error) return null;
        const user = userOf(data) ?? userOf((await client.getSession()).data);
        return user;
      } catch {
        return null;
      }
    },
    async addPasskey() {
      try {
        const result = await client.passkey.addPasskey({ name: 'Klick' });
        return !result?.error;
      } catch {
        return false;
      }
    },
    async listPasskeys() {
      const { data } = await client.passkey.listUserPasskeys();
      const list: { id: string; name?: string | null; createdAt: Date | string }[] = data ?? [];
      return list.map((p) => ({ id: p.id, name: p.name ?? null, createdAt: new Date(p.createdAt).getTime() }));
    },
    async removePasskey(id) {
      const { error } = await client.passkey.deletePasskey({ id });
      return !error;
    },
    async signOut() {
      try {
        await client.signOut();
      } catch {
        // sem rede: a sessão daqui acaba mesmo assim, e o cookie expira sozinho
      }
    },
    async signOutEverywhere() {
      try {
        const { error } = await client.revokeSessions();
        return !error;
      } catch {
        return false;
      }
    },
  };
}
```

- [ ] **Step 4: A situação do sync em texto e as ações da conta**

Crie `app/src/ui/sync-status.ts`:

```ts
// A situação do sync em palavras e no ícone (spec 9.1 e 9.3): Ajustes e o indicador da barra de cima leem daqui.
import { T } from '../strings';
import type { SyncStatus } from '../sync/engine';

export type SyncIcon = 'synced' | 'syncing' | 'waiting' | 'error';

export function syncIcon(s: SyncStatus): SyncIcon {
  if (s.phase === 'syncing') return 'syncing';
  if (s.phase === 'offline') return 'waiting';
  if (s.phase === 'error') return 'error';
  return 'synced';
}

export function syncLine(s: SyncStatus, now: number): string {
  switch (s.phase) {
    case 'syncing':
      if (s.progress && s.progress.total > 0) return T.conta.sending(Math.min(s.progress.sent, s.progress.total), s.progress.total);
      if (s.progress && s.progress.received > 0) return T.conta.receiving(s.progress.received);
      return T.conta.syncing;
    case 'offline':
      return T.conta.waiting(s.pending);
    case 'error':
      return s.error === 'auth' ? T.conta.expired : s.error === 'update' ? T.conta.update : T.conta.failed;
    default:
      return T.conta.synced(s.lastSyncAt === null ? null : T.conta.ago(Math.max(0, now - s.lastSyncAt)));
  }
}
```

Em `app/src/ui/state/account.svelte.ts`:

1. Troque:

```ts
import { createBackup } from '../../data/safety';
import { T } from '../../strings';
import type { SyncApi } from '../../sync/api';
import { createSyncEngine, idleStatus, type SyncEngine, type SyncStatus } from '../../sync/engine';
import { acquireLeadership, browserTriggerEnv, startTriggers, type LocksLike, type TriggerEnv, type Triggers } from '../../sync/triggers';
```

por:

```ts
import { createBackup } from '../../data/safety';
import { T } from '../../strings';
import type { SyncApi } from '../../sync/api';
import { loadAuthClient, type AuthClientLike, type AuthUser, type PasskeyInfo, type SendResult, type VerifyResult } from '../../sync/auth';
import { createSyncEngine, idleStatus, type SyncEngine, type SyncStatus } from '../../sync/engine';
import { acquireLeadership, browserTriggerEnv, startTriggers, type LocksLike, type TriggerEnv, type Triggers } from '../../sync/triggers';
```

2. Troque:

```ts
  locks?: LocksLike | null; // padrão: navigator.locks; null: a aba lidera sozinha
  channel?: ChannelLike | null; // padrão: BroadcastChannel('klick-sync'); null: sem canal
  env?: TriggerEnv; // padrão: window, document e os timers
}

// O que a conta usa do app.
export interface AccountHost {
```

por:

```ts
  locks?: LocksLike | null; // padrão: navigator.locks; null: a aba lidera sozinha
  channel?: ChannelLike | null; // padrão: BroadcastChannel('klick-sync'); null: sem canal
  env?: TriggerEnv; // padrão: window, document e os timers
  auth?: () => Promise<AuthClientLike>; // padrão: o cliente do Better Auth, carregado na hora
}

// Depois do código (ou da passkey): o primeiro login neste aparelho, a volta da mesma conta, ou outra conta (spec 7.6).
export type SignInNext = 'first' | 'resume' | 'other-account';
export type VerifyOutcome = { ok: true; next: SignInNext } | Extract<VerifyResult, { ok: false }>;

// O que a conta usa do app.
export interface AccountHost {
```

3. Troque:

```ts
  busy(): boolean; // o timer (ou o do treino) está ocupado: o sync espera
  now(): number;
  announce(text: string): void; // a região aria-live
}

type Message = { type: 'now' } | { type: 'status'; status: SyncStatus };
```

por:

```ts
  busy(): boolean; // o timer (ou o do treino) está ocupado: o sync espera
  now(): number;
  announce(text: string): void; // a região aria-live
  afterWipe(): Promise<void>; // os dados deste aparelho foram apagados: o app relê e cria a sessão padrão
}

type Message = { type: 'now' } | { type: 'status'; status: SyncStatus };
```

4. Troque:

```ts
  status = $state<SyncStatus>(idleStatus());
  leader = $state(false); // esta aba é a que sincroniza
  siteKey = $state<string | null>(null); // a site key do Turnstile, de /api/health

  protected readonly host: AccountHost;
  protected readonly deps: AccountDeps;
```

por:

```ts
  status = $state<SyncStatus>(idleStatus());
  leader = $state(false); // esta aba é a que sincroniza
  siteKey = $state<string | null>(null); // a site key do Turnstile, de /api/health
  passkeys = $state<PasskeyInfo[] | null>(null); // as passkeys da conta (Ajustes); null enquanto não lidas

  protected readonly host: AccountHost;
  protected readonly deps: AccountDeps;
```

5. Troque:

```ts
  private release: (() => void) | null = null;
  private started: Promise<void> | null = null;
  private settled: SyncStatus['phase'] = 'off'; // a última fase fora de 'syncing': os anúncios comparam com ela

  constructor(host: AccountHost, deps: AccountDeps) {
    this.host = host;
```

por:

```ts
  private release: (() => void) | null = null;
  private started: Promise<void> | null = null;
  private settled: SyncStatus['phase'] = 'off'; // a última fase fora de 'syncing': os anúncios comparam com ela
  private user: AuthUser | null = null; // quem acabou de entrar, até continueSignIn ou cancelSignIn
  private client: Promise<AuthClientLike> | null = null;

  constructor(host: AccountHost, deps: AccountDeps) {
    this.host = host;
```

6. Troque:

```ts
    else this.channel?.postMessage({ type: 'now' } satisfies Message);
  }

  stop(): void {
    this.triggers?.stop();
    this.engine.stop();
```

por:

```ts
    else this.channel?.postMessage({ type: 'now' } satisfies Message);
  }

  // --- Entrar, sair e passkeys (spec 7) ---

  private auth(): Promise<AuthClientLike> {
    this.client ??= (this.deps.auth ?? loadAuthClient)().catch((err: unknown) => {
      this.client = null; // o pedaço não carregou (sem rede): a próxima tentativa carrega de novo
      throw err;
    });
    return this.client;
  }

  async sendCode(email: string, captchaToken: string): Promise<SendResult> {
    try {
      return await (await this.auth()).sendCode(email.trim(), captchaToken);
    } catch {
      return 'failed';
    }
  }

  async verifyCode(email: string, code: string): Promise<VerifyOutcome> {
    let result: VerifyResult;
    try {
      result = await (await this.auth()).verifyCode(email.trim(), code);
    } catch {
      return { ok: false, reason: 'failed' };
    }
    return result.ok ? { ok: true, next: await this.adopt(result.user) } : result;
  }

  async passkeySignIn(): Promise<SignInNext | null> {
    try {
      const user = await (await this.auth()).passkeySignIn();
      return user ? await this.adopt(user) : null;
    } catch {
      return null;
    }
  }

  private async adopt(user: AuthUser): Promise<SignInNext> {
    this.user = user;
    const { accountId } = await this.host.repo().getSyncState();
    return accountId === null ? 'first' : accountId === user.id ? 'resume' : 'other-account';
  }

  // Depois de entrar: 'join' junta os dados deste aparelho à conta (primeiro login, ou a outra conta da spec 7.6); 'erase' apaga os dados
  // deste aparelho antes (spec 7.6) e recusa ('pending') se ainda há mudanças da conta anterior esperando para subir; 'resume' é a mesma
  // conta de antes, que só volta a sincronizar. O sync segue em segundo plano: a promessa resolve quando ele começou.
  async continueSignIn(mode: 'join' | 'erase' | 'resume'): Promise<'ok' | 'pending'> {
    const user = this.user;
    if (!user) return 'ok';
    const repo = this.host.repo();
    if (mode === 'erase') {
      if ((await repo.outboxCount()) > 0) return 'pending';
      await repo.wipeData();
      await this.host.afterWipe();
    }
    this.user = null;
    this.available = true;
    if (mode === 'resume') {
      await repo.saveSyncState({ signedIn: true, email: user.email });
      await this.refresh();
      void this.syncNow();
    } else {
      void this.engine.firstLogin({ accountId: user.id, email: user.email });
    }
    return 'ok';
  }

  // Desistir no diálogo da outra conta (spec 7.6): sai da sessão nova; nada daqui muda.
  async cancelSignIn(): Promise<void> {
    this.user = null;
    await (await this.auth().catch(() => null))?.signOut();
  }

  // Sair (spec 7.7). Com `erase`, apaga os dados deste aparelho, mas só sem mudanças esperando para subir ('pending').
  async signOut(erase: boolean): Promise<'ok' | 'pending'> {
    const repo = this.host.repo();
    if (erase && (await repo.outboxCount()) > 0) return 'pending';
    await (await this.auth().catch(() => null))?.signOut();
    if (erase) {
      await repo.wipeData();
      await this.host.afterWipe();
    } else {
      await repo.saveSyncState({ signedIn: false });
    }
    await this.refresh();
    this.passkeys = null;
    this.status = idleStatus();
    return 'ok';
  }

  async signOutEverywhere(): Promise<boolean> {
    const ok = await (await this.auth().catch(() => null))?.signOutEverywhere();
    if (!ok) return false;
    await this.host.repo().saveSyncState({ signedIn: false });
    await this.refresh();
    this.status = idleStatus();
    return true;
  }

  async loadPasskeys(): Promise<void> {
    try {
      this.passkeys = await (await this.auth()).listPasskeys();
    } catch {
      this.passkeys = [];
    }
  }

  async addPasskey(): Promise<boolean> {
    const ok = await (await this.auth().catch(() => null))?.addPasskey();
    if (!ok) return false;
    await this.host.repo().saveSyncState({ passkey: true });
    await this.refresh();
    await this.loadPasskeys();
    return true;
  }

  async removePasskey(id: string): Promise<boolean> {
    const ok = await (await this.auth().catch(() => null))?.removePasskey(id);
    if (ok) await this.loadPasskeys();
    return ok === true;
  }

  stop(): void {
    this.triggers?.stop();
    this.engine.stop();
```

Em `app/src/ui/state/app.svelte.ts`:

1. Troque:

```ts
// Onde a aba Trilha está (spec do sub-projeto 4, seção 8.2): o começo, a aula de uma etapa, um conjunto do treino ou a rodada dele.
// Fica no AppState: a tela da Trilha só existe com a aba aberta, e a pessoa volta ao mesmo lugar.
export type TrailView = { kind: 'home' } | { kind: 'lesson'; step: TrailStep } | { kind: 'set'; set: CaseSet } | { kind: 'round'; set: CaseSet };
export type DialogId = 'sessions' | 'shortcuts' | 'onboarding' | 'export' | 'import' | 'backups' | 'trash' | 'install';
export interface Toast {
  text: string;
  action?: string;
```

por:

```ts
// Onde a aba Trilha está (spec do sub-projeto 4, seção 8.2): o começo, a aula de uma etapa, um conjunto do treino ou a rodada dele.
// Fica no AppState: a tela da Trilha só existe com a aba aberta, e a pessoa volta ao mesmo lugar.
export type TrailView = { kind: 'home' } | { kind: 'lesson'; step: TrailStep } | { kind: 'set'; set: CaseSet } | { kind: 'round'; set: CaseSet };
export type DialogId = 'sessions' | 'shortcuts' | 'onboarding' | 'export' | 'import' | 'backups' | 'trash' | 'install' | 'signin' | 'signout';
export interface Toast {
  text: string;
  action?: string;
```

2. Troque:

```ts
            busy: () => this.timerBusy || this.trainerRunning,
            now: () => this.now(),
            announce: (text) => this.announce(text),
          },
          deps.account,
        )
```

por:

```ts
            busy: () => this.timerBusy || this.trainerRunning,
            now: () => this.now(),
            announce: (text) => this.announce(text),
            afterWipe: () => this.afterWipe(),
          },
          deps.account,
        )
```

3. Troque:

```ts
    return this.replaceCurrent();
  }

  // Sem sessão atual viva: a primeira que sobrou assume (ou uma de 3×3, se não sobrou nenhuma), e a escolha é gravada.
  private async replaceCurrent(): Promise<Session> {
    // Sem sessão nenhuma, a padrão tem id fixo por evento (spec 5.5): dois aparelhos novos criam a mesma, e o sync as junta.
```

por:

```ts
    return this.replaceCurrent();
  }

  // Os dados deste aparelho foram apagados (spec 7.6 e 7.7): relê tudo e cria a sessão padrão, como num aparelho novo.
  private async afterWipe(): Promise<void> {
    await this.reload();
    await this.ensureSession();
    await this.nextScramble();
  }

  // Sem sessão atual viva: a primeira que sobrou assume (ou uma de 3×3, se não sobrou nenhuma), e a escolha é gravada.
  private async replaceCurrent(): Promise<Session> {
    // Sem sessão nenhuma, a padrão tem id fixo por evento (spec 5.5): dois aparelhos novos criam a mesma, e o sync as junta.
```

- [ ] **Step 5: A seção e o diálogo de sair**

Crie `app/src/ui/ajustes/AccountSection.svelte`:

```svelte
<script lang="ts">
  // "Conta e sync" (spec 9.1): sem conta, o convite; com conta, o e-mail, a situação do sync e o que dá para fazer. Só aparece com a conta
  // ligada no ambiente (ou com este aparelho já numa conta). No desktop, é a primeira seção da coluna da direita; no celular, a primeira da
  // lista (screens.css).
  import { onDestroy, onMount } from 'svelte';
  import { T } from '../../strings';
  import SignOutDialog from '../dialogs/SignOutDialog.svelte';
  import { dateLabel } from '../format';
  import type { AppState, DialogId } from '../state/app.svelte';
  import { syncLine } from '../sync-status';

  let { app }: { app: AppState } = $props();

  const account = $derived(app.account);
  let now = $state(Date.now()); // o "há 2 min" anda sozinho
  let confirmAll = $state(false); // "Sair de todos os aparelhos" espera o segundo clique
  let busy = $state(false);

  // Os diálogos que esta seção abre (o de entrar é da casca: o lembrete do Timer também o abre).
  const ACCOUNT_DIALOGS: readonly DialogId[] = ['signout'];

  onMount(() => {
    const h = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(h);
  });

  // Sair de Ajustes com um destes diálogos aberto solta o estado: senão, na volta, o diálogo reabriria sozinho.
  onDestroy(() => {
    if (app.dialog !== null && ACCOUNT_DIALOGS.includes(app.dialog)) app.dialog = null;
  });

  $effect(() => {
    if (account?.signedIn && account.passkeys === null) void account.loadPasskeys();
  });

  async function addPasskey(): Promise<void> {
    if (!account || busy) return;
    busy = true;
    try {
      app.showToast((await account.addPasskey()) ? T.conta.passkeyAdded : T.conta.passkeyFailed);
    } finally {
      busy = false;
    }
  }

  async function signOutAll(): Promise<void> {
    if (!account || busy) return;
    if (!confirmAll) {
      confirmAll = true;
      return;
    }
    busy = true;
    try {
      app.showToast((await account.signOutEverywhere()) ? T.conta.signOutAllDone : T.conta.signOutAllFailed);
    } finally {
      busy = false;
      confirmAll = false;
    }
  }
</script>

{#snippet caption(label: string, hint?: string)}
  <span>{label}{#if hint}<small>{hint}</small>{/if}</span>
{/snippet}

{#if account?.available}
  <fieldset class="account" data-slot="conta">
    <legend>{T.conta.title}</legend>
    {#if !account.signedIn}
      <div class="setting">
        {@render caption(T.conta.pitch)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.signIn}</button>
      </div>
    {:else}
      <div class="setting">
        <span>{account.sync.email}<small data-sync-line>{syncLine(account.status, now)}</small></span>
        {#if account.status.error === 'auth'}
          <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.signInAgain}</button>
        {:else}
          <button type="button" class="btn" disabled={account.status.phase === 'syncing'} onclick={() => account.syncNow()}>{T.conta.syncNow}</button>
        {/if}
      </div>

      <div class="setting">
        {@render caption(T.conta.passkeys, T.conta.passkeysHint)}
        <button type="button" class="btn" disabled={busy} onclick={addPasskey}>{T.conta.passkeyAdd}</button>
      </div>
      {#if account.passkeys && account.passkeys.length > 0}
        <ul class="sheet-list passkeys" aria-label={T.conta.passkeys}>
          {#each account.passkeys as p (p.id)}
            {@const when = dateLabel(p.createdAt)}
            <li class="setting">
              <span>{p.name ?? T.conta.passkeys}<small>{T.conta.passkeyName(when)}</small></span>
              <button type="button" class="btn" aria-label={T.conta.passkeyRemoveAria(when)} onclick={() => account.removePasskey(p.id)}
                >{T.conta.passkeyRemove}</button
              >
            </li>
          {/each}
        </ul>
      {/if}

      <div class="setting">
        {@render caption(T.conta.signOut, T.conta.signOutHint)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'signout')}>{T.conta.signOut}</button>
      </div>
      <div class="setting">
        {@render caption(T.conta.signOutAll, T.conta.signOutAllHint)}
        <button type="button" class="btn{confirmAll ? ' danger' : ''}" disabled={busy} onclick={signOutAll}
          >{confirmAll ? T.conta.confirmAgain : T.conta.signOutAll}</button
        >
      </div>
    {/if}
  </fieldset>
{/if}

<SignOutDialog {app} open={app.dialog === 'signout'} />
```

Crie `app/src/ui/dialogs/SignOutDialog.svelte`:

```svelte
<script lang="ts">
  // Sair da conta (spec 7.7): os dados ficam no aparelho, com a opção de apagá-los. Apagar só vale sem mudanças esperando para subir.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let erase = $state(false);
  let blocked = $state<number | null>(null); // mudanças esperando: o aviso no lugar de sair
  let busy = $state(false);

  function onclose(): void {
    erase = false;
    blocked = null;
    if (app.dialog === 'signout') app.dialog = null;
  }

  async function leave(): Promise<void> {
    const account = app.account;
    if (!account || busy) return;
    busy = true;
    try {
      const pending = account.status.pending;
      if ((await account.signOut(erase)) === 'pending') {
        blocked = Math.max(pending, 1);
        return;
      }
      app.showToast(erase ? T.conta.signedOutErased : T.conta.signedOut);
      dialogEl?.close();
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.conta.signOutTitle} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.conta.signOutTitle}</h2>
    <p class="muted">{T.conta.signOutText}</p>
    <label class="setting">
      <span>{T.conta.eraseHere}<small>{T.conta.eraseHint}</small></span>
      <input type="checkbox" class="switch" bind:checked={erase} data-erase />
    </label>
    {#if blocked !== null}
      <p role="alert">{T.conta.pendingBlock(blocked)}</p>
    {/if}
    <div class="row">
      <button type="button" class="btn{erase ? ' danger' : ''}" disabled={busy} onclick={leave}>{T.conta.signOut}</button>
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.conta.cancel}</button>
    </div>
  {/if}
</dialog>
```

Em `app/src/ui/ajustes/AjustesScreen.svelte`:

1. Troque:

```svelte
  import type { ProfilePatch } from '../../data/repository';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import DataSection from './DataSection.svelte';

  type Patch = NonNullable<ProfilePatch['settings']>;
```

por:

```svelte
  import type { ProfilePatch } from '../../data/repository';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import AccountSection from './AccountSection.svelte';
  import DataSection from './DataSection.svelte';

  type Patch = NonNullable<ProfilePatch['settings']>;
```

2. Troque:

```svelte
<section class="screen" data-screen="ajustes" aria-label={T.tabs.ajustes}>
  <div class="page-h"><h1>{T.tabs.ajustes}</h1></div>
  <div class="settings">
    <div class="settings-col">
      <fieldset>
        <legend>{T.ajustes.timer}</legend>
        <label class="setting">
```

por:

```svelte
<section class="screen" data-screen="ajustes" aria-label={T.tabs.ajustes}>
  <div class="page-h"><h1>{T.tabs.ajustes}</h1></div>
  <div class="settings">
    <AccountSection {app} />
    <div class="settings-col" data-col="a">
      <fieldset>
        <legend>{T.ajustes.timer}</legend>
        <label class="setting">
```

3. Troque:

```svelte
      </fieldset>
    </div>

    <div class="settings-col">
      <fieldset>
        <legend>{T.ajustes.coach}</legend>
        <label class="setting">
```

por:

```svelte
      </fieldset>
    </div>

    <div class="settings-col" data-col="b">
      <fieldset>
        <legend>{T.ajustes.coach}</legend>
        <label class="setting">
```

Em `app/src/strings.ts`:

Troque:

```ts
  conta: Object.freeze({
    syncFailedLive: 'O sync parou. Seus solves continuam salvos neste aparelho.',
    syncBackLive: 'O sync voltou a funcionar.',
  }),
});
```

por:

```ts
  conta: Object.freeze({
    syncFailedLive: 'O sync parou. Seus solves continuam salvos neste aparelho.',
    syncBackLive: 'O sync voltou a funcionar.',
    // Ajustes, "Conta e sync" (spec 9.1)
    title: 'Conta e sync',
    pitch: 'Guarde seus solves na nuvem e use em outros aparelhos.',
    signIn: 'Entrar ou criar conta',
    syncNow: 'Sincronizar agora',
    syncing: 'Sincronizando…',
    sending: (sent: number, total: number): string => `Enviando ${sent.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}…`,
    receiving: (n: number): string => `Recebendo da conta: ${n.toLocaleString('pt-BR')}…`,
    synced: (ago: string | null): string => (ago ? `Sincronizado ${ago}` : 'Sincronizado'),
    ago: (ms: number): string => {
      if (ms < 60_000) return 'agora';
      if (ms < 3_600_000) return `há ${Math.floor(ms / 60_000)} min`;
      if (ms < 86_400_000) return `há ${Math.floor(ms / 3_600_000)} h`;
      const days = Math.floor(ms / 86_400_000);
      return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
    },
    waiting: (n: number): string =>
      n === 0 ? 'Esperando rede' : `${n.toLocaleString('pt-BR')} ${n === 1 ? 'mudança esperando' : 'mudanças esperando'} rede`,
    failed: 'O sync parou. Tentando de novo.',
    expired: 'Sua sessão expirou. Entre de novo para sincronizar.',
    update: 'Atualize o Klick para sincronizar.',
    signInAgain: 'Entrar de novo',
    passkeys: 'Passkeys',
    passkeysHint: 'Entre com Face ID, Touch ID ou a senha do aparelho, sem esperar o código.',
    passkeyAdd: 'Criar passkey',
    passkeyAdded: 'Passkey criada.',
    passkeyFailed: 'Não consegui criar a passkey.',
    passkeyNone: 'Nenhuma passkey ainda.',
    passkeyName: (when: string): string => `Criada em ${when}`,
    passkeyRemove: 'Remover',
    passkeyRemoveAria: (when: string): string => `Remover a passkey criada em ${when}`,
    signOut: 'Sair',
    signOutHint: 'Os dados ficam neste aparelho.',
    signOutAll: 'Sair de todos os aparelhos',
    signOutAllHint: 'Encerra a sessão em todo aparelho. Os dados ficam em cada um.',
    confirmAgain: 'Tem certeza? Clique de novo',
    signOutAllDone: 'Você saiu de todos os aparelhos.',
    signOutAllFailed: 'Não consegui sair dos outros aparelhos agora. Tente de novo com rede.',
    // Diálogo de sair (spec 7.7)
    signOutTitle: 'Sair da conta',
    signOutText: 'Os dados ficam neste aparelho, que volta a funcionar só aqui. O que ainda não subiu sobe quando você entrar de novo nesta conta.',
    eraseHere: 'Apagar os dados deste aparelho',
    eraseHint: 'Solves, sessões, treino e cópias deste aparelho. Na conta, tudo continua.',
    pendingBlock: (n: number): string =>
      `${n.toLocaleString('pt-BR')} ${n === 1 ? 'mudança ainda não subiu' : 'mudanças ainda não subiram'}. Sincronize antes de apagar os dados deste aparelho.`,
    cancel: 'Cancelar',
    signedOut: 'Você saiu da conta. Os dados continuam neste aparelho.',
    signedOutErased: 'Você saiu da conta e os dados deste aparelho foram apagados.',
  }),
});
```

Em `app/src/styles/screens.css`:

Troque:

```css
  .settings .setting .btn {
    white-space: nowrap;
  }
}

/* ---------- Primeira vez ---------- */
```

por:

```css
  .settings .setting .btn {
    white-space: nowrap;
  }

  /* "Conta e sync" (spec 9.1): a primeira da coluna da direita. A coluna da esquerda ocupa as duas linhas; a sobra fica embaixo. */
  .settings {
    grid-template-rows: auto 1fr;
  }
  .settings > .account {
    grid-column: 2;
    grid-row: 1;
  }
  .settings > [data-col='a'] {
    grid-column: 1;
    grid-row: 1 / span 2;
  }
  .settings > [data-col='b'] {
    grid-column: 2;
    grid-row: 2;
  }
}

/* ---------- Primeira vez ---------- */
```

- [ ] **Step 6: Rode os testes, os tipos e as suítes**

Run: `pnpm exec vitest run tests/unit/account-section.test.ts`
Expected: PASS (5 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros. Se o tipo de uma resposta do cliente do Better Auth não bater em `src/sync/auth.ts`, ajuste o adaptador sem mudar o que ele devolve (`AuthClientLike`).

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

Run: `pnpm test:e2e`
Expected: PASS (sem servidor, Ajustes é o de sempre).

- [ ] **Step 7: Commit**

```bash
git add src/sync/auth.ts src/ui/sync-status.ts src/ui/ajustes/AccountSection.svelte src/ui/dialogs/SignOutDialog.svelte src/ui/ajustes/AjustesScreen.svelte src/ui/state/account.svelte.ts src/ui/state/app.svelte.ts src/strings.ts src/styles/screens.css tests/unit/sync-account.ts tests/unit/account-section.test.ts
git commit -m "feat(app): a seção \"Conta e sync\" em Ajustes, com sair e passkeys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: O diálogo de entrar e a outra conta no aparelho

Spec: seções 6.5, 7.2, 7.6, 9.2 e 9.6.

**Files:**
- Create: `app/src/sync/captcha.ts` (o Turnstile invisível, carregado sob demanda de `challenges.cloudflare.com`)
- Create: `app/src/ui/dialogs/SignInDialog.svelte`
- Modify: `app/src/ui/state/account.svelte.ts` (`sendCode` com o Turnstile; `pending()`), `app/src/ui/App.svelte` (o diálogo), `app/src/strings.ts`, `app/src/styles/components.css`
- Modify: `app/tests/unit/sync-account.ts` (o Turnstile falso)
- Test: `app/tests/unit/sign-in-dialog.test.ts`

**Interfaces:**
- Consumes: `AccountState.verifyCode`, `passkeySignIn`, `continueSignIn`, `cancelSignIn`, `addPasskey` (Task 14); `siteKey` (Task 13); `app.dialog === 'signin'` (Task 14).
- Produces (em `sync/captcha.ts`): `Captcha { token(siteKey, host): Promise<string> }`, `turnstile: Captcha`.
- Produces (no `AccountState`): `AccountDeps.captcha?: Captcha`; `sendCode(email: string, host: HTMLElement): Promise<SendResult>` (pega o token e chama o cliente); `pending(): Promise<number>`.

Os quatro passos da folha: e-mail (com o link da política de privacidade e o Turnstile invisível), código (`inputmode="numeric"`, `autocomplete="one-time-code"`, aceita colar), passkey ("Criar passkey" ou "Agora não") e primeiro sync ("Pronto. Seus solves estão na conta."). Num aparelho com passkey, ela vem primeiro. A outra conta (spec 7.6) oferece "juntar", "apagar antes de entrar" e "cancelar"; cancelar sai da sessão nova. Os botões têm 44 px no celular.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/sign-in-dialog.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SignInDialog from '../../src/ui/dialogs/SignInDialog.svelte';
import { appWithAccount, fakeApi, fakeAuth } from './sync-account';
import { FakeServer } from './sync-fakes';

async function openDialog(o: Parameters<typeof appWithAccount>[1] = {}, server = new FakeServer()) {
  const { app, repo } = await appWithAccount(fakeApi(server).api, o);
  await vi.waitFor(() => expect(app.account!.siteKey).not.toBeNull());
  app.dialog = 'signin';
  render(SignInDialog, { app, open: true });
  return { app, repo, server };
}

async function typeEmailAndCode(code = '123 456'): Promise<void> {
  await fireEvent.input(await screen.findByRole('textbox', { name: 'E-mail' }), { target: { value: 'ranielli@exemplo.com' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
  const field = await screen.findByRole('textbox', { name: 'Código' });
  await fireEvent.input(field, { target: { value: code } });
  await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('diálogo de entrar (spec 7.2 e 9.2)', () => {
  it('passo 1: e-mail com o Turnstile e o link da política; passo 2: o código aceita colar e sugere o do Mail', async () => {
    const { auth, calls } = fakeAuth();
    await openDialog({ auth });
    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveAttribute('autocomplete', 'email webauthn');
    await fireEvent.input(screen.getByRole('textbox', { name: 'E-mail' }), { target: { value: ' ranielli@exemplo.com ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    const field = await screen.findByRole('textbox', { name: 'Código' });
    expect(calls).toEqual(['send:ranielli@exemplo.com:token-de-1x00000000000000000000BB']);
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    await fireEvent.input(field, { target: { value: 'Seu código: 123 456' } });
    expect((field as HTMLInputElement).value).toBe('123456');
    expect(document.activeElement).toBe(field);
  });

  it('código errado: o aviso, e dá para tentar de novo', async () => {
    await openDialog();
    await typeEmailAndCode('999999');
    expect(await screen.findByRole('alert')).toHaveTextContent('Código errado');
  });

  it('primeiro login: avisa quantos solves sobem, guarda a cópia e sincroniza sem duplicar (spec 6.5)', async () => {
    const server = new FakeServer();
    const { app, repo } = await openDialog({}, server);
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await typeEmailAndCode();
    const skip = await screen.findByRole('button', { name: 'Agora não' }).catch(() => null);
    if (skip) await fireEvent.click(skip); // o passo da passkey só aparece com WebAuthn
    expect(await screen.findByText('1 solve deste aparelho vai para a conta.')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByText('Pronto. Seus solves estão na conta.')).toBeInTheDocument());
    expect((await repo.listBackups()).map((b) => b.reason)).toContain('pre-sync');
    expect([...server.active().values()].filter((c) => c.store === 'solves')).toHaveLength(1);
    expect(app.account!.signedIn).toBe(true);
  });

  it('a mesma conta de antes volta sem perguntar nada e sem novo primeiro login', async () => {
    const { app, repo } = await openDialog();
    await repo.saveSyncState({ accountId: 'conta-1', signedIn: false });
    await typeEmailAndCode();
    const skip = await screen.findByRole('button', { name: 'Agora não' }).catch(() => null);
    if (skip) await fireEvent.click(skip);
    expect(await screen.findByText(/Bem-vindo de volta/)).toBeInTheDocument();
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(true));
    expect((await repo.listBackups()).map((b) => b.reason)).not.toContain('pre-sync');
  });

  it('outra conta no aparelho (spec 7.6): três saídas; cancelar sai da sessão nova e não mexe em nada', async () => {
    const { auth, calls } = fakeAuth({ id: 'conta-2', email: 'outra@exemplo.com' });
    const { app, repo } = await openDialog({ auth });
    await repo.saveSyncState({ accountId: 'conta-1', signedIn: false });
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await typeEmailAndCode();
    expect(await screen.findByRole('heading', { name: 'Este aparelho tem dados de outra conta' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar os dados deste aparelho antes de entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda não'); // o solve da conta 1 ainda não subiu
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await vi.waitFor(() => expect(calls).toContain('sign-out'));
    expect((await repo.getSyncState()).accountId).toBe('conta-1');
    expect(await repo.listSolves()).toHaveLength(1);
  });

  it('num aparelho com passkey, ela vem primeiro, com o código como alternativa', async () => {
    const { auth, calls } = fakeAuth();
    vi.stubGlobal('PublicKeyCredential', class {});
    try {
      const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { auth });
      await repo.saveSyncState({ passkey: true });
      await app.account!.refresh();
      render(SignInDialog, { app, open: true });
      expect(await screen.findByText('Ou receba um código por e-mail:')).toBeInTheDocument();
      await fireEvent.click(screen.getByRole('button', { name: 'Entrar com passkey' }));
      await vi.waitFor(() => expect(calls).toContain('passkey-sign-in'));
      expect(await screen.findByRole('heading', { name: 'Primeiro sync' })).toBeInTheDocument(); // já tem passkey: sem o passo 3
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
```

Em `app/tests/unit/sync-account.ts`:

Troque:

```ts
    now,
    storage: null,
    storageManager: null,
    account: { api, env: o.env ?? manualEnv().env, locks: o.locks ?? null, channel: o.channel ?? null, auth: async () => o.auth ?? fakeAuth().auth },
  });
  await app.init();
  return { app, repo };
```

por:

```ts
    now,
    storage: null,
    storageManager: null,
    account: {
      api,
      env: o.env ?? manualEnv().env,
      locks: o.locks ?? null,
      channel: o.channel ?? null,
      auth: async () => o.auth ?? fakeAuth().auth,
      captcha: { token: async (siteKey) => `token-de-${siteKey}` },
    },
  });
  await app.init();
  return { app, repo };
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/sign-in-dialog.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/ui/dialogs/SignInDialog.svelte"`.

- [ ] **Step 3: O Turnstile e o envio do código**

Crie `app/src/sync/captcha.ts`:

```ts
// O Turnstile invisível (spec 7.2 e 7.5), só na tela do e-mail: o script da Cloudflare carrega na hora, e cada token vale uma vez. Os testes
// passam um falso (AccountDeps.captcha).

export interface Captcha {
  token(siteKey: string, host: HTMLElement): Promise<string>;
}

interface TurnstileApi {
  render(host: HTMLElement, options: Record<string, unknown>): string;
  execute(widget: string): void;
  remove(widget: string): void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () => {
      const api = (globalThis as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error('turnstile'));
    };
    tag.onerror = () => reject(new Error('turnstile'));
    document.head.append(tag);
  }).catch((err: unknown) => {
    loading = null; // sem rede: a próxima tentativa carrega de novo
    throw err;
  });
  return loading;
}

// Só aparece algo na tela se a Cloudflare pedir uma interação (appearance: 'interaction-only').
export const turnstile: Captcha = {
  async token(siteKey, host) {
    const api = await load();
    return new Promise<string>((resolve, reject) => {
      const widget = api.render(host, {
        sitekey: siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token: string) => {
          resolve(token);
          api.remove(widget);
        },
        'error-callback': () => {
          reject(new Error('turnstile'));
          api.remove(widget);
        },
      });
      api.execute(widget);
    });
  },
};
```

Em `app/src/ui/state/account.svelte.ts`:

1. Troque:

```ts
import { T } from '../../strings';
import type { SyncApi } from '../../sync/api';
import { loadAuthClient, type AuthClientLike, type AuthUser, type PasskeyInfo, type SendResult, type VerifyResult } from '../../sync/auth';
import { createSyncEngine, idleStatus, type SyncEngine, type SyncStatus } from '../../sync/engine';
import { acquireLeadership, browserTriggerEnv, startTriggers, type LocksLike, type TriggerEnv, type Triggers } from '../../sync/triggers';
```

por:

```ts
import { T } from '../../strings';
import type { SyncApi } from '../../sync/api';
import { loadAuthClient, type AuthClientLike, type AuthUser, type PasskeyInfo, type SendResult, type VerifyResult } from '../../sync/auth';
import { turnstile, type Captcha } from '../../sync/captcha';
import { createSyncEngine, idleStatus, type SyncEngine, type SyncStatus } from '../../sync/engine';
import { acquireLeadership, browserTriggerEnv, startTriggers, type LocksLike, type TriggerEnv, type Triggers } from '../../sync/triggers';
```

2. Troque:

```ts
  channel?: ChannelLike | null; // padrão: BroadcastChannel('klick-sync'); null: sem canal
  env?: TriggerEnv; // padrão: window, document e os timers
  auth?: () => Promise<AuthClientLike>; // padrão: o cliente do Better Auth, carregado na hora
}

// Depois do código (ou da passkey): o primeiro login neste aparelho, a volta da mesma conta, ou outra conta (spec 7.6).
```

por:

```ts
  channel?: ChannelLike | null; // padrão: BroadcastChannel('klick-sync'); null: sem canal
  env?: TriggerEnv; // padrão: window, document e os timers
  auth?: () => Promise<AuthClientLike>; // padrão: o cliente do Better Auth, carregado na hora
  captcha?: Captcha; // padrão: o Turnstile da Cloudflare
}

// Depois do código (ou da passkey): o primeiro login neste aparelho, a volta da mesma conta, ou outra conta (spec 7.6).
```

3. Troque:

```ts
    return this.client;
  }

  async sendCode(email: string, captchaToken: string): Promise<SendResult> {
    try {
      return await (await this.auth()).sendCode(email.trim(), captchaToken);
    } catch {
      return 'failed';
    }
  }

  async verifyCode(email: string, code: string): Promise<VerifyOutcome> {
```

por:

```ts
    return this.client;
  }

  // O código por e-mail (spec 7.2): primeiro o token do Turnstile, no elemento `host` da tela do e-mail.
  async sendCode(email: string, host: HTMLElement): Promise<SendResult> {
    try {
      const token = await (this.deps.captcha ?? turnstile).token(this.siteKey ?? '', host);
      return await (await this.auth()).sendCode(email.trim(), token);
    } catch {
      return 'failed';
    }
  }

  // Quantas mudanças esperam para subir: o diálogo da outra conta (spec 7.6) não deixa apagar com alguma esperando.
  pending(): Promise<number> {
    return this.host.repo().outboxCount();
  }

  async verifyCode(email: string, code: string): Promise<VerifyOutcome> {
```

- [ ] **Step 4: O diálogo**

Crie `app/src/ui/dialogs/SignInDialog.svelte`:

```svelte
<script lang="ts">
  // Entrar ou criar conta (spec 7.2 e 9.2), na folha dos outros diálogos: e-mail, código, passkey e o primeiro sync. Num aparelho com
  // passkey, ela vem primeiro, com o código como alternativa. Depois do código, se o aparelho tem dados de outra conta, a pergunta da
  // spec 7.6 entra antes da passkey.
  import { tick, untrack } from 'svelte';
  import { T } from '../../strings';
  import type { SignInNext } from '../state/account.svelte';
  import type { AppState } from '../state/app.svelte';
  import { syncLine } from '../sync-status';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  type Step = 'email' | 'code' | 'other' | 'passkey' | 'sync';
  const STEP_NUMBER: Record<Step, number> = { email: 1, code: 2, other: 2, passkey: 3, sync: 4 };

  const account = $derived(app.account);
  let dialogEl = $state<HTMLDialogElement>();
  let bodyEl = $state<HTMLElement>();
  let captchaHost = $state<HTMLElement>();
  let step = $state<Step>('email');
  let email = $state('');
  let code = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  let mode = $state<'join' | 'erase' | 'resume'>('join');
  let joining = $state(0); // solves deste aparelho que sobem (o aviso da spec 6.5)
  let started = $state(false);
  const webauthn = typeof PublicKeyCredential !== 'undefined';

  // Só a abertura zera o diálogo: o estado da conta muda no meio do fluxo (e o reset o lê), sem voltar ao passo 1.
  $effect(() => {
    if (open) untrack(reset);
  });

  function reset(): void {
    step = 'email';
    email = account?.sync.email ?? '';
    code = '';
    error = null;
    busy = false;
    started = false;
  }

  // Cada passo novo leva o foco ao primeiro controle dele (spec 9.6).
  async function go(next: Step): Promise<void> {
    step = next;
    error = null;
    await tick();
    bodyEl?.querySelector<HTMLElement>('input, button')?.focus();
  }

  function onclose(): void {
    // Fechar no meio da pergunta da outra conta é desistir (spec 7.6): a sessão nova sai.
    if (step === 'other') void account?.cancelSignIn();
    if (app.dialog === 'signin') app.dialog = null;
  }

  async function send(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!account || busy || !captchaHost) return;
    busy = true;
    try {
      const result = await account.sendCode(email, captchaHost);
      if (result === 'sent') await go('code');
      else error = result === 'limited' ? T.conta.limited : T.conta.sendFailed;
    } finally {
      busy = false;
    }
  }

  // Colar "123 456" ou "Seu código: 123456" funciona: só os dígitos ficam.
  function onCode(e: Event): void {
    code = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
  }

  async function verify(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!account || busy || code.length !== 6) return;
    busy = true;
    try {
      const result = await account.verifyCode(email, code);
      if (result.ok) await after(result.next);
      else error = { 'bad-code': T.conta.badCode, expired: T.conta.expiredCode, 'too-many': T.conta.tooMany, failed: T.conta.verifyFailed }[result.reason];
    } finally {
      busy = false;
    }
  }

  async function withPasskey(): Promise<void> {
    if (!account || busy) return;
    busy = true;
    try {
      const next = await account.passkeySignIn();
      if (next) await after(next);
      else error = T.conta.passkeyFirstFailed;
    } finally {
      busy = false;
    }
  }

  async function after(next: SignInNext): Promise<void> {
    if (next === 'other-account') return go('other');
    mode = next === 'resume' ? 'resume' : 'join';
    return offerPasskey();
  }

  async function chooseOther(choice: 'join' | 'erase'): Promise<void> {
    if (!account) return;
    if (choice === 'erase') {
      const waiting = await account.pending();
      if (waiting > 0) {
        error = T.conta.pendingBlock(waiting);
        return;
      }
    }
    mode = choice;
    await offerPasskey();
  }

  async function cancelOther(): Promise<void> {
    await account?.cancelSignIn();
    step = 'email';
    dialogEl?.close();
  }

  async function offerPasskey(): Promise<void> {
    if (webauthn && !account?.sync.passkey) return go('passkey');
    return startSync();
  }

  async function createPasskey(): Promise<void> {
    if (!account || busy) return;
    busy = true;
    try {
      if (!(await account.addPasskey())) app.showToast(T.conta.passkeyFailed);
    } finally {
      busy = false;
    }
    await startSync();
  }

  async function startSync(): Promise<void> {
    if (!account) return;
    joining = mode === 'join' ? app.solves.length : 0;
    await go('sync');
    if ((await account.continueSignIn(mode)) === 'ok') started = true;
  }

  const finished = $derived(started && account !== null && account.status.phase === 'idle');
</script>

<dialog bind:this={dialogEl} class="sheet signin" aria-label={T.conta.signInTitle} use:modal={{ open, onclose }}>
  {#if open && account}
    <h2>{T.conta.signInTitle} <small class="muted">{T.conta.stepOf(STEP_NUMBER[step])}</small></h2>
    <div bind:this={bodyEl} data-signin-step={step}>
      {#if step === 'email'}
        {#if account.sync.passkey && webauthn}
          <div class="row">
            <button type="button" class="btn primary" disabled={busy} onclick={withPasskey}>{T.conta.passkeyFirst}</button>
          </div>
          <p class="muted">{T.conta.orCode}</p>
        {:else}
          <p>{T.conta.emailIntro}</p>
        {/if}
        <form onsubmit={send}>
          <label class="field">
            <span>{T.conta.emailLabel}</span>
            <input type="email" required autocomplete="email webauthn" bind:value={email} />
          </label>
          <div data-turnstile bind:this={captchaHost}></div>
          <div class="row">
            <button type="submit" class="btn primary" disabled={busy}>{busy ? T.conta.sending2 : T.conta.sendCode}</button>
          </div>
        </form>
        <p class="muted"><a href="/privacidade" target="_blank" rel="noopener">{T.conta.privacy}</a></p>
      {:else if step === 'code'}
        <p>{T.conta.codeIntro(email.trim())}</p>
        <form onsubmit={verify}>
          <label class="field">
            <span>{T.conta.codeLabel}</span>
            <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" value={code} oninput={onCode} data-code />
          </label>
          <div class="row">
            <button type="submit" class="btn primary" disabled={busy || code.length !== 6}>{T.conta.enter}</button>
            <button type="button" class="btn" disabled={busy} onclick={() => go('email')}>{T.conta.resend}</button>
          </div>
        </form>
      {:else if step === 'other'}
        <h3>{T.conta.otherTitle}</h3>
        <p>{T.conta.otherText}</p>
        <div class="stack">
          <button type="button" class="btn" onclick={() => chooseOther('join')}>{T.conta.otherJoin}</button>
          <button type="button" class="btn danger" onclick={() => chooseOther('erase')}>{T.conta.otherErase}</button>
          <button type="button" class="btn" onclick={cancelOther}>{T.conta.cancel}</button>
        </div>
      {:else if step === 'passkey'}
        <h3>{T.conta.passkeyTitle}</h3>
        <p>{T.conta.passkeyText}</p>
        <div class="row">
          <button type="button" class="btn primary" disabled={busy} onclick={createPasskey}>{T.conta.passkeyOffer}</button>
          <button type="button" class="btn" disabled={busy} onclick={startSync}>{T.conta.skip}</button>
        </div>
      {:else}
        <h3>{T.conta.syncTitle}</h3>
        {#if mode === 'resume'}
          <p>{T.conta.resuming}</p>
        {:else}
          <p data-joining>{T.conta.joining(joining)}</p>
          {#if joining > 0}<p class="muted">{T.conta.joinNote}</p>{/if}
        {/if}
        <p class="muted" data-sync-line>{finished ? T.conta.done : syncLine(account.status, Date.now())}</p>
        {#if !finished}<p class="muted">{T.conta.keepsGoing}</p>{/if}
        <div class="row">
          <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
        </div>
      {/if}
      {#if error}
        <p role="alert">{error}</p>
      {/if}
    </div>
  {/if}
</dialog>
```

Em `app/src/ui/App.svelte`:

1. Troque:

```svelte
  import InstallGuide from './dialogs/InstallGuide.svelte';
  import OnboardingDialog from './dialogs/OnboardingDialog.svelte';
  import SessionsDialog from './dialogs/SessionsDialog.svelte';
  import ShortcutsDialog from './dialogs/ShortcutsDialog.svelte';
  import UpdatePrompt from './dialogs/UpdatePrompt.svelte';
  import DbNotice from './dialogs/DbNotice.svelte';
```

por:

```svelte
  import InstallGuide from './dialogs/InstallGuide.svelte';
  import OnboardingDialog from './dialogs/OnboardingDialog.svelte';
  import SessionsDialog from './dialogs/SessionsDialog.svelte';
  import SignInDialog from './dialogs/SignInDialog.svelte';
  import ShortcutsDialog from './dialogs/ShortcutsDialog.svelte';
  import UpdatePrompt from './dialogs/UpdatePrompt.svelte';
  import DbNotice from './dialogs/DbNotice.svelte';
```

2. Troque:

```svelte
      <ShortcutsDialog {app} open={app.dialog === 'shortcuts'} />
      <OnboardingDialog {app} open={app.dialog === 'onboarding'} onpickfile={() => importInput?.click()} />
      <InstallGuide {app} open={app.dialog === 'install'} {installEvent} onused={() => (installEvent = null)} />
    </div>
  {:else if failed && dbNotice() !== 'closeOthers'}
    <main class="screen">
```

por:

```svelte
      <ShortcutsDialog {app} open={app.dialog === 'shortcuts'} />
      <OnboardingDialog {app} open={app.dialog === 'onboarding'} onpickfile={() => importInput?.click()} />
      <InstallGuide {app} open={app.dialog === 'install'} {installEvent} onused={() => (installEvent = null)} />
      {#if app.account}
        <SignInDialog {app} open={app.dialog === 'signin'} />
      {/if}
    </div>
  {:else if failed && dbNotice() !== 'closeOthers'}
    <main class="screen">
```

Em `app/src/strings.ts`:

Troque:

```ts
    cancel: 'Cancelar',
    signedOut: 'Você saiu da conta. Os dados continuam neste aparelho.',
    signedOutErased: 'Você saiu da conta e os dados deste aparelho foram apagados.',
  }),
});
```

por:

```ts
    cancel: 'Cancelar',
    signedOut: 'Você saiu da conta. Os dados continuam neste aparelho.',
    signedOutErased: 'Você saiu da conta e os dados deste aparelho foram apagados.',
    // Diálogo de entrar (spec 7.2 e 9.2)
    signInTitle: 'Entrar ou criar conta',
    stepOf: (n: number): string => `${n} de 4`,
    emailIntro: 'Sem senha: mandamos um código de 6 dígitos para o seu e-mail. Entrar e criar conta são o mesmo caminho.',
    emailLabel: 'E-mail',
    sendCode: 'Enviar código',
    sending2: 'Enviando…',
    privacy: 'Política de privacidade',
    passkeyFirst: 'Entrar com passkey',
    orCode: 'Ou receba um código por e-mail:',
    passkeyFirstFailed: 'Não deu para entrar com a passkey. Use o código por e-mail.',
    limited: 'Muitos pedidos de código. Espere um pouco e tente de novo.',
    sendFailed: 'Não consegui enviar o código. Confira a conexão e tente de novo.',
    codeIntro: (email: string): string => `Mandamos um código para ${email}. Ele vale por 10 minutos. Se não chegar, olhe o spam.`,
    codeLabel: 'Código',
    enter: 'Entrar',
    resend: 'Mandar outro código',
    badCode: 'Código errado. Confira e tente de novo.',
    expiredCode: 'O código expirou. Peça outro.',
    tooMany: 'Tentativas demais com este código. Peça outro.',
    verifyFailed: 'Não consegui entrar agora. Confira a conexão e tente de novo.',
    otherTitle: 'Este aparelho tem dados de outra conta',
    otherText: 'Os solves deste aparelho eram de outra conta. O que fazer com eles?',
    otherJoin: 'Juntar os dados deste aparelho à nova conta',
    otherErase: 'Apagar os dados deste aparelho antes de entrar',
    passkeyTitle: 'Da próxima vez, sem código',
    passkeyText: 'Crie uma passkey e entre com Face ID, Touch ID ou a senha do aparelho. Dá para criar depois, em Ajustes.',
    passkeyOffer: 'Entrar com Face ID da próxima vez',
    skip: 'Agora não',
    syncTitle: 'Primeiro sync',
    joining: (n: number): string =>
      n === 0 ? 'Este aparelho não tem solves para subir.' : `${n.toLocaleString('pt-BR')} ${n === 1 ? 'solve deste aparelho vai' : 'solves deste aparelho vão'} para a conta.`,
    joinNote: 'Antes, uma cópia deste aparelho foi guardada em Cópias automáticas. Nada se duplica.',
    resuming: 'Bem-vindo de volta. O que mudou nos dois lados se junta agora.',
    done: 'Pronto. Seus solves estão na conta.',
    keepsGoing: 'Pode fechar: o sync continua sozinho.',
  }),
});
```

Em `app/src/styles/components.css`:

Troque:

```css
    min-height: 44px;
  }
}
```

por:

```css
    min-height: 44px;
  }
}

/* ---------- Conta e sync (spec 9.2) ---------- */
.sheet .field {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}

.sheet .field input {
  font: inherit;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  color: var(--ink);
}

.sheet .stack {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

/* No celular, os botões do diálogo têm 44 px de área de toque (spec 9.6). */
@media (max-width: 639px) {
  .signin .btn {
    min-height: 44px;
  }
}
```

- [ ] **Step 5: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/sign-in-dialog.test.ts`
Expected: PASS (6 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sync/captcha.ts src/ui/dialogs/SignInDialog.svelte src/ui/state/account.svelte.ts src/ui/App.svelte src/strings.ts src/styles/components.css tests/unit/sync-account.ts tests/unit/sign-in-dialog.test.ts
git commit -m "feat(app): o diálogo de entrar, com código, passkey, primeiro sync e outra conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: O indicador na barra de cima e o convite

Spec: seções 9.3 e 9.4.

**Files:**
- Create: `app/src/ui/SyncIndicator.svelte`
- Modify: `app/src/ui/App.svelte` (o indicador ao lado da data), `app/src/ui/state/app.svelte.ts` (`openAccount()`), `app/src/ui/timer/TimerScreen.svelte` (o lembrete de exportar), `app/src/strings.ts`, `app/src/styles/components.css`
- Test: `app/tests/unit/sync-indicator.test.ts`

**Interfaces:**
- Consumes: `syncIcon` (Task 14); `AccountState.available`, `signedIn`, `status` (Task 13); `app.dialog = 'signin'` (Task 14); `app.timerBusy`.
- Produces (no `AppState`): `openAccount(): void` (vai a Ajustes, em "Conta e sync").
- Produces: `SyncIndicator.svelte` (sem props; lê `app`): só com conta; `data-sync` com o estado (`synced`, `syncing`, `waiting`, `error`); o rótulo acessível diz o estado; não gira com o timer ocupado; o toque chama `app.openAccount()`.

O convite: com a conta ligada no ambiente e sem conta, o lembrete de exportar ganha "Proteger na nuvem", que abre o diálogo de entrar; com conta, o lembrete some; com a conta desligada, ele é o de sempre.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/sync-indicator.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { idleStatus } from '../../src/sync/engine';
import { T } from '../../src/strings';
import SyncIndicator from '../../src/ui/SyncIndicator.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';
import { appWithAccount, fakeApi } from './sync-account';
import { FakeServer } from './sync-fakes';

describe('indicador do sync na barra de cima (spec 9.3)', () => {
  it('sem conta, não aparece', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api);
    render(SyncIndicator, { app });
    expect(document.querySelector('.sync-ind')).toBeNull();
  });

  it('com conta: os quatro estados no data-sync e no rótulo; não gira com o timer ocupado; o toque leva a Ajustes', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(SyncIndicator, { app });
    const button = await screen.findByRole('button', { name: 'Conta e sync: Sincronizado agora' });
    expect(button).toHaveAttribute('data-sync', 'synced');
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'syncing'));
    app.timerBusy = true;
    await vi.waitFor(() => expect(button).toHaveAttribute('data-quiet', 'true'));
    app.account!.status = { ...idleStatus(), phase: 'offline', pending: 4 };
    await vi.waitFor(() => expect(button).toHaveAccessibleName('Conta e sync: 4 mudanças esperando rede'));
    expect(button).toHaveAttribute('data-sync', 'waiting');
    app.account!.status = { ...idleStatus(), phase: 'error', error: 'auth' };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'error'));
    await fireEvent.click(button);
    expect(app.tab).toBe('ajustes');
  });
});

describe('o convite no lembrete de exportar (spec 9.4)', () => {
  it('com a conta ligada e sem conta, o lembrete oferece "Proteger na nuvem", que abre o diálogo de entrar', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api);
    await vi.waitFor(() => expect(app.account!.available).toBe(true));
    app.exportReminder = true;
    render(TimerScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Proteger na nuvem' }));
    expect(app.dialog).toBe('signin');
  });

  it('com a conta desligada no ambiente, o lembrete é o de sempre', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null }).api);
    app.exportReminder = true;
    render(TimerScreen, { app });
    await screen.findByRole('button', { name: T.reminder.later });
    expect(screen.queryByRole('button', { name: 'Proteger na nuvem' })).toBeNull();
  });

  it('quem tem conta não vê mais o lembrete de exportar', async () => {
    const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(true));
    await repo.saveMeta({ solvesSinceExport: 99 });
    await app.reload();
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() }); // o 100º desde a última exportação
    await vi.waitFor(async () => expect((await repo.getMeta()).solvesSinceExport).toBe(100));
    await new Promise((r) => setTimeout(r, 50));
    expect(app.exportReminder).toBe(false);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/sync-indicator.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/ui/SyncIndicator.svelte"`.

- [ ] **Step 3: O indicador**

Crie `app/src/ui/SyncIndicator.svelte`:

```svelte
<script lang="ts">
  // O indicador do sync na barra de cima (spec 9.3): só com conta, ao lado da data. Quatro estados (sincronizado, sincronizando, esperando
  // rede e erro), com o estado no rótulo acessível. Não anima com o timer ocupado. Um toque leva a Ajustes, em "Conta e sync".
  import { tick } from 'svelte';
  import { T } from '../strings';
  import type { AppState } from './state/app.svelte';
  import { syncIcon, syncLine } from './sync-status';

  let { app }: { app: AppState } = $props();

  const account = $derived(app.account);
  const icon = $derived(account ? syncIcon(account.status) : 'synced');

  async function go(): Promise<void> {
    app.openAccount();
    await tick();
    const section = document.querySelector<HTMLElement>('[data-slot="conta"]');
    section?.scrollIntoView({ block: 'start' });
    section?.querySelector<HTMLElement>('button')?.focus();
  }
</script>

{#if account?.signedIn}
  <button
    type="button"
    class="sync-ind"
    data-sync={icon}
    data-quiet={app.timerBusy ? 'true' : 'false'}
    aria-label={T.conta.indicator(syncLine(account.status, Date.now()))}
    onclick={go}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18Z" />
      {#if icon === 'synced'}
        <path d="m9.5 13.5 2 2 3.5-4" />
      {:else if icon === 'syncing'}
        <path class="spin" d="M12 11v4m-2-2h4" />
      {:else if icon === 'waiting'}
        <path d="M9 14h.01M12 14h.01M15 14h.01" />
      {:else}
        <path d="M12 11.5v2.5m0 2h.01" />
      {/if}
    </svg>
  </button>
{/if}
```

Em `app/src/ui/App.svelte`:

1. Troque:

```svelte
  import SessionsDialog from './dialogs/SessionsDialog.svelte';
  import SignInDialog from './dialogs/SignInDialog.svelte';
  import ShortcutsDialog from './dialogs/ShortcutsDialog.svelte';
  import UpdatePrompt from './dialogs/UpdatePrompt.svelte';
  import DbNotice from './dialogs/DbNotice.svelte';
  import { dbNotice } from './state/db-notice.svelte';
```

por:

```svelte
  import SessionsDialog from './dialogs/SessionsDialog.svelte';
  import SignInDialog from './dialogs/SignInDialog.svelte';
  import ShortcutsDialog from './dialogs/ShortcutsDialog.svelte';
  import SyncIndicator from './SyncIndicator.svelte';
  import UpdatePrompt from './dialogs/UpdatePrompt.svelte';
  import DbNotice from './dialogs/DbNotice.svelte';
  import { dbNotice } from './state/db-notice.svelte';
```

2. Troque:

```svelte
      <div class="meta">
        <button type="button" class="pill" data-session-pill aria-haspopup="dialog" onclick={() => openDialog('sessions')}>{T.session.pill(eventInfo(app.event).short, app.activeSession?.name ?? '')}</button>
        <span data-date>{dateLabel(Date.now())}</span>
      </div>
    </header>
```

por:

```svelte
      <div class="meta">
        <button type="button" class="pill" data-session-pill aria-haspopup="dialog" onclick={() => openDialog('sessions')}>{T.session.pill(eventInfo(app.event).short, app.activeSession?.name ?? '')}</button>
        <span data-date>{dateLabel(Date.now())}</span>
        <SyncIndicator {app} />
      </div>
    </header>
```

Em `app/src/ui/state/app.svelte.ts`:

1. Troque:

```ts
  }

  // Abre a aba Trilha numa vista (a aula de uma etapa, um conjunto, a rodada) ou no começo.
  openTrail(view: TrailView = { kind: 'home' }): void {
    this.trailView = view;
    this.tab = 'trilha';
```

por:

```ts
  }

  // Abre a aba Trilha numa vista (a aula de uma etapa, um conjunto, a rodada) ou no começo.
  // O indicador da barra de cima leva a Ajustes, em "Conta e sync" (spec 9.3).
  openAccount(): void {
    this.tab = 'ajustes';
  }

  openTrail(view: TrailView = { kind: 'home' }): void {
    this.trailView = view;
    this.tab = 'trilha';
```

2. Troque:

```ts
    try {
      const plan = planAfterSolve(counted, await this.folderConfigured());
      if (plan.backup) await this.backup(plan.backup);
      if (plan.remindExport) this.exportReminder = true;
      if (plan.folderSave) await this.copyToFolder();
    } catch {
      this.showToast(T.data.backupFailed); // o solve já está gravado: o que falhou foi a cópia
```

por:

```ts
    try {
      const plan = planAfterSolve(counted, await this.folderConfigured());
      if (plan.backup) await this.backup(plan.backup);
      // Quem tem conta não vê mais o lembrete de exportar (spec 9.4): a nuvem guarda a cópia.
      if (plan.remindExport && !this.account?.signedIn) this.exportReminder = true;
      if (plan.folderSave) await this.copyToFolder();
    } catch {
      this.showToast(T.data.backupFailed); // o solve já está gravado: o que falhou foi a cópia
```

Em `app/src/styles/components.css`:

Troque:

```css
@media (max-width: 639px) {
  .signin .btn {
    min-height: 44px;
  }
}
```

por:

```css
@media (max-width: 639px) {
  .signin .btn {
    min-height: 44px;
  }
}

/* O indicador do sync na barra de cima (spec 9.3). Gira só sincronizando, com o timer parado e sem "reduzir movimento". */
.sync-ind {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--muted);
}

.sync-ind[data-sync='error'] {
  color: var(--arm-ink);
}

.sync-ind[data-sync='syncing'][data-quiet='false'] .spin {
  transform-origin: 12px 13px;
  animation: sync-spin 1.2s linear infinite;
}

@keyframes sync-spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 4: O convite no lembrete de exportar**

Em `app/src/ui/timer/TimerScreen.svelte`:

Troque:

```svelte
        <p>{T.reminder.text}</p>
        <span class="data-actions">
          <button type="button" class="btn" onclick={exportNow}>{T.data.exportNow}</button>
          <button type="button" class="btn" onclick={exportLater}>{T.reminder.later}</button>
        </span>
      </div>
```

por:

```svelte
        <p>{T.reminder.text}</p>
        <span class="data-actions">
          <button type="button" class="btn" onclick={exportNow}>{T.data.exportNow}</button>
          {#if app.account?.available && !app.account.signedIn}
            <!-- Com a conta ligada no ambiente, o lembrete oferece também a nuvem (spec 9.4). -->
            <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.protect}</button>
          {/if}
          <button type="button" class="btn" onclick={exportLater}>{T.reminder.later}</button>
        </span>
      </div>
```

Em `app/src/strings.ts`:

Troque:

```ts
    resuming: 'Bem-vindo de volta. O que mudou nos dois lados se junta agora.',
    done: 'Pronto. Seus solves estão na conta.',
    keepsGoing: 'Pode fechar: o sync continua sozinho.',
  }),
});
```

por:

```ts
    resuming: 'Bem-vindo de volta. O que mudou nos dois lados se junta agora.',
    done: 'Pronto. Seus solves estão na conta.',
    keepsGoing: 'Pode fechar: o sync continua sozinho.',
    // Indicador na barra de cima (spec 9.3) e o convite no lembrete de exportar (spec 9.4)
    indicator: (line: string): string => `Conta e sync: ${line}`,
    protect: 'Proteger na nuvem',
  }),
});
```

- [ ] **Step 5: Rode os testes, os tipos e as suítes**

Run: `pnpm exec vitest run tests/unit/sync-indicator.test.ts`
Expected: PASS (5 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

Run: `pnpm test:e2e`
Expected: PASS (sem servidor, a barra de cima e o lembrete são os de sempre).

- [ ] **Step 6: Commit**

```bash
git add src/ui/SyncIndicator.svelte src/ui/App.svelte src/ui/state/app.svelte.ts src/ui/timer/TimerScreen.svelte src/strings.ts src/styles/components.css tests/unit/sync-indicator.test.ts
git commit -m "feat(app): o indicador do sync na barra de cima e o convite no lembrete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Cópias diárias, restaurar um dia e apagar a conta (servidor)

Spec: seções 7.7, 8.1, 8.3 e 11 (cópia diária e restauração; apagar a conta); decisões 8, 19 e 24 do começo deste plano.

**Files:**
- Create: `app/src/core/sync/snapshot.ts` (o arquivo do Klick a partir dos registros, e os ajustes da conta de uma cópia; puro, usado pelo Worker)
- Create: `app/worker/snapshots.ts`
- Modify: `app/worker/account-store.ts` (o alarme, `snapshot`, `restoreSnapshot`, `wipe`), `app/worker/env.ts` (`SNAPSHOTS`), `app/worker/router.ts` (`GET /api/snapshots`, `POST /api/snapshots/:day/restore`, `DELETE /api/account`)
- Modify: `app/wrangler.jsonc` (o bucket de cada ambiente)
- Test: `app/tests/unit/sync-snapshot.test.ts`, `app/tests/worker/snapshots.test.ts`; Modify: `app/tests/unit/wrangler-config.test.ts`

**Interfaces:**
- Consumes: `restoreChanges` (Task 6); `prefsFromProfile`, `profileFromPrefs`, `joinProfile`, `splitProfile`, `defaultDeviceProfile` (Task 2); `fromChange`, `changeToPref` (Task 2); `KlickExport`, `ProfilePatch` (`core/types.ts`, Task 4); `AccountStore` e `handle` (Tasks 8 a 10); `emailKeyOf` (Task 10).
- Produces (em `core/sync/snapshot.ts`): `exportFromRecords(records: readonly Change[], at: number): KlickExport` (sessões, solves com a lixeira, o treino que existe e o perfil da conta), `accountPrefsOf(profile: ProfilePatch | null): Map<string, unknown> | null`.
- Produces (em `worker/snapshots.ts`): `snapshotPrefix(userId)`, `snapshotKey(userId, name)` (`snap/<userId>/<nome>.json.gz`), `SNAPSHOT_NAME` (`AAAA-MM-DD` ou `AAAA-MM-DDTHH-MM-SSZ-antes`), `dayOf(t)` (o dia em Brasília), `preRestoreName(t)`, `nextSnapshotAt(t)` (03:05 UTC), `gzipJson(data)`, `gunzipJson(bytes)`.
- Produces (no `AccountStore`): `alarm()`, `snapshot(now): Promise<boolean>` (só grava se a conta mudou desde a última cópia), `restoreSnapshot(name, now): Promise<'ok' | 'not-found'>` (grava antes a cópia "antes de restaurar"; regrava cada registro da cópia com datas novas; marca como excluído o que não está nela; a temporada nunca volta), `wipe()` (`deleteAll`, que leva também o alarme).
- Produces (em `worker/router.ts`): `GET /api/snapshots` → `{ copies: CloudCopy[] }` (a mais nova primeiro); `POST /api/snapshots/:day/restore` → 204, 400 com nome torto, 404 sem a cópia; `DELETE /api/account` com `{ email }` → 204 (apaga o objeto, as cópias no R2 e as linhas da conta no D1), 400 se o e-mail não confere.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/sync-snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyChanges } from '../../src/core/sync/apply';
import { prefToChange, toChange } from '../../src/core/sync/records';
import { restoreChanges } from '../../src/core/sync/restore';
import { accountPrefsOf, exportFromRecords } from '../../src/core/sync/snapshot';
import { syncKey, type Change } from '../../src/core/sync/types';
import { MapView } from './sync-fakes';

const T0 = 1_791_500_000_000;
const solve = (id: string, o: { deletedAt?: number | null; ms?: number } = {}) =>
  toChange('solves', {
    id, sessionId: 's', event: '333', ms: o.ms ?? 1000, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0,
    updatedAt: T0, deletedAt: o.deletedAt ?? null, deletionStamp: T0,
  } as never);
const session = toChange('sessions', { id: 's', name: 'Sessão 1', event: '333', order: 0, createdAt: T0, updatedAt: T0, deletedAt: null, deletionStamp: T0 } as never);

describe('a cópia diária no formato do export (spec 8.3)', () => {
  it('leva sessões, solves com a lixeira, o treino que existe e o perfil da conta', () => {
    const records: Change[] = [
      session,
      solve('a'),
      solve('b', { deletedAt: T0 + 5 }),
      toChange('practice', { id: 'p', caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: T0, updatedAt: T0, deletedAt: null, deletionStamp: T0 } as never),
      toChange('practice', { id: 'q', caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: T0, updatedAt: T0, deletedAt: T0, deletionStamp: T0 } as never),
      prefToChange({ key: 'trail.0', value: true, updatedAt: T0 }),
    ];
    const file = exportFromRecords(records, T0 + 9);
    expect(file).toMatchObject({ format: 'klick', version: 1, exportedAt: T0 + 9 });
    expect(file.sessions).toEqual([{ id: 's', name: 'Sessão 1', event: '333', order: 0, createdAt: T0, updatedAt: T0, deletedAt: null }]);
    expect(file.solves.map((s) => [s.id, s.deletedAt])).toEqual([['a', null], ['b', T0 + 5]]);
    expect(file.solves[0]).not.toHaveProperty('deletionStamp');
    expect(file.practice).toEqual([{ id: 'p', caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: T0 }]);
    expect(file.profile?.trail?.[0]).toBe(true);
  });

  it('restaurar a cópia no servidor: datas novas, o que sobra vai para a lixeira, e a temporada nunca volta', () => {
    const now = new Map<string, Change>([session, solve('a', { ms: 999 }), solve('extra')].map((c) => [syncKey(c.store, c.id), c]));
    const file = exportFromRecords([session, solve('a')], T0);
    const stamp = T0 + 1000;
    const changes = restoreChanges([...now.values()], { sessions: file.sessions, solves: file.solves, practice: file.practice ?? null }, accountPrefsOf(file.profile), stamp);
    const result = applyChanges(new MapView(now), changes, { mode: 'server' });
    const out = new Map(result.writes.map((c) => [syncKey(c.store, c.id), c]));
    expect(out.get('solves/a')).toMatchObject({ updatedAt: stamp, deletedAt: null, data: { ms: 1000 } });
    expect(out.get('solves/extra')).toMatchObject({ deletedAt: stamp, deletionStamp: stamp });
    expect(out.get('prefs/trail.0')).toMatchObject({ data: false, updatedAt: stamp });
  });
});
```

Crie `app/tests/worker/snapshots.test.ts`:

```ts
import { runDurableObjectAlarm } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Change, CloudCopy, SyncResponse } from '../../src/core/sync/types';
import type { KlickExport } from '../../src/core/types';
import { dayOf, gunzipJson, nextSnapshotAt, preRestoreName, snapshotKey } from '../../worker/snapshots';
import { call, postJson, T0, testDeps } from './helpers';

const solve = (id: string, ms = 9000): Change => ({
  store: 'solves', id, updatedAt: T0, deletedAt: null, deletionStamp: T0,
  data: { sessionId: 's1', event: '333', ms, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0 },
});
const session: Change = { store: 'sessions', id: 's1', data: { name: 'Sessão 1', event: '333', order: 0, createdAt: T0 }, updatedAt: T0, deletedAt: null, deletionStamp: T0 };
const stubOf = (user: string) => env.ACCOUNT.get(env.ACCOUNT.idFromName(user));

async function sync(user: string, changes: Change[], cursor = 0, now = () => T0): Promise<SyncResponse> {
  const res = await call('/api/sync', postJson({ v: 1, deviceId: 'd1', cursor, clock: T0, changes }), { deps: testDeps({ user, now }) });
  return (await res.json()) as SyncResponse;
}
const copies = async (user: string): Promise<CloudCopy[]> =>
  ((await (await call('/api/snapshots', {}, { deps: testDeps({ user }) })).json()) as { copies: CloudCopy[] }).copies;

describe('a cópia diária (spec 8.3)', () => {
  it('o primeiro sync agenda o alarme; o alarme grava a cópia do dia no formato do export, e só se a conta mudou', async () => {
    await sync('conta-alarme', [session, solve('a'), solve('b')], 0, () => Date.now()); // o alarme fica no futuro de verdade
    const stub = stubOf('conta-alarme');
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const day = dayOf(Date.now());
    const object = await env.SNAPSHOTS.get(snapshotKey('conta-alarme', day));
    const data = (await gunzipJson(await object!.arrayBuffer())) as KlickExport;
    expect(data).toMatchObject({ format: 'klick', version: 1 });
    expect(data.solves.map((s) => s.id)).toEqual(['a', 'b']);
    expect(await copies('conta-alarme')).toEqual([{ name: day, day, kind: 'daily', solves: 2 }]);
    expect(await stub.snapshot(Date.now())).toBe(false); // nada mudou desde a última
  });

  it('a hora da cópia é logo depois da meia-noite em Brasília', () => {
    const t = Date.UTC(2026, 9, 15, 2, 0); // 23h do dia 14 em Brasília
    expect(new Date(nextSnapshotAt(t)).toISOString()).toBe('2026-10-15T03:05:00.000Z');
    expect(dayOf(t)).toBe('2026-10-14');
    expect(preRestoreName(Date.UTC(2026, 9, 15, 21, 3, 7))).toBe('2026-10-15T21-03-07Z-antes');
  });
});

describe('restaurar um dia (spec 8.3)', () => {
  it('grava antes a cópia "antes de restaurar"; o dia volta com datas novas, e o que sobra vai para a lixeira', async () => {
    await sync('conta-volta', [session, solve('a', 1000)]);
    const stub = stubOf('conta-volta');
    expect(await stub.snapshot(T0)).toBe(true);
    await sync('conta-volta', [solve('extra'), { ...solve('a', 2000), updatedAt: T0 + 50 }]);
    const res = await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}), { deps: testDeps({ user: 'conta-volta', now: () => T0 + 1000 }) });
    expect(res.status).toBe(204);
    const list = await copies('conta-volta');
    expect(list.map((c) => c.kind).sort()).toEqual(['daily', 'pre-restore']);
    const all = new Map((await sync('conta-volta', [], 0)).changes.map((c) => [c.id, c]));
    expect(all.get('a')).toMatchObject({ deletedAt: null, data: { ms: 1000 } });
    expect(all.get('a')!.updatedAt).toBeGreaterThan(T0 + 50);
    expect(all.get('extra')!.deletedAt).not.toBeNull();
  });

  it('um nome torto é 400; um dia sem cópia é 404', async () => {
    const deps = testDeps({ user: 'conta-nome' });
    expect((await call('/api/snapshots/..%2Foutra/restore', postJson({}), { deps })).status).toBe(400);
    await sync('conta-nome', [solve('z')]);
    expect((await call('/api/snapshots/2020-01-01/restore', postJson({}), { deps })).status).toBe(404);
  });
});

describe('apagar a conta (spec 7.7)', () => {
  it('confirma pelo e-mail; apaga na hora o objeto, as cópias e as linhas do D1', async () => {
    const user = 'conta-fim';
    await env.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(user, '', `${user}@exemplo.com`, new Date(T0).toISOString(), new Date(T0).toISOString())
      .run();
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    const deps = testDeps({ user });
    const del = (email: string) => call('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }, { deps });
    expect((await del('outro@exemplo.com')).status).toBe(400);
    expect((await del(` ${user.toUpperCase()}@EXEMPLO.COM `)).status).toBe(204);
    expect(await copies(user)).toEqual([]);
    expect((await sync(user, [], 0)).changes).toEqual([]);
    expect(await env.DB.prepare('SELECT id FROM "user" WHERE id = ?').bind(user).first()).toBeNull();
  });
});
```

Em `app/tests/unit/wrangler-config.test.ts`:

1. Troque:

```ts
  database_name: string;
  database_id: string;
}
const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
  vars: Record<string, string>;
  assets: { run_worker_first: string[] };
  d1_databases: D1[];
  env: { production: { vars: Record<string, string>; assets: { run_worker_first: string[] }; d1_databases: D1[] } };
};
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];
```

por:

```ts
  database_name: string;
  database_id: string;
}
interface R2 {
  binding: string;
  bucket_name: string;
}
const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
  vars: Record<string, string>;
  assets: { run_worker_first: string[] };
  d1_databases: D1[];
  r2_buckets: R2[];
  env: { production: { vars: Record<string, string>; assets: { run_worker_first: string[] }; d1_databases: D1[]; r2_buckets: R2[] } };
};
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];
```

2. Troque:

```ts
    for (const db of [beta, root]) expect(db.database_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(beta.database_id).not.toBe(root.database_id);
  });
});
```

por:

```ts
    for (const db of [beta, root]) expect(db.database_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(beta.database_id).not.toBe(root.database_id);
  });

  it('cada ambiente tem o próprio bucket das cópias diárias', () => {
    expect(config.r2_buckets).toEqual([{ binding: 'SNAPSHOTS', bucket_name: 'klick-snapshots-beta' }]);
    expect(config.env.production.r2_buckets).toEqual([{ binding: 'SNAPSHOTS', bucket_name: 'klick-snapshots' }]);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/sync-snapshot.test.ts tests/unit/wrangler-config.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/core/sync/snapshot"`, e "cada ambiente tem o próprio bucket das cópias diárias" (`expected undefined to deeply equal [ { binding: 'SNAPSHOTS', …(1) } ]`).

Run: `pnpm test:worker`
Expected: FAIL: `Failed to resolve import "../../worker/snapshots"`.

- [ ] **Step 3: A cópia no formato do export**

Crie `app/src/core/sync/snapshot.ts`:

```ts
// A cópia diária da conta (spec 8.3), no formato do export do Klick (KlickExport): o Worker a escreve a partir dos registros, e o app a lê
// como qualquer arquivo. Puro, para o Worker e os testes de unidade.
import { defaultDeviceProfile, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from './prefs';
import { changeToPref, fromChange, type StampedRecord } from './records';
import type { Change } from './types';
import type { KlickExport, Practice, Profile, ProfilePatch, Session, Solve } from '../types';

const bare = <R extends object>(c: Change): R => {
  const { deletionStamp: _d, ...rec } = fromChange<StampedRecord>(c) as StampedRecord & Record<string, unknown>;
  return rec as R;
};

// Os registros da conta como arquivo: sessões e solves com a lixeira, o treino que existe, e o perfil da conta com os ajustes do aparelho no
// padrão (o servidor não guarda os do aparelho).
export function exportFromRecords(records: readonly Change[], at: number): KlickExport {
  const of = (store: Change['store']) => records.filter((c) => c.store === store);
  const sessions = of('sessions').map((c) => bare<Session>(c)).sort((a, b) => a.order - b.order);
  const solves = of('solves').map((c) => bare<Solve>(c)).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const practice = of('practice')
    .filter((c) => c.deletedAt === null)
    .map((c) => {
      const { updatedAt: _u, deletedAt: _x, ...p } = bare<Practice & { updatedAt: number; deletedAt: null }>(c);
      return p as Practice;
    })
    .sort((a, b) => a.at - b.at);
  const profile = joinProfile(defaultDeviceProfile(), profileFromPrefs(of('prefs').map(changeToPref)));
  return { format: 'klick', version: 1, exportedAt: at, sessions, solves, profile, practice };
}

// As chaves da conta de um perfil de arquivo, todas (o padrão por baixo do que faltar): o que restaurar a cópia grava (restoreChanges).
export function accountPrefsOf(profile: ProfilePatch | null): Map<string, unknown> | null {
  if (!profile) return null;
  const base = joinProfile(undefined, profileFromPrefs([]));
  const full: Profile = {
    ...base,
    ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
    settings: { ...base.settings, ...profile.settings, sound: { ...base.settings.sound, ...profile.settings?.sound } },
  };
  return prefsFromProfile(splitProfile(full).account, { withDefaults: true });
}
```

- [ ] **Step 4: As cópias no R2, o alarme e as rotas**

Crie `app/worker/snapshots.ts`:

```ts
// As cópias diárias no R2 (spec 8.3): snap/<userId>/<nome>.json.gz, comprimidas com gzip. O dia é o de Brasília (UTC-3, sem horário de
// verão desde 2019); a cópia sai logo depois da meia-noite de lá. A regra de ciclo de vida do bucket apaga o que passa de 30 dias.

export const snapshotPrefix = (userId: string): string => `snap/${userId}/`;
export const snapshotKey = (userId: string, name: string): string => `${snapshotPrefix(userId)}${name}.json.gz`;
export const SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}(T\d{2}-\d{2}-\d{2}Z-antes)?$/;

const BRT = 3 * 3_600_000;
export const dayOf = (t: number): string => new Date(t - BRT).toISOString().slice(0, 10);
// A cópia "antes de restaurar": o dia e a hora, para não sobrescrever a do dia.
export const preRestoreName = (t: number): string => `${dayOf(t)}T${new Date(t).toISOString().slice(11, 19).replaceAll(':', '-')}Z-antes`;

// O próximo 03:05 UTC (00:05 em Brasília) depois de `t`.
export function nextSnapshotAt(t: number): number {
  const d = new Date(t);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 5);
  return today > t ? today : today + 86_400_000;
}

async function pipe(input: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  const stream = new Blob([input]).stream().pipeThrough(transform);
  return new Response(stream).arrayBuffer();
}

export function gzipJson(data: unknown): Promise<ArrayBuffer> {
  return pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('gzip'));
}

export async function gunzipJson(bytes: ArrayBuffer): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(bytes), new DecompressionStream('gzip')))) as unknown;
}
```

Em `app/worker/account-store.ts`:

1. Troque:

```ts
// app (src/core/sync).
import { DurableObject } from 'cloudflare:workers';
import { applyChanges, type RecordView } from '../src/core/sync/apply';
import { SYNC_BATCH, type Change, type SyncRequest, type SyncResponse, type SyncStore } from '../src/core/sync/types';
import type { Env } from './env';

type Row = {
  store: string;
```

por:

```ts
// app (src/core/sync).
import { DurableObject } from 'cloudflare:workers';
import { applyChanges, type RecordView } from '../src/core/sync/apply';
import { restoreChanges } from '../src/core/sync/restore';
import { accountPrefsOf, exportFromRecords } from '../src/core/sync/snapshot';
import { SYNC_BATCH, type Change, type SyncRequest, type SyncResponse, type SyncStore } from '../src/core/sync/types';
import type { KlickExport } from '../src/core/types';
import type { Env } from './env';
import { dayOf, gunzipJson, gzipJson, nextSnapshotAt, preRestoreName, snapshotKey } from './snapshots';

type Row = {
  store: string;
```

2. Troque:

```ts
  const d = c.data as { sessionId?: unknown } | null;
  return c.store === 'solves' && typeof d === 'object' && d !== null && typeof d.sessionId === 'string' ? d.sessionId : null;
};

export class AccountStore extends DurableObject<Env> {
  private readonly sql: SqlStorage;
```

por:

```ts
  const d = c.data as { sessionId?: unknown } | null;
  return c.store === 'solves' && typeof d === 'object' && d !== null && typeof d.sessionId === 'string' ? d.sessionId : null;
};

const activeSolves = (data: KlickExport): number => data.solves.filter((s) => s.deletedAt === null).length;

export class AccountStore extends DurableObject<Env> {
  private readonly sql: SqlStorage;
```

3. Troque:

```ts
    };
  }

  // Grava cada registro que mudou com a próxima revisão da conta.
  private write(changes: readonly Change[]): void {
    let rev = Number(this.getState('rev') ?? '0');
```

por:

```ts
    };
  }

  private all(): Change[] {
    return this.sql.exec<Row>('SELECT * FROM records').toArray().map(rowToChange);
  }

  // Grava cada registro que mudou com a próxima revisão da conta.
  private write(changes: readonly Change[]): void {
    let rev = Number(this.getState('rev') ?? '0');
```

4. Troque:

```ts

  // POST /api/sync (spec 6.1): valida e junta o lote, dá revisão ao que mudou e devolve o que mudou desde o cursor, até SYNC_BATCH.
  async syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse> {
    return this.ctx.storage.transactionSync((): SyncResponse => {
      if (this.getState('userId') === null) this.setState('userId', userId);
      const result = applyChanges(this.view(), req.changes, { mode: 'server' });
      this.write(result.writes);
```

por:

```ts

  // POST /api/sync (spec 6.1): valida e junta o lote, dá revisão ao que mudou e devolve o que mudou desde o cursor, até SYNC_BATCH.
  async syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse> {
    const response = this.ctx.storage.transactionSync((): SyncResponse => {
      if (this.getState('userId') === null) this.setState('userId', userId);
      const result = applyChanges(this.view(), req.changes, { mode: 'server' });
      this.write(result.writes);
```

5. Troque:

```ts
        serverTime: now,
      };
    });
  }
}
```

por:

```ts
        serverTime: now,
      };
    });
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(nextSnapshotAt(now));
    return response;
  }

  // A cópia do dia (spec 8.3): uma vez por dia, só se a conta mudou desde a última.
  async alarm(): Promise<void> {
    const now = Date.now();
    await this.snapshot(now);
    await this.ctx.storage.setAlarm(nextSnapshotAt(now));
  }

  async snapshot(now: number): Promise<boolean> {
    const userId = this.getState('userId');
    const rev = this.getState('rev') ?? '0';
    if (userId === null || this.getState('snapshotRev') === rev) return false;
    const data = exportFromRecords(this.all(), now);
    const day = dayOf(now);
    await this.env.SNAPSHOTS.put(snapshotKey(userId, day), await gzipJson(data), {
      customMetadata: { kind: 'daily', day, solves: String(activeSolves(data)) },
    });
    this.setState('snapshotRev', rev);
    this.setState('lastSnapshotDay', day);
    return true;
  }

  // POST /api/snapshots/:name/restore (spec 8.3): grava antes a cópia "antes de restaurar"; depois, cada registro da cópia com datas novas,
  // e o que existe hoje e não está nela vai para a lixeira. Os aparelhos recebem pelo sync normal.
  async restoreSnapshot(name: string, now: number): Promise<'ok' | 'not-found'> {
    const userId = this.getState('userId');
    if (userId === null) return 'not-found';
    const object = await this.env.SNAPSHOTS.get(snapshotKey(userId, name));
    if (!object) return 'not-found';
    const copy = (await gunzipJson(await object.arrayBuffer())) as KlickExport;
    const before = exportFromRecords(this.all(), now);
    await this.env.SNAPSHOTS.put(snapshotKey(userId, preRestoreName(now)), await gzipJson(before), {
      customMetadata: { kind: 'pre-restore', day: dayOf(now), solves: String(activeSolves(before)) },
    });
    this.ctx.storage.transactionSync(() => {
      const current = this.all();
      const stamp = current.reduce((max, c) => Math.max(max, c.updatedAt + 1, c.deletionStamp + 1), now); // vence tudo o que existe
      const practice = Array.isArray(copy.practice) ? copy.practice : null;
      const changes = restoreChanges(current, { sessions: copy.sessions, solves: copy.solves, practice }, accountPrefsOf(copy.profile), stamp);
      this.write(applyChanges(this.view(), changes, { mode: 'server' }).writes);
    });
    return 'ok';
  }

  // Apagar a conta (spec 7.7): o banco inteiro do objeto e o alarme somem na hora.
  async wipe(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.migrate();
  }
}
```

Em `app/worker/env.ts`:

Troque:

```ts
  API_BURST: RateLimit; // rajada de pedidos de sync por conta (o binding só conta janelas de 10 ou 60 s)
  DB: D1Database; // as contas, as sessões e as passkeys (Better Auth), e os pedidos de código da última hora
  OTP_BURST: RateLimit; // rajada de pedidos de código por IP
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
```

por:

```ts
  API_BURST: RateLimit; // rajada de pedidos de sync por conta (o binding só conta janelas de 10 ou 60 s)
  DB: D1Database; // as contas, as sessões e as passkeys (Better Auth), e os pedidos de código da última hora
  OTP_BURST: RateLimit; // rajada de pedidos de código por IP
  SNAPSHOTS: R2Bucket; // as cópias diárias, snap/<userId>/<nome>.json.gz
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
```

Em `app/worker/router.ts`:

1. Troque:

```ts
// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// /api/auth/* é do Better Auth; as outras rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos
// do app. Os logs levam só ids, contagens, durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import { E2E_TOKEN, guardSendCode, turnstileVerifier, type VerifyCaptcha } from './abuse';
import { createAuth, sessionUser, type User } from './auth';
import type { Env } from './env';
import { e2eMailbox, e2eMailer, missingMailer, resendMailer, type Mailer } from './mail';

export interface Deps {
  now: () => number;
```

por:

```ts
// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// /api/auth/* é do Better Auth; as outras rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos
// do app. Os logs levam só ids, contagens, durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type CloudCopy, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import { E2E_TOKEN, emailKeyOf, guardSendCode, turnstileVerifier, type VerifyCaptcha } from './abuse';
import { createAuth, sessionUser, type User } from './auth';
import type { Env } from './env';
import { e2eMailbox, e2eMailer, missingMailer, resendMailer, type Mailer } from './mail';
import { SNAPSHOT_NAME, snapshotPrefix } from './snapshots';

export interface Deps {
  now: () => number;
```

2. Troque:

```ts
  return { v: SYNC_PROTOCOL, deviceId, cursor: cursor as number, clock, changes };
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
```

por:

```ts
  return { v: SYNC_PROTOCOL, deviceId, cursor: cursor as number, clock, changes };
}

async function listCopies(env: Env, userId: string): Promise<CloudCopy[]> {
  const prefix = snapshotPrefix(userId);
  const copies: CloudCopy[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SNAPSHOTS.list({ prefix, include: ['customMetadata'], cursor });
    for (const o of page.objects) {
      const name = o.key.slice(prefix.length, -'.json.gz'.length);
      const meta = o.customMetadata ?? {};
      copies.push({ name, day: meta.day ?? name.slice(0, 10), kind: meta.kind === 'pre-restore' ? 'pre-restore' : 'daily', solves: Number(meta.solves ?? 0) });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return copies.sort((a, b) => (a.name < b.name ? 1 : -1));
}

async function deleteCopies(env: Env, userId: string): Promise<void> {
  for (;;) {
    const page = await env.SNAPSHOTS.list({ prefix: snapshotPrefix(userId), limit: 1000 });
    if (page.objects.length === 0) return;
    await env.SNAPSHOTS.delete(page.objects.map((o) => o.key));
  }
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
```

3. Troque:

```ts
    return json(res);
  }

  return fail(404, 'not-found');
}
```

por:

```ts
    return json(res);
  }

  // As cópias na nuvem (spec 8.3).
  if (path === '/api/snapshots' && request.method === 'GET') return json({ copies: await listCopies(env, user.id) });

  const restore = /^\/api\/snapshots\/([^/]+)\/restore$/.exec(path);
  if (restore && request.method === 'POST') {
    const guard = writeGuard(request, env);
    if (guard) return guard;
    const name = decodeURIComponent(restore[1]);
    if (!SNAPSHOT_NAME.test(name)) return fail(400, 'bad-name');
    const outcome = await account.restoreSnapshot(name, deps.now());
    log({ evt: 'restore', user: user.id, outcome });
    return outcome === 'ok' ? new Response(null, { status: 204 }) : fail(404, 'not-found');
  }

  // Apagar a conta (spec 7.7): o e-mail digitado confirma; somem na hora o objeto da conta, as cópias no R2 e as linhas no D1.
  if (path === '/api/account' && request.method === 'DELETE') {
    const guard = writeGuard(request, env);
    if (guard) return guard;
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const typed = isRec(body) && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (typed !== user.email.toLowerCase()) return fail(400, 'confirm');
    await account.wipe();
    await deleteCopies(env, user.id);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM passkey WHERE userId = ?').bind(user.id),
      env.DB.prepare('DELETE FROM session WHERE userId = ?').bind(user.id),
      env.DB.prepare('DELETE FROM account WHERE userId = ?').bind(user.id),
      env.DB.prepare('DELETE FROM verification WHERE instr(identifier, ?) > 0').bind(user.email.toLowerCase()),
      env.DB.prepare('DELETE FROM otp_requests WHERE key = ?').bind(await emailKeyOf(user.email)),
      env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(user.id),
    ]);
    log({ evt: 'account-deleted', user: user.id });
    return new Response(null, { status: 204 });
  }

  return fail(404, 'not-found');
}
```

- [ ] **Step 5: O bucket de cada ambiente no wrangler.jsonc**

Em `app/wrangler.jsonc`:

1. Troque:

```jsonc
  // Um Durable Object com SQLite por conta (spec 8.2). As migrações valem para os dois ambientes; cada um tem o próprio namespace.
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AccountStore"] }],
  "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
  "ratelimits": [
    { "name": "API_BURST", "namespace_id": "1101", "simple": { "limit": 120, "period": 60 } },
    { "name": "OTP_BURST", "namespace_id": "1102", "simple": { "limit": 5, "period": 60 } }
```

por:

```jsonc
  // Um Durable Object com SQLite por conta (spec 8.2). As migrações valem para os dois ambientes; cada um tem o próprio namespace.
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AccountStore"] }],
  "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
  "r2_buckets": [{ "binding": "SNAPSHOTS", "bucket_name": "klick-snapshots-beta" }],
  "ratelimits": [
    { "name": "API_BURST", "namespace_id": "1101", "simple": { "limit": 120, "period": 60 } },
    { "name": "OTP_BURST", "namespace_id": "1102", "simple": { "limit": 5, "period": 60 } }
```

2. Troque:

```jsonc
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
      "ratelimits": [
        { "name": "API_BURST", "namespace_id": "2101", "simple": { "limit": 120, "period": 60 } },
        { "name": "OTP_BURST", "namespace_id": "2102", "simple": { "limit": 5, "period": 60 } }
```

por:

```jsonc
      "routes": [{ "pattern": "klick.ranimontagna.com", "custom_domain": true }],
      "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
      "durable_objects": { "bindings": [{ "name": "ACCOUNT", "class_name": "AccountStore" }] },
      "r2_buckets": [{ "binding": "SNAPSHOTS", "bucket_name": "klick-snapshots" }],
      "ratelimits": [
        { "name": "API_BURST", "namespace_id": "2101", "simple": { "limit": 120, "period": 60 } },
        { "name": "OTP_BURST", "namespace_id": "2102", "simple": { "limit": 5, "period": 60 } }
```

- [ ] **Step 6: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/sync-snapshot.test.ts tests/unit/wrangler-config.test.ts`
Expected: PASS (2 + 5 testes).

Run: `pnpm test:worker`
Expected: PASS (3 + 8 + 7 + 9 + 5 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/sync/snapshot.ts worker/snapshots.ts worker/account-store.ts worker/env.ts worker/router.ts wrangler.jsonc tests/unit/sync-snapshot.test.ts tests/unit/wrangler-config.test.ts tests/worker/snapshots.test.ts
git commit -m "feat(worker): cópias diárias no R2, restaurar um dia e apagar a conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Os buckets e a regra dos 30 dias (com o Portão B feito)**

O R2 precisa estar ativo na conta (Portão B). Sem ele, pule este passo e volte aqui antes do próximo deploy: o deploy recusa um bucket que não existe.

Run: `npx wrangler r2 bucket create klick-snapshots-beta --location enam --update-config=false`
Run: `npx wrangler r2 bucket create klick-snapshots --location enam --update-config=false`
Expected: "Created bucket" nas duas.

Run: `npx wrangler r2 bucket lifecycle add klick-snapshots-beta apaga-30-dias snap/ --expire-days 30 --force`
Run: `npx wrangler r2 bucket lifecycle add klick-snapshots apaga-30-dias snap/ --expire-days 30 --force`
Expected: a regra criada nas duas; `npx wrangler r2 bucket lifecycle list klick-snapshots` mostra `apaga-30-dias`, com o prefixo `snap/` e 30 dias.

---

### Task 18: Cópias na nuvem e apagar a conta (telas)

Spec: seções 7.7, 8.3 e 9.1 ("Cópias na nuvem" e "Apagar minha conta").

**Files:**
- Create: `app/src/ui/dialogs/CloudCopiesDialog.svelte`, `app/src/ui/dialogs/DeleteAccountDialog.svelte`
- Modify: `app/src/sync/api.ts` (`cloudCopies`, `restoreCloudCopy`, `deleteAccount`), `app/src/data/repository.ts` (`forgetAccount`), `app/src/ui/state/account.svelte.ts`, `app/src/ui/state/app.svelte.ts` (`DialogId`), `app/src/ui/ajustes/AccountSection.svelte`, `app/src/strings.ts`
- Modify: `app/tests/unit/sync-account.ts` (a API falsa ganha as cópias e o apagar)
- Test: `app/tests/unit/cloud-account.test.ts`

**Interfaces:**
- Consumes: as rotas da Task 17; `CloudCopy` (Task 1); `AccountState` (Tasks 13 a 15).
- Produces (no `SyncApi`): `cloudCopies(): Promise<CloudCopy[]>`, `restoreCloudCopy(name: string): Promise<void>`, `deleteAccount(email: string): Promise<void>`.
- Produces (no `Repository`): `forgetAccount(): Promise<void>` (a conta foi apagada no servidor: o estado do sync volta ao padrão, com o relógio; os dados do aparelho ficam, e a fila também).
- Produces (no `AccountState`): `cloudCopies()`, `restoreCloudCopy(name): Promise<boolean>` (depois de restaurar, sincroniza), `deleteAccount(email): Promise<'ok' | 'mismatch' | 'failed'>`.
- Produces (no `AppState`): `DialogId` ganha `'cloud'` e `'deleteAccount'`.

Apagar a conta deixa os dados no aparelho, fora de qualquer conta; a pessoa confirma digitando o e-mail. Restaurar um dia pede o segundo clique.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/cloud-account.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';
import { appWithAccount, fakeApi } from './sync-account';
import { FakeServer } from './sync-fakes';

describe('cópias na nuvem (spec 8.3 e 9.1)', () => {
  it('lista os dias com os solves; restaurar pede o segundo clique e depois sincroniza', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [
      { name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 1234 },
      { name: '2026-10-14T21-03-00Z-antes', day: '2026-10-14', kind: 'pre-restore', solves: 1200 },
    ];
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    expect(await screen.findByText('1234 solves')).toBeInTheDocument();
    expect(screen.getByText('2026-10-14, antes de uma restauração')).toBeInTheDocument();
    const sync = vi.spyOn(app.account!, 'syncNow');
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    expect(net.cloud.restored).toEqual([]);
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(net.cloud.restored).toEqual(['2026-10-15']));
    expect(sync).toHaveBeenCalled();
  });
});

describe('apagar minha conta (spec 7.7)', () => {
  it('confirma digitando o e-mail; apaga no servidor e deixa os dados do aparelho, fora da conta', async () => {
    const net = fakeApi(new FakeServer());
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Apagar minha conta' }));
    const field = await screen.findByLabelText('Para confirmar, digite ranielli@exemplo.com');
    await fireEvent.input(field, { target: { value: 'outra@exemplo.com' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O e-mail não confere.');
    expect(net.cloud.deleted).toEqual([]);
    await fireEvent.input(field, { target: { value: ' Ranielli@Exemplo.com ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    await vi.waitFor(() => expect(net.cloud.deleted).toEqual(['Ranielli@Exemplo.com']));
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
    expect(await repo.listSolves()).toHaveLength(1);
    expect(await repo.getSyncState()).toMatchObject({ accountId: null, cursor: 0 });
    expect(await repo.outboxCount()).toBe(0);
  });
});
```

Em `app/tests/unit/sync-account.ts`:

1. Troque:

```ts
import { openKlickDb } from '../../src/data/db';
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import type { Health, SyncApi } from '../../src/sync/api';
import type { AuthClientLike } from '../../src/sync/auth';
import type { TriggerEnv } from '../../src/sync/triggers';
import { AppState, type AppDeps } from '../../src/ui/state/app.svelte';
```

por:

```ts
import { openKlickDb } from '../../src/data/db';
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import type { CloudCopy, Health, SyncApi } from '../../src/sync/api';
import type { AuthClientLike } from '../../src/sync/auth';
import type { TriggerEnv } from '../../src/sync/triggers';
import { AppState, type AppDeps } from '../../src/ui/state/app.svelte';
```

2. Troque:

```ts
// A API falsa: /api/health e /api/sync, com o servidor falso de uma conta.
export function fakeApi(server: FakeServer, health: Health | null = { accounts: true, turnstileSiteKey: '1x00000000000000000000BB' }) {
  let failure: Error | null = null;
  const api: SyncApi = {
    health: async () => health,
    sync: async (req: SyncRequest): Promise<SyncResponse> => {
      if (failure) throw failure;
      return structuredClone(server.sync(structuredClone(req)));
    },
  };
  return { api, fail: (e: Error | null) => (failure = e) };
}

// Um canal entre "abas" na memória.
```

por:

```ts
// A API falsa: /api/health e /api/sync, com o servidor falso de uma conta.
export function fakeApi(server: FakeServer, health: Health | null = { accounts: true, turnstileSiteKey: '1x00000000000000000000BB' }) {
  let failure: Error | null = null;
  const cloud = { copies: [] as CloudCopy[], restored: [] as string[], deleted: [] as string[] };
  const api: SyncApi = {
    health: async () => health,
    sync: async (req: SyncRequest): Promise<SyncResponse> => {
      if (failure) throw failure;
      return structuredClone(server.sync(structuredClone(req)));
    },
    cloudCopies: async () => {
      if (failure) throw failure;
      return structuredClone(cloud.copies);
    },
    restoreCloudCopy: async (name) => {
      if (failure) throw failure;
      cloud.restored.push(name);
    },
    deleteAccount: async (email) => {
      if (failure) throw failure;
      cloud.deleted.push(email);
    },
  };
  return { api, cloud, fail: (e: Error | null) => (failure = e) };
}

// Um canal entre "abas" na memória.
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/cloud-account.test.ts`
Expected: FAIL (2 testes): `Unable to find role="button" and name "Ver cópias na nuvem"` e `Unable to find role="button" and name "Apagar minha conta"`.

- [ ] **Step 3: A API, o repositório e a conta**

Em `app/src/sync/api.ts`:

1. Troque:

```ts
// O cliente HTTP do servidor do Klick (spec 6.1 e 8.1): mesma origem, com o cookie da sessão. Os erros viram tipos que o motor e as telas
// entendem; nada aqui guarda estado.
import type { SyncRequest, SyncResponse } from '../core/sync/types';

export type ApiErrorKind = 'offline' | 'auth' | 'update' | 'server' | 'client';
```

por:

```ts
// O cliente HTTP do servidor do Klick (spec 6.1 e 8.1): mesma origem, com o cookie da sessão. Os erros viram tipos que o motor e as telas
// entendem; nada aqui guarda estado.
import type { CloudCopy, SyncRequest, SyncResponse } from '../core/sync/types';

export type { CloudCopy } from '../core/sync/types';

export type ApiErrorKind = 'offline' | 'auth' | 'update' | 'server' | 'client';
```

2. Troque:

```ts
export interface SyncApi {
  health(): Promise<Health | null>; // null: sem servidor (sem rede, ou o app servido sem o Worker, como no vite preview)
  sync(req: SyncRequest): Promise<SyncResponse>;
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
```

por:

```ts
export interface SyncApi {
  health(): Promise<Health | null>; // null: sem servidor (sem rede, ou o app servido sem o Worker, como no vite preview)
  sync(req: SyncRequest): Promise<SyncResponse>;
  cloudCopies(): Promise<CloudCopy[]>; // as cópias dos últimos 30 dias, a mais nova primeiro
  restoreCloudCopy(name: string): Promise<void>;
  deleteAccount(email: string): Promise<void>; // spec 7.7: o e-mail digitado confirma
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
```

3. Troque:

```ts
    async sync(req) {
      return (await (await post('/api/sync', req)).json()) as SyncResponse;
    },
  };
}
```

por:

```ts
    async sync(req) {
      return (await (await post('/api/sync', req)).json()) as SyncResponse;
    },
    async cloudCopies() {
      const data = (await (await call('/api/snapshots')).json()) as { copies?: CloudCopy[] };
      return Array.isArray(data.copies) ? data.copies : [];
    },
    async restoreCloudCopy(name) {
      await post(`/api/snapshots/${encodeURIComponent(name)}/restore`, {});
    },
    async deleteAccount(email) {
      await call('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    },
  };
}
```

Em `app/src/data/repository.ts`:

1. Troque:

```ts
  // Apaga os dados deste aparelho (spec 7.6 e 7.7): solves, sessões, treino, conta, fila e cópias. Ficam os ajustes do aparelho; o estado
  // do sync volta ao padrão, com o relógio.
  wipeData(): Promise<void>;
  getSyncState(): Promise<SyncState>; // o bloco sync do meta (spec 5.4); o padrão antes do primeiro login
  // Muda o estado do sync e avisa 'sync'. O relógio só sobe: um clock menor que o gravado é ignorado.
  saveSyncState(patch: Partial<SyncState>): Promise<SyncState>;
```

por:

```ts
  // Apaga os dados deste aparelho (spec 7.6 e 7.7): solves, sessões, treino, conta, fila e cópias. Ficam os ajustes do aparelho; o estado
  // do sync volta ao padrão, com o relógio.
  wipeData(): Promise<void>;
  // A conta foi apagada (spec 7.7): os dados ficam, a fila esvazia e o estado do sync volta ao padrão, com o relógio.
  forgetAccount(): Promise<void>;
  getSyncState(): Promise<SyncState>; // o bloco sync do meta (spec 5.4); o padrão antes do primeiro login
  // Muda o estado do sync e avisa 'sync'. O relógio só sobe: um clock menor que o gravado é ignorado.
  saveSyncState(patch: Partial<SyncState>): Promise<SyncState>;
```

2. Troque:

```ts
      announce('all', 'sync');
    },

    async getSyncState() {
      return syncStateOrDefault((await db.get('meta', 'sync')) as SyncState | undefined);
    },
```

por:

```ts
      announce('all', 'sync');
    },

    async forgetAccount() {
      await write(['outbox', 'meta'], async (tx) => {
        await tx.objectStore('outbox').clear();
        const meta = tx.objectStore('meta');
        const state = syncStateOrDefault((await meta.get('sync')) as SyncState | undefined);
        await meta.put({ ...defaultSyncState(), clock: state.clock }, 'sync');
      });
      announce('sync');
    },

    async getSyncState() {
      return syncStateOrDefault((await db.get('meta', 'sync')) as SyncState | undefined);
    },
```

Em `app/src/ui/state/account.svelte.ts`:

1. Troque:

```ts
import { defaultSyncState, type ChangeKind, type ChannelLike, type Repository } from '../../data/repository';
import { createBackup } from '../../data/safety';
import { T } from '../../strings';
import type { SyncApi } from '../../sync/api';
import { loadAuthClient, type AuthClientLike, type AuthUser, type PasskeyInfo, type SendResult, type VerifyResult } from '../../sync/auth';
import { turnstile, type Captcha } from '../../sync/captcha';
import { createSyncEngine, idleStatus, type SyncEngine, type SyncStatus } from '../../sync/engine';
```

por:

```ts
import { defaultSyncState, type ChangeKind, type ChannelLike, type Repository } from '../../data/repository';
import { createBackup } from '../../data/safety';
import { T } from '../../strings';
import type { CloudCopy, SyncApi } from '../../sync/api';
import { loadAuthClient, type AuthClientLike, type AuthUser, type PasskeyInfo, type SendResult, type VerifyResult } from '../../sync/auth';
import { turnstile, type Captcha } from '../../sync/captcha';
import { createSyncEngine, idleStatus, type SyncEngine, type SyncStatus } from '../../sync/engine';
```

2. Troque:

```ts
    return ok === true;
  }

  stop(): void {
    this.triggers?.stop();
    this.engine.stop();
```

por:

```ts
    return ok === true;
  }

  // --- Cópias na nuvem e apagar a conta (spec 7.7 e 8.3) ---

  cloudCopies(): Promise<CloudCopy[]> {
    return this.deps.api.cloudCopies();
  }

  // O servidor restaura (grava antes a cópia "antes de restaurar"); a mudança chega aqui pelo sync normal, com a proteção da spec 6.6.
  async restoreCloudCopy(name: string): Promise<boolean> {
    try {
      await this.deps.api.restoreCloudCopy(name);
    } catch {
      return false;
    }
    void this.syncNow();
    return true;
  }

  // Apagar a conta (spec 7.7): o servidor apaga tudo na hora; aqui, os dados ficam, como ao sair.
  async deleteAccount(email: string): Promise<'ok' | 'mismatch' | 'failed'> {
    if (email.trim().toLowerCase() !== (this.sync.email ?? '').toLowerCase()) return 'mismatch';
    try {
      await this.deps.api.deleteAccount(email.trim());
    } catch {
      return 'failed';
    }
    await this.host.repo().forgetAccount();
    await this.refresh();
    this.passkeys = null;
    this.status = idleStatus();
    return 'ok';
  }

  stop(): void {
    this.triggers?.stop();
    this.engine.stop();
```

Em `app/src/ui/state/app.svelte.ts`:

Troque:

```ts
// Onde a aba Trilha está (spec do sub-projeto 4, seção 8.2): o começo, a aula de uma etapa, um conjunto do treino ou a rodada dele.
// Fica no AppState: a tela da Trilha só existe com a aba aberta, e a pessoa volta ao mesmo lugar.
export type TrailView = { kind: 'home' } | { kind: 'lesson'; step: TrailStep } | { kind: 'set'; set: CaseSet } | { kind: 'round'; set: CaseSet };
export type DialogId = 'sessions' | 'shortcuts' | 'onboarding' | 'export' | 'import' | 'backups' | 'trash' | 'install' | 'signin' | 'signout';
export interface Toast {
  text: string;
  action?: string;
```

por:

```ts
// Onde a aba Trilha está (spec do sub-projeto 4, seção 8.2): o começo, a aula de uma etapa, um conjunto do treino ou a rodada dele.
// Fica no AppState: a tela da Trilha só existe com a aba aberta, e a pessoa volta ao mesmo lugar.
export type TrailView = { kind: 'home' } | { kind: 'lesson'; step: TrailStep } | { kind: 'set'; set: CaseSet } | { kind: 'round'; set: CaseSet };
export type DialogId = 'sessions' | 'shortcuts' | 'onboarding' | 'export' | 'import' | 'backups' | 'trash' | 'install' | 'signin' | 'signout' | 'cloud' | 'deleteAccount';
export interface Toast {
  text: string;
  action?: string;
```

- [ ] **Step 4: Os dois diálogos e a seção**

Crie `app/src/ui/dialogs/CloudCopiesDialog.svelte`:

```svelte
<script lang="ts">
  // As cópias na nuvem (spec 8.3 e 9.1): os últimos 30 dias, com o número de solves de cada um. Restaurar pede um segundo clique: troca a
  // conta inteira, em todos os aparelhos.
  import { T } from '../../strings';
  import type { CloudCopy } from '../../sync/api';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let copies = $state<CloudCopy[]>([]);
  let loaded = $state(false);
  let asking = $state<string | null>(null);
  let busy = $state(false);

  $effect(() => {
    if (!open) return;
    loaded = false;
    asking = null;
    void load();
  });

  async function load(): Promise<void> {
    try {
      copies = (await app.account?.cloudCopies()) ?? [];
    } catch {
      copies = [];
      app.showToast(T.conta.cloudLoadFailed);
    }
    loaded = true;
  }

  function onclose(): void {
    asking = null;
    if (app.dialog === 'cloud') app.dialog = null;
  }

  async function restore(c: CloudCopy): Promise<void> {
    if (busy || !app.account) return;
    if (asking !== c.name) {
      asking = c.name;
      return;
    }
    busy = true;
    try {
      const ok = await app.account.restoreCloudCopy(c.name);
      app.showToast(ok ? T.conta.cloudRestored : T.conta.cloudRestoreFailed);
      if (ok) dialogEl?.close();
    } finally {
      busy = false;
      asking = null;
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.conta.cloudTitle} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.conta.cloudTitle}</h2>
    <p class="muted">{T.conta.cloudIntro}</p>
    {#if loaded && copies.length === 0}
      <p class="muted">{T.conta.cloudEmpty}</p>
    {/if}
    <ul class="sheet-list">
      {#each copies as c (c.name)}
        {@const label = T.conta.cloudDay(c.day, c.kind)}
        <li class="setting">
          <span>{label}<small>{T.backupsDialog.solves(c.solves)}</small></span>
          <button
            type="button"
            class="btn{asking === c.name ? ' danger' : ''}"
            disabled={busy}
            aria-label={asking === c.name ? undefined : T.conta.cloudRestoreAria(label)}
            onclick={() => restore(c)}>{asking === c.name ? T.conta.confirmAgain : T.conta.cloudRestore}</button
          >
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
```

Crie `app/src/ui/dialogs/DeleteAccountDialog.svelte`:

```svelte
<script lang="ts">
  // Apagar minha conta (spec 7.7): a confirmação é digitar o e-mail. O servidor apaga na hora; os dados do aparelho ficam.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let typed = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  const email = $derived(app.account?.sync.email ?? '');

  function onclose(): void {
    typed = '';
    error = null;
    if (app.dialog === 'deleteAccount') app.dialog = null;
  }

  async function confirm(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!app.account || busy) return;
    busy = true;
    try {
      const result = await app.account.deleteAccount(typed);
      if (result === 'ok') {
        app.showToast(T.conta.deleted);
        dialogEl?.close();
      } else error = result === 'mismatch' ? T.conta.deleteMismatch : T.conta.deleteFailed;
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.conta.deleteTitle} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.conta.deleteTitle}</h2>
    <p>{T.conta.deleteText}</p>
    <form onsubmit={confirm}>
      <label class="field">
        <span>{T.conta.deleteConfirmLabel(email)}</span>
        <input type="email" autocomplete="off" bind:value={typed} data-confirm-email />
      </label>
      {#if error}
        <p role="alert">{error}</p>
      {/if}
      <div class="row">
        <button type="submit" class="btn danger" disabled={busy || typed.trim() === ''}>{T.conta.deleteConfirm}</button>
        <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.conta.cancel}</button>
      </div>
    </form>
  {/if}
</dialog>
```

Em `app/src/ui/ajustes/AccountSection.svelte`:

1. Troque:

```svelte
  // lista (screens.css).
  import { onDestroy, onMount } from 'svelte';
  import { T } from '../../strings';
  import SignOutDialog from '../dialogs/SignOutDialog.svelte';
  import { dateLabel } from '../format';
  import type { AppState, DialogId } from '../state/app.svelte';
```

por:

```svelte
  // lista (screens.css).
  import { onDestroy, onMount } from 'svelte';
  import { T } from '../../strings';
  import CloudCopiesDialog from '../dialogs/CloudCopiesDialog.svelte';
  import DeleteAccountDialog from '../dialogs/DeleteAccountDialog.svelte';
  import SignOutDialog from '../dialogs/SignOutDialog.svelte';
  import { dateLabel } from '../format';
  import type { AppState, DialogId } from '../state/app.svelte';
```

2. Troque:

```svelte
  let busy = $state(false);

  // Os diálogos que esta seção abre (o de entrar é da casca: o lembrete do Timer também o abre).
  const ACCOUNT_DIALOGS: readonly DialogId[] = ['signout'];

  onMount(() => {
    const h = setInterval(() => (now = Date.now()), 30_000);
```

por:

```svelte
  let busy = $state(false);

  // Os diálogos que esta seção abre (o de entrar é da casca: o lembrete do Timer também o abre).
  const ACCOUNT_DIALOGS: readonly DialogId[] = ['signout', 'cloud', 'deleteAccount'];

  onMount(() => {
    const h = setInterval(() => (now = Date.now()), 30_000);
```

3. Troque:

```svelte
      {/if}

      <div class="setting">
        {@render caption(T.conta.signOut, T.conta.signOutHint)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'signout')}>{T.conta.signOut}</button>
      </div>
```

por:

```svelte
      {/if}

      <div class="setting">
        {@render caption(T.conta.cloud, T.conta.cloudHint)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'cloud')}>{T.conta.cloudView}</button>
      </div>

      <div class="setting">
        {@render caption(T.conta.signOut, T.conta.signOutHint)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'signout')}>{T.conta.signOut}</button>
      </div>
```

4. Troque:

```svelte
          >{confirmAll ? T.conta.confirmAgain : T.conta.signOutAll}</button
        >
      </div>
    {/if}
  </fieldset>
{/if}

<SignOutDialog {app} open={app.dialog === 'signout'} />
```

por:

```svelte
          >{confirmAll ? T.conta.confirmAgain : T.conta.signOutAll}</button
        >
      </div>
      <div class="setting">
        {@render caption(T.conta.deleteAccount, T.conta.deleteAccountHint)}
        <button type="button" class="btn danger" onclick={() => (app.dialog = 'deleteAccount')}>{T.conta.deleteAccount}</button>
      </div>
    {/if}
  </fieldset>
{/if}

<SignOutDialog {app} open={app.dialog === 'signout'} />
<CloudCopiesDialog {app} open={app.dialog === 'cloud'} />
<DeleteAccountDialog {app} open={app.dialog === 'deleteAccount'} />
```

Em `app/src/strings.ts`:

Troque:

```ts
    // Indicador na barra de cima (spec 9.3) e o convite no lembrete de exportar (spec 9.4)
    indicator: (line: string): string => `Conta e sync: ${line}`,
    protect: 'Proteger na nuvem',
  }),
});
```

por:

```ts
    // Indicador na barra de cima (spec 9.3) e o convite no lembrete de exportar (spec 9.4)
    indicator: (line: string): string => `Conta e sync: ${line}`,
    protect: 'Proteger na nuvem',
    // Cópias na nuvem e apagar a conta (spec 7.7, 8.3 e 9.1)
    cloud: 'Cópias na nuvem',
    cloudHint: 'Uma por dia, por 30 dias. Restaurar troca a conta inteira pelo dia escolhido, em todos os aparelhos.',
    cloudView: 'Ver cópias na nuvem',
    cloudTitle: 'Cópias na nuvem',
    cloudIntro: 'Restaurar grava antes uma cópia de agora, então nada se perde. A restauração chega a todos os aparelhos pelo sync.',
    cloudEmpty: 'Ainda não há cópias na nuvem. A primeira sai no fim do dia.',
    cloudLoadFailed: 'Não consegui ler as cópias na nuvem. Confira a conexão.',
    cloudDay: (day: string, kind: 'daily' | 'pre-restore'): string => (kind === 'daily' ? day : `${day}, antes de uma restauração`),
    cloudRestore: 'Restaurar este dia',
    cloudRestoreAria: (day: string): string => `Restaurar a cópia de ${day}`,
    cloudRestored: 'Restaurado. Os aparelhos recebem pelo sync.',
    cloudRestoreFailed: 'Não consegui restaurar agora. Tudo continua como estava.',
    deleteAccount: 'Apagar minha conta',
    deleteAccountHint: 'Apaga a conta e tudo o que está na nuvem. Os dados deste aparelho ficam.',
    deleteTitle: 'Apagar minha conta',
    deleteText: 'Isto apaga na hora a conta, os dados na nuvem e as cópias diárias. Não tem volta. Os dados deste aparelho ficam, como ao sair.',
    deleteConfirmLabel: (email: string): string => `Para confirmar, digite ${email}`,
    deleteConfirm: 'Apagar para sempre',
    deleteMismatch: 'O e-mail não confere.',
    deleteFailed: 'Não consegui apagar agora. Confira a conexão e tente de novo.',
    deleted: 'Conta apagada. Os dados continuam neste aparelho.',
  }),
});
```

- [ ] **Step 5: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/cloud-account.test.ts tests/unit/account-section.test.ts`
Expected: PASS (2 + 5 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/dialogs/CloudCopiesDialog.svelte src/ui/dialogs/DeleteAccountDialog.svelte src/sync/api.ts src/data/repository.ts src/ui/state/account.svelte.ts src/ui/state/app.svelte.ts src/ui/ajustes/AccountSection.svelte src/strings.ts tests/unit/sync-account.ts tests/unit/cloud-account.test.ts
git commit -m "feat(app): cópias na nuvem e apagar a conta em Ajustes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: A política de privacidade, o ponta a ponta com o Worker local e a conta ligada no beta

Spec: seções 8.4, 9.5, 9.6, 10, 11 (ponta a ponta com o Worker local) e 12 (etapa 8); decisões 18 e 21 do começo deste plano.

**Files:**
- Create: `app/public/privacidade/index.html`
- Modify: `app/vite.config.ts` (o service worker não troca `/privacidade` nem `/api` pelo app)
- Modify: `app/wrangler.jsonc` (`ACCOUNTS_ENABLED: "true"` no beta), `app/tests/unit/wrangler-config.test.ts`
- Create: `app/playwright.sync.config.ts`, `app/tests/e2e-sync/helpers.ts`, `app/tests/e2e-sync/sync.spec.ts`
- Modify: `app/package.json` (`test:e2e:sync`), `app/tsconfig.node.json`, `app/README.md`
- Test: `app/tests/unit/privacy-page.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 7 a 18. O ponta a ponta usa `/api/__e2e/otp` e o token de teste do Turnstile (decisão 18), os rótulos de `T.conta` e `quickSolve`, `fresh`, `noInspection` de `tests/e2e/helpers.ts`.
- Produces (em `tests/e2e-sync/helpers.ts`): `fakeTurnstile(context)`, `device(context)`, `signIn(page, email)`, `syncNow(page)`, `historyCount(page)`.

O `pnpm test:e2e:sync` sobe o `wrangler dev` em `http://localhost:4339` com um estado novo em `.wrangler/e2e`, as tabelas do D1 aplicadas, `E2E_MAILBOX=true`, as chaves de teste do Turnstile e um `BETTER_AUTH_SECRET` sorteado a cada rodada (nenhum segredo de verdade). O `pnpm test:e2e` de sempre continua no `vite preview`, sem Worker.

- [ ] **Step 1: Portão D. PARE: os dados do controlador**

Spec 13: "antes da etapa 8: a razão social, o CNPJ e o e-mail de contato para a política". A página vai ao ar com eles, e a conta só liga no beta com a página no ar.

Mande ao Ranielli: "Para a política de privacidade (`/privacidade`), preciso de três dados da empresa que vai ser a controladora: a razão social, o CNPJ e o e-mail de contato para pedidos sobre dados. Eles ficam públicos na página."

- **Com a resposta:** siga para o Step 2.
- **Sem a resposta:** não comece esta tarefa. Faça a Task 20 e volte aqui quando os dados chegarem.

- [ ] **Step 2: Escreva os testes que falham**

Crie `app/tests/unit/privacy-page.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A política de privacidade (spec 9.5 e 10): uma página estática em public/privacidade. Antes de ir ao ar, os dados do controlador
// (Portão D do plano) substituem os marcadores.
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../public/privacidade/index.html'), 'utf8');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('a página /privacidade', () => {
  it('tem os dados do controlador, sem nenhum marcador sobrando', () => {
    expect(html).not.toContain('{{');
    expect(text).toMatch(/CNPJ \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    expect(html).toMatch(/href="mailto:[^"@\s]+@[^"\s]+"/);
  });

  it('diz o que é guardado, para quê, onde, por quanto tempo, quem recebe e os direitos', () => {
    for (const part of ['O que guardamos', 'Para quê', 'Onde', 'Por quanto tempo', 'Quem recebe', 'Seus direitos']) expect(text).toContain(part);
    for (const fact of ['Estados Unidos', '30 dias', 'Cloudflare', 'Resend', 'Apagar minha conta', 'Exportar']) expect(text).toContain(fact);
  });

  it('é uma página em português, legível no celular', () => {
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('name="viewport"');
  });
});
```

Em `app/tests/unit/wrangler-config.test.ts`:

Troque:

```ts
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];

describe('wrangler.jsonc', () => {
  it('a conta fica desligada na raiz', () => {
    expect(config.env.production.vars.ACCOUNTS_ENABLED).toBe('false');
  });
```

por:

```ts
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];

describe('wrangler.jsonc', () => {
  it('a conta ligada no beta e desligada na raiz até o ok do Ranielli (spec 8.4 e 12)', () => {
    expect(config.vars.ACCOUNTS_ENABLED).toBe('true');
    expect(config.env.production.vars.ACCOUNTS_ENABLED).toBe('false');
  });
```

- [ ] **Step 3: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/privacy-page.test.ts tests/unit/wrangler-config.test.ts`
Expected: FAIL: `privacy-page.test.ts` não abre (`ENOENT: no such file or directory` de `public/privacidade/index.html`), e "a conta ligada no beta e desligada na raiz" falha (`expected 'false' to be 'true'`).

- [ ] **Step 4: A página**

A página não usa o JavaScript do app: é HTML com o CSS dentro, nas cores do app, clara e escura. Crie o arquivo e troque os marcadores pelos dados do Step 1: `{{RAZAO_SOCIAL}}` (uma vez), `{{CNPJ}}` no formato `00.000.000/0000-00` (uma vez) e `{{EMAIL_CONTATO}}` (quatro vezes: dois `href="mailto:…"` e dois textos).

Crie `app/public/privacidade/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <title>Política de privacidade · Klick</title>
    <style>
      /* As cores do app (src/styles/tokens.css), claro e escuro. Página estática: sem o código do app. */
      :root {
        color-scheme: light dark;
        --bg: #f3f0e9;
        --surface: #fbfaf7;
        --line: #e2dcd0;
        --ink: #17171a;
        --muted: #6f6a60;
        --link: #3e63dd;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #121110;
          --surface: #1a1917;
          --line: #2a2724;
          --ink: #f3f1ec;
          --muted: #8e8a82;
          --link: #8aa4f5;
        }
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font: 16px/1.6 'Geist Sans', system-ui, -apple-system, sans-serif;
      }
      main {
        max-width: 680px;
        margin: 0 auto;
        padding: 32px 20px 64px;
      }
      h1 {
        font-size: 28px;
        margin: 0 0 4px;
      }
      h2 {
        font-size: 18px;
        margin: 28px 0 6px;
      }
      p,
      li {
        color: var(--ink);
      }
      .muted {
        color: var(--muted);
      }
      a {
        color: var(--link);
      }
      .card {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 16px 18px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Política de privacidade</h1>
      <p class="muted">Klick, timer de cubo mágico · versão de 15 de outubro de 2026</p>

      <p>
        O Klick funciona inteiro sem conta: seus solves ficam no seu aparelho. Esta política vale para quem cria uma conta para ter sync entre
        aparelhos e cópias na nuvem.
      </p>

      <div class="card">
        <p><strong>Quem cuida dos seus dados</strong> (controlador): {{RAZAO_SOCIAL}}, CNPJ {{CNPJ}}.</p>
        <p>Contato para qualquer pedido sobre seus dados: <a href="mailto:{{EMAIL_CONTATO}}">{{EMAIL_CONTATO}}</a>.</p>
      </div>

      <h2>O que guardamos</h2>
      <ul>
        <li>Seu e-mail, para entrar na conta.</li>
        <li>Seus solves, sessões e o treino de algoritmos.</li>
        <li>Os ajustes da conta: a trilha, as temporadas, o acabamento do Centro, a inspeção e a meta diária.</li>
        <li>Se você criar uma passkey, a chave pública dela (nunca a sua biometria).</li>
      </ul>
      <p>Ajustes do aparelho, como tema e sons, não saem dele.</p>

      <h2>Para quê</h2>
      <p>Para sincronizar seus dados entre os seus aparelhos e guardar uma cópia na nuvem. A base legal é a execução do serviço que você pede ao criar a conta. Não usamos seus dados para publicidade e não os vendemos.</p>

      <h2>Onde</h2>
      <p>Na Cloudflare, com servidores nos Estados Unidos.</p>

      <h2>Por quanto tempo</h2>
      <p>Até você apagar a conta. As cópias diárias ficam 30 dias e depois somem sozinhas.</p>

      <h2>Quem recebe</h2>
      <ul>
        <li>Cloudflare, que hospeda o app, o servidor e o banco de dados.</li>
        <li>Resend, que envia o e-mail com o código para entrar.</li>
      </ul>
      <p>Ninguém mais. Nada da conta é público.</p>

      <h2>Seus direitos</h2>
      <ul>
        <li><strong>Acesso e portabilidade:</strong> em Ajustes, "Exportar" baixa tudo num arquivo.</li>
        <li><strong>Correção:</strong> edite pelo próprio app.</li>
        <li><strong>Exclusão:</strong> em Ajustes, "Apagar minha conta" apaga na hora a conta, os dados na nuvem e as cópias.</li>
        <li><strong>Informação:</strong> esta página.</li>
      </ul>
      <p>Para qualquer outro pedido, escreva para <a href="mailto:{{EMAIL_CONTATO}}">{{EMAIL_CONTATO}}</a>.</p>

      <p class="muted"><a href="/">Voltar ao Klick</a></p>
    </main>
  </body>
</html>
```

Em `app/vite.config.ts`:

Troque:

```ts
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // Parâmetros que não mudam o arquivo: a nova tentativa de carregar o cubing.js (cubing.js?r=N) acha o pré-cache offline.
        ignoreURLParametersMatching: [/^r$/, /^utm_/, /^fbclid$/],
      },
```

por:

```ts
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // A política de privacidade é uma página própria, e /api é do Worker: o service worker não troca nenhuma das duas pelo app.
        navigateFallbackDenylist: [/^\/privacidade/, /^\/api\//],
        // Parâmetros que não mudam o arquivo: a nova tentativa de carregar o cubing.js (cubing.js?r=N) acha o pré-cache offline.
        ignoreURLParametersMatching: [/^r$/, /^utm_/, /^fbclid$/],
      },
```

- [ ] **Step 5: A conta ligada no beta**

Em `app/wrangler.jsonc`:

Troque:

```jsonc
    { "name": "OTP_BURST", "namespace_id": "1102", "simple": { "limit": 5, "period": 60 } }
  ],
  "vars": {
    "ACCOUNTS_ENABLED": "false",
    "APP_ORIGIN": "https://beta.klick.ranimontagna.com",
    "TURNSTILE_SITE_KEY": "1x00000000000000000000BB",
    "MAIL_FROM": "Klick <nao-responda@klick.ranimontagna.com>"
```

por:

```jsonc
    { "name": "OTP_BURST", "namespace_id": "1102", "simple": { "limit": 5, "period": 60 } }
  ],
  "vars": {
    "ACCOUNTS_ENABLED": "true",
    "APP_ORIGIN": "https://beta.klick.ranimontagna.com",
    "TURNSTILE_SITE_KEY": "1x00000000000000000000BB",
    "MAIL_FROM": "Klick <nao-responda@klick.ranimontagna.com>"
```

- [ ] **Step 6: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/privacy-page.test.ts tests/unit/wrangler-config.test.ts`
Expected: PASS (3 + 5 testes). Se "tem os dados do controlador" falhar, sobrou um marcador ou o CNPJ não está no formato.

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

- [ ] **Step 7: O ponta a ponta da conta, com o Worker local**

Os três testes da spec 11 e a acessibilidade da página e do diálogo de entrar. Cada "aparelho" é um contexto novo do navegador (outro IndexedDB, outro cookie).

Crie `app/playwright.sync.config.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Os ponta a ponta da conta e do sync (spec 11), com o Worker local (wrangler dev): o app, o Durable Object, o D1 e o R2 do Miniflare,
// num estado novo a cada rodada (.wrangler/e2e). O código do e-mail fica na caixa local (E2E_MAILBOX) e o Turnstile aceita o token de teste:
// nada sai da máquina. Em localhost (não 127.0.0.1), para o navegador guardar o cookie de sessão.
const PORT = 4339;
const ORIGIN = `http://localhost:${PORT}`;
const vars = [
  'ACCOUNTS_ENABLED:true',
  'E2E_MAILBOX:true',
  `APP_ORIGIN:${ORIGIN}`,
  'TURNSTILE_SITE_KEY:1x00000000000000000000BB',
  'TURNSTILE_SECRET:1x0000000000000000000000000000000AA',
  `BETTER_AUTH_SECRET:${randomBytes(24).toString('hex')}`, // um segredo novo por rodada, só deste processo
].map((v) => `--var ${v}`);

export default defineConfig({
  testDir: 'tests/e2e-sync',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  webServer: {
    command: [
      'pnpm build',
      'rm -rf .wrangler/e2e',
      'npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e',
      `npx wrangler dev --port ${PORT} --ip localhost --persist-to .wrangler/e2e ${vars.join(' ')}`,
    ].join(' && '),
    url: `${ORIGIN}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
```

Crie `app/tests/e2e-sync/helpers.ts`:

```ts
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { fresh, noInspection } from '../e2e/helpers';

// O Turnstile falso: o script da Cloudflare não sai da máquina; o widget devolve o token de teste que o Worker local aceita.
export async function fakeTurnstile(context: BrowserContext): Promise<void> {
  await context.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "window.turnstile = { render(el, o) { this.o = o; return 'w'; }, execute() { setTimeout(() => this.o.callback('XXXX.DUMMY.TOKEN.XXXX'), 0); }, remove() {} };",
    }),
  );
}

// Um "aparelho": um contexto novo do navegador (outro IndexedDB, outro cookie), já sem o tour e sem inspeção.
export async function device(context: BrowserContext): Promise<Page> {
  await fakeTurnstile(context);
  const page = await context.newPage();
  await fresh(page);
  await noInspection(page);
  return page;
}

// Entra pela tela de Ajustes, com o código lido da caixa local do Worker. Pula a passkey se ela for oferecida.
export async function signIn(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Entrar ou criar conta' }).click();
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('textbox', { name: 'Código' })).toBeVisible();
  const { code } = (await (await page.request.get(`/api/__e2e/otp?email=${encodeURIComponent(email)}`)).json()) as { code: string };
  await page.getByRole('textbox', { name: 'Código' }).fill(code);
  await page.getByRole('button', { name: 'Entrar' }).click();
  const skip = page.getByRole('button', { name: 'Agora não' });
  const done = page.getByText('Pronto. Seus solves estão na conta.');
  await expect(skip.or(done)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(done.or(page.getByText(/Bem-vindo de volta/))).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Fechar' }).click();
}

export async function syncNow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.locator('[data-sync-line]')).toHaveText(/Sincronizado/, { timeout: 30_000 });
}

export async function historyCount(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'Evolução' }).click();
  return page.locator('.hist tbody tr').count();
}
```

Crie `app/tests/e2e-sync/sync.spec.ts`:

```ts
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { quickSolve } from '../e2e/helpers';
import { device, historyCount, signIn, syncNow } from './helpers';

const email = (name: string) => `${name}-${Date.now()}@exemplo.com`;

test('dois navegadores na mesma conta: um resolve e o outro vê (spec 11)', async ({ browser }) => {
  const who = email('dois');
  const phone = await device(await browser.newContext());
  const desktop = await device(await browser.newContext());
  await signIn(phone, who);
  await signIn(desktop, who);
  await phone.getByRole('button', { name: 'Timer', exact: true }).click();
  await quickSolve(phone);
  await syncNow(phone);
  await syncNow(desktop);
  await expect.poll(() => historyCount(desktop)).toBe(1);
});

test('um apaga offline enquanto o outro edita: a exclusão vence (D5)', async ({ browser }) => {
  const who = email('d5');
  const aContext = await browser.newContext();
  const a = await device(aContext);
  const b = await device(await browser.newContext());
  await signIn(a, who);
  await signIn(b, who);
  // B faz o solve; os dois o têm, na mesma "Sessão 1" (o id padrão).
  await b.getByRole('button', { name: 'Timer', exact: true }).click();
  await quickSolve(b);
  await syncNow(b);
  await syncNow(a);
  await expect.poll(() => historyCount(a)).toBe(1);
  // A, sem rede, apaga a sessão (o solve sai junto).
  await aContext.setOffline(true);
  await a.locator('[data-session-pill]').click();
  await a.getByRole('button', { name: 'Excluir Sessão 1' }).click();
  await a.keyboard.press('Escape');
  // Depois, B escreve uma nota no mesmo solve (o resultado dele ainda está na tela) e sincroniza.
  await b.getByRole('button', { name: 'Timer', exact: true }).click();
  await b.locator('[data-act="note"]').click();
  await b.getByRole('textbox', { name: 'Nota sobre este solve' }).fill('editada no outro aparelho');
  await b.getByRole('button', { name: 'Salvar' }).click();
  await syncNow(b);
  await aContext.setOffline(false);
  await syncNow(a);
  await syncNow(b);
  await expect.poll(() => historyCount(b)).toBe(0);
  await expect.poll(() => historyCount(a)).toBe(0);
});

test('o primeiro login com dados junta sem duplicar: o mesmo csTimer importado nos dois (spec 6.5)', async ({ browser }) => {
  const who = email('csv');
  const file = fileURLToPath(new URL('../fixtures/cstimer-export.txt', import.meta.url));
  const importIn = async (page: Awaited<ReturnType<typeof device>>) => {
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('group', { name: 'Seus dados' }).getByLabel('Importar arquivo').setInputFiles(file);
    await page.getByLabel('Evento de ZBLL').selectOption('333');
    await page.getByRole('button', { name: 'Importar solves' }).click();
    await expect(page.getByText(/5 solves importados/)).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();
  };
  const a = await device(await browser.newContext());
  const b = await device(await browser.newContext());
  await importIn(a);
  await importIn(b);
  await signIn(a, who);
  await signIn(b, who);
  await syncNow(a);
  await expect.poll(() => historyCount(a)).toBe(5);
  await expect.poll(() => historyCount(b)).toBe(5);
});

test('a política de privacidade e o diálogo de entrar, sem violações sérias de acessibilidade', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await device(context);
  await page.goto('/privacidade');
  await expect(page.getByRole('heading', { name: 'Política de privacidade' })).toBeVisible();
  const serious = async (where: string) => {
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`)).toEqual([]);
  };
  await serious('privacidade');
  await page.goto('/');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Entrar ou criar conta' }).click();
  await serious('entrar');
  await page.keyboard.press('Tab'); // pelo teclado: o foco anda dentro da folha
  await expect(page.locator('dialog.signin :focus')).toHaveCount(1);
});
```

Em `app/package.json`, troque:

```json
    "test:worker": "vitest run -c vitest.worker.config.ts"
  },
```

por:

```json
    "test:worker": "vitest run -c vitest.worker.config.ts",
    "test:e2e:sync": "playwright test -c playwright.sync.config.ts"
  },
```

Em `app/tsconfig.node.json`:

Troque:

```json
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "vitest.worker.config.ts", "playwright.config.ts"]
}
```

por:

```json
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "vitest.worker.config.ts", "playwright.config.ts", "playwright.sync.config.ts"]
}
```

- [ ] **Step 8: Rode os ponta a ponta**

Run: `pnpm test:e2e:sync`
Expected: PASS (4 testes; a primeira rodada leva uns 2 min com o build). Estes testes não rodaram no ensaio deste plano: se um falhar por um rótulo ou um tempo, confira no trace (`pnpm exec playwright show-trace test-results/…/trace.zip`) e ajuste o teste, nunca a regra. A conferência que importa: no D5, o solve some nos dois; no primeiro login, o histórico tem 2 linhas nos dois aparelhos.

Run: `pnpm test:e2e`
Expected: PASS (o de sempre, sem Worker).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 9: O README**

Em `app/README.md`:

1. Troque:

````md
```bash
pnpm test        # unitários (Vitest)
pnpm test:e2e    # ponta a ponta (Playwright; rode `pnpm exec playwright install chromium` uma vez)
pnpm check       # svelte-check e tsc
```
````

por:

````md
```bash
pnpm test           # unitários (Vitest)
pnpm test:worker    # o servidor: Worker, Durable Object, D1 e R2 dentro do workerd (@cloudflare/vitest-plugin)
pnpm test:e2e       # ponta a ponta (Playwright; rode `pnpm exec playwright install chromium` uma vez)
pnpm test:e2e:sync  # a conta e o sync ponta a ponta, com o Worker local (wrangler dev); nada sai da máquina
pnpm check          # svelte-check e tsc (app, Worker e testes do Worker)
```
````

2. Troque:

```md
A configuração está em `wrangler.jsonc` (Cloudflare Workers com arquivos estáticos). A raiz e o beta são domínios próprios dos
Workers `klick-app` e `klick-app-beta`: o Cloudflare cria e mantém o registro DNS de cada um. A v1 não está mais no ar (o projeto
da Vercel foi apagado em 12/10); o código dela continua na `main` (tag `v1.4.0`).
```

por:

```md
A configuração está em `wrangler.jsonc`: um Worker com os arquivos do app e o servidor da conta e do sync (`worker/`), que só roda
em `/api/*`. A raiz e o beta são domínios próprios dos Workers `klick-app` e `klick-app-beta`: o Cloudflare cria e mantém o registro
DNS de cada um. A v1 não está mais no ar (o projeto da Vercel foi apagado em 12/10); o código dela continua na `main` (tag `v1.4.0`).

### A conta e o sync

- **Liga e desliga:** `ACCOUNTS_ENABLED` em `wrangler.jsonc`. Ligada no beta; desligada na raiz até o ok do Ranielli. Desligada, o
  `/api` (menos `/api/health`) responde 404 e o app não mostra nada de conta.
- **Cada ambiente tem os próprios dados:** D1 (`klick-auth-beta` e `klick-auth`, o login), Durable Objects (uma conta por objeto) e
  R2 (`klick-snapshots-beta` e `klick-snapshots`, as cópias diárias, apagadas depois de 30 dias por uma regra do bucket).
- **Segredos:** o repositório é público. `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET` e `RESEND_API_KEY` entram só por
  `npx wrangler secret put NOME` (e `--env production`), nunca num arquivo.
- **Tabelas do login:** uma migração nova em `worker/migrations/` vai para cada banco com
  `npx wrangler d1 migrations apply DB --remote` (e `--env production`) antes do deploy.
- **Política de privacidade:** `public/privacidade/index.html`, servida em `/privacidade`.
```

- [ ] **Step 10: Commit**

```bash
git add public/privacidade/index.html vite.config.ts wrangler.jsonc tests/unit/privacy-page.test.ts tests/unit/wrangler-config.test.ts playwright.sync.config.ts tests/e2e-sync/helpers.ts tests/e2e-sync/sync.spec.ts package.json tsconfig.node.json README.md
git commit -m "feat(app): a política de privacidade, o ponta a ponta da conta e a conta ligada no beta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 11: O beta com a conta ligada (com os Portões B e C feitos)**

Sem os Portões B e C, pare aqui: a conta não tem como funcionar no beta sem o Durable Object, o R2, o e-mail e o Turnstile de verdade. Os buckets da Task 17 (Step 8) precisam existir.

Run: `npx wrangler d1 migrations apply DB --remote`
Expected: "No migrations to apply" (o Portão C já aplicou) ou as que faltarem.

Run: `pnpm build && npx wrangler deploy`
Expected: o deploy de `klick-app-beta` termina. Confira:
- `curl -s https://beta.klick.ranimontagna.com/api/health` responde `{"ok":true,"accounts":true,"turnstileSiteKey":"<a site key do Portão C>"}`;
- `https://beta.klick.ranimontagna.com/privacidade` abre a política com os dados do controlador, também depois de o app ter instalado o service worker (recarregue a página);
- no navegador do computador, Ajustes > "Entrar ou criar conta" com um e-mail seu de teste: o código chega pelo Resend, entra, e o indicador mostra "Sincronizado";
- `npx wrangler tail klick-app-beta` durante um sync mostra só ids, contagens e durações (spec 8.5), nunca o e-mail ou o código.

A raiz não muda: `ACCOUNTS_ENABLED` continua `"false"` em `env.production`, e nenhum deploy da raiz sai daqui sem o ok do Ranielli.

---

### Task 20: A checagem do Supabase da v1 e a spec em dia

Spec: seções 3 (D10), 12 (etapa 9) e 13 ("na etapa 9: o acesso ao Supabase da v1, na hora"). A Step 6 registra na spec as decisões do começo deste plano.

**Files:**
- Create: `app/scripts/v1-supabase-map.mjs` (a conversão, separada para os testes), `app/scripts/v1-supabase.mjs` (o script que o Ranielli roda)
- Test: `app/tests/unit/v1-supabase.test.ts`
- Modify: `docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md`

**Interfaces:**
- Consumes: `parseKlickJson` (`data/transfer.ts`, no teste); as tabelas `sessions` e `solves` da v1 (`main`, `supabase/`), pela API REST do Supabase.
- Produces (em `scripts/v1-supabase-map.mjs`): `missingFromV1(sessions: V1SessionRow[], solves: V1SolveRow[], existing: { sessions: { id }[]; solves: { id; event; at; ms; penalty; scramble }[] }, now: number)`: um arquivo do Klick só com o que falta, pelo id ou pela marca do solve (evento, instante, tempo, penalidade e embaralhamento), com os ids da v1.
- Produces (em `scripts/v1-supabase.mjs`): `SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node scripts/v1-supabase.mjs --email … --compare <export.json> --out <saida.json>`. Imprime só contagens.

O script não tem tela no app (D10): a saída entra por Ajustes > Importar arquivo, e o sync a leva para a conta. Quem roda é o Ranielli, no terminal dele: a chave do Supabase não passa pelo repositório nem pela conversa.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/v1-supabase.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseKlickJson } from '../../src/data/transfer';
import { missingFromV1 } from '../../scripts/v1-supabase-map.mjs';

const session = { id: 'sess-1', name: 'Principal', puzzle_type: '3x3', created_at: '2026-03-01T10:00:00Z', updated_at: '2026-03-01T10:00:00Z' };
const solve = (id: string, minute: number, o: Partial<{ time_ms: number; penalty: 'NONE' | '+2' | 'DNF' }> = {}) => ({
  id, session_id: 'sess-1', time_ms: o.time_ms ?? 12_345, penalty: o.penalty ?? 'NONE', scramble: "R U R'",
  created_at: `2026-03-01T10:${String(minute).padStart(2, '0')}:00Z`, updated_at: `2026-03-01T10:${String(minute).padStart(2, '0')}:00Z`,
});

describe('o script do Supabase da v1 (spec D10)', () => {
  it('converte para o arquivo do Klick com os ids da v1, e o arquivo passa no import do app', () => {
    const file = missingFromV1([session], [solve('v1-a', 1, { penalty: '+2' })], { sessions: [], solves: [] }, 1);
    const parsed = parseKlickJson(JSON.stringify(file));
    expect(parsed.sessions).toMatchObject([{ id: 'sess-1', name: 'Principal', event: '333' }]);
    expect(parsed.solves).toMatchObject([{ id: 'v1-a', sessionId: 'sess-1', event: '333', ms: 12_345, penalty: '+2', at: Date.parse('2026-03-01T10:01:00Z') }]);
  });

  it('o que já está no Klick, pelo id ou pela marca do solve, fica de fora; a sessão que já existe não vem de novo', () => {
    const existing = {
      sessions: [{ id: 'sess-1' }],
      solves: [
        { id: 'v1-a', event: '333', at: 0, ms: 1, penalty: null, scramble: '' },
        { id: 'cs-outro', event: '333', at: Date.parse('2026-03-01T10:02:00Z'), ms: 12_345, penalty: null, scramble: "R U R'" },
      ],
    };
    const file = missingFromV1([session], [solve('v1-a', 1), solve('v1-b', 2), solve('v1-c', 3)], existing, 1);
    expect(file.solves.map((s) => s.id)).toEqual(['v1-c']);
    expect(file.sessions).toEqual([]);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/v1-supabase.test.ts`
Expected: FAIL: `Failed to resolve import "../../scripts/v1-supabase-map.mjs"`.

- [ ] **Step 3: A conversão**

Crie `app/scripts/v1-supabase-map.mjs`:

```js
// A conversão dos dados da v1 no Supabase para o arquivo do Klick (spec D10), separada do script para os testes. Mantém os ids da v1 (os
// mesmos que a migração do localStorage usou) e devolve só o que falta no arquivo de comparação: o que já está lá, pelo id ou pela marca do
// solve (evento, instante, tempo, penalidade e embaralhamento), fica de fora.

/** @typedef {{ id: string, name: string, puzzle_type: string, created_at: string, updated_at: string }} V1SessionRow */
/** @typedef {{ id: string, session_id: string, time_ms: number, penalty: 'NONE' | '+2' | 'DNF', scramble: string, created_at: string, updated_at: string }} V1SolveRow */
/** @typedef {{ sessions: { id: string }[], solves: { id: string, event: string, at: number, ms: number, penalty: string | null, scramble: string }[] }} Existing */

/** @type {Record<string, string>} */
const EVENTS = { '3x3': '333', '2x2': '222', '4x4': '444', '5x5': '555', pyraminx: 'pyram', megaminx: 'minx', skewb: 'skewb', square1: 'sq1' };

/** @param {{ event: string, at: number, ms: number, penalty: string | null, scramble: string }} s */
const mark = (s) => JSON.stringify([s.event, s.at, s.ms, s.penalty, s.scramble]);

/**
 * @param {V1SessionRow[]} sessions
 * @param {V1SolveRow[]} solves
 * @param {Existing} existing
 * @param {number} now
 */
export function missingFromV1(sessions, solves, existing, now) {
  const knownSolves = new Set(existing.solves.map((s) => s.id));
  const knownMarks = new Set(existing.solves.map(mark));
  const knownSessions = new Set(existing.sessions.map((s) => s.id));
  const byId = new Map(sessions.map((s) => [s.id, s]));
  /** @type {Map<string, { id: string }>} */
  const outSessions = new Map();
  /** @type {{ id: string }[]} */
  const outSolves = [];
  let order = 1000;
  for (const row of solves) {
    const session = byId.get(row.session_id);
    const event = session ? EVENTS[session.puzzle_type] : undefined;
    if (!session || !event) continue;
    const at = Date.parse(row.created_at);
    const solve = {
      id: row.id,
      sessionId: session.id,
      event,
      ms: row.time_ms,
      penalty: row.penalty === 'NONE' ? null : row.penalty,
      at,
      scramble: row.scramble,
      note: '',
      createdAt: at,
      updatedAt: Date.parse(row.updated_at),
      deletedAt: null,
    };
    if (knownSolves.has(solve.id) || knownMarks.has(mark(solve))) continue;
    outSolves.push(solve);
    if (!knownSessions.has(session.id) && !outSessions.has(session.id)) {
      const createdAt = Date.parse(session.created_at);
      const created = { id: session.id, name: session.name, event, order: order++, createdAt, updatedAt: Date.parse(session.updated_at), deletedAt: null };
      outSessions.set(session.id, created);
    }
  }
  return { format: 'klick', version: 1, exportedAt: now, sessions: [...outSessions.values()], solves: outSolves, profile: null };
}
```

- [ ] **Step 4: O script**

Crie `app/scripts/v1-supabase.mjs`:

```js
// Script único (spec D10 e etapa 9): busca no Supabase da v1 os solves de uma conta e grava num arquivo do Klick só os que faltam no export
// de comparação. Quem roda é o Ranielli, no terminal dele: a service key nunca vai para o repositório nem para a conversa.
//
//   SUPABASE_URL=https://<projeto>.supabase.co SUPABASE_SERVICE_KEY=<chave> \
//     node scripts/v1-supabase.mjs --email <e-mail da v1> --compare ~/Downloads/klick-export.json --out ~/Downloads/klick-v1-faltando.json
//
// Imprime só contagens. O arquivo de saída entra no app por Ajustes > Importar arquivo, e o sync leva para a conta.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { missingFromV1 } from './v1-supabase-map.mjs';

const { values } = parseArgs({ options: { email: { type: 'string' }, compare: { type: 'string' }, out: { type: 'string' } } });
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key || !values.email || !values.compare || !values.out) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/v1-supabase.mjs --email ... --compare export.json --out saida.json');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function get(path, range) {
  const res = await fetch(`${url}${path}`, { headers: range ? { ...headers, Range: range } : headers });
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status}`);
  return res.json();
}

// Todas as linhas de uma tabela da conta, de mil em mil.
async function all(table, userId) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await get(`/rest/v1/${table}?user_id=eq.${userId}&select=*&order=created_at`, `${from}-${from + 999}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const users = await get('/auth/v1/admin/users?per_page=1000');
const user = (users.users ?? []).find((u) => u.email?.toLowerCase() === values.email.toLowerCase());
if (!user) {
  console.log('Nenhuma conta da v1 com esse e-mail.');
  process.exit(0);
}
const [sessions, solves] = await Promise.all([all('sessions', user.id), all('solves', user.id)]);
const existing = JSON.parse(readFileSync(values.compare, 'utf8'));
const file = missingFromV1(sessions, solves, existing, Date.now());
console.log(`Na v1: ${sessions.length} sessões e ${solves.length} solves. Faltam no Klick: ${file.solves.length} solves em ${file.sessions.length} sessões novas.`);
if (file.solves.length > 0) {
  writeFileSync(values.out, JSON.stringify(file, null, 2));
  console.log(`Arquivo gravado em ${values.out}. Importe em Ajustes > Importar arquivo.`);
}
```

- [ ] **Step 5: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/v1-supabase.test.ts`
Expected: PASS (2 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test -- --maxWorkers=4`
Expected: PASS.

- [ ] **Step 6: A spec em dia**

Em `docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md` (fora de `app/`):

1. Troque:

```md
- **Servidor** (`@cloudflare/vitest-pool-workers`):
```

por:

```md
- **Servidor** (`@cloudflare/vitest-plugin`, o sucessor do `@cloudflare/vitest-pool-workers`, que não aceita o Vitest 5):
```

2. Troque:

```md
  - **Beta:** `true` assim que o login funcionar.
```

por:

```md
  - **Beta:** `true` na etapa 8, junto com a política de privacidade (até lá, as etapas 4 a 7 são testadas na máquina).
```

3. No fim do arquivo, depois da tabela da seção 15, acrescente:

```md
## 16. Decisões do plano de implementação

O plano `docs/superpowers/plans/2026-10-15-klick-conta-sync.md` ajustou esta spec onde ela não fechava com as bibliotecas ou com a simulação. Valem por cima do texto acima:

1. Os testes do servidor usam o `@cloudflare/vitest-plugin` 1.4.0, num config próprio (`pnpm test:worker`).
2. Os limites por hora (5 códigos por e-mail, 20 pedidos por IP) contam numa tabela `otp_requests` do D1, com o e-mail em hash; o binding de rate limiting, que só conta janelas de 10 ou 60 segundos, é a trava de rajada.
3. O estado do sync fica na chave `'sync'` da store `meta`, com `email`, `signedIn`, `firstSync` e `passkey` além dos campos da seção 5.4.
4. A migração grava só os ajustes da conta fora do padrão; uma chave ausente lê o padrão.
5. A cascata vale nos dois sentidos (um solve ativo mais novo devolve a sessão), e o que ela muda no aparelho sobe.
6. O servidor dá revisão nova também ao registro cujo resultado difere do que chegou.
7. O pedido de sync leva `v: 1` (426 para outra versão), e a resposta tem `rejected` com o motivo.
8. A tabela `records` tem a coluna `parent` (a sessão de cada solve); `state` guarda também `userId` e `snapshotRev`.
9. Restaurar uma cópia no aparelho manda para a lixeira o que não estava nela.
10. Apagar e restaurar mexem em `updatedAt` e em `deletionStamp`; o import grava o `deletionStamp` pela regra do mais recente.
11. O repositório não devolve as datas do sync às telas, ao export nem às cópias.
12. Apagar os dados do aparelho espera a fila vazia, e leva também as cópias locais.
13. As sessões do csTimer também têm id derivado; a sessão padrão usa `default-<evento>` só com o id livre.
14. O sync espera também o timer do treino.
15. O Turnstile é conferido por um guarda próprio, com o token no cabeçalho `x-turnstile-token`.
16. O Durable Object usa `migrations` com `new_sqlite_classes`.
17. O SQL do Better Auth para o D1 é escrito à mão e conferido por teste com o `getMigrations` da biblioteca.
18. `E2E_MAILBOX` liga, só em localhost, a caixa de e-mail e o token de teste do Turnstile do ponta a ponta.
19. O dia das cópias é o de Brasília; a cópia sai às 00:05 de Brasília.
20. "Sincronizar agora" no meio de uma rodada pede uma rodada a mais depois dela.
21. `ACCOUNTS_ENABLED=true` no beta só na etapa 8 (seção 8.4).
22. A passkey usa o hostname do próprio ambiente como `rpID`.
23. O código fica em hash no D1, e o limitador do Better Auth fica desligado (os limites são os do item 2).
24. `KlickExport` e `ProfilePatch` moram em `core/types.ts`.
25. A cópia "antes da v3" é JSON puro, gravada dentro da transação da migração.
26. `TURNSTILE_SECRET` e `RESEND_API_KEY` entram pelo terminal do Ranielli; `BETTER_AUTH_SECRET` é gerado direto para o `wrangler secret put`.
```

- [ ] **Step 7: Commit**

```bash
git add scripts/v1-supabase-map.mjs scripts/v1-supabase.mjs tests/unit/v1-supabase.test.ts ../docs/superpowers/specs/2026-10-15-klick-conta-sync-design.md
git commit -m "feat(app): o script do Supabase da v1, e a spec com as decisões do plano

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Portão E. PARE: o Supabase da v1, com o Ranielli**

Mande: "A última etapa é ver se o Supabase da v1 tem solves seus que faltam no Klick. A chave não passa por mim: (1) no aparelho com mais solves, exporte o arquivo do Klick (Ajustes > Exportar); (2) no painel do Supabase da v1, pegue a URL do projeto e a service role key; (3) no terminal, dentro de `app/`, rode `read -rs SUPABASE_SERVICE_KEY && export SUPABASE_SERVICE_KEY` e cole a chave (ela não aparece na tela nem fica no histórico); (4) rode `SUPABASE_URL=<url> node scripts/v1-supabase.mjs --email <seu e-mail da v1> --compare <o export> --out ~/Downloads/klick-v1-faltando.json` e me mande só o que ele imprimir (são contagens); (5) feche o terminal ou rode `unset SUPABASE_SERVICE_KEY`."

- **Se faltar algo:** peça para importar `klick-v1-faltando.json` em Ajustes > Importar arquivo, no aparelho com a conta; o sync leva para os outros. Confira com ele que o número de solves do histórico subiu o que o script disse.
- **Se não faltar nada, ou se o projeto da v1 não existir mais:** nada a fazer; registre a resposta na nota da entrega.
- **Sem resposta:** o plano termina sem a etapa 9; o script fica no repositório para quando ele quiser.

---

## Depois do plano (o controlador faz, com o ok do Ranielli)

1. **No aparelho, com o Ranielli, no beta (spec 11):** entrar no iPhone pelo Safari e pelo app instalado; criar e usar a passkey; modo avião no meio de uma sessão (o indicador vai a "esperando rede" e volta sozinho); uma semana com a conta real nos dois aparelhos. Os problemas que aparecerem viram tarefas novas, com teste.
2. **Antes de ligar a conta na raiz (spec 10 e 12):** conferir se o contrato de tratamento de dados da Cloudflare cobre as cláusulas-padrão da ANPD. É leitura de contrato, e a decisão é do Ranielli.
3. **A raiz.** Com a semana de teste, a conferência do contrato e o ok explícito: trocar `"ACCOUNTS_ENABLED": "false"` por `"true"` em `env.production` (e o teste "a conta ligada no beta e desligada na raiz" para esperar `true` nos dois), `npx wrangler d1 migrations apply DB --remote --env production`, `pnpm build && npx wrangler deploy --env production`.
4. **Push.** `git push` da branch `v2` só com o ok explícito.

---

## Cobertura da spec

| Seção da spec | Tarefas |
|---|---|
| 5.1 Stores (datas de exclusão, `deletionStamp`, `prefs`, `outbox`) | 4, 5, 6 |
| 5.2 Ajustes da conta e do aparelho | 2, 4 |
| 5.3 Fila de saída | 5, 11 |
| 5.4 Relógio e estado do sync | 4, 5, 11 |
| 5.5 Correções da pesquisa (purge, csTimer, sessão padrão, import, restaurar) | 5, 6 |
| 5.6 Migração, com a cópia "antes da v3" | 4, Portão A |
| 6.1 Envelope e rota | 1, 3, 8, 12 |
| 6.2 Quando sincroniza (gatilhos, aba única, nunca durante um solve) | 12, 13 |
| 6.3 Regras de conflito | 1, 3 |
| 6.4 Temporadas | 1, 3, 11 |
| 6.5 Primeiro login num aparelho com dados | 11, 12, 15 |
| 6.6 Proteção e falhas (validação, novas tentativas, cópia antes de 50 exclusões, log local) | 2, 8, 12 |
| 7.1 Biblioteca (Better Auth no D1) | 9 |
| 7.2 Fluxo (código, passkey, primeiro sync) | 9, 14, 15 |
| 7.3 Sessão (90 dias, cookie) | 9 |
| 7.4 E-mail (Resend, texto, SPF, DKIM e DMARC) | 9, 10, Portão C |
| 7.5 Abuso (Turnstile, limites) | 10 |
| 7.6 Outra conta no mesmo aparelho | 11, 14, 15 |
| 7.7 Sair, sair de todos e apagar a conta | 14, 17, 18 |
| 8.1 Worker | 7, 8, 9, 17 |
| 8.2 Durable Object da conta | 8 |
| 8.3 Cópias diárias e restauração | 17, 18 |
| 8.4 Ambientes, segredos e `ACCOUNTS_ENABLED` | 7, 19, Portão C |
| 8.5 Logs e custo | 8, Portão B |
| 9.1 Ajustes: "Conta e sync" | 14, 18 |
| 9.2 Diálogo de entrar | 15 |
| 9.3 Indicador | 16 |
| 9.4 Convite | 16 |
| 9.5 Página de privacidade | 19, Portão D |
| 9.6 Acessibilidade | 13, 15, 19 |
| 10. Privacidade e LGPD | 17 (apagar), 19, Depois do plano (contrato da Cloudflare) |
| 11. Testes | 1 e 3 (regras e simulação), 4 (migração), 5, 6 e 11 (repositório), 7 a 10 e 17 (servidor), 19 (ponta a ponta), Depois do plano (no aparelho) |
| 12. Entrega | a tabela "Etapas e portões" |
| 13. O que depende do Ranielli | Portões B a E |
