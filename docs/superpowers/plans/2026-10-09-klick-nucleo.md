# Klick v2 — núcleo do timer — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o Klick de verdade em `app/`: um PWA em Svelte 5 com o núcleo do timer em TypeScript, 13 eventos WCA com embaralhamentos do cubing.js, persistência local em camadas que nunca perde um solve e paridade com o protótipo validado, publicado em `beta.klick.ranimontagna.com`.

**Architecture:** A lógica pura (timer, regras, eventos, estatísticas, coach, toque) fica em `app/src/core/` e é testada com Vitest, sem DOM. A persistência (`app/src/data/`) usa IndexedDB pelo `idb`. Os embaralhamentos (`app/src/scramble/`) vêm do cubing.js empacotado com esbuild em `public/vendor/cubing/`. A interface (`app/src/ui/`) é Svelte 5 com runes e só lê e chama o núcleo. O cronômetro na tela é escrito direto no DOM, fora da reatividade.

**Tech Stack:** Node 24, pnpm 11, Svelte 5.57, Vite 8.3, @sveltejs/vite-plugin-svelte 7.3, TypeScript 6.0, vite-plugin-pwa 2.0.0, cubing 0.65.1 + esbuild 0.25, idb 8, Vitest + jsdom + @testing-library/svelte 5, fake-indexeddb 6, Playwright 1.64 + @axe-core/playwright 4.13, @fontsource/geist-sans e @fontsource/geist-mono 5.3, wrangler 4.

**Spec:** `docs/superpowers/specs/2026-10-09-klick-nucleo-design.md`, que estende `docs/superpowers/specs/2026-10-08-klick-design.md`. A lógica de referência está em `prototype/`.

## Global Constraints

- **Lugar:** o app vive em `app/` na branch `v2`. Não mexa em `prototype/`, a não ser que a task diga.
- **Pacotes:** pnpm 11, com `app/pnpm-workspace.yaml` contendo `allowBuilds: { esbuild: true }`. Se o pnpm recusar um pacote recente por `minimumReleaseAge`, acrescente-o a `minimumReleaseAgeExclude` no mesmo arquivo.
- **Scripts:**
  - `pnpm test` roda o Vitest uma vez;
  - `pnpm test:e2e` roda o Playwright;
  - `pnpm check` roda svelte-check e tsc;
  - `pnpm build` gera o cubing e depois o build do Vite.
- **TypeScript estrito** (`strict: true`). `any` só na fronteira com o cubing.js, isolada em `src/scramble/cubing-loader.ts`.
- **Textos:** pt-BR, centralizados em `app/src/strings.ts`. A voz do coach é calma e curta; sem emoji, sem exclamação, sem culpa.
- **Tempos:** guardados em milissegundos e exibidos truncados no centésimo (`0:58.42`).
- **Médias:**
  - Ao5, Ao12 e Ao100 na convenção do csTimer: descartam `ceil(5% de n)` de cada lado;
  - o DNF conta como o pior tempo; se sobrar DNF depois do descarte, a média vira DNF;
  - o Mo3 não descarta nada e vira DNF se tiver DNF.
- **Inspeção WCA:** 15 s, avisos aos 8 s e 12 s, +2 depois de 15 s e DNF depois de 17 s, em todos os eventos menos 3BLD.
- **Nenhum solve se perde:** toda falha de gravação aparece para a pessoa; nada é descartado em silêncio.
- **O núcleo não conhece a tela:** `src/core/`, `src/data/` e `src/scramble/queue.ts` não importam Svelte nem acessam `document`.
- **Acessibilidade:**
  - contraste AA nos dois temas;
  - foco visível e preservado depois de redesenhar a tela;
  - alvos de toque de 44 px em `pointer: coarse`;
  - `aria-live="polite"` com o tempo final e o coach;
  - reduzir movimento.
- **Commits:** em português, no padrão `tipo(app): …`, com o trailer `Co-Authored-By` do modelo que escreveu. Só locais: nunca `git push`.
- **Publicação:** só em `beta.klick.ranimontagna.com`. A raiz do domínio continua servindo o protótipo; a troca depende da pessoa.

## Review Focus

1. **Recarregar logo depois de parar o timer.** O solve tem de estar lá ao reabrir, porque é gravado antes da reação. Teste ponta a ponta na Task 13.
2. **Duas abas abertas.** Um solve feito numa aparece na outra sem recarregar. Teste de unidade com canal falso na Task 5; teste ponta a ponta na Task 13.
3. **Falha de gravação** (cota cheia, banco bloqueado). O solve fica numa fila em memória, o aviso fixo aparece e a fila grava quando o banco volta. Teste na Task 6 (fila) e na Task 10 (aviso).
4. **Trocar de evento ou sessão no meio da inspeção ou do armar.** Abandona sem largar, e a fila de embaralhamentos não mistura eventos. Testes nas Tasks 8 e 10.
5. **Importar o mesmo arquivo do csTimer duas vezes.** Não duplica solves. Teste na Task 7.

---

## Estrutura de arquivos

```
app/
  package.json, pnpm-workspace.yaml, vite.config.ts, vitest.config.ts, playwright.config.ts,
  svelte.config.js, tsconfig*.json, index.html, .gitignore, wrangler.jsonc, README.md
  scripts/build-cubing.mjs        empacota o cubing.js com esbuild em public/vendor/cubing (gerado, fora do git)
  scripts/cubing-entry.js
  public/                          ícones e manifesto
  src/
    main.ts                        monta o App e importa os estilos
    strings.ts                     textos pt-BR
    styles/tokens.css, base.css, components.css, screens.css   portados do protótipo
    core/
      events.ts                    catálogo dos 13 eventos
      stats.ts                     estatísticas (porta de prototype/scripts/stats.js + Mo3 + média oficial)
      timer.ts                     máquina de estados (porta + timestamps dos eventos)
      touch.ts                     armar com dois polegares (porta)
      coach.ts                     mensagens do coach (porta + média oficial por evento)
      types.ts                     tipos compartilhados (Solve, Session, Settings, Profile, Meta, Penalty)
    data/
      ids.ts                       ids únicos ordenados no tempo
      db.ts                        esquema IndexedDB e migrações
      repository.ts                CRUD, lixeira, perfil, meta, avisos entre abas
      safety.ts                    cópias automáticas, decisões pós-solve, armazenamento persistente, fila de gravação
      transfer.ts                  exportar e importar (Klick, csTimer), migração da v1
      folder.ts                    cópias numa pasta (File System Access)
    scramble/
      cubing-loader.ts             import do cubing.js em runtime
      queue.ts                     fila de embaralhamentos por evento
    ui/
      App.svelte                   casca: topo, abas, telas, barra de abas, aviso, região viva, diálogos
      state/app.svelte.ts          estado da interface (classe com runes) sobre núcleo, dados e embaralhamentos
      format.ts, charts.ts, sound.ts, wakelock.ts, centro.ts   (portas de prototype/scripts/ui/*.js, sound.js e centro.js)
      timer/   TimerScreen.svelte, TimeDisplay.ts, Zones.svelte, ResultActions.svelte, ScrambleBlock.svelte,
               ScrambleImage.svelte, CentroView.svelte, input.ts
      evolucao/EvolucaoScreen.svelte
      centro/  CentroScreen.svelte
      ajustes/ AjustesScreen.svelte, DataSection.svelte
      dialogs/ SessionsDialog.svelte, ShortcutsDialog.svelte, OnboardingDialog.svelte, ExportDialog.svelte,
               ImportDialog.svelte, BackupsDialog.svelte, TrashDialog.svelte, InstallGuide.svelte, UpdatePrompt.svelte
  tests/
    unit/  *.test.ts (Vitest)
    e2e/   *.spec.ts (Playwright)
    fixtures/ cstimer-export.txt, v1-klick-sessions.json
```

---

### Task 1: Esqueleto do app, estilos, fontes e textos

**Files:**
- Create:
  - `app/package.json`, `app/pnpm-workspace.yaml`, `app/vite.config.ts`, `app/vitest.config.ts`, `app/svelte.config.js`, `app/tsconfig.json`, `app/tsconfig.app.json`, `app/tsconfig.node.json`, `app/index.html`, `app/.gitignore`
  - `app/src/main.ts`, `app/src/ui/App.svelte`, `app/src/strings.ts`
  - `app/src/styles/tokens.css`, `app/src/styles/base.css`, `app/src/styles/components.css`, `app/src/styles/screens.css`
  - `app/tests/unit/smoke.test.ts`, `app/tests/unit/contrast.test.ts`

**Interfaces:**
- Produces:
  - comandos `pnpm test`, `pnpm check`, `pnpm build` funcionando;
  - estilos globais importados em `main.ts`;
  - `T` (objeto de textos) exportado de `src/strings.ts`, com as mesmas chaves de `prototype/scripts/strings.js`, mais as que as tasks seguintes acrescentarem.

- [ ] **Step 1: Criar o projeto Svelte + TS**

Rode a partir da raiz do repo:

```bash
cd /Users/raniellimontagna/Projetos/pessoal/klick
pnpm create vite@latest app --template svelte-ts --no-interactive
cd app
pnpm install
pnpm add idb@8.0.4 @fontsource/geist-sans@5.3.0 @fontsource/geist-mono@5.3.0
pnpm add -D vitest jsdom @testing-library/svelte@5.4.2 @testing-library/jest-dom fake-indexeddb@6.2.5 @playwright/test@1.64.0 @axe-core/playwright@4.13.0 vite-plugin-pwa@2.0.0 esbuild@0.25 cubing@0.65.1
pnpm approve-builds esbuild
```

Apague o conteúdo de exemplo do template (`src/lib/`, `src/assets/`, `src/app.css`, o contador e o logo do `App.svelte`).

- [ ] **Step 2: Configurar scripts, Vitest e TypeScript**

`app/package.json`, campo `scripts` (substitua o do template):

```json
{
  "dev": "node scripts/build-cubing.mjs && vite",
  "build": "node scripts/build-cubing.mjs && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "check": "svelte-check --tsconfig ./tsconfig.app.json && tsc -p tsconfig.node.json"
}
```

Até a Task 8 criar `scripts/build-cubing.mjs`, crie-o com o conteúdo mínimo abaixo, para os scripts rodarem:

```js
// Substituído na Task 8: empacota o cubing.js em public/vendor/cubing.
console.log('cubing: ainda não empacotado');
```

`app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
```

`app/tests/unit/setup.ts`. O jsdom não tem `matchMedia`, `PointerEvent` nem `dialog.showModal`; o setup os imita do jeito mínimo de que os testes precisam:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

if (!('PointerEvent' in globalThis)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number; pointerType: string; isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

// O jsdom não implementa a abertura modal; nos testes, abrir e fechar só mexem no atributo open.
const dialogProto = HTMLDialogElement.prototype;
dialogProto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
dialogProto.show = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
dialogProto.close = function (this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
```

Em `app/tsconfig.app.json`, garanta `"strict": true` e inclua `"tests/**/*.ts"` em `include`.

`app/.gitignore` deve conter, além do que o template trouxe: `public/vendor/`, `test-results/`, `playwright-report/`, `dist/`, `node_modules/`.

- [ ] **Step 3: Portar estilos, fontes e textos**

- Copie `prototype/styles/tokens.css`, `base.css`, `components.css` e `screens.css` para `app/src/styles/`, sem mudar o conteúdo.
- Em `tokens.css`, troque a fonte do Google pela local: os tokens `--font` e `--mono` passam a ser `'Geist Sans', 'Geist', 'Inter', system-ui, -apple-system, sans-serif` e `'Geist Mono', ui-monospace, monospace`.
- Copie `prototype/scripts/strings.js` para `app/src/strings.ts`, com tipos mínimos (a função `sec` recebe `number`). Mantenha o nome e o formato do export `T` e de `MILESTONE_INFO`, `TRAIL` e `FINISH_INFO`.

`app/src/main.ts`:

```ts
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import { mount } from 'svelte';
import App from './ui/App.svelte';

mount(App, { target: document.getElementById('app')! });
```

`app/index.html`: mantenha o do template, com `lang="pt-BR"` e `<title>Klick</title>`, e `<div id="app"></div>` no body. Coloque no `<head>`:
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`;
- `<meta name="theme-color" content="#121110" media="(prefers-color-scheme: dark)" />`;
- `<meta name="theme-color" content="#f3f0e9" media="(prefers-color-scheme: light)" />`.

`app/src/ui/App.svelte`, provisório até a Task 9:

```svelte
<script lang="ts">
  import { T } from '../strings';
</script>

<main class="screen" data-testid="app-root">
  <p>{T.coach.idle}</p>
</main>
```

- [ ] **Step 4: Testes de fumaça e de contraste**

`app/tests/unit/smoke.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from '../../src/ui/App.svelte';
import { T } from '../../src/strings';

describe('esqueleto', () => {
  it('monta o App com um texto de strings.ts', () => {
    render(App);
    expect(screen.getByTestId('app-root')).toHaveTextContent(T.coach.idle);
  });

  it('IndexedDB simulado está disponível nos testes', () => {
    expect(typeof indexedDB.open).toBe('function');
  });
});
```

`app/tests/unit/contrast.test.ts`: porte `prototype/tests/contrast.test.js` para TypeScript e Vitest (`describe`/`it`), lendo `app/src/styles/tokens.css` com `fs.readFileSync`. Mantenha os mesmos pares e mínimos e os três blocos: claro, noite e noite do sistema.

- [ ] **Step 5: Rodar e conferir**

Run: `cd app && pnpm test && pnpm check && pnpm build`
Expected: os testes passam (smoke 2 + contraste 3), o check fica sem erros e o build gera `dist/`.

- [ ] **Step 6: Commit**

```bash
git add app
git commit -m "feat(app): esqueleto Svelte 5 + Vite com estilos, fontes locais e textos do protótipo" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 2: Catálogo de eventos, tipos e estatísticas

**Files:**
- Create: `app/src/core/types.ts`, `app/src/core/events.ts`, `app/src/core/stats.ts`
- Test: `app/tests/unit/events.test.ts`, `app/tests/unit/stats.test.ts`

**Interfaces:**
- Produces:

```ts
// core/types.ts
export type Penalty = null | '+2' | 'DNF';
export type EventId = '333' | '222' | '444' | '555' | '666' | '777' | '333oh' | '333bf' | 'minx' | 'pyram' | 'skewb' | 'sq1' | 'clock';
export interface Solve {
  id: string; sessionId: string; event: EventId; ms: number; penalty: Penalty; at: number;
  scramble: string; note: string; createdAt: number; updatedAt: number; deletedAt: number | null;
}
export interface Session {
  id: string; name: string; event: EventId; order: number; createdAt: number; updatedAt: number; deletedAt: number | null;
}
export type Theme = 'system' | 'light' | 'dark';
export interface Settings {
  inspection: boolean; holdMs: number; mobileArm: 'two' | 'one'; theme: Theme;
  sound: { klick: boolean; insp: boolean; pb: boolean }; silent: boolean;
  reducedMotion: 'system' | 'always'; dailyGoal: number; scrambleImage: boolean;
}
export type FinishId = 'fosco' | 'brilho' | 'gelo' | 'carbono';
export interface Profile { settings: Settings; trail: boolean[]; finish: FinishId; onboarded: boolean; currentSessionId: string | null; }
export interface Meta {
  schemaVersion: number; deviceId: string; lastBackupAt: number | null; solvesSinceBackup: number;
  lastBackupDay: string | null; lastExportAt: number | null; solvesSinceExport: number;
  lastFolderSaveAt: number | null; solvesSinceFolderSave: number; lastFolderSaveDay: string | null;
  v1ImportOffered: boolean; persistRequested: boolean; installGuideDismissed: boolean;
}
export const DEFAULT_SETTINGS: Settings; // inspection true, holdMs 300, mobileArm 'two', theme 'system', sound todos true, silent false, reducedMotion 'system', dailyGoal 20, scrambleImage true

// core/events.ts
export interface EventInfo {
  id: EventId; name: string; short: string; inspection: boolean; average: 'ao5' | 'mo3';
  scrambleId: string; puzzle: string; csTimer: string; milestones: boolean;
}
export const EVENTS: readonly EventInfo[];
export const EVENT_IDS: readonly EventId[];
export function eventInfo(id: EventId): EventInfo; // lança Error para id desconhecido
export function eventFromCsTimer(scrType: string | undefined): EventId | null;

// core/stats.ts — mesma API de prototype/scripts/stats.js (tipada), mais:
export function meanOf(solves: Solve[], n: number): number | null;          // Mo n: média simples dos n últimos; Infinity se houver DNF; null se faltar solve
export function officialAverage(solves: Solve[], event: EventId): number | null; // ao5 ou mo3 conforme o catálogo
export function officialAverageLabel(event: EventId): { n: number; kind: 'ao' | 'mo' };
```

- [ ] **Step 1: Escrever os testes**

`app/tests/unit/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EVENTS, EVENT_IDS, eventFromCsTimer, eventInfo } from '../../src/core/events';

describe('catálogo de eventos', () => {
  it('tem os 13 eventos na ordem do produto', () => {
    expect(EVENT_IDS).toEqual(['333', '222', '444', '555', '666', '777', '333oh', '333bf', 'minx', 'pyram', 'skewb', 'sq1', 'clock']);
    expect(EVENTS).toHaveLength(13);
  });

  it('3BLD não tem inspeção; os outros têm', () => {
    for (const e of EVENTS) expect(e.inspection).toBe(e.id !== '333bf');
  });

  it('6×6 e 7×7 usam Mo3; os outros, Ao5', () => {
    for (const e of EVENTS) expect(e.average).toBe(e.id === '666' || e.id === '777' ? 'mo3' : 'ao5');
  });

  it('só o 3×3 tem marcos', () => {
    expect(EVENTS.filter((e) => e.milestones).map((e) => e.id)).toEqual(['333']);
  });

  it('ids do cubing.js, peças do twisty e tipos do csTimer batem', () => {
    expect(eventInfo('minx')).toMatchObject({ scrambleId: 'minx', puzzle: 'megaminx', csTimer: 'mgmp', name: 'Megaminx' });
    expect(eventInfo('sq1')).toMatchObject({ scrambleId: 'sq1', puzzle: 'square1', csTimer: 'sqrs', name: 'Square-1' });
    expect(eventInfo('333bf')).toMatchObject({ scrambleId: '333bf', puzzle: '3x3x3', csTimer: '333ni', short: '3BLD' });
    expect(eventInfo('222')).toMatchObject({ puzzle: '2x2x2', csTimer: '222so', short: '2×2' });
  });

  it('reconhece o tipo de embaralhamento do csTimer', () => {
    expect(eventFromCsTimer(undefined)).toBe('333');
    expect(eventFromCsTimer('333')).toBe('333');
    expect(eventFromCsTimer('444wca')).toBe('444');
    expect(eventFromCsTimer('clkwca')).toBe('clock');
    expect(eventFromCsTimer('333ni')).toBe('333bf');
    expect(eventFromCsTimer('zbll')).toBeNull();
  });

  it('id desconhecido lança erro', () => {
    expect(() => eventInfo('fto' as never)).toThrow();
  });
});
```

`app/tests/unit/stats.test.ts`:
- Porte `prototype/tests/stats.test.js` para TypeScript e Vitest. Os casos mudam pouco: os solves de teste ganham `event: '333'` e os campos de `Solve`, por um helper `sv(ms, penalty?, at?)` no próprio arquivo.
- Acrescente estes testes:

```ts
import { describe, expect, it } from 'vitest';
import { meanOf, officialAverage, officialAverageLabel } from '../../src/core/stats';
import type { Solve } from '../../src/core/types';

let n = 0;
const mk = (ms: number, penalty: Solve['penalty'] = null, event: Solve['event'] = '666'): Solve => ({
  id: String(++n), sessionId: 's', event, ms, penalty, at: n, scramble: '', note: '', createdAt: n, updatedAt: n, deletedAt: null,
});

describe('média oficial por evento', () => {
  it('Mo3 é a média simples dos três últimos', () => {
    expect(meanOf([mk(90000), mk(100000), mk(110000), mk(120000)], 3)).toBe(110000);
  });
  it('Mo3 com DNF vira DNF; com menos de 3 solves é null', () => {
    expect(meanOf([mk(90000), mk(1, 'DNF'), mk(100000)], 3)).toBe(Infinity);
    expect(meanOf([mk(90000), mk(100000)], 3)).toBeNull();
  });
  it('Mo3 conta o +2', () => {
    expect(meanOf([mk(90000), mk(98000, '+2'), mk(100000)], 3)).toBe(96666.66666666667);
  });
  it('officialAverage usa Mo3 no 6×6 e Ao5 no 3×3', () => {
    const six = [mk(90000), mk(100000), mk(110000)];
    expect(officialAverage(six, '666')).toBe(100000);
    const three = [10, 20, 30, 40, 50].map((s) => mk(s * 1000, null, '333'));
    expect(officialAverage(three, '333')).toBe(30000);
  });
  it('rótulo da média oficial', () => {
    expect(officialAverageLabel('777')).toEqual({ n: 3, kind: 'mo' });
    expect(officialAverageLabel('sq1')).toEqual({ n: 5, kind: 'ao' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- events stats`
Expected: FAIL, com os módulos `core/events` e `core/stats` inexistentes.

- [ ] **Step 3: Implementar**

**`core/types.ts`:** as interfaces acima, mais `DEFAULT_SETTINGS` congelado com os valores do comentário.

**`core/events.ts`:** o catálogo, com estes valores exatos:

| id | name | short | scrambleId | puzzle | csTimer |
|---|---|---|---|---|---|
| 333 | 3×3 | 3×3 | 333 | 3x3x3 | 333 |
| 222 | 2×2 | 2×2 | 222 | 2x2x2 | 222so |
| 444 | 4×4 | 4×4 | 444 | 4x4x4 | 444wca |
| 555 | 5×5 | 5×5 | 555 | 5x5x5 | 555wca |
| 666 | 6×6 | 6×6 | 666 | 6x6x6 | 666wca |
| 777 | 7×7 | 7×7 | 777 | 7x7x7 | 777wca |
| 333oh | 3×3 com uma mão | 3×3 OH | 333oh | 3x3x3 | 333oh |
| 333bf | 3×3 às cegas | 3BLD | 333bf | 3x3x3 | 333ni |
| minx | Megaminx | Megaminx | minx | megaminx | mgmp |
| pyram | Pyraminx | Pyraminx | pyram | pyraminx | pyrso |
| skewb | Skewb | Skewb | skewb | skewb | skbso |
| sq1 | Square-1 | Square-1 | sq1 | square1 | sqrs |
| clock | Clock | Clock | clock | clock | clkwca |

Os demais campos:
- `inspection` é `id !== '333bf'`;
- `average` é `'mo3'` para 666 e 777 e `'ao5'` para o resto;
- `milestones` é `id === '333'`.

`eventFromCsTimer`:
- `undefined` ou `''` vira `'333'`;
- para outros valores, procura no catálogo por `csTimer`;
- o que não estiver no catálogo vira `null`.

**`core/stats.ts`:** porte `prototype/scripts/stats.js` para TypeScript, com as mesmas funções e o mesmo comportamento, tipado com `Solve`. Acrescente `meanOf`, `officialAverage` e `officialAverageLabel`:
- `meanOf`: com menos de `n` solves, devolve `null`; se algum dos `n` últimos é DNF, devolve `Infinity`; senão, devolve a soma de `effectiveMs` dividida por `n`;
- `officialAverage(s, ev)` devolve `eventInfo(ev).average === 'mo3' ? meanOf(s, 3) : averageOf(s, 5)`;
- `officialAverageLabel` devolve `{ n: 3, kind: 'mo' }` ou `{ n: 5, kind: 'ao' }`.

As funções de marcos (`milestoneProgress`, `achievedIds`) continuam recebendo solves. Quem chama passa só os do 3×3; o filtro fica na interface.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test -- events stats`
Expected: PASS em todos (os portados do protótipo, mais os novos).

- [ ] **Step 5: Commit**

```bash
git add app/src/core app/tests/unit/events.test.ts app/tests/unit/stats.test.ts
git commit -m "feat(app): catálogo dos 13 eventos WCA e estatísticas com Ao5 e Mo3" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 3: Timer com horário do evento e armar no toque

**Files:**
- Create: `app/src/core/timer.ts`, `app/src/core/touch.ts`
- Test: `app/tests/unit/timer.test.ts`, `app/tests/unit/touch.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:

```ts
// core/timer.ts — mesma API de prototype/scripts/timer.js, tipada, com o horário opcional do evento:
export const STATES: { readonly IDLE: 'idle'; INSPECT: 'inspect'; ARMING: 'arming'; READY: 'ready'; RUNNING: 'running'; DONE: 'done' };
export type TimerState = 'idle' | 'inspect' | 'arming' | 'ready' | 'running' | 'done';
export interface TimerResult { ms: number; penalty: Penalty }
export interface Timer {
  press(at?: number): void;   // at = event.timeStamp (mesma base de performance.now()); sem at, usa now()
  release(at?: number): void;
  tick(at?: number): void;
  cancel(): void;
  reset(): void;
  setOptions(o: { holdMs?: number; inspection?: boolean }): void;
  on(ev: 'state', fn: (next: TimerState, prev: TimerState) => void): () => void;
  on(ev: 'warn', fn: (ms: number) => void): () => void;
  on(ev: 'done', fn: (r: TimerResult) => void): () => void;
  readonly state: TimerState; readonly armProgress: number; readonly inspectElapsed: number;
  readonly elapsed: number; readonly result: TimerResult | null;
}
export function createTimer(o?: { now?: () => number; holdMs?: number; inspection?: boolean }): Timer;

// core/touch.ts — mesma API de prototype/scripts/touch.js, tipada:
export interface TouchArm { setMode(m: 'two' | 'one'): void; down(pointerId: number, zone: 'left' | 'right'): void; up(pointerId: number): void; cancelAll(): void }
export function createTouchArm(o: { press: () => void; release: () => void; cancel: () => void; getState: () => TimerState; getInspection: () => boolean; mode?: 'two' | 'one' }): TouchArm;
```

- [ ] **Step 1: Portar os testes do protótipo e acrescentar os novos**

- Porte `prototype/tests/timer.test.js` e `prototype/tests/touch.test.js` para TypeScript e Vitest, sem mudar os casos.
- Em `app/tests/unit/timer.test.ts`, acrescente:

```ts
import { describe, expect, it } from 'vitest';
import { createTimer } from '../../src/core/timer';

const clock = () => {
  let t = 0;
  return { now: () => t, set: (v: number) => { t = v; } };
};

describe('horário do evento', () => {
  it('usa o timeStamp do evento, não a hora em que o código roda', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    c.set(1000); timer.press(1000);
    c.set(1400); timer.tick();
    expect(timer.state).toBe('ready');
    c.set(1450); timer.release(1410);      // o evento aconteceu em 1410, o handler rodou em 1450
    c.set(11000); timer.press(10980);      // parou em 10980
    expect(timer.result).toEqual({ ms: 9570, penalty: null });
  });

  it('soltar depois do tempo de armar larga mesmo sem tick no meio, medindo pelo evento', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    timer.press(0);
    c.set(600); timer.release(350);
    expect(timer.state).toBe('running');
  });

  it('soltar antes do tempo de armar, pelo horário do evento, não larga', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    timer.press(0);
    c.set(400); timer.release(250);        // o handler atrasou, mas o dedo saiu aos 250 ms
    expect(timer.state).toBe('idle');
  });

  it('inspeção medida pelo evento: largar aos 15,5 s dá +2', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 0, inspection: true });
    timer.press(0); timer.release(10);     // começa a inspeção em 10
    c.set(15400); timer.press(15400);
    c.set(15600); timer.release(15510);
    c.set(25510); timer.press(25510);
    expect(timer.result).toEqual({ ms: 10000, penalty: '+2' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- timer touch`
Expected: FAIL, com os módulos inexistentes.

- [ ] **Step 3: Implementar**

**`core/timer.ts`:** porte `prototype/scripts/timer.js`, com estas mudanças:
- `press(at?)`, `release(at?)` e `tick(at?)` começam com `const t = at ?? now();` e usam `t` onde o original usa `now()`: `holdStart`, `inspStart`, `startAt`, o cálculo de `ms` no stop, o tempo de inspeção `ie` e a comparação de armar em `tick`.
- `release(at)` chama `tick(at)`, e não `tick()`, para decidir com o horário do evento se o tempo de armar foi atingido.
- Os getters (`armProgress`, `inspectElapsed`, `elapsed`) continuam usando `now()`, porque servem só para a tela.
- `cancel()` mantém o comportamento final do protótipo: sempre zera `pendingInspect` e só muda o estado em ARMING ou READY.

**`core/touch.ts`:** porte `prototype/scripts/touch.js` com tipos e o mesmo comportamento.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test -- timer touch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/timer.ts app/src/core/touch.ts app/tests/unit/timer.test.ts app/tests/unit/touch.test.ts
git commit -m "feat(app): timer com horário do evento e armar com dois polegares" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 4: Coach, Centro, formatação e gráficos

**Files:**
- Create: `app/src/core/coach.ts`, `app/src/ui/centro.ts`, `app/src/ui/format.ts`, `app/src/ui/charts.ts`, `app/src/ui/sound.ts`
- Test: `app/tests/unit/coach.test.ts`, `app/tests/unit/centro.test.ts`, `app/tests/unit/format.test.ts`, `app/tests/unit/charts.test.ts`, `app/tests/unit/sound.test.ts`

**Interfaces:**
- Consumes: `Solve`, `EventId` (Task 2); `T` e `MILESTONE_INFO` (Task 1).
- Produces:

```ts
// core/coach.ts — mesma API de prototype/scripts/coach.js, com o rótulo da média oficial:
export interface CoachMessage { id: string; text: string }
export function pickCoachMessage(o: {
  solve: Solve; history: Solve[]; sessionSolves: Solve[]; newMilestones?: string[]; achievedCount?: number;
  dailyGoal?: number; silent?: boolean; event: EventId;
}): CoachMessage | null;

// ui/centro.ts — mesma API de prototype/scripts/centro.js (renderCentro, updateCentro, ringFor, eyesFor, paletteFor, RING_ORDER, PALETTES, FINISHES)
// ui/format.ts — mesma API de prototype/scripts/ui/format.js
// ui/charts.ts — mesma API de prototype/scripts/ui/charts.js (evolutionChart, histogramBins)
// ui/sound.ts — mesma API de prototype/scripts/sound.js (createSound)
```

- [ ] **Step 1: Portar os testes**

- Porte para TypeScript e Vitest, sem mudar os casos:
  - `prototype/tests/coach.test.js` → `coach.test.ts`;
  - `centro.test.js` → `centro.test.ts`;
  - `format.test.js` → `format.test.ts`;
  - `charts.test.js` → `charts.test.ts`;
  - `sound.test.js` → `sound.test.ts`.
- Nos testes do coach, todas as chamadas ganham `event: '333'`.
- Acrescente em `coach.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickCoachMessage } from '../../src/core/coach';
import type { Solve } from '../../src/core/types';

let n = 0;
const sv = (ms: number, event: Solve['event'] = '666'): Solve => ({
  id: String(++n), sessionId: 's', event, ms, penalty: null, at: Date.now() - 1000 + n, scramble: '', note: '', createdAt: n, updatedAt: n, deletedAt: null,
});

describe('coach com a média oficial do evento', () => {
  it('no 6×6 o recorde de média fala em média de 3', () => {
    const history = [sv(200000), sv(210000), sv(205000), sv(190000), sv(195000)];
    const session = history.slice();
    const solve = sv(150000);
    const msg = pickCoachMessage({ solve, history, sessionSolves: session, event: '666' });
    expect(msg?.text).toMatch(/média de 3/);
  });
});
```

O teste do recorde de média depende da prioridade do coach (o recorde de single vem antes). Se um single recorde e a média de 3 empatarem na mesma jogada, o recorde de single tem prioridade, como no protótipo. Monte o histórico deste teste com um single melhor no passado para que só a média de 3 seja recorde: use `sv(140000)` como primeiro item do histórico.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- coach centro format charts sound`
Expected: FAIL, com os módulos inexistentes.

- [ ] **Step 3: Implementar**

- Porte cada módulo do protótipo para TypeScript, com o mesmo comportamento:
  - `prototype/scripts/coach.js`;
  - `prototype/scripts/centro.js`;
  - `prototype/scripts/ui/format.js`;
  - `prototype/scripts/ui/charts.js`;
  - `prototype/scripts/sound.js`.
- **Coach:**
  - a mensagem de recorde de média usa `officialAverage` e `officialAverageLabel(event)`, e o texto sai de `T.coach.pbAverage(n, value)`, que já recebe `n`;
  - a consistência (5 solves dentro de 3 s) e o cansaço continuam pela sessão;
  - os marcos só chegam quando quem chama passa `newMilestones`, e a interface só passa marcos do 3×3.
- **Centro (`ui/centro.ts`):** gera a string SVG e atualiza um `SVGElement`. Pode usar tipos do DOM, porque fica em `ui/`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test -- coach centro format charts sound`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/coach.ts app/src/ui/centro.ts app/src/ui/format.ts app/src/ui/charts.ts app/src/ui/sound.ts app/tests/unit
git commit -m "feat(app): coach com média oficial do evento, Centro, formatação, gráficos e sons" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---
### Task 5: Banco IndexedDB, ids e repositório

**Files:**
- Create: `app/src/data/ids.ts`, `app/src/data/db.ts`, `app/src/data/repository.ts`
- Test: `app/tests/unit/ids.test.ts`, `app/tests/unit/repository.test.ts`

**Interfaces:**
- Consumes: `Solve`, `Session`, `Profile`, `Meta`, `EventId`, `Penalty` e `DEFAULT_SETTINGS` (Task 2).
- Produces:

```ts
// data/ids.ts
export function newId(now?: number, rand?: () => number): string; // 17 caracteres, ordenável por tempo e, no mesmo ms, por ordem de criação

// data/db.ts
export const DB_NAME = 'klick';
export const DB_VERSION = 1;
export interface BackupRecord { id: string; createdAt: number; reason: 'auto50' | 'daily' | 'manual' | 'pre-restore'; solveCount: number; encoding: 'gzip-base64' | 'json'; payload: string }
export function openKlickDb(name?: string): Promise<IDBPDatabase<KlickDB>>;
// stores: solves (keyPath 'id'; índices bySession ['sessionId','at'] e byEvent ['event','at']),
//         sessions (keyPath 'id'), profile (chave fixa 'current'), meta (chaves 'current' e 'folderHandle'),
//         backups (keyPath 'id'; índice byCreated 'createdAt')

// data/repository.ts
export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'all';
export interface ChannelLike { postMessage(data: unknown): void; onmessage: ((ev: { data: unknown }) => void) | null; close?(): void }
export interface NewSolve { sessionId: string; event: EventId; ms: number; penalty: Penalty; at: number; scramble: string }
export interface KlickExport { format: 'klick'; version: 1; exportedAt: number; sessions: Session[]; solves: Solve[]; profile: Profile | null }
export interface ImportReport { sessionsAdded: number; solvesAdded: number; solvesUpdated: number; skipped: number }
export interface Repository {
  listSessions(o?: { includeDeleted?: boolean }): Promise<Session[]>;          // ordenadas por order
  createSession(o: { event: EventId; name?: string }): Promise<Session>;      // nome padrão "Sessão N" por evento
  renameSession(id: string, name: string): Promise<void>;                     // ignora nome vazio
  deleteSession(id: string): Promise<void>;                                   // marca a sessão e os solves dela
  restoreSession(id: string): Promise<void>;                                  // restaura a sessão e os solves excluídos junto
  listSolves(f?: { sessionId?: string; event?: EventId; includeDeleted?: boolean }): Promise<Solve[]>; // ordem crescente de at
  addSolve(s: NewSolve): Promise<Solve>;                                      // transação com durability 'strict'
  updateSolve(id: string, patch: { penalty?: Penalty; note?: string }): Promise<Solve>;
  deleteSolve(id: string): Promise<void>;
  restoreSolve(id: string): Promise<void>;
  listTrash(): Promise<{ sessions: Session[]; solves: Solve[] }>;
  purgeTrash(olderThanMs: number): Promise<number>;                          // apaga de vez o que foi excluído antes de now - olderThanMs
  getProfile(): Promise<Profile>;                                             // padrão se ausente
  saveProfile(patch: Partial<Profile>): Promise<Profile>;                     // settings faz merge raso, sound faz merge
  getMeta(): Promise<Meta>;                                                   // padrão se ausente (deviceId novo)
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  getFolderHandle(): Promise<unknown | null>;
  saveFolderHandle(h: unknown | null): Promise<void>;
  saveBackup(r: BackupRecord): Promise<void>;
  listBackups(): Promise<BackupRecord[]>;                                     // mais recente primeiro
  getBackup(id: string): Promise<BackupRecord | undefined>;
  deleteBackup(id: string): Promise<void>;
  exportAll(o?: { includeDeleted?: boolean }): Promise<KlickExport>;         // includeDeleted padrão true
  importAll(data: KlickExport): Promise<ImportReport>;                        // junta por id; fica o de updatedAt maior
  replaceAll(data: KlickExport): Promise<void>;                               // limpa solves, sessões e perfil e grava os do arquivo
  onChange(fn: (kind: ChangeKind) => void): () => void;                       // mudanças locais e de outras abas
}
export function createRepository(db: IDBPDatabase<KlickDB>, o?: { now?: () => number; channel?: ChannelLike | null }): Repository;
```

- [ ] **Step 1: Escrever os testes**

`app/tests/unit/ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newId } from '../../src/data/ids';

describe('newId', () => {
  it('tem 17 caracteres e só letras minúsculas e dígitos', () => {
    expect(newId(1791500000000, () => 0.5)).toMatch(/^[0-9a-z]{17}$/);
  });
  it('ordena por tempo', () => {
    const a = newId(1000, () => 0.9);
    const b = newId(2000, () => 0.1);
    expect([b, a].sort()).toEqual([a, b]);
  });
  it('no mesmo milissegundo, ordena pela ordem de criação', () => {
    const ids = Array.from({ length: 50 }, () => newId(5000, () => Math.random()));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
  });
});
```

`app/tests/unit/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';

let dbn = 0;
let t = 1_791_500_000_000;
const now = () => t;

function bus() {
  const members: ChannelLike[] = [];
  const make = (): ChannelLike => {
    const ch: ChannelLike = {
      onmessage: null,
      postMessage(data) {
        for (const m of members) if (m !== ch) m.onmessage?.({ data });
      },
    };
    members.push(ch);
    return ch;
  };
  return { make };
}

async function fresh(channel: ChannelLike | null = null): Promise<Repository> {
  const db = await openKlickDb(`klick-test-${++dbn}`);
  return createRepository(db, { now, channel });
}

const ns = (sessionId: string, ms: number, at: number) => ({ sessionId, event: '333' as const, ms, penalty: null, at, scramble: "R U R'" });

describe('repositório', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = await fresh();
  });

  it('cria sessões com nome padrão numerado por evento', async () => {
    const a = await repo.createSession({ event: '333' });
    const b = await repo.createSession({ event: '333' });
    const c = await repo.createSession({ event: '222' });
    expect([a.name, b.name, c.name]).toEqual(['Sessão 1', 'Sessão 2', 'Sessão 1']);
    expect((await repo.listSessions()).map((s) => s.id)).toEqual([a.id, b.id, c.id]);
  });

  it('renomear ignora nome vazio', async () => {
    const s = await repo.createSession({ event: '333', name: 'Treino' });
    await repo.renameSession(s.id, '   ');
    expect((await repo.listSessions())[0].name).toBe('Treino');
    await repo.renameSession(s.id, ' Cruz ');
    expect((await repo.listSessions())[0].name).toBe('Cruz');
  });

  it('grava e lista solves por sessão e por evento, em ordem de data', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 60000, 3000));
    await repo.addSolve(ns(s.id, 58000, 1000));
    const list = await repo.listSolves({ sessionId: s.id });
    expect(list.map((x) => x.ms)).toEqual([58000, 60000]);
    expect(list[0]).toMatchObject({ note: '', penalty: null, deletedAt: null, createdAt: t, updatedAt: t });
    expect((await repo.listSolves({ event: '333' })).length).toBe(2);
    expect((await repo.listSolves({ event: '222' })).length).toBe(0);
  });

  it('atualiza penalidade e nota, mexendo em updatedAt', async () => {
    const s = await repo.createSession({ event: '333' });
    const solve = await repo.addSolve(ns(s.id, 60000, 1000));
    t += 5000;
    const up = await repo.updateSolve(solve.id, { penalty: '+2', note: 'cruz' });
    expect(up).toMatchObject({ penalty: '+2', note: 'cruz', updatedAt: t });
  });

  it('excluir vai para a lixeira, restaurar volta, e purgeTrash apaga depois do prazo', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    const b = await repo.addSolve(ns(s.id, 61000, 2000));
    await repo.deleteSolve(a.id);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.id)).toEqual([b.id]);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([a.id]);
    await repo.restoreSolve(a.id);
    expect((await repo.listSolves({ sessionId: s.id })).length).toBe(2);
    await repo.deleteSolve(a.id);
    t += 31 * 86_400_000;
    expect(await repo.purgeTrash(30 * 86_400_000)).toBe(1);
    expect((await repo.listSolves({ includeDeleted: true })).map((x) => x.id)).toEqual([b.id]);
  });

  it('excluir a sessão leva os solves dela; restaurar devolve os dois', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 60000, 1000));
    t += 1000;
    await repo.deleteSession(s.id);
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.listSolves({ sessionId: s.id })).toEqual([]);
    await repo.restoreSession(s.id);
    expect((await repo.listSessions()).length).toBe(1);
    expect((await repo.listSolves({ sessionId: s.id })).length).toBe(1);
  });

  it('perfil e meta têm padrão e fazem merge', async () => {
    const p = await repo.getProfile();
    expect(p).toMatchObject({ finish: 'fosco', onboarded: false, currentSessionId: null });
    expect(p.trail).toEqual([false, false, false, false, false, false, false, false, false]);
    const up = await repo.saveProfile({ settings: { ...p.settings, holdMs: 550 } });
    expect(up.settings.holdMs).toBe(550);
    expect(up.settings.inspection).toBe(true);
    const m = await repo.getMeta();
    expect(m).toMatchObject({ schemaVersion: 1, solvesSinceBackup: 0, solvesSinceExport: 0, v1ImportOffered: false });
    expect(m.deviceId).toMatch(/^[0-9a-z]{17}$/);
    expect((await repo.saveMeta({ solvesSinceExport: 3 })).solvesSinceExport).toBe(3);
    expect((await repo.getMeta()).deviceId).toBe(m.deviceId);
  });

  it('exporta, importa juntando sem duplicar e substitui tudo', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 60000, 1000));
    const data = await repo.exportAll();
    expect(data).toMatchObject({ format: 'klick', version: 1, exportedAt: t });
    const other = await fresh();
    expect(await other.importAll(data)).toEqual({ sessionsAdded: 1, solvesAdded: 1, solvesUpdated: 0, skipped: 0 });
    expect(await other.importAll(data)).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 1 });
    const edited = structuredClone(data);
    edited.solves[0].note = 'mais novo';
    edited.solves[0].updatedAt += 10;
    expect((await other.importAll(edited)).solvesUpdated).toBe(1);
    await other.replaceAll({ ...data, solves: [], sessions: [] });
    expect(await other.listSolves({ includeDeleted: true })).toEqual([]);
  });

  it('guarda e lista cópias, mais recente primeiro', async () => {
    const r = { id: 'b1', createdAt: 1, reason: 'manual' as const, solveCount: 0, encoding: 'json' as const, payload: '{}' };
    await repo.saveBackup(r);
    await repo.saveBackup({ ...r, id: 'b2', createdAt: 2 });
    expect((await repo.listBackups()).map((b) => b.id)).toEqual(['b2', 'b1']);
    await repo.deleteBackup('b1');
    expect((await repo.getBackup('b1'))).toBeUndefined();
  });

  it('avisa a outra aba quando um solve é gravado', async () => {
    const b = bus();
    const name = `klick-test-${++dbn}`;
    const tabA = createRepository(await openKlickDb(name), { now, channel: b.make() });
    const tabB = createRepository(await openKlickDb(name), { now, channel: b.make() });
    const seen: string[] = [];
    tabB.onChange((k) => seen.push(k));
    const s = await tabA.createSession({ event: '333' });
    await tabA.addSolve(ns(s.id, 60000, 1000));
    expect(seen).toEqual(['sessions', 'solves']);
    expect((await tabB.listSolves({ sessionId: s.id })).length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- ids repository`
Expected: FAIL, com os módulos inexistentes.

- [ ] **Step 3: Implementar**

**`data/ids.ts`:** guarde o último `now` e um contador em variáveis de módulo. Se `now` repetir, o contador soma 1; senão, volta a 0. O id é a concatenação de três partes, em base 36:
- `now.toString(36).padStart(9, '0')`;
- o contador com `padStart(2, '0')`;
- 6 caracteres aleatórios (`Math.floor(rand() * 36 ** 6)` com `padStart(6, '0')`).

**`data/db.ts`:** use `openDB` do `idb` com `upgrade(db, oldVersion)`. A partir de `oldVersion < 1`, crie as stores e índices da interface. O esquema fica descrito numa `interface KlickDB extends DBSchema`.

**`data/repository.ts`:**
- **Gravação:** toda escrita usa `db.transaction(stores, 'readwrite', { durability: 'strict' })` e só resolve depois de `tx.done`.
- **Avisos:** depois de cada escrita, chame os ouvintes locais e mande `{ kind }` pelo `channel`. O `channel.onmessage` repassa aos ouvintes locais.
- **Canal:** quando `channel` for omitido, use `new BroadcastChannel('klick-data')` se existir, e `null` caso contrário.
- **Nome padrão:** `Sessão N`, onde N = 1 + o maior número entre as sessões não excluídas do mesmo evento com nome `/^Sessão (\d+)$/`.
- **Ordem:** `order` = 1 + o maior `order` existente (0 para a primeira).
- **`deleteSession`:** grava o mesmo `deletedAt` na sessão e nos solves ainda não excluídos dela. `restoreSession` restaura a sessão e os solves com aquele mesmo `deletedAt`.
- **`importAll`:**
  - por id: o que não existe entra;
  - o que existe com `updatedAt` maior substitui e conta em `solvesUpdated`;
  - o resto conta em `skipped` (só solves contam em `skipped`; sessões existentes são ignoradas sem contar);
  - o perfil do arquivo só entra se ainda não houver perfil gravado.
- **`replaceAll`:** limpa `solves`, `sessions` e `profile` numa transação e grava o conteúdo.
- **Valores padrão:**
  - perfil: `{ settings: DEFAULT_SETTINGS, trail: Array(9).fill(false), finish: 'fosco', onboarded: false, currentSessionId: null }`;
  - meta: `schemaVersion: 1`, `deviceId: newId(now())`, contadores em 0, datas `null`, `v1ImportOffered: false`, `persistRequested: false`, `installGuideDismissed: false`. É gravada na primeira leitura.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test -- ids repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/ids.ts app/src/data/db.ts app/src/data/repository.ts app/tests/unit/ids.test.ts app/tests/unit/repository.test.ts
git commit -m "feat(app): banco IndexedDB com repositório, lixeira e aviso entre abas" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 6: Camadas de segurança dos dados

**Files:**
- Create: `app/src/data/safety.ts`, `app/src/data/folder.ts`
- Test: `app/tests/unit/safety.test.ts`, `app/tests/unit/folder.test.ts`

**Interfaces:**
- Consumes: `Repository`, `BackupRecord`, `KlickExport`, `NewSolve` (Task 5); `Meta`, `Solve` (Task 2); `dayKey` de `core/stats` (Task 2).
- Produces:

```ts
// data/safety.ts
export const BACKUP_EVERY = 50;
export const BACKUP_KEEP = 10;
export const EXPORT_REMIND_EVERY = 100;
export const FOLDER_SAVE_EVERY = 100;
export const TRASH_MS = 30 * 86_400_000;
export interface SafetyPlan { backup: 'auto50' | 'daily' | null; remindExport: boolean; folderSave: boolean }
export function countSolveSaved(meta: Meta): Meta;                                   // soma 1 nos três contadores
export function planAfterSolve(meta: Meta, folderConfigured: boolean): SafetyPlan;   // meta já contada
export function planOnOpen(meta: Meta, now: number, folderConfigured: boolean): SafetyPlan;
export function encodeSnapshot(data: KlickExport): Promise<{ encoding: 'gzip-base64' | 'json'; payload: string }>;
export function decodeSnapshot(r: { encoding: 'gzip-base64' | 'json'; payload: string }): Promise<KlickExport>;
export function createBackup(repo: Repository, reason: BackupRecord['reason'], now: number): Promise<BackupRecord>; // grava, poda para BACKUP_KEEP e zera o contador de cópia no meta
export function restoreBackup(repo: Repository, id: string, now: number): Promise<void>; // antes, cria uma cópia 'pre-restore'
export type PersistResult = 'granted' | 'denied' | 'unsupported';
export interface StorageLike { persist?(): Promise<boolean>; persisted?(): Promise<boolean>; estimate?(): Promise<{ usage?: number; quota?: number }> }
export function requestPersistence(storage?: StorageLike | null): Promise<PersistResult>;
export function storageStatus(storage?: StorageLike | null): Promise<{ persisted: boolean | null; usage: number | null; quota: number | null }>;
export interface SaveQueue { enqueue(s: NewSolve): Promise<Solve | null>; pending(): number; flush(): Promise<void> }
export function createSaveQueue(save: (s: NewSolve) => Promise<Solve>, o?: {
  retryMs?: number; onChange?: (pending: number) => void; onSaved?: (s: Solve) => void;
  schedule?: (fn: () => void, ms: number) => () => void;
}): SaveQueue;

// data/folder.ts
export interface DirHandleLike {
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, o: { create: true }): Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }>;
}
export function folderSupported(win?: { showDirectoryPicker?: unknown }): boolean;
export function pickFolder(win?: { showDirectoryPicker?: () => Promise<DirHandleLike> }): Promise<DirHandleLike | null>; // null se a pessoa cancelar
export function saveToFolder(handle: DirHandleLike, name: string, text: string, o?: { ask?: boolean }): Promise<boolean>;  // false sem permissão
export function backupFileName(now: number): string; // 'klick-AAAA-MM-DD-HHmm.json' no horário local
```

- [ ] **Step 1: Escrever os testes**

`app/tests/unit/safety.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import {
  BACKUP_KEEP, countSolveSaved, createBackup, createSaveQueue, decodeSnapshot, encodeSnapshot,
  planAfterSolve, planOnOpen, requestPersistence, restoreBackup, storageStatus,
} from '../../src/data/safety';
import type { Meta } from '../../src/core/types';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const meta = (p: Partial<Meta> = {}): Meta => ({
  schemaVersion: 1, deviceId: 'x', lastBackupAt: null, solvesSinceBackup: 0, lastBackupDay: null,
  lastExportAt: null, solvesSinceExport: 0, lastFolderSaveAt: null, solvesSinceFolderSave: 0,
  lastFolderSaveDay: null, v1ImportOffered: false, persistRequested: false, installGuideDismissed: false, ...p,
});

describe('decisões depois de um solve', () => {
  it('conta o solve nos três contadores', () => {
    expect(countSolveSaved(meta({ solvesSinceBackup: 4, solvesSinceExport: 9, solvesSinceFolderSave: 1 })))
      .toMatchObject({ solvesSinceBackup: 5, solvesSinceExport: 10, solvesSinceFolderSave: 2 });
  });
  it('cópia a cada 50, lembrete a cada 100 e pasta a cada 100 se configurada', () => {
    expect(planAfterSolve(meta({ solvesSinceBackup: 49 }), false).backup).toBeNull();
    expect(planAfterSolve(meta({ solvesSinceBackup: 50 }), false).backup).toBe('auto50');
    expect(planAfterSolve(meta({ solvesSinceExport: 100 }), false).remindExport).toBe(true);
    expect(planAfterSolve(meta({ solvesSinceExport: 150 }), false).remindExport).toBe(false);
    expect(planAfterSolve(meta({ solvesSinceExport: 200 }), false).remindExport).toBe(true);
    expect(planAfterSolve(meta({ solvesSinceFolderSave: 100 }), true).folderSave).toBe(true);
    expect(planAfterSolve(meta({ solvesSinceFolderSave: 100 }), false).folderSave).toBe(false);
  });
  it('ao abrir num dia novo com solves novos, faz a cópia do dia e salva na pasta', () => {
    expect(planOnOpen(meta({ solvesSinceBackup: 3, lastBackupDay: '2020-01-01' }), t, false).backup).toBe('daily');
    expect(planOnOpen(meta({ solvesSinceBackup: 0, lastBackupDay: '2020-01-01' }), t, false).backup).toBeNull();
    expect(planOnOpen(meta({ solvesSinceFolderSave: 2, lastFolderSaveDay: '2020-01-01' }), t, true).folderSave).toBe(true);
    expect(planOnOpen(meta({ solvesSinceFolderSave: 2, lastFolderSaveDay: '2020-01-01' }), t, false).folderSave).toBe(false);
  });
  it('no mesmo dia da última cópia não faz outra cópia do dia', () => {
    const d = new Date(t);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(planOnOpen(meta({ solvesSinceBackup: 3, lastBackupDay: local }), t, false).backup).toBeNull();
  });
});

describe('cópias automáticas', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = createRepository(await openKlickDb(`safety-${++n}`), { now, channel: null });
  });

  it('codifica e decodifica a cópia sem perda', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve({ sessionId: s.id, event: '333', ms: 61234, penalty: '+2', at: 5, scramble: 'R U' });
    const data = await repo.exportAll();
    const enc = await encodeSnapshot(data);
    expect(await decodeSnapshot(enc)).toEqual(data);
  });

  it('cria cópias, poda para as 10 últimas e zera o contador', async () => {
    await repo.saveMeta({ solvesSinceBackup: 50 });
    for (let i = 0; i < BACKUP_KEEP + 2; i++) {
      t += 1000;
      await createBackup(repo, 'auto50', t);
    }
    const list = await repo.listBackups();
    expect(list).toHaveLength(BACKUP_KEEP);
    expect(list[0].createdAt).toBe(t);
    const m = await repo.getMeta();
    expect(m).toMatchObject({ solvesSinceBackup: 0, lastBackupAt: t });
    expect(m.lastBackupDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('restaurar volta o estado da cópia e guarda o atual antes', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve({ sessionId: s.id, event: '333', ms: 60000, penalty: null, at: 1, scramble: '' });
    const b = await createBackup(repo, 'manual', t);
    await repo.addSolve({ sessionId: s.id, event: '333', ms: 70000, penalty: null, at: 2, scramble: '' });
    t += 1000;
    await restoreBackup(repo, b.id, t);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.ms)).toEqual([60000]);
    expect((await repo.listBackups()).some((r) => r.reason === 'pre-restore')).toBe(true);
  });
});

describe('armazenamento persistente', () => {
  it('pede persistência e informa o resultado', async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe('granted');
    expect(await requestPersistence({ persist: async () => false })).toBe('denied');
    expect(await requestPersistence(null)).toBe('unsupported');
  });
  it('lê o estado e o espaço em uso', async () => {
    expect(await storageStatus({ persisted: async () => true, estimate: async () => ({ usage: 10, quota: 100 }) }))
      .toEqual({ persisted: true, usage: 10, quota: 100 });
    expect(await storageStatus(null)).toEqual({ persisted: null, usage: null, quota: null });
  });
});

describe('fila de gravação', () => {
  it('quando gravar falha, guarda o solve, avisa e grava na nova tentativa', async () => {
    let fails = 2;
    const saved: number[] = [];
    let pendingSeen: number[] = [];
    let scheduled: (() => void) | null = null;
    const q = createSaveQueue(
      async (s) => {
        if (fails-- > 0) throw new Error('quota');
        saved.push(s.ms);
        return { ...s, id: 'i' + s.ms, note: '', createdAt: 0, updatedAt: 0, deletedAt: null };
      },
      { onChange: (p) => pendingSeen.push(p), schedule: (fn) => { scheduled = fn; return () => { scheduled = null; }; } },
    );
    const r = await q.enqueue({ sessionId: 's', event: '333', ms: 1, penalty: null, at: 1, scramble: '' });
    expect(r).toBeNull();
    expect(q.pending()).toBe(1);
    expect(pendingSeen).toEqual([1]);
    await q.enqueue({ sessionId: 's', event: '333', ms: 2, penalty: null, at: 2, scramble: '' });
    expect(q.pending()).toBe(2);
    scheduled!();
    await q.flush();
    expect(saved).toEqual([1, 2]);
    expect(q.pending()).toBe(0);
    expect(pendingSeen.at(-1)).toBe(0);
  });
});
```

`app/tests/unit/folder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { backupFileName, folderSupported, pickFolder, saveToFolder, type DirHandleLike } from '../../src/data/folder';

function fakeDir(permission: PermissionState = 'granted', grant: PermissionState = 'granted') {
  const files: Record<string, string> = {};
  const h: DirHandleLike = {
    queryPermission: async () => permission,
    requestPermission: async () => grant,
    getFileHandle: async (name) => ({
      createWritable: async () => {
        let buf = '';
        return { write: async (d: string) => { buf += d; }, close: async () => { files[name] = buf; } };
      },
    }),
  };
  return { h, files };
}

describe('pasta de cópias', () => {
  it('detecta suporte', () => {
    expect(folderSupported({ showDirectoryPicker: () => null })).toBe(true);
    expect(folderSupported({})).toBe(false);
  });
  it('escolher a pasta devolve null quando a pessoa cancela', async () => {
    const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' });
    expect(await pickFolder({ showDirectoryPicker: async () => { throw abort; } })).toBeNull();
  });
  it('salva o arquivo com permissão', async () => {
    const { h, files } = fakeDir();
    expect(await saveToFolder(h, 'a.json', '{"x":1}')).toBe(true);
    expect(files['a.json']).toBe('{"x":1}');
  });
  it('sem permissão e sem pedir, não salva', async () => {
    const { h, files } = fakeDir('prompt', 'denied');
    expect(await saveToFolder(h, 'a.json', '{}')).toBe(false);
    expect(files).toEqual({});
  });
  it('nome do arquivo com data e hora local', () => {
    const ts = new Date(2026, 9, 9, 7, 5).getTime();
    expect(backupFileName(ts)).toBe('klick-2026-10-09-0705.json');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- safety folder`
Expected: FAIL, com os módulos inexistentes.

- [ ] **Step 3: Implementar**

**`planOnOpen`:** compara `dayKey(now)` (a mesma `dayKey` de `core/stats`, que usa a data local) com `lastBackupDay` e `lastFolderSaveDay`:
- `backup` é `'daily'` se `solvesSinceBackup > 0` e o dia mudou;
- `folderSave` é `true` se a pasta está configurada, `solvesSinceFolderSave > 0` e o dia mudou;
- `remindExport` é sempre `false`.

**`planAfterSolve`:**
- `backup` é `'auto50'` se `solvesSinceBackup >= BACKUP_EVERY`;
- `remindExport` é `solvesSinceExport > 0 && solvesSinceExport % EXPORT_REMIND_EVERY === 0`;
- `folderSave` é `folderConfigured && solvesSinceFolderSave >= FOLDER_SAVE_EVERY`.

**`encodeSnapshot`:** se houver `CompressionStream`, comprima `JSON.stringify(data)` com gzip e devolva em base64 (`encoding: 'gzip-base64'`). Senão, devolva o JSON puro (`encoding: 'json'`). `decodeSnapshot` faz o caminho inverso.

**`createBackup`:**
1. `repo.exportAll()`;
2. codifica;
3. grava `{ id: newId(now), createdAt: now, reason, solveCount, encoding, payload }`;
4. apaga as mais antigas além de `BACKUP_KEEP`;
5. `saveMeta({ solvesSinceBackup: 0, lastBackupAt: now, lastBackupDay: dayKey(now) })`.

**`restoreBackup`:** `createBackup(repo, 'pre-restore', now)`, depois `repo.replaceAll(await decodeSnapshot(rec))`. Lança erro se o id não existir.

**`requestPersistence`:**
- sem `storage` ou sem `persist`, devolve `'unsupported'`;
- senão, `persist()` dá `'granted'` ou `'denied'`;
- o padrão de `storage` é `globalThis.navigator?.storage ?? null`.

**`createSaveQueue`:**
- mantém uma lista `pending` na ordem de chegada;
- `enqueue` adiciona e chama `drain()`, que tenta gravar cada pendente em ordem;
- se uma gravação falhar: para, avisa `onChange(pending.length)`, agenda nova tentativa com `schedule(drain, retryMs = 3000)` (padrão: `setTimeout`) e faz `enqueue` resolver com `null`;
- a cada sucesso, chama `onSaved(solve)`, e quando a fila esvazia, `onChange(0)` (só se antes houve pendência);
- `enqueue` resolve com o solve gravado se ele foi gravado nessa chamada;
- `flush()` aguarda a drenagem em andamento.

**`folder.ts`:**
- `pickFolder` chama `showDirectoryPicker({ mode: 'readwrite' })` e devolve `null` em `AbortError`.
- `saveToFolder`:
  1. consulta `queryPermission`;
  2. se não for `'granted'` e `ask` for verdadeiro, chama `requestPermission`;
  3. sem permissão, devolve `false`;
  4. com permissão, grava pelo `createWritable`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test -- safety folder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/safety.ts app/src/data/folder.ts app/tests/unit/safety.test.ts app/tests/unit/folder.test.ts
git commit -m "feat(app): cópias automáticas, armazenamento persistente, fila de gravação e pasta de cópias" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---
### Task 7: Exportar, importar e migrar da v1

**Files:**
- Create: `app/src/data/transfer.ts`, `app/tests/fixtures/cstimer-export.txt`, `app/tests/fixtures/v1-klick-sessions.json`
- Test: `app/tests/unit/transfer.test.ts`

**Interfaces:**
- Consumes: `KlickExport` (Task 5); `Session`, `Solve`, `EventId`, `Penalty` (Task 2); `eventInfo`, `eventFromCsTimer` (Task 2).
- Produces:

```ts
// data/transfer.ts
export function toKlickJson(data: KlickExport): string;                      // JSON com 2 espaços
export function parseKlickJson(text: string): KlickExport;                   // lança Error('Arquivo do Klick inválido.') se não bater
export function toCsTimerJson(sessions: Session[], solves: Solve[]): string; // só os não excluídos
export interface CsTimerSolve { ms: number; penalty: Penalty; scramble: string; note: string; at: number }
export interface CsTimerSession { key: string; name: string; scrType: string | undefined; event: EventId | null; solves: CsTimerSolve[] }
export function parseCsTimer(text: string): CsTimerSession[];                // lança Error('Arquivo do csTimer inválido.')
export interface ImportResult { sessions: Session[]; solves: Solve[]; duplicates: number; skippedSessions: number }
export function csTimerToKlick(parsed: CsTimerSession[], mapping: Record<string, EventId | undefined>,
  ctx: { now: number; newId: () => string; existingSessions: Session[]; existingSolves: Solve[] }): ImportResult;
export const V1_KEY = 'klick-sessions';
export interface V1Solve { id: string; timeMs: number; penalty: 'NONE' | '+2' | 'DNF'; scramble: string; createdAt: string; updatedAt?: string }
export interface V1Session { id: string; name: string; puzzleType: string; solves: V1Solve[]; createdAt?: string }
export function readV1(storage: Pick<Storage, 'getItem'> | null): V1Session[] | null;  // null se ausente, inválido ou sem solves
export function v1ToKlick(v1: V1Session[], ctx: { now: number; existingSessions: Session[]; existingSolves: Solve[] }): ImportResult;
```

- [ ] **Step 1: Criar os arquivos de exemplo**

`app/tests/fixtures/cstimer-export.txt` (uma linha):

```json
{"session1":[[[0,61234],"R U R' U'","",1791400000],[[2000,58000],"F R U","cruz",1791400100],[[-1,70000],"L D","",1791400200]],"session2":[[[0,8123],"R U2 R'","",1791400300]],"session3":[[[0,1500],"R U R' U R U2 R'","",1791400400]],"properties":{"sessionData":"{\"1\":{\"name\":\"Main\",\"opt\":{},\"rank\":1},\"2\":{\"name\":\"2x2\",\"opt\":{\"scrType\":\"222so\"},\"rank\":2},\"3\":{\"name\":\"ZBLL\",\"opt\":{\"scrType\":\"zbll\"},\"rank\":3}}","sessionN":3}}
```

`app/tests/fixtures/v1-klick-sessions.json`:

```json
{"state":{"sessions":[{"id":"3f2a1c4e-8b7d-4e6f-9a1b-2c3d4e5f6a7b","name":"Sessão 1","puzzleType":"3x3","solves":[{"id":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d","timeMs":45210,"penalty":"NONE","effectiveMs":45210,"scramble":"R U R' U' F2","createdAt":"2026-03-10T14:00:00.000Z"},{"id":"b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e","timeMs":50000,"penalty":"+2","effectiveMs":52000,"scramble":"L D2 B","createdAt":"2026-03-10T14:05:00.000Z","updatedAt":"2026-03-10T14:06:00.000Z"},{"id":"c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f","timeMs":61000,"penalty":"DNF","effectiveMs":null,"scramble":"U F R","createdAt":"2026-03-11T09:00:00.000Z"}],"createdAt":"2026-03-10T13:00:00.000Z"},{"id":"4a5b6c7d-8e9f-4a0b-1c2d-3e4f5a6b7c8d","name":"Pyra","puzzleType":"pyraminx","solves":[{"id":"d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80","timeMs":9800,"penalty":"NONE","effectiveMs":9800,"scramble":"L R' B U","createdAt":"2026-03-12T20:00:00.000Z"}]}],"activeSessionId":"3f2a1c4e-8b7d-4e6f-9a1b-2c3d4e5f6a7b"},"version":0}
```

- [ ] **Step 2: Escrever os testes**

`app/tests/unit/transfer.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  csTimerToKlick, parseCsTimer, parseKlickJson, readV1, toCsTimerJson, toKlickJson, v1ToKlick, V1_KEY,
} from '../../src/data/transfer';
import type { Session, Solve } from '../../src/core/types';
import type { KlickExport } from '../../src/data/repository';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
let seq = 0;
const ctx = (existingSessions: Session[] = [], existingSolves: Solve[] = []) => ({
  now: 1_791_500_000_000, newId: () => `id${String(++seq).padStart(15, '0')}`, existingSessions, existingSolves,
});

describe('formato Klick', () => {
  it('ida e volta sem perda', () => {
    const data: KlickExport = { format: 'klick', version: 1, exportedAt: 1, sessions: [], solves: [], profile: null };
    expect(parseKlickJson(toKlickJson(data))).toEqual(data);
  });
  it('arquivo errado dá erro claro', () => {
    expect(() => parseKlickJson('{"format":"outro"}')).toThrow('Arquivo do Klick inválido.');
    expect(() => parseKlickJson('não é json')).toThrow('Arquivo do Klick inválido.');
  });
});

describe('csTimer', () => {
  it('lê sessões, eventos, penalidades, notas e datas', () => {
    const s = parseCsTimer(fixture('cstimer-export.txt'));
    expect(s.map((x) => [x.key, x.name, x.event])).toEqual([
      ['session1', 'Main', '333'], ['session2', '2x2', '222'], ['session3', 'ZBLL', null],
    ]);
    expect(s[0].solves).toEqual([
      { ms: 61234, penalty: null, scramble: "R U R' U'", note: '', at: 1791400000000 },
      { ms: 58000, penalty: '+2', scramble: 'F R U', note: 'cruz', at: 1791400100000 },
      { ms: 70000, penalty: 'DNF', scramble: 'L D', note: '', at: 1791400200000 },
    ]);
  });
  it('arquivo errado dá erro claro', () => {
    expect(() => parseCsTimer('{}')).toThrow('Arquivo do csTimer inválido.');
  });
  it('converte com o mapeamento; sessão sem evento e sem mapeamento fica de fora', () => {
    const parsed = parseCsTimer(fixture('cstimer-export.txt'));
    const r = csTimerToKlick(parsed, {}, ctx());
    expect(r.sessions.map((x) => [x.name, x.event])).toEqual([['Main', '333'], ['2x2', '222']]);
    expect(r.solves).toHaveLength(4);
    expect(r.skippedSessions).toBe(1);
    const mapped = csTimerToKlick(parsed, { session3: '333' }, ctx());
    expect(mapped.sessions).toHaveLength(3);
    expect(mapped.skippedSessions).toBe(0);
  });
  it('importar o mesmo arquivo duas vezes não duplica', () => {
    const parsed = parseCsTimer(fixture('cstimer-export.txt'));
    const first = csTimerToKlick(parsed, {}, ctx());
    const second = csTimerToKlick(parsed, {}, ctx(first.sessions, first.solves));
    expect(second.solves).toHaveLength(0);
    expect(second.duplicates).toBe(4);
  });
  it('exporta no formato do csTimer e lê de volta', () => {
    const parsed = parseCsTimer(fixture('cstimer-export.txt'));
    const r = csTimerToKlick(parsed, { session3: '333' }, ctx());
    const again = parseCsTimer(toCsTimerJson(r.sessions, r.solves));
    expect(again.map((x) => [x.name, x.event])).toEqual([['Main', '333'], ['2x2', '222'], ['ZBLL', '333']]);
    expect(again[0].solves).toEqual(parsed[0].solves);
  });
});

describe('migração da v1', () => {
  const storage = (value: string | null) => ({ getItem: (k: string) => (k === V1_KEY ? value : null) });

  it('lê as sessões da v1', () => {
    const v1 = readV1(storage(fixture('v1-klick-sessions.json')));
    expect(v1?.map((s) => [s.name, s.puzzleType, s.solves.length])).toEqual([['Sessão 1', '3x3', 3], ['Pyra', 'pyraminx', 1]]);
  });
  it('ausente, inválido ou vazio devolve null', () => {
    expect(readV1(storage(null))).toBeNull();
    expect(readV1(storage('{oops'))).toBeNull();
    expect(readV1(storage('{"state":{"sessions":[]}}'))).toBeNull();
    expect(readV1(null)).toBeNull();
  });
  it('converte eventos, penalidades e datas, mantendo os ids', () => {
    const v1 = readV1(storage(fixture('v1-klick-sessions.json')))!;
    const r = v1ToKlick(v1, ctx());
    expect(r.sessions.map((s) => [s.id, s.name, s.event])).toEqual([
      ['3f2a1c4e-8b7d-4e6f-9a1b-2c3d4e5f6a7b', 'Sessão 1', '333'],
      ['4a5b6c7d-8e9f-4a0b-1c2d-3e4f5a6b7c8d', 'Pyra', 'pyram'],
    ]);
    expect(r.solves.map((s) => [s.ms, s.penalty, s.at])).toEqual([
      [45210, null, Date.parse('2026-03-10T14:00:00.000Z')],
      [50000, '+2', Date.parse('2026-03-10T14:05:00.000Z')],
      [61000, 'DNF', Date.parse('2026-03-11T09:00:00.000Z')],
      [9800, null, Date.parse('2026-03-12T20:00:00.000Z')],
    ]);
    expect(r.solves[1].updatedAt).toBe(Date.parse('2026-03-10T14:06:00.000Z'));
  });
  it('migrar duas vezes não duplica', () => {
    const v1 = readV1(storage(fixture('v1-klick-sessions.json')))!;
    const first = v1ToKlick(v1, ctx());
    const second = v1ToKlick(v1, ctx(first.sessions, first.solves));
    expect(second.solves).toHaveLength(0);
    expect(second.sessions).toHaveLength(0);
    expect(second.duplicates).toBe(4);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd app && pnpm test -- transfer`
Expected: FAIL, com o módulo inexistente.

- [ ] **Step 4: Implementar**

**`parseKlickJson`:** exige `format === 'klick'`, `version === 1` e arrays em `sessions` e `solves`. Qualquer falha lança `Error('Arquivo do Klick inválido.')`.

**`parseCsTimer`:**
- Lê o objeto e as chaves `/^session\d+$/` em ordem numérica.
- `properties.sessionData` pode vir como string JSON ou como objeto. Para a sessão N, usa `name` (padrão `Sessão N`) e `opt.scrType`.
- Cada item é `[[pen, ms], scramble, comment, seconds]`:
  - `pen` 0 vira `null`, 2000 vira `'+2'` e -1 vira `'DNF'`;
  - `at` é `seconds * 1000`;
  - `note` é o `comment`, ou `''`.
- `event` vem de `eventFromCsTimer(scrType)`.
- Sem nenhuma chave `sessionN`, lança `Error('Arquivo do csTimer inválido.')`.

**`csTimerToKlick`:**
- **Evento:** é `parsed.event ?? mapping[parsed.key]`. Sem evento, a sessão fica de fora e conta em `skippedSessions`.
- **Sessões:** cada uma vira uma nova sessão com `id: newId()`, o `name` do csTimer, `order` crescente depois do maior existente e as datas de `now`.
- **Duplicado:** o solve já existe quando há um solve existente com o mesmo `at` e o mesmo `ms`. Esse conta em `duplicates` e não entra.
- **Sessões sem nada novo:** uma sessão cujos solves são todos duplicados não é criada.

**`toCsTimerJson`:**
- Cada sessão não excluída, em ordem, vira `sessionN` (a partir de 1), com os seus solves não excluídos em ordem de `at`, no formato `[[pen, ms], scramble, note, Math.floor(at / 1000)]`.
- `properties.sessionData` é uma string JSON de `{ N: { name, opt: { scrType: eventInfo(event).csTimer }, rank: N } }`, e `properties.sessionN` é a quantidade de sessões.

**`readV1`:**
- `JSON.parse` em `storage.getItem(V1_KEY)`, pegando `state.sessions`.
- Devolve `null` se a chave estiver ausente, se o parse falhar ou se não houver nenhum solve.

**`v1ToKlick`:**
- **Mapa de eventos:** `{ '3x3': '333', '2x2': '222', '4x4': '444', '5x5': '555', pyraminx: 'pyram', megaminx: 'minx', skewb: 'skewb', square1: 'sq1' }`. Um `puzzleType` fora do mapa conta em `skippedSessions`.
- **Ids:** mantém os ids da v1, tanto de sessão quanto de solve.
- **Sessão já existente:** pelo id, não é recriada, mas os solves novos dela entram.
- **Solve já existente:** pelo id, conta em `duplicates`.
- **Datas:** `at` e `createdAt` vêm de `Date.parse(createdAt)`, e `updatedAt` de `Date.parse(updatedAt ?? createdAt)`.
- **Penalidade:** `'NONE'` vira `null`.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd app && pnpm test -- transfer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/data/transfer.ts app/tests/fixtures app/tests/unit/transfer.test.ts
git commit -m "feat(app): exportar e importar no formato Klick e no csTimer, e migrar da v1" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 8: Embaralhamentos do cubing.js e imagem 2D

**Files:**
- Create: `app/scripts/build-cubing.mjs` (substitui o provisório da Task 1), `app/scripts/cubing-entry.js`, `app/src/scramble/cubing-loader.ts`, `app/src/scramble/queue.ts`, `app/src/ui/timer/ScrambleImage.svelte`
- Test: `app/tests/unit/scramble-queue.test.ts`, `app/tests/unit/scramble-image.test.ts`

**Interfaces:**
- Consumes: `EventId`, `eventInfo` (Task 2).
- Produces:

```ts
// scramble/cubing-loader.ts
export interface CubingModule {
  randomScrambleForEvent(eventId: string): Promise<{ toString(): string }>;
  TwistyPlayer: new (config: Record<string, unknown>) => HTMLElement;
}
export function loadCubing(): Promise<CubingModule>;                // import em runtime de /vendor/cubing/cubing.js, com cache
export function generateScramble(event: EventId): Promise<string>;  // usa eventInfo(event).scrambleId

// scramble/queue.ts
export interface ScrambleQueue {
  next(event: EventId): Promise<string>;  // devolve o próximo pronto (ou espera gerar) e repõe a fila
  prefetch(event: EventId): void;         // enche a fila sem consumir
  ready(event: EventId): number;          // quantos prontos
  idle(): Promise<void>;                  // aguarda as gerações em andamento (para testes)
}
export function createScrambleQueue(o: { generate: (event: EventId) => Promise<string>; size?: number }): ScrambleQueue; // size padrão 2

// ui/timer/ScrambleImage.svelte — props: { event: EventId; scramble: string; visible: boolean }
```

- [ ] **Step 1: Escrever os testes**

`app/tests/unit/scramble-queue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createScrambleQueue } from '../../src/scramble/queue';
import type { EventId } from '../../src/core/types';

function gen() {
  const calls: EventId[] = [];
  const counters: Record<string, number> = {};
  return {
    calls,
    generate: async (ev: EventId) => {
      calls.push(ev);
      counters[ev] = (counters[ev] ?? 0) + 1;
      return `${ev}-${counters[ev]}`;
    },
  };
}

describe('fila de embaralhamentos', () => {
  it('entrega em ordem e mantém 2 prontos por evento', async () => {
    const g = gen();
    const q = createScrambleQueue({ generate: g.generate, size: 2 });
    expect(await q.next('333')).toBe('333-1');
    await q.idle();
    expect(q.ready('333')).toBe(2);
    expect(await q.next('333')).toBe('333-2');
    expect(await q.next('333')).toBe('333-3');
  });

  it('eventos não se misturam', async () => {
    const g = gen();
    const q = createScrambleQueue({ generate: g.generate });
    const a = await q.next('333');
    const b = await q.next('sq1');
    expect([a, b]).toEqual(['333-1', 'sq1-1']);
    await q.idle();
    expect(q.ready('333')).toBe(2);
    expect(q.ready('sq1')).toBe(2);
  });

  it('prefetch prepara sem consumir', async () => {
    const g = gen();
    const q = createScrambleQueue({ generate: g.generate });
    q.prefetch('444');
    await q.idle();
    expect(q.ready('444')).toBe(2);
    expect(await q.next('444')).toBe('444-1');
  });

  it('se o gerador falha, next rejeita e a próxima chamada tenta de novo', async () => {
    let fail = true;
    const q = createScrambleQueue({
      generate: async (ev) => {
        if (fail) throw new Error('worker');
        return `${ev}-ok`;
      },
      size: 1,
    });
    await expect(q.next('333')).rejects.toThrow('worker');
    await q.idle();
    fail = false;
    expect(await q.next('333')).toBe('333-ok');
  });
});
```

`app/tests/unit/scramble-image.test.ts`:

```ts
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';

vi.mock('../../src/scramble/cubing-loader', () => {
  class FakeTwisty extends HTMLElement {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      super();
      this.config = config;
    }
  }
  if (!customElements.get('fake-twisty')) customElements.define('fake-twisty', FakeTwisty);
  return { loadCubing: async () => ({ TwistyPlayer: FakeTwisty, randomScrambleForEvent: async () => '' }) };
});

import ScrambleImage from '../../src/ui/timer/ScrambleImage.svelte';

describe('imagem do embaralhamento', () => {
  it('desenha a vista 2D do evento com o embaralhamento', async () => {
    const { container } = render(ScrambleImage, { event: 'minx', scramble: 'R++ D--', visible: true });
    await vi.waitFor(() => expect(container.querySelector('fake-twisty')).not.toBeNull());
    const el = container.querySelector('fake-twisty') as HTMLElement & { config: Record<string, unknown> };
    expect(el.config).toMatchObject({ puzzle: 'megaminx', experimentalSetupAlg: 'R++ D--', visualization: '2D', controlPanel: 'none', background: 'none' });
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('desligada, não desenha nada', async () => {
    const { container } = render(ScrambleImage, { event: '333', scramble: 'R U', visible: false });
    await tick();
    expect(container.querySelector('fake-twisty')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- scramble`
Expected: FAIL, com os módulos inexistentes.

- [ ] **Step 3: Empacotar o cubing.js**

O cubing.js não pode passar pelo bundler do Vite: o worker de embaralhamento não sobe ("Module worker instantiation failed"). Ele é empacotado à parte com esbuild, que é o bundler que o cubing.js suporta, e servido como arquivo estático.

`app/scripts/cubing-entry.js`:

```js
export { randomScrambleForEvent } from 'cubing/scramble';
export { TwistyPlayer } from 'cubing/twisty';
```

`app/scripts/build-cubing.mjs`:

```js
// Empacota o cubing.js com esbuild em public/vendor/cubing. O Vite não consegue empacotar o worker
// de embaralhamento do cubing.js, então ele é servido à parte e importado em runtime.
import { build } from 'esbuild';

await build({
  entryPoints: {
    cubing: 'scripts/cubing-entry.js',
    'search-worker-entry': 'node_modules/cubing/dist/lib/cubing/chunks/search-worker-entry.js',
  },
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  outdir: 'public/vendor/cubing',
  entryNames: '[name]',
  chunkNames: 'chunk-[hash]',
  logLevel: 'warning',
});
console.log('cubing empacotado em public/vendor/cubing');
```

- [ ] **Step 4: Implementar o carregador, a fila e a imagem**

**`scramble/cubing-loader.ts`:** é o único arquivo com `any`, para a fronteira com o cubing.js.

```ts
import type { EventId } from '../core/types';
import { eventInfo } from '../core/events';

export interface CubingModule {
  randomScrambleForEvent(eventId: string): Promise<{ toString(): string }>;
  TwistyPlayer: new (config: Record<string, unknown>) => HTMLElement;
}

let cached: Promise<CubingModule> | null = null;

export function loadCubing(): Promise<CubingModule> {
  const url = `${location.origin}${import.meta.env.BASE_URL}vendor/cubing/cubing.js`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cached ??= import(/* @vite-ignore */ url) as Promise<any>;
  return cached;
}

export async function generateScramble(event: EventId): Promise<string> {
  const cubing = await loadCubing();
  return (await cubing.randomScrambleForEvent(eventInfo(event).scrambleId)).toString();
}
```

**`scramble/queue.ts`:** guarde, por evento, `{ ready: string[]; inflight: number; waiters: { resolve, reject }[] }`. O `refill` gera enquanto `ready.length + inflight < size + waiters.length`. Ao resolver uma geração:
- se houver alguém esperando, entrega a quem espera primeiro; senão, empurra para `ready`;
- depois decrementa `inflight` e chama `refill`.

Numa falha:
- decrementa `inflight` e rejeita o primeiro que espera;
- não tenta de novo sozinho; a próxima chamada a `next` ou `prefetch` tenta.

`idle()` aguarda todas as promessas em andamento (`Promise.allSettled` de um conjunto mantido pela fila).

**`ui/timer/ScrambleImage.svelte`:**
- Um `<div class="scr-img" aria-hidden="true">` vazio.
- Quando `visible` for verdadeiro, um `$effect` carrega `loadCubing()`, cria `new TwistyPlayer({ puzzle: eventInfo(event).puzzle, alg: '', experimentalSetupAlg: scramble, visualization: '2D', background: 'none', controlPanel: 'none' })` e põe no div, substituindo o anterior.
- Quando `event` ou `scramble` mudam, recria. Quando `visible` é falso, esvazia o div.
- Se o carregamento falhar, o div fica vazio, porque o embaralhamento em texto continua na tela.

CSS escopado: `.scr-img { width: 132px; height: 100px; flex-shrink: 0 }`. Para `minx` e `sq1`, a largura pode ir a 160 px: use `class:wide={event === 'minx' || event === 'sq1'}`.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd app && pnpm test -- scramble && node scripts/build-cubing.mjs && ls public/vendor/cubing/cubing.js public/vendor/cubing/search-worker-entry.js`
Expected: PASS nos testes, e os dois arquivos existem.

- [ ] **Step 6: Commit**

```bash
git add app/scripts app/src/scramble app/src/ui/timer/ScrambleImage.svelte app/tests/unit/scramble-queue.test.ts app/tests/unit/scramble-image.test.ts
git commit -m "feat(app): embaralhamentos oficiais do cubing.js com fila por evento e imagem 2D" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---
### Task 9: Estado do app e casca da interface

**Files:**
- Create: `app/src/ui/state/app.svelte.ts`, `app/src/ui/state/boot.ts`
- Modify: `app/src/ui/App.svelte` (substitui o provisório), `app/src/strings.ts` (acrescenta textos)
- Test: `app/tests/unit/app-state.test.ts`, `app/tests/unit/app-shell.test.ts`

**Interfaces:**
- Consumes: Tasks 2 a 8 (repositório, segurança, transferência, fila, eventos, stats, textos).
- Produces:

```ts
// ui/state/app.svelte.ts
export type Tab = 'timer' | 'evolucao' | 'companion' | 'ajustes';
export type DialogId = 'sessions' | 'shortcuts' | 'onboarding' | 'export' | 'import' | 'backups' | 'trash' | 'install';
export interface Toast { text: string; action?: string; onAction?: () => void }
export interface AppDeps {
  repo: Repository; queue: ScrambleQueue; now?: () => number;
  storage?: Pick<Storage, 'getItem'> | null;   // para achar dados da v1 (padrão: localStorage, ou null)
  storageManager?: StorageLike | null;          // armazenamento persistente (padrão: navigator.storage)
}
export class AppState {
  sessions: Session[];                // $state — não excluídas, ordem de order
  solves: Solve[];                    // $state — todos os eventos, não excluídos, ordem de at
  profile: Profile;                   // $state
  meta: Meta | null;                  // $state
  tab: Tab;                           // $state
  scramble: string;                   // $state — embaralhamento atual do evento da sessão ('' enquanto gera)
  scrambleError: boolean;             // $state — true se o gerador falhou (a tela mostra "não consegui gerar, N tenta de novo")
  savePending: number;                // $state — solves esperando gravação
  toast: Toast | null;                // $state
  live: string;                       // $state — texto da região aria-live
  dialog: DialogId | null;            // $state
  v1Available: boolean;               // $state — há dados da v1 ainda não oferecidos
  exportReminder: boolean;            // $state — mostrar o lembrete de exportar
  readonly currentSession: Session | null;
  readonly event: EventId;            // evento da sessão atual ('333' se não houver)
  readonly sessionSolves: Solve[];    // solves da sessão atual
  readonly eventSolves: Solve[];      // solves do evento atual, de todas as sessões
  constructor(deps: AppDeps);
  init(): Promise<void>;
  reload(): Promise<void>;
  addSolve(r: { ms: number; penalty: Penalty; at: number }): Promise<Solve | null>;
  setPenalty(id: string, penalty: Penalty): Promise<void>;
  setNote(id: string, note: string): Promise<void>;
  deleteSolve(id: string): Promise<void>;
  undoDelete(): Promise<boolean>;
  createSession(event: EventId, name?: string): Promise<void>;
  switchSession(id: string): Promise<void>;
  renameSession(id: string, name: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  updateProfile(patch: Partial<Omit<Profile, 'settings'>>): Promise<void>;
  nextScramble(): Promise<void>;
  announce(text: string): void;
  showToast(text: string, action?: string, onAction?: () => void, ms?: number): void;
  dismissExportReminder(): Promise<void>;
}

// ui/state/boot.ts
export function boot(): Promise<AppState>; // abre o banco, cria repositório e fila (generateScramble) e chama init()
```

**Regras do `AppState`:**

1. **`init()`:**
   1. lê sessões, solves, perfil e meta;
   2. se não houver sessão, cria `{ event: '333' }` ("Sessão 1") e grava `currentSessionId`;
   3. se `currentSessionId` aponta para uma sessão inexistente, usa a primeira;
   4. aplica `planOnOpen` (cópia do dia e pasta, com a pasta configurada quando `repo.getFolderHandle()` não é `null`);
   5. chama `repo.purgeTrash(TRASH_MS)`;
   6. marca `v1Available = !meta.v1ImportOffered && readV1(storage) !== null`;
   7. pede o primeiro embaralhamento (`queue.next(event)`) e faz `queue.prefetch(event)`;
   8. inscreve `repo.onChange` para chamar `reload()`.
2. **`addSolve`:**
   - monta `NewSolve` com a sessão atual, o evento atual e o `scramble` atual, e grava pela `createSaveQueue(repo.addSolve)`, criada no construtor;
   - quando grava: atualiza `solves`, soma no meta (`countSolveSaved`) e executa `planAfterSolve`:
     - `backup` chama `createBackup(repo, 'auto50', now)`;
     - `remindExport` liga `exportReminder`;
     - `folderSave` salva na pasta com `saveToFolder(handle, backupFileName(now), toKlickJson(await repo.exportAll({ includeDeleted: false })), { ask: false })` e, se der certo, zera `solvesSinceFolderSave` e atualiza `lastFolderSaveAt` e `lastFolderSaveDay`;
   - quando a gravação falha, o solve fica na fila, `savePending` sobe e a interface mostra o aviso fixo; quando a fila grava depois, `onSaved` faz o mesmo que o sucesso;
   - em todos os casos, pede o próximo embaralhamento (`queue.next(event)`) e devolve o solve gravado ou `null`.
3. **`deleteSolve`:**
   - exclui (vai para a lixeira) e guarda `{ id, until: now + 6000 }`;
   - mostra o aviso `T.toast.deleted`, cuja ação é `T.toast.undo` no desktop e `T.toast.undoTouch` no toque;
   - `undoDelete()` restaura se ainda estiver dentro do prazo e devolve `true`;
   - um `addSolve` encerra o desfazer pendente.
4. **`switchSession` e `createSession`:** gravam `currentSessionId`, recarregam e pedem um embaralhamento do novo evento.
5. **`updateSettings`:** faz merge e grava. `applyPrefs()` aplica:
   - `document.documentElement.dataset.theme` (sem atributo para `'system'`);
   - `dataset.reducedMotion` (`'true'` se `'always'` ou se a mídia `prefers-reduced-motion` casar);
   - `dataset.arm` (`'two'` ou `'one'`).
6. **`announce(text)`:** zera `live` e define o texto 50 ms depois, para o leitor de tela anunciar de novo.

**Casca (`App.svelte`):** a mesma estrutura de `prototype/index.html`, com as mesmas classes e `data-*`, para os estilos portados valerem:
- topo com a marca, as abas, a pílula da sessão (agora "Evento · Sessão ▾") e a data;
- as quatro telas;
- a barra de abas do celular;
- o aviso com ação, a região `aria-live` e os diálogos.

Nesta task, as telas são componentes vazios com o título (`<section class="screen" data-screen="timer">…`). As Tasks 10 a 12 preenchem cada uma.

Tela de carregamento: enquanto `boot()` não termina, mostre só o fundo. Se `boot()` falhar (IndexedDB indisponível), mostre uma mensagem com `T.data.dbUnavailable`. O texto, a acrescentar em `strings.ts`, explica que o navegador bloqueou o armazenamento e que o app vai funcionar sem salvar.

Acrescente a `strings.ts`:
- `T.data.dbUnavailable`;
- `T.data.saveFailed` (o aviso fixo: "Não consegui salvar. Exporte seus dados agora.");
- `T.data.saved`;
- `T.toast.undoTouch` (já existe no protótipo);
- os nomes das abas.

- [ ] **Step 1: Escrever os testes**

`app/tests/unit/app-state.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const fakeQueue = () => {
  const c: Record<string, number> = {};
  return createScrambleQueue({ generate: async (ev) => `${ev}-${(c[ev] = (c[ev] ?? 0) + 1)}` });
};

async function setup(storage: Pick<Storage, 'getItem'> | null = null) {
  const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
  const app = new AppState({ repo, queue: fakeQueue(), now, storage, storageManager: null });
  await app.init();
  return { repo, app };
}

describe('estado do app', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  it('cria a primeira sessão de 3×3 e pede um embaralhamento', async () => {
    const { app, repo } = await setup();
    expect(app.sessions.map((s) => [s.name, s.event])).toEqual([['Sessão 1', '333']]);
    expect(app.profile.currentSessionId).toBe(app.sessions[0].id);
    expect(app.scramble).toBe('333-1');
    expect((await repo.getProfile()).currentSessionId).toBe(app.sessions[0].id);
  });

  it('grava o solve com o embaralhamento usado, conta no meta e avança o embaralhamento', async () => {
    const { app, repo } = await setup();
    const s = await app.addSolve({ ms: 61234, penalty: null, at: t });
    expect(s).toMatchObject({ ms: 61234, scramble: '333-1', event: '333' });
    expect((await repo.listSolves()).length).toBe(1);
    expect((await repo.getMeta())).toMatchObject({ solvesSinceBackup: 1, solvesSinceExport: 1 });
    expect(app.scramble).toBe('333-2');
  });

  it('a cada 50 solves faz uma cópia automática', async () => {
    const { app, repo } = await setup();
    for (let i = 0; i < 50; i++) await app.addSolve({ ms: 60000 + i, penalty: null, at: t + i });
    expect((await repo.listBackups()).map((b) => b.reason)).toEqual(['auto50']);
  });

  it('trocar para uma sessão de outro evento muda solves e embaralhamento', async () => {
    const { app } = await setup();
    await app.addSolve({ ms: 60000, penalty: null, at: t });
    await app.createSession('sq1');
    expect(app.event).toBe('sq1');
    expect(app.sessionSolves).toEqual([]);
    expect(app.scramble).toBe('sq1-1');
  });

  it('excluir mostra o aviso e desfazer restaura dentro do prazo', async () => {
    const { app } = await setup();
    const s = (await app.addSolve({ ms: 60000, penalty: null, at: t }))!;
    await app.deleteSolve(s.id);
    expect(app.solves).toEqual([]);
    expect(app.toast?.text).toBeTruthy();
    expect(await app.undoDelete()).toBe(true);
    expect(app.solves.map((x) => x.id)).toEqual([s.id]);
    await app.deleteSolve(s.id);
    t += 7000;
    expect(await app.undoDelete()).toBe(false);
  });

  it('acha dados da v1 neste navegador e oferece uma vez', async () => {
    const v1 = JSON.stringify({ state: { sessions: [{ id: 'v', name: 'S', puzzleType: '3x3', solves: [{ id: 'x', timeMs: 1, penalty: 'NONE', scramble: '', createdAt: '2026-01-01T00:00:00Z' }] }] } });
    const { app } = await setup({ getItem: (k) => (k === 'klick-sessions' ? v1 : null) });
    expect(app.v1Available).toBe(true);
  });

  it('aplica o tema escolhido no elemento raiz', async () => {
    const { app } = await setup();
    await app.updateSettings({ theme: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    await app.updateSettings({ theme: 'system' });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('quando gravar falha, o solve fica na fila e a contagem de pendentes sobe', async () => {
    const { app, repo } = await setup();
    const original = repo.addSolve.bind(repo);
    let fail = true;
    repo.addSolve = async (s) => { if (fail) throw new Error('quota'); return original(s); };
    expect(await app.addSolve({ ms: 60000, penalty: null, at: t })).toBeNull();
    expect(app.savePending).toBe(1);
    fail = false;
  });
});
```

`app/tests/unit/app-shell.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/state/boot', async () => {
  const { openKlickDb } = await import('../../src/data/db');
  const { createRepository } = await import('../../src/data/repository');
  const { createScrambleQueue } = await import('../../src/scramble/queue');
  const { AppState } = await import('../../src/ui/state/app.svelte');
  return {
    boot: async () => {
      const repo = createRepository(await openKlickDb('shell'), { channel: null });
      const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => "R U R'" }), storage: null, storageManager: null });
      await app.init();
      return app;
    },
  };
});

import App from '../../src/ui/App.svelte';

describe('casca do app', () => {
  it('mostra as quatro abas e a tela do Timer', async () => {
    render(App);
    expect(await screen.findByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Evolução', 'Centro', 'Ajustes']) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-screen="timer"]')).not.toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- app-state app-shell`
Expected: FAIL, com os módulos inexistentes.

- [ ] **Step 3: Implementar**

Implemente `AppState` com runes (`$state` nos campos e getters para os derivados) e siga as regras acima. O `App.svelte`:
- chama `boot()` no `onMount`;
- guarda o `AppState`;
- passa-o às telas por props (`app`);
- renderiza a navegação: os botões das abas mudam `app.tab` e marcam `aria-current="page"` na aba ativa, tanto no topo quanto na barra do celular.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test && pnpm check`
Expected: PASS em tudo.

- [ ] **Step 5: Commit**

```bash
git add app/src/ui app/src/strings.ts app/tests/unit/app-state.test.ts app/tests/unit/app-shell.test.ts
git commit -m "feat(app): estado do app com runes e casca da interface" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 10: Tela do Timer e entrada

**Files:**
- Create:
  - `app/src/ui/timer/TimerScreen.svelte`, `app/src/ui/timer/TimeDisplay.ts`, `app/src/ui/timer/input.ts`
  - `app/src/ui/timer/Zones.svelte`, `app/src/ui/timer/ResultActions.svelte`, `app/src/ui/timer/ScrambleBlock.svelte`, `app/src/ui/timer/CentroView.svelte`
  - `app/src/ui/wakelock.ts`
- Modify: `app/src/ui/App.svelte` (usa o `TimerScreen`), `app/src/strings.ts`
- Test: `app/tests/unit/timer-input.test.ts`, `app/tests/unit/timer-screen.test.ts`, `app/tests/unit/wakelock.test.ts`

**Interfaces:**
- Consumes: `AppState` (Task 9), `createTimer` e `createTouchArm` (Task 3), `pickCoachMessage` (Task 4), `renderCentro`, `updateCentro`, `ringFor`, `eyesFor` (Task 4), `ScrambleImage` (Task 8), stats (Task 2), `createSound` (Task 4).
- Produces:

```ts
// ui/timer/input.ts — a entrada, separada da tela para testar sem Svelte
export interface InputTarget {
  timer: Timer; touch: TouchArm;
  tabIsTimer(): boolean; dialogOpen(): boolean;
  onAction(name: 'plus2' | 'dnf' | 'note' | 'delete' | 'undo' | 'next' | 'shortcuts' | 'tab1' | 'tab2' | 'tab3' | 'tab4'): void;
  onWake(): void;
}
export interface InputController { attach(doc: Document, win: Window, zones: HTMLElement, screen: HTMLElement): () => void; abandonHold(): void }
export function createInputController(t: InputTarget, o: { coarse: () => boolean; armMode: () => 'two' | 'one' }): InputController;

// ui/wakelock.ts
export function createWakeLock(nav?: { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void>; addEventListener?(t: string, f: () => void): void }> } }): { want(on: boolean): Promise<void>; held(): boolean };
```

**Comportamento (porta de `prototype/scripts/app.js` e `prototype/scripts/ui/timer-view.js`):**

1. **Tela:**
   - embaralhamento com a imagem 2D ao lado (`ScrambleBlock`);
   - Centro (`CentroView`);
   - tempo grande (`TimeDisplay`, escrito direto no DOM a cada quadro);
   - chips, ações do resultado (+2, DNF, Nota, Excluir), linha do coach, zonas de toque, tiles e mapa de constância.
   - Use o mesmo markup, as mesmas classes e os mesmos `data-*` de `prototype/index.html` e de `timer-view.js`, para o CSS portado valer.
2. **Médias e recordes:**
   - os tiles mostram a média oficial do evento, pela sessão ("Média de 5" ou "Média de 3"), e a Média de 12, pela sessão;
   - o tile "Recorde" mostra o melhor single do evento em todas as sessões;
   - "Hoje", o mapa de constância e os dias seguidos contam solves de todos os eventos;
   - o chip "vs média" compara com a média oficial da sessão; o chip de recorde compara com o melhor do evento (`solveDeltas(eventHistory, last, sessionHistory)` e `resultKind` com os mesmos parâmetros).
3. **Timer:**
   - um `createTimer` por tela, com `holdMs` dos ajustes e `inspection = settings.inspection && eventInfo(event).inspection`;
   - ao trocar de evento, de sessão ou de aba no meio da inspeção ou do armar, chame `abandonHold()`;
   - os eventos `state`, `warn` e `done` fazem o mesmo que no protótipo:
     - classe `solving` no `body`;
     - sons klick, tique e acorde;
     - reação 500 ms depois, por 2,5 s;
     - mensagem do coach por 6 s, uma por solve;
     - anúncio do tempo final e do coach (`app.announce`).
4. **Gravação:** em `done`, chame `app.addSolve({ ms, penalty, at: Date.now() })` antes da reação. Com `app.savePending > 0`, mostre o aviso fixo `T.data.saveFailed` acima do tempo, com um botão "Exportar agora" que abre o diálogo de exportação.
5. **Entrada (`input.ts`):** porte o tratamento de teclado e toque do `app.js` final do protótipo, com todos os casos de borda:
   - espaço arma e larga, usando `e.timeStamp` em `timer.press(e.timeStamp)` e `timer.release(e.timeStamp)`;
   - qualquer tecla para;
   - ignora teclas com um campo de texto focado ou com diálogo aberto;
   - ignora auto-repeat;
   - o soltar do espaço sempre pareia com o seu armar (`spaceHeld`);
   - blur, página escondida e `pointercancel` abandonam;
   - o clique da parada é engolido, e só o ponteiro primário libera;
   - dois polegares ou um toque; no modo um toque em `pointer: coarse`, a tela do Timer inteira arma, menos os controles;
   - o soltar do toque é ouvido na janela;
   - os atalhos P, D, M, ⌫, Z, N, ? e 1–4 chamam `onAction`.
6. **Tela acesa:** `createWakeLock()`. Peça (`want(true)`) quando a aba do Timer estiver visível; solte ao trocar de aba ou ao esconder a página; peça de novo ao voltar. Falhas são ignoradas.
7. **Nota:** M abre o campo; o id do solve fica guardado e só grava se o solve ainda existir. O botão Nota ganha o ponto (`has-note`) e o `aria-label` com a nota.
8. **Marcos (só 3×3):** `pickCoachMessage` recebe `newMilestones` e `achievedCount` calculados com `achievedIds` sobre os solves de 3×3. Nos outros eventos, recebe `[]` e `0`.

- [ ] **Step 1: Escrever os testes**

`app/tests/unit/timer-input.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTimer } from '../../src/core/timer';
import { createTouchArm } from '../../src/core/touch';
import { createInputController } from '../../src/ui/timer/input';

function setup(o: { coarse?: boolean; mode?: 'two' | 'one'; inspection?: boolean } = {}) {
  let t = 0;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection: o.inspection ?? false });
  const touch = createTouchArm({ press: () => timer.press(), release: () => timer.release(), cancel: () => timer.cancel(), getState: () => timer.state, getInspection: () => o.inspection ?? false, mode: o.mode ?? 'two' });
  const actions: string[] = [];
  let dialog = false;
  const ctl = createInputController(
    { timer, touch, tabIsTimer: () => true, dialogOpen: () => dialog, onAction: (a) => actions.push(a), onWake: () => {} },
    { coarse: () => o.coarse ?? false, armMode: () => o.mode ?? 'two' },
  );
  document.body.innerHTML = '<section data-screen="timer"><span data-time>0</span><div data-zones><div data-zone="left"></div><div data-zone="right"></div></div><button data-act="plus2">+2</button><input data-note /></section>';
  const screen = document.querySelector('[data-screen="timer"]') as HTMLElement;
  const zones = document.querySelector('[data-zones]') as HTMLElement;
  const detach = ctl.attach(document, window, zones, screen);
  const key = (type: 'keydown' | 'keyup', code: string, k: string, target: EventTarget = document.body, repeat = false) =>
    target.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true, repeat }));
  return { timer, actions, key, setT: (v: number) => { t = v; }, setDialog: (v: boolean) => { dialog = v; }, zones, screen, detach, ctl };
}

describe('teclado', () => {
  it('segurar espaço arma, soltar no verde larga, qualquer tecla para', () => {
    const s = setup();
    s.key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    s.key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('running');
    s.setT(5000);
    s.key('keydown', 'KeyA', 'a');
    expect(s.timer.state).toBe('done');
  });

  it('digitando na nota, as teclas não viram atalhos nem armam', () => {
    const s = setup();
    const input = document.querySelector('[data-note]') as HTMLInputElement;
    input.focus();
    s.key('keydown', 'KeyP', 'p', input);
    s.key('keydown', 'Space', ' ', input);
    expect(s.actions).toEqual([]);
    expect(s.timer.state).toBe('idle');
  });

  it('com diálogo aberto, nada acontece', () => {
    const s = setup();
    s.setDialog(true);
    s.key('keydown', 'Space', ' ');
    s.key('keydown', 'KeyN', 'n');
    expect(s.timer.state).toBe('idle');
    expect(s.actions).toEqual([]);
  });

  it('auto-repeat de atalho é ignorado', () => {
    const s = setup();
    s.key('keydown', 'KeyP', 'p');
    s.key('keydown', 'KeyP', 'p', document.body, true);
    expect(s.actions).toEqual(['plus2']);
  });

  it('abandonHold no meio do armar (troca de evento, sessão ou aba) volta ao repouso', () => {
    const s = setup();
    s.key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    s.ctl.abandonHold();
    expect(s.timer.state).toBe('idle');
    s.key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('idle');
  });

  it('perder o foco no meio do armar abandona sem largar', () => {
    const s = setup();
    s.key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    window.dispatchEvent(new Event('blur'));
    expect(s.timer.state).toBe('idle');
    s.key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('idle');
  });
});

describe('toque', () => {
  const pe = (type: string, el: Element, id: number, primary = true) =>
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: primary }));

  it('dois polegares: um só não arma; os dois armam; o primeiro que sai larga', () => {
    const s = setup({ coarse: true });
    const [l, r] = Array.from(s.zones.children);
    pe('pointerdown', l, 1);
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('idle');
    pe('pointerdown', r, 2, false);
    s.setT(800); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    pe('pointerup', l, 1);
    expect(s.timer.state).toBe('running');
  });

  it('toque cancelado pelo sistema abandona, não larga', () => {
    const s = setup({ coarse: true });
    const [l, r] = Array.from(s.zones.children);
    pe('pointerdown', l, 1); pe('pointerdown', r, 2, false);
    s.setT(400); s.timer.tick();
    pe('pointercancel', l, 1);
    expect(s.timer.state).toBe('idle');
  });

  it('um toque: tocar no tempo arma; tocar num botão não arma', () => {
    const s = setup({ coarse: true, mode: 'one' });
    pe('pointerdown', document.querySelector('[data-time]')!, 3);
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    pe('pointerup', document.querySelector('[data-time]')!, 3);
    expect(s.timer.state).toBe('running');
    pe('pointerdown', document.body, 4);
    expect(s.timer.state).toBe('done');
    const s2 = setup({ coarse: true, mode: 'one' });
    pe('pointerdown', document.querySelector('[data-act="plus2"]')!, 5);
    s2.setT(400); s2.timer.tick();
    expect(s2.timer.state).toBe('idle');
  });
});
```

`app/tests/unit/timer-screen.test.ts`: renderize o `TimerScreen` com um `AppState` real (repositório em `fake-indexeddb` e fila falsa, como na Task 9) e confira:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';
import { T } from '../../src/strings';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ts-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async (ev) => `${ev} R U` }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('tela do Timer', () => {
  it('mostra o embaralhamento, o tempo zerado e as médias da sessão vazias', async () => {
    const { a } = await app();
    render(TimerScreen, { app: a });
    expect(await screen.findByText('333 R U')).toBeInTheDocument();
    expect(document.querySelector('[data-tiles]')?.textContent).toContain('—');
  });

  it('no 6×6 o tile mostra a média de 3', async () => {
    const { a } = await app();
    await a.createSession('666');
    render(TimerScreen, { app: a });
    expect(await screen.findByText('Média de 3')).toBeInTheDocument();
  });

  it('com gravação pendente, mostra o aviso fixo', async () => {
    const { a, repo } = await app();
    repo.addSolve = async () => { throw new Error('quota'); };
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    render(TimerScreen, { app: a });
    expect(await screen.findByText(T.data.saveFailed)).toBeInTheDocument();
  });
});
```

`app/tests/unit/wakelock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createWakeLock } from '../../src/ui/wakelock';

describe('tela acesa', () => {
  it('pede e solta o wake lock', async () => {
    let released = 0;
    const nav = { wakeLock: { request: async () => ({ release: async () => { released++; } }) } };
    const w = createWakeLock(nav);
    await w.want(true);
    expect(w.held()).toBe(true);
    await w.want(false);
    expect(w.held()).toBe(false);
    expect(released).toBe(1);
  });
  it('sem suporte ou com recusa, segue sem erro', async () => {
    await expect(createWakeLock({}).want(true)).resolves.toBeUndefined();
    const refuse = { wakeLock: { request: async () => { throw new Error('NotAllowed'); } } };
    const w = createWakeLock(refuse);
    await w.want(true);
    expect(w.held()).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- timer-input timer-screen wakelock`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Porte as partes correspondentes de `prototype/scripts/app.js` (teclado, toque, zonas, abandono, clique engolido, reação, coach, nota, ações) e de `prototype/scripts/ui/timer-view.js` para os arquivos listados, seguindo o "Comportamento" acima. A lógica do protótipo já foi validada no navegador; mantenha os números (500 ms, 2,5 s, 6 s) e as regras.

`TimeDisplay.ts`:
- `paintTime(el, text)`: segundos em `.int`, centésimos em `.dec`;
- `createTimeLoop(paint: () => void)`: requestAnimationFrame só enquanto houver estado ativo; para sozinho no repouso.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/ui app/src/strings.ts app/tests/unit/timer-input.test.ts app/tests/unit/timer-screen.test.ts app/tests/unit/wakelock.test.ts
git commit -m "feat(app): tela do Timer com entrada por teclado e toque, reação, coach e tela acesa" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 11: Evolução e Centro

**Files:**
- Create: `app/src/ui/evolucao/EvolucaoScreen.svelte`, `app/src/ui/centro/CentroScreen.svelte`
- Modify: `app/src/ui/App.svelte`, `app/src/strings.ts`
- Test: `app/tests/unit/evolucao-screen.test.ts`, `app/tests/unit/centro-screen.test.ts`

**Interfaces:**
- Consumes: `AppState` (Task 9); `evolutionChart`, `histogramBins` (Task 4); stats (Task 2); `renderCentro`, `paletteFor` (Task 4); `MILESTONE_INFO`, `TRAIL`, `FINISH_INFO` (Task 1).
- Produces: as telas `EvolucaoScreen` e `CentroScreen`, com prop `app: AppState`.

**Comportamento:** porte `prototype/scripts/ui/evolucao-view.js` e `companion-view.js`, com o mesmo markup e as mesmas classes. Mudanças:
1. **Evolução:**
   - ganha o seletor de evento (`<select data-evo-event>`), que filtra junto com sessão e período;
   - o seletor de sessão lista só as sessões do evento escolhido, mais "Todas as sessões";
   - o primeiro indicador de média é a média oficial do evento ("Média de 5" ou "Média de 3");
   - a tabela mostra a nota sob o tempo (`<small class="note">`), com o texto escapado;
   - o rótulo do histograma traz o resumo.
2. **Centro:**
   - os marcos usam só os solves de 3×3 (`milestoneProgress` sobre `app.solves` filtrados por `event === '333'`);
   - "já sei" e "desfazer" na trilha gravam `profile.trail`;
   - escolher um acabamento grava `profile.finish`, e um bloqueado mostra a prévia por 3 s (com contador de geração);
   - o modo silencioso grava `settings.silent` e cala a mensagem atual.
3. **Foco:** depois de uma ação, o foco volta ao mesmo controle. Os controles são componentes que não são recriados; se forem, devolva o foco pela chave `data-*`.

- [ ] **Step 1: Escrever os testes**

`app/tests/unit/evolucao-screen.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import EvolucaoScreen from '../../src/ui/evolucao/EvolucaoScreen.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ev-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

describe('Evolução', () => {
  it('sem solves mostra o aviso do período', async () => {
    const a = await app();
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByText(/Sem solves neste período/)).toBeInTheDocument();
  });

  it('filtra por evento e mostra a nota sob o tempo', async () => {
    const a = await app();
    const s = (await a.addSolve({ ms: 61234, penalty: null, at: Date.now() }))!;
    await a.setNote(s.id, 'cruz no amarelo');
    await a.createSession('222');
    await a.addSolve({ ms: 8000, penalty: null, at: Date.now() });
    render(EvolucaoScreen, { app: a });
    const select = (await screen.findByLabelText('Evento')) as HTMLSelectElement;
    expect(select.value).toBe('222');
    expect(document.querySelectorAll('.hist tbody tr')).toHaveLength(1);
    select.value = '333';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await screen.findByText('cruz no amarelo')).toBeInTheDocument();
  });

  it('no 7×7 o indicador é a média de 3', async () => {
    const a = await app();
    await a.createSession('777');
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByText('Média de 3')).toBeInTheDocument();
  });
});
```

`app/tests/unit/centro-screen.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import CentroScreen from '../../src/ui/centro/CentroScreen.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ce-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('Centro', () => {
  it('o primeiro solve de 3×3 acende o primeiro marco; um de 2×2 não', async () => {
    const { a } = await app();
    await a.createSession('222');
    await a.addSolve({ ms: 5000, penalty: null, at: Date.now() });
    const r1 = render(CentroScreen, { app: a });
    expect(await screen.findByText(/0 de 9 marcos/)).toBeInTheDocument();
    r1.unmount();
    await a.createSession('333');
    await a.addSolve({ ms: 130000, penalty: null, at: Date.now() });
    render(CentroScreen, { app: a });
    expect(await screen.findByText(/1 de 9 marcos/)).toBeInTheDocument();
  });

  it('marcar uma etapa da trilha grava no perfil', async () => {
    const { a, repo } = await app();
    render(CentroScreen, { app: a });
    (await screen.findByRole('button', { name: /Cruz branca: já sei/ })).click();
    await new Promise((r) => setTimeout(r, 50));
    expect((await repo.getProfile()).trail[0]).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- evolucao-screen centro-screen`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Siga o "Comportamento" acima. O seletor de evento usa `aria-label="Evento"`, e o padrão é o evento da sessão atual.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/ui app/src/strings.ts app/tests/unit/evolucao-screen.test.ts app/tests/unit/centro-screen.test.ts
git commit -m "feat(app): telas Evolução (com filtro por evento) e Centro" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---
### Task 12: Ajustes, "Seus dados" e diálogos

**Files:**
- Create:
  - `app/src/ui/ajustes/AjustesScreen.svelte`, `app/src/ui/ajustes/DataSection.svelte`
  - `app/src/ui/dialogs/SessionsDialog.svelte`, `ShortcutsDialog.svelte`, `OnboardingDialog.svelte`, `ExportDialog.svelte`, `ImportDialog.svelte`, `BackupsDialog.svelte`, `TrashDialog.svelte`, `InstallGuide.svelte`
  - `app/src/ui/download.ts`, `app/src/ui/platform.ts`
- Modify: `app/src/ui/App.svelte`, `app/src/strings.ts`
- Test: `app/tests/unit/ajustes-screen.test.ts`, `app/tests/unit/data-section.test.ts`, `app/tests/unit/dialogs.test.ts`, `app/tests/unit/platform.test.ts`

**Interfaces:**
- Consumes: `AppState` (Task 9); `safety` e `folder` (Task 6); `transfer` (Task 7); `EVENTS` (Task 2).
- Produces:

```ts
// ui/download.ts
export function downloadText(name: string, text: string, mime?: string, doc?: Document): boolean; // false se não der (em iframe, quem chama abre o ExportDialog)
// ui/platform.ts
export function isFramed(win?: Window): boolean;                                   // window.top !== window.self
export function isIOS(ua?: string, maxTouchPoints?: number): boolean;               // iPhone, iPad, iPod ou Mac com toque
export function isStandalone(win?: Window): boolean;                                // display-mode standalone ou navigator.standalone
export function shouldShowInstallGuide(o: { ua: string; maxTouchPoints: number; standalone: boolean; dismissed: boolean }): boolean;
```

**Comportamento:**

1. **Ajustes:** porte `prototype/scripts/ui/ajustes-view.js` (mesmo markup e mesmas classes), com:
   - o novo ajuste "Imagem do embaralhamento" (switch `data-toggle="scrambleImage"`);
   - os grupos `.seg` com nome;
   - o foco preservado depois de cada mudança.
2. **"Seus dados" (`DataSection`):**
   - **Armazenamento:** "Protegido" ou "Não protegido", com o espaço em uso (`storageStatus`). O botão "Proteger meus dados" chama `requestPersistence` e grava `meta.persistRequested`.
   - **Cópias automáticas:** a lista abre o `BackupsDialog` (com data, motivo e quantidade de solves). Restaurar pede confirmação em dois cliques, chama `restoreBackup` e `app.reload()`.
   - **Lixeira:** abre o `TrashDialog`, com solves e sessões excluídos e um botão para restaurar cada um.
   - **Exportar:**
     - dois botões: "Exportar (Klick)" e "Exportar (csTimer)";
     - fora de iframe, `downloadText(nome, texto)`; em iframe, ou se o download falhar, abre o `ExportDialog` com o texto selecionado e um botão "Copiar" (com seleção manual se a cópia for recusada);
     - exportar zera `solvesSinceExport` e grava `lastExportAt`.
   - **Importar:**
     - um `<input type="file" accept=".json,.txt">` aceita arquivo do Klick ou do csTimer: tenta `parseKlickJson`, senão `parseCsTimer`;
     - no csTimer, o `ImportDialog` mostra as sessões; as que vierem sem evento ganham um `<select>` para escolher, e as que ficarem sem escolha não entram;
     - o botão de confirmar se chama "Importar solves";
     - ao confirmar, grava com `repo.importAll` (Klick) ou com as sessões e solves de `csTimerToKlick` e mostra o resumo ("N solves importados, M já existiam").
   - O `DataSection` renderiza os próprios diálogos que abre (`ExportDialog`, `ImportDialog`, `BackupsDialog`, `TrashDialog`), para funcionar sozinho nos testes.
   - **Versão anterior:** com `app.v1Available`, aparece "Importar da versão anterior". Importar usa `v1ToKlick`, grava e marca `meta.v1ImportOffered`.
   - **Pasta de cópias automáticas:** só aparece se `folderSupported()`. Escolher a pasta grava o handle (`repo.saveFolderHandle`) e salva uma primeira cópia nela.
   - **Instalação:** o botão "Como instalar" abre o `InstallGuide`.
3. **Primeira vez (`OnboardingDialog`):** porte o tour do protótipo, os 3 passos com o segurar de demonstração, com os mesmos cuidados de teclado e foco. O fim do tour oferece:
   - "Importar do csTimer", que abre o seletor de arquivo;
   - "Importar da versão anterior", se `app.v1Available`;
   - "Começar do zero".
   Não há dados de exemplo. Fechar marca `profile.onboarded = true`.
4. **Sessões (`SessionsDialog`):**
   - lista as sessões agrupadas por evento;
   - criar pede o evento (`<select aria-label="Evento">`, com `EVENTS`) e o nome opcional;
   - renomear e excluir (excluir manda para a lixeira);
   - clicar no respiro do diálogo não fecha; só o fundo escuro fecha.
5. **Atalhos (`ShortcutsDialog`):** a mesma tabela do protótipo.
6. **Guia de instalação (`InstallGuide`):**
   - no iPhone, mostra o passo a passo do Safari (Compartilhar, depois "Adicionar à Tela de Início") e explica que isso protege os dados;
   - nos outros navegadores, usa o evento `beforeinstallprompt` quando existir;
   - aparece sozinho uma vez quando `shouldShowInstallGuide(...)` é verdadeiro, depois do 5º solve; dispensar grava `meta.installGuideDismissed = true`.
7. **Lembrete de exportar:** com `app.exportReminder`, aparece um aviso discreto acima dos tiles do Timer, nunca durante a inspeção ou o solve. Ele tem "Exportar agora" e "Agora não" (`dismissExportReminder`).

- [ ] **Step 1: Escrever os testes**

`app/tests/unit/platform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isIOS, shouldShowInstallGuide } from '../../src/ui/platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36';

describe('plataforma', () => {
  it('reconhece iPhone e iPad (Mac com toque)', () => {
    expect(isIOS(IPHONE, 5)).toBe(true);
    expect(isIOS(MAC, 5)).toBe(true);
    expect(isIOS(MAC, 0)).toBe(false);
    expect(isIOS(ANDROID, 5)).toBe(false);
  });
  it('guia de instalação só no iOS fora do app instalado e não dispensado', () => {
    expect(shouldShowInstallGuide({ ua: IPHONE, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe(true);
    expect(shouldShowInstallGuide({ ua: IPHONE, maxTouchPoints: 5, standalone: true, dismissed: false })).toBe(false);
    expect(shouldShowInstallGuide({ ua: IPHONE, maxTouchPoints: 5, standalone: false, dismissed: true })).toBe(false);
    expect(shouldShowInstallGuide({ ua: ANDROID, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe(false);
  });
});
```

`app/tests/unit/ajustes-screen.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`aj-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('Ajustes', () => {
  it('marca os valores atuais', async () => {
    const { a } = await app();
    await a.updateSettings({ holdMs: 550 });
    render(AjustesScreen, { app: a });
    expect(await screen.findByText('Ajustes')).toBeInTheDocument();
    expect(document.querySelector('[data-set="holdMs"][data-val="550"]')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-set="theme"][data-val="system"]')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-toggle="inspection"]')).toBeChecked();
  });

  it('trocar o tema grava e aplica', async () => {
    const { a, repo } = await app();
    render(AjustesScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Noite' }));
    expect((await repo.getProfile()).settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('desligar a imagem do embaralhamento grava e mantém o foco no switch', async () => {
    const { a, repo } = await app();
    render(AjustesScreen, { app: a });
    const sw = (await screen.findByRole('checkbox', { name: /Imagem do embaralhamento/ })) as HTMLInputElement;
    sw.focus();
    await fireEvent.click(sw);
    await new Promise((r) => setTimeout(r, 20));
    expect((await repo.getProfile()).settings.scrambleImage).toBe(false);
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-toggle')).toBe('scrambleImage');
  });
});
```

`app/tests/unit/data-section.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import DataSection from '../../src/ui/ajustes/DataSection.svelte';

vi.mock('../../src/ui/download', () => ({ downloadText: vi.fn(() => true) }));
import { downloadText } from '../../src/ui/download';

let n = 0;
async function app(storageManager: unknown = null) {
  const repo = createRepository(await openKlickDb(`ds-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: storageManager as never });
  await a.init();
  return { a, repo };
}

describe('Seus dados', () => {
  it('mostra se o armazenamento está protegido e permite pedir proteção', async () => {
    let persisted = false;
    const sm = { persisted: async () => persisted, persist: async () => (persisted = true), estimate: async () => ({ usage: 2048, quota: 1e9 }) };
    const { a } = await app(sm);
    render(DataSection, { app: a });
    expect(await screen.findByText(/Não protegido/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /Proteger meus dados/ }));
    expect(await screen.findByText(/^Protegido/)).toBeInTheDocument();
  });

  it('exportar no formato Klick baixa um arquivo com os solves e zera o contador', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 61234, penalty: null, at: Date.now() });
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Exportar \(Klick\)/ }));
    await vi.waitFor(() => expect(downloadText).toHaveBeenCalled());
    const [name, text] = (downloadText as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(name).toMatch(/^klick-.*\.json$/);
    expect(JSON.parse(text).solves[0].ms).toBe(61234);
    expect((await repo.getMeta()).solvesSinceExport).toBe(0);
  });

  it('importar um arquivo do csTimer pede o evento da sessão desconhecida e não duplica na segunda vez', async () => {
    const { a, repo } = await app();
    render(DataSection, { app: a });
    const text = readFileSync(new URL('../fixtures/cstimer-export.txt', import.meta.url), 'utf8');
    const input = (await screen.findByLabelText(/Importar arquivo/)) as HTMLInputElement;
    const file = new File([text], 'cstimer.txt', { type: 'text/plain' });
    await fireEvent.change(input, { target: { files: [file] } });
    const pick = (await screen.findByLabelText(/Evento de ZBLL/)) as HTMLSelectElement;
    await fireEvent.change(pick, { target: { value: '333' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Importar solves' }));
    await vi.waitFor(async () => expect((await repo.listSolves()).length).toBe(5));
    await fireEvent.change(input, { target: { files: [file] } });
    await fireEvent.change(await screen.findByLabelText(/Evento de ZBLL/), { target: { value: '333' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Importar solves' }));
    expect(await screen.findByText(/já existiam/)).toBeInTheDocument();
    expect((await repo.listSolves()).length).toBe(5);
  });
});
```

`app/tests/unit/dialogs.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createBackup } from '../../src/data/safety';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import SessionsDialog from '../../src/ui/dialogs/SessionsDialog.svelte';
import TrashDialog from '../../src/ui/dialogs/TrashDialog.svelte';
import BackupsDialog from '../../src/ui/dialogs/BackupsDialog.svelte';
import OnboardingDialog from '../../src/ui/dialogs/OnboardingDialog.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`dl-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async (ev) => `${ev} R U` }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('diálogos', () => {
  it('sessões: cria uma de Square-1 e agrupa por evento', async () => {
    const { a } = await app();
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.change(await screen.findByLabelText('Evento'), { target: { value: 'sq1' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(a.event).toBe('sq1');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['3×3', 'Square-1']);
  });

  it('lixeira: restaura um solve excluído', async () => {
    const { a } = await app();
    const s = (await a.addSolve({ ms: 60000, penalty: null, at: Date.now() }))!;
    await a.deleteSolve(s.id);
    render(TrashDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: /Restaurar/ }));
    await new Promise((r) => setTimeout(r, 30));
    expect(a.solves.map((x) => x.id)).toEqual([s.id]);
  });

  it('cópias: restaurar pede dois cliques e volta o estado', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    await createBackup(repo, 'manual', Date.now());
    await a.addSolve({ ms: 70000, penalty: null, at: Date.now() + 1 });
    render(BackupsDialog, { app: a, open: true });
    const btn = await screen.findByRole('button', { name: /Restaurar/ });
    await fireEvent.click(btn);
    expect(await screen.findByRole('button', { name: /Tem certeza/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /Tem certeza/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(a.solves.map((x) => x.ms)).toEqual([60000]);
  });

  it('primeira vez: o fim oferece importar ou começar do zero', async () => {
    const { a, repo } = await app();
    a.v1Available = true;
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    for (let i = 0; i < 2; i++) {
      const next = screen.queryByRole('button', { name: 'Continuar' });
      if (next && !(next as HTMLButtonElement).disabled) await fireEvent.click(next);
      else break;
    }
    expect(await screen.findByRole('button', { name: 'Começar do zero' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar do csTimer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar da versão anterior' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    await new Promise((r) => setTimeout(r, 30));
    expect((await repo.getProfile()).onboarded).toBe(true);
  });
});
```

O passo 2 do tour libera o Continuar só depois do segurar de demonstração. O `OnboardingDialog` aceita a prop `skipPractice` (padrão `false`), que libera o Continuar sem o segurar; o teste a usa.

Os diálogos recebem as props `app: AppState` e `open: boolean`. O `SessionsDialog` mostra um título `<h3>` por evento, com o `name` do evento, e tem o botão "Criar".

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd app && pnpm test -- platform ajustes-screen data-section dialogs`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Siga o "Comportamento" acima. O `<input type="file">` tem `aria-label="Importar arquivo"`. No `ImportDialog`, cada `<select>` de evento tem `aria-label="Evento de {nome da sessão}"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd app && pnpm test && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src app/tests/unit
git commit -m "feat(app): Ajustes com Seus dados, importar e exportar, cópias, lixeira e diálogos" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 13: PWA, testes ponta a ponta e acessibilidade

**Files:**
- Create:
  - `app/playwright.config.ts`
  - `app/tests/e2e/timer.spec.ts`, `app/tests/e2e/data.spec.ts`, `app/tests/e2e/events.spec.ts`, `app/tests/e2e/a11y.spec.ts`, `app/tests/e2e/offline.spec.ts`
  - `app/public/icon.svg`, `app/scripts/make-icons.mjs`, `app/public/icon-192.png`, `app/public/icon-512.png`, `app/public/apple-touch-icon.png`
  - `app/src/ui/dialogs/UpdatePrompt.svelte`
- Modify: `app/vite.config.ts`, `app/src/main.ts`, `app/index.html`, `app/src/ui/App.svelte`

**Interfaces:**
- Consumes: o app completo (Tasks 1 a 12).
- Produces: o build do PWA (service worker e manifesto) e a suíte ponta a ponta (`pnpm test:e2e`).

- [ ] **Step 1: Ícones**

- `app/public/icon.svg`: o glifo do Klick, uma grade 3×3 de quadrados arredondados em `#17171a` com o do centro em `#d93d42`, sobre o fundo `#f3f0e9`, com 12% de respiro. É o mesmo desenho do `.glyph` do protótipo.
- `app/scripts/make-icons.mjs`: usa o Chromium do Playwright para renderizar o SVG em PNG de 192, 512 e 180 px (`apple-touch-icon.png`) e salva em `public/`.
- Rode o script uma vez e commite os PNGs.

- [ ] **Step 2: PWA**

Em `app/vite.config.ts`, acrescente:

```ts
import { VitePWA } from 'vite-plugin-pwa';
// …
VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['icon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'Klick', short_name: 'Klick', lang: 'pt-BR', start_url: '/', scope: '/', display: 'standalone',
    background_color: '#121110', theme_color: '#121110',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
    cleanupOutdatedCaches: true,
    navigateFallback: 'index.html',
  },
}),
```

Mantenha também `worker: { format: 'es' }` no `defineConfig`.

Em `main.ts`:
- registre o service worker com `registerSW({ onNeedRefresh() { … } })` de `virtual:pwa-register`, guardando a função de atualizar;
- `UpdatePrompt.svelte` mostra "Nova versão disponível. Recarregar" só quando o timer não está em inspeção, armando, pronto ou resolvendo; o botão chama `updateSW(true)`.

Em `index.html`: `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` e `<link rel="icon" href="/icon.svg" type="image/svg+xml">`.

- [ ] **Step 3: Playwright**

```bash
cd app
pnpm exec playwright install chromium
```

`app/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4321', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm build && pnpm preview --port 4321 --strictPort --host 127.0.0.1', url: 'http://127.0.0.1:4321', reuseExistingServer: false, timeout: 180_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /timer\.spec\.ts/ },
  ],
});
```

- [ ] **Step 4: Escrever os testes ponta a ponta**

`app/tests/e2e/timer.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

async function start(page: import('@playwright/test').Page) {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await expect(page.locator('[data-scramble]')).not.toHaveText('');
}

test('solve no teclado é gravado antes da reação e sobrevive a recarregar', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  await start(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.locator('[data-toggle="inspection"]').uncheck();
  await page.getByRole('button', { name: 'Timer' }).click();
  await page.keyboard.down('Space');
  await page.clock.runFor(400);
  await page.keyboard.up('Space');
  await page.clock.runFor(12_345);
  await page.keyboard.press('a');
  await expect(page.locator('[data-time]')).toContainText('0:12.');
  await page.reload();
  await page.getByRole('button', { name: 'Evolução' }).click();
  await expect(page.locator('.hist tbody tr')).toHaveCount(1);
});

test('inspeção: largar depois de 15 s dá +2', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  await start(page);
  await page.keyboard.press('Space');
  await page.clock.runFor(15_500);
  await page.keyboard.down('Space');
  await page.clock.runFor(400);
  await page.keyboard.up('Space');
  await page.clock.runFor(5_000);
  await page.keyboard.press('a');
  await expect(page.locator('[data-time]')).toContainText('+');
});

test('celular: dois polegares armam e o primeiro que sai larga', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'só no celular');
  await start(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.locator('[data-toggle="inspection"]').uncheck();
  await page.getByRole('button', { name: 'Timer' }).click();
  const zones = page.locator('[data-zone]');
  await zones.nth(0).dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true });
  await zones.nth(1).dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch', isPrimary: false });
  await page.clock.runFor(400);
  await zones.nth(0).dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch', isPrimary: true });
  await expect(page.locator('body')).toHaveClass(/solving/);
});
```

`app/tests/e2e/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';

export async function fresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await expect(page.locator('[data-scramble]')).not.toHaveText('', { timeout: 20_000 });
}

export async function quickSolve(page: Page) {
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('a');
}

export async function noInspection(page: Page) {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.locator('[data-toggle="inspection"]').uncheck();
  await page.getByRole('button', { name: 'Timer' }).click();
}
```

`app/tests/e2e/data.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fresh, noInspection, quickSolve } from './helpers';

test('duas abas: o solve de uma aparece na outra sem recarregar', async ({ context }) => {
  const a = await context.newPage();
  await fresh(a);
  await noInspection(a);
  const b = await context.newPage();
  await b.goto('/');
  await b.getByRole('button', { name: 'Evolução' }).click();
  await quickSolve(a);
  await expect(b.locator('.hist tbody tr')).toHaveCount(1);
});

test('exportar no formato Klick baixa o arquivo com o solve', async ({ page }) => {
  await fresh(page);
  await noInspection(page);
  await quickSolve(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar (Klick)' }).click()]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(JSON.parse(text).solves).toHaveLength(1);
});

test('importar do csTimer pede o evento da sessão desconhecida', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByLabel('Importar arquivo').setInputFiles('tests/fixtures/cstimer-export.txt');
  await page.getByLabel('Evento de ZBLL').selectOption('333');
  await page.getByRole('button', { name: 'Importar solves' }).click();
  await expect(page.getByText(/5 solves importados/)).toBeVisible();
});
```

`app/tests/e2e/events.spec.ts`. Usa o relógio real, porque o cubing.js roda num worker:

```ts
import { expect, test } from '@playwright/test';
import { fresh } from './helpers';

const EVENTS = ['333', '222', '444', '555', '666', '777', '333oh', '333bf', 'minx', 'pyram', 'skewb', 'sq1', 'clock'];

test('os 13 eventos geram embaralhamento oficial e imagem 2D', async ({ page }) => {
  test.setTimeout(180_000);
  await fresh(page);
  for (const ev of EVENTS) {
    await page.locator('[data-session-pill]').click();
    await page.getByLabel('Evento').selectOption(ev);
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page.locator('[data-scramble]')).not.toHaveText('', { timeout: 20_000 });
    await expect(page.locator('.scr-img twisty-player')).toHaveCount(1, { timeout: 20_000 });
  }
});
```

`app/tests/e2e/offline.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { fresh, noInspection, quickSolve } from './helpers';

test('depois da primeira visita, funciona offline e grava o solve', async ({ page, context }) => {
  await fresh(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-scramble]')).not.toHaveText('', { timeout: 20_000 });
  await noInspection(page);
  await quickSolve(page);
  await page.getByRole('button', { name: 'Evolução' }).click();
  await expect(page.locator('.hist tbody tr')).toHaveCount(1);
});
```

`app/tests/e2e/a11y.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fresh } from './helpers';

for (const scheme of ['light', 'dark'] as const) {
  test(`sem violações sérias de acessibilidade no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    for (const tab of ['Timer', 'Evolução', 'Centro', 'Ajustes']) {
      await page.getByRole('button', { name: tab }).first().click();
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${tab}: ${v.id}`)).toEqual([]);
    }
  });
}
```

- [ ] **Step 5: Rodar**

Run: `cd app && pnpm test && pnpm test:e2e`
Expected: tudo passa, nos projetos desktop e mobile.

- [ ] **Step 6: Commit**

```bash
git add app
git commit -m "feat(app): PWA instalável com aviso de nova versão e testes ponta a ponta com acessibilidade" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

---

### Task 14: Publicação em beta e documentação

**Files:**
- Create: `app/wrangler.jsonc`, `app/public/_headers`, `app/README.md`
- Modify: `README.md` (raiz do repo, link para o app)

**Interfaces:**
- Consumes: o build do app (Task 13).
- Produces: o app no ar em `https://beta.klick.ranimontagna.com`.

- [ ] **Step 1: Configuração de publicação**

`app/wrangler.jsonc`:

```jsonc
// Publica o app (dist/) em beta.klick.ranimontagna.com. A raiz do domínio continua com o protótipo.
{
  "name": "klick-app-beta",
  "account_id": "3a9dc0a9d9f05ff97021ce237e3ed92f",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "routes": [{ "pattern": "beta.klick.ranimontagna.com", "custom_domain": true }],
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application" }
}
```

`app/public/_headers`:

```
/*
  X-Content-Type-Options: nosniff
  X-Robots-Tag: noindex
/sw.js
  Cache-Control: no-cache
/vendor/*
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- [ ] **Step 2: README**

`app/README.md`, em pt-BR e curto, com:
- o que é;
- como rodar (`pnpm install`, `pnpm dev`);
- testar (`pnpm test`, `pnpm test:e2e`);
- build (`pnpm build`);
- publicar (`npx wrangler deploy` dentro de `app/`, depois do build);
- uma nota de que o cubing.js é empacotado à parte (`scripts/build-cubing.mjs`) e por quê.

No `README.md` da raiz, acrescente abaixo da lista existente:

```markdown
- App (sub-projeto 2): [`app/`](app/) — publicado em beta.klick.ranimontagna.com
```

- [ ] **Step 3: Conferir e commitar**

Run: `cd app && pnpm test && pnpm build`
Expected: PASS e build ok.

```bash
git add app/wrangler.jsonc app/public/_headers app/README.md README.md
git commit -m "chore(app): publicação em beta.klick.ranimontagna.com e README" -m "Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

- [ ] **Step 4: Publicar (controlador)**

Rode a partir de `app/`:

```bash
npx --yes wrangler@4 deploy
```

Confira:
1. `https://beta.klick.ranimontagna.com` abre o app (título "Klick"), sem erro no console;
2. o service worker registra;
3. um embaralhamento de 4×4 aparece;
4. um solve sobrevive a recarregar.

A raiz `klick.ranimontagna.com` continua com o protótipo.
