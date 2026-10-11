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
pnpm test        # unitários (Vitest)
pnpm test:e2e    # ponta a ponta (Playwright; rode `pnpm exec playwright install chromium` uma vez)
pnpm check       # svelte-check e tsc
```

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

A configuração está em `wrangler.jsonc` (Cloudflare Workers com arquivos estáticos). A raiz chega ao app por uma rota na zona; o
registro DNS da Vercel continua o da v1. Para voltar à v1, remova a rota `klick.ranimontagna.com/*` no painel do Cloudflare.

## Por que o cubing.js é empacotado à parte

O worker de embaralhamento do cubing.js não sobe quando passa pelo bundler do Vite ("Module worker instantiation failed"). Por isso `scripts/build-cubing.mjs` empacota o cubing.js com esbuild em `public/vendor/cubing/` (fora do git), e o app o importa em tempo de execução. Os scripts `dev` e `build` rodam esse passo antes do Vite.
