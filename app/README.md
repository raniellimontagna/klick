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

Depois do build, dentro de `app/`. Primeiro o beta (beta.klick.ranimontagna.com, fora dos buscadores), para conferir:

```bash
npx wrangler deploy
```

Depois a raiz (klick.ranimontagna.com, worker `klick-app`):

```bash
npx wrangler deploy --env production
```

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
  O passo a passo (Resend, Turnstile e o script que coloca tudo): [`../docs/portao-c.md`](../docs/portao-c.md).
- **Tabelas do login:** uma migração nova em `worker/migrations/` vai para cada banco com
  `npx wrangler d1 migrations apply DB --remote` (e `--env production`) antes do deploy.
- **Logs:** os `console.log` do Worker ficam (só ids, contagens, durações e erros); o log de invocação está desligado nos dois
  ambientes (`observability.logs.invocation_logs: false`), porque guardaria cada pedido com os cabeçalhos por dias.
- **Política de privacidade:** `public/privacidade/index.html`, servida em `/privacidade/` (com a barra no fim: é a URL que o service
  worker guarda). Uma mudança no que o servidor guarda muda a política junto.

## Por que o cubing.js é empacotado à parte

O worker de embaralhamento do cubing.js não sobe quando passa pelo bundler do Vite ("Module worker instantiation failed"). Por isso `scripts/build-cubing.mjs` empacota o cubing.js com esbuild em `public/vendor/cubing/` (fora do git), e o app o importa em tempo de execução. Os scripts `dev` e `build` rodam esse passo antes do Vite.
