# Klick — app

Timer de cubo mágico com inspeção WCA, penalidades, embaralhamentos oficiais dos 13 eventos e dados que ficam no aparelho (IndexedDB) com cópias automáticas, lixeira e exportação para o formato do Klick e do csTimer. É um PWA: instala no celular e funciona sem internet depois da primeira visita.

Feito com Svelte 5, Vite e TypeScript. Usa pnpm.

## Rodar

```bash
pnpm install
pnpm dev
```

## Testar

```bash
pnpm test           # unitários (Vitest)
pnpm test:worker    # o servidor: Worker, Durable Object, D1 e R2 dentro do workerd (@cloudflare/vitest-plugin)
pnpm test:e2e       # ponta a ponta (Playwright; rode `pnpm exec playwright install chromium` uma vez)
pnpm test:e2e:sync  # a conta e o sync ponta a ponta, com o Worker local (wrangler dev); nada sai da máquina
pnpm check          # svelte-check e tsc (app, Worker e testes do Worker)
```

O `test:e2e:sync` faz o build, sobe o `wrangler dev` em `http://localhost:4339` com um estado novo em `.wrangler/e2e` (apagado no
começo de cada rodada), as tabelas do D1 aplicadas, a caixa local do código (`E2E_MAILBOX`), as chaves de teste do Turnstile e um
`BETTER_AUTH_SECRET` sorteado a cada rodada. Cada "aparelho" é um contexto novo do navegador.

- **Os limites são os de verdade:** 5 pedidos de código por minuto e 20 por hora do mesmo IP, e todos os aparelhos do teste saem do
  mesmo IP. Cada teste usa e-mails próprios, e o helper espera a janela de um minuto antes de passar de 5 pedidos.
- **Rodada interrompida:** se o `wrangler dev` ficar preso na porta 4339, encerre-o (`lsof -ti tcp:4339 | xargs kill`) e apague o
  estado com `rm -rf .wrangler/e2e`; a rodada seguinte começa do zero.
- **O Turnstile de verdade fica de fora:** o teste troca o script da Cloudflare por um falso que devolve o token de teste. O widget
  real (o script de `challenges.cloudflare.com`, o `remove()` dentro do callback e o `error-callback` de uma falha passageira) só se
  confere no beta, com a site key de verdade.

O caminho do `timeStamp` do evento (a hora do toque ou da tecla pelo navegador) é coberto só pelos testes unitários: o e2e usa o relógio de reserva, porque o relógio falso do Playwright recusa o `timeStamp` real.

## Build

```bash
pnpm build
```

O resultado fica em `dist/`.

## Publicar

Dentro de `app/`. Os scripts de publicar fazem o build antes. Primeiro o beta (beta.klick.ranimontagna.com, fora dos buscadores), para
conferir:

```bash
pnpm run deploy:beta
```

Depois a raiz (klick.ranimontagna.com, worker `klick-app`):

```bash
pnpm run deploy:production
```

Se o pnpm reclamar de `ERR_PNPM_IGNORED_BUILDS` (as builds do workerd ficam de fora de propósito), use
`pnpm --config.verify-deps-before-run=false run deploy:beta` (e o mesmo para `deploy:production`). Todo `wrangler deploy` (e o
`wrangler dev`) roda antes `scripts/check-dist.mjs` (`build.command` no `wrangler.jsonc`): sem um build de verdade em `dist/`
(o `pnpm test:worker` deixa lá uma pasta vazia), o deploy é recusado, e nada vai para o ar.

A configuração está em `wrangler.jsonc`: um Worker com os arquivos do app e o servidor da conta e do sync (`worker/`), que só roda
em `/api/*`. A raiz e o beta são domínios próprios dos Workers `klick-app` e `klick-app-beta`: o Cloudflare cria e mantém o registro
DNS de cada um. A v1 não está mais no ar (o projeto da Vercel foi apagado em 12/10); o código dela continua na `main` (tag `v1.4.0`).

### A conta e o sync

- **Liga e desliga:** `ACCOUNTS_ENABLED` em `wrangler.jsonc`. Ligada no beta e, desde 19/10/2026, na raiz. Desligada, o
  `/api` (menos `/api/health`) responde 404 e o app não mostra nada de conta.
- **Cada ambiente tem os próprios dados:** D1 (`klick-auth-beta` e `klick-auth`, o login), Durable Objects (uma conta por objeto) e
  R2 (`klick-snapshots-beta` e `klick-snapshots`, as cópias diárias, apagadas depois de 30 dias por uma regra do bucket).
- **Segredos:** o repositório é público. `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET` e `RESEND_API_KEY` entram só por
  `npx wrangler secret put NOME` (e `--env production`), nunca num arquivo.
  O passo a passo (Resend, Turnstile e o script que coloca tudo): [`../docs/portao-c.md`](../docs/portao-c.md).
- **Tabelas do login:** uma migração nova em `worker/migrations/` vai para cada banco com
  `npx wrangler d1 migrations apply DB --remote` (e `--env production`) antes do deploy.
- **Logs:** os `console.log` do Worker ficam (só ids, contagens, durações e erros); o log de invocação está desligado nos dois
  ambientes (`observability.logs.invocation_logs: false`), porque guardaria cada pedido com os cabeçalhos por dias. O Better Auth
  escreve pelo `authLog` de `worker/auth.ts`, sem e-mail nem código.
- **Limpeza diária:** um Cron Trigger (`triggers.crons`, nos dois ambientes) apaga os pedidos de código com mais de uma hora e os
  códigos vencidos, com ou sem contas (a política promete "uma vez por dia").
- **Política de privacidade:** `public/privacidade/index.html`, servida em `/privacidade/` (com a barra no fim: é a URL que o service
  worker guarda). Uma mudança no que o servidor guarda muda a política junto.

### Os portões antes de publicar a conta (endurecimento)

Nesta ordem; um passo só começa com o anterior feito. O plano é o de `docs/superpowers/specs/2026-10-17-klick-conta-endurecimento-design.md`,
e os números vêm de `docs/superpowers/measurements/2026-10-17-conta-100k.md`.

Antes do beta:

1. **As correções da revisão final** do endurecimento no ramo que vai ser publicado.
2. **As migrações 0003 e 0004 nos dois D1 remotos** (`klick-auth-beta` e `klick-auth`), antes de qualquer deploy deste código:
   `npx wrangler d1 migrations apply DB --remote` (e `--env production`). Sem a 0003, pedir o código por e-mail falha no beta (o teto de
   e-mails lê a tabela nova), e o Cron da raiz loga `recount-failed` todo dia. Sem a 0004 (`rows_day`, o teto de linhas gravadas por dia
   somado entre as contas), toda reserva falha e nada que grava passa: o sync devolve a página e adia as gravações de 5 em 5 minutos
   (`{evt:'rows-cap-error'}` nos logs), a compactação não roda e a restauração volta `write-budget`.
3. **A maior conta do beta:** conferir o tamanho dela. Até 10 mil solves cabe mesmo na leitura de 10 ms do limite de CPU (o primeiro
   despertar de cada conta do beta, uma vez, depois do deploy).
4. **Publicar o beta** (`pnpm run deploy:beta`) e conferir as vars na saída do deploy: `SNAPSHOT_MAX_RECORDS` em `150000` (nos dois
   ambientes, desde as cópias grandes: acima de 5.000 registros a cópia sai em partes), `RESTORE_MAX_RECORDS` em `5000` (agora em
   mudanças da restauração, não em registros da conta) e `ROWS_WRITTEN_DAY_CAP` em `10000` (na raiz, `60000`).
   A conta de teste das sondas (4.006 registros) passa do dia útil do beta (2.247): lá ela é uma conta grande, com a cópia semanal no dia
   dela, e a restauração cujas mudanças passam do dia útil chega pelo aparelho. Não serve para o teste de fumaça do passo 6.
5. **Quem usa o beta vê "Atualize o Klick"** até recarregar (o protocolo do sync subiu); a fila de cada aparelho fica guardada.
6. **Teste de fumaça:** o código por e-mail, o sync e a lista das cópias na nuvem. No dia seguinte, a cópia do alarme e a linha
   `{evt:'cleanup', storage:N}` nos logs.
7. **Sonda de CPU:** a cópia e a restauração de uma conta de teste com alguns milhares de solves, conferindo a CPU nos Workers Logs. Se
   valer a leitura de 10 ms, as duas vars (`SNAPSHOT_MAX_RECORDS` e `RESTORE_MAX_RECORDS`) vão a `"0"`, e a cascata de apagar uma sessão
   ganha um teto no código. **Feita em 19/10 no beta** (conta de 4.006 registros): a cópia do alarme gastou 54 ms de CPU e a restauração
   283 ms, as duas sem erro no plano gratuito. Vale a leitura de 30 s; as vars ficam como estão.
8. **Sonda do apagar a conta** (`deleteAll`): apagar uma conta de teste e conferir no painel as linhas gravadas. **Feita em 19/10:**
   apagar a conta de 4.006 registros gravou 14 linhas (o `deleteAll` não conta por registro).

Antes da raiz:

9. **A conta da Cloudflare continua no Workers Free.**
10. **O uso dos outros projetos da conta**, no painel: as operações A e B do R2, e Durable Objects, D1 e Workers.
11. **As decisões do Ranielli:** um orçamento de linhas gravadas por dia somado entre todas as contas, e uma regra de rate limit do WAF
    em `/api/*`. O orçamento foi aprovado e está no código (`ROWS_WRITTEN_DAY_CAP`: 10 mil no beta e 60 mil na raiz; a migração 0004):
    cada pedido que grava reserva antes exatamente as linhas dele, e o maior pedido de um dia segue o menor dos dois tetos (2.247
    registros no beta, 4.747 na raiz). Falta a regra do WAF.
12. **`ACCOUNTS_ENABLED` em `"true"` na raiz** (`wrangler.jsonc`, `env.production`) e publicar (`pnpm run deploy:production`).

Antes de subir `SNAPSHOT_MAX_RECORDS` acima de `150000` (as cópias grandes, `docs/superpowers/specs/2026-10-20-klick-copias-grandes-design.md`):

13. **O tempo de relógio de uma conta de 100 mil solves, no beta.** A cópia e a restauração no servidor rodam dentro de
    `blockConcurrencyWhile`, que tem 30 s de relógio (a CPU mais cada ida ao R2 e ao D1), e a medição só mediu a CPU. Com uma conta de
    teste de 100 mil solves no beta, cronometrar a cópia semanal dela e uma restauração no servidor com `npx wrangler tail` (o `ms` das
    linhas `{evt:'copy'}` e `{evt:'restore'}`) e conferir que as duas ficam abaixo de 15 s. Só então subir a var, nos dois ambientes.

Voltar o Worker (rollback) depois das cópias em partes: um Worker de antes delas lista cada parte de uma cópia grande
(`snap/<conta>/<nome>/001.json.gz`, ...) como uma cópia de "0 solves". Restaurar uma delas dá 400 `bad-name` (o nome com a barra não passa
na rota), sem risco para os dados. Com o Worker novo publicado de novo, a lista volta ao normal.

## Por que o cubing.js é empacotado à parte

O worker de embaralhamento do cubing.js não sobe quando passa pelo bundler do Vite ("Module worker instantiation failed"). Por isso `scripts/build-cubing.mjs` empacota o cubing.js com esbuild em `public/vendor/cubing/` (fora do git), e o app o importa em tempo de execução. Os scripts `dev` e `build` rodam esse passo antes do Vite.
