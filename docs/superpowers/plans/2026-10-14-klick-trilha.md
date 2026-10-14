# Trilha de aprendizado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As aulas das 9 etapas da trilha, com o cubo animado do cubing.js, e um treino de algoritmos (OLL e PLL em 2 passos, F2L com os 41 casos) com timer, níveis e sorteio, fora das estatísticas; todo algoritmo e todo passo de aula conferidos por teste com o cubing.js.
**Architecture:** Núcleo puro em `app/src/core/trail/` (tipos, quadro e máscaras, casos, aulas, treino e validação, sem cubing.js em tempo de execução); a store `practice` no banco versão 2 e o treino na exportação, importação, restauração e cópias (`app/src/data/`); trilha e treino no `AppState`; a aba Trilha em `app/src/ui/trilha/`, carregada sob demanda (começo, leitor de aula com o TwistyPlayer atrás do adaptador `cube-view.ts`, conjunto e rodada com o núcleo do timer); a piscada lateral no comportamento do Centro; a pergunta no tour.
**Tech Stack:** Svelte 5 (runes), Vite 8, TypeScript estrito, pnpm 11, idb, cubing.js 0.65.1 (já no app, carregado de `public/vendor/cubing`), Vitest 5 + jsdom + fake-indexeddb + @testing-library/svelte, Playwright + axe. Nenhuma dependência nova.
**Spec:** docs/superpowers/specs/2026-10-14-klick-trilha-design.md

Leia a seção da spec que a tarefa cita antes de começar. Este plano foi ensaiado inteiro numa cópia do app antes de ser escrito: o código de cada passo passou nos testes de unidade, no `pnpm check`, nos ponta a ponta e na conferência no navegador. Copie o código como está.

## Decisões tomadas (desvios do texto da spec)

Estas decisões valem por cima do texto da spec. A Task 13 (Step 3) atualiza a spec para registrá-las.

1. **Quadro.** Aulas e treino mostram amarelo em cima, branco embaixo e verde na frente: é o padrão do cubing.js depois de `z2`. O TwistyPlayer recebe `experimentalSetupAlg: 'z2 ' + setup`. Na ordem do 3×3 do cubing (EDGES UF UR UB UL DF DR DB DL FR FL BR BL; CORNERS UFR URB UBL ULF DRF DFL DLB DBR; CENTERS U L F R B D), depois de `z2` as peças são EDGES `[4,7,6,5,0,3,2,1,9,8,11,10]`, CORNERS `[5,6,7,4,3,0,1,2]` e CENTERS `[5,3,2,1,4,0]`, todas com orientação 0. Ficam como constantes em `core/trail/frame.ts`, conferidas por teste contra `kpuzzle.defaultPattern().applyAlg('z2')`.
2. **Etapas.** `Stage = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'yellowCross' | 'llEdges' | 'llCorners' | 'oll' | 'solved'` ("segunda camada" é `f2l`, "última camada" é `solved`). `LessonCube = { setup; alg?; view: '3D' | 'top' | 'below'; mask?: MaskKind; from?: Stage; ends?: Stage }`: o `stickering` da spec vira `mask`, e `from` é novo (o que o setup já cumpre). Os testes conferem `from` no setup, `ends` depois do setup e do alg, e que `ends` não vale no setup. `solved`, `llEdges` e `llCorners` aceitam um giro de cima.
3. **Máscaras.** O `experimentalStickeringMaskOrbits` recebe `EDGES:<12>,CORNERS:<8>,CENTERS:<6>`, com `-` normal, `D` apagado, `I` cinza, `O` só o adesivo de cima ou de baixo (estilo OLL) e `P` esse adesivo apagado e os lados normais (estilo PLL). A máscara vale pela identidade da peça, então é calculada pela posição no nosso quadro e levada à peça `REF[p]`. Tipos: `daisy` e `cross` (arestas brancas e centros), `firstLayer` (mais os cantos brancos), `f2l` (mais as arestas do meio), `eoll` (F2L apagado, arestas amarelas `O`, cantos amarelos cinza), `oll` (F2L apagado, peças de cima `O`), `pll` e `ll` (F2L apagado, peças de cima normais). A Task 10 tem a conferência no navegador, com os dois caminhos.
4. **TwistyPlayer (cubing.js 0.65.1).** Atrás da interface `CubeView` (`ui/trilha/cube-view.ts`), para as telas serem testadas com ele simulado; carregado pelo loader de sempre, montado uma vez por aula e desmontado ao sair. Sem WebGL, ou se o cubing.js falhar, a figura 2D (o `ExperimentalSVGAnimator`, como a imagem do embaralhamento) e nenhum controle de movimento.
5. **Embaralhamento do treino.** `tidyAlg(pré + invertAlg(algoritmo) + pós)`, com pré e pós sorteados entre `''`, `U`, `U2` e `U'` por um sorteio injetado. `invertAlg` é puro (apóstrofo, 2, camadas largas como `f` e `r`, fatias M, E e S, rotações x, y e z) e é conferido contra `new Alg(s).invert().toString()` em todo algoritmo e todo setup dos dados.
6. **F2L.** Os 41 casos têm a numeração do app, por grupos: `F2L 1` a `F2L 24` com canto e aresta em cima, 25 a 30 com o canto em cima e a aresta no lugar, 31 a 36 com o canto no lugar e a aresta em cima, 37 a 41 com os dois no lugar. Os testes provam que são exatamente as 41 classes (onde estão o canto e a aresta do par da frente-direita, com qualquer giro de cima), sem repetir, que cada setup deixa a cruz e os outros 3 pares prontos, e que todo algoritmo de `algs` resolve o próprio caso (F2L no `f2l`; cruz amarela nos 3 casos da cruz da `oll2`; topo amarelo nos 7 de cantos; o cubo na `pll2`). Na OLL da cruz: 0, 2 vizinhas e 2 opostas arestas orientadas; na PLL, T e Y mexem nos cantos, e Ua, Ub, H e Z não.
7. **Níveis, sorteio e dados** exatamente como as seções 7.3 e 9 da spec: `Practice`, `DB_VERSION` 2 com a store `practice` (índices `byCase` e `byAt`), `profile.lessonAt`, `algChoice` e `trainOff`, `meta.trailPromptDismissed`; funções puras em `core/trail/`, com o sorteio injetado.
8. **Piscada lateral.** O `behavior.ts` ganha o gatilho `'trailStep'` (a face lateral apaga e acende em 400 ms, mais curta que os 600 ms da de cima). Estático ou movimento reduzido: não pisca. Sai de "Consegui no meu cubo" e de "já sei" (marcar, não desmarcar).
9. **Navegação.** `Tab` ganha `'trilha'`: cinco abas, na ordem Timer, Evolução, Trilha, Centro e Ajustes, com os atalhos 1 a 5 na mesma ordem e a tela de atalhos em dia. A lista das etapas sai da aba Centro e vira uma linha de resumo que leva à Trilha. O tour ganha o último passo "Já resolve o cubo?" (spec 8.5).

Decisões acrescentadas por este plano:

- **A1.** A figura do treino usa a máscara `pair` no F2L (a cruz e o par da frente-direita em destaque, os outros pares apagados, a camada de cima cinza) e `eoll` nos 3 casos da cruz amarela.
- **A2.** O embaralhamento junta giros seguidos da mesma camada e escreve o 2 sem apóstrofo (`tidyAlg`). O estado não muda; o `invertAlg` continua escrevendo como o cubing.js (`U2'`).
- **A3.** A vista de baixo usa `cameraLatitude: -35`: o cubing.js limita a latitude a ±35° (um -40 viraria -35). A de cima volta a 35 e a longitude fica em 30, o padrão dele.
- **A4.** No treino, o tempo que conta é o da tentativa certa e sem ajuda (média de 5 e melhor tempo); a média do conjunto é a média das médias de 5 dos casos que têm uma; "melhor tempo do caso" é bater o melhor anterior (a primeira tentativa não conta).
- **A5.** Um dia só de treino também ganha a cópia do dia: a primeira tentativa depois de uma cópia leva `solvesSinceBackup` de 0 a 1.
- **A6.** Restaurar uma cópia sem `practice` (de antes desta versão) não apaga o treino daqui, e um perfil sem os campos do treino mantém os daqui. Importar junta `algChoice` e `lessonAt` caso a caso (vale o do arquivo); `trainOff` é o do arquivo.
- **A7.** `app.trainerRunning`: enquanto o timer do treino roda, a tela do Timer (sempre montada, ouvindo o teclado) não age, para a tecla que para o treino não trocar de aba nem abrir os atalhos.
- **A8.** A aba Trilha carrega sob demanda (`import()` no `App.svelte`), e `core/trail/lessons.ts` só entra nesse pedaço. `cases.ts` vai no código da abertura: a validação do arquivo precisa dos ids.
- **A9.** O passo 4 do tour junta a pergunta e as duas respostas: "Ainda não" e, abaixo de "Já resolvo", as opções de sempre. "Pular apresentação" vai a ele; os nomes que o `fresh()` dos ponta a ponta usa não mudam.
- **A10.** O passo da aula é guardado a cada troca de passo (sair a qualquer momento retoma dali), e um passo guardado além do fim cai no último.
- **A11.** A tela de atalhos ganha "← →" (a aula) e "Enter" (o treino).

## Global Constraints

- **Onde:** o app fica em `app/` (Svelte 5 runes, Vite 8, TypeScript estrito, pnpm 11), na branch `v2`; todo comando roda dentro de `app/` (`cd /Users/raniellimontagna/Projetos/pessoal/klick/app`).
- **Commits:** um por tarefa, local, mensagem em português no estilo `feat(app): …` / `test(app): …`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git push`, nunca deploy: o controlador publica no beta no fim.
- **Textos:** tudo o que a pessoa lê é pt-BR e fica em `app/src/strings.ts` (o grupo `T.trilha` e os vizinhos); voz calma, sem emoji, sem culpa.
- **Comentários e testes:** comentários de código em português, na densidade do arquivo ao redor (dizem o porquê e o contrato); nomes de teste em português.
- **Nada novo de fora:** nenhuma dependência nova. O cubing.js chega em tempo de execução pelo loader (`src/scramble/cubing-loader.ts`, de `public/vendor/cubing`); `scripts/cubing-entry.js` já exporta `TwistyPlayer` e `ExperimentalSVGAnimator` e não muda. Os testes importam `cubing/alg`, `cubing/kpuzzle` e `cubing/puzzles` direto do node_modules (no jsdom funcionam; se um dia não funcionarem, use o comentário `// @vitest-environment node` nos arquivos de conteúdo).
- **Comandos:** um arquivo de teste `pnpm exec vitest run tests/unit/<arquivo>` (não `pnpm test -- <arquivo>`, que roda tudo); a suíte `pnpm test` (com a máquina cheia, `pnpm test -- --maxWorkers=4`); ponta a ponta `pnpm test:e2e tests/e2e/<arquivo>` (sem `--`); tipos `rtk proxy pnpm check` (o `rtk` sem `proxy` esconde erro de tipo).
- **Nunca perde dados:** o treino entra na exportação, na cópia do dia e na restauração; um arquivo antigo sem `practice` continua entrando; a migração do banco não toca em solves, sessões, perfil, meta nem cópias.
- **Treino separado:** nada do treino toca em sessões, solves, recordes, temporadas, marcos ou no coach do Timer.
- **Conteúdo conferido:** as aulas e os casos entram como estão neste plano (texto e algoritmos já conferidos com o cubing.js). Nenhum algoritmo nem passo de aula muda sem passar nos testes de conteúdo.
- **Movimento:** "reduzir movimento" e o Centro estático valem na Trilha: nada toca sozinho e nada pisca.
- **Prazos de teste:** só crescem com o motivo escrito no próprio teste (os dois deste plano: a aba Trilha carrega sob demanda).

## Review Focus

Os cinco casos que a spec implica, que nenhum teste das tarefas pegaria por acaso e que mais devem morder alguém de verdade, do mais provável ao menos:

1. **Parar o treino com uma tecla de número ou `?`.** A tela do Timer fica montada e ouve o teclado mesmo escondida: a tecla que para o treino trocaria de aba ou abriria os atalhos. Teste na Task 11: "a tecla que para o treino não troca de aba nem abre os atalhos".
2. **Enter com "Errei" focado.** O Enter do documento marcaria "Acertei" e o clique do botão, "Errei" (duas marcações, ou a errada). Teste na Task 11: "Enter num botão focado é do botão".
3. **Restaurar uma cópia de antes do treino.** As cópias do dia anteriores a esta versão não têm `practice`: restaurar uma delas apagaria o treino e as escolhas. Testes na Task 6: "restaurar troca o treino pelo da cópia; uma cópia de antes do treino não apaga o daqui" e "restaurar uma cópia de antes do treino mantém a escolha de algoritmos…".
4. **Um dia só de treino.** A cópia do dia só sai com `solvesSinceBackup > 0`: quem só treina nunca teria cópia do treino. Teste na Task 7: "um dia só de treino marca a cópia do dia".
5. **Toques seguidos no perfil.** "já sei" em duas etapas, a escolha de algoritmo e o sorteio gravam o perfil inteiro: duas gravações seguidas perderiam uma. Teste na Task 7: "dois toques seguidos em etapas diferentes não se perdem".

## File Structure

| Arquivo | Papel | Tarefas |
|---|---|---|
| `app/src/core/trail/types.ts` (novo) | Tipos da trilha: etapas, máscaras, aulas, casos | 1 |
| `app/src/core/trail/frame.ts` (novo) | Quadro (z2), máscaras, `invertAlg`, `tidyAlg`, `AUF` | 1 |
| `app/src/core/trail/cases.ts` (novo) | Os 57 casos do treino e a escolha de algoritmo | 2 |
| `app/src/core/trail/lessons.ts` (novo) | As 9 aulas | 3 |
| `app/src/core/trail/train.ts` (novo) | Níveis, números por caso, pesos, sorteio, embaralhamento | 4 |
| `app/src/core/trail/validate.ts` (novo) | O que vem de fora: tentativas e campos do perfil | 6 |
| `app/src/core/types.ts` | `Practice`; `Profile` e `Meta` ganham campos | 4, 5 |
| `app/src/data/db.ts` | `DB_VERSION` 2, store `practice` | 5 |
| `app/src/data/repository.ts` | Padrões, métodos do treino, exportar, importar, restaurar | 5, 6 |
| `app/src/data/transfer.ts` | Validação do treino e do perfil no arquivo | 6 |
| `app/src/ui/state/app.svelte.ts` | Trilha e treino no estado; `Tab` `'trilha'` | 5, 7 |
| `app/src/ui/centro/behavior.ts`, `animator.ts`, `app/src/ui/centro.ts` | A piscada lateral `'trailStep'` | 8 |
| `app/src/strings.ts` | `T.tabs.trilha`, atalhos, `T.centro.trailSummary`, `T.trilha`, `T.onboarding` | 9, 10, 11, 12 |
| `app/src/ui/App.svelte` | A quinta aba, o ícone e a tela sob demanda | 9 |
| `app/src/ui/timer/input.ts`, `TimerScreen.svelte` | Tecla 5; os atalhos esperam o treino | 9, 11 |
| `app/src/styles/screens.css` | Barra de baixo com 5 colunas | 9 |
| `app/src/ui/centro/CentroScreen.svelte` | A lista das etapas vira o resumo | 9 |
| `app/src/ui/trilha/TrilhaScreen.svelte` (novo) | A aba: começo, aula, conjunto e rodada | 9, 10, 11 |
| `app/src/ui/trilha/TrailHome.svelte`, `MiniCentro.svelte` (novos) | O começo da aba e o Centro pequeno | 9 |
| `app/src/scramble/cubing-loader.ts` | Tipos: `llSVG` e a máscara do animador 2D | 10 |
| `app/src/ui/trilha/cube-view.ts`, `LessonPlayer.svelte` (novos) | O cubo das aulas e o leitor | 10 |
| `app/src/ui/trilha/CaseFigure.svelte`, `SetView.svelte`, `TrainRound.svelte` (novos) | A figura do caso, o conjunto e a rodada | 11 |
| `app/src/ui/dialogs/OnboardingDialog.svelte` | A pergunta do tour | 12 |
| `app/tests/unit/trail-cube.ts` (novo) | Apoio dos testes de conteúdo: o cubo de verdade e os verificadores | 1 |
| `app/tests/unit/*.test.ts`, `app/tests/e2e/trilha.spec.ts`, `a11y.spec.ts` | Testes | todas |
| `docs/superpowers/specs/2026-10-14-klick-trilha-design.md` | A spec registra as decisões | 13 |

---

### Task 1: Quadro das aulas, máscaras e inverso de algoritmo

Spec: seções 5.1, 5.2 e 5.6 (e as decisões 1, 2, 3 e 5 do começo deste plano).

**Files:**
- Create: `app/src/core/trail/types.ts` (os tipos da trilha, usados por todas as tarefas seguintes)
- Create: `app/src/core/trail/frame.ts`
- Create: `app/tests/unit/trail-cube.ts` (apoio dos testes de conteúdo: não é arquivo de teste)
- Test: `app/tests/unit/trail-frame.test.ts`

**Interfaces:**
- Consumes: nada do app. Os testes usam `cubing/alg` (`Alg`), `cubing/kpuzzle` (`KPattern`) e `cubing/puzzles` (`cube3x3x3`) do node_modules.
- Produces (em `core/trail/types.ts`): `TrailStep`, `CaseSet`, `Stage`, `MaskKind`, `CubeAngle`, `LessonCube`, `LessonPart`, `Lesson`, `TrainCase`, exatamente como no Step 3.
- Produces (em `core/trail/frame.ts`):
  - `REF_EDGES: readonly number[]`, `REF_CORNERS: readonly number[]`, `REF_CENTERS: readonly number[]`
  - `maskOrbits(kind: MaskKind): string` (o texto de `experimentalStickeringMaskOrbits`)
  - `interface StickeringMaskLike { orbits: Record<string, { pieces: { facelets: string[] }[] }> }` e `maskObject(kind: MaskKind): StickeringMaskLike` (a mesma máscara para o `ExperimentalSVGAnimator`)
  - `invertAlg(alg: string): string`, `AUF: readonly string[]`, `tidyAlg(alg: string): string`
- Produces (em `tests/unit/trail-cube.ts`): `kp`, `REF`, `AUF`, `stage: Record<Stage, (p: KPattern) => boolean>`, `at(setup, alg?)`, `inv(alg)`, `solves(p, alg, done)`, `topEdgesOriented(p)`, `topCornersPlaced(p)`, `otherSlotsSolved(p)`, `f2lClass(p)`, `allF2lClasses()`, `pairPlace(p)`, `topOrientationKey(p)`, `topPiecesKey(p)`.

- [ ] **Step 1: Escreva o apoio dos testes e os testes que falham**

O apoio porta para TypeScript a conferência que validou o conteúdo deste plano (o spike `cube.mjs`, `emit.mjs`, `ll.mjs` e `f2l.mjs`): o cubo de verdade no quadro das aulas (`REF` é o padrão do cubing.js depois de `z2`), os verificadores de etapa e as 41 classes de F2L.

Crie `app/tests/unit/trail-cube.ts`:

```ts
// Apoio dos testes da trilha (spec 5.6): o cubo de verdade, pelo cubing.js do node_modules, no quadro das aulas (amarelo em cima,
// branco embaixo, verde na frente), e os verificadores de etapa. Não é um arquivo de teste: os trail-*.test.ts importam daqui.
import { Alg } from 'cubing/alg';
import { KPattern } from 'cubing/kpuzzle';
import { cube3x3x3 } from 'cubing/puzzles';
import type { Stage } from '../../src/core/trail/types';

export const kp = await cube3x3x3.kpuzzle();
export const REF = kp.defaultPattern().applyAlg('z2');
export const AUF = ['', 'U', 'U2', "U'"] as const;

type Orbit = 'EDGES' | 'CORNERS' | 'CENTERS';
const pieceAt = (p: KPattern, o: Orbit, i: number): number => p.patternData[o].pieces[i];
const oriAt = (p: KPattern, o: Orbit, i: number): number => p.patternData[o].orientation[i];
// Nas posições dadas, a mesma peça com a mesma orientação do resolvido.
const sameAt = (p: KPattern, o: Orbit, positions: readonly number[]): boolean =>
  positions.every((i) => pieceAt(p, o, i) === pieceAt(REF, o, i) && oriAt(p, o, i) === oriAt(REF, o, i));
const orientedAt = (p: KPattern, o: Orbit, positions: readonly number[]): boolean => positions.every((i) => oriAt(p, o, i) === 0);
const placedAt = (p: KPattern, o: Orbit, positions: readonly number[]): boolean => positions.every((i) => pieceAt(p, o, i) === pieceAt(REF, o, i));
const withAuf = (p: KPattern, test: (q: KPattern) => boolean): boolean => AUF.some((u) => test(p.applyAlg(u)));

const TOP = [0, 1, 2, 3];
const BOTTOM = [4, 5, 6, 7];
const MIDDLE = [8, 9, 10, 11];
const CENTERS = [0, 1, 2, 3, 4, 5];
const WHITE_EDGES = BOTTOM.map((i) => pieceAt(REF, 'EDGES', i));

// Os verificadores de etapa, como no spike de conferência (cube.mjs e emit.mjs). 'solved', 'llEdges' e 'llCorners' aceitam um giro de cima.
export const stage: Record<Stage, (p: KPattern) => boolean> = {
  daisy: (p) => TOP.every((i) => WHITE_EDGES.includes(pieceAt(p, 'EDGES', i)) && oriAt(p, 'EDGES', i) === 0),
  cross: (p) => sameAt(p, 'CENTERS', CENTERS) && sameAt(p, 'EDGES', BOTTOM),
  firstLayer: (p) => stage.cross(p) && sameAt(p, 'CORNERS', BOTTOM),
  f2l: (p) => stage.firstLayer(p) && sameAt(p, 'EDGES', MIDDLE),
  yellowCross: (p) => stage.f2l(p) && orientedAt(p, 'EDGES', TOP),
  llEdges: (p) => stage.yellowCross(p) && withAuf(p, (q) => placedAt(q, 'EDGES', TOP)),
  llCorners: (p) => stage.yellowCross(p) && withAuf(p, (q) => placedAt(q, 'EDGES', TOP) && placedAt(q, 'CORNERS', TOP)),
  oll: (p) => stage.yellowCross(p) && orientedAt(p, 'CORNERS', TOP),
  solved: (p) => withAuf(p, (q) => q.isIdentical(REF)),
};

// O estado depois de `setup` e `alg`, a partir do resolvido no quadro das aulas.
export const at = (setup: string, alg = ''): KPattern => REF.applyAlg(setup).applyAlg(alg);
// O inverso pelo próprio cubing.js: é contra ele que o invertAlg do app é conferido.
export const inv = (alg: string): string => new Alg(alg).invert().toString();
// `alg` resolve `p` até `done`, com um giro de cima antes (o AUF de quem olha o caso).
export const solves = (p: KPattern, alg: string, done: (q: KPattern) => boolean): boolean => AUF.some((u) => done(p.applyAlg(u).applyAlg(alg)));

// As arestas de cima já orientadas (amarelo para cima), por posição: UF 0, UR 1, UB 2, UL 3.
export const topEdgesOriented = (p: KPattern): number[] => TOP.filter((i) => oriAt(p, 'EDGES', i) === 0);
// Os cantos de cima no lugar com algum giro de cima (orientação à parte).
export const topCornersPlaced = (p: KPattern): boolean => withAuf(p, (q) => placedAt(q, 'CORNERS', TOP));
// A cruz e os três outros pares (frente-esquerda, trás-esquerda e trás-direita) intactos.
export const otherSlotsSolved = (p: KPattern): boolean => stage.cross(p) && sameAt(p, 'CORNERS', [5, 6, 7]) && sameAt(p, 'EDGES', [9, 10, 11]);

// --- As 41 classes de F2L (como o spike f2l.mjs): onde estão o canto e a aresta do par da frente-direita, módulo o giro de cima ---

const PAIR_CORNER = pieceAt(REF, 'CORNERS', 4); // a peça do canto DRF
const PAIR_EDGE = pieceAt(REF, 'EDGES', 8); // a peça da aresta FR

export function f2lClass(p: KPattern): string {
  const one = (q: KPattern): string => {
    const c = q.patternData.CORNERS;
    const e = q.patternData.EDGES;
    const ci = c.pieces.indexOf(PAIR_CORNER);
    const ei = e.pieces.indexOf(PAIR_EDGE);
    return `c${ci}:${c.orientation[ci]} e${ei}:${e.orientation[ei]}`;
  };
  return AUF.map((u) => one(p.applyAlg(u))).sort()[0];
}

// O resolvido com o canto do par na posição cPos (0 a 3 em cima, 4 no lugar) e orientação cOri, e a aresta em ePos (0 a 3 em cima,
// 8 no lugar) e orientação eOri. Só serve para a chave da classe (a troca de peças pode não ser um estado alcançável).
function placed(cPos: number, cOri: number, ePos: number, eOri: number): KPattern {
  const data = structuredClone(REF.patternData);
  const put = (orbit: 'CORNERS' | 'EDGES', piece: number, pos: number, ori: number): void => {
    const o = data[orbit];
    const from = o.pieces.indexOf(piece);
    const other = o.pieces[pos];
    o.pieces[pos] = piece;
    o.orientation[pos] = ori;
    if (from !== pos) {
      o.pieces[from] = other;
      o.orientation[from] = 0;
    }
  };
  put('CORNERS', PAIR_CORNER, cPos, cOri);
  put('EDGES', PAIR_EDGE, ePos, eOri);
  return new KPattern(kp, data);
}

export function allF2lClasses(): Set<string> {
  const out = new Set<string>();
  for (const cPos of [0, 1, 2, 3, 4])
    for (const cOri of [0, 1, 2])
      for (const ePos of [0, 1, 2, 3, 8])
        for (const eOri of [0, 1]) {
          if (cPos === 4 && cOri === 0 && ePos === 8 && eOri === 0) continue; // o par resolvido
          out.add(f2lClass(placed(cPos, cOri, ePos, eOri)));
        }
  return out;
}

// Onde está o par da frente-direita: em cima (posições 0 a 3) ou não.
export function pairPlace(p: KPattern): { cornerTop: boolean; edgeTop: boolean } {
  return { cornerTop: p.patternData.CORNERS.pieces.indexOf(PAIR_CORNER) < 4, edgeTop: p.patternData.EDGES.pieces.indexOf(PAIR_EDGE) < 4 };
}

// A orientação das peças de cima, módulo o giro de cima: dois casos de OLL com a mesma chave seriam o mesmo caso.
export function topOrientationKey(p: KPattern): string {
  const key = (q: KPattern): string => TOP.map((i) => oriAt(q, 'EDGES', i)).join('') + '|' + TOP.map((i) => oriAt(q, 'CORNERS', i)).join('');
  return AUF.map((u) => key(p.applyAlg(u))).sort()[0];
}

// As peças de cima (lugar e orientação), módulo o giro de cima: dois casos de PLL com a mesma chave seriam o mesmo estado.
export function topPiecesKey(p: KPattern): string {
  const key = (q: KPattern): string => TOP.map((i) => `${pieceAt(q, 'EDGES', i)}:${oriAt(q, 'EDGES', i)}`).join(',') + '|' + TOP.map((i) => `${pieceAt(q, 'CORNERS', i)}:${oriAt(q, 'CORNERS', i)}`).join(',');
  return AUF.map((u) => key(p.applyAlg(u))).sort()[0];
}
```

Crie `app/tests/unit/trail-frame.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AUF as AUF_APP, invertAlg, maskObject, maskOrbits, REF_CENTERS, REF_CORNERS, REF_EDGES, tidyAlg } from '../../src/core/trail/frame';
import type { MaskKind } from '../../src/core/trail/types';
import { allF2lClasses, at, AUF, f2lClass, inv, kp, REF, stage } from './trail-cube';

// O desenho que a máscara dá à peça que mora na posição `pos` do nosso quadro resolvido.
function lookAt(kind: MaskKind, orbit: 'EDGES' | 'CORNERS', pos: number): string {
  const part = maskOrbits(kind).split(',').find((p) => p.startsWith(`${orbit}:`)) ?? '';
  const ref = orbit === 'EDGES' ? REF_EDGES : REF_CORNERS;
  return part.slice(orbit.length + 1)[ref[pos]];
}
const looks = (kind: MaskKind, orbit: 'EDGES' | 'CORNERS', positions: number[]): string => positions.map((p) => lookAt(kind, orbit, p)).join('');

describe('quadro da trilha (amarelo em cima, branco embaixo, verde na frente)', () => {
  it('as tabelas são o padrão do cubing.js depois de z2, sem nenhuma peça girada', () => {
    const z2 = kp.defaultPattern().applyAlg('z2').patternData;
    expect([...REF_EDGES]).toEqual(z2.EDGES.pieces);
    expect([...REF_CORNERS]).toEqual(z2.CORNERS.pieces);
    expect([...REF_CENTERS]).toEqual(z2.CENTERS.pieces);
    for (const orbit of ['EDGES', 'CORNERS', 'CENTERS'] as const) expect(z2[orbit].orientation.every((o) => o === 0)).toBe(true);
    expect(REF.isIdentical(kp.defaultPattern().applyAlg('z2'))).toBe(true);
  });

  it('o AUF do app são os quatro giros de cima, na ordem dos testes', () => {
    expect([...AUF_APP]).toEqual([...AUF]);
  });
});

describe('invertAlg escreve o inverso como o cubing.js', () => {
  const tricky = ["R U R' U'", 'U2', "U2'", "F R U R' U' F' f R U R' U' f'", "r U R' U' r' F R F'", "M' U M2 U M2 U M' U2 M2", 'x y2 z\'', "R2 D R' U2 R D' R' U2 R'", "E S' Rw", ''];
  it.each(tricky)('%s', (alg) => {
    expect(invertAlg(alg)).toBe(inv(alg));
  });

  it('espaços sobrando não mudam nada', () => {
    expect(invertAlg("  R   U ")).toBe("U' R'");
  });
});

describe('tidyAlg junta giros seguidos da mesma camada', () => {
  it.each([
    ["U R U' U", 'U R'],
    ["U2 R U R' U'", "U2 R U R' U'"],
    ["U U' R", 'R'],
    ["R U U' R", 'R2'],
    ["U2' F", 'U2 F'],
    ["U' U'", 'U2'],
    ["U2 U", "U'"],
    ['', ''],
  ])('%s → %s', (alg, tidy) => {
    expect(tidyAlg(alg)).toBe(tidy);
  });

  it('o estado do cubo não muda', () => {
    const alg = "U' R U R' U2 R U' R' U2 U";
    expect(at(tidyAlg(alg)).isIdentical(at(alg))).toBe(true);
  });
});

describe('máscaras: o destaque segue a peça (identidade do cubing), pela posição no nosso quadro', () => {
  it('cruz: as arestas brancas (embaixo) e os centros em destaque; o resto cinza', () => {
    expect(maskOrbits('cross')).toBe('EDGES:----IIIIIIII,CORNERS:IIIIIIII,CENTERS:------');
    expect(looks('cross', 'EDGES', [4, 5, 6, 7])).toBe('----');
    expect(looks('cross', 'EDGES', [0, 1, 2, 3, 8, 9, 10, 11])).toBe('IIIIIIII');
    expect(maskOrbits('daisy')).toBe(maskOrbits('cross'));
  });

  it('primeira camada: soma os cantos brancos', () => {
    expect(looks('firstLayer', 'CORNERS', [4, 5, 6, 7])).toBe('----');
    expect(looks('firstLayer', 'CORNERS', [0, 1, 2, 3])).toBe('IIII');
    expect(looks('firstLayer', 'EDGES', [8, 9, 10, 11])).toBe('IIII');
  });

  it('F2L: as duas primeiras camadas em destaque; a de cima cinza', () => {
    expect(looks('f2l', 'EDGES', [4, 5, 6, 7, 8, 9, 10, 11])).toBe('--------');
    expect(looks('f2l', 'EDGES', [0, 1, 2, 3])).toBe('IIII');
    expect(looks('f2l', 'CORNERS', [0, 1, 2, 3, 4, 5, 6, 7])).toBe('IIII----');
  });

  it('cruz amarela: F2L apagado, só o amarelo das arestas de cima, cantos de cima cinza', () => {
    expect(looks('eoll', 'EDGES', [0, 1, 2, 3, 4, 8])).toBe('OOOODD');
    expect(looks('eoll', 'CORNERS', [0, 1, 2, 3, 4])).toBe('IIIID');
  });

  it('OLL: só o amarelo de todas as peças de cima; PLL e última camada: as peças de cima inteiras', () => {
    expect(looks('oll', 'CORNERS', [0, 1, 2, 3, 7])).toBe('OOOOD');
    expect(looks('oll', 'EDGES', [0, 3, 11])).toBe('OOD');
    expect(looks('pll', 'EDGES', [0, 1, 2, 3, 5])).toBe('----D');
    expect(maskOrbits('ll')).toBe(maskOrbits('pll'));
  });

  it('par do treino de F2L: a cruz e o par da frente-direita em destaque, os outros pares apagados', () => {
    expect(lookAt('pair', 'CORNERS', 4)).toBe('-');
    expect(lookAt('pair', 'EDGES', 8)).toBe('-');
    expect(looks('pair', 'CORNERS', [5, 6, 7])).toBe('DDD');
    expect(looks('pair', 'EDGES', [4, 5, 6, 7, 9, 10, 11])).toBe('----DDD');
    expect(looks('pair', 'EDGES', [0, 1, 2, 3])).toBe('IIII');
  });

  it('o objeto da figura 2D tem o mesmo desenho, adesivo por adesivo', () => {
    const oll = maskObject('oll');
    expect(oll.orbits.EDGES.pieces[REF_EDGES[0]].facelets).toEqual(['regular', 'ignored', 'ignored', 'ignored', 'ignored']);
    expect(oll.orbits.CORNERS.pieces[REF_CORNERS[4]].facelets).toEqual(['dim', 'dim', 'dim', 'dim', 'dim']);
    expect(oll.orbits.CENTERS.pieces).toHaveLength(6);
    expect(maskObject('cross').orbits.EDGES.pieces[REF_EDGES[8]].facelets[0]).toBe('ignored');
  });
});

describe('verificadores de etapa (apoio dos testes)', () => {
  it('o resolvido cumpre todas as etapas, menos a margarida', () => {
    for (const s of ['cross', 'firstLayer', 'f2l', 'yellowCross', 'llEdges', 'llCorners', 'oll', 'solved'] as const) expect(stage[s](REF)).toBe(true);
    expect(stage.daisy(REF)).toBe(false);
  });

  it('a margarida: as quatro arestas brancas em cima, com o branco para cima', () => {
    expect(stage.daisy(at('F2 R2 B2 L2'))).toBe(true);
    expect(stage.cross(at('F2 R2 B2 L2'))).toBe(false);
    expect(stage.daisy(at('F2 R2 B2 L2 F'))).toBe(false);
  });

  it('cada etapa cai sozinha quando a peça dela sai do lugar', () => {
    expect(stage.cross(at('F'))).toBe(false);
    const corner = at("R U R'");
    expect(stage.cross(corner)).toBe(true);
    expect(stage.firstLayer(corner)).toBe(false);
    const sune = at("R U R' U R U2 R'");
    expect(stage.yellowCross(sune)).toBe(true);
    expect(stage.oll(sune)).toBe(false);
  });

  it('a última camada aceita um giro de cima no fim', () => {
    expect(stage.solved(at('U'))).toBe(true);
    expect(stage.solved(at("R U R' U'"))).toBe(false);
    const cornersOnly = at(inv("U R U' L' U R' U' L"));
    expect(stage.llEdges(cornersOnly)).toBe(true);
    expect(stage.llCorners(cornersOnly)).toBe(false);
    const twisted = at("R' D' R D R' D' R D U R' D' R D R' D' R D R' D' R D R' D' R D U'");
    expect(stage.llCorners(twisted)).toBe(true);
    expect(stage.solved(twisted)).toBe(false);
  });

  it('F2L: são 41 classes, e o giro de cima não muda a classe', () => {
    expect(allF2lClasses().size).toBe(41);
    const pairUp = at("R U' R'");
    expect(f2lClass(pairUp.applyAlg('U'))).toBe(f2lClass(pairUp));
    expect(allF2lClasses().has(f2lClass(pairUp))).toBe(true);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/trail-frame.test.ts`
Expected: FAIL. O motivo é `Failed to resolve import "../../src/core/trail/frame"` (e o de `types` logo depois).

- [ ] **Step 3: Escreva os tipos da trilha**

Crie `app/src/core/trail/types.ts`:

```ts
// Tipos da trilha (spec 5.1): o conteúdo das aulas e os casos do treino. Só tipos; em tempo de execução não sobra nada daqui.

export type TrailStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // índice em profile.trail
export type CaseSet = 'oll2' | 'pll2' | 'f2l';

// O que um estado do cubo já cumpre (os testes conferem com o cubing.js). A segunda camada da aula 3 é o 'f2l' (as duas primeiras
// camadas inteiras) e a última camada é o 'solved'. 'llEdges' e 'llCorners' valem com um giro de cima.
export type Stage = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'yellowCross' | 'llEdges' | 'llCorners' | 'oll' | 'solved';

// As peças em destaque; o resto fica apagado ou cinza (maskOrbits, em frame.ts). 'pair' é a figura do treino de F2L.
export type MaskKind = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'eoll' | 'oll' | 'pll' | 'll' | 'pair';

// O ângulo do cubo: 3D de cima, a camada de cima chapada ('top') ou 3D por baixo ('below', para ver a cruz branca).
export type CubeAngle = '3D' | 'top' | 'below';

export interface LessonCube {
  setup: string; // do resolvido (amarelo em cima, verde na frente) ao estado que o passo mostra
  alg?: string; // o que o passo toca; sem ele, o cubo só mostra o estado
  view: CubeAngle;
  mask?: MaskKind;
  from?: Stage; // o que o estado do setup já cumpre
  ends?: Stage; // o que setup + alg cumpre, e o setup sozinho não
}

export interface LessonPart {
  title: string;
  text: string; // 2 ou 3 frases
  tip?: string;
  cube?: LessonCube;
}

export interface Lesson {
  step: TrailStep;
  cases?: CaseSet; // etapas 7 a 9: o fim da aula oferece "Treinar os casos"
  parts: LessonPart[]; // de 4 a 8
}

export interface TrainCase {
  id: string; // 'oll2-sune', 'pll2-t', 'f2l-01'…; único em todos os conjuntos
  set: CaseSet;
  name: string;
  recog: string; // dica de reconhecimento
  algs: string[]; // de 1 a 3; o primeiro é o padrão
}
```

`view` é obrigatório (o leitor sempre sabe o ângulo); `mask` é o `stickering` da spec, e `from` é novo (decisão 2).

- [ ] **Step 4: Escreva `core/trail/frame.ts`**

A máscara vale pela identidade da peça (decisão 3): `byPiece` põe o desenho da posição `p` na peça `REF[p]`, a que mora ali no nosso quadro resolvido. O `PLANS` não passa por `Object.freeze`: com funções dentro, o TypeScript escolhe a sobrecarga de `Function` e o `pnpm check` falha.

Crie `app/src/core/trail/frame.ts`:

```ts
// O quadro das aulas e do treino (spec 5.2): amarelo em cima, branco embaixo, verde na frente. É o padrão do cubing.js depois de um
// z2, por isso o cubo 3D recebe 'z2 ' + setup. Puro: nada aqui importa o cubing em tempo de execução; os testes conferem as tabelas
// contra o kpuzzle de verdade.
//
// Ordem das posições no 3×3 do cubing: EDGES UF UR UB UL DF DR DB DL FR FL BR BL; CORNERS UFR URB UBL ULF DRF DFL DLB DBR;
// CENTERS U L F R B D. As tabelas REF_* dizem que peça (a identidade do cubing) mora em cada posição no nosso quadro resolvido.
import type { MaskKind } from './types';

export const REF_EDGES: readonly number[] = Object.freeze([4, 7, 6, 5, 0, 3, 2, 1, 9, 8, 11, 10]);
export const REF_CORNERS: readonly number[] = Object.freeze([5, 6, 7, 4, 3, 0, 1, 2]);
export const REF_CENTERS: readonly number[] = Object.freeze([5, 3, 2, 1, 4, 0]);

// Como uma peça aparece: '-' normal, 'D' apagada, 'I' cinza (ignorada), 'O' só o adesivo de cima ou de baixo (estilo OLL), 'P' esse
// adesivo apagado e os dos lados normais (estilo PLL). É a notação do experimentalStickeringMaskOrbits do TwistyPlayer.
type Look = '-' | 'D' | 'I' | 'O' | 'P';

const isTop = (pos: number): boolean => pos < 4; // camada de cima: as peças amarelas
const isBottom = (pos: number): boolean => pos >= 4 && pos < 8; // camada de baixo: as peças brancas
const FR_CORNER = 4; // DRF: o canto do par da frente-direita
const FR_EDGE = 8; // FR: a aresta do par da frente-direita

// O desenho de cada máscara pela POSIÇÃO no nosso quadro resolvido.
interface Plan {
  edge: (pos: number) => Look;
  corner: (pos: number) => Look;
}
const PLANS: Readonly<Record<MaskKind, Plan>> = {
  daisy: { edge: (p) => (isBottom(p) ? '-' : 'I'), corner: () => 'I' },
  cross: { edge: (p) => (isBottom(p) ? '-' : 'I'), corner: () => 'I' },
  firstLayer: { edge: (p) => (isBottom(p) ? '-' : 'I'), corner: (p) => (isBottom(p) ? '-' : 'I') },
  f2l: { edge: (p) => (isTop(p) ? 'I' : '-'), corner: (p) => (isTop(p) ? 'I' : '-') },
  eoll: { edge: (p) => (isTop(p) ? 'O' : 'D'), corner: (p) => (isTop(p) ? 'I' : 'D') },
  oll: { edge: (p) => (isTop(p) ? 'O' : 'D'), corner: (p) => (isTop(p) ? 'O' : 'D') },
  pll: { edge: (p) => (isTop(p) ? '-' : 'D'), corner: (p) => (isTop(p) ? '-' : 'D') },
  ll: { edge: (p) => (isTop(p) ? '-' : 'D'), corner: (p) => (isTop(p) ? '-' : 'D') },
  pair: {
    edge: (p) => (isTop(p) ? 'I' : isBottom(p) || p === FR_EDGE ? '-' : 'D'),
    corner: (p) => (isTop(p) ? 'I' : p === FR_CORNER ? '-' : 'D'),
  },
};

// A máscara do cubing vale pela IDENTIDADE da peça (o adesivo acompanha a peça quando ela anda), não pela posição. A peça que mora na
// posição p do nosso quadro é REF[p]: é ela que recebe o desenho de p.
function byPiece(ref: readonly number[], look: (pos: number) => Look): string {
  const out = Array<Look>(ref.length);
  ref.forEach((piece, pos) => {
    out[piece] = look(pos);
  });
  return out.join('');
}

// O texto que o TwistyPlayer recebe em experimentalStickeringMaskOrbits. Os centros ficam sempre normais: eles orientam a pessoa.
export function maskOrbits(kind: MaskKind): string {
  const plan = PLANS[kind];
  return `EDGES:${byPiece(REF_EDGES, plan.edge)},CORNERS:${byPiece(REF_CORNERS, plan.corner)},CENTERS:------`;
}

// A mesma máscara no formato de objeto que o ExperimentalSVGAnimator aceita (a figura 2D não lê o texto).
export interface StickeringMaskLike {
  orbits: Record<string, { pieces: { facelets: string[] }[] }>;
}

const FACELETS: Readonly<Record<Look, readonly string[]>> = Object.freeze({
  '-': ['regular', 'regular', 'regular', 'regular', 'regular'],
  D: ['dim', 'dim', 'dim', 'dim', 'dim'],
  I: ['ignored', 'ignored', 'ignored', 'ignored', 'ignored'],
  O: ['regular', 'ignored', 'ignored', 'ignored', 'ignored'],
  P: ['dim', 'regular', 'regular', 'regular', 'regular'],
});

export function maskObject(kind: MaskKind): StickeringMaskLike {
  const orbits: StickeringMaskLike['orbits'] = {};
  for (const part of maskOrbits(kind).split(',')) {
    const [name, looks] = part.split(':');
    orbits[name] = { pieces: [...looks].map((look) => ({ facelets: [...FACELETS[look as Look]] })) };
  }
  return { orbits };
}

const movesOf = (alg: string): string[] => alg.trim().split(/\s+/).filter((m) => m !== '');

// O inverso de um algoritmo, escrito como o Alg.invert do cubing.js escreve: a ordem ao contrário e o apóstrofo trocado em cada
// movimento (R → R', R' → R, R2 → R2', R2' → R2). Vale para faces, camadas largas (r, f), fatias (M, E, S) e rotações (x, y, z).
export function invertAlg(alg: string): string {
  return movesOf(alg)
    .reverse()
    .map((m) => (m.endsWith("'") ? m.slice(0, -1) : `${m}'`))
    .join(' ');
}

// Os quatro giros da camada de cima (nenhum, U, U2 e U'): o AUF do embaralhamento e da conferência.
export const AUF: readonly string[] = Object.freeze(['', 'U', 'U2', "U'"]);

// Junta movimentos seguidos da mesma camada (U U' some, U U vira U2) e escreve 2 sem apóstrofo. O estado não muda: só o texto fica
// como a pessoa espera ler.
export function tidyAlg(alg: string): string {
  const out: { face: string; turns: number }[] = [];
  for (const m of movesOf(alg)) {
    const face = m.replace(/['2]+$/, '');
    const turns = m.endsWith("2'") || m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1;
    const last = out.at(-1);
    if (last && last.face === face) {
      last.turns = (last.turns + turns) % 4;
      if (last.turns === 0) out.pop();
    } else out.push({ face, turns });
  }
  return out.map(({ face, turns }) => face + (turns === 1 ? '' : turns === 2 ? '2' : "'")).join(' ');
}
```

- [ ] **Step 5: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/trail-frame.test.ts`
Expected: PASS (34 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros (o `tests/unit/trail-cube.ts` também é conferido: o `tsconfig.app.json` inclui `tests/**/*.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/core/trail/types.ts src/core/trail/frame.ts tests/unit/trail-cube.ts tests/unit/trail-frame.test.ts
git commit -m "feat(app): quadro das aulas, máscaras e inverso de algoritmo da trilha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Casos do treino conferidos com o cubing.js

Spec: seções 5.4 e 5.6 (decisões 5 e 6).

**Files:**
- Create: `app/src/core/trail/cases.ts`
- Test: `app/tests/unit/trail-cases.test.ts`

**Interfaces:**
- Consumes: `TrainCase`, `CaseSet` (Task 1); `invertAlg` (Task 1); o apoio `tests/unit/trail-cube.ts` (Task 1).
- Produces (em `core/trail/cases.ts`):
  - `CASE_SETS: readonly CaseSet[]` (`['oll2', 'pll2', 'f2l']`)
  - `CASES: readonly TrainCase[]` (57 casos, na ordem das aulas)
  - `casesOf(set: CaseSet): TrainCase[]`, `caseById(id: string): TrainCase | undefined`
  - `choiceOf(c: TrainCase, algChoice: Readonly<Record<string, number>>): number` e `chosenAlg(c, algChoice): string`

- [ ] **Step 1: Escreva os testes que falham**

Os testes provam a decisão 6: cada algoritmo resolve o próprio caso (com o giro de cima antes), os 3 casos da cruz têm 0, 2 vizinhas e 2 opostas arestas orientadas, T e Y trocam cantos e Ua, Ub, H e Z não, e os 41 casos de F2L são exatamente as 41 classes, sem repetir, cada um mexendo só no par da frente-direita.

Crie `app/tests/unit/trail-cases.test.ts`:

```ts
import { Alg } from 'cubing/alg';
import { describe, expect, it } from 'vitest';
import { CASE_SETS, CASES, caseById, casesOf, choiceOf, chosenAlg } from '../../src/core/trail/cases';
import { invertAlg } from '../../src/core/trail/frame';
import type { TrainCase } from '../../src/core/trail/types';
import { allF2lClasses, at, f2lClass, inv, otherSlotsSolved, pairPlace, solves, stage, topCornersPlaced, topEdgesOriented, topOrientationKey, topPiecesKey } from './trail-cube';

// O estado que o caso mostra: o inverso do algoritmo padrão, a partir do resolvido.
const setupOf = (c: TrainCase) => at(inv(c.algs[0]));
const EDGE_CASES = ['oll2-linha', 'oll2-l', 'oll2-ponto'];
const oll = casesOf('oll2');
const pll = casesOf('pll2');
const f2l = casesOf('f2l');

describe('conjuntos do treino: integridade (spec 5.6)', () => {
  it('10 casos de OLL, 6 de PLL e 41 de F2L, nessa ordem de conjuntos', () => {
    expect([...CASE_SETS]).toEqual(['oll2', 'pll2', 'f2l']);
    expect([oll.length, pll.length, f2l.length]).toEqual([10, 6, 41]);
    expect(CASES).toHaveLength(57);
  });

  it('ids únicos, com o prefixo do conjunto; nome e dica de reconhecimento preenchidos; de 1 a 3 algoritmos', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) {
      expect(c.id.startsWith(`${c.set}-`)).toBe(true);
      expect(c.name.trim()).not.toBe('');
      expect(c.recog.trim()).not.toBe('');
      expect(c.algs.length).toBeGreaterThanOrEqual(1);
      expect(c.algs.length).toBeLessThanOrEqual(3);
      expect(new Set(c.algs).size).toBe(c.algs.length);
    }
  });

  it('todo algoritmo está em notação que o cubing.js entende, e o invertAlg do app escreve o mesmo inverso', () => {
    for (const c of CASES) {
      for (const a of c.algs) {
        expect(() => new Alg(a)).not.toThrow();
        expect(invertAlg(a)).toBe(inv(a));
      }
    }
  });

  it('caseById acha cada caso; chosenAlg cai no padrão quando a escolha não vale', () => {
    for (const c of CASES) expect(caseById(c.id)).toBe(c);
    expect(caseById('oll2-nada')).toBeUndefined();
    const h = caseById('oll2-h')!;
    expect(chosenAlg(h, {})).toBe(h.algs[0]);
    expect(chosenAlg(h, { 'oll2-h': 1 })).toBe(h.algs[1]);
    expect(choiceOf(h, { 'oll2-h': 2 })).toBe(0);
    expect(choiceOf(h, { 'oll2-h': -1 })).toBe(0);
    expect(choiceOf(h, { 'oll2-h': 0.5 })).toBe(0);
  });
});

describe('OLL em 2 passos', () => {
  it('os 3 casos da cruz: F2L pronto, sem cruz amarela; 0, 2 vizinhas e 2 opostas arestas orientadas', () => {
    const oriented = (id: string) => topEdgesOriented(setupOf(caseById(id)!));
    for (const id of EDGE_CASES) {
      const s = setupOf(caseById(id)!);
      expect(stage.f2l(s)).toBe(true);
      expect(stage.yellowCross(s)).toBe(false);
    }
    expect(oriented('oll2-ponto')).toEqual([]);
    const l = oriented('oll2-l');
    expect(l).toHaveLength(2);
    expect(Math.abs(l[0] - l[1]) % 2).toBe(1); // vizinhas: posições de paridade diferente
    const linha = oriented('oll2-linha');
    expect(linha).toHaveLength(2);
    expect(Math.abs(linha[0] - linha[1])).toBe(2); // opostas
  });

  it('os 7 casos dos cantos: cruz amarela pronta, topo não', () => {
    for (const c of oll.filter((x) => !EDGE_CASES.includes(x.id))) {
      const s = setupOf(c);
      expect(stage.yellowCross(s)).toBe(true);
      expect(stage.oll(s)).toBe(false);
    }
  });

  it('cada algoritmo resolve o próprio caso: a cruz nos 3 primeiros, o topo amarelo nos outros 7', () => {
    for (const c of oll) {
      const done = EDGE_CASES.includes(c.id) ? stage.yellowCross : stage.oll;
      for (const a of c.algs) expect(solves(setupOf(c), a, done), `${c.id}: ${a}`).toBe(true);
    }
  });

  it('nenhum caso repete outro (orientação de cima, com qualquer giro de cima)', () => {
    expect(new Set(oll.map((c) => topOrientationKey(setupOf(c)))).size).toBe(10);
  });
});

describe('PLL em 2 passos', () => {
  it('todo caso parte do topo amarelo e cada algoritmo resolve o cubo (com o giro final)', () => {
    for (const c of pll) {
      const s = setupOf(c);
      expect(stage.oll(s)).toBe(true);
      expect(stage.solved(s)).toBe(false);
      for (const a of c.algs) expect(solves(s, a, stage.solved), `${c.id}: ${a}`).toBe(true);
    }
  });

  it('T e Y trocam cantos; Ua, Ub, H e Z deixam os cantos no lugar', () => {
    const keeps = (id: string) => topCornersPlaced(setupOf(caseById(id)!));
    expect(['pll2-t', 'pll2-y'].map(keeps)).toEqual([false, false]);
    expect(['pll2-ua', 'pll2-ub', 'pll2-h', 'pll2-z'].map(keeps)).toEqual([true, true, true, true]);
  });

  it('nenhum caso repete outro', () => {
    expect(new Set(pll.map((c) => topPiecesKey(setupOf(c)))).size).toBe(6);
  });
});

describe('F2L com algoritmos', () => {
  it('ids f2l-01 a f2l-41 e nomes F2L 1 a F2L 41, em ordem', () => {
    expect(f2l.map((c) => c.id)).toEqual(Array.from({ length: 41 }, (_, i) => `f2l-${String(i + 1).padStart(2, '0')}`));
    expect(f2l.map((c) => c.name)).toEqual(Array.from({ length: 41 }, (_, i) => `F2L ${i + 1}`));
  });

  it('cada caso mexe só no par da frente-direita: a cruz e os outros três pares ficam prontos', () => {
    for (const c of f2l) {
      const s = setupOf(c);
      expect(otherSlotsSolved(s), c.id).toBe(true);
      expect(stage.f2l(s), c.id).toBe(false);
    }
  });

  it('os 41 casos são exatamente as 41 classes (canto e aresta do par, módulo o giro de cima), sem repetir', () => {
    const keys = f2l.map((c) => f2lClass(setupOf(c)));
    expect(new Set(keys).size).toBe(41);
    expect(new Set(keys)).toEqual(allF2lClasses());
  });

  it('os grupos da numeração: 1–24 os dois em cima, 25–30 só o canto em cima, 31–36 só a aresta em cima, 37–41 os dois no lugar', () => {
    const group = (n: number) => (n <= 24 ? [true, true] : n <= 30 ? [true, false] : n <= 36 ? [false, true] : [false, false]);
    f2l.forEach((c, i) => {
      const { cornerTop, edgeTop } = pairPlace(setupOf(c));
      expect([cornerTop, edgeTop], c.id).toEqual(group(i + 1));
    });
  });

  it('cada algoritmo resolve o próprio caso (F2L pronto, com o giro de cima antes)', () => {
    for (const c of f2l) for (const a of c.algs) expect(solves(setupOf(c), a, stage.f2l), `${c.id}: ${a}`).toBe(true);
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/trail-cases.test.ts`
Expected: FAIL com `Failed to resolve import "../../src/core/trail/cases"`.

- [ ] **Step 3: Escreva `core/trail/cases.ts`**

Os 57 casos vêm como estão: textos e algoritmos já conferidos com o cubing.js. Não reescreva nada; se um teste de conteúdo falhar, a cópia está errada.

Crie `app/src/core/trail/cases.ts`:

```ts
// Os casos do treino (spec 5.4): OLL em 2 passos (10), PLL em 2 passos (6) e F2L com algoritmos (41). A ordem é a das aulas: é nela que
// os casos novos aparecem no treino. O primeiro algoritmo de cada caso é o padrão, e o inverso dele monta o caso. Todos foram conferidos
// com o cubing.js (tests/unit/trail-cases.test.ts).
//
// F2L: a numeração é a do app, por grupos (o par é sempre o da frente-direita): 1 a 24 com canto e aresta em cima, 25 a 30 com o canto em
// cima e a aresta no lugar, 31 a 36 com o canto no lugar e a aresta em cima, 37 a 41 com os dois no lugar.
import type { CaseSet, TrainCase } from './types';

export const CASE_SETS: readonly CaseSet[] = Object.freeze(['oll2', 'pll2', 'f2l']);

export const CASES: readonly TrainCase[] = Object.freeze([
  { id: 'oll2-linha', set: 'oll2', name: 'Linha', recog: 'Duas arestas amarelas em linha, de um lado ao outro.', algs: ["F R U R' U' F'"] },
  { id: 'oll2-l', set: 'oll2', name: 'L', recog: 'Duas arestas amarelas vizinhas, formando um L.', algs: ["f R U R' U' f'"] },
  { id: 'oll2-ponto', set: 'oll2', name: 'Ponto', recog: 'Nenhuma aresta amarela em cima: só o centro.', algs: ["F R U R' U' F' f R U R' U' f'"] },
  { id: 'oll2-sune', set: 'oll2', name: 'Sune', recog: 'Um canto amarelo para cima; os outros três giram no mesmo sentido.', algs: ["R U R' U R U2 R'"] },
  { id: 'oll2-antisune', set: 'oll2', name: 'Anti-Sune', recog: 'Um canto amarelo para cima; os outros três giram no sentido contrário ao do Sune.', algs: ["R U2 R' U' R U' R'"] },
  { id: 'oll2-h', set: 'oll2', name: 'H', recog: 'Nenhum canto para cima; os amarelos dos cantos olham aos pares para a frente e para trás.', algs: ["R U R' U R U' R' U R U2 R'", "F R U R' U' R U R' U' R U R' U' F'"] },
  { id: 'oll2-pi', set: 'oll2', name: 'Pi', recog: 'Nenhum canto para cima; dois amarelos olham para o mesmo lado e os outros dois para lados opostos.', algs: ["R U2 R2 U' R2 U' R2 U2 R"] },
  { id: 'oll2-farois', set: 'oll2', name: 'Faróis', recog: 'Dois cantos para cima, vizinhos; os outros dois olham para o mesmo lado, como faróis.', algs: ["R2 D R' U2 R D' R' U2 R'"] },
  { id: 'oll2-t', set: 'oll2', name: 'T', recog: 'Dois cantos para cima, vizinhos; os outros dois olham para lados opostos.', algs: ["r U R' U' r' F R F'"] },
  { id: 'oll2-gravata', set: 'oll2', name: 'Gravata', recog: 'Dois cantos para cima, em diagonal.', algs: ["F' r U R' U' r' F R"] },
  { id: 'pll2-t', set: 'pll2', name: 'T-perm', recog: 'Faróis de um lado só: os dois cantos do lado oposto trocam.', algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"] },
  { id: 'pll2-y', set: 'pll2', name: 'Y-perm', recog: 'Nenhum farol: dois cantos trocam na diagonal.', algs: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"] },
  { id: 'pll2-ua', set: 'pll2', name: 'Ua', recog: 'Cantos prontos e uma lateral inteira pronta; as outras três arestas giram. É o espelho da Ub.', algs: ["R U' R U R U R U' R' U' R2"] },
  { id: 'pll2-ub', set: 'pll2', name: 'Ub', recog: 'Cantos prontos e uma lateral inteira pronta; as outras três arestas giram. É o espelho da Ua.', algs: ["R2 U R U R' U' R' U' R' U R'"] },
  { id: 'pll2-h', set: 'pll2', name: 'H-perm', recog: 'Cantos prontos; as arestas opostas trocam, em cruz.', algs: ['M2 U M2 U2 M2 U M2'] },
  { id: 'pll2-z', set: 'pll2', name: 'Z-perm', recog: 'Cantos prontos; as arestas vizinhas trocam aos pares.', algs: ["M' U M2 U M2 U M' U2 M2"] },
  { id: 'f2l-01', set: 'f2l', name: 'F2L 1', recog: 'Canto em cima, branco para o lado; aresta em cima, atrás.', algs: ["R U R'"] },
  { id: 'f2l-02', set: 'f2l', name: 'F2L 2', recog: 'Canto em cima, branco para o lado; aresta em cima, à esquerda.', algs: ["F' U' F"] },
  { id: 'f2l-03', set: 'f2l', name: 'F2L 3', recog: 'Canto em cima, branco para o lado; aresta em cima, na frente.', algs: ["U' F' U F", "F R' F' R", "U2 F' U2 F"] },
  { id: 'f2l-04', set: 'f2l', name: 'F2L 4', recog: 'Canto em cima, branco para o lado; aresta em cima, à direita.', algs: ["U R U' R'", "U2 R U2 R'", "R' F R F'"] },
  { id: 'f2l-05', set: 'f2l', name: 'F2L 5', recog: 'Canto em cima, branco para cima; aresta em cima, na frente.', algs: ["F' U2 F U F' U' F", "U2 F2 U2 R' F' R U2 F2"] },
  { id: 'f2l-06', set: 'f2l', name: 'F2L 6', recog: 'Canto em cima, branco para cima; aresta em cima, à direita.', algs: ["R U2 R' U' R U R'", "U2 R2 U2 F R F' U2 R2"] },
  { id: 'f2l-07', set: 'f2l', name: 'F2L 7', recog: 'Canto em cima, branco para cima; aresta em cima, atrás.', algs: ["U R U2 R' U R U' R'", "U R U2 R' U2 R U2 R'", "U R U2 R2 F R F'"] },
  { id: 'f2l-08', set: 'f2l', name: 'F2L 8', recog: 'Canto em cima, branco para cima; aresta em cima, atrás.', algs: ["F' U F U2 F' U' F", "U2 R U R' F' U' F", "U2 F' U' F2 R' F' R"] },
  { id: 'f2l-09', set: 'f2l', name: 'F2L 9', recog: 'Canto em cima, branco para cima; aresta em cima, à esquerda.', algs: ["R U' R' U2 R U R'", "U2 R U R' U R U' R'", "U2 R U R' U2 R U2 R'"] },
  { id: 'f2l-10', set: 'f2l', name: 'F2L 10', recog: 'Canto em cima, branco para cima; aresta em cima, à esquerda.', algs: ["U' F' U2 F U' F' U F", "U' F' U2 F2 R' F' R", "U' F' U2 F U2 F' U2 F"] },
  { id: 'f2l-11', set: 'f2l', name: 'F2L 11', recog: 'Canto em cima, branco para o lado; aresta em cima, na frente.', algs: ["U F' U2 F U' R U R'", "R' U2 R2 U R2 U R"] },
  { id: 'f2l-12', set: 'f2l', name: 'F2L 12', recog: 'Canto em cima, branco para o lado; aresta em cima, à direita.', algs: ["R U' R' U2 F' U' F"] },
  { id: 'f2l-13', set: 'f2l', name: 'F2L 13', recog: 'Canto em cima, branco para o lado; aresta em cima, atrás.', algs: ["U F' U2 F U F' U2 F", "R2 U2 F R2 F' U2 R2", "U F' U2 F U2 F' U F"] },
  { id: 'f2l-14', set: 'f2l', name: 'F2L 14', recog: 'Canto em cima, branco para o lado; aresta em cima, na frente.', algs: ["F' U F U2 R U R'"] },
  { id: 'f2l-15', set: 'f2l', name: 'F2L 15', recog: 'Canto em cima, branco para o lado; aresta em cima, à direita.', algs: ["U' R U2 R' U F' U' F", "F U2 F2 U' F2 U' F'"] },
  { id: 'f2l-16', set: 'f2l', name: 'F2L 16', recog: 'Canto em cima, branco para o lado; aresta em cima, à esquerda.', algs: ["U' R U2 R' U' R U2 R'", "U' R U2 R' U2 R U' R'", "F2 U2 R' F2 R U2 F2"] },
  { id: 'f2l-17', set: 'f2l', name: 'F2L 17', recog: 'Canto em cima, branco para cima; aresta em cima, na frente.', algs: ["U2 R2 U2 R' U' R U' R2", "R' U' R U' R' U2 R2 U2 R'", "R2 U R' U R U2 R' U' R'"] },
  { id: 'f2l-18', set: 'f2l', name: 'F2L 18', recog: 'Canto em cima, branco para cima; aresta em cima, à direita.', algs: ["U2 F2 U2 F U F' U F2", "F U R U' R' F' R U' R'", "F' R' F U' F' U R U F"] },
  { id: 'f2l-19', set: 'f2l', name: 'F2L 19', recog: 'Canto em cima, branco para o lado; aresta em cima, à direita.', algs: ["U' R U' R' U R U R'", "U2 R2 U R' U R U2 R2", "R U F R' U R U' F' R'"] },
  { id: 'f2l-20', set: 'f2l', name: 'F2L 20', recog: 'Canto em cima, branco para o lado; aresta em cima, à esquerda.', algs: ["U' R U R' U R U R'", "U2 R U' R' U' R U R'", "U F' U F U' R U R'"] },
  { id: 'f2l-21', set: 'f2l', name: 'F2L 21', recog: 'Canto em cima, branco para o lado; aresta em cima, à esquerda.', algs: ["R' U' R F R' F' U R", "R' U' R F R2 F' R U R", "U2 F R' F' R U2 R U R'"] },
  { id: 'f2l-22', set: 'f2l', name: 'F2L 22', recog: 'Canto em cima, branco para o lado; aresta em cima, na frente.', algs: ["R U R2 F R F2 U' F", "R' U' F R F2 R' U R F", "U F U R U' R' F2 U' F"] },
  { id: 'f2l-23', set: 'f2l', name: 'F2L 23', recog: 'Canto em cima, branco para o lado; aresta em cima, atrás.', algs: ["U' R U R' U' R U2 R'", "U' R U R' U2 R U' R'", "U R2 U2 F R' F' U2 R2"] },
  { id: 'f2l-24', set: 'f2l', name: 'F2L 24', recog: 'Canto em cima, branco para o lado; aresta em cima, atrás.', algs: ["U' R U' R' U F' U' F", "U R U R' U2 F' U' F", "F R U R' U' F' R U' R'"] },
  { id: 'f2l-25', set: 'f2l', name: 'F2L 25', recog: 'Canto em cima, branco para cima; aresta no lugar, invertida.', algs: ["F' U F U' R U' R'", "F' U F R U2 R'", "R U' R' F' U2 F"] },
  { id: 'f2l-26', set: 'f2l', name: 'F2L 26', recog: 'Canto em cima, branco para cima; aresta no lugar, certa.', algs: ["R2 U R2 U R2 U2 R2", "U2 R2 U2 R2 U' R2 U' R2", "F2 U' F2 U' F2 U2 F2"] },
  { id: 'f2l-27', set: 'f2l', name: 'F2L 27', recog: 'Canto em cima, branco para o lado; aresta no lugar, certa.', algs: ["U R U R' U2 R U R'", "U' R U2 R' U R U R'", "F R' F2 R U R U' R' F"] },
  { id: 'f2l-28', set: 'f2l', name: 'F2L 28', recog: 'Canto em cima, branco para o lado; aresta no lugar, invertida.', algs: ["U F' U' F U' R U R'", "U2 F' U F U R U R'", "U2 F' U' F U R U' R'"] },
  { id: 'f2l-29', set: 'f2l', name: 'F2L 29', recog: 'Canto em cima, branco para o lado; aresta no lugar, certa.', algs: ["U' R U' R' U' R U2 R'", "U' R U' R' U2 R U' R'", "R U' R U2 R' U' R U' R2"] },
  { id: 'f2l-30', set: 'f2l', name: 'F2L 30', recog: 'Canto em cima, branco para o lado; aresta no lugar, invertida.', algs: ["U' R U R' U F' U' F", "U2 R U R' F R' F' R", "U2 R U R' U' F' U F"] },
  { id: 'f2l-31', set: 'f2l', name: 'F2L 31', recog: 'Canto no lugar, girado; aresta em cima.', algs: ["R U R' U F' U2 F", "R U2 R' F' U2 F", "R U R' U2 F' U F"] },
  { id: 'f2l-32', set: 'f2l', name: 'F2L 32', recog: 'Canto no lugar, branco embaixo; aresta em cima.', algs: ["U2 F' U F U R U' R'", "F' U2 F U2 R U R'", "U2 F' U F U2 R U2 R'"] },
  { id: 'f2l-33', set: 'f2l', name: 'F2L 33', recog: 'Canto no lugar, girado; aresta em cima.', algs: ["U' R U' R' U R U' R'", "U' R U' R' U2 R U2 R'", "U' F' U2 F R U2 R'"] },
  { id: 'f2l-34', set: 'f2l', name: 'F2L 34', recog: 'Canto no lugar, girado; aresta em cima.', algs: ["U2 R U' R' F' U' F", "R' F R F' U R U' R'", "R' F R F' U2 R U2 R'"] },
  { id: 'f2l-35', set: 'f2l', name: 'F2L 35', recog: 'Canto no lugar, girado; aresta em cima.', algs: ["U' R U R' U' R U R'", "U2 R U2 R' U2 R U R'", "U F' U F R U R'"] },
  { id: 'f2l-36', set: 'f2l', name: 'F2L 36', recog: 'Canto no lugar, branco embaixo; aresta em cima.', algs: ["U R U R' U' F' U' F", "R' U' R F' R' U R F", "U R U' R' F R' F' R"] },
  { id: 'f2l-37', set: 'f2l', name: 'F2L 37', recog: 'Canto no lugar, branco embaixo; aresta no lugar, invertida.', algs: ["R2 U2 F R2 F' U2 R' U R'", "R U' R U2 F R2 F' U2 R2", "R F R' F' U2 R U R U' R2"] },
  { id: 'f2l-38', set: 'f2l', name: 'F2L 38', recog: 'Canto no lugar, girado; aresta no lugar, certa.', algs: ["R2 U2 R' U' R U' R' U2 R'", "R U2 R U2 F R F' U2 R2", "F R' F' R2 U2 R' U' R U R'"] },
  { id: 'f2l-39', set: 'f2l', name: 'F2L 39', recog: 'Canto no lugar, girado; aresta no lugar, invertida.', algs: ["R F U R U' R' F' U' R'", "F' U F R U' R' U2 R U R'", "R2 U R' U R U2 R2 F' U2 F"] },
  { id: 'f2l-40', set: 'f2l', name: 'F2L 40', recog: 'Canto no lugar, girado; aresta no lugar, certa.', algs: ["R U2 R U R' U R U2 R2", "R2 U2 F R' F' U2 R' U2 R'", "R U' R' U R U2 R2 F R F'"] },
  { id: 'f2l-41', set: 'f2l', name: 'F2L 41', recog: 'Canto no lugar, girado; aresta no lugar, invertida.', algs: ["R U F R U R' U' F' R'", "F' U2 F R2 U2 R' U' R U' R2", "R U' R' U2 R U R' F' U' F"] },
]);

const BY_ID: ReadonlyMap<string, TrainCase> = new Map(CASES.map((c) => [c.id, c]));

export const casesOf = (set: CaseSet): TrainCase[] => CASES.filter((c) => c.set === set);
export const caseById = (id: string): TrainCase | undefined => BY_ID.get(id);

// O índice do algoritmo escolhido (profile.algChoice), ou 0 (o padrão) quando a escolha não vale para este caso.
export function choiceOf(c: TrainCase, algChoice: Readonly<Record<string, number>>): number {
  const i = algChoice[c.id];
  return Number.isInteger(i) && i >= 0 && i < c.algs.length ? i : 0;
}

export const chosenAlg = (c: TrainCase, algChoice: Readonly<Record<string, number>>): string => c.algs[choiceOf(c, algChoice)];
```

- [ ] **Step 4: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/trail-cases.test.ts`
Expected: PASS (16 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/core/trail/cases.ts tests/unit/trail-cases.test.ts
git commit -m "feat(app): casos do treino (OLL e PLL em 2 passos, F2L) conferidos com o cubing.js

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: As 9 aulas, com cada passo conferido

Spec: seções 5.2, 5.3 e 5.6 (decisão 2).

**Files:**
- Create: `app/src/core/trail/lessons.ts`
- Test: `app/tests/unit/trail-lessons.test.ts`

**Interfaces:**
- Consumes: `Lesson` (Task 1); `invertAlg` (Task 1); o apoio `tests/unit/trail-cube.ts` (Task 1).
- Produces: `LESSONS: readonly Lesson[]` em `core/trail/lessons.ts` (9 aulas, `step` 0 a 8; `cases` em 6, 7 e 8). Este módulo só é importado pela aba Trilha (Task 10), que carrega sob demanda.

- [ ] **Step 1: Escreva os testes que falham**

Para cada passo: `from` vale no estado do setup; `ends` vale depois do setup e do algoritmo, e não vale no setup sozinho. Também a integridade (9 aulas na ordem, 4 a 8 passos, títulos únicos, `cases` só nas etapas 7 a 9) e o inverso de todo setup e algoritmo igual ao do cubing.js.

Crie `app/tests/unit/trail-lessons.test.ts`:

```ts
import { Alg } from 'cubing/alg';
import { describe, expect, it } from 'vitest';
import { invertAlg } from '../../src/core/trail/frame';
import { LESSONS } from '../../src/core/trail/lessons';
import { at, inv, stage } from './trail-cube';

const cubes = LESSONS.flatMap((l) => l.parts.map((part, i) => ({ step: l.step, i, title: part.title, cube: part.cube })));

describe('aulas: integridade (spec 5.6)', () => {
  it('9 aulas, uma por etapa, na ordem', () => {
    expect(LESSONS.map((l) => l.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('cada aula tem de 4 a 8 passos, com título único, texto e cubo', () => {
    for (const l of LESSONS) {
      expect(l.parts.length).toBeGreaterThanOrEqual(4);
      expect(l.parts.length).toBeLessThanOrEqual(8);
      expect(new Set(l.parts.map((p) => p.title)).size).toBe(l.parts.length);
      for (const p of l.parts) {
        expect(p.text.trim()).not.toBe('');
        expect(p.cube).toBeDefined();
      }
    }
  });

  it('as etapas 7, 8 e 9 levam ao treino dos seus casos; as outras não', () => {
    expect(LESSONS.map((l) => l.cases ?? null)).toEqual([null, null, null, null, null, null, 'oll2', 'pll2', 'f2l']);
  });

  it('todo setup e todo algoritmo estão em notação que o cubing.js entende, e o inverso do app bate com o dele', () => {
    for (const { cube } of cubes) {
      if (!cube) continue;
      for (const a of [cube.setup, cube.alg ?? '']) {
        expect(() => new Alg(a)).not.toThrow();
        expect(invertAlg(a)).toBe(inv(a));
      }
    }
  });

  it('todo passo com `ends` tem algoritmo', () => {
    for (const { cube, step, i } of cubes) if (cube?.ends) expect(cube.alg, `aula ${step + 1}, passo ${i + 1}`).toBeTruthy();
  });
});

describe('aulas: cada passo cumpre o que promete (cubing.js)', () => {
  it.each(cubes.filter((c) => c.cube?.from || c.cube?.ends).map((c) => [`aula ${c.step + 1}, passo ${c.i + 1}: ${c.title}`, c.cube!] as const))(
    '%s',
    (_name, cube) => {
      const start = at(cube.setup);
      if (cube.from) expect(stage[cube.from](start)).toBe(true);
      if (cube.ends) {
        expect(stage[cube.ends](at(cube.setup, cube.alg))).toBe(true);
        expect(stage[cube.ends](start)).toBe(false); // o passo mostra a mudança: o setup sozinho ainda não chegou lá
      }
    },
  );

  it('a aula 1 leva até a cruz: a margarida e depois as pétalas descendo', () => {
    const [daisy, cross] = ['Pétala por pétala', 'Desça as pétalas'].map((t) => LESSONS[0].parts.find((p) => p.title === t)!.cube!);
    expect(daisy.ends).toBe('daisy');
    expect(cross.ends).toBe('cross');
    expect(cross.mask).toBe('cross');
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/trail-lessons.test.ts`
Expected: FAIL com `Failed to resolve import "../../src/core/trail/lessons"`.

- [ ] **Step 3: Escreva `core/trail/lessons.ts`**

O conteúdo vem como está (texto revisado e setups conferidos). Os setups com `U2'` e afins saem assim do `Alg.invert` do cubing.js e são válidos.

Crie `app/src/core/trail/lessons.ts`:

```ts
// As 9 aulas (spec 5.3 e 6): passos curtos, cada um com o cubo animado. Os setups partem do resolvido no quadro das aulas (amarelo em
// cima, branco embaixo, verde na frente). `from` é o que o setup já cumpre e `ends` o que setup + alg cumpre; os testes conferem os dois
// com o cubing.js (tests/unit/trail-lessons.test.ts). O texto é revisado pelo Ranielli num cubo de verdade antes de ir para a raiz.
// Fica no código da aba Trilha: só carrega quando ela abre.
import type { Lesson } from './types';

export const LESSONS: readonly Lesson[] = Object.freeze([
  {
    step: 0,
    parts: [
      {
        title: 'Segure assim',
        text: 'Amarelo em cima, branco embaixo e verde de frente para você. Nas aulas o cubo fica sempre nessa posição, e é assim que você deve segurar o seu.',
        cube: { setup: '', view: '3D' },
      },
      {
        title: 'As faces têm letras',
        text: 'R é a direita, L a esquerda, U a de cima, D a de baixo, F a da frente e B a de trás. A letra sozinha é um quarto de volta no sentido do relógio, olhando de frente para aquela face.',
        cube: { setup: '', alg: 'R', view: '3D' },
      },
      {
        title: 'Apóstrofo e 2',
        text: 'Com apóstrofo (R\') a face gira para o outro lado. Com 2 (R2) ela gira meia volta. Repita no seu cubo: R U R\' U\'. Feito seis vezes seguidas, o cubo volta como estava.',
        cube: { setup: '', alg: 'R U R\' U\'', view: '3D' },
      },
      {
        title: 'A margarida',
        text: 'A primeira meta é juntar as quatro arestas brancas em volta do centro amarelo, com o branco para cima. Parece uma flor: o miolo é amarelo e as pétalas são brancas.',
        cube: { setup: 'F2 R2 B2 L2', view: '3D', mask: 'daisy' },
      },
      {
        title: 'Pétala por pétala',
        text: 'Leve cada aresta branca para cima sem derrubar as pétalas que já estão lá. Se o lugar de cima estiver ocupado, gire U antes de subir a nova aresta.',
        tip: 'Não precisa de algoritmo aqui: é só olhar e girar.',
        cube: { setup: 'F2 R2 B2 L2 F', alg: 'F\'', view: '3D', mask: 'daisy', ends: 'daisy' },
      },
      {
        title: 'Desça as pétalas',
        text: 'Gire U até uma pétala ficar em cima do centro que tem a outra cor dela. Então gire aquela face duas vezes: a aresta desce com o branco para baixo. Faça o mesmo com as outras três.',
        cube: { setup: 'F2 R2 B2 L2', alg: 'F2 R2 B2 L2', view: '3D', mask: 'cross', ends: 'cross' },
      },
      {
        title: 'Alinhe antes de descer',
        text: 'Se a pétala está em cima do centro errado, gire só a camada de cima até acertar. Aqui um U\' alinha todas de uma vez.',
        cube: { setup: 'F2 R2 B2 L2 U', alg: 'U\' F2 R2 B2 L2', view: '3D', mask: 'cross', ends: 'cross' },
      },
      {
        title: 'Sua vez',
        text: 'Embaralhe, monte a margarida e desça as quatro pétalas. Vire o cubo para conferir: a cruz branca embaixo, cada aresta combinando com o centro do lado.',
        cube: { setup: '', view: 'below', mask: 'cross' },
      },
    ],
  },
  {
    step: 1,
    parts: [
      {
        title: 'Ache um canto branco',
        text: 'Procure um canto com branco na camada de cima. As outras duas cores dele dizem o lugar: embaixo, entre os centros dessas duas cores.',
        cube: { setup: 'U\' U R U\' R\'', view: '3D', mask: 'firstLayer', from: 'cross' },
      },
      {
        title: 'Leve até em cima do lugar',
        text: 'Gire U até o canto ficar em cima do lugar dele, na frente e à direita. Os outros cantos podem esperar.',
        cube: { setup: 'U\' U R U\' R\'', alg: 'U\'', view: '3D', mask: 'firstLayer', from: 'cross' },
      },
      {
        title: 'Repita R U R\' U\'',
        text: 'Com o canto na posição, faça R U R\' U\' até ele entrar com o branco para baixo. Às vezes basta uma vez; às vezes são três ou cinco.',
        cube: { setup: 'U R U\' R\' U R U\' R\' U R U\' R\'', alg: 'R U R\' U\' R U R\' U\' R U R\' U\'', view: '3D', mask: 'firstLayer', from: 'cross', ends: 'firstLayer' },
      },
      {
        title: 'Uma vez só',
        text: 'Quando o branco do canto olha para a direita, um R U R\' U\' já resolve.',
        cube: { setup: 'U R U\' R\'', alg: 'R U R\' U\'', view: '3D', mask: 'firstLayer', from: 'cross', ends: 'firstLayer' },
      },
      {
        title: 'Canto preso embaixo',
        text: 'Se o canto está embaixo, girado ou no lugar errado, um R U R\' U\' com ele na frente à direita traz o canto para cima. Depois é só repetir até ele entrar.',
        cube: { setup: 'R U R\' U\' R U R\' U\'', alg: 'R U R\' U\' R U R\' U\' R U R\' U\' R U R\' U\'', view: '3D', mask: 'firstLayer', from: 'cross', ends: 'firstLayer' },
      },
      {
        title: 'Sua vez',
        text: 'Faça os quatro cantos. A camada de baixo fica toda branca, e nas laterais aparece uma faixa de cada cor.',
        cube: { setup: '', view: 'below', mask: 'firstLayer' },
      },
    ],
  },
  {
    step: 2,
    parts: [
      {
        title: 'Ache uma aresta sem amarelo',
        text: 'Na camada de cima, procure uma aresta sem amarelo. Gire U até a cor da frente dela combinar com o centro da frente: forma um T de cabeça para baixo.',
        cube: { setup: 'F\' U\' F U R U R\' U\'', view: '3D', mask: 'f2l', from: 'firstLayer' },
      },
      {
        title: 'Para a direita',
        text: 'Se a outra cor da aresta combina com o centro da direita, faça U R U\' R\' U\' F\' U F.',
        cube: { setup: 'F\' U\' F U R U R\' U\'', alg: 'U R U\' R\' U\' F\' U F', view: '3D', mask: 'f2l', from: 'firstLayer', ends: 'f2l' },
      },
      {
        title: 'Para a esquerda',
        text: 'Se combina com o centro da esquerda, use o espelho: U\' L\' U L U F U\' F\'.',
        cube: { setup: 'F U F\' U\' L\' U\' L U', alg: 'U\' L\' U L U F U\' F\'', view: '3D', mask: 'f2l', from: 'firstLayer', ends: 'f2l' },
      },
      {
        title: 'Aresta presa ou invertida',
        text: 'Se uma aresta está no meio, mas no lugar errado ou virada, faça o algoritmo da direita naquele lugar para tirá-la. Ela sobe, e você a coloca como antes.',
        cube: { setup: 'F\' U\' F U R U R\' U F\' U\' F U R U R\' U\'', alg: 'U R U\' R\' U\' F\' U F U\' R U\' R\' U\' F\' U F', view: '3D', mask: 'f2l', from: 'firstLayer', ends: 'f2l' },
      },
      {
        title: 'Sua vez',
        text: 'Coloque as quatro arestas do meio. Com isso as duas primeiras camadas estão prontas.',
        cube: { setup: '', view: '3D', mask: 'f2l' },
      },
    ],
  },
  {
    step: 3,
    parts: [
      {
        title: 'Olhe só o amarelo de cima',
        text: 'Agora importa só o desenho amarelo em cima: ponto, L, linha ou cruz. Os cantos ficam para depois.',
        cube: { setup: 'F U R U\' R\' F\'', view: 'top', mask: 'eoll', from: 'f2l' },
      },
      {
        title: 'A linha',
        text: 'Com a linha deitada, da esquerda para a direita, faça F R U R\' U\' F\'.',
        cube: { setup: 'F U R U\' R\' F\'', alg: 'F R U R\' U\' F\'', view: 'top', mask: 'eoll', from: 'f2l', ends: 'yellowCross' },
      },
      {
        title: 'O L',
        text: 'Segure o L apontando para trás e para a esquerda, como os ponteiros às 9 horas e ao meio-dia. Faça o mesmo algoritmo duas vezes seguidas: a primeira vira linha, a segunda vira cruz.',
        cube: { setup: 'F U R U\' R\' F\' F U R U\' R\' F\' U', alg: 'U\' F R U R\' U\' F\' F R U R\' U\' F\'', view: 'top', mask: 'eoll', from: 'f2l', ends: 'yellowCross' },
      },
      {
        title: 'O ponto',
        text: 'Sem nenhuma aresta amarela em cima, faça o algoritmo uma vez: aparece um L. Daí siga como no passo anterior.',
        cube: { setup: 'F U R U\' R\' F\' F U R U\' R\' F\' U2\' F U R U\' R\' F\'', alg: 'F R U R\' U\' F\' U2 F R U R\' U\' F\' F R U R\' U\' F\'', view: 'top', mask: 'eoll', from: 'f2l', ends: 'yellowCross' },
      },
      {
        title: 'Sua vez',
        text: 'Faça a cruz amarela no seu cubo. Não se preocupe se os cantos estiverem bagunçados.',
        cube: { setup: '', view: 'top', mask: 'eoll' },
      },
    ],
  },
  {
    step: 4,
    parts: [
      {
        title: 'Arestas no lugar',
        text: 'Gire U até duas arestas combinarem com os centros dos lados. Se forem vizinhas, deixe uma atrás e a outra à direita e faça R U R\' U R U2 R\'. Depois gire U para alinhar.',
        cube: { setup: 'U\' R U2\' R\' U\' R U\' R\' U', alg: 'U\' R U R\' U R U2 R\' U', view: '3D', mask: 'll', from: 'yellowCross', ends: 'llEdges' },
      },
      {
        title: 'Cantos no lugar',
        text: 'Ache um canto que já está no lugar certo, mesmo girado. Segure-o na frente à direita e faça U R U\' L\' U R\' U\' L até os quatro estarem no lugar.',
        cube: { setup: 'L\' U R U\' L U R\' U\'', alg: 'U R U\' L\' U R\' U\' L', view: '3D', mask: 'll', from: 'llEdges', ends: 'llCorners' },
      },
      {
        title: 'Gire os cantos',
        text: 'Com um canto errado na frente à direita, repita R\' D\' R D até o amarelo dele ficar para cima. Gire só U para trazer o próximo e repita. O meio parece desmontar, mas volta no fim.',
        cube: { setup: 'U D\' R\' D R D\' R\' D R U\' D\' R\' D R D\' R\' D R D\' R\' D R D\' R\' D R', alg: 'R\' D\' R D R\' D\' R D R\' D\' R D R\' D\' R D U R\' D\' R D R\' D\' R D U\'', view: '3D', mask: 'll', from: 'llCorners', ends: 'solved' },
      },
      {
        title: 'Sua vez',
        text: 'Junte tudo: cruz, cantos, meio, cruz amarela e a última camada. É o seu primeiro cubo resolvido.',
        cube: { setup: '', view: '3D' },
      },
    ],
  },
  {
    step: 5,
    parts: [
      {
        title: 'Canto e aresta juntos',
        text: 'No F2L, o canto branco e a aresta do meio que ficam lado a lado entram juntos, num movimento só. Primeiro você junta os dois em cima, depois coloca o par no lugar.',
        cube: { setup: 'R U R\' U\'', alg: 'U R U\' R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Par pronto: insira',
        text: 'Quando o par já está montado em cima, um R U R\' coloca tudo. Do outro lado é F\' U\' F.',
        cube: { setup: 'R U\' R\'', alg: 'R U R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Separe e junte',
        text: 'Se canto e aresta estão perto, mas virados do jeito errado, afaste um do outro, junte de novo do jeito certo e insira.',
        cube: { setup: 'R U R\' U2\' R U\' R\' U', alg: 'U\' R U R\' U2 R U\' R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Tire de onde está preso',
        text: 'Se o canto ou a aresta está num lugar errado embaixo, tire-o com R U R\' (ou com o lado vazio) e trate como um caso de cima.',
        cube: { setup: 'R U\' R\' U R U\' R\' U R U\' R\'', alg: 'R U R\' U\' R U R\' U\' R U R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Sua vez',
        text: 'Faça a cruz e depois os quatro pares, um de cada vez. Devagar no começo: olhe antes de girar.',
        cube: { setup: '', view: '3D', mask: 'f2l' },
      },
    ],
  },
  {
    step: 6,
    cases: 'oll2',
    parts: [
      {
        title: 'Dois olhares',
        text: 'A OLL em 2 passos deixa o topo todo amarelo: primeiro a cruz, depois os cantos. São 3 casos para a cruz e 7 para os cantos, e todos estão no treino.',
        cube: { setup: 'R U2\' R\' U\' R U\' R\'', view: 'top', mask: 'oll', from: 'f2l' },
      },
      {
        title: 'A cruz em um passo',
        text: 'A linha sai com F R U R\' U\' F\'. O L sai com f R U R\' U\' f\', em que f gira as duas camadas da frente juntas. O ponto é os dois seguidos.',
        cube: { setup: 'f U R U\' R\' f\'', alg: 'f R U R\' U\' f\'', view: 'top', mask: 'oll', from: 'f2l', ends: 'yellowCross' },
      },
      {
        title: 'Sune',
        text: 'Com um canto amarelo para cima, segure-o na frente à esquerda e faça R U R\' U R U2 R\'.',
        cube: { setup: 'R U2\' R\' U\' R U\' R\'', alg: 'R U R\' U R U2 R\'', view: 'top', mask: 'oll', from: 'yellowCross', ends: 'oll' },
      },
      {
        title: 'Anti-Sune',
        text: 'O espelho do Sune: R U2 R\' U\' R U\' R\'. Os outros cinco (H, Pi, Faróis, T e Gravata) estão no treino, cada um com a figura do caso.',
        cube: { setup: 'R U R\' U R U2\' R\'', alg: 'R U2 R\' U\' R U\' R\'', view: 'top', mask: 'oll', from: 'yellowCross', ends: 'oll' },
      },
      {
        title: 'Hora de treinar',
        text: 'Decore um caso por vez no treino. Quando reconhecer de olho e fazer sem pensar, passe para o próximo.',
        cube: { setup: '', view: 'top', mask: 'oll' },
      },
    ],
  },
  {
    step: 7,
    cases: 'pll2',
    parts: [
      {
        title: 'Cantos primeiro',
        text: 'Procure faróis: dois cantos do mesmo lado com a mesma cor. Com faróis, deixe-os atrás e faça a T-perm. Sem faróis, a Y-perm.',
        cube: { setup: 'F R U\' R\' U R U R2\' F\' R U R U\' R\'', view: '3D', mask: 'pll', from: 'oll' },
      },
      {
        title: 'T-perm',
        text: 'R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'. Ela troca os dois cantos da direita e também duas arestas, o que não atrapalha: as arestas vêm no próximo passo.',
        cube: { setup: 'F R U\' R\' U R U R2\' F\' R U R U\' R\'', alg: 'R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'', view: '3D', mask: 'pll', from: 'oll', ends: 'solved' },
      },
      {
        title: 'As arestas: Ua e Ub',
        text: 'Com uma lateral inteira pronta, deixe-a atrás. As outras três arestas giram: para um lado é a Ub (R2 U R U R\' U\' R\' U\' R\' U R\'), para o outro é a Ua. A figura do treino mostra as duas.',
        cube: { setup: 'R U\' R U R U R U\' R\' U\' R2\'', alg: 'R2 U R U R\' U\' R\' U\' R\' U R\'', view: '3D', mask: 'pll', from: 'oll', ends: 'solved' },
      },
      {
        title: 'H e Z',
        text: 'Sem nenhuma lateral pronta, as arestas trocam aos pares: em cruz é o H, lado a lado é o Z. M é a camada do meio, girando como L.',
        cube: { setup: 'M2\' U\' M2\' U2\' M2\' U\' M2\'', alg: 'M2 U M2 U2 M2 U M2', view: '3D', mask: 'pll', from: 'oll', ends: 'solved' },
      },
      {
        title: 'Hora de treinar',
        text: 'São 6 algoritmos ao todo. No treino, cada caso aparece com a figura de cima para você reconhecer.',
        cube: { setup: '', view: '3D', mask: 'pll' },
      },
    ],
  },
  {
    step: 8,
    cases: 'f2l',
    parts: [
      {
        title: 'Os 41 casos',
        text: 'Todo par de F2L cai num de 41 casos. Com os algoritmos, você para de pensar em cada um e passa a reconhecer e executar.',
        cube: { setup: 'R U\' R\' U R U2\' R\'', view: '3D', mask: 'f2l', from: 'cross' },
      },
      {
        title: 'Os dois em cima',
        text: 'O grupo maior: canto e aresta na camada de cima. São 24 casos, e muitos você já resolve de forma intuitiva.',
        cube: { setup: 'R U\' R\' U R U2\' R\'', alg: 'R U2 R\' U\' R U R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Um em cima, outro no lugar',
        text: 'O canto em cima com a aresta já no meio, ou o contrário. São 12 casos.',
        cube: { setup: 'R U\' R\' U R U\' R\' U', alg: 'U\' R U R\' U\' R U R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Os dois no lugar, errados',
        text: 'Canto e aresta já no lugar, mas virados. São 5 casos, os mais longos.',
        cube: { setup: 'R U2\' R U R\' U R U2\' R2\'', alg: 'R2 U2 R\' U\' R U\' R\' U2 R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Hora de treinar',
        text: 'No treino, comece pelos casos que você ainda resolve devagar. O app traz mais vezes os que você erra.',
        cube: { setup: '', view: '3D', mask: 'f2l' },
      },
    ],
  },
]);
```

- [ ] **Step 4: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/trail-lessons.test.ts`
Expected: PASS (41 testes: 5 de integridade, um para cada um dos 35 passos com `from` ou `ends`, e a cruz da aula 1).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/core/trail/lessons.ts tests/unit/trail-lessons.test.ts
git commit -m "feat(app): as 9 aulas da trilha, com cada passo conferido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Níveis, sorteio e embaralhamento do treino

Spec: seções 5.5, 5.6 (embaralhamento) e 7.3 (decisões 5 e 7). Também o tipo `Practice` da seção 9.1, que o treino lê.

**Files:**
- Modify: `app/src/core/types.ts` (acrescentar `Practice`)
- Create: `app/src/core/trail/train.ts`
- Test: `app/tests/unit/trail-train.test.ts`

**Interfaces:**
- Consumes: `casesOf`, `chosenAlg` (Task 2); `AUF`, `invertAlg`, `tidyAlg` (Task 1).
- Produces (em `core/types.ts`): `interface Practice { id: string; caseId: string; ms: number; ok: boolean; helped: boolean; at: number }`.
- Produces (em `core/trail/train.ts`):
  - `MAX_LEVEL = 4`, `type LevelName = 'novo' | 'aprendendo' | 'firme' | 'dominado'`
  - `byCase(practice: readonly Practice[]): Map<string, Practice[]>` (por caso, em ordem de tempo)
  - `levelOf(attempts: readonly Practice[]): number | null`, `levelName(level: number | null): LevelName`
  - `interface CaseStats { id; level: number | null; attempts: number; okRate: number | null; avg5: number | null; best: number | null }`
  - `caseStats(id, attempts): CaseStats`, `setStats(set, practice): CaseStats[]`, `firmCount(stats): number`, `weakestFirst(stats): CaseStats[]`
  - `setAverage(stats): number | null`, `weightOf(s: CaseStats, setAvg: number | null): number`
  - `nextCase(o: { set: CaseSet; practice: readonly Practice[]; off: readonly string[]; last: string | null; rng: () => number }): TrainCase | null`
  - `caseScramble(alg: string, rng: () => number): string`

Definições que a spec deixa em aberto (decisão A4 do começo): o tempo que conta é o da tentativa certa e sem ajuda; a média do conjunto é a média das médias de 5 dos casos que têm uma; acertar com ajuda volta o nível a 0 (spec 7.3).

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/trail-train.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CASES, casesOf, chosenAlg } from '../../src/core/trail/cases';
import { tidyAlg, invertAlg } from '../../src/core/trail/frame';
import {
  byCase, caseScramble, caseStats, firmCount, levelName, levelOf, nextCase, setAverage, setStats, weakestFirst, weightOf,
} from '../../src/core/trail/train';
import type { Practice } from '../../src/core/types';
import { at, solves, stage } from './trail-cube';

let seq = 0;
let clock = 1_000;
// Uma tentativa; cada uma vem 1 s depois da anterior.
const p = (caseId: string, o: Partial<Practice> = {}): Practice => ({
  id: `p${String(++seq).padStart(4, '0')}`, caseId, ms: 3000, ok: true, helped: false, at: (clock += 1000), ...o,
});
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const OLL = casesOf('oll2').map((c) => c.id);
const allBut = (keep: string[]) => OLL.filter((id) => !keep.includes(id));

describe('nível de um caso pelo histórico (spec 7.3)', () => {
  it('nunca tentado é novo; acertar sem ajuda sobe 1 até 4; errar volta a 0', () => {
    expect(levelOf([])).toBeNull();
    const id = 'oll2-sune';
    expect(levelOf([p(id)])).toBe(1);
    expect(levelOf([p(id), p(id)])).toBe(2);
    expect(levelOf(Array.from({ length: 7 }, () => p(id)))).toBe(4);
    expect(levelOf([p(id), p(id), p(id), p(id, { ok: false })])).toBe(0);
    expect(levelOf([p(id, { ok: false }), p(id)])).toBe(1);
  });

  it('a ajuda não sobe o nível: acertar com ajuda volta a 0', () => {
    const id = 'oll2-sune';
    expect(levelOf([p(id, { helped: true })])).toBe(0);
    expect(levelOf([p(id), p(id), p(id, { helped: true })])).toBe(0);
  });

  it('os nomes: novo, aprendendo (0–1), firme (2–3) e dominado (4)', () => {
    expect([null, 0, 1, 2, 3, 4].map(levelName)).toEqual(['novo', 'aprendendo', 'aprendendo', 'firme', 'firme', 'dominado']);
  });

  it('byCase separa por caso e põe em ordem de tempo, mesmo vindo fora de ordem', () => {
    const a = p('oll2-h', { at: 50 });
    const b = p('oll2-h', { at: 10, ok: false });
    const c = p('oll2-pi');
    const groups = byCase([a, c, b]);
    expect(groups.get('oll2-h')).toEqual([b, a]);
    expect(groups.get('oll2-pi')).toEqual([c]);
    expect(levelOf(groups.get('oll2-h')!)).toBe(1);
  });
});

describe('números por caso (spec 7.4)', () => {
  it('tentativas, % de acerto, média das últimas 5 certas sem ajuda e o melhor tempo', () => {
    const id = 'pll2-t';
    const list = [
      p(id, { ms: 9000 }),
      p(id, { ms: 1000, helped: true }), // com ajuda: fora da média e do melhor
      p(id, { ms: 500, ok: false }), // errada: fora da média e do melhor
      ...[6000, 5000, 4000, 3000, 2000].map((ms) => p(id, { ms })),
    ];
    const s = caseStats(id, list);
    expect(s.attempts).toBe(8);
    expect(s.okRate).toBeCloseTo(7 / 8);
    expect(s.avg5).toBe(4000); // as 5 últimas certas sem ajuda: 6, 5, 4, 3 e 2 s
    expect(s.best).toBe(2000);
    expect(caseStats(id, [])).toEqual({ id, level: null, attempts: 0, okRate: null, avg5: null, best: null });
  });

  it('setStats segue a ordem da aula e firmCount conta os de nível 2 para cima', () => {
    const list = [p('oll2-l'), p('oll2-l'), p('oll2-sune'), p('oll2-h'), p('oll2-h'), p('oll2-h'), p('oll2-h')];
    const stats = setStats('oll2', list);
    expect(stats.map((s) => s.id)).toEqual(OLL);
    expect(firmCount(stats)).toBe(2); // L (2) e H (4); o Sune está em 1
  });

  it('do mais fraco ao mais firme: novos, depois o nível; no empate, o mais lento primeiro', () => {
    const list = [p('oll2-linha', { ms: 2000 }), p('oll2-l', { ms: 5000 }), p('oll2-ponto'), p('oll2-ponto')];
    const order = weakestFirst(setStats('oll2', list)).map((s) => s.id);
    expect(order.slice(0, 7)).toEqual(['oll2-sune', 'oll2-antisune', 'oll2-h', 'oll2-pi', 'oll2-farois', 'oll2-t', 'oll2-gravata']);
    expect(order.slice(7)).toEqual(['oll2-l', 'oll2-linha', 'oll2-ponto']);
  });
});

describe('peso no sorteio (spec 7.3)', () => {
  it('16 ÷ 2^nível; o novo pesa como o nível 0', () => {
    const s = (level: number | null) => ({ id: 'x', level, attempts: 1, okRate: 1, avg5: null, best: null });
    expect([null, 0, 1, 2, 3, 4].map((l) => weightOf(s(l), null))).toEqual([16, 16, 8, 4, 2, 1]);
  });

  it('dobra quando a média de 5 passa de 1,25 vez a média do conjunto (e só aí)', () => {
    const s = (avg5: number) => ({ id: 'x', level: 1, attempts: 5, okRate: 1, avg5, best: avg5 });
    expect(weightOf(s(1250), 1000)).toBe(8); // exatamente 1,25: não dobra
    expect(weightOf(s(1251), 1000)).toBe(16);
    expect(setAverage([s(1000), s(3000), { ...s(0), avg5: null }])).toBe(2000);
    expect(setAverage([])).toBeNull();
  });
});

describe('próximo caso (spec 7.3)', () => {
  it('os nunca tentados vêm primeiro, na ordem da aula', () => {
    expect(nextCase({ set: 'oll2', practice: [], off: [], last: null, rng: fixed(0.99) })?.id).toBe('oll2-linha');
    const tried = [p('oll2-linha'), p('oll2-l')];
    expect(nextCase({ set: 'oll2', practice: tried, off: [], last: 'oll2-l', rng: fixed(0) })?.id).toBe('oll2-ponto');
  });

  it('nunca o mesmo caso duas vezes seguidas, nem quando ele é o próximo novo', () => {
    // A última tentativa do Linha foi apagada: ele voltou a ser novo, mas acabou de sair.
    expect(nextCase({ set: 'oll2', practice: [], off: [], last: 'oll2-linha', rng: fixed(0) })?.id).toBe('oll2-l');
    const two = allBut(['oll2-sune', 'oll2-h']);
    const practice = [p('oll2-sune'), p('oll2-h')];
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(nextCase({ set: 'oll2', practice, off: two, last: 'oll2-sune', rng: fixed(r) })?.id).toBe('oll2-h');
    }
  });

  it('com um caso só no sorteio, ele repete; com todos fora, não há próximo', () => {
    const one = allBut(['oll2-pi']);
    expect(nextCase({ set: 'oll2', practice: [p('oll2-pi')], off: one, last: 'oll2-pi', rng: fixed(0.5) })?.id).toBe('oll2-pi');
    expect(nextCase({ set: 'oll2', practice: [], off: OLL, last: null, rng: fixed(0.5) })).toBeNull();
  });

  it('o sorteio segue os pesos: nível 4 (1) contra nível 0 (16), na ordem da aula (Pi antes de T)', () => {
    const practice = [p('oll2-t', { ok: false }), ...Array.from({ length: 4 }, () => p('oll2-pi'))];
    const off = allBut(['oll2-t', 'oll2-pi']);
    const pick = (r: number) => nextCase({ set: 'oll2', practice, off, last: null, rng: fixed(r) })?.id;
    expect(pick(0.05)).toBe('oll2-pi'); // 0,05 × 17 = 0,85 < 1
    expect(pick(0.06)).toBe('oll2-t'); // 1,02
    expect(pick(0.99)).toBe('oll2-t');
  });

  it('o caso lento pesa o dobro: a mesma sorte que daria o rápido passa a dar o lento', () => {
    const off = allBut(['oll2-t', 'oll2-pi']);
    const pick = (practice: Practice[], r: number) => nextCase({ set: 'oll2', practice, off, last: null, rng: fixed(r) })?.id;
    // Nível 1 nos dois (peso 8). T a 20 s, Pi a 10 s: média do conjunto 15 s, e 20 > 18,75 dobra o T (Pi 8, T 16, de 24).
    const slow = [p('oll2-t', { ms: 20000 }), p('oll2-pi', { ms: 10000 })];
    expect(pick(slow, 0.4)).toBe('oll2-t'); // 0,4 × 24 = 9,6 ≥ 8
    // Os dois iguais: sem dobra (8 e 8, de 16), a mesma sorte cai no Pi.
    const even = [p('oll2-t', { ms: 10000 }), p('oll2-pi', { ms: 10000 })];
    expect(pick(even, 0.4)).toBe('oll2-pi'); // 6,4 < 8
  });
});

describe('embaralhamento do caso (spec 5.5)', () => {
  it('sem giro de cima é o inverso do algoritmo; com giros, eles entram antes e depois', () => {
    const sune = "R U R' U R U2 R'";
    expect(caseScramble(sune, fixed(0, 0))).toBe(tidyAlg(invertAlg(sune)));
    expect(caseScramble(sune, fixed(0.25, 0.5))).toBe("U R U2 R' U' R U' R' U2");
    expect(caseScramble(sune, fixed(0.99, 0.99))).toBe("U' R U2 R' U' R U' R' U'");
  });

  it('para todo caso, todo algoritmo escolhido e todos os 16 giros, o algoritmo resolve o embaralhamento (com o giro de cima)', () => {
    const quarter = [0, 0.25, 0.5, 0.75];
    for (const c of CASES) {
      for (let choice = 0; choice < c.algs.length; choice++) {
        const alg = chosenAlg(c, { [c.id]: choice });
        for (const pre of quarter) {
          for (const post of quarter) {
            const scramble = caseScramble(alg, fixed(pre, post));
            expect(solves(at(scramble), alg, stage.solved), `${c.id} #${choice}: ${scramble}`).toBe(true);
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/trail-train.test.ts`
Expected: FAIL com `Failed to resolve import "../../src/core/trail/train"`.

- [ ] **Step 3: O tipo da tentativa**

Em `app/src/core/types.ts`, troque:

```ts
export type Theme = 'system' | 'light' | 'dark';
```

por:

```ts
// Uma tentativa do treino de algoritmos (spec 9.1). Fica fora dos solves: nada do treino entra nas estatísticas, nos recordes, nas
// temporadas nem nos marcos.
export interface Practice {
  id: string; // newId()
  caseId: string; // id de um TrainCase (core/trail/cases.ts)
  ms: number; // o tempo do timer
  ok: boolean;
  helped: boolean; // a pessoa viu o algoritmo antes de começar
  at: number;
}

export type Theme = 'system' | 'light' | 'dark';
```

- [ ] **Step 4: Escreva `core/trail/train.ts`**

Crie `app/src/core/trail/train.ts`:

```ts
// O treino de algoritmos (spec 7): o nível de cada caso pelo histórico, o peso no sorteio, o próximo caso e o embaralhamento. Puro: as
// tentativas e o sorteio chegam por parâmetro, então os testes repetem tudo igual. Nada guarda nível: ele sai sempre das tentativas.
import type { Practice } from '../types';
import { casesOf } from './cases';
import { AUF, invertAlg, tidyAlg } from './frame';
import type { CaseSet, TrainCase } from './types';

export const MAX_LEVEL = 4;
export type LevelName = 'novo' | 'aprendendo' | 'firme' | 'dominado';

// Tentativa que conta para o tempo: certa e sem ajuda (com ajuda, o tempo não diz nada).
const clean = (a: Practice): boolean => a.ok && !a.helped;
const byTime = (a: Practice, b: Practice): number => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// As tentativas de cada caso, em ordem de tempo.
export function byCase(practice: readonly Practice[]): Map<string, Practice[]> {
  const out = new Map<string, Practice[]>();
  for (const a of [...practice].sort(byTime)) {
    const list = out.get(a.caseId);
    if (list) list.push(a);
    else out.set(a.caseId, [a]);
  }
  return out;
}

// O nível (0 a 4) pelas tentativas em ordem de tempo: acertar sem ajuda sobe 1; errar ou usar a ajuda volta a 0. null: nunca tentado.
export function levelOf(attempts: readonly Practice[]): number | null {
  let level: number | null = null;
  for (const a of attempts) level = clean(a) ? Math.min(MAX_LEVEL, (level ?? 0) + 1) : 0;
  return level;
}

export const levelName = (level: number | null): LevelName =>
  level === null ? 'novo' : level <= 1 ? 'aprendendo' : level <= 3 ? 'firme' : 'dominado';

export interface CaseStats {
  id: string;
  level: number | null;
  attempts: number;
  okRate: number | null; // 0 a 1; null sem tentativa
  avg5: number | null; // média das últimas 5 certas sem ajuda, em ms
  best: number | null; // o melhor tempo certo sem ajuda
}

export function caseStats(id: string, attempts: readonly Practice[]): CaseStats {
  const good = attempts.filter(clean);
  const last5 = good.slice(-5);
  return {
    id,
    level: levelOf(attempts),
    attempts: attempts.length,
    okRate: attempts.length > 0 ? attempts.filter((a) => a.ok).length / attempts.length : null,
    avg5: last5.length > 0 ? Math.round(last5.reduce((sum, a) => sum + a.ms, 0) / last5.length) : null,
    best: good.length > 0 ? Math.min(...good.map((a) => a.ms)) : null,
  };
}

// Os números de cada caso do conjunto, na ordem da aula.
export function setStats(set: CaseSet, practice: readonly Practice[]): CaseStats[] {
  const groups = byCase(practice);
  return casesOf(set).map((c) => caseStats(c.id, groups.get(c.id) ?? []));
}

// "Firme" conta os casos de nível 2 para cima (spec 7.1).
export const firmCount = (stats: readonly CaseStats[]): number => stats.filter((s) => s.level !== null && s.level >= 2).length;

// Do mais fraco ao mais firme (spec 7.4): o novo primeiro, depois o nível; no empate, o mais lento; depois a ordem da aula.
export function weakestFirst(stats: readonly CaseStats[]): CaseStats[] {
  const rank = (s: CaseStats): number => (s.level === null ? -1 : s.level);
  return [...stats].sort((a, b) => rank(a) - rank(b) || (b.avg5 ?? 0) - (a.avg5 ?? 0));
}

// A média do conjunto: a das médias de 5 dos casos que têm uma (cada caso pesa igual). null: nenhum caso tem.
export function setAverage(stats: readonly CaseStats[]): number | null {
  const avgs = stats.map((s) => s.avg5).filter((v): v is number => v !== null);
  return avgs.length > 0 ? avgs.reduce((sum, v) => sum + v, 0) / avgs.length : null;
}

// O peso no sorteio (spec 7.3): 16 ÷ 2^nível, dobrado se a média das últimas 5 certas passa de 1,25 vez a média do conjunto.
export function weightOf(s: CaseStats, setAvg: number | null): number {
  const base = 16 / 2 ** (s.level ?? 0);
  return s.avg5 !== null && setAvg !== null && s.avg5 > 1.25 * setAvg ? base * 2 : base;
}

// O próximo caso (spec 7.3), entre os do conjunto que não estão fora do sorteio: os nunca tentados primeiro, na ordem da aula; depois
// pelo peso. O mesmo caso nunca sai duas vezes seguidas, a não ser que ele seja o único. null: todos fora do sorteio.
export function nextCase(o: {
  set: CaseSet;
  practice: readonly Practice[];
  off: readonly string[];
  last: string | null;
  rng: () => number;
}): TrainCase | null {
  const pool = casesOf(o.set).filter((c) => !o.off.includes(c.id));
  if (pool.length === 0) return null;
  const candidates = pool.length > 1 ? pool.filter((c) => c.id !== o.last) : pool;
  const groups = byCase(o.practice);
  const fresh = candidates.find((c) => !groups.has(c.id));
  if (fresh) return fresh;
  const avg = setAverage(setStats(o.set, o.practice));
  const weights = candidates.map((c) => weightOf(caseStats(c.id, groups.get(c.id) ?? []), avg));
  let r = o.rng() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// O embaralhamento do caso (spec 5.5): um giro de cima, o inverso do algoritmo escolhido e outro giro de cima, sempre a partir do
// resolvido com amarelo em cima e verde na frente. Os giros saem do sorteio dado.
export function caseScramble(alg: string, rng: () => number): string {
  const auf = (): string => AUF[Math.min(AUF.length - 1, Math.floor(rng() * AUF.length))];
  const pre = auf();
  const post = auf();
  return tidyAlg(`${pre} ${invertAlg(alg)} ${post}`);
}
```

- [ ] **Step 5: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/trail-train.test.ts`
Expected: PASS (16 testes; o último confere os 57 casos, cada algoritmo e os 16 pares de giros de cima contra o cubing.js).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/trail/train.ts tests/unit/trail-train.test.ts
git commit -m "feat(app): níveis, sorteio e embaralhamento do treino

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Banco versão 2 com o treino, e os campos novos do perfil e do meta

Spec: seções 9.1 e 9.2.

**Files:**
- Modify: `app/src/core/types.ts` (`Profile` e `Meta` ganham campos)
- Modify: `app/src/data/db.ts` (`DB_VERSION` 2, store `practice`)
- Modify: `app/src/data/repository.ts` (padrões, `ChangeKind` `'practice'`, métodos do treino)
- Modify: `app/src/ui/state/app.svelte.ts` (só o perfil provisório, para os tipos fecharem)
- Modify: `app/tests/unit/safety.test.ts` (o Meta literal do teste ganha o campo novo; sem isso o `pnpm check` falha)
- Modify: `app/tests/unit/db.test.ts`
- Test: `app/tests/unit/repository-practice.test.ts`

**Interfaces:**
- Consumes: `Practice` (Task 4), `TrailStep` (Task 1).
- Produces:
  - `Profile.lessonAt: Partial<Record<TrailStep, number>>`, `Profile.algChoice: Record<string, number>`, `Profile.trainOff: string[]`, `Meta.trailPromptDismissed: boolean` (padrões `{}`, `{}`, `[]` e `false`; perfil e meta antigos leem os padrões)
  - `DB_VERSION = 2`; `KlickDB.practice: { key: string; value: Practice; indexes: { byCase: [string, number]; byAt: number } }`
  - `ChangeKind` ganha `'practice'`
  - `Repository.addPractice(p: Practice): Promise<Practice>` (idempotente pelo id), `listPractice(f?: { caseId?: string }): Promise<Practice[]>` (em ordem de `at`), `updatePractice(id: string, patch: { ok?: boolean }): Promise<Practice>`, `deletePractice(id: string): Promise<void>`; cada escrita avisa `'practice'`

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/repository-practice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Practice, Profile } from '../../src/core/types';
import { DB_VERSION, openKlickDb } from '../../src/data/db';
import { createRepository, type ChangeKind, type Repository } from '../../src/data/repository';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const name = () => `practice-${++n}`;
async function fresh(): Promise<Repository> {
  return createRepository(await openKlickDb(name()), { now, channel: null });
}
let seq = 0;
const pr = (o: Partial<Practice> = {}): Practice => ({
  id: `p${String(++seq).padStart(4, '0')}`, caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: (t += 1000), ...o,
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

describe('tentativas do treino no repositório', () => {
  it('grava e lista em ordem de tempo, também por caso', async () => {
    const repo = await fresh();
    const late = pr({ at: 5_000 });
    const early = pr({ at: 1_000, caseId: 'pll2-t' });
    const mid = pr({ at: 3_000 });
    for (const x of [late, early, mid]) await repo.addPractice(x);
    expect(await repo.listPractice()).toEqual([early, mid, late]);
    expect(await repo.listPractice({ caseId: 'oll2-sune' })).toEqual([mid, late]);
    expect(await repo.listPractice({ caseId: 'oll2-h' })).toEqual([]);
  });

  it('gravar de novo com o mesmo id não duplica e devolve a gravada', async () => {
    const repo = await fresh();
    const a = pr();
    await repo.addPractice(a);
    expect(await repo.addPractice({ ...a, ms: 1 })).toEqual(a);
    expect(await repo.listPractice()).toEqual([a]);
  });

  it('corrigir troca acerto e erro; apagar tira; uma tentativa que não existe falha', async () => {
    const repo = await fresh();
    const a = await repo.addPractice(pr());
    expect(await repo.updatePractice(a.id, { ok: false })).toEqual({ ...a, ok: false });
    expect((await repo.listPractice())[0].ok).toBe(false);
    await repo.deletePractice(a.id);
    expect(await repo.listPractice()).toEqual([]);
    await expect(repo.updatePractice('nada', { ok: true })).rejects.toThrow('nada');
  });

  it('cada escrita avisa "practice", uma vez; a repetida não avisa', async () => {
    const repo = await fresh();
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    const a = await repo.addPractice(pr());
    await repo.addPractice(a);
    await repo.updatePractice(a.id, { ok: false });
    await repo.deletePractice(a.id);
    expect(heard).toEqual(['practice', 'practice', 'practice']);
  });

  it('o treino não toca nos solves, nas sessões nem no perfil', async () => {
    const repo = await fresh();
    const session = await repo.createSession({ event: '333' });
    await repo.addSolve({ sessionId: session.id, event: '333', ms: 30_000, penalty: null, at: t, scramble: 'R' });
    const before = { solves: await repo.listSolves(), sessions: await repo.listSessions(), profile: await repo.getProfile() };
    const a = await repo.addPractice(pr());
    await repo.updatePractice(a.id, { ok: false });
    expect({ solves: await repo.listSolves(), sessions: await repo.listSessions(), profile: await repo.getProfile() }).toEqual(before);
  });
});
```

Acrescente ao fim de `app/tests/unit/db.test.ts`:

```ts

describe('versão 2 do banco', () => {
  it('a store do treino tem os índices por caso e por tempo', async () => {
    const db = await openKlickDb(fresh());
    const store = db.transaction('practice').objectStore('practice');
    expect([...store.indexNames].sort()).toEqual(['byAt', 'byCase']);
    expect(store.keyPath).toBe('id');
    db.close();
  });

  it('abrir a versão 1 (como fazem os testes de migração) não cria a store do treino', async () => {
    const db = await openKlickDb(fresh(), {}, 1);
    expect(db.objectStoreNames.contains('practice')).toBe(false);
    expect(db.objectStoreNames.contains('solves')).toBe(true);
    db.close();
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/repository-practice.test.ts tests/unit/db.test.ts`
Expected: FAIL (8 testes). Os motivos são `NotFoundError: No objectStore named practice in this database`, `TypeError: repo.addPractice is not a function` e, na migração, `expected [ 'backups', 'meta', 'profile', …(2) ] to deeply equal [ 'backups', 'meta', 'practice', …(3) ]`.

- [ ] **Step 3: Os tipos**

Em `app/src/core/types.ts`, troque a primeira linha:

```ts
// Tipos do domínio, compartilhados por core, data e ui. Em tempo de execução só existem DEFAULT_SETTINGS e defaultSettings().
```

por:

```ts
// Tipos do domínio, compartilhados por core, data e ui. Em tempo de execução só existem DEFAULT_SETTINGS e defaultSettings().
import type { TrailStep } from './trail/types';
```

No fim de `interface Profile`, troque:

```ts
  season: SeasonProgress; // a temporada atual e as fechadas (spec do sub-projeto 3, seção 5.1)
}
```

por:

```ts
  season: SeasonProgress; // a temporada atual e as fechadas (spec do sub-projeto 3, seção 5.1)
  // Trilha e treino (spec do sub-projeto 4, seção 9.2). Um perfil antigo, sem eles, lê {}, {} e [].
  lessonAt: Partial<Record<TrailStep, number>>; // o passo em que cada aula parou (some ao concluir)
  algChoice: Record<string, number>; // id do caso → índice em algs (sem a chave: o padrão, 0)
  trainOff: string[]; // ids dos casos fora do sorteio
}
```

No fim de `interface Meta`, troque:

```ts
  installGuideDismissed: boolean;
}
```

por:

```ts
  installGuideDismissed: boolean;
  trailPromptDismissed: boolean; // o aviso "Já resolve? Marque o que já sabe" foi dispensado neste aparelho
}
```

- [ ] **Step 4: O banco**

Em `app/src/data/db.ts`:

1. Troque o import de tipos:

```ts
import type { EventId, Meta, Profile, Session, Solve } from '../core/types';
```

por:

```ts
import type { EventId, Meta, Practice, Profile, Session, Solve } from '../core/types';
```

2. Suba a versão:

```ts
export const DB_VERSION = 1;
```

por:

```ts
export const DB_VERSION = 2;
```

3. No fim de `interface KlickDB`:

```ts
  backups: { key: string; value: BackupRecord; indexes: { byCreated: number } };
}
```

por:

```ts
  backups: { key: string; value: BackupRecord; indexes: { byCreated: number } };
  // O treino de algoritmos (versão 2): uma tentativa por registro, fora dos solves.
  practice: { key: string; value: Practice; indexes: { byCase: [string, number]; byAt: number } }; // [caseId, at]
}
```

4. No começo do `upgrade`:

```ts
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
```

por:

```ts
    // `newVersion` é a versão pedida: um teste que abre a versão 1 (para conferir a migração) não ganha a store da 2.
    upgrade(db, oldVersion, newVersion) {
      const target = newVersion ?? version;
      if (oldVersion < 1) {
```

5. No fim do `upgrade`:

```ts
        backups.createIndex('byCreated', 'createdAt');
      }
    },
```

por:

```ts
        backups.createIndex('byCreated', 'createdAt');
      }
      // Versão 2: o treino. Solves, sessões, perfil, meta e cópias passam intactos.
      if (oldVersion < 2 && target >= 2) {
        const practice = db.createObjectStore('practice', { keyPath: 'id' });
        practice.createIndex('byCase', ['caseId', 'at']);
        practice.createIndex('byAt', 'at');
      }
    },
```

A aba antiga que ainda usa a versão 1 recebe `blocking`, fecha a conexão e mostra o aviso de sempre (`db-notice.svelte.ts`): o caminho que já existe para uma migração vale aqui, sem mudança.

- [ ] **Step 5: O repositório**

Em `app/src/data/repository.ts`:

1. Troque o import de tipos:

```ts
import type { EventId, Meta, Penalty, Profile, SeasonRecord, SeasonState, Session, Settings, Solve } from '../core/types';
```

por:

```ts
import type { EventId, Meta, Penalty, Practice, Profile, SeasonRecord, SeasonState, Session, Settings, Solve } from '../core/types';
```

2. O aviso do treino:

```ts
export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'all';
```

por:

```ts
export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'all';
```

3. Em `interface Repository`, depois de `getSolves`:

```ts
  getSolves(ids: readonly string[]): Promise<(Solve | undefined)[]>; // vários solves por id numa leitura; o que não existe vem undefined
```

por:

```ts
  getSolves(ids: readonly string[]): Promise<(Solve | undefined)[]>; // vários solves por id numa leitura; o que não existe vem undefined
  // O treino (spec do sub-projeto 4, seção 9.1). Cada escrita avisa 'practice'. A tela só usa update e delete na correção da última.
  addPractice(p: Practice): Promise<Practice>; // pelo id de quem grava: uma nova tentativa com o mesmo id devolve a gravada, sem duplicar
  listPractice(f?: { caseId?: string }): Promise<Practice[]>; // em ordem de at; com caseId, só as daquele caso
  updatePractice(id: string, patch: { ok?: boolean }): Promise<Practice>;
  deletePractice(id: string): Promise<void>;
```

4. O canal entre abas aceita o aviso novo:

```ts
const CHANGE_KINDS: readonly string[] = ['solves', 'sessions', 'profile', 'meta', 'all'];
```

por:

```ts
const CHANGE_KINDS: readonly string[] = ['solves', 'sessions', 'profile', 'meta', 'practice', 'all'];
```

5. Em `META_DEFAULTS`:

```ts
  installGuideDismissed: false,
});
```

por:

```ts
  installGuideDismissed: false,
  trailPromptDismissed: false,
});
```

6. Em `defaultProfile()` (o `profileOrDefault` põe estes padrões por baixo de um perfil antigo):

```ts
    season: defaultSeason(),
  };
}
```

por:

```ts
    season: defaultSeason(),
    lessonAt: {},
    algChoice: {},
    trainOff: [],
  };
}
```

7. A ordem das tentativas:

```ts
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareText(a.id, b.id);
```

por:

```ts
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareText(a.id, b.id);
const byPracticeTime = (a: Practice, b: Practice): number => a.at - b.at || compareText(a.id, b.id);
```

8. Os métodos do treino, logo antes de `onChange(fn) {`:

```ts
    onChange(fn) {
      const entry = { fn };
```

por:

```ts
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

    onChange(fn) {
      const entry = { fn };
```

- [ ] **Step 6: O perfil provisório do AppState e o Meta do teste das cópias**

Em `app/src/ui/state/app.svelte.ts`, no fim de `placeholderProfile`:

```ts
  currentSessionId: null,
  season: defaultSeason(),
});
```

por:

```ts
  currentSessionId: null,
  season: defaultSeason(),
  lessonAt: {},
  algChoice: {},
  trainOff: [],
});
```

Em `app/tests/unit/safety.test.ts`, no `meta()` do começo:

```ts
  lastFolderSaveDay: null, v1ImportOffered: false, persistRequested: false, installGuideDismissed: false, ...p,
```

por:

```ts
  lastFolderSaveDay: null, v1ImportOffered: false, persistRequested: false, installGuideDismissed: false, trailPromptDismissed: false, ...p,
```

- [ ] **Step 7: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/repository-practice.test.ts tests/unit/db.test.ts`
Expected: PASS (7 + 4 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS (a suíte inteira: os testes de `db.test.ts` que abrem `DB_VERSION + 1` seguem valendo com a versão 2).

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/data/db.ts src/data/repository.ts src/ui/state/app.svelte.ts tests/unit/safety.test.ts tests/unit/db.test.ts tests/unit/repository-practice.test.ts
git commit -m "feat(app): banco versão 2 com o treino e os campos novos do perfil

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: O treino no arquivo, na importação, na restauração e nas cópias

Spec: seções 9.3 e 9.4 (e a decisão A6 do começo).

**Files:**
- Create: `app/src/core/trail/validate.ts`
- Modify: `app/src/data/repository.ts` (`KlickExport.practice`, `exportAll`, `importAll`, `replaceAll`)
- Modify: `app/src/data/transfer.ts` (`profileOf`, `parseKlickJson`)
- Modify: `app/tests/unit/repository-practice.test.ts`
- Test: `app/tests/unit/trail-transfer.test.ts`

**Interfaces:**
- Consumes: `caseById` (Task 2), `Practice` (Task 4), o repositório da Task 5.
- Produces (em `core/trail/validate.ts`): `isPractice(v: unknown): v is Practice`, `practiceFrom(v: unknown): Practice[]`, `algChoiceFrom(v: unknown): Record<string, number> | undefined`, `trainOffFrom(v: unknown): string[] | undefined`, `lessonAtFrom(v: unknown): Partial<Record<TrailStep, number>> | undefined`.
- Produces: `KlickExport.practice?: Practice[]` (opcional: os ~20 literais de `KlickExport` do app e dos testes continuam valendo, e `version` segue `1`).
- Comportamento:
  - `exportAll` leva o treino em ordem de tempo; a cópia do dia, a de 50 e a pre-restore são `exportAll`, então levam também;
  - `importAll` junta o treino pelo id (entra só o que não existe; o relatório não muda) e avisa `'all'` se algo entrou;
  - no perfil importado, `algChoice` e `lessonAt` juntam caso a caso (vale o do arquivo) e `trainOff` é o do arquivo;
  - `replaceAll` troca o treino pelo do arquivo; um arquivo sem `practice` (de antes do treino) não apaga o daqui, e um perfil sem os campos do treino mantém os daqui;
  - `parseKlickJson` deixa de fora a tentativa inválida (caso desconhecido, tempo inválido, campo faltando) sem recusar o arquivo; sem a lista, o arquivo entra como veio.

- [ ] **Step 1: Escreva os testes que falham**

Em `app/tests/unit/repository-practice.test.ts`, troque o import do repositório:

```ts
import { createRepository, type ChangeKind, type Repository } from '../../src/data/repository';
```

por:

```ts
import { createRepository, type ChangeKind, type KlickExport, type Repository } from '../../src/data/repository';
import { createBackup, restoreBackup } from '../../src/data/safety';
import { parseKlickJson, toKlickJson } from '../../src/data/transfer';
```

e acrescente ao fim do arquivo:

```ts

describe('o treino no arquivo e nas cópias (spec 9.3)', () => {
  const withoutPractice = (data: KlickExport): KlickExport => {
    const { practice: _, ...rest } = data;
    return rest;
  };

  it('exportar leva o treino em ordem de tempo; importar num aparelho vazio traz igual; importar de novo não duplica', async () => {
    const source = await fresh();
    const a = await source.addPractice(pr({ at: 9_000 }));
    const b = await source.addPractice(pr({ at: 2_000, caseId: 'f2l-07', ok: false }));
    const data = parseKlickJson(toKlickJson(await source.exportAll()));
    expect(data.practice).toEqual([b, a]);
    const target = await fresh();
    await target.importAll(data);
    await target.importAll(data);
    expect(await target.listPractice()).toEqual([b, a]);
  });

  it('importar junta pelo id: o daqui fica como está, o novo do arquivo entra, e avisa', async () => {
    const repo = await fresh();
    const mine = await repo.addPractice(pr({ ok: true }));
    const theirs = pr({ caseId: 'pll2-h' });
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    const file = await repo.exportAll();
    await repo.importAll({ ...file, practice: [{ ...mine, ok: false }, theirs] });
    expect(await repo.listPractice()).toEqual([mine, theirs]);
    expect(heard).toEqual(['all']);
  });

  it('arquivo antigo, sem treino: entra normalmente e o treino daqui continua', async () => {
    const repo = await fresh();
    const mine = await repo.addPractice(pr());
    const old = withoutPractice(await (await fresh()).exportAll());
    await repo.importAll(parseKlickJson(toKlickJson(old)));
    expect(await repo.listPractice()).toEqual([mine]);
  });

  it('restaurar troca o treino pelo da cópia; uma cópia de antes do treino não apaga o daqui', async () => {
    const repo = await fresh();
    const kept = await repo.addPractice(pr());
    const snapshot = await repo.exportAll();
    await repo.addPractice(pr({ caseId: 'oll2-t' }));
    await repo.replaceAll(snapshot);
    expect(await repo.listPractice()).toEqual([kept]);
    await repo.replaceAll({ ...snapshot, practice: [] });
    expect(await repo.listPractice()).toEqual([]);
    const later = await repo.addPractice(pr());
    await repo.replaceAll(withoutPractice(snapshot));
    expect(await repo.listPractice()).toEqual([later]);
  });

  it('restaurar uma cópia de antes do treino mantém a escolha de algoritmos, os casos fora e o passo das aulas daqui', async () => {
    const repo = await fresh();
    await repo.saveProfile({ finish: 'fosco' });
    const old = withoutPractice(await repo.exportAll());
    const { lessonAt: _l, algChoice: _a, trainOff: _o, ...oldProfile } = old.profile!;
    await repo.saveProfile({ algChoice: { 'oll2-h': 1 }, trainOff: ['pll2-z'], lessonAt: { 0: 3 } });
    await repo.replaceAll({ ...old, profile: oldProfile });
    const p = await repo.getProfile();
    expect([p.algChoice, p.trainOff, p.lessonAt]).toEqual([{ 'oll2-h': 1 }, ['pll2-z'], { 0: 3 }]);
  });

  it('importar o perfil: a escolha de algoritmo junta caso a caso (vale a do arquivo); os casos fora são os do arquivo', async () => {
    const repo = await fresh();
    await repo.saveProfile({ algChoice: { 'oll2-h': 1, 'f2l-03': 2 }, trainOff: ['oll2-pi'] });
    const file = await repo.exportAll();
    await repo.importAll({ ...file, profile: { algChoice: { 'f2l-03': 1 }, trainOff: ['pll2-t'] } });
    const p = await repo.getProfile();
    expect(p.algChoice).toEqual({ 'oll2-h': 1, 'f2l-03': 1 });
    expect(p.trainOff).toEqual(['pll2-t']);
  });

  it('a cópia de segurança leva o treino, e restaurá-la o traz de volta', async () => {
    const repo = await fresh();
    const a = await repo.addPractice(pr());
    const backup = await createBackup(repo, 'manual', t);
    await repo.deletePractice(a.id);
    await repo.addPractice(pr({ caseId: 'pll2-ua' }));
    t += 1000;
    await restoreBackup(repo, backup.id, t);
    expect(await repo.listPractice()).toEqual([a]);
  });
});
```

Crie `app/tests/unit/trail-transfer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Practice } from '../../src/core/types';
import { parseKlickJson } from '../../src/data/transfer';

const base = { format: 'klick', version: 1, exportedAt: 1, sessions: [], solves: [], profile: null };
const good: Practice = { id: 'p1', caseId: 'oll2-sune', ms: 2400, ok: true, helped: false, at: 1_791_500_000_000 };
const withPractice = (practice: unknown) => JSON.stringify({ ...base, practice });
const withProfile = (profile: unknown) => JSON.stringify({ ...base, profile });

describe('treino no arquivo do Klick: o que não vale fica de fora, o arquivo entra (spec 9.3)', () => {
  it('a tentativa válida passa intacta, inclusive campos que o Klick ainda não conhece', () => {
    const extra = { ...good, device: 'x' };
    expect(parseKlickJson(withPractice([good, extra])).practice).toEqual([good]); // o id repetido: fica a primeira
    expect(parseKlickJson(withPractice([extra])).practice).toEqual([extra]);
  });

  it('caso desconhecido, tempo inválido ou campo faltando: a tentativa sai, as outras ficam', () => {
    const bad = [
      { ...good, id: 'a', caseId: 'oll2-nada' },
      { ...good, id: 'b', ms: -1 },
      { ...good, id: 'c', ms: '2400' },
      { ...good, id: 'd', ok: 'sim' },
      { ...good, id: 'e', helped: undefined },
      { ...good, id: 'f', at: null },
      { ...good, id: '' },
      'texto',
      null,
    ];
    expect(parseKlickJson(withPractice([...bad, { ...good, id: 'ok' }])).practice).toEqual([{ ...good, id: 'ok' }]);
  });

  it('um arquivo de antes do treino não ganha a lista; uma lista que não é lista é ignorada', () => {
    expect('practice' in parseKlickJson(JSON.stringify(base))).toBe(false);
    expect('practice' in parseKlickJson(withPractice({ id: 'p1' }))).toBe(false);
    expect(parseKlickJson(withPractice([])).practice).toEqual([]);
  });
});

describe('trilha e treino no perfil do arquivo', () => {
  it('a escolha de algoritmo fora do intervalo, de caso desconhecido ou não inteira vira o padrão (sai)', () => {
    const algChoice = { 'oll2-h': 1, 'oll2-sune': 1, 'f2l-03': 2, 'f2l-04': -1, 'pll2-t': 0.5, 'oll2-nada': 0 };
    expect(parseKlickJson(withProfile({ algChoice })).profile).toEqual({ algChoice: { 'oll2-h': 1, 'f2l-03': 2 } });
    expect(parseKlickJson(withProfile({ algChoice: [1] })).profile).toEqual({});
  });

  it('ids desconhecidos em trainOff são ignorados, e nada repete', () => {
    const trainOff = ['pll2-z', 'nada', 3, 'pll2-z', 'f2l-41'];
    expect(parseKlickJson(withProfile({ trainOff })).profile).toEqual({ trainOff: ['pll2-z', 'f2l-41'] });
    expect(parseKlickJson(withProfile({ trainOff: 'pll2-z' })).profile).toEqual({});
  });

  it('o passo das aulas: etapas de 0 a 8 e passos inteiros a partir de 0', () => {
    const lessonAt = { 0: 3, 8: 0, 9: 1, 2: -1, 3: 1.5, x: 2 };
    expect(parseKlickJson(withProfile({ lessonAt })).profile).toEqual({ lessonAt: { 0: 3, 8: 0 } });
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/repository-practice.test.ts tests/unit/trail-transfer.test.ts`
Expected: FAIL (12 testes). Por exemplo: `expected undefined to deeply equal [ { id: 'p0009', …(5) }, …(1) ]` (o export ainda sem o treino), `expected {} to deeply equal { algChoice: … }` (o perfil do arquivo ainda sem os campos do treino) e `expected [ {}, [], {} ] to deeply equal [ { 'oll2-h': 1 }, [ 'pll2-z' ], …(1) ]` (a restauração antiga zerando as escolhas).

- [ ] **Step 3: A validação do que vem de fora**

Crie `app/src/core/trail/validate.ts`:

```ts
// O que vem de fora (arquivo do Klick, cópia de segurança) sobre a trilha e o treino (spec 9.3). Nada aqui recusa o arquivo: o que não
// bate fica de fora e o resto entra, porque os solves valem mais que uma tentativa de treino estranha.
import type { Practice } from '../types';
import { caseById } from './cases';
import type { TrailStep } from './types';

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

// Uma tentativa com todos os campos, de um caso que o Klick conhece e com um tempo válido.
export function isPractice(v: unknown): v is Practice {
  return (
    isRec(v) && typeof v.id === 'string' && v.id !== '' && typeof v.caseId === 'string' && caseById(v.caseId) !== undefined &&
    isNum(v.ms) && v.ms >= 0 && typeof v.ok === 'boolean' && typeof v.helped === 'boolean' && isNum(v.at)
  );
}

// As tentativas válidas da lista, sem repetir id (fica a primeira). Campos que o Klick ainda não conhece passam intactos, como nos solves.
export function practiceFrom(v: unknown): Practice[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Practice[] = [];
  for (const x of v) {
    if (!isPractice(x) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

// A escolha de algoritmo por caso: só os casos conhecidos e os índices que existem neles. O resto sai, e sem a chave vale o padrão (0).
export function algChoiceFrom(v: unknown): Record<string, number> | undefined {
  if (!isRec(v)) return undefined;
  return Object.fromEntries(
    Object.entries(v).filter(([id, i]) => {
      const c = caseById(id);
      return c !== undefined && isIndex(i) && i < c.algs.length;
    }),
  ) as Record<string, number>;
}

// Os casos fora do sorteio: só ids conhecidos, sem repetir.
export function trainOffFrom(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return [...new Set(v.filter((id): id is string => typeof id === 'string' && caseById(id) !== undefined))];
}

// O passo em que cada aula parou: etapas de 0 a 8 e passos inteiros a partir de 0 (quem abre a aula limita ao último passo dela).
export function lessonAtFrom(v: unknown): Partial<Record<TrailStep, number>> | undefined {
  if (!isRec(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([step, i]) => /^[0-8]$/.test(step) && isIndex(i))) as Partial<Record<TrailStep, number>>;
}
```

- [ ] **Step 4: O repositório**

Em `app/src/data/repository.ts`:

1. Import:

```ts
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
```

por:

```ts
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { practiceFrom } from '../core/trail/validate';
```

2. Em `interface KlickExport`:

```ts
  profile: ProfilePatch | null; // o export sai completo; o que vem de um arquivo pode faltar campo (quem grava junta com o perfil daqui)
}
```

por:

```ts
  profile: ProfilePatch | null; // o export sai completo; o que vem de um arquivo pode faltar campo (quem grava junta com o perfil daqui)
  practice?: Practice[]; // o treino (spec do sub-projeto 4, seção 9.3); um arquivo de antes do treino não tem
}
```

3. Os comentários do contrato de `importAll` e `replaceAll`:

```ts
  importAll(data: KlickExport): Promise<ImportReport>; // junta por id; fica o de updatedAt maior. Sessão da lixeira que recebe solve ativo do arquivo volta (sem entrar no relatório; avisa sessions). O perfil do arquivo vale por cima do daqui (ver importAll)
  replaceAll(data: KlickExport): Promise<void>; // limpa solves, sessões e perfil e grava os do arquivo; a temporada fica a mais adiantada (a daqui ou a do arquivo)
```

por:

```ts
  importAll(data: KlickExport): Promise<ImportReport>; // junta por id; fica o de updatedAt maior. Sessão da lixeira que recebe solve ativo do arquivo volta (sem entrar no relatório; avisa sessions). O perfil do arquivo vale por cima do daqui (ver importAll). O treino junta pelo id, sem duplicar (fora do relatório)
  replaceAll(data: KlickExport): Promise<void>; // limpa solves, sessões e perfil e grava os do arquivo; a temporada fica a mais adiantada (a daqui ou a do arquivo). O treino troca junto, se o arquivo o tiver
```

4. Em `exportAll`, a leitura:

```ts
      // Uma transação só, para sessões, solves e perfil virem do mesmo instante.
      const [sessions, solves, profile] = await read(['sessions', 'solves', 'profile'], (tx) =>
        Promise.all([tx.objectStore('sessions').getAll(), tx.objectStore('solves').getAll(), tx.objectStore('profile').get('current')]),
      );
```

por:

```ts
      // Uma transação só, para sessões, solves, perfil e treino virem do mesmo instante.
      const [sessions, solves, profile, practice] = await read(['sessions', 'solves', 'profile', 'practice'], (tx) =>
        Promise.all([
          tx.objectStore('sessions').getAll(),
          tx.objectStore('solves').getAll(),
          tx.objectStore('profile').get('current'),
          tx.objectStore('practice').getAll(),
        ]),
      );
```

5. e o retorno:

```ts
        profile: profile ? profileOrDefault(profile) : null,
      };
    },
```

por:

```ts
        profile: profile ? profileOrDefault(profile) : null,
        practice: practice.sort(byPracticeTime),
      };
    },
```

6. Em `importAll`, a transação inclui o treino:

```ts
      const outcome = await write(['sessions', 'solves', 'profile'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const profile = tx.objectStore('profile');
```

por:

```ts
      const outcome = await write(['sessions', 'solves', 'profile', 'practice'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const profile = tx.objectStore('profile');
        const practice = tx.objectStore('practice');
```

7. No `merged` do perfil:

```ts
            onboarded: base.onboarded || theirs.onboarded === true,
            currentSessionId,
          });
```

por:

```ts
            onboarded: base.onboarded || theirs.onboarded === true,
            currentSessionId,
            // Treino: a escolha de algoritmo e o passo das aulas juntam caso a caso (vale o do arquivo); os casos fora do sorteio são os do
            // arquivo, quando ele os traz.
            algChoice: { ...base.algChoice, ...theirs.algChoice },
            lessonAt: { ...base.lessonAt, ...theirs.lessonAt },
            trainOff: theirs.trainOff ?? base.trainOff,
          });
```

8. O fim da transação e o aviso:

```ts
        return { profileSaved, sessionBack };
      });
      if (outcome.profileSaved || report.sessionsAdded + report.solvesAdded + report.solvesUpdated > 0) announce('all');
```

por:

```ts

        // O treino junta pelo id (spec do sub-projeto 4, seção 9.3): entra o que não existe; o que já existe fica como está.
        const knownPractice = new Set(await practice.getAllKeys());
        const newPractice = practiceFrom(data.practice).filter((p) => !knownPractice.has(p.id));
        await each(newPractice, (p) => practice.put(p));
        return { profileSaved, sessionBack, practiceAdded: newPractice.length };
      });
      const changed = report.sessionsAdded + report.solvesAdded + report.solvesUpdated + outcome.practiceAdded > 0;
      if (outcome.profileSaved || changed) announce('all');
```

9. Em `replaceAll`, o começo:

```ts
      const { sessions, solves, profile } = data;
      await write(['sessions', 'solves', 'profile'], async (tx) => {
        const sessionStore = tx.objectStore('sessions');
        const solveStore = tx.objectStore('solves');
        const profileStore = tx.objectStore('profile');
```

por:

```ts
      const { sessions, solves, profile } = data;
      // Uma cópia de antes do treino (sem `practice`) não apaga o treino daqui; com a lista, mesmo vazia, o treino é o dela.
      const practice = data.practice === undefined ? null : practiceFrom(data.practice);
      await write(['sessions', 'solves', 'profile', 'practice'], async (tx) => {
        const sessionStore = tx.objectStore('sessions');
        const solveStore = tx.objectStore('solves');
        const profileStore = tx.objectStore('profile');
        const practiceStore = tx.objectStore('practice');
```

10. a troca:

```ts
        await Promise.all([sessionStore.clear(), solveStore.clear(), profileStore.clear()]);
        await each(sessions, (s) => sessionStore.put(s));
        await each(solves, (s) => solveStore.put(s));
        const restored = profile ? mergeProfile(defaultProfile(), profile) : null;
```

por:

```ts
        await Promise.all([sessionStore.clear(), solveStore.clear(), profileStore.clear(), ...(practice ? [practiceStore.clear()] : [])]);
        await each(sessions, (s) => sessionStore.put(s));
        await each(solves, (s) => solveStore.put(s));
        if (practice) await each(practice, (p) => practiceStore.put(p));
        // O que é do treino e a cópia não traz (uma cópia de antes do treino) fica o daqui.
        const kept: ProfilePatch = { lessonAt: local.lessonAt, algChoice: local.algChoice, trainOff: local.trainOff };
        const restored = profile ? mergeProfile(defaultProfile(), { ...kept, ...profile }) : null;
```

11. e o perfil de quando a cópia não traz perfil, mas há temporada a guardar:

```ts
          const base = restored ?? { ...defaultProfile(), finish: local.finish };
```

por:

```ts
          const base = restored ?? mergeProfile(defaultProfile(), { ...kept, finish: local.finish });
```

- [ ] **Step 5: O arquivo do Klick**

Em `app/src/data/transfer.ts`:

1. Import:

```ts
import { seasonFrom } from '../core/season';
```

por:

```ts
import { seasonFrom } from '../core/season';
import { algChoiceFrom, lessonAtFrom, practiceFrom, trainOffFrom } from '../core/trail/validate';
```

2. No fim de `profileOf`:

```ts
  const season = seasonFrom(v.season);
  if (season) profile.season = season;
  return profile;
}
```

por:

```ts
  const season = seasonFrom(v.season);
  if (season) profile.season = season;
  // Trilha e treino: fica o que vale (escolha dentro dos algoritmos do caso, casos conhecidos, passos inteiros); o resto vira o padrão.
  const lessonAt = lessonAtFrom(v.lessonAt);
  if (lessonAt) profile.lessonAt = lessonAt;
  const algChoice = algChoiceFrom(v.algChoice);
  if (algChoice) profile.algChoice = algChoice;
  const trainOff = trainOffFrom(v.trainOff);
  if (trainOff) profile.trainOff = trainOff;
  return profile;
}
```

3. `parseKlickJson`:

```ts
  if (!isKlickExport(data)) throw new Error(T.transfer.klickInvalid);
  const profile: unknown = data.profile;
  return { ...data, profile: isRecord(profile) ? profileOf(profile) : null };
}
```

por:

```ts
  if (!isKlickExport(data)) throw new Error(T.transfer.klickInvalid);
  const { practice, ...rest } = data;
  const profile: unknown = rest.profile;
  const out: KlickExport = { ...rest, profile: isRecord(profile) ? profileOf(profile) : null };
  // O treino (spec do sub-projeto 4, seção 9.3): só as tentativas válidas, e o arquivo não é recusado por elas. Sem a lista (um arquivo de
  // antes do treino), o arquivo entra como veio.
  const list: unknown = practice;
  if (Array.isArray(list)) out.practice = practiceFrom(list);
  return out;
}
```

O `isKlickExport` mais solto de `safety.ts` (o das cópias) não muda: a cópia é do próprio Klick, e o `replaceAll` passa o treino dela pelo `practiceFrom` de qualquer jeito.

- [ ] **Step 6: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/repository-practice.test.ts tests/unit/trail-transfer.test.ts`
Expected: PASS (14 + 6 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS (os testes de `transfer.test.ts` que comparam a ida e volta com `toEqual` seguem passando: um arquivo sem `practice` continua sem a chave).

- [ ] **Step 7: Commit**

```bash
git add src/core/trail/validate.ts src/data/repository.ts src/data/transfer.ts tests/unit/repository-practice.test.ts tests/unit/trail-transfer.test.ts
git commit -m "feat(app): o treino no arquivo, na importação, na restauração e nas cópias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Trilha e treino no estado do app

Spec: seções 6.2, 7.2 (gravar e corrigir), 8.2, 8.4, 9.2, 9.3 (cópia do dia) e 9.4.

**Files:**
- Modify: `app/src/ui/state/app.svelte.ts`
- Test: `app/tests/unit/app-trail.test.ts`

**Interfaces:**
- Consumes: o repositório das Tasks 5 e 6; `Practice` (Task 4); `CaseSet`, `TrailStep` (Task 1).
- Produces (em `ui/state/app.svelte.ts`):
  - `type Tab` ganha `'trilha'` (a aba em si entra na Task 9)
  - `type TrailView = { kind: 'home' } | { kind: 'lesson'; step: TrailStep } | { kind: 'set'; set: CaseSet } | { kind: 'round'; set: CaseSet }`
  - campos `practice = $state.raw<Practice[]>([])`, `trailView = $state<TrailView>({ kind: 'home' })`, `trailFlashes = $state(0)`, `trainerRunning = $state(false)`
  - `get trailPromptShown(): boolean`
  - `openTrail(view?: TrailView): void`
  - `setTrail(steps: readonly TrailStep[], done: boolean): Promise<boolean>`, `completeLesson(step: TrailStep): Promise<boolean>`, `setLessonAt(step: TrailStep, part: number): Promise<boolean>`, `setAlgChoice(caseId: string, index: number): Promise<boolean>`, `setCaseOff(caseId: string, off: boolean): Promise<boolean>`, `dismissTrailPrompt(): Promise<void>`
  - `addPractice(r: Omit<Practice, 'id'>): Promise<Practice | null>`, `setPracticeOk(id: string, ok: boolean): Promise<boolean>`, `deletePractice(id: string): Promise<boolean>`
- Comportamento:
  - as escritas do perfil pela trilha andam numa fila própria (`trailWrites`): cada uma lê o perfil depois da anterior, porque o perfil grava inteiro (Review Focus 5);
  - `trailFlashes` sobe quando uma etapa que não estava marcada fica marcada (o Centro pequeno pisca, Task 9);
  - o treino na memória é relido com os outros tipos (`'practice'` em `ALL_READS`) e chega de outra aba pelo aviso `'practice'`;
  - a primeira tentativa depois de uma cópia leva `solvesSinceBackup` a 1, para a cópia do dia sair num dia só de treino (Review Focus 4);
  - a exportação de emergência (banco quebrado) leva o treino da memória.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/app-trail.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;

async function setup(repo?: Repository) {
  const r = repo ?? createRepository(await openKlickDb(`trail-app-${++n}`), { now, channel: null });
  const app = new AppState({ repo: r, queue: createScrambleQueue({ generate: async () => 'R U' }), now, storage: null, storageManager: null });
  await app.init();
  return { repo: r, app };
}
const attempt = (o: Partial<{ caseId: string; ms: number; ok: boolean; helped: boolean; at: number }> = {}) => ({
  caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: (t += 1000), ...o,
});

function bus() {
  const members: ChannelLike[] = [];
  return {
    make(): ChannelLike {
      const ch: ChannelLike = {
        onmessage: null,
        postMessage(data) {
          for (const m of members) if (m !== ch) m.onmessage?.({ data });
        },
      };
      members.push(ch);
      return ch;
    },
  };
}

describe('treino no AppState (spec 7 e 9)', () => {
  beforeEach(() => {
    t = 1_791_500_000_000;
  });

  it('a abertura lê o treino gravado, em ordem de tempo', async () => {
    const repo = createRepository(await openKlickDb(`trail-app-${++n}`), { now, channel: null });
    const late = await repo.addPractice({ id: 'b', ...attempt({ at: 20 }) });
    const early = await repo.addPractice({ id: 'a', ...attempt({ at: 10 }) });
    const { app } = await setup(repo);
    expect(app.practice).toEqual([early, late]);
  });

  it('uma tentativa grava no treino e fica fora dos solves, das sessões e das contas de exportar', async () => {
    const { app, repo } = await setup();
    const sessions = app.sessions;
    const exportCount = app.meta?.solvesSinceExport;
    const saved = await app.addPractice(attempt());
    expect(saved).not.toBeNull();
    expect(app.practice).toEqual([saved]);
    expect(await repo.listPractice()).toEqual([saved]);
    expect(app.solves).toEqual([]);
    expect(await repo.listSolves()).toEqual([]);
    expect(app.sessions).toEqual(sessions);
    expect((await repo.getMeta()).solvesSinceExport).toBe(exportCount);
  });

  it('um dia só de treino marca a cópia do dia (contador em 1); com solves contados, o contador não muda', async () => {
    const { app, repo } = await setup();
    await app.addPractice(attempt());
    await vi.waitFor(async () => expect((await repo.getMeta()).solvesSinceBackup).toBe(1));
    await app.addPractice(attempt());
    await new Promise((r) => setTimeout(r, 20));
    expect((await repo.getMeta()).solvesSinceBackup).toBe(1);
  });

  it('uma tentativa que não grava mostra o aviso e devolve null; o treino na memória não muda', async () => {
    const { app, repo } = await setup();
    repo.addPractice = async () => {
      throw new Error('quota');
    };
    expect(await app.addPractice(attempt())).toBeNull();
    expect(app.practice).toEqual([]);
    expect(app.toast?.text).toBe(T.data.changeFailed);
  });

  it('corrigir a última: trocar acerto por erro e apagar, na memória e no banco', async () => {
    const { app, repo } = await setup();
    const a = (await app.addPractice(attempt()))!;
    expect(await app.setPracticeOk(a.id, false)).toBe(true);
    expect(app.practice[0].ok).toBe(false);
    expect((await repo.listPractice())[0].ok).toBe(false);
    expect(await app.deletePractice(a.id)).toBe(true);
    expect(app.practice).toEqual([]);
    expect(await repo.listPractice()).toEqual([]);
  });

  it('o treino gravado em outra aba chega aqui', async () => {
    const name = `trail-app-${++n}`;
    const b = bus();
    const { app: a } = await setup(createRepository(await openKlickDb(name), { now, channel: b.make() }));
    const { app: other } = await setup(createRepository(await openKlickDb(name), { now, channel: b.make() }));
    const saved = await a.addPractice(attempt());
    await vi.waitFor(() => expect(other.practice).toEqual([saved]));
  });

  it('a exportação de emergência (banco quebrado) leva o treino da memória', async () => {
    const { app, repo } = await setup();
    const saved = await app.addPractice(attempt());
    repo.exportAll = async () => {
      throw new Error('banco quebrado');
    };
    expect((await app.exportData()).practice).toEqual([saved]);
  });
});

describe('trilha no AppState (spec 6.2, 8.2 e 8.4)', () => {
  it('marcar etapas grava e pisca a face lateral só quando alguma etapa nova acende', async () => {
    const { app, repo } = await setup();
    expect(await app.setTrail([0], true)).toBe(true);
    expect(app.trailFlashes).toBe(1);
    await app.setTrail([0], true); // já marcada: sem piscada
    await app.setTrail([0], false); // desfazer: sem piscada
    expect(app.trailFlashes).toBe(1);
    await app.setTrail([2, 3, 4], true); // várias de uma vez: uma piscada
    expect(app.trailFlashes).toBe(2);
    expect((await repo.getProfile()).trail.slice(0, 5)).toEqual([false, false, true, true, true]);
  });

  it('dois toques seguidos em etapas diferentes não se perdem (a fila lê o perfil depois da gravação anterior)', async () => {
    const { app, repo } = await setup();
    await Promise.all([app.setTrail([0], true), app.setTrail([1], true), app.setAlgChoice('oll2-h', 1), app.setCaseOff('pll2-z', true)]);
    const p = await repo.getProfile();
    expect(p.trail.slice(0, 2)).toEqual([true, true]);
    expect(p.algChoice).toEqual({ 'oll2-h': 1 });
    expect(p.trainOff).toEqual(['pll2-z']);
  });

  it('um perfil que não grava: aviso, false, e a memória volta ao gravado', async () => {
    const { app, repo } = await setup();
    repo.saveProfile = async () => {
      throw new Error('quota');
    };
    expect(await app.setTrail([0], true)).toBe(false);
    expect(app.toast?.text).toBe(T.data.changeFailed);
    expect(app.profile.trail[0]).toBe(false);
    expect(app.trailFlashes).toBe(0);
  });

  it('concluir a aula marca a etapa e zera o passo guardado; concluída de novo, só zera', async () => {
    const { app, repo } = await setup();
    await app.setLessonAt(0, 4);
    await app.setLessonAt(1, 2);
    expect((await repo.getProfile()).lessonAt).toEqual({ 0: 4, 1: 2 });
    await app.completeLesson(0);
    expect(app.profile.trail[0]).toBe(true);
    expect(app.profile.lessonAt).toEqual({ 1: 2 });
    expect(app.trailFlashes).toBe(1);
    await app.setLessonAt(0, 1);
    await app.completeLesson(0);
    expect((await repo.getProfile()).lessonAt).toEqual({ 1: 2 });
    expect(app.trailFlashes).toBe(1);
  });

  it('a escolha de algoritmo padrão (0) não fica guardada; tirar e devolver um caso do sorteio', async () => {
    const { app, repo } = await setup();
    await app.setAlgChoice('oll2-h', 1);
    await app.setAlgChoice('oll2-h', 0);
    expect((await repo.getProfile()).algChoice).toEqual({});
    await app.setCaseOff('oll2-pi', true);
    await app.setCaseOff('oll2-pi', true);
    expect(app.profile.trainOff).toEqual(['oll2-pi']);
    await app.setCaseOff('oll2-pi', false);
    expect((await repo.getProfile()).trainOff).toEqual([]);
  });

  it('o aviso de marcar o que já sabe: some ao marcar uma etapa ou ao dispensar (que fica no meta)', async () => {
    const first = await setup();
    expect(first.app.trailPromptShown).toBe(true);
    await first.app.setTrail([5], true);
    expect(first.app.trailPromptShown).toBe(false);
    const second = await setup();
    await second.app.dismissTrailPrompt();
    expect(second.app.trailPromptShown).toBe(false);
    expect((await second.repo.getMeta()).trailPromptDismissed).toBe(true);
  });

  it('openTrail abre a aba Trilha na vista pedida', async () => {
    const { app } = await setup();
    app.openTrail({ kind: 'lesson', step: 0 });
    expect(app.tab).toBe('trilha');
    expect(app.trailView).toEqual({ kind: 'lesson', step: 0 });
    app.openTrail();
    expect(app.trailView).toEqual({ kind: 'home' });
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/app-trail.test.ts`
Expected: FAIL (14 testes): `TypeError: app.addPractice is not a function`, `app.setTrail is not a function`, `app.openTrail is not a function`, e `expected undefined to deeply equal [ Array(2) ]` na abertura.

- [ ] **Step 3: Implemente no AppState**

Em `app/src/ui/state/app.svelte.ts`:

1. Imports:

```ts
import { dayKey } from '../../core/stats';
import { defaultSettings } from '../../core/types';
import type { EventId, Meta, Penalty, Profile, SeasonState, Session, Solve } from '../../core/types';
```

por:

```ts
import { dayKey } from '../../core/stats';
import type { CaseSet, TrailStep } from '../../core/trail/types';
import { defaultSettings } from '../../core/types';
import type { EventId, Meta, Penalty, Practice, Profile, SeasonState, Session, Solve } from '../../core/types';
```

2. A aba e a vista da Trilha:

```ts
export type Tab = 'timer' | 'evolucao' | 'companion' | 'ajustes';
```

por:

```ts
export type Tab = 'timer' | 'evolucao' | 'trilha' | 'companion' | 'ajustes';
// Onde a aba Trilha está (spec do sub-projeto 4, seção 8.2): o começo, a aula de uma etapa, um conjunto do treino ou a rodada dele.
// Fica no AppState: a tela da Trilha só existe com a aba aberta, e a pessoa volta ao mesmo lugar.
export type TrailView = { kind: 'home' } | { kind: 'lesson'; step: TrailStep } | { kind: 'set'; set: CaseSet } | { kind: 'round'; set: CaseSet };
```

3. O treino entra nas leituras de tudo (abertura, recarga, aviso `'all'` de outra aba, depois de importar e de restaurar):

```ts
const ALL_READS: readonly ReadKind[] = ['sessions', 'solves', 'profile', 'meta'];
```

por:

```ts
const ALL_READS: readonly ReadKind[] = ['sessions', 'solves', 'profile', 'meta', 'practice'];
```

4. A ordem das tentativas, logo depois de `bySolveTime`:

```ts
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareId(a.id, b.id);
```

por:

```ts
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareId(a.id, b.id);
const byPracticeTime = (a: Practice, b: Practice): number => a.at - b.at || compareId(a.id, b.id);
```

5. Os campos, depois de `solvesInFlight`:

```ts
  solvesInFlight = $state(0); // addSolve ainda não voltou (o solve não está gravado nem na fila): o unsaved espera por ele
```

por:

```ts
  solvesInFlight = $state(0); // addSolve ainda não voltou (o solve não está gravado nem na fila): o unsaved espera por ele
  // Trilha e treino (spec do sub-projeto 4). O treino tem a própria lista: nada dele entra em solves, recordes, temporadas ou marcos.
  practice = $state.raw<Practice[]>([]); // as tentativas do treino, em ordem de at (lista de referência, como os solves)
  trailView = $state<TrailView>({ kind: 'home' });
  trailFlashes = $state(0); // soma 1 a cada vez que uma etapa nova fica marcada: o Centro da Trilha pisca a face lateral
  trainerRunning = $state(false); // o timer do treino está rodando: os atalhos da tela do Timer esperam (a tecla que para não troca de aba)
```

6. A fila das escritas da trilha:

```ts
  private chain: Promise<void> = Promise.resolve();
  private undo: { id: string; until: number } | null = null;
```

por:

```ts
  private chain: Promise<void> = Promise.resolve();
  // As escritas da trilha e do treino no perfil, em fila: cada uma lê o perfil depois da gravação anterior (o perfil grava inteiro).
  private trailWrites: Promise<unknown> = Promise.resolve();
  private undo: { id: string; until: number } | null = null;
```

7. Em `readKinds`, a leitura:

```ts
        want.has('meta') ? repo.getMeta() : undefined,
      ] as const);
      const [sessions, solves, profile, meta] = deadline ? await this.withReadDeadline(reading, repo) : await reading;
```

por:

```ts
        want.has('meta') ? repo.getMeta() : undefined,
        want.has('practice') ? repo.listPractice() : undefined,
      ] as const);
      const [sessions, solves, profile, meta, practice] = deadline ? await this.withReadDeadline(reading, repo) : await reading;
```

8. e a atribuição:

```ts
      if (profile) this.profile = profile;
      if (meta) this.meta = meta;
      // A sessão que o perfil aponta
```

por:

```ts
      if (profile) this.profile = profile;
      if (meta) this.meta = meta;
      if (practice) this.practice = practice;
      // A sessão que o perfil aponta
```

9. Na exportação de emergência (`exportData`, o `catch`):

```ts
        solves: withPending($state.snapshot(this.solves), [...before, ...this.pendingSolves()]),
        profile: $state.snapshot(this.profile),
      };
```

por:

```ts
        solves: withPending($state.snapshot(this.solves), [...before, ...this.pendingSolves()]),
        profile: $state.snapshot(this.profile),
        practice: $state.snapshot(this.practice),
      };
```

10. Os métodos, logo antes de `private clearScramble(): void {`:

```ts
  // Tira o embaralhamento da tela e invalida os pedidos em voo: o que chegar depois não é mais deste evento.
  private clearScramble(): void {
```

por:

```ts
  // --- Trilha e treino (spec do sub-projeto 4). Nada aqui toca em sessões, solves, recordes, temporadas, marcos ou no coach. ---

  // O aviso "Já resolve? Marque o que já sabe": enquanto nenhuma etapa está marcada e este aparelho não o dispensou.
  get trailPromptShown(): boolean {
    return this.meta !== null && !this.meta.trailPromptDismissed && this.profile.trail.every((done) => !done);
  }

  // Abre a aba Trilha numa vista (a aula de uma etapa, um conjunto, a rodada) ou no começo.
  openTrail(view: TrailView = { kind: 'home' }): void {
    this.trailView = view;
    this.tab = 'trilha';
  }

  // Uma escrita do perfil pela trilha, na fila. Se não grava, o aviso sai e a memória volta ao que está gravado (spec 9.4).
  private trailJob(job: () => Partial<Omit<Profile, 'settings'>>): Promise<boolean> {
    const run = this.trailWrites.then(async () => {
      const ok = await this.write(async () => {
        this.profile = await this.repo.saveProfile(job());
      });
      if (!ok) await this.refreshKinds(['profile']);
      return ok;
    });
    this.trailWrites = run.catch(() => undefined);
    return run;
  }

  // Marca ou desmarca etapas ("já sei", "desfazer" ou várias de uma vez). Marcar alguma que ainda não estava marcada pisca a face lateral.
  setTrail(steps: readonly TrailStep[], done: boolean): Promise<boolean> {
    let fresh = false;
    return this.trailJob(() => {
      const trail = [...this.profile.trail];
      fresh = done && steps.some((i) => !trail[i]);
      for (const i of steps) trail[i] = done;
      return { trail };
    }).then((ok) => {
      if (ok && fresh) this.trailFlashes += 1;
      return ok;
    });
  }

  // "Consegui no meu cubo" (spec 6.2): marca a etapa e zera o passo guardado da aula, numa gravação. Já marcada, só zera o passo.
  completeLesson(step: TrailStep): Promise<boolean> {
    let fresh = false;
    return this.trailJob(() => {
      const trail = [...this.profile.trail];
      fresh = !trail[step];
      trail[step] = true;
      const lessonAt = { ...this.profile.lessonAt };
      delete lessonAt[step];
      return { trail, lessonAt };
    }).then((ok) => {
      if (ok && fresh) this.trailFlashes += 1;
      return ok;
    });
  }

  // O passo em que a aula parou (sair no meio volta dali).
  setLessonAt(step: TrailStep, part: number): Promise<boolean> {
    return this.trailJob(() => ({ lessonAt: { ...this.profile.lessonAt, [step]: part } }));
  }

  // O algoritmo que a pessoa usa no caso. O padrão (0) não fica guardado.
  setAlgChoice(caseId: string, index: number): Promise<boolean> {
    return this.trailJob(() => {
      const algChoice = { ...this.profile.algChoice };
      if (index === 0) delete algChoice[caseId];
      else algChoice[caseId] = index;
      return { algChoice };
    });
  }

  // Tira o caso do sorteio do treino, ou o devolve.
  setCaseOff(caseId: string, off: boolean): Promise<boolean> {
    return this.trailJob(() => {
      const rest = this.profile.trainOff.filter((id) => id !== caseId);
      return { trainOff: off ? [...rest, caseId] : rest };
    });
  }

  dismissTrailPrompt(): Promise<void> {
    return this.updateMeta({ trailPromptDismissed: true });
  }

  // Grava uma tentativa do treino. Não é solve: não passa pela fila nem pelas contas dos solves. Se não grava, o aviso sai e a resposta
  // é null (o resultado continua na tela de quem chamou).
  async addPractice(r: Omit<Practice, 'id'>): Promise<Practice | null> {
    try {
      const saved = await this.repo.addPractice({ id: newId(this.now()), ...r });
      await this.serial(async () => {
        this.practice = [...this.practice.filter((p) => p.id !== saved.id), saved].sort(byPracticeTime);
      });
      void this.notePracticeForBackup();
      return saved;
    } catch {
      this.showToast(T.data.changeFailed);
      return null;
    }
  }

  // A correção da última tentativa (spec 7.2): troca acerto e erro.
  async setPracticeOk(id: string, ok: boolean): Promise<boolean> {
    return this.write(async () => {
      const updated = await this.repo.updatePractice(id, { ok });
      await this.serial(async () => {
        this.practice = this.practice.map((p) => (p.id === id ? updated : p));
      });
    });
  }

  // A correção da última tentativa: apaga.
  async deletePractice(id: string): Promise<boolean> {
    return this.write(async () => {
      await this.repo.deletePractice(id);
      await this.serial(async () => {
        this.practice = this.practice.filter((p) => p.id !== id);
      });
    });
  }

  // Um dia só de treino também precisa da cópia do dia: a cópia da abertura só sai com o contador acima de zero. A primeira tentativa
  // depois de uma cópia leva o contador a 1; acima disso não mexe, para não adiantar a cópia dos 50 solves. Falha em silêncio: a próxima
  // tentativa tenta de novo.
  private async notePracticeForBackup(): Promise<void> {
    if (!this.meta || this.meta.solvesSinceBackup > 0) return;
    try {
      await this.serial(async () => {
        const meta = await this.repo.getMeta();
        if (meta.solvesSinceBackup > 0) return;
        this.meta = await this.repo.saveMeta({ solvesSinceBackup: 1 });
      });
    } catch {
      // sem aviso: a tentativa está gravada; só a marca da cópia ficou para a próxima
    }
  }

  // Tira o embaralhamento da tela e invalida os pedidos em voo: o que chegar depois não é mais deste evento.
  private clearScramble(): void {
```

O `subscribe` não muda: um aviso `'practice'` de outra aba cai em `refreshKinds(readsOf('practice'))`, que agora lê o treino.

- [ ] **Step 4: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/app-trail.test.ts`
Expected: PASS (14 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/state/app.svelte.ts tests/unit/app-trail.test.ts
git commit -m "feat(app): trilha e treino no estado do app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A piscada azul da face lateral do Centro

Spec: seção 8.4 (decisão 8).

**Files:**
- Modify: `app/src/ui/centro/behavior.ts`
- Modify: `app/src/ui/centro/animator.ts`
- Modify: `app/src/ui/centro.ts` (`paintSide`)
- Test: `app/tests/unit/behavior.test.ts`, `app/tests/unit/animator.test.ts`

**Interfaces:**
- Produces:
  - `Behavior.trigger(kind: 'pb' | 'seasonEnd' | 'trailStep', now: number)` e `CentroAnimator.trigger(kind: 'pb' | 'seasonEnd' | 'trailStep')`
  - `Overlay.sideDim: number` (0 … 1), `REST.sideDim = 0`, `TIMING.sideFlash = 400` (a de cima tem 600)
  - `paintSide(svg: SVGElement, dim: number): void` em `ui/centro.ts`
- Regras: a piscada lateral vale no parado e na reação; segurar de novo, o solve e o estático a cancelam; estático ou movimento reduzido não piscam (o `trigger` já é ignorado sem animação).

- [ ] **Step 1: Escreva os testes que falham**

Em `app/tests/unit/behavior.test.ts`, os dois testes da trilha entram antes do "segurar de novo (outro humor)…". Troque a abertura dele:

```ts
  it('segurar de novo (outro humor) cancela o salto e a piscada da face de cima', () => {
```

por:

```ts
  it('trilha: a face lateral apaga uma vez, em 400 ms (mais curta que a de cima), também no parado', () => {
    const b = createBehavior(seeded(1));
    b.setMood('idle', 0);
    b.trigger('trailStep', 1000);
    expect(b.busy(1100)).toBe(true);
    expect(b.overlay(1100).sideDim).toBeGreaterThan(0);
    expect(b.overlay(1200).sideDim).toBeCloseTo(0.7, 5);
    expect(b.overlay(1200).topDim).toBe(0);
    expect(b.overlay(1400).sideDim).toBe(0);
    expect(TIMING.sideFlash).toBeLessThan(TIMING.flash);
  });

  it('trilha: a reação não cancela a piscada lateral; segurar de novo e o estático cancelam; estático não pisca', () => {
    const b = createBehavior(seeded(1));
    b.setMood('idle', 0);
    b.trigger('trailStep', 0);
    b.setMood('reaction', 50);
    expect(b.overlay(200).sideDim).toBeCloseTo(0.7, 5);
    b.setMood('arming', 250);
    expect(b.overlay(260).sideDim).toBe(0);
    const still = createBehavior(seeded(1));
    still.setMood('idle', 0);
    still.setAnimated(false, 0);
    still.trigger('trailStep', 10);
    expect(still.overlay(210).sideDim).toBe(0);
    expect(still.busy(210)).toBe(false);
  });

  it('segurar de novo (outro humor) cancela o salto e a piscada da face de cima', () => {
```

Em `app/tests/unit/animator.test.ts`, o teste da trilha entra antes do "um SVG refeito recebe o estado atual". Troque a abertura dele:

```ts
  it('um SVG refeito recebe o estado atual', () => {
```

por:

```ts
  it('uma etapa marcada apaga a face lateral e a acende de novo, uma vez; no estático, nada pisca', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'idle' });
    anim.trigger('trailStep');
    clock.advance(200);
    expect(Number(svg.querySelector<SVGGElement>('g.side')?.style.opacity)).toBeLessThan(0.5);
    expect(svg.querySelector<SVGGElement>('g.top')?.style.opacity).toBe('');
    clock.advance(300);
    expect(svg.querySelector<SVGGElement>('g.side')?.style.opacity).toBe('');
    const still = mount();
    const quiet = createCentroAnimator({ svg: () => still, scheduler: clock.sch, behavior: calm(), animated: false });
    quiet.show({ state: 'idle' });
    quiet.trigger('trailStep');
    clock.advance(200);
    expect(still.querySelector<SVGGElement>('g.side')?.style.opacity).toBe('');
  });

  it('um SVG refeito recebe o estado atual', () => {
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/behavior.test.ts tests/unit/animator.test.ts`
Expected: FAIL (3 testes): `expected undefined to be close to 0.7` (ainda não há `sideDim`) e, no animador, `expected '0.394' to be ''` (o `'trailStep'` ainda cai na piscada da face de cima).

- [ ] **Step 3: O comportamento**

Em `app/src/ui/centro/behavior.ts`:

1. O comentário do topo:

```ts
// Os comportamentos do Centro no tempo (spec do sub-projeto 3, seção 6.3): piscar, olhadinha, órbita, respiração, salto do recorde e
// piscada da face de cima.
```

por:

```ts
// Os comportamentos do Centro no tempo (spec do sub-projeto 3, seção 6.3): piscar, olhadinha, órbita, respiração, salto do recorde,
// piscada da face de cima e a piscada azul da face lateral (uma etapa da trilha marcada, spec do sub-projeto 4, seção 8.4).
```

2. `Overlay`:

```ts
  topDim: number; // 0 … 1: quanto a face de cima apaga na piscada do fim de temporada
}
```

por:

```ts
  topDim: number; // 0 … 1: quanto a face de cima apaga na piscada do fim de temporada
  sideDim: number; // 0 … 1: quanto a face lateral apaga na piscada da trilha
}
```

3. `REST`:

```ts
export const REST: Readonly<Overlay> = Object.freeze({ blink: 0, lookX: 0, lift: 0, squash: 1, topDim: 0 });
```

por:

```ts
export const REST: Readonly<Overlay> = Object.freeze({ blink: 0, lookX: 0, lift: 0, squash: 1, topDim: 0, sideDim: 0 });
```

4. `TIMING`:

```ts
  flash: 600,
```

por:

```ts
  flash: 600,
  sideFlash: 400, // a piscada da face lateral: mais curta que a de cima
```

5. `Behavior.trigger`:

```ts
  trigger(kind: 'pb' | 'seasonEnd', now: number): void; // salto do recorde, piscada da face de cima
```

por:

```ts
  trigger(kind: 'pb' | 'seasonEnd' | 'trailStep', now: number): void; // salto do recorde, piscada da face de cima, piscada da face lateral
```

6. O estado:

```ts
  let flashAt: number | null = null;
```

por:

```ts
  let flashAt: number | null = null;
  let sideAt: number | null = null;
```

7. `advance`:

```ts
    if (flashAt !== null && now >= flashAt + TIMING.flash) flashAt = null;
  }
```

por:

```ts
    if (flashAt !== null && now >= flashAt + TIMING.flash) flashAt = null;
    if (sideAt !== null && now >= sideAt + TIMING.sideFlash) sideAt = null;
  }
```

8. `setMood`:

```ts
      if (next !== 'reaction') {
        jumpAt = null;
        flashAt = null;
      }
    },
```

por:

```ts
      if (next !== 'reaction') {
        jumpAt = null;
        flashAt = null;
      }
      // A piscada da face lateral vem do parado (a Trilha) ou da reação: segurar de novo ou o solve a cancelam.
      if (next !== 'reaction' && next !== 'idle') sideAt = null;
    },
```

9. `setAnimated`:

```ts
      if (!on) {
        jumpAt = null;
        flashAt = null;
      }
```

por:

```ts
      if (!on) {
        jumpAt = null;
        flashAt = null;
        sideAt = null;
      }
```

10. `trigger`:

```ts
      if (kind === 'pb') jumpAt = now;
      else flashAt = now;
```

por:

```ts
      if (kind === 'pb') jumpAt = now;
      else if (kind === 'trailStep') sideAt = now;
      else flashAt = now;
```

11. `overlay`:

```ts
      const topDim = flashAt !== null ? 0.7 * Math.sin((Math.PI * (now - flashAt)) / TIMING.flash) : 0;
      return { blink: b, lookX, lift, squash, topDim };
```

por:

```ts
      const topDim = flashAt !== null ? 0.7 * Math.sin((Math.PI * (now - flashAt)) / TIMING.flash) : 0;
      const sideDim = sideAt !== null ? 0.7 * Math.sin((Math.PI * (now - sideAt)) / TIMING.sideFlash) : 0;
      return { blink: b, lookX, lift, squash, topDim, sideDim };
```

12. `busy`:

```ts
      return (blink !== null && now >= blink.at) || jumpAt !== null || flashAt !== null;
```

por:

```ts
      return (blink !== null && now >= blink.at) || jumpAt !== null || flashAt !== null || sideAt !== null;
```

- [ ] **Step 4: A pintura e o animador**

Em `app/src/ui/centro.ts`, o comentário do topo:

```ts
// renderCentro gera o SVG; paintRing, paintFace e paintTop mexem só em atributos de um SVG já renderizado (o animador usa os três;
```

por:

```ts
// renderCentro gera o SVG; paintRing, paintFace, paintTop e paintSide mexem só em atributos de um SVG já renderizado (o animador usa os quatro;
```

e, depois de `paintTop`, a `paintSide`:

```ts
  if (top) top.style.opacity = dim > 0 ? String(Number((1 - dim).toFixed(3))) : '';
}
```

por:

```ts
  if (top) top.style.opacity = dim > 0 ? String(Number((1 - dim).toFixed(3))) : '';
}

// A piscada azul da face lateral quando uma etapa da trilha fica marcada: o mesmo desenho da de cima, na face do lado.
export function paintSide(svg: SVGElement, dim: number): void {
  const side = svg.querySelector<SVGGElement>('g.side');
  if (side) side.style.opacity = dim > 0 ? String(Number((1 - dim).toFixed(3))) : '';
}
```

Em `app/src/ui/centro/animator.ts`, o import:

```ts
import { type CentroView, eyesFor, paintFace, paintRing, paintTop, ringFor } from '../centro';
```

por:

```ts
import { type CentroView, eyesFor, paintFace, paintRing, paintSide, paintTop, ringFor } from '../centro';
```

o contrato:

```ts
  trigger(kind: 'pb' | 'seasonEnd'): void; // salto do recorde, piscada da face de cima
```

por:

```ts
  trigger(kind: 'pb' | 'seasonEnd' | 'trailStep'): void; // salto do recorde, piscada da face de cima, piscada da face lateral
```

e, em `paint`:

```ts
    paintTop(svg, ov.topDim);
```

por:

```ts
    paintTop(svg, ov.topDim);
    paintSide(svg, ov.sideDim);
```

- [ ] **Step 5: Rode os testes e os tipos**

Run: `pnpm exec vitest run tests/unit/behavior.test.ts tests/unit/animator.test.ts tests/unit/centro.test.ts`
Expected: PASS (10 + 10 testes, e os do `centro.test.ts` como estavam).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/ui/centro/behavior.ts src/ui/centro/animator.ts src/ui/centro.ts tests/unit/behavior.test.ts tests/unit/animator.test.ts
git commit -m "feat(app): piscada azul da face lateral do Centro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: A aba Trilha: casca, atalhos, o começo da aba e o resumo no Centro

Spec: seções 8.1, 8.2, 8.3, 8.4 e 9.5 (a aba carrega sob demanda); decisão 9.

**Files:**
- Modify: `app/src/strings.ts` (`T.tabs.trilha`, atalhos 1–5, `T.centro.trailSummary` no lugar das chaves da lista antiga, `T.trilha`)
- Modify: `app/src/ui/App.svelte` (a quinta aba, o ícone e a tela carregada sob demanda)
- Modify: `app/src/ui/timer/input.ts` (tecla 5)
- Modify: `app/src/ui/timer/TimerScreen.svelte` (`TAB_OF` com 5 abas)
- Modify: `app/src/styles/screens.css` (barra de baixo com 5 colunas)
- Modify: `app/src/ui/centro/CentroScreen.svelte` (a lista das etapas sai; entra a linha de resumo)
- Create: `app/src/ui/trilha/TrilhaScreen.svelte`, `app/src/ui/trilha/TrailHome.svelte`, `app/src/ui/trilha/MiniCentro.svelte`
- Modify: `app/tests/unit/timer-input-edge.test.ts`, `app/tests/unit/shortcuts-dialog.test.ts`, `app/tests/unit/app-shell.test.ts`, `app/tests/unit/centro-screen.test.ts`
- Test: `app/tests/unit/trilha-screen.test.ts`

**Interfaces:**
- Consumes: `app.trailView`, `openTrail`, `setTrail`, `dismissTrailPrompt`, `trailPromptShown`, `trailFlashes`, `practice` (Task 7); `CASE_SETS` (Task 2); `setStats`, `firmCount` (Task 4); `createCentroAnimator` com `'trailStep'` (Task 8).
- Produces:
  - `TrilhaScreen.svelte` (props `{ app: AppState }`): `<section class="screen" data-screen="trilha">`, que mostra a vista de `app.trailView` (aqui só o começo; a aula entra na Task 10 e o treino na Task 11)
  - `TrailHome.svelte` (props `{ app }`): `data-trail-progress`, `data-trail-prompt`, `data-next-step`, `data-steps`, botões `data-step={i}` e `data-trail={i}`, `data-training` com `data-train-set={set}`
  - `MiniCentro.svelte` (props `{ app: AppState; view?: CentroView }`): o Centro pequeno, que pisca a face lateral quando `app.trailFlashes` sobe depois da montagem
  - teclas: `ActionName` ganha `'tab5'`; 1 Timer, 2 Evolução, 3 Trilha, 4 Centro, 5 Ajustes

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/trilha-screen.test.ts`:

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import TrilhaScreen from '../../src/ui/trilha/TrilhaScreen.svelte';

// O animador de verdade, com os gatilhos e o modo anotados: a tela não expõe o animador do Centro pequeno.
const spy = vi.hoisted(() => ({ triggers: [] as string[], animated: [] as boolean[] }));
vi.mock('../../src/ui/centro/animator', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/ui/centro/animator')>();
  return {
    ...mod,
    createCentroAnimator: (opts: Parameters<typeof mod.createCentroAnimator>[0]) => {
      const animator = mod.createCentroAnimator(opts);
      return {
        ...animator,
        trigger(kind: Parameters<typeof animator.trigger>[0]): void {
          spy.triggers.push(kind);
          animator.trigger(kind);
        },
        setAnimated(on: boolean): void {
          spy.animated.push(on);
          animator.setAnimated(on);
        },
      };
    },
  };
});

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`tri-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  a.tab = 'trilha';
  return { a, repo };
}

beforeEach(() => {
  spy.triggers = [];
  spy.animated = [];
});

describe('aba Trilha: o começo (spec 8.2)', () => {
  it('mostra o progresso, a próxima etapa e as 9 etapas com o estado de cada uma', async () => {
    const { a } = await app();
    await a.setTrail([0], true);
    render(TrilhaScreen, { app: a });
    expect(await screen.findByText('1 de 9 etapas')).toBeInTheDocument();
    const next = document.querySelector('[data-next-step]') as HTMLElement;
    expect(next).toHaveTextContent('Cantos brancos');
    expect(screen.getByRole('button', { name: 'Começar a aula' })).toBeInTheDocument();
    const states = [...document.querySelectorAll('[data-steps] li em')].map((e) => e.textContent);
    expect(states).toEqual(['feita', 'atual', 'à frente', 'à frente', 'à frente', 'à frente', 'à frente', 'à frente', 'à frente']);
  });

  it('a aula que parou no meio aparece como "Continuar do passo N"; tocar abre a aula', async () => {
    const { a } = await app();
    await a.setLessonAt(0, 2);
    render(TrilhaScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar do passo 3' }));
    expect(a.trailView).toEqual({ kind: 'lesson', step: 0 });
  });

  it('tocar no nome de uma etapa abre a aula dela, feita ou não', async () => {
    const { a } = await app();
    render(TrilhaScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'PLL em 2 passos' }));
    expect(a.trailView).toEqual({ kind: 'lesson', step: 7 });
  });

  it('"já sei" grava a etapa e pisca a face lateral; "desfazer" tira, sem piscar', async () => {
    const { a, repo } = await app();
    render(TrilhaScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Cruz branca: já sei' }));
    await waitFor(async () => expect((await repo.getProfile()).trail[0]).toBe(true));
    await waitFor(() => expect(spy.triggers).toEqual(['trailStep']));
    await fireEvent.click(await screen.findByRole('button', { name: 'Cruz branca: desfazer' }));
    await waitFor(async () => expect((await repo.getProfile()).trail[0]).toBe(false));
    expect(spy.triggers).toEqual(['trailStep']);
  });

  it('no modo estático, o Centro pequeno fica parado (a etapa só acende)', async () => {
    const { a } = await app();
    await a.updateSettings({ centro: 'estatico' });
    render(TrilhaScreen, { app: a });
    await screen.findByText('0 de 9 etapas');
    await waitFor(() => expect(spy.animated.at(-1)).toBe(false));
  });

  it('com as 9 feitas, o cartão da próxima etapa dá lugar ao treino', async () => {
    const { a } = await app();
    await a.setTrail([0, 1, 2, 3, 4, 5, 6, 7, 8], true);
    render(TrilhaScreen, { app: a });
    expect(await screen.findByText('9 de 9 etapas')).toBeInTheDocument();
    expect(document.querySelector('[data-next-step]')).toBeNull();
    const cards = [...document.querySelectorAll('[data-training], [data-steps]')];
    expect(cards[0]).toHaveAttribute('data-training');
  });

  it('o treino mostra os 3 conjuntos com os casos firmes, e tocar abre o conjunto', async () => {
    const { a } = await app();
    render(TrilhaScreen, { app: a });
    expect(await screen.findByRole('button', { name: /OLL em 2 passos\s*0 de 10 firmes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PLL em 2 passos\s*0 de 6 firmes/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /F2L com algoritmos\s*0 de 41 firmes/ }));
    expect(a.trailView).toEqual({ kind: 'set', set: 'f2l' });
  });
});

describe('aba Trilha: para quem já resolve (spec 8.2)', () => {
  it('o aviso abre a lista, marca várias etapas de uma vez, pisca uma vez e some', async () => {
    const { a, repo } = await app();
    render(TrilhaScreen, { app: a });
    expect(await screen.findByText('Já resolve? Marque o que já sabe.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Marcar etapas' }));
    const save = screen.getByRole('button', { name: 'Marcar' });
    expect(save).toBeDisabled();
    for (const name of ['Cruz branca', 'Cantos brancos', 'Segunda camada', 'Cruz amarela', 'Orientar e permutar']) {
      await fireEvent.click(screen.getByRole('checkbox', { name }));
    }
    await fireEvent.click(save);
    await waitFor(async () => expect((await repo.getProfile()).trail).toEqual([true, true, true, true, true, false, false, false, false]));
    await waitFor(() => expect(document.querySelector('[data-trail-prompt]')).toBeNull());
    expect(spy.triggers).toEqual(['trailStep']);
    expect(screen.getByText('5 de 9 etapas')).toBeInTheDocument();
  });

  it('"Agora não" dispensa o aviso neste aparelho (meta), sem marcar nada', async () => {
    const { a, repo } = await app();
    render(TrilhaScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(document.querySelector('[data-trail-prompt]')).toBeNull());
    expect((await repo.getMeta()).trailPromptDismissed).toBe(true);
    expect((await repo.getProfile()).trail.some(Boolean)).toBe(false);
  });

  it('quem já marcou alguma etapa não vê o aviso', async () => {
    const { a } = await app();
    await a.setTrail([3], true);
    render(TrilhaScreen, { app: a });
    await screen.findByText('1 de 9 etapas');
    expect(document.querySelector('[data-trail-prompt]')).toBeNull();
  });
});
```

As cinco abas, os atalhos e o resumo no Centro:

Em `app/tests/unit/timer-input-edge.test.ts`, troque:

```ts
      ['KeyN', 'n'], ['Slash', '?'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'],
    ];
    keys.forEach(([code, k]) => key('keydown', code, k));
    expect(s.actions).toEqual(['plus2', 'dnf', 'note', 'delete', 'undo', 'next', 'shortcuts', 'tab1', 'tab2', 'tab3', 'tab4']);
```

por:

```ts
      ['KeyN', 'n'], ['Slash', '?'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'],
    ];
    keys.forEach(([code, k]) => key('keydown', code, k));
    expect(s.actions).toEqual(['plus2', 'dnf', 'note', 'delete', 'undo', 'next', 'shortcuts', 'tab1', 'tab2', 'tab3', 'tab4', 'tab5']);
```

No mesmo arquivo, os nomes de três testes passam a dizer 1–5:

Troque:

```ts
  it('fora da aba do Timer, letras não atuam, mas 1–4 e ? seguem', () => {
```

por:

```ts
  it('fora da aba do Timer, letras não atuam, mas 1–5 e ? seguem', () => {
```

Troque:

```ts
  it('durante a inspeção, letras não atuam; 1–4 seguem como no protótipo', () => {
```

por:

```ts
  it('durante a inspeção, letras não atuam; 1–5 seguem como no protótipo', () => {
```

Troque:

```ts
  it('digitando num campo de texto, ? e 1–4 também não disparam', () => {
```

por:

```ts
  it('digitando num campo de texto, ? e 1–5 também não disparam', () => {
```

Em `app/tests/unit/shortcuts-dialog.test.ts`, troque:

```ts
    expect(screen.getByText('Trocar de aba')).toBeInTheDocument();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(10);
```

por:

```ts
    expect(screen.getByText('Trocar de aba')).toBeInTheDocument();
    expect(screen.getByText('1–5')).toBeInTheDocument();
    expect(screen.getByText('No treino: marcar acerto')).toBeInTheDocument();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(12);
```

Em `app/tests/unit/app-shell.test.ts`, troque:

```ts
  it('mostra as quatro abas e a tela do Timer', async () => {
    render(App);
    expect(await screen.findByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Evolução', 'Centro', 'Ajustes']) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
```

por:

```ts
  it('mostra as cinco abas, na ordem do atalho, e a tela do Timer', async () => {
    render(App);
    expect(await screen.findByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    const names = [...document.querySelectorAll<HTMLButtonElement>('nav.tabs button')].map((b) => b.textContent?.trim());
    expect(names).toEqual(['Timer', 'Evolução', 'Trilha', 'Centro', 'Ajustes']);
    expect(document.querySelectorAll('nav.tabbar button')).toHaveLength(5);
```

Em `app/tests/unit/app-shell.test.ts`, troque:

```ts
// Brief 9b: prazo do boot (regra 4), toast sem role (regra 9), beforeunload com pendentes (regra 5).
```

por:

```ts
describe('a aba Trilha', () => {
  it('a tecla 3 abre a Trilha (carregada na hora) e a 4 o Centro', async () => {
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', key: '3', bubbles: true }));
    // A aba Trilha carrega sob demanda (spec 9.5): na primeira vez do arquivo, o pedaço dela ainda passa pelo Vite.
    expect(await screen.findByText('0 de 9 etapas', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector('[data-screen="trilha"]')).not.toBeNull();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4', key: '4', bubbles: true }));
    await waitFor(() => expect(document.querySelector('[data-screen="companion"]')).not.toBeNull());
    expect(document.querySelector('[data-screen="trilha"]')).toBeNull();
  });
});

// Brief 9b: prazo do boot (regra 4), toast sem role (regra 9), beforeunload com pendentes (regra 5).
```

Em `app/tests/unit/centro-screen.test.ts`, a marcação sai daqui (os testes dela foram para `trilha-screen.test.ts`). Troque:

```ts
  it('marcar uma etapa da trilha grava no perfil', async () => {
    const { a, repo } = await app();
    render(CentroScreen, { app: a });
    (await screen.findByRole('button', { name: /Cruz branca: já sei/ })).click();
    await new Promise((r) => setTimeout(r, 50));
    expect((await repo.getProfile()).trail[0]).toBe(true);
  });
```

por:

```ts
  it('a trilha aparece só como resumo, que leva à aba Trilha (spec do sub-projeto 4, seção 8.3)', async () => {
    const { a } = await app();
    await a.setTrail([0, 1], true);
    render(CentroScreen, { app: a });
    const summary = await screen.findByRole('button', { name: 'Trilha: 2 de 9 · próxima: Segunda camada' });
    expect(screen.queryByRole('button', { name: /já sei/ })).toBeNull();
    a.trailView = { kind: 'set', set: 'pll2' };
    summary.click();
    expect(a.tab).toBe('trilha');
    expect(a.trailView).toEqual({ kind: 'home' });
  });

  it('com as 9 etapas feitas, o resumo não fala da próxima', async () => {
    const { a } = await app();
    await a.setTrail([0, 1, 2, 3, 4, 5, 6, 7, 8], true);
    render(CentroScreen, { app: a });
    expect(await screen.findByRole('button', { name: 'Trilha: 9 de 9' })).toBeInTheDocument();
  });
```

e apague o teste do "desfazer" (troque por nada):

```ts
  it('"desfazer" tira a etapa marcada e grava o perfil', async () => {
    const { a, repo } = await app();
    render(CentroScreen, { app: a });
    (await screen.findByRole('button', { name: /Cruz branca: já sei/ })).click();
    await new Promise((r) => setTimeout(r, 50));
    (await screen.findByRole('button', { name: /Cruz branca: desfazer/ })).click();
    await new Promise((r) => setTimeout(r, 50));
    expect((await repo.getProfile()).trail[0]).toBe(false);
  });
```

por:

```ts

```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/trilha-screen.test.ts tests/unit/app-shell.test.ts tests/unit/centro-screen.test.ts tests/unit/shortcuts-dialog.test.ts tests/unit/timer-input-edge.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/ui/trilha/TrilhaScreen.svelte"`; as abas `[ 'Timer', 'Evolução', 'Centro', …(1) ]`; `Unable to find role="button" and name "Trilha: 2 de 9 · próxima: Segunda camada"`; `Unable to find an element with the text: 1–5`; a lista de ações sem `'tab5'`.

- [ ] **Step 3: Os textos**

Em `app/src/strings.ts`:

1. Em `T.centro`, as chaves da lista que sai viram a do resumo:

```ts
    sideFace: 'Face lateral · trilha',
    know: 'já sei',
    undo: 'desfazer',
    trailAria: (name: string, marked: boolean) => `${name}: ${marked ? 'desfazer' : 'já sei'}`,
    silentHint
```

por:

```ts
    // A linha que leva à aba Trilha: "Trilha: 3 de 9 · próxima: Segunda camada" (sem a próxima quando as 9 estão feitas).
    trailSummary: (done: number, next: string | null) => `Trilha: ${done} de 9${next ? ` · próxima: ${next}` : ''}`,
    silentHint
```

2. Logo depois do grupo `centro`, o grupo da Trilha:

```ts
    silentHint: 'Modo silencioso — o Centro continua reagindo, mas sem texto.',
  },
```

por:

```ts
    silentHint: 'Modo silencioso — o Centro continua reagindo, mas sem texto.',
  },
  // Aba Trilha (ui/trilha/*, spec do sub-projeto 4): o começo da aba, as aulas e o treino de algoritmos.
  trilha: Object.freeze({
    progress: (done: number) => `${done} de 9 etapas`,
    prompt: 'Já resolve? Marque o que já sabe.',
    promptOpen: 'Marcar etapas',
    promptDismiss: 'Agora não',
    promptPick: 'O que você já sabe',
    promptSave: 'Marcar',
    promptCancel: 'Cancelar',
    next: 'Próxima etapa',
    start: 'Começar a aula',
    resume: (part: number) => `Continuar do passo ${part}`,
    steps: 'As 9 etapas',
    state: Object.freeze({ done: 'feita', current: 'atual', ahead: 'à frente' }),
    know: 'já sei',
    undo: 'desfazer',
    knowAria: (name: string, marked: boolean) => `${name}: ${marked ? 'desfazer' : 'já sei'}`,
    train: 'Treino',
    trainHint: 'Cada caso aparece montado por um embaralhamento curto. O tempo do treino não entra nas suas estatísticas.',
    sets: Object.freeze({ oll2: 'OLL em 2 passos', pll2: 'PLL em 2 passos', f2l: 'F2L com algoritmos' }),
    firm: (n: number, total: number) => `${n} de ${total} firmes`,
  }),
```

3. A aba:

```ts
  tabs: { timer: 'Timer', evolucao: 'Evolução', companion: 'Centro', ajustes: 'Ajustes' },
```

por:

```ts
  tabs: { timer: 'Timer', evolucao: 'Evolução', trilha: 'Trilha', companion: 'Centro', ajustes: 'Ajustes' },
```

4. Os atalhos (as chaves da tabela não podem repetir: ela é um `#each` com chave):

```ts
      ['?', 'Mostrar atalhos'],
      ['1–4', 'Trocar de aba'],
```

por:

```ts
      ['?', 'Mostrar atalhos'],
      ['1–5', 'Trocar de aba'],
      ['← →', 'Na aula: um movimento para trás ou para a frente (espaço toca e pausa)'],
      ['Enter', 'No treino: marcar acerto'],
```

- [ ] **Step 4: A casca**

Em `app/src/ui/App.svelte`:

1. A aba entre Evolução e Centro:

```svelte
  const TABS: readonly { id: Tab; label: string }[] = [
    { id: 'timer', label: T.tabs.timer },
    { id: 'evolucao', label: T.tabs.evolucao },
    { id: 'companion', label: T.tabs.companion },
```

por:

```svelte
  const TABS: readonly { id: Tab; label: string }[] = [
    { id: 'timer', label: T.tabs.timer },
    { id: 'evolucao', label: T.tabs.evolucao },
    { id: 'trilha', label: T.tabs.trilha },
    { id: 'companion', label: T.tabs.companion },
```

2. O carregamento sob demanda:

```svelte
  let app = $state.raw<AppState | null>(null);
```

por:

```svelte
  // A aba Trilha carrega na primeira vez que abre: as aulas ficam fora do código da abertura (spec 9.5). O service worker guarda o pedaço.
  const loadTrilha = () => import('./trilha/TrilhaScreen.svelte');

  let app = $state.raw<AppState | null>(null);
```

3. O ícone (um caminho com degraus):

```svelte
    {:else if id === 'evolucao'}
      <path d="M3 3v18h18" /><path d="m7 14 4-4 4 4 5-6" />
```

por:

```svelte
    {:else if id === 'evolucao'}
      <path d="M3 3v18h18" /><path d="m7 14 4-4 4 4 5-6" />
    {:else if id === 'trilha'}
      <path d="M3 21h5v-5h5v-5h5V6h3" /><circle cx="20" cy="3.5" r="1.5" />
```

4. A tela, montada só com a aba aberta, como as outras que não são o Timer:

```svelte
      {#if app.tab === 'evolucao'}
        <EvolucaoScreen {app} />
      {/if}
```

por:

```svelte
      {#if app.tab === 'evolucao'}
        <EvolucaoScreen {app} />
      {/if}
      {#if app.tab === 'trilha'}
        {#await loadTrilha() then { default: TrilhaScreen }}
          <TrilhaScreen {app} />
        {/await}
      {/if}
```

Em `app/src/ui/timer/input.ts`:

```ts
export type ActionName = 'plus2' | 'dnf' | 'note' | 'delete' | 'undo' | 'next' | 'shortcuts' | 'tab1' | 'tab2' | 'tab3' | 'tab4';
```

por:

```ts
export type ActionName = 'plus2' | 'dnf' | 'note' | 'delete' | 'undo' | 'next' | 'shortcuts' | 'tab1' | 'tab2' | 'tab3' | 'tab4' | 'tab5';
```

e:

```ts
  ['4', 'tab4'],
]);
```

por:

```ts
  ['4', 'tab4'],
  ['5', 'tab5'],
]);
```

Em `app/src/ui/timer/TimerScreen.svelte`:

```svelte
  const TAB_OF: Readonly<Record<'tab1' | 'tab2' | 'tab3' | 'tab4', Tab>> = {
    tab1: 'timer',
    tab2: 'evolucao',
    tab3: 'companion',
    tab4: 'ajustes',
  };
```

por:

```svelte
  const TAB_OF: Readonly<Record<'tab1' | 'tab2' | 'tab3' | 'tab4' | 'tab5', Tab>> = {
    tab1: 'timer',
    tab2: 'evolucao',
    tab3: 'trilha',
    tab4: 'companion',
    tab5: 'ajustes',
  };
```

e, em `onAction`:

```svelte
      case 'tab3':
      case 'tab4':
        app.tab = TAB_OF[name];
```

por:

```svelte
      case 'tab3':
      case 'tab4':
      case 'tab5':
        app.tab = TAB_OF[name];
```

Em `app/src/styles/screens.css`, na `.tabbar` do bloco `@media (max-width: 639px)`:

```css
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
```

por:

```css
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
```

- [ ] **Step 5: O resumo no Centro**

Em `app/src/ui/centro/CentroScreen.svelte`:

1. O comentário do topo:

```svelte
  // A tela do Centro: o cubo com a jornada, os acabamentos, os marcos da temporada atual (face de cima), a trilha (face lateral), o
  // histórico das temporadas e o modo silencioso.
```

por:

```svelte
  // A tela do Centro: o cubo com a jornada, os acabamentos, os marcos da temporada atual (face de cima), o resumo da trilha (face lateral,
  // que leva à aba Trilha), o histórico das temporadas e o modo silencioso.
```

2. A fila da trilha sai (ela agora é do AppState):

```svelte
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  // Escritas da trilha em fila: cada toque lê o perfil depois da gravação anterior, então toques seguidos não se perdem.
  let trailWrites: Promise<void> = Promise.resolve();
```

por:

```svelte
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
```

3. `toggleTrail` sai (troque por nada):

```svelte
  function toggleTrail(i: number): void {
    trailWrites = trailWrites
      .then(() => {
        const trail = [...app.profile.trail];
        trail[i] = !trail[i];
        return app.updateProfile({ trail });
      })
      // updateProfile não rejeita (AppState.write já mostra o aviso). Este catch só evita que uma rejeição inesperada deixe a
      // fila rejeitada, o que faria todos os toques seguintes sumirem sem aviso.
      .catch(() => app.showToast(T.data.saveFailed));
  }
```

por:

```svelte

```

4. O cartão da lista vira a linha de resumo (a face lateral não vira botão: o alvo seria pequeno demais):

```svelte
      <div class="card">
        <div class="label">{T.centro.sideFace}</div>
        <ul class="mlist trail">
          {#each TRAIL as name, i (name)}
            {@const marked = Boolean(app.profile.trail[i])}
            <li class:done={marked} class:next={!marked && i === nextStep}>
              <i></i>{name}
              <button type="button" class="link" data-trail={i} aria-label={T.centro.trailAria(name, marked)} onclick={() => toggleTrail(i)}>
                {marked ? T.centro.undo : T.centro.know}
              </button>
            </li>
          {/each}
        </ul>
      </div>
```

por:

```svelte
      <!-- A trilha mora na aba dela (spec do sub-projeto 4, seção 8.3): aqui fica só o resumo, que leva até lá. -->
      <button type="button" class="card trail-summary" data-trail-summary onclick={() => app.openTrail()}>
        {T.centro.trailSummary(trailDone, nextStep >= 0 ? TRAIL[nextStep] : null)}
      </button>
```

5. O estilo do resumo:

```svelte
<style>
  /* O cartão do Centro empilha o seletor, a dica e a linha do modo silencioso. */
```

por:

```svelte
<style>
  .trail-summary {
    font: inherit;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }

  /* O cartão do Centro empilha o seletor, a dica e a linha do modo silencioso. */
```

`trailDone`, `nextStep` e o import de `TRAIL` continuam: o Centro grande acende a face lateral com `trailDone`, e o resumo usa os três.

- [ ] **Step 6: As telas da Trilha**

O Centro pequeno usa um animador próprio (o `centro-live` é só do Timer) e só pisca pelas marcações feitas com a tela aberta.

Crie `app/src/ui/trilha/MiniCentro.svelte`:

```svelte
<script lang="ts">
  // O Centro pequeno da Trilha (spec do sub-projeto 4, seções 6.1, 7.5 e 8.4): os marcos em cima, as etapas na face lateral, e a piscada
  // azul quando uma etapa nova fica marcada (app.trailFlashes sobe). Segue o ajuste do Centro: estático (ou "oculto", que aqui vale como
  // estático) e o movimento reduzido não piscam; a etapa só acende. A reação (feliz, olho entreaberto) vem de quem usa, por `view`.
  import { tick, untrack } from 'svelte';
  import { T } from '../../strings';
  import { type CentroTheme, type CentroView, renderCentro } from '../centro';
  import { createCentroAnimator } from '../centro/animator';
  import type { AppState } from '../state/app.svelte';

  let { app, view = { state: 'idle' } }: { app: AppState; view?: CentroView } = $props();

  let box = $state<HTMLElement>();
  let darkMq = $state(false);
  let reduceMq = $state(false);

  const topLit = $derived(app.seasonStatus().filter((m) => m.achieved).length);
  const sideLit = $derived(app.profile.trail.filter(Boolean).length);
  const theme = $derived<CentroTheme>(
    app.profile.settings.theme === 'system' ? (darkMq ? 'dark' : 'light') : app.profile.settings.theme === 'dark' ? 'dark' : 'light',
  );
  const svg = $derived(renderCentro({ theme, topLit, sideLit, finish: app.profile.finish, label: T.centro.progressLabel(topLit, sideLit) }));

  const animator = createCentroAnimator({ svg: () => box?.querySelector<SVGElement>('svg.centro') ?? null });
  // Só as piscadas pedidas depois da montagem: abrir a aba não pisca por uma etapa marcada antes.
  let flashesSeen = untrack(() => app.trailFlashes);

  $effect(() => {
    const s = app.profile.settings;
    animator.setAnimated(s.centro === 'animado' && s.reducedMotion !== 'always' && !reduceMq);
  });
  $effect(() => {
    animator.show(view);
  });
  // O SVG é refeito quando as marcas, o tema ou o acabamento mudam: o animador pinta nele o estado atual (a piscada em curso inclusive).
  $effect(() => {
    void svg;
    void tick().then(() => animator.repaint());
  });
  $effect(() => {
    const n = app.trailFlashes;
    if (n <= flashesSeen) return;
    flashesSeen = n;
    animator.trigger('trailStep');
  });
  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = (): void => {
      darkMq = dark.matches;
      reduceMq = reduce.matches;
    };
    sync();
    const all = [dark, reduce];
    all.forEach((mq) => mq.addEventListener('change', sync));
    return () => {
      all.forEach((mq) => mq.removeEventListener('change', sync));
      animator.destroy();
    };
  });
</script>

<div class="mini-centro" data-mini-centro bind:this={box}>{@html svg}</div>

<style>
  .mini-centro {
    width: 64px;
    height: 64px;
    flex-shrink: 0;
  }

  .mini-centro :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
```

Crie `app/src/ui/trilha/TrailHome.svelte`:

```svelte
<script lang="ts">
  // O começo da aba Trilha (spec do sub-projeto 4, seção 8.2): o Centro pequeno com as etapas feitas, o aviso para quem já resolve, a
  // próxima etapa, as 9 etapas (tocar abre a aula; "já sei" e "desfazer" ao lado) e os 3 conjuntos do treino.
  import { CASE_SETS } from '../../core/trail/cases';
  import { firmCount, setStats } from '../../core/trail/train';
  import type { TrailStep } from '../../core/trail/types';
  import { T, TRAIL } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import MiniCentro from './MiniCentro.svelte';

  let { app }: { app: AppState } = $props();

  const done = $derived(app.profile.trail.filter(Boolean).length);
  const nextStep = $derived(app.profile.trail.findIndex((marked) => !marked)); // -1 com as 9 feitas
  const resumeAt = $derived(nextStep >= 0 ? (app.profile.lessonAt[nextStep as TrailStep] ?? 0) : 0);
  let picking = $state(false);
  let picked = $state(TRAIL.map(() => false));

  const open = (step: number): void => app.openTrail({ kind: 'lesson', step: step as TrailStep });
  const toggle = (step: number): Promise<boolean> => app.setTrail([step as TrailStep], !app.profile.trail[step]);

  // Várias etapas de uma vez. O aviso some sozinho: com uma etapa marcada, ele não aparece mais.
  async function markPicked(): Promise<void> {
    const steps = picked.flatMap((on, i) => (on ? [i as TrailStep] : []));
    if (steps.length > 0) await app.setTrail(steps, true);
  }
</script>

{#snippet training()}
  <div class="card" data-training>
    <div class="label">{T.trilha.train}</div>
    <p class="muted hint">{T.trilha.trainHint}</p>
    <ul class="sets">
      {#each CASE_SETS as set (set)}
        {@const stats = setStats(set, app.practice)}
        <li>
          <button type="button" class="btn set" data-train-set={set} onclick={() => app.openTrail({ kind: 'set', set })}>
            <span>{T.trilha.sets[set]}</span>
            <span class="muted">{T.trilha.firm(firmCount(stats), stats.length)}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

<div class="trail-home">
  <header class="trail-top">
    <MiniCentro {app} />
    <div>
      <h2>{T.tabs.trilha}</h2>
      <p class="muted" data-trail-progress>{T.trilha.progress(done)}</p>
    </div>
  </header>

  {#if app.trailPromptShown}
    <div class="card prompt" data-trail-prompt>
      {#if picking}
        <fieldset>
          <legend>{T.trilha.promptPick}</legend>
          {#each TRAIL as name, i (name)}
            <label class="pick"><input type="checkbox" data-pick={i} bind:checked={picked[i]} />{name}</label>
          {/each}
        </fieldset>
        <div class="row">
          <button type="button" class="btn primary" disabled={!picked.some(Boolean)} onclick={markPicked}>{T.trilha.promptSave}</button>
          <button type="button" class="btn" onclick={() => (picking = false)}>{T.trilha.promptCancel}</button>
        </div>
      {:else}
        <p>{T.trilha.prompt}</p>
        <div class="row">
          <button type="button" class="btn primary" onclick={() => (picking = true)}>{T.trilha.promptOpen}</button>
          <button type="button" class="btn" onclick={() => void app.dismissTrailPrompt()}>{T.trilha.promptDismiss}</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if nextStep >= 0}
    <div class="card next" data-next-step>
      <div class="label">{T.trilha.next}</div>
      <h3>{TRAIL[nextStep]}</h3>
      <button type="button" class="btn primary" onclick={() => open(nextStep)}>{resumeAt > 0 ? T.trilha.resume(resumeAt + 1) : T.trilha.start}</button>
    </div>
  {:else}
    {@render training()}
  {/if}

  <div class="card">
    <div class="label">{T.trilha.steps}</div>
    <ul class="mlist trail" data-steps>
      {#each TRAIL as name, i (name)}
        {@const marked = Boolean(app.profile.trail[i])}
        <li class:done={marked} class:next={!marked && i === nextStep}>
          <i></i>
          <button type="button" class="step" data-step={i} onclick={() => open(i)}>{name}</button>
          <em>{marked ? T.trilha.state.done : i === nextStep ? T.trilha.state.current : T.trilha.state.ahead}</em>
          <button type="button" class="link" data-trail={i} aria-label={T.trilha.knowAria(name, marked)} onclick={() => void toggle(i)}>
            {marked ? T.trilha.undo : T.trilha.know}
          </button>
        </li>
      {/each}
    </ul>
  </div>

  {#if nextStep >= 0}
    {@render training()}
  {/if}
</div>

<style>
  .trail-home {
    display: grid;
    gap: 16px;
    max-width: 640px;
  }

  .trail-top {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .trail-top h2 {
    margin: 0;
    font-size: 20px;
  }

  .trail-top p,
  .hint {
    margin: 2px 0 0;
    font-size: 13px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .prompt p,
  .next h3 {
    margin: 6px 0 0;
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
  }

  .step {
    border: 0;
    background: none;
    padding: 4px 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  /* O estado vem antes do "já sei": a margem automática fica no estado, e o botão segue colado nele. */
  .mlist li em + .link {
    margin-left: 0;
  }

  .sets {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .set {
    width: 100%;
    justify-content: space-between;
  }

  @media (pointer: coarse) {
    .step,
    .pick {
      min-height: 44px;
    }
  }
</style>
```

A tela da aba começa só com o começo; as Tasks 10 e 11 acrescentam a aula, o conjunto e a rodada.

Crie `app/src/ui/trilha/TrilhaScreen.svelte`:

```svelte
<script lang="ts">
  // A aba Trilha (spec do sub-projeto 4, seção 8.2): o começo (as 9 etapas, o treino e o aviso para quem já resolve), a aula de uma etapa e
  // o treino de um conjunto. Onde ela está fica em app.trailView: trocar de aba e voltar cai no mesmo lugar.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import TrailHome from './TrailHome.svelte';

  let { app }: { app: AppState } = $props();
</script>

<section class="screen" data-screen="trilha" aria-label={T.tabs.trilha}>
  {#if app.trailView.kind === 'home'}
    <TrailHome {app} />
  {/if}
</section>
```

- [ ] **Step 7: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/trilha-screen.test.ts tests/unit/app-shell.test.ts tests/unit/centro-screen.test.ts tests/unit/shortcuts-dialog.test.ts tests/unit/timer-input-edge.test.ts`
Expected: PASS (10, 12, 12, 3 e 32 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros (nenhum uso sobrando de `T.centro.sideFace`, `know`, `undo` ou `trailAria`).

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/strings.ts src/ui/App.svelte src/ui/timer/input.ts src/ui/timer/TimerScreen.svelte src/styles/screens.css src/ui/centro/CentroScreen.svelte src/ui/trilha/TrilhaScreen.svelte src/ui/trilha/TrailHome.svelte src/ui/trilha/MiniCentro.svelte tests/unit/trilha-screen.test.ts tests/unit/app-shell.test.ts tests/unit/centro-screen.test.ts tests/unit/shortcuts-dialog.test.ts tests/unit/timer-input-edge.test.ts
git commit -m "feat(app): aba Trilha com as etapas, o aviso de quem já resolve e o treino

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: O cubo das aulas e o leitor de aula

Spec: seções 6.1, 6.2, 6.3 e 6.4 (decisões 1, 3 e 4).

**Files:**
- Modify: `app/src/scramble/cubing-loader.ts` (só tipos: `llSVG` opcional e a máscara no `ExperimentalSVGAnimator`)
- Create: `app/src/ui/trilha/cube-view.ts`
- Create: `app/src/ui/trilha/LessonPlayer.svelte`
- Modify: `app/src/strings.ts` (`T.trilha.lesson`)
- Modify: `app/src/ui/trilha/TrilhaScreen.svelte`
- Test: `app/tests/unit/cube-view.test.ts`, `app/tests/unit/lesson-player.test.ts`

**Interfaces:**
- Consumes: `LESSONS` (Task 3); `maskOrbits`, `maskObject` (Task 1); `app.setLessonAt`, `completeLesson`, `openTrail`, `announce` (Task 7); `MiniCentro` (Task 9); `loadCubing` e `CubingModule` do loader.
- Produces (em `ui/trilha/cube-view.ts`):
  - `interface CubeSpec { setup: string; alg: string; view: CubeAngle; mask?: MaskKind }`
  - `interface CubeState { move: number; playing: boolean; atStart: boolean; atEnd: boolean }`
  - `interface CubeView { readonly moving: boolean; show(spec, autoplay): void; play(): void; pause(): void; step(direction: 1 | -1): void; restart(): void; listen(fn): void; destroy(): void }`
  - `mountCube(host: HTMLElement, spec: CubeSpec, o?: { load?; webgl? }): Promise<CubeView | null>` (3D com WebGL; sem ele, a figura 2D com `moving: false`; `null` se o cubing.js não carrega)
  - `drawFigure(host, spec: Pick<CubeSpec, 'setup' | 'view' | 'mask'>, load?): Promise<void>` (a figura 2D; a Task 11 usa)
  - `hasWebGL(): boolean`
- Produces: `LessonPlayer.svelte` (props `{ app: AppState; step: TrailStep }`), com `data-lesson={step}`, `data-cube`, `data-alg` (o movimento atual com a classe `now`), `data-cube-flat` (o aviso da figura 2D), o grupo "Controles do cubo" e os botões Voltar, Próximo, "Consegui no meu cubo" / "Concluir", "Próxima etapa" ou "Treinar os casos".
- Fatos do cubing.js 0.65.1 usados (decisão 4): `new TwistyPlayer({ puzzle, background, controlPanel, viewerLink, hintFacelets })`; os setters `experimentalSetupAlg`, `alg`, `visualization` (`'3D'` ou `'experimental-2D-LL'`), `cameraLatitude` (limitada a ±35° pelo cubing), `cameraLongitude` e `experimentalStickeringMaskOrbits`; `play()`, `pause()`, `jumpToStart()`; um movimento com `controller.animationController.play({ direction: 1 | -1, untilBoundary: 'move' })`; o movimento atual em `experimentalModel.currentMoveInfo` (`patternIndex`) e as pontas em `experimentalModel.coarseTimelineInfo` (`playing`, `atStart`, `atEnd`). O `ExperimentalSVGAnimator(kpuzzle, svg, máscara)` aceita a máscara como objeto, e `puzzles['3x3x3'].llSVG()` dá a camada de cima.

- [ ] **Step 1: Escreva os testes que falham**

O adaptador é testado com um cubing.js de mentira; a tela, com o adaptador simulado (no jsdom não há WebGL nem `/vendor/cubing`).

Crie `app/tests/unit/cube-view.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { maskObject, maskOrbits } from '../../src/core/trail/frame';
import type { CubingModule } from '../../src/scramble/cubing-loader';
import { drawFigure, mountCube } from '../../src/ui/trilha/cube-view';

// Um cubing.js de mentira: o TwistyPlayer guarda o que recebe e conta as chamadas; o animador 2D guarda a máscara e o padrão.
function fakeCubing() {
  const log: string[] = [];
  const listeners = new Map<string, (v: never) => void>();
  const prop = (name: string) => ({
    addFreshListener: (fn: (v: never) => void) => listeners.set(name, fn),
    removeFreshListener: () => listeners.delete(name),
  });
  const player = Object.assign(document.createElement('div'), {
    alg: '',
    experimentalSetupAlg: '',
    experimentalStickeringMaskOrbits: '',
    visualization: '',
    cameraLatitude: 0,
    cameraLongitude: 0,
    play: () => log.push('play'),
    pause: () => log.push('pause'),
    jumpToStart: () => log.push('jumpToStart'),
    controller: { animationController: { play: (o: { direction: number; untilBoundary: string }) => log.push(`step ${o.direction} ${o.untilBoundary}`) } },
    experimentalModel: { currentMoveInfo: prop('move'), coarseTimelineInfo: prop('timeline') },
  });
  const drawn: { svg: string; mask: unknown; pattern: unknown }[] = [];
  let config: Record<string, unknown> = {};
  const module = {
    randomScrambleForEvent: async () => ({ toString: () => '' }),
    TwistyPlayer: function (c: Record<string, unknown>) {
      config = c;
      return player;
    },
    puzzles: {
      '3x3x3': {
        kpuzzle: async () => ({ defaultPattern: () => ({ applyAlg: (alg: string) => `padrão ${alg}` }) }),
        svg: async () => 'planificação',
        llSVG: async () => 'camada de cima',
      },
    },
    ExperimentalSVGAnimator: function (_k: unknown, svg: string, mask?: unknown) {
      const wrapperElement = document.createElement('div');
      wrapperElement.dataset.svg = svg;
      return { wrapperElement, draw: (pattern: unknown) => drawn.push({ svg, mask, pattern }) };
    },
  } as unknown as CubingModule;
  return { module, player, log, listeners, drawn, config: () => config };
}

describe('cubo da aula: o TwistyPlayer atrás da interface (spec 6.1)', () => {
  it('monta o 3D com o setup no quadro das aulas (z2 na frente), a máscara e a câmera de cima', async () => {
    const f = fakeCubing();
    const host = document.createElement('div');
    const view = await mountCube(host, { setup: "R U R'", alg: "R U' R'", view: '3D', mask: 'f2l' }, { load: async () => f.module, webgl: () => true });
    expect(view?.moving).toBe(true);
    expect(host.firstChild).toBe(f.player);
    expect(f.config()).toMatchObject({ puzzle: '3x3x3', controlPanel: 'none', background: 'none', viewerLink: 'none', hintFacelets: 'none' });
    expect(f.player.experimentalSetupAlg).toBe("z2 R U R'");
    expect(f.player.alg).toBe("R U' R'");
    expect(f.player.experimentalStickeringMaskOrbits).toBe(maskOrbits('f2l'));
    expect([f.player.visualization, f.player.cameraLatitude]).toEqual(['3D', 35]);
  });

  it('vista de cima é a camada chapada; vista de baixo é o 3D com a câmera por baixo; sem máscara, tudo normal', async () => {
    const f = fakeCubing();
    const view = (await mountCube(document.createElement('div'), { setup: '', alg: '', view: 'top' }, { load: async () => f.module, webgl: () => true }))!;
    expect(f.player.visualization).toBe('experimental-2D-LL');
    expect(f.player.experimentalStickeringMaskOrbits).toBe('EDGES:------------,CORNERS:--------,CENTERS:------');
    view.show({ setup: '', alg: '', view: 'below', mask: 'cross' }, false);
    expect([f.player.visualization, f.player.cameraLatitude]).toEqual(['3D', -35]);
  });

  it('trocar de passo volta ao começo e só toca sozinho quando pedido e com algoritmo', async () => {
    const f = fakeCubing();
    const view = (await mountCube(document.createElement('div'), { setup: '', alg: '', view: '3D' }, { load: async () => f.module, webgl: () => true }))!;
    f.log.length = 0;
    view.show({ setup: 'F', alg: "F'", view: '3D' }, true);
    expect(f.log).toEqual(['pause', 'jumpToStart', 'play']);
    f.log.length = 0;
    view.show({ setup: 'F', alg: "F'", view: '3D' }, false);
    view.show({ setup: '', alg: '', view: '3D' }, true);
    expect(f.log).not.toContain('play');
  });

  it('um movimento para a frente ou para trás vai pelo controlador de animação, até o fim do movimento', async () => {
    const f = fakeCubing();
    const view = (await mountCube(document.createElement('div'), { setup: '', alg: 'R U', view: '3D' }, { load: async () => f.module, webgl: () => true }))!;
    f.log.length = 0;
    view.step(1);
    view.step(-1);
    expect(f.log).toEqual(['step 1 move', 'step -1 move']);
  });

  it('o ouvinte recebe o movimento atual e as pontas da linha do tempo; desmontar tira o player e os ouvintes', async () => {
    const f = fakeCubing();
    const host = document.createElement('div');
    const view = (await mountCube(host, { setup: '', alg: 'R U', view: '3D' }, { load: async () => f.module, webgl: () => true }))!;
    const seen = vi.fn();
    view.listen(seen);
    (f.listeners.get('move') as (v: { patternIndex: number }) => void)({ patternIndex: 1 });
    (f.listeners.get('timeline') as (v: object) => void)({ playing: true, atStart: false, atEnd: false });
    expect(seen).toHaveBeenLastCalledWith({ move: 1, playing: true, atStart: false, atEnd: false });
    view.destroy();
    expect(host.childElementCount).toBe(0);
    expect(f.listeners.size).toBe(0);
  });

  it('sem WebGL: a figura 2D do estado, com a máscara, e sem movimento', async () => {
    const f = fakeCubing();
    const host = document.createElement('div');
    const view = await mountCube(host, { setup: 'F2', alg: 'F2', view: 'top', mask: 'oll' }, { load: async () => f.module, webgl: () => false });
    expect(view?.moving).toBe(false);
    expect(f.drawn).toEqual([{ svg: 'camada de cima', mask: maskObject('oll'), pattern: 'padrão z2 F2' }]);
    expect((host.firstChild as HTMLElement).dataset.svg).toBe('camada de cima');
  });

  it('o cubing.js que não carrega: null, e a aula segue sem cubo', async () => {
    const view = await mountCube(document.createElement('div'), { setup: '', alg: '', view: '3D' }, { load: () => Promise.reject(new Error('offline')), webgl: () => true });
    expect(view).toBeNull();
  });

  it('a figura do treino: planificação fora da vista de cima', async () => {
    const f = fakeCubing();
    const host = document.createElement('div');
    await drawFigure(host, { setup: "R U R'", view: '3D', mask: 'pair' }, async () => f.module);
    expect(f.drawn).toEqual([{ svg: 'planificação', mask: maskObject('pair'), pattern: "padrão z2 R U R'" }]);
  });
});
```

Crie `app/tests/unit/lesson-player.test.ts`:

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import type { CubeSpec, CubeState } from '../../src/ui/trilha/cube-view';
import TrilhaScreen from '../../src/ui/trilha/TrilhaScreen.svelte';

// O cubo de mentira: a tela fala só com a interface CubeView. `moving` false faz o papel da figura 2D; `fail`, do cubing.js sem carregar.
const cube = vi.hoisted(() => ({
  log: [] as string[],
  specs: [] as unknown[],
  listener: null as null | ((s: CubeState) => void),
  moving: true,
  fail: false,
}));
vi.mock('../../src/ui/trilha/cube-view', () => ({
  mountCube: async (_host: HTMLElement, spec: CubeSpec) => {
    if (cube.fail) return null;
    cube.specs.push(spec);
    cube.log.push('mount');
    return {
      moving: cube.moving,
      show(s: CubeSpec, autoplay: boolean) {
        cube.specs.push(s);
        cube.log.push(autoplay ? 'show+play' : 'show');
      },
      play: () => cube.log.push('play'),
      pause: () => cube.log.push('pause'),
      step: (d: number) => cube.log.push(`step ${d}`),
      restart: () => cube.log.push('restart'),
      listen(fn: (s: CubeState) => void) {
        cube.listener = fn;
        fn({ move: 0, playing: false, atStart: true, atEnd: false });
      },
      destroy: () => cube.log.push('destroy'),
    };
  },
  drawFigure: async () => {},
}));

let n = 0;
async function lesson(step: number, prep?: (a: AppState) => Promise<unknown>) {
  const repo = createRepository(await openKlickDb(`lp-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  await prep?.(a);
  a.openTrail({ kind: 'lesson', step: step as 0 });
  const r = render(TrilhaScreen, { app: a });
  await waitFor(() => expect(cube.log).toContain('mount'));
  return { a, repo, r };
}
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
const key = (k: string, code = k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true }));

beforeEach(() => {
  Object.assign(cube, { log: [], specs: [], listener: null, moving: true, fail: false });
});

describe('aula: andar pelos passos (spec 6.1)', () => {
  it('abre no passo 1 da aula 1, com o nome da etapa, o progresso e o cubo do passo', async () => {
    await lesson(0);
    expect(screen.getByRole('heading', { name: 'Cruz branca' })).toBeInTheDocument();
    expect(screen.getByText('passo 1 de 8')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Segure assim' })).toBeInTheDocument();
    expect(cube.specs[0]).toEqual({ setup: '', alg: '', view: '3D', mask: undefined });
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'Controles do cubo' })).toBeNull(); // passo sem algoritmo
  });

  it('Próximo troca o cubo, toca o algoritmo uma vez e guarda o passo para a retomada', async () => {
    const { repo } = await lesson(0);
    await next();
    expect(screen.getByRole('heading', { name: 'As faces têm letras' })).toBeInTheDocument();
    expect(cube.specs.at(-1)).toEqual({ setup: '', alg: 'R', view: '3D', mask: undefined });
    expect(cube.log.at(-1)).toBe('show+play');
    await waitFor(async () => expect((await repo.getProfile()).lessonAt).toEqual({ 0: 1 }));
    expect(screen.getByRole('group', { name: 'Controles do cubo' })).toBeInTheDocument();
  });

  it('com "reduzir movimento", nada toca sozinho', async () => {
    await lesson(0, (a) => a.updateSettings({ reducedMotion: 'always' }));
    await next();
    expect(cube.log.at(-1)).toBe('show');
    expect(cube.log).not.toContain('play');
  });

  it('com o Centro estático, também não toca sozinho', async () => {
    await lesson(0, (a) => a.updateSettings({ centro: 'estatico' }));
    await next();
    expect(cube.log.at(-1)).toBe('show');
  });

  it('← e → andam um movimento; o espaço toca ou pausa; o movimento atual fica destacado', async () => {
    await lesson(0);
    await next();
    key('ArrowRight');
    key('ArrowLeft');
    key(' ', 'Space');
    expect(cube.log.slice(-3)).toEqual(['step 1', 'step -1', 'play']);
    cube.listener?.({ move: 0, playing: true, atStart: false, atEnd: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument());
    key(' ', 'Space');
    expect(cube.log.at(-1)).toBe('pause');
    await next();
    cube.listener?.({ move: 2, playing: false, atStart: false, atEnd: false });
    await waitFor(() => expect(document.querySelector('[data-alg] .now')?.textContent).toBe("R'"));
  });

  it('volta de onde parou; um passo guardado além do fim cai no último', async () => {
    await lesson(0, (a) => a.setLessonAt(0, 5));
    expect(screen.getByRole('heading', { name: 'Desça as pétalas' })).toBeInTheDocument();
    expect(cube.specs[0]).toMatchObject({ setup: 'F2 R2 B2 L2', alg: 'F2 R2 B2 L2', mask: 'cross' });
    cube.log = [];
    await lesson(1, (a) => a.setLessonAt(1, 40));
    expect(screen.getByText('passo 6 de 6')).toBeInTheDocument();
  });

  it('sair da aula volta à trilha e desmonta o cubo', async () => {
    const { a } = await lesson(0);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Voltar à trilha' })[0]);
    expect(a.trailView).toEqual({ kind: 'home' });
    await waitFor(() => expect(cube.log).toContain('destroy'));
  });
});

describe('aula: concluir (spec 6.2)', () => {
  it('"Consegui no meu cubo" marca a etapa, zera o passo, pisca a face lateral e oferece a próxima etapa', async () => {
    const { a, repo } = await lesson(0, (x) => x.setLessonAt(0, 7));
    await fireEvent.click(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
    await waitFor(async () => expect((await repo.getProfile()).trail[0]).toBe(true));
    expect((await repo.getProfile()).lessonAt).toEqual({});
    expect(a.trailFlashes).toBe(1);
    await fireEvent.click(await screen.findByRole('button', { name: 'Próxima etapa' }));
    expect(a.trailView).toEqual({ kind: 'lesson', step: 1 });
    expect(await screen.findByRole('heading', { name: 'Cantos brancos' })).toBeInTheDocument();
  });

  it('etapa já marcada: o botão é "Concluir", nada é desmarcado e não pisca de novo', async () => {
    const { a, repo } = await lesson(4, async (x) => {
      await x.setTrail([4], true);
      await x.setLessonAt(4, 3);
    });
    const flashes = a.trailFlashes;
    await fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await screen.findByRole('button', { name: 'Próxima etapa' });
    expect((await repo.getProfile()).trail[4]).toBe(true);
    expect(a.trailFlashes).toBe(flashes);
  });

  it('nas etapas 7 a 9, o fim da aula leva a treinar os casos', async () => {
    const { a } = await lesson(6, (x) => x.setLessonAt(6, 4));
    await fireEvent.click(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Treinar os casos' }));
    expect(a.trailView).toEqual({ kind: 'set', set: 'oll2' });
  });

  it('se a etapa não grava, a aula fica no último passo e o aviso sai', async () => {
    const { a, repo } = await lesson(0, (x) => x.setLessonAt(0, 7));
    repo.saveProfile = async () => {
      throw new Error('quota');
    };
    await fireEvent.click(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
    await waitFor(() => expect(a.toast).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Próxima etapa' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Consegui no meu cubo' })).toBeInTheDocument();
  });
});

describe('aula: sem o cubo 3D (spec 6.4)', () => {
  it('figura 2D: o aviso, o algoritmo escrito e nenhum controle de movimento; as setas não fazem nada', async () => {
    cube.moving = false;
    await lesson(0, (x) => x.setLessonAt(0, 1));
    expect(screen.getByText(/O cubo 3D não abriu neste aparelho/)).toBeInTheDocument();
    expect(document.querySelector('[data-alg]')).toHaveTextContent('R');
    expect(screen.queryByRole('group', { name: 'Controles do cubo' })).toBeNull();
    key('ArrowRight');
    expect(cube.log).not.toContain('step 1');
  });

  it('o cubing.js que não carrega: a aula continua até o fim, só com o texto e o algoritmo', async () => {
    cube.fail = true;
    const repo = createRepository(await openKlickDb(`lp-${++n}`), { channel: null });
    const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
    await a.init();
    await a.setLessonAt(0, 6);
    a.openTrail({ kind: 'lesson', step: 0 });
    render(TrilhaScreen, { app: a });
    expect(await screen.findByText(/O cubo 3D não abriu neste aparelho/)).toBeInTheDocument();
    await next();
    await fireEvent.click(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
    await waitFor(async () => expect((await repo.getProfile()).trail[0]).toBe(true));
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/cube-view.test.ts tests/unit/lesson-player.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/ui/trilha/cube-view"` e, no leitor, `expected [] to include 'mount'` (a vista da aula ainda não existe).

- [ ] **Step 3: Os tipos do loader**

Em `app/src/scramble/cubing-loader.ts`:

```ts
// Forma mínima do cubing.js usada pela imagem do embaralhamento. Só este arquivo fala com o módulo de verdade.
```

por:

```ts
// Forma mínima do cubing.js usada pela imagem do embaralhamento e pelo cubo da Trilha (ui/trilha/cube-view.ts). Só este arquivo carrega
// o módulo de verdade.
```

e:

```ts
  puzzles: Record<string, { kpuzzle(): Promise<KPuzzleLike>; svg(): Promise<string> }>;
  ExperimentalSVGAnimator: new (kpuzzle: KPuzzleLike, svg: string) => { wrapperElement: HTMLElement; draw(pattern: unknown): void };
```

por:

```ts
  puzzles: Record<string, { kpuzzle(): Promise<KPuzzleLike>; svg(): Promise<string>; llSVG?(): Promise<string> }>;
  // A máscara (opcional) destaca as peças que importam na figura da Trilha: o objeto de maskObject, em core/trail/frame.ts.
  ExperimentalSVGAnimator: new (kpuzzle: KPuzzleLike, svg: string, mask?: unknown) => { wrapperElement: HTMLElement; draw(pattern: unknown): void };
```

`scripts/cubing-entry.js` não muda: ele já exporta `TwistyPlayer`, `ExperimentalSVGAnimator` e `puzzles`.

- [ ] **Step 4: O adaptador do cubo**

Crie `app/src/ui/trilha/cube-view.ts`:

```ts
// O cubo das aulas e a figura do treino (spec do sub-projeto 4, seções 6.1, 6.4 e 7.2). O TwistyPlayer do cubing.js fica atrás de uma
// interface pequena (CubeView), para as telas serem testadas sem ele. Um por aula: montado ao abrir e desmontado ao sair. Sem WebGL, ou
// com o cubing.js sem carregar o 3D, a aula cai na figura 2D do estado (o ExperimentalSVGAnimator, como a imagem do embaralhamento).
//
// O quadro é o das aulas: amarelo em cima, branco embaixo, verde na frente. O cubing.js parte do branco em cima, então todo setup recebe
// um z2 na frente (core/trail/frame.ts).
import { maskObject, maskOrbits } from '../../core/trail/frame';
import type { CubeAngle, MaskKind } from '../../core/trail/types';
import { type CubingModule, loadCubing } from '../../scramble/cubing-loader';

export interface CubeSpec {
  setup: string;
  alg: string; // '' quando o passo só mostra o estado
  view: CubeAngle;
  mask?: MaskKind;
}

// O que a tela mostra dos controles: o movimento atual (o próximo a tocar; igual ao tamanho do algoritmo no fim), se toca, e as pontas.
export interface CubeState {
  move: number;
  playing: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export interface CubeView {
  readonly moving: boolean; // false: a figura 2D parada (a tela esconde os controles de movimento)
  show(spec: CubeSpec, autoplay: boolean): void; // outro passo: o estado novo, no começo do algoritmo; autoplay toca uma vez
  play(): void;
  pause(): void;
  step(direction: 1 | -1): void; // um movimento para a frente ou para trás
  restart(): void;
  listen(fn: (state: CubeState) => void): void; // um ouvinte só; recebe o estado atual na hora
  destroy(): void;
}

export interface MountOptions {
  load?: () => Promise<CubingModule>;
  webgl?: () => boolean;
}

// O que a aula usa do TwistyPlayer do cubing.js 0.65 (o loader o tipa só como HTMLElement).
interface Prop<V> {
  addFreshListener(fn: (value: V) => void): void;
  removeFreshListener(fn: (value: V) => void): void;
}
interface Player extends HTMLElement {
  alg: string;
  experimentalSetupAlg: string;
  experimentalStickeringMaskOrbits: string;
  visualization: string;
  cameraLatitude: number;
  cameraLongitude: number;
  play(): void;
  pause(): void;
  jumpToStart(): void;
  controller: { animationController: { play(o: { direction: number; untilBoundary: string }): void } };
  experimentalModel: {
    currentMoveInfo: Prop<{ patternIndex: number }>;
    coarseTimelineInfo: Prop<{ playing: boolean; atStart: boolean; atEnd: boolean }>;
  };
}

// Todas as peças normais: o passo sem máscara.
const FULL_MASK = 'EDGES:------------,CORNERS:--------,CENTERS:------';
// O cubing.js limita a latitude da câmera a 35°: 35 vê de cima (o padrão dele), -35 vê de baixo (a cruz branca).
const CAMERA = { above: 35, below: -35, longitude: 30 };
const FORWARDS = 1; // Direction.Forwards do cubing.js
const BACKWARDS = -1; // Direction.Backwards
const ONE_MOVE = 'move'; // BoundaryType.Move

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  } catch {
    return false;
  }
}

// A figura 2D de um estado: a camada de cima chapada na vista 'top', a planificação do cubo nas outras. Lança se o cubing.js falha.
export async function drawFigure(host: HTMLElement, spec: Pick<CubeSpec, 'setup' | 'view' | 'mask'>, load: () => Promise<CubingModule> = loadCubing): Promise<void> {
  const cubing = await load();
  const puzzle = cubing.puzzles['3x3x3'];
  if (!puzzle) throw new Error('cubing.js sem o 3x3x3');
  const kpuzzle = await puzzle.kpuzzle();
  const svg = spec.view === 'top' && puzzle.llSVG ? await puzzle.llSVG() : await puzzle.svg();
  const animator = new cubing.ExperimentalSVGAnimator(kpuzzle, svg, spec.mask ? maskObject(spec.mask) : undefined);
  animator.draw(kpuzzle.defaultPattern().applyAlg(`z2 ${spec.setup}`));
  host.replaceChildren(animator.wrapperElement);
}

function threeD(host: HTMLElement, cubing: CubingModule, first: CubeSpec): CubeView {
  // Sem painel, sem link para o Twizzle e sem adesivos-fantasma: o cubo é só a figura animada; os controles são os da aula.
  const player = new cubing.TwistyPlayer({ puzzle: '3x3x3', background: 'none', controlPanel: 'none', viewerLink: 'none', hintFacelets: 'none' }) as Player;
  let state: CubeState = { move: 0, playing: false, atStart: true, atEnd: false };
  let listener: ((s: CubeState) => void) | null = null;
  const emit = (patch: Partial<CubeState>): void => {
    state = { ...state, ...patch };
    listener?.(state);
  };
  const onMove = (info: { patternIndex: number }): void => emit({ move: info.patternIndex });
  const onTimeline = (info: { playing: boolean; atStart: boolean; atEnd: boolean }): void =>
    emit({ playing: info.playing, atStart: info.atStart, atEnd: info.atEnd });
  const apply = (spec: CubeSpec): void => {
    player.experimentalSetupAlg = `z2 ${spec.setup}`;
    player.alg = spec.alg;
    player.visualization = spec.view === 'top' ? 'experimental-2D-LL' : '3D';
    player.cameraLatitude = spec.view === 'below' ? CAMERA.below : CAMERA.above;
    player.cameraLongitude = CAMERA.longitude;
    player.experimentalStickeringMaskOrbits = spec.mask ? maskOrbits(spec.mask) : FULL_MASK;
    player.jumpToStart();
  };
  apply(first);
  host.replaceChildren(player);
  player.experimentalModel.currentMoveInfo.addFreshListener(onMove);
  player.experimentalModel.coarseTimelineInfo.addFreshListener(onTimeline);
  return {
    moving: true,
    show(spec, autoplay) {
      player.pause();
      apply(spec);
      if (autoplay && spec.alg !== '') player.play();
    },
    play: () => player.play(),
    pause: () => player.pause(),
    step: (direction) => player.controller.animationController.play({ direction: direction === 1 ? FORWARDS : BACKWARDS, untilBoundary: ONE_MOVE }),
    restart() {
      player.pause();
      player.jumpToStart();
    },
    listen(fn) {
      listener = fn;
      fn(state);
    },
    destroy() {
      listener = null;
      player.experimentalModel.currentMoveInfo.removeFreshListener(onMove);
      player.experimentalModel.coarseTimelineInfo.removeFreshListener(onTimeline);
      player.pause();
      player.remove();
    },
  };
}

async function flat(host: HTMLElement, cubing: CubingModule, first: CubeSpec): Promise<CubeView> {
  const load = async (): Promise<CubingModule> => cubing;
  await drawFigure(host, first, load);
  const still = (): void => {};
  return {
    moving: false,
    show(spec) {
      void drawFigure(host, spec, load).catch(still);
    },
    play: still,
    pause: still,
    step: still,
    restart: still,
    listen(fn) {
      fn({ move: 0, playing: false, atStart: true, atEnd: true });
    },
    destroy() {
      host.replaceChildren();
    },
  };
}

// Monta o cubo da aula em `host`. Com WebGL, o 3D; sem ele (ou se o 3D lança), a figura 2D. null: nem o cubing.js carregou; a aula segue
// com o texto e o algoritmo escrito.
export async function mountCube(host: HTMLElement, spec: CubeSpec, o: MountOptions = {}): Promise<CubeView | null> {
  const { load = loadCubing, webgl = hasWebGL } = o;
  let cubing: CubingModule;
  try {
    cubing = await load();
  } catch {
    return null;
  }
  if (webgl()) {
    try {
      return threeD(host, cubing, spec);
    } catch {
      // o 3D não montou: a figura 2D, abaixo
    }
  }
  try {
    return await flat(host, cubing, spec);
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Os textos e o leitor**

Em `app/src/strings.ts`, no fim do grupo `trilha`:

```ts
    firm: (n: number, total: number) => `${n} de ${total} firmes`,
  }),
```

por:

```ts
    firm: (n: number, total: number) => `${n} de ${total} firmes`,
    // O leitor de aula (ui/trilha/LessonPlayer.svelte).
    lesson: Object.freeze({
      exit: 'Voltar à trilha',
      partOf: (i: number, n: number) => `passo ${i} de ${n}`,
      alg: 'Algoritmo',
      tip: 'Dica',
      controls: 'Controles do cubo',
      play: 'Tocar',
      pause: 'Pausar',
      back: 'Movimento anterior',
      forward: 'Próximo movimento',
      restart: 'Recomeçar',
      prev: 'Voltar',
      next: 'Próximo',
      done: 'Consegui no meu cubo',
      finish: 'Concluir',
      nextStep: 'Próxima etapa',
      train: 'Treinar os casos',
      flat: 'O cubo 3D não abriu neste aparelho. A figura mostra o estado, e o algoritmo está escrito abaixo.',
      completed: (name: string) => `${name}: etapa feita.`,
    }),
  }),
```

O leitor. Duas coisas que o teste no jsdom não pega e que custaram caro no ensaio deste plano: o CSS só pode dar tamanho ao `twisty-player` (trocar o `display` dele zera a altura do canvas por dentro e o cubo some), e o algoritmo escrito leva o texto inteiro num `.sr-only` (um `aria-label` num `<p>` é proibido pelo ARIA e o axe reprova).

Crie `app/src/ui/trilha/LessonPlayer.svelte`:

```svelte
<script lang="ts">
  // O leitor de aula (spec do sub-projeto 4, seção 6): o Centro pequeno, o nome da etapa e os pontos do progresso; o cubo animado com as
  // peças que importam em destaque; o algoritmo escrito com o movimento atual; os controles; o texto e a dica; Voltar e Próximo.
  // ← e → andam um movimento e o espaço toca ou pausa (a tela não tem timer). Cada troca de passo guarda onde a aula parou
  // (profile.lessonAt), e a aula volta dali. O último passo conclui: marca a etapa, a face lateral pisca e o Centro fica feliz.
  // "Reduzir movimento" ou o Centro estático: nada toca sozinho, o cubo anda só pelos controles.
  import { untrack } from 'svelte';
  import { LESSONS } from '../../core/trail/lessons';
  import type { TrailStep } from '../../core/trail/types';
  import { T, TRAIL } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { type CubeSpec, type CubeState, type CubeView, mountCube } from './cube-view';
  import MiniCentro from './MiniCentro.svelte';

  let { app, step }: { app: AppState; step: TrailStep } = $props();

  const lesson = untrack(() => LESSONS[step]);
  const last = lesson.parts.length - 1;
  let part = $state(untrack(() => Math.min(Math.max(app.profile.lessonAt[step] ?? 0, 0), last)));
  let completed = $state(false);
  let saving = $state(false);
  let cube = $state.raw<CubeView | null>(null);
  let cubeFailed = $state(false);
  let cubeState = $state<CubeState>({ move: 0, playing: false, atStart: true, atEnd: false });
  let host = $state<HTMLElement>();
  let reduceMq = $state(false);

  const current = $derived(lesson.parts[part]);
  const moves = $derived(current.cube?.alg ? current.cube.alg.split(/\s+/) : []);
  const marked = $derived(Boolean(app.profile.trail[step]));
  const autoplay = (): boolean =>
    app.profile.settings.reducedMotion !== 'always' && !reduceMq && app.profile.settings.centro !== 'estatico';
  const specOf = (i: number): CubeSpec => {
    const c = lesson.parts[i].cube;
    return { setup: c?.setup ?? '', alg: c?.alg ?? '', view: c?.view ?? '3D', mask: c?.mask };
  };

  // O cubo monta uma vez por aula. A tela pode fechar antes de o cubing.js carregar: aí o cubo que chegar é desmontado na hora.
  $effect(() => {
    const el = host;
    if (!el) return;
    let alive = true;
    let mounted: CubeView | null = null;
    void mountCube(el, untrack(() => specOf(part))).then((view) => {
      if (!alive) {
        view?.destroy();
        return;
      }
      mounted = view;
      cube = view;
      cubeFailed = view === null || !view.moving;
      view?.listen((s) => {
        cubeState = s;
      });
      if (view && untrack(() => autoplay() && moves.length > 0)) view.play();
    });
    return () => {
      alive = false;
      mounted?.destroy();
      cube = null;
    };
  });

  // Trocar de passo: o estado novo no cubo (no começo do algoritmo) e o passo guardado para a retomada.
  async function goTo(i: number): Promise<void> {
    if (i < 0 || i > last || i === part) return;
    part = i;
    cube?.show(specOf(i), autoplay());
    await app.setLessonAt(step, i);
  }

  async function complete(): Promise<void> {
    if (saving) return;
    saving = true;
    const ok = await app.completeLesson(step);
    saving = false;
    if (!ok) return; // o aviso já saiu; a etapa fica como estava
    completed = true;
    app.announce(T.trilha.lesson.completed(TRAIL[step]));
  }

  function onKey(e: KeyboardEvent): void {
    if (!cube?.moving || moves.length === 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      cube.step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      cube.step(-1);
    } else if (e.code === 'Space' && !target?.closest('button, a')) {
      // Num botão, o espaço é do botão (tocar, voltar, próximo).
      e.preventDefault();
      if (!e.repeat) togglePlay();
    }
  }

  function togglePlay(): void {
    if (cubeState.playing) cube?.pause();
    else cube?.play();
  }

  $effect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = (): void => {
      reduceMq = reduce.matches;
    };
    sync();
    reduce.addEventListener('change', sync);
    return () => reduce.removeEventListener('change', sync);
  });
</script>

<div class="lesson" data-lesson={step}>
  <header class="lesson-top">
    <MiniCentro {app} view={completed ? { state: 'reaction', result: 'pb' } : { state: 'idle' }} />
    <div class="lesson-name">
      <h2>{TRAIL[step]}</h2>
      <p class="muted" data-part-of>{T.trilha.lesson.partOf(part + 1, lesson.parts.length)}</p>
      <ol class="dots" aria-hidden="true">
        {#each lesson.parts as p, i (p.title)}
          <li class:on={i <= part}></li>
        {/each}
      </ol>
    </div>
    <button type="button" class="link exit" onclick={() => app.openTrail()}>{T.trilha.lesson.exit}</button>
  </header>

  <div class="cube" class:flat={cube !== null && !cube.moving} aria-hidden="true" data-cube bind:this={host}></div>
  {#if cubeFailed}
    <p class="muted note" data-cube-flat>{T.trilha.lesson.flat}</p>
  {/if}

  {#if moves.length > 0}
    <p class="alg" data-alg>
      <span class="sr-only">{T.trilha.lesson.alg}: {current.cube?.alg}</span>
      {#each moves as m, i (i)}
        <span class:now={cube?.moving && i === cubeState.move} aria-hidden="true">{m}</span>
      {/each}
    </p>
    {#if cube?.moving}
      <div class="controls" role="group" aria-label={T.trilha.lesson.controls}>
        <button type="button" class="btn" onclick={togglePlay}>{cubeState.playing ? T.trilha.lesson.pause : T.trilha.lesson.play}</button>
        <button type="button" class="btn" disabled={cubeState.atStart} onclick={() => cube?.step(-1)}>{T.trilha.lesson.back}</button>
        <button type="button" class="btn" disabled={cubeState.atEnd} onclick={() => cube?.step(1)}>{T.trilha.lesson.forward}</button>
        <button type="button" class="btn" onclick={() => cube?.restart()}>{T.trilha.lesson.restart}</button>
      </div>
    {/if}
  {/if}

  <h3>{current.title}</h3>
  <p class="text">{current.text}</p>
  {#if current.tip}
    <p class="tip"><strong>{T.trilha.lesson.tip}:</strong> {current.tip}</p>
  {/if}

  <div class="nav">
    {#if completed}
      {#if lesson.cases}
        <button type="button" class="btn primary" onclick={() => app.openTrail({ kind: 'set', set: lesson.cases! })}>{T.trilha.lesson.train}</button>
      {:else if step < 8}
        <button type="button" class="btn primary" onclick={() => app.openTrail({ kind: 'lesson', step: (step + 1) as TrailStep })}>{T.trilha.lesson.nextStep}</button>
      {/if}
      <button type="button" class="btn" onclick={() => app.openTrail()}>{T.trilha.lesson.exit}</button>
    {:else}
      <button type="button" class="btn" disabled={part === 0} onclick={() => goTo(part - 1)}>{T.trilha.lesson.prev}</button>
      {#if part < last}
        <button type="button" class="btn primary" onclick={() => goTo(part + 1)}>{T.trilha.lesson.next}</button>
      {:else}
        <button type="button" class="btn primary" disabled={saving} onclick={complete}>{marked ? T.trilha.lesson.finish : T.trilha.lesson.done}</button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .lesson {
    display: grid;
    gap: 12px;
    max-width: 640px;
  }

  .lesson-top {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .lesson-name {
    flex: 1;
  }

  .lesson-name h2 {
    margin: 0;
    font-size: 20px;
  }

  .lesson-name p {
    margin: 2px 0 0;
    font-size: 13px;
  }

  .dots {
    display: flex;
    gap: 6px;
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
  }

  .dots li {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--surface-2);
  }

  .dots li.on {
    background: var(--trail);
  }

  .exit {
    align-self: flex-start;
  }

  .cube {
    width: 100%;
    height: 260px;
  }

  .cube.flat {
    height: 200px;
  }

  /* Só o tamanho: o display do twisty-player é dele (trocar por block zera a altura do canvas por dentro). */
  .cube :global(twisty-player) {
    width: 100%;
    height: 100%;
  }

  .cube :global(.svg-wrapper),
  .cube :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .alg {
    margin: 0;
    font-family: var(--mono);
    font-size: 18px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
  }

  .alg .now {
    color: var(--trail);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .controls,
  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  h3 {
    margin: 4px 0 0;
  }

  .text,
  .tip,
  .note {
    margin: 0;
  }

  .tip {
    color: var(--ink-2);
  }
</style>
```

Em `app/src/ui/trilha/TrilhaScreen.svelte`, o import:

```svelte
  import TrailHome from './TrailHome.svelte';
```

por:

```svelte
  import LessonPlayer from './LessonPlayer.svelte';
  import TrailHome from './TrailHome.svelte';
```

e a vista da aula:

```svelte
  {#if app.trailView.kind === 'home'}
    <TrailHome {app} />
  {/if}
```

por:

```svelte
  {#if app.trailView.kind === 'home'}
    <TrailHome {app} />
  {:else if app.trailView.kind === 'lesson'}
    <!-- Uma aula por vez: trocar de etapa desmonta a anterior (e o cubo dela). -->
    {#key app.trailView.step}
      <LessonPlayer {app} step={app.trailView.step} />
    {/key}
  {/if}
```

- [ ] **Step 6: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/cube-view.test.ts tests/unit/lesson-player.test.ts`
Expected: PASS (8 + 13 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Conferência manual das máscaras no navegador (decisão 3)**

O jsdom não tem WebGL: só o navegador mostra se o destaque cai nas peças certas.

1. Rode `pnpm dev` (o script já empacota o cubing.js em `public/vendor/cubing`) e abra o endereço que o Vite mostrar (`http://localhost:5173`) no navegador embutido (o painel Browser do app, por `preview_start` com a `url`) ou no Chrome.
2. No tour, "Pular apresentação" e "Ainda não". A aba Trilha abre na aula 1. Toque "Próximo" 5 vezes até "Desça as pétalas" e depois "Recomeçar" (o cubo volta ao estado do setup, a margarida).
3. A captura de tela do painel não pega o canvas do WebGL (sai em branco). Para ver o 3D, rode no console da página: `const url = await document.querySelector('[data-cube] twisty-player').experimentalScreenshot({ width: 400, height: 300 }); const img = Object.assign(document.createElement('img'), { src: url }); img.style.cssText = 'position:fixed;right:0;bottom:0;z-index:9999;width:400px;height:300px;background:#888'; document.body.append(img);` e capture a tela. Tire a imagem depois.
4. Volte à trilha, abra "OLL em 2 passos", toque "Próximo" 2 vezes até "Sune" e "Recomeçar". A vista de cima é SVG: a captura normal mostra.

Esperado:
- **Desça as pétalas:** amarelo em cima, verde na frente e laranja à direita; em destaque só as quatro arestas brancas em volta do centro amarelo (e os centros); o resto cinza.
- **Sune:** a cruz amarela e o canto da frente-esquerda com o amarelo para cima; os outros três cantos com o amarelo nos lados; as duas primeiras camadas fora da figura.

Os dois caminhos:
- **A, o destaque está nas peças certas** (foi o resultado da conferência feita ao escrever este plano, com o cubing.js 0.65.1): a máscara vale pela identidade da peça, como `frame.ts` faz. Nada muda.
- **B, o destaque cai na camada errada** (na margarida, o topo fica todo cinza e o destaque some embaixo): a versão do cubing.js indexa a máscara pela posição. Em `app/src/core/trail/frame.ts`, troque o corpo de `byPiece` por `return ref.map((_, pos) => look(pos)).join('');` (e o comentário de cima por "A máscara do cubing vale pela POSIÇÃO"); em `tests/unit/trail-frame.test.ts`, troque em `lookAt` o `part.slice(orbit.length + 1)[ref[pos]]` por `part.slice(orbit.length + 1)[pos]`, o literal da cruz por `'EDGES:IIII----IIII,CORNERS:IIIIIIII,CENTERS:------'`, e no teste do objeto troque `REF_EDGES[0]`, `REF_CORNERS[4]` e `REF_EDGES[8]` por `0`, `4` e `8`. Rode `pnpm exec vitest run tests/unit/trail-frame.test.ts`, repita esta conferência (as duas figuras, e também a figura do treino de F2L da Task 11) e faça um commit à parte: `fix(app): máscara do cubo pela posição`.

Se o cubo aparecer em branco também no `experimentalScreenshot`, confira que nenhum CSS troca o `display` do `twisty-player`.

- [ ] **Step 8: Commit**

```bash
git add src/scramble/cubing-loader.ts src/ui/trilha/cube-view.ts src/ui/trilha/LessonPlayer.svelte src/strings.ts src/ui/trilha/TrilhaScreen.svelte tests/unit/cube-view.test.ts tests/unit/lesson-player.test.ts
git commit -m "feat(app): leitor de aula com o cubo animado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: O treino: o conjunto e a rodada

Spec: seções 7.1, 7.2, 7.4, 7.5 e 9.4 (decisões 5 e 8; Review Focus 1 e 2).

**Files:**
- Modify: `app/src/strings.ts` (`T.trilha.set`, `T.trilha.round`)
- Modify: `app/src/ui/timer/TimerScreen.svelte` (os atalhos esperam enquanto o timer do treino roda)
- Create: `app/src/ui/trilha/CaseFigure.svelte`, `app/src/ui/trilha/SetView.svelte`, `app/src/ui/trilha/TrainRound.svelte`
- Modify: `app/src/ui/trilha/TrilhaScreen.svelte`
- Test: `app/tests/unit/train-round.test.ts`

**Interfaces:**
- Consumes: `casesOf`, `choiceOf`, `chosenAlg` (Task 2); `setStats`, `firmCount`, `levelName`, `weakestFirst`, `byCase`, `caseStats`, `nextCase`, `caseScramble` (Task 4); `app.addPractice`, `setPracticeOk`, `deletePractice`, `setCaseOff`, `setAlgChoice`, `trainerRunning`, `timerBusy` (Task 7); `drawFigure` (Task 10); `MiniCentro` (Task 9); do Timer: `createTimer`, `createTouchArm`, `createInputController`, `createTimeLoop`, `paintTime`, `Zones.svelte`, `createSound`.
- Produces:
  - `SetView.svelte` (props `{ app; set: CaseSet }`): `data-set-view`, uma linha `data-case={id}` por caso, do mais fraco ao mais firme; "Começar" (desligado com todos fora, com o aviso `data-none-included`)
  - `TrainRound.svelte` (props `{ app; set: CaseSet; rng?: () => number }`): `data-round`, `data-train-scramble`, `data-case-figure`, `data-time`, `data-marks`, `data-help-alg`, `data-last-attempt`, `data-round-empty`
  - `CaseFigure.svelte` (props `{ setup: string; view: CubeAngle; mask: MaskKind }`)
- Regras da rodada:
  - o espaço arma só na montagem do caso (`phase === 'setup'`), sem inspeção, com o `holdMs` e o modo de toque dos ajustes;
  - parado, Enter marca "Acertei" (fora de um botão focado: num botão, o Enter é dele);
  - a tentativa só sai da tela depois de gravada; se não grava, o aviso de sempre e os botões continuam;
  - a última tentativa se corrige (trocar acerto e erro, apagar) até a próxima rodada começar a correr;
  - o Centro pequeno: olho entreaberto no erro (`result: 'plus2'`), feliz sem salto quando bate o melhor tempo anterior do caso (a primeira tentativa não conta como recorde);
  - enquanto o timer do treino corre, `app.trainerRunning` é true e a tela do Timer (sempre montada, ouvindo o teclado) não troca de aba nem abre os atalhos;
  - o body ganha `data-tstate` e `solving` como no Timer (o CSS do tempo grande e o apagar da casca valem aqui) e volta ao que era ao sair.

- [ ] **Step 1: Escreva os testes que falham**

Crie `app/tests/unit/train-round.test.ts`:

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';
import SetView from '../../src/ui/trilha/SetView.svelte';
import TrainRound from '../../src/ui/trilha/TrainRound.svelte';

// A figura do caso não carrega o cubing.js nos testes.
vi.mock('../../src/ui/trilha/cube-view', () => ({ drawFigure: vi.fn(async () => {}), mountCube: async () => null }));

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`tr-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  a.tab = 'trilha';
  return { a, repo };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (type: 'keydown' | 'keyup', code: string, k: string, target: EventTarget = document.body) => {
  const ev = new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
};
// Uma execução pelo teclado: segura o espaço além do tempo de armar, solta (corre) e para com outra tecla.
async function solve(stop: [string, string] = ['KeyA', 'a']): Promise<void> {
  key('keydown', 'Space', ' ');
  await sleep(320);
  key('keyup', 'Space', ' ');
  await sleep(20);
  key('keydown', stop[0], stop[1]);
}
const round = (a: AppState) => render(TrainRound, { app: a, set: 'oll2', rng: () => 0 });

describe('conjunto do treino (spec 7.1 e 7.4)', () => {
  it('lista do mais fraco ao mais firme, com nível e números; Começar abre a rodada', async () => {
    const { a } = await app();
    for (let i = 0; i < 2; i++) await a.addPractice({ caseId: 'oll2-sune', ms: 3000, ok: true, helped: false, at: 1000 + i });
    await a.addPractice({ caseId: 'oll2-h', ms: 5000, ok: false, helped: false, at: 3000 });
    render(SetView, { app: a, set: 'oll2' });
    const order = [...document.querySelectorAll('[data-case]')].map((li) => li.getAttribute('data-case'));
    expect(order.slice(-2)).toEqual(['oll2-h', 'oll2-sune']); // os novos primeiro; o H (nível 0) antes do Sune (nível 2)
    const sune = document.querySelector('[data-case="oll2-sune"]') as HTMLElement;
    expect(sune).toHaveTextContent('firme');
    expect(sune).toHaveTextContent('2 tentativas · 100% de acerto · média 0:03.00');
    expect(screen.getByText('1 de 10 firmes')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Começar' }));
    expect(a.trailView).toEqual({ kind: 'round', set: 'oll2' });
  });

  it('tirar casos do sorteio grava; com todos fora, o treino não começa', async () => {
    const { a, repo } = await app();
    render(SetView, { app: a, set: 'pll2' });
    for (const name of ['T-perm', 'Y-perm', 'Ua', 'Ub', 'H-perm', 'Z-perm']) {
      await fireEvent.click(screen.getByRole('checkbox', { name: `${name} no sorteio` }));
      await waitFor(() => expect(a.profile.trainOff.length).toBeGreaterThan(0));
    }
    await waitFor(async () => expect((await repo.getProfile()).trainOff).toHaveLength(6));
    expect(screen.getByRole('button', { name: 'Começar' })).toBeDisabled();
    expect(screen.getByText(T.trilha.set.noneIncluded)).toBeInTheDocument();
  });

  it('tocar no caso mostra como reconhecer e deixa trocar o algoritmo', async () => {
    const { a, repo } = await app();
    render(SetView, { app: a, set: 'oll2' });
    await fireEvent.click(screen.getByRole('button', { name: 'H' }));
    expect(screen.getByText(/os amarelos dos cantos olham aos pares/)).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    await fireEvent.click(radios[1]);
    await waitFor(async () => expect((await repo.getProfile()).algChoice).toEqual({ 'oll2-h': 1 }));
  });

  it('se a gravação falha, a caixa e o algoritmo voltam ao que está salvo (spec 9.4)', async () => {
    const { a, repo } = await app();
    render(SetView, { app: a, set: 'oll2' });
    repo.saveProfile = async () => {
      throw new Error('quota');
    };
    const box = screen.getByRole('checkbox', { name: 'Sune no sorteio' }) as HTMLInputElement;
    await fireEvent.click(box);
    await waitFor(() => expect(a.toast?.text).toBe(T.data.changeFailed));
    await waitFor(() => expect(box.checked).toBe(true));
    await fireEvent.click(screen.getByRole('button', { name: 'H' }));
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    await fireEvent.click(radios[1]);
    await waitFor(() => expect(radios[0].checked).toBe(true));
    expect(radios[1].checked).toBe(false);
  });
});

describe('rodada do treino (spec 7.2)', () => {
  it('pelo teclado: monta o caso novo, mede, Enter marca acerto e o próximo caso vem', async () => {
    const { a, repo } = await app();
    round(a);
    expect(screen.getByText("F U R U' R' F'")).toBeInTheDocument(); // o inverso do algoritmo da Linha, sem giro de cima (sorteio 0)
    await solve();
    await screen.findByRole('button', { name: 'Acertei' });
    key('keydown', 'Enter', 'Enter');
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    const [p] = await repo.listPractice();
    expect(p).toMatchObject({ caseId: 'oll2-linha', ok: true, helped: false });
    expect(p.ms).toBeGreaterThanOrEqual(0);
    expect(await screen.findByText("f U R U' R' f'")).toBeInTheDocument(); // o L: o próximo novo, na ordem da aula
    const last = document.querySelector('[data-last-attempt]') as HTMLElement;
    expect(last).toHaveTextContent('Linha');
    expect(last).toHaveTextContent("F R U R' U' F'");
    expect(last).toHaveTextContent('acerto');
    expect(last).toHaveTextContent('média do caso');
  });

  it('"Errei" grava o erro; a ajuda marca a tentativa como com ajuda', async () => {
    const { a, repo } = await app();
    round(a);
    await fireEvent.click(screen.getByRole('button', { name: 'Ver o algoritmo' }));
    expect(document.querySelector('[data-help-alg]')).toHaveTextContent("F R U R' U' F'");
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Errei' }));
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    expect((await repo.listPractice())[0]).toMatchObject({ caseId: 'oll2-linha', ok: false, helped: true });
  });

  it('Enter num botão focado é do botão: "Errei" focado grava só o erro', async () => {
    const { a, repo } = await app();
    round(a);
    await solve();
    const miss = await screen.findByRole('button', { name: 'Errei' });
    miss.focus();
    key('keydown', 'Enter', 'Enter', miss);
    await fireEvent.click(miss); // o clique que o navegador faria com o Enter no botão
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    expect((await repo.listPractice())[0].ok).toBe(false);
  });

  it('corrigir a última: trocar acerto e erro, ou apagar; vale até a próxima rodada começar', async () => {
    const { a, repo } = await app();
    round(a);
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Acertei' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Era erro' }));
    await waitFor(async () => expect((await repo.listPractice())[0].ok).toBe(false));
    await fireEvent.click(await screen.findByRole('button', { name: 'Era acerto' }));
    await waitFor(async () => expect((await repo.listPractice())[0].ok).toBe(true));
    await solve(); // a próxima rodada começou (e terminou): a anterior não se corrige mais
    await screen.findByRole('button', { name: 'Acertei' });
    expect(screen.queryByRole('button', { name: 'Era erro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull();
  });

  it('apagar a última tira do treino e do cartão', async () => {
    const { a, repo } = await app();
    round(a);
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Acertei' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(document.querySelector('[data-last-attempt]')).toBeNull());
    expect(await repo.listPractice()).toEqual([]);
  });

  it('o treino não vira solve: nada em solves, sessões, temporada; o body e o app voltam ao que eram ao sair', async () => {
    const { a, repo } = await app();
    document.body.dataset.tstate = 'idle';
    const season = JSON.stringify(a.seasonStatus());
    const r = round(a);
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Acertei' }));
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    expect(a.solves).toEqual([]);
    expect(await repo.listSolves()).toEqual([]);
    expect(JSON.stringify(a.seasonStatus())).toBe(season);
    key('keydown', 'Space', ' ');
    await sleep(50);
    expect(a.timerBusy).toBe(true);
    r.unmount();
    expect(a.timerBusy).toBe(false);
    expect(a.trainerRunning).toBe(false);
    expect(document.body.dataset.tstate).toBe('idle');
    expect(document.body.classList.contains('solving')).toBe(false);
  });

  it('a tentativa que não grava: o aviso de sempre e o resultado continua para marcar', async () => {
    const { a, repo } = await app();
    repo.addPractice = async () => {
      throw new Error('quota');
    };
    round(a);
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Acertei' }));
    await waitFor(() => expect(a.toast?.text).toBe(T.data.changeFailed));
    expect(screen.getByRole('button', { name: 'Acertei' })).not.toBeDisabled();
    expect(document.querySelector('[data-last-attempt]')).toBeNull();
  });

  it('com todos os casos fora do sorteio, a rodada diz isso e não arma', async () => {
    const { a } = await app();
    for (const id of ['pll2-t', 'pll2-y', 'pll2-ua', 'pll2-ub', 'pll2-h', 'pll2-z']) await a.setCaseOff(id, true);
    render(TrainRound, { app: a, set: 'pll2', rng: () => 0 });
    expect(screen.getByText(T.trilha.round.empty)).toBeInTheDocument();
    key('keydown', 'Space', ' ');
    await sleep(50);
    expect(a.timerBusy).toBe(false);
  });

  it('a tecla que para o treino não troca de aba nem abre os atalhos (a tela do Timer também ouve o teclado)', async () => {
    const { a, repo } = await app();
    render(TimerScreen, { app: a });
    round(a);
    await solve(['Digit1', '1']);
    await screen.findByRole('button', { name: 'Acertei' });
    expect(a.tab).toBe('trilha');
    await fireEvent.click(screen.getByRole('button', { name: 'Acertei' }));
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    await solve(['Slash', '?']);
    await screen.findByRole('button', { name: 'Acertei' });
    expect(a.dialog).toBeNull();
  });
});
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/train-round.test.ts`
Expected: FAIL com `Failed to resolve import "../../src/ui/trilha/SetView.svelte"`.

- [ ] **Step 3: Os textos**

Em `app/src/strings.ts`, no fim do grupo `trilha` (depois de `lesson`):

```ts
      completed: (name: string) => `${name}: etapa feita.`,
    }),
  }),
```

por:

```ts
      completed: (name: string) => `${name}: etapa feita.`,
    }),
    // Um conjunto do treino (ui/trilha/SetView.svelte): os casos do mais fraco ao mais firme, o sorteio e a escolha de algoritmo.
    set: Object.freeze({
      start: 'Começar',
      noneIncluded: 'Inclua ao menos um caso no sorteio para começar.',
      cases: 'Do mais fraco ao mais firme',
      level: Object.freeze({ novo: 'novo', aprendendo: 'aprendendo', firme: 'firme', dominado: 'dominado' }),
      // "4 tentativas · 75% de acerto · média 2.41": sem tentativa, só "nenhuma tentativa"; sem certa sem ajuda, sem a média.
      stats: (attempts: number, okRate: number | null, avg: string | null) =>
        attempts === 0
          ? 'nenhuma tentativa'
          : [`${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}`, okRate === null ? null : `${Math.round(okRate * 100)}% de acerto`, avg ? `média ${avg}` : null]
              .filter((part) => part !== null)
              .join(' · '),
      include: (name: string) => `${name} no sorteio`,
      recog: 'Como reconhecer',
      algs: (name: string) => `Algoritmo de ${name}`,
    }),
    // A rodada do treino (ui/trilha/TrainRound.svelte, spec 7.2).
    round: Object.freeze({
      end: 'Encerrar',
      setup: 'Monte o caso',
      setupHint: 'Do cubo resolvido, com amarelo em cima e verde na frente, faça o embaralhamento e confira pela figura.',
      help: 'Ver o algoritmo',
      helped: 'com ajuda',
      hint: 'espaço armar · qualquer tecla para · Enter acertei',
      ok: 'Acertei',
      miss: 'Errei',
      last: 'Última tentativa',
      outcome: (ok: boolean, helped: boolean) => `${ok ? 'acerto' : 'erro'}${helped ? ' · com ajuda' : ''}`,
      caseAvg: (avg: string | null) => (avg ? `média do caso ${avg}` : 'sem média ainda'),
      fixToOk: 'Era acerto',
      fixToMiss: 'Era erro',
      remove: 'Apagar',
      removed: 'Tentativa apagada.',
      empty: 'Todos os casos deste conjunto estão fora do sorteio.',
    }),
  }),
```

- [ ] **Step 4: Os atalhos da tela do Timer esperam o treino (Review Focus 1)**

Em `app/src/ui/timer/TimerScreen.svelte`:

```svelte
  function onAction(name: ActionName): void {
    switch (name) {
```

por:

```svelte
  function onAction(name: ActionName): void {
    // O timer do treino (aba Trilha) está rodando: a tecla que o para chega aqui também, e não pode trocar de aba nem abrir os atalhos.
    if (app.trainerRunning) return;
    switch (name) {
```

A tela do Timer liga o teclado antes (ela monta na abertura), então o ouvinte dela roda antes do da rodada: na tecla que para o treino, `trainerRunning` ainda é true.

- [ ] **Step 5: A figura, o conjunto e a rodada**

A figura desenha fora da tela e só põe no lugar se o caso ainda é o atual (um desenho atrasado não cobre o do caso seguinte).

Crie `app/src/ui/trilha/CaseFigure.svelte`:

```svelte
<script lang="ts">
  // A figura 2D de um caso do treino (spec 7.2): a camada de cima na OLL e na PLL, o par da frente-direita no F2L, já no estado do
  // embaralhamento. Sem o cubing.js, fica vazia: o embaralhamento escrito continua na tela.
  import type { CubeAngle, MaskKind } from '../../core/trail/types';
  import { drawFigure } from './cube-view';

  let { setup, view, mask }: { setup: string; view: CubeAngle; mask: MaskKind } = $props();

  let host = $state<HTMLElement>();

  $effect(() => {
    // Lidos aqui, de forma síncrona: o que vem depois do await não entra nas dependências do efeito.
    const el = host;
    const spec = { setup, view, mask };
    if (!el) return;
    el.replaceChildren();
    // Desenha fora da tela e só põe no lugar se este caso ainda é o atual: um desenho atrasado não cobre o do caso seguinte.
    let current = true;
    const box = document.createElement('div');
    void drawFigure(box, spec)
      .then(() => {
        if (current) el.replaceChildren(...box.childNodes);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  });
</script>

<div class="case-fig" class:top={view === 'top'} aria-hidden="true" data-case-figure bind:this={host}></div>

<style>
  .case-fig {
    width: 180px;
    height: 135px;
  }

  .case-fig.top {
    width: 140px;
    height: 140px;
  }

  .case-fig :global(.svg-wrapper),
  .case-fig :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
```

No conjunto, quando a gravação falha, a caixa e o algoritmo voltam ao que está salvo (como o modo silencioso do Centro faz): sem isso, o `checked` do DOM ficaria com o toque que não gravou.

Crie `app/src/ui/trilha/SetView.svelte`:

```svelte
<script lang="ts">
  // Um conjunto do treino (spec do sub-projeto 4, seções 7.1 e 7.4): os casos do mais fraco ao mais firme, com nível, tentativas, % de
  // acerto e a média das últimas 5 certas. Cada caso pode sair do sorteio (profile.trainOff); tocar no nome mostra como reconhecer e os
  // algoritmos, e deixa trocar o que a pessoa usa (profile.algChoice). Com todos fora, o treino não começa.
  import { casesOf, choiceOf } from '../../core/trail/cases';
  import { formatMs } from '../../core/stats';
  import { firmCount, levelName, setStats, weakestFirst } from '../../core/trail/train';
  import type { CaseSet, TrainCase } from '../../core/trail/types';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';

  let { app, set }: { app: AppState; set: CaseSet } = $props();

  const cases = $derived(new Map(casesOf(set).map((c) => [c.id, c])));
  const stats = $derived(setStats(set, app.practice));
  const rows = $derived(weakestFirst(stats));
  const included = $derived(stats.filter((s) => !app.profile.trainOff.includes(s.id)).length);
  let open = $state<string | null>(null);

  // Se a gravação falha, a caixa volta ao que está salvo (o aviso já saiu pela casca), como o modo silencioso do Centro.
  async function setIncluded(box: HTMLInputElement, id: string): Promise<void> {
    await app.setCaseOff(id, !box.checked);
    box.checked = !app.profile.trainOff.includes(id);
  }

  async function choose(box: HTMLInputElement, c: TrainCase, i: number): Promise<void> {
    await app.setAlgChoice(c.id, i);
    const saved = choiceOf(c, app.profile.algChoice);
    box.closest('fieldset')?.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((r) => {
      r.checked = Number(r.value) === saved;
    });
  }
</script>

<div class="set-view" data-set-view={set}>
  <header class="set-top">
    <div>
      <h2>{T.trilha.sets[set]}</h2>
      <p class="muted">{T.trilha.firm(firmCount(stats), stats.length)}</p>
    </div>
    <button type="button" class="link" onclick={() => app.openTrail()}>{T.trilha.lesson.exit}</button>
  </header>

  <div class="start">
    <button type="button" class="btn primary" disabled={included === 0} onclick={() => app.openTrail({ kind: 'round', set })}>{T.trilha.set.start}</button>
    {#if included === 0}
      <p class="muted" data-none-included>{T.trilha.set.noneIncluded}</p>
    {/if}
  </div>

  <div class="card">
    <div class="label">{T.trilha.set.cases}</div>
    <ul class="cases">
      {#each rows as s (s.id)}
        {@const c = cases.get(s.id)!}
        {@const off = app.profile.trainOff.includes(c.id)}
        <li data-case={c.id}>
          <div class="case-row">
            <input type="checkbox" checked={!off} aria-label={T.trilha.set.include(c.name)} onchange={(e) => void setIncluded(e.currentTarget, c.id)} />
            <button type="button" class="case-name" aria-expanded={open === c.id} onclick={() => (open = open === c.id ? null : c.id)}>{c.name}</button>
            <span class="chip level">{T.trilha.set.level[levelName(s.level)]}</span>
          </div>
          <p class="muted case-stats">{T.trilha.set.stats(s.attempts, s.okRate, s.avg5 === null ? null : formatMs(s.avg5))}</p>
          {#if open === c.id}
            <div class="case-more">
              <p><strong>{T.trilha.set.recog}:</strong> {c.recog}</p>
              <fieldset>
                <legend class="sr-only">{T.trilha.set.algs(c.name)}</legend>
                {#each c.algs as alg, i (alg)}
                  <label class="alg-choice">
                    <input type="radio" name={`alg-${c.id}`} value={i} checked={choiceOf(c, app.profile.algChoice) === i} onchange={(e) => void choose(e.currentTarget, c, i)} />
                    <span class="mono">{alg}</span>
                  </label>
                {/each}
              </fieldset>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .set-view {
    display: grid;
    gap: 16px;
    max-width: 640px;
  }

  .set-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .set-top h2 {
    margin: 0;
    font-size: 20px;
  }

  .set-top p,
  .start p {
    margin: 4px 0 0;
    font-size: 13px;
  }

  .cases {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  .case-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .case-name {
    border: 0;
    background: none;
    padding: 4px 0;
    font: inherit;
    font-weight: 600;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }

  .level {
    margin-left: auto;
  }

  .case-stats {
    margin: 2px 0 0 28px;
    font-size: 13px;
  }

  .case-more {
    margin: 8px 0 0 28px;
    display: grid;
    gap: 6px;
  }

  .case-more p {
    margin: 0;
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .alg-choice {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mono {
    font-family: var(--mono);
  }

  @media (pointer: coarse) {
    .case-name,
    .alg-choice {
      min-height: 44px;
    }
  }
</style>
```

Crie `app/src/ui/trilha/TrainRound.svelte`:

```svelte
<script lang="ts">
  // A rodada do treino (spec do sub-projeto 4, seção 7.2). Montar: o embaralhamento do caso e a figura. Executar: o timer de sempre
  // (o mesmo espaço e os mesmos dois polegares), sem inspeção. Marcar: "Acertei" (o padrão, por Enter ou toque) e "Errei". O resultado
  // mostra o caso, o algoritmo, o tempo e a média do caso, e o próximo caso vem em seguida. A última tentativa pode ser corrigida até a
  // próxima rodada começar. Nada daqui vira solve: o núcleo do timer é reaproveitado, e a gravação é a do treino (app.addPractice).
  import { untrack } from 'svelte';
  import { chosenAlg } from '../../core/trail/cases';
  import { formatMs } from '../../core/stats';
  import { createTimer, type TimerResult, type TimerState } from '../../core/timer';
  import { createTouchArm } from '../../core/touch';
  import { byCase, caseScramble, caseStats, nextCase } from '../../core/trail/train';
  import type { CaseSet, CubeAngle, MaskKind, TrainCase } from '../../core/trail/types';
  import { T } from '../../strings';
  import type { CentroView } from '../centro';
  import { createSound } from '../sound';
  import type { AppState } from '../state/app.svelte';
  import { createInputController } from '../timer/input';
  import { createTimeLoop, paintTime } from '../timer/TimeDisplay';
  import Zones from '../timer/Zones.svelte';
  import CaseFigure from './CaseFigure.svelte';
  import MiniCentro from './MiniCentro.svelte';

  let { app, set, rng = Math.random }: { app: AppState; set: CaseSet; rng?: () => number } = $props();

  const EDGE_CASES: readonly string[] = ['oll2-linha', 'oll2-l', 'oll2-ponto'];
  // A figura de cada conjunto: a camada de cima na OLL (só as arestas nos 3 casos da cruz) e na PLL; o par da frente-direita no F2L.
  const figureOf = (c: TrainCase): { view: CubeAngle; mask: MaskKind } =>
    c.set === 'f2l' ? { view: '3D', mask: 'pair' } : { view: 'top', mask: c.set === 'pll2' ? 'pll' : EDGE_CASES.includes(c.id) ? 'eoll' : 'oll' };

  interface Last {
    id: string;
    caseId: string;
    name: string;
    alg: string;
    ms: number;
    ok: boolean;
    helped: boolean;
  }

  let current = $state.raw<TrainCase | null>(null);
  let alg = $state('');
  let scramble = $state('');
  let helped = $state(false);
  let phase = $state<'setup' | 'mark' | 'saving'>('setup');
  let resultMs = $state(0);
  let last = $state<Last | null>(null); // a última tentativa gravada; corrigível até a próxima rodada começar
  let canFix = $state(false);
  let centro = $state<CentroView>({ state: 'idle' });
  let screenEl = $state<HTMLElement>();
  let zonesEl = $state<HTMLElement>();
  let timeEl = $state<HTMLElement>();
  let coarseMq = $state(false);
  let destroyed = false;
  const before = typeof document === 'undefined' ? undefined : document.body.dataset.tstate; // o que a tela do Timer tinha no body

  const timer = createTimer({ now: () => performance.now() });
  const sound = createSound();
  const touch = createTouchArm({
    press: (at) => timer.press(at),
    release: (at) => timer.release(at),
    cancel: () => timer.cancel(),
    getState: () => timer.state,
    getInspection: () => false,
  });
  const loop = createTimeLoop(paint);

  const avgOf = (caseId: string): number | null => caseStats(caseId, byCase(app.practice).get(caseId) ?? []).avg5;
  const lastAvg = $derived(last ? avgOf(last.caseId) : null);

  function paint(): boolean {
    if (destroyed) return false;
    timer.tick();
    const s = timer.state;
    const ms = s === 'running' ? timer.elapsed : s === 'done' ? (timer.result?.ms ?? resultMs) : 0;
    if (timeEl) paintTime(timeEl, formatMs(ms));
    return s === 'arming' || s === 'ready' || s === 'running';
  }

  // O próximo caso do sorteio (o mesmo nunca sai duas vezes seguidas), com um embaralhamento novo.
  function nextRound(): void {
    const c = nextCase({ set, practice: app.practice, off: app.profile.trainOff, last: current?.id ?? null, rng });
    current = c;
    alg = c ? chosenAlg(c, app.profile.algChoice) : '';
    scramble = c ? caseScramble(alg, rng) : '';
    helped = false;
    phase = 'setup';
    timer.reset();
    loop.kick();
  }

  // "Ver o algoritmo" antes de começar: a tentativa fica "com ajuda" e não sobe o nível.
  function help(): void {
    if (phase === 'setup' && timer.state === 'idle') helped = true;
  }

  async function mark(ok: boolean): Promise<void> {
    const c = current;
    if (phase !== 'mark' || !c) return;
    phase = 'saving';
    const ms = resultMs;
    const best = caseStats(c.id, byCase(app.practice).get(c.id) ?? []).best;
    const saved = await app.addPractice({ caseId: c.id, ms, ok, helped, at: Date.now() });
    if (destroyed) return;
    if (!saved) {
      phase = 'mark'; // o aviso já saiu; o resultado continua na tela para marcar de novo
      return;
    }
    last = { id: saved.id, caseId: c.id, name: c.name, alg, ms, ok, helped };
    canFix = true;
    // O Centro reage sem texto (spec 7.5): olho entreaberto no erro, feliz (sem salto) quando bate o melhor tempo do caso.
    centro = !ok ? { state: 'reaction', result: 'plus2' } : !helped && best !== null && ms < best ? { state: 'reaction', result: 'pb' } : { state: 'idle' };
    app.announce(`${c.name}: ${T.trilha.round.outcome(ok, helped)}, ${formatMs(ms)}`);
    nextRound();
  }

  async function fix(ok: boolean): Promise<void> {
    if (!last || !canFix) return;
    if (await app.setPracticeOk(last.id, ok)) last = { ...last, ok };
  }

  async function remove(): Promise<void> {
    if (!last || !canFix) return;
    if (await app.deletePractice(last.id)) {
      last = null;
      app.announce(T.trilha.round.removed);
    }
  }

  function onState(next: TimerState): void {
    if (destroyed) return;
    app.timerBusy = next === 'arming' || next === 'ready' || next === 'running';
    app.trainerRunning = next === 'running';
    document.body.dataset.tstate = next;
    document.body.classList.toggle('solving', next === 'running');
    if (next === 'ready') sound.klick();
    if (next === 'arming') centro = { state: 'idle' };
    if (next === 'running') canFix = false; // a próxima rodada começou: a anterior não se corrige mais
    loop.kick();
  }

  function onDone(r: TimerResult): void {
    if (destroyed) return;
    sound.klick();
    resultMs = r.ms;
    phase = 'mark';
    loop.kick();
  }

  // Enter marca "Acertei" depois de parar. Num botão focado, o Enter é do botão (não marca as duas coisas).
  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || phase !== 'mark' || e.repeat) return;
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    void mark(true);
  }

  $effect(() => {
    untrack(() => nextRound());
    const offs = [timer.on('state', onState), timer.on('done', onDone)];
    document.addEventListener('keydown', onKey);
    return () => {
      destroyed = true;
      offs.forEach((off) => off());
      document.removeEventListener('keydown', onKey);
      loop.stop();
      const body = document.body;
      body.classList.remove('solving');
      if (before === undefined) delete body.dataset.tstate;
      else body.dataset.tstate = before;
      app.timerBusy = false;
      app.trainerRunning = false;
    };
  });

  // O timer e o toque seguem os ajustes de sempre, sem inspeção (o caso já foi montado à vista).
  $effect(() => {
    const s = app.profile.settings;
    timer.setOptions({ holdMs: s.holdMs, inspection: false });
    touch.setMode(s.mobileArm);
    sound.setEnabled('klick', s.sound.klick);
  });

  // A entrada do Timer, ligada a esta tela: o espaço arma só na montagem do caso, e qualquer tecla para.
  $effect(() => {
    const screen = screenEl;
    const zones = zonesEl;
    if (!screen || !zones) return;
    const ctl = createInputController(
      {
        timer,
        touch,
        tabIsTimer: () => app.tab === 'trilha' && phase === 'setup' && current !== null,
        dialogOpen: () => document.querySelector('dialog[open]') !== null,
        onAction: () => {}, // os atalhos de letra e de aba são da tela do Timer, que também os ouve
        onWake: () => sound.unlock(),
      },
      { coarse: () => coarseMq, armMode: () => app.profile.settings.mobileArm },
    );
    const detach = ctl.attach(document, window, zones, screen);
    return () => {
      ctl.abandonHold();
      detach();
    };
  });

  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const coarse = matchMedia('(pointer: coarse)');
    const sync = (): void => {
      coarseMq = coarse.matches;
    };
    sync();
    coarse.addEventListener('change', sync);
    return () => coarse.removeEventListener('change', sync);
  });
</script>

<div class="round" data-round={set} bind:this={screenEl}>
  <header class="round-top fade">
    <MiniCentro {app} view={centro} />
    <h2>{T.trilha.sets[set]}</h2>
    <button type="button" class="link" onclick={() => app.openTrail({ kind: 'set', set })}>{T.trilha.round.end}</button>
  </header>

  {#if current}
    <div class="case fade">
      <CaseFigure setup={scramble} {...figureOf(current)} />
      <div>
        <div class="label">{T.trilha.round.setup}</div>
        <p class="scramble" data-train-scramble>{scramble}</p>
        <p class="muted hint">{T.trilha.round.setupHint}</p>
        {#if helped}
          <p class="help-alg"><span class="chip">{T.trilha.round.helped}</span> <span class="mono" data-help-alg>{alg}</span></p>
        {:else if phase === 'setup'}
          <button type="button" class="btn" onclick={help}>{T.trilha.round.help}</button>
        {/if}
      </div>
    </div>

    <div class="time" data-time aria-hidden="true" bind:this={timeEl}></div>

    {#if phase !== 'setup'}
      <div class="marks" data-marks>
        <button type="button" class="btn primary" disabled={phase === 'saving'} onclick={() => mark(true)}>{T.trilha.round.ok}</button>
        <button type="button" class="btn" disabled={phase === 'saving'} onclick={() => mark(false)}>{T.trilha.round.miss}</button>
      </div>
    {:else}
      <p class="muted fade">{T.trilha.round.hint}</p>
    {/if}
  {:else}
    <p data-round-empty>{T.trilha.round.empty}</p>
  {/if}

  {#if last}
    <div class="card last fade" data-last-attempt>
      <div class="label">{T.trilha.round.last}</div>
      <p><strong>{last.name}</strong> · <span class="mono">{last.alg}</span></p>
      <p>{formatMs(last.ms)} · {T.trilha.round.outcome(last.ok, last.helped)} · {T.trilha.round.caseAvg(lastAvg === null ? null : formatMs(lastAvg))}</p>
      {#if canFix}
        <div class="fix">
          <button type="button" class="btn" onclick={() => fix(!last!.ok)}>{last.ok ? T.trilha.round.fixToMiss : T.trilha.round.fixToOk}</button>
          <button type="button" class="btn" onclick={remove}>{T.trilha.round.remove}</button>
        </div>
      {/if}
    </div>
  {/if}

  <Zones bind:el={zonesEl} one={app.profile.settings.mobileArm === 'one'} />
</div>

<style>
  .round {
    display: grid;
    gap: 14px;
    max-width: 640px;
  }

  .round-top {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .round-top h2 {
    flex: 1;
    margin: 0;
    font-size: 20px;
  }

  .case {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }

  .scramble {
    margin: 4px 0 0;
    font-family: var(--mono);
    font-size: 20px;
  }

  .hint,
  .help-alg {
    margin: 6px 0;
    font-size: 13px;
  }

  .mono {
    font-family: var(--mono);
  }

  .marks,
  .fix {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .last p {
    margin: 4px 0 0;
  }

  .fix {
    margin-top: 8px;
  }
</style>
```

Em `app/src/ui/trilha/TrilhaScreen.svelte`, os imports:

```svelte
  import LessonPlayer from './LessonPlayer.svelte';
  import TrailHome from './TrailHome.svelte';
```

por:

```svelte
  import LessonPlayer from './LessonPlayer.svelte';
  import SetView from './SetView.svelte';
  import TrailHome from './TrailHome.svelte';
  import TrainRound from './TrainRound.svelte';
```

e as vistas do treino:

```svelte
      <LessonPlayer {app} step={app.trailView.step} />
    {/key}
  {/if}
```

por:

```svelte
      <LessonPlayer {app} step={app.trailView.step} />
    {/key}
  {:else if app.trailView.kind === 'set'}
    <SetView {app} set={app.trailView.set} />
  {:else}
    {#key app.trailView.set}
      <TrainRound {app} set={app.trailView.set} />
    {/key}
  {/if}
```

- [ ] **Step 6: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/train-round.test.ts`
Expected: PASS (13 testes; uns 7 s, porque cada execução segura o espaço além dos 300 ms de armar).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/strings.ts src/ui/timer/TimerScreen.svelte src/ui/trilha/CaseFigure.svelte src/ui/trilha/SetView.svelte src/ui/trilha/TrainRound.svelte src/ui/trilha/TrilhaScreen.svelte tests/unit/train-round.test.ts
git commit -m "feat(app): treino de algoritmos com timer, marcação e correção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: O tour pergunta "Já resolve o cubo?"

Spec: seção 8.5 (decisão D8 da spec e A9 deste plano).

**Files:**
- Modify: `app/src/strings.ts` (`T.onboarding`)
- Modify: `app/src/ui/dialogs/OnboardingDialog.svelte`
- Modify: `app/tests/unit/onboarding-tour.test.ts`, `app/tests/unit/dialogs.test.ts`, `app/tests/unit/app-dialogs.test.ts`

**Interfaces:**
- Consumes: `app.openTrail` (Task 7); o leitor de aula na aba Trilha (Task 10).
- Produces: o tour passa a ter 4 passos ("1 de 4" … "4 de 4"). O passo 3 ("Seu primeiro marco") ganha Voltar e Continuar; o passo 4 é a pergunta, com "Ainda não" (o principal, com o foco) e, abaixo de "Já resolvo", as opções de sempre ("Importar do csTimer", "Importar da versão anterior" quando há, "Começar do zero"). "Pular apresentação" leva à pergunta. Os nomes "Pular apresentação" e "Começar do zero" não mudam: o `fresh()` dos testes ponta a ponta continua valendo.

- [ ] **Step 1: Escreva os testes que falham**

Em `app/tests/unit/onboarding-tour.test.ts`:

1. O pular vai à pergunta. Troque:

```ts
  it('Pular apresentação no passo 1 vai direto ao último passo', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true });
    expect(await screen.findByRole('heading', { name: 'Esse é o Centro' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }));
    expect(await screen.findByRole('button', { name: 'Começar do zero' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    expect(screen.getByText('3 de 3')).toBeInTheDocument();
  });
```

por:

```ts
  it('Pular apresentação no passo 1 vai direto ao último passo: a pergunta, com as opções de quem já resolve', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true });
    expect(await screen.findByRole('heading', { name: 'Esse é o Centro' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }));
    expect(await screen.findByRole('heading', { name: 'Já resolve o cubo?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ainda não' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar do zero' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
  });
```

2. Os dois testes do passo 3 chegam a ele por Continuar (o pular agora passa direto). Troque:

```ts
  it('o passo 3 diz para parar com um toque, não com uma tecla', async () => {
    const restore = mockMedia(['(pointer: coarse)']);
    try {
      const { a } = await app();
      render(OnboardingDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
```

por:

```ts
  it('o passo 3 diz para parar com um toque, não com uma tecla', async () => {
    const restore = mockMedia(['(pointer: coarse)']);
    try {
      const { a } = await app();
      render(OnboardingDialog, { app: a, open: true, skipPractice: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
      await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
```

e:

```ts
  it('com teclado, os passos continuam falando de espaço e de tecla', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
```

por:

```ts
  it('com teclado, os passos continuam falando de espaço e de tecla', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
```

3. Acrescente ao fim do arquivo:

```ts

describe('a pergunta da trilha (spec do sub-projeto 4, seção 8.5)', () => {
  it('do passo 3, Continuar leva à pergunta; Voltar volta ao passo 2', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Seu primeiro marco' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Começar do zero' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Já resolve o cubo?' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ainda não' }));
  });

  it('"Ainda não" fecha o tour e abre a aba Trilha direto na aula 1', async () => {
    const { a, repo } = await app();
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Ainda não' }));
    expect(a.tab).toBe('trilha');
    expect(a.trailView).toEqual({ kind: 'lesson', step: 0 });
    expect(a.dialog).toBeNull();
    await vi.waitFor(async () => expect((await repo.getProfile()).onboarded).toBe(true), { timeout: 3000 });
  });

  it('"Já resolvo" segue como antes: Começar do zero fecha no Timer, e a Trilha vai mostrar o aviso de marcar o que já sabe', async () => {
    const { a } = await app();
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    expect(screen.getByText('Já resolvo')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    expect(a.tab).toBe('timer');
    expect(a.dialog).toBeNull();
    expect(a.trailPromptShown).toBe(true);
  });
});
```

Em `app/tests/unit/dialogs.test.ts`, o teste "primeira vez: o fim oferece importar ou começar do zero" anda um passo a mais até o fim:

```ts
    for (let i = 0; i < 2; i++) {
      const next = screen.queryByRole('button', { name: 'Continuar' });
```

por:

```ts
    for (let i = 0; i < 3; i++) {
      const next = screen.queryByRole('button', { name: 'Continuar' });
```

Em `app/tests/unit/app-dialogs.test.ts`, o cubo simulado:

```ts
vi.mock('../../src/ui/state/boot', () => ({
  boot: async () => (hooks.boot ? hooks.boot() : new Promise<never>(() => {})),
}));
```

por:

```ts
vi.mock('../../src/ui/state/boot', () => ({
  boot: async () => (hooks.boot ? hooks.boot() : new Promise<never>(() => {})),
}));
// O cubo da aula não carrega o cubing.js nos testes: a aula aparece com o texto e o algoritmo escrito.
vi.mock('../../src/ui/trilha/cube-view', () => ({ mountCube: async () => null, drawFigure: async () => {} }));
```

e o teste da casca inteira, antes do "com o perfil já marcado…":

```ts
  it('com o perfil já marcado, o tour não abre (controle: o perfil foi lido como visto)', async () => {
```

por:

```ts
  it('na primeira vez, "Ainda não" fecha o tour e mostra a aula 1 na aba Trilha', async () => {
    const { a } = await makeApp({ onboarded: false });
    hooks.boot = async () => a;
    render(App);
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Ainda não' }));
    // A aba Trilha carrega sob demanda (spec 9.5): na primeira vez do arquivo, o pedaço dela ainda passa pelo Vite.
    expect(await screen.findByRole('heading', { name: 'Segure assim' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cruz branca' })).toBeInTheDocument();
    expect(document.querySelector('nav.tabs [data-tab="trilha"]')).toHaveAttribute('aria-current', 'page');
  });

  it('com o perfil já marcado, o tour não abre (controle: o perfil foi lido como visto)', async () => {
```

- [ ] **Step 2: Rode os testes e confira que falham**

Run: `pnpm exec vitest run tests/unit/onboarding-tour.test.ts tests/unit/dialogs.test.ts tests/unit/app-dialogs.test.ts`
Expected: FAIL: `Unable to find role="heading" and name "Já resolve o cubo?"`, `Unable to find role="button" and name "Ainda não"` e `Unable to find an element with the text: Já resolvo`.

- [ ] **Step 3: Os textos**

Em `app/src/strings.ts`, no grupo `onboarding`:

1. O cabeçalho e a contagem:

```ts
  // Primeira vez (ui/dialogs/OnboardingDialog.svelte): o tour do protótipo em três passos, e as opções do fim. Não há dados de exemplo.
  onboarding: Object.freeze({
    title: 'Apresentação do Klick',
    stepOf: (n: number): string => `${n} de 3`,
```

por:

```ts
  // Primeira vez (ui/dialogs/OnboardingDialog.svelte): o tour do protótipo em três passos, a pergunta da trilha e as opções do fim. Não há
  // dados de exemplo.
  onboarding: Object.freeze({
    title: 'Apresentação do Klick',
    stepOf: (n: number): string => `${n} de 4`,
```

2. O quarto passo:

```ts
        touchText: 'Pare com um toque na tela. O primeiro solve já acende um adesivo dourado em cima do Centro.',
      },
    ] as const),
```

por:

```ts
        touchText: 'Pare com um toque na tela. O primeiro solve já acende um adesivo dourado em cima do Centro.',
      },
      {
        title: 'Já resolve o cubo?',
        text: 'Se ainda não, a trilha ensina do zero, com o cubo na mão: são 9 etapas, da cruz branca ao CFOP.',
      },
    ] as const),
```

3. As duas respostas:

```ts
    end: 'Você pode trazer solves de outro lugar ou começar do zero.',
```

por:

```ts
    notYet: 'Ainda não',
    already: 'Já resolvo',
    end: 'Você pode trazer solves de outro lugar ou começar do zero.',
```

- [ ] **Step 4: O diálogo**

Em `app/src/ui/dialogs/OnboardingDialog.svelte`:

1. O comentário do topo:

```svelte
  // A primeira vez: o tour do protótipo, em três passos. No passo 2 a pessoa segura (espaço ou o botão) até o anel ficar verde e solta;
  // Continuar só libera depois disso (skipPractice libera de cara, para os testes). Pular apresentação vai ao último passo, que oferece
  // importar (do csTimer ou da versão anterior) ou começar do zero. Não há dados de exemplo. Fechar por qualquer caminho grava que a
  // primeira vez já passou (profile.onboarded), e o tour não volta sozinho.
```

por:

```svelte
  // A primeira vez: o tour do protótipo, em três passos, e a pergunta "Já resolve o cubo?" (spec do sub-projeto 4, seção 8.5). No passo 2
  // a pessoa segura (espaço ou o botão) até o anel ficar verde e solta; Continuar só libera depois disso (skipPractice libera de cara,
  // para os testes). Pular apresentação vai à pergunta. "Ainda não" fecha o tour e abre a aba Trilha na aula 1; quem já resolve segue
  // como antes: importar (do csTimer ou da versão anterior) ou começar do zero. Não há dados de exemplo. Fechar por qualquer caminho grava
  // que a primeira vez já passou (profile.onboarded), e o tour não volta sozinho.
```

2. O Centro do quarto passo (a face lateral com uma etapa acesa):

```svelte
  // O Centro de cada passo, como no protótipo: o anel e os olhos do passo, e os marcos acesos no último.
  const STEP_CENTRO: readonly { ring: Ring; eyes: Eyes; topLit: number }[] = [
    { ring: [null, null, 'idle', null, null, null, null, null], eyes: 'open', topLit: 0 },
    { ring: Array<null>(8).fill(null), eyes: 'open', topLit: 0 },
    { ring: ['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F'], eyes: 'happy', topLit: 1 },
  ];
```

por:

```svelte
  // O Centro de cada passo, como no protótipo: o anel e os olhos do passo, o marco aceso no terceiro e a primeira etapa da trilha na
  // pergunta.
  const STEP_CENTRO: readonly { ring: Ring; eyes: Eyes; topLit: number; sideLit: number }[] = [
    { ring: [null, null, 'idle', null, null, null, null, null], eyes: 'open', topLit: 0, sideLit: 0 },
    { ring: Array<null>(8).fill(null), eyes: 'open', topLit: 0, sideLit: 0 },
    { ring: ['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F'], eyes: 'happy', topLit: 1, sideLit: 0 },
    { ring: Array<null>(8).fill(null), eyes: 'open', topLit: 0, sideLit: 1 },
  ];
```

3. A resposta "Ainda não":

```svelte
  // A importação da versão anterior mostra o resumo na seção Ajustes, então a tela vai para lá.
```

por:

```svelte
  // "Ainda não": a aba Trilha abre direto na aula 1, e o tour fecha.
  function notYet(): void {
    app.openTrail({ kind: 'lesson', step: 0 });
    close();
  }

  // A importação da versão anterior mostra o resumo na seção Ajustes, então a tela vai para lá.
```

4. Os botões de cada passo:

```svelte
      {#if step === 3}
        <p>{T.onboarding.end}</p>
      {/if}
      <div class="actions">
        {#if step === 1}
          <button type="button" class="btn" onclick={() => goTo(3)}>{T.onboarding.skip}</button>
          <button type="button" class="btn primary" onclick={() => goTo(2)}>{T.onboarding.next}</button>
        {:else if step === 2}
          <button type="button" class="btn" onclick={() => goTo(1)}>{T.onboarding.back}</button>
          <button type="button" class="btn" onclick={() => goTo(3)}>{T.onboarding.skip}</button>
          <button type="button" class="btn primary" disabled={!practiced && !skipPractice} onclick={() => goTo(3)}>{T.onboarding.next}</button>
        {:else}
          <button type="button" class="btn" onclick={importCsTimer}>{T.onboarding.importCsTimer}</button>
          {#if app.v1Available}
            <button type="button" class="btn" onclick={importV1}>{T.onboarding.importV1}</button>
          {/if}
          <button type="button" class="btn primary" onclick={close}>{T.onboarding.fresh}</button>
        {/if}
      </div>
```

por:

```svelte
      {#if step === 4}
        <div class="actions">
          <button type="button" class="btn primary" onclick={notYet}>{T.onboarding.notYet}</button>
        </div>
        <p class="already"><strong>{T.onboarding.already}</strong> · {T.onboarding.end}</p>
      {/if}
      <div class="actions">
        {#if step === 1}
          <button type="button" class="btn" onclick={() => goTo(4)}>{T.onboarding.skip}</button>
          <button type="button" class="btn primary" onclick={() => goTo(2)}>{T.onboarding.next}</button>
        {:else if step === 2}
          <button type="button" class="btn" onclick={() => goTo(1)}>{T.onboarding.back}</button>
          <button type="button" class="btn" onclick={() => goTo(4)}>{T.onboarding.skip}</button>
          <button type="button" class="btn primary" disabled={!practiced && !skipPractice} onclick={() => goTo(3)}>{T.onboarding.next}</button>
        {:else if step === 3}
          <button type="button" class="btn" onclick={() => goTo(2)}>{T.onboarding.back}</button>
          <button type="button" class="btn primary" onclick={() => goTo(4)}>{T.onboarding.next}</button>
        {:else}
          <button type="button" class="btn" onclick={importCsTimer}>{T.onboarding.importCsTimer}</button>
          {#if app.v1Available}
            <button type="button" class="btn" onclick={importV1}>{T.onboarding.importV1}</button>
          {/if}
          <button type="button" class="btn" onclick={close}>{T.onboarding.fresh}</button>
        {/if}
      </div>
```

O `focusStep` não muda: no passo 4, o primeiro `.actions .primary` é "Ainda não". O `isHoldKey` segue preso ao passo 2.

- [ ] **Step 5: Rode os testes, os tipos e a suíte**

Run: `pnpm exec vitest run tests/unit/onboarding-tour.test.ts tests/unit/dialogs.test.ts tests/unit/app-dialogs.test.ts`
Expected: PASS (17, 4 e 10 testes).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/strings.ts src/ui/dialogs/OnboardingDialog.svelte tests/unit/onboarding-tour.test.ts tests/unit/dialogs.test.ts tests/unit/app-dialogs.test.ts
git commit -m "feat(app): o tour pergunta se a pessoa já resolve o cubo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ponta a ponta, pré-cache do cubo e a spec em dia

Spec: seções 9.5, 10 e 12; e as decisões deste plano, que a spec passa a registrar.

**Files:**
- Create: `app/tests/e2e/trilha.spec.ts`
- Modify: `app/tests/e2e/a11y.spec.ts` (a quinta aba)
- Create: `app/tests/unit/pwa-cache.test.ts`
- Modify: `docs/superpowers/specs/2026-10-14-klick-trilha-design.md`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 12, pela interface (nomes acessíveis, `data-*`).
- Produces: nada de código do app. Os ponta a ponta conferem o que as tarefas anteriores fizeram e passam de primeira; se algum falhar, a falha é de uma tarefa anterior, e é lá que se conserta.

- [ ] **Step 1: O pré-cache do cubo**

O 3D do TwistyPlayer vem dos arquivos de `public/vendor/cubing`, que o service worker pré-carrega (`globPatterns` com `**/*.js`) até `maximumFileSizeToCacheInBytes` (6 MiB no `vite.config.ts`). No ensaio deste plano, o maior arquivo tinha uns 670 KB. O teste guarda essa folga.

Crie `app/tests/unit/pwa-cache.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// O cubo 3D da Trilha vem dos arquivos do cubing.js em public/vendor/cubing, que o service worker guarda para o offline (spec 9.5).
// Um arquivo acima do limite do workbox ficaria fora do pré-cache em silêncio. A pasta é gerada (node scripts/build-cubing.mjs, que o
// pnpm dev e o pnpm build rodam); sem ela, o teste não tem o que medir e fica de fora.
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const vendor = resolve(app, 'public/vendor/cubing');

describe('o cubing.js inteiro cabe no pré-cache do service worker', () => {
  it.skipIf(!existsSync(vendor))('nenhum arquivo de public/vendor/cubing passa do maximumFileSizeToCacheInBytes do vite.config.ts', () => {
    const config = readFileSync(resolve(app, 'vite.config.ts'), 'utf8');
    const limit = config.match(/maximumFileSizeToCacheInBytes:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
    expect(limit).not.toBeNull();
    const bytes = Number(limit![1]) * 1024 * 1024;
    const files = readdirSync(vendor).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    const largest = Math.max(...files.map((f) => statSync(resolve(vendor, f)).size));
    expect(largest).toBeLessThan(bytes);
  });
});
```

Run: `node scripts/build-cubing.mjs && pnpm exec vitest run tests/unit/pwa-cache.test.ts`
Expected: PASS (1 teste). Sem a pasta gerada, o teste aparece como pulado.

- [ ] **Step 2: Os ponta a ponta da Trilha**

Crie `app/tests/e2e/trilha.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fresh } from './helpers';

// Axe nas telas da Trilha: só as violações sérias e críticas reprovam (como em a11y.spec.ts).
async function axe(page: Page, where: string): Promise<void> {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${where}: ${v.id}`)).toEqual([]);
}

async function openTrilha(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Trilha', exact: true }).first().click();
  await expect(page.locator('[data-screen="trilha"]')).toBeVisible();
}

// Uma execução pelo teclado: segura o espaço além do tempo de armar, solta (corre) e para com outra tecla.
async function run(page: Page): Promise<void> {
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('a');
}

test('quem chega novo: o tour, "Ainda não", a aula 1 até o fim e a face lateral acesa', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pular apresentação' }).click();
  await page.getByRole('button', { name: 'Ainda não' }).click();
  const lesson = page.locator('[data-lesson="0"]');
  await expect(lesson.getByRole('heading', { name: 'Segure assim' })).toBeVisible();
  for (let i = 0; i < 7; i++) await lesson.getByRole('button', { name: 'Próximo', exact: true }).click();
  await expect(lesson.getByRole('heading', { name: 'Sua vez' })).toBeVisible();
  await lesson.getByRole('button', { name: 'Consegui no meu cubo' }).click();
  await expect(lesson.getByRole('button', { name: 'Próxima etapa' })).toBeVisible();
  await page.getByRole('button', { name: 'Centro', exact: true }).first().click();
  const centro = page.locator('[data-screen="companion"]');
  await expect(centro.locator('svg.centro g.side rect.lit')).toHaveCount(1);
  await expect(centro.getByRole('button', { name: 'Trilha: 1 de 9 · próxima: Cantos brancos' })).toBeVisible();
});

test('uma rodada de treino pelo teclado: mede, Enter marca acerto, e nada entra nos solves', async ({ page }) => {
  await fresh(page);
  await openTrilha(page);
  await page.locator('[data-train-set="oll2"]').click();
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await expect(page.locator('[data-train-scramble]')).not.toBeEmpty();
  await run(page);
  await expect(page.getByRole('button', { name: 'Acertei' })).toBeVisible();
  await page.keyboard.press('Enter');
  const last = page.locator('[data-last-attempt]');
  await expect(last).toContainText('Linha');
  await expect(last).toContainText('acerto');
  await page.getByRole('button', { name: 'Encerrar' }).click();
  await expect(page.locator('[data-case="oll2-linha"]')).toContainText('1 tentativa');
  await page.getByRole('button', { name: 'Centro', exact: true }).first().click();
  await expect(page.locator('[data-screen="companion"]').getByText(/Temporada 1 · 0 de 9 marcos/)).toBeVisible();
});

test('depois da primeira visita, a aula e o treino abrem sem rede', async ({ page, context }) => {
  await fresh(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await openTrilha(page);
  await page.getByRole('button', { name: 'Começar a aula' }).click();
  await expect(page.getByRole('heading', { name: 'Segure assim' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar à trilha' }).first().click();
  await page.locator('[data-train-set="pll2"]').click();
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await expect(page.locator('[data-train-scramble]')).not.toBeEmpty();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`Trilha sem violações sérias de acessibilidade no tema ${scheme}: começo, aula, conjunto e rodada`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await openTrilha(page);
    await axe(page, 'começo');
    await page.getByRole('button', { name: 'Marcar etapas' }).click();
    await axe(page, 'marcar etapas');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Começar a aula' }).click();
    await page.getByRole('button', { name: 'Próximo', exact: true }).click(); // um passo com algoritmo e controles
    await expect(page.getByRole('group', { name: 'Controles do cubo' })).toBeVisible();
    await axe(page, 'aula');
    await page.getByRole('button', { name: 'Voltar à trilha' }).first().click();
    await page.locator('[data-train-set="oll2"]').click();
    await page.getByRole('button', { name: 'Linha', exact: true }).click();
    await axe(page, 'conjunto');
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await expect(page.locator('[data-train-scramble]')).not.toBeEmpty();
    await axe(page, 'rodada');
  });
}
```

Em `app/tests/e2e/a11y.spec.ts`, troque:

```ts
  { tab: 'Evolução', screen: 'evolucao' },
  { tab: 'Centro', screen: 'companion' },
```

por:

```ts
  { tab: 'Evolução', screen: 'evolucao' },
  { tab: 'Trilha', screen: 'trilha' },
  { tab: 'Centro', screen: 'companion' },
```

e o comentário:

```ts
      // A análise só vale com a tela da aba montada e visível (o Evolução, o Centro e o Ajustes montam ao abrir).
```

por:

```ts
      // A análise só vale com a tela da aba montada e visível (o Evolução, a Trilha, o Centro e o Ajustes montam ao abrir).
```

Run: `pnpm test:e2e tests/e2e/trilha.spec.ts tests/e2e/a11y.spec.ts`
Expected: PASS (7 testes no projeto desktop: quem chega novo, a rodada pelo teclado, o offline, o axe da Trilha nos dois temas e o axe das cinco abas nos dois temas).

Se a porta 4329 estiver ocupada, use `KLICK_E2E_PORT=4391 pnpm test:e2e …`.

- [ ] **Step 3: A spec registra as decisões**

Em `docs/superpowers/specs/2026-10-14-klick-trilha-design.md`:

1. Na seção 5.1, troque o começo do bloco do modelo:

````md
```ts
type TrailStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // índice em profile.trail
type CaseSet = 'oll2' | 'pll2' | 'f2l';
type Stage = 'cross' | 'firstLayer' | 'secondLayer' | 'yellowCross' | 'lastLayer' | 'f2l' | 'oll' | 'solved';

interface LessonCube {
  setup: string; // movimentos que levam do resolvido ao estado que o passo mostra
  alg?: string; // o que o passo toca; sem ele, o cubo só mostra o estado
  stickering?: string; // as peças que importam; o resto fica cinza (stickerings do cubing.js, como 'F2L', 'OLL' e 'PLL'; os nomes são conferidos no plano)
  view?: '3D' | 'top'; // ângulo da câmera
  ends?: Stage; // o que o passo promete (setup + alg chega aqui); os testes conferem
}
````

por:

````md
```ts
type TrailStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // índice em profile.trail
type CaseSet = 'oll2' | 'pll2' | 'f2l';
// A segunda camada é o 'f2l' (as duas primeiras camadas inteiras) e a última camada é o 'solved'. 'llEdges', 'llCorners' e 'solved'
// aceitam um giro de cima.
type Stage = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'yellowCross' | 'llEdges' | 'llCorners' | 'oll' | 'solved';
// As peças em destaque; o resto fica apagado ou cinza. 'pair' é a figura do treino de F2L.
type MaskKind = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'eoll' | 'oll' | 'pll' | 'll' | 'pair';

interface LessonCube {
  setup: string; // movimentos que levam do resolvido (amarelo em cima, verde na frente) ao estado que o passo mostra
  alg?: string; // o que o passo toca; sem ele, o cubo só mostra o estado
  view: '3D' | 'top' | 'below'; // 3D de cima, a camada de cima chapada, ou 3D por baixo (para ver a cruz branca)
  mask?: MaskKind; // as peças que importam
  from?: Stage; // o que o setup já cumpre; os testes conferem
  ends?: Stage; // o que setup + alg cumpre, e o setup sozinho não; os testes conferem
}
````

2. Na seção 5.2, depois do método:

````md
- **Método:** as etapas 1 a 5 são o método de camadas; as etapas 6 a 9 levam ao CFOP.
````

por:

````md
- **Método:** as etapas 1 a 5 são o método de camadas; as etapas 6 a 9 levam ao CFOP.
- **Quadro do app:** amarelo em cima, branco embaixo e verde na frente em todas as aulas e no treino. O cubing.js parte do branco em cima; o app põe `z2` na frente de todo setup.
- **Destaque:** as máscaras viram o `experimentalStickeringMaskOrbits` do TwistyPlayer (e o objeto equivalente na figura 2D), calculadas pela identidade da peça no quadro do app. Os stickerings prontos do cubing.js (`Cross`, `OLL`…) supõem o branco em cima e não servem.
````

3. Na seção 5.4:

````md
- **`f2l`:** os 41 casos, com a numeração de uso comum.
````

por:

````md
- **`f2l`:** os 41 casos, com a numeração do app por grupos (o par é sempre o da frente-direita): 1 a 24 com canto e aresta em cima, 25 a 30 com o canto em cima e a aresta no lugar, 31 a 36 com o canto no lugar e a aresta em cima, 37 a 41 com os dois no lugar.
````

4. Na seção 5.5:

````md
- **Gerador:** recebe o sorteio por fora, para os testes serem fixos.
````

por:

````md
- **Gerador:** recebe o sorteio por fora, para os testes serem fixos.
- **Texto:** giros seguidos da mesma camada se juntam (`U U'` some, `U U` vira `U2`), e o 2 sai sem apóstrofo.
````

5. Na seção 5.6:

````md
- **Passos de aula:** todo passo com `ends` chega lá a partir do `setup`, depois do `alg`.
- **Verificadores de etapa** sobre o estado do cubo: cruz feita, primeira camada, segunda camada, cruz amarela, última camada, F2L, OLL feita e cubo resolvido.
- **Integridade:** todos os ids únicos, os conjuntos completos (10, 6 e 41), toda aula com 4 passos ou mais e todo algoritmo escrito em notação que o cubing.js entende.
````

por:

````md
- **Passos de aula:** todo passo com `from` já cumpre essa etapa no `setup`; todo passo com `ends` chega lá depois do `alg`, e o `setup` sozinho não chega.
- **Verificadores de etapa** sobre o estado do cubo (`Stage`): margarida, cruz, primeira camada, F2L (a segunda camada), cruz amarela, arestas de cima no lugar, cantos de cima no lugar, OLL feita e cubo resolvido (a última camada).
- **Integridade:** todos os ids únicos, os conjuntos completos (10, 6 e 41), toda aula com 4 passos ou mais e todo algoritmo escrito em notação que o cubing.js entende, com o inverso do app igual ao do `Alg.invert`. No F2L, os 41 casos são exatamente as 41 classes (onde estão o canto e a aresta do par, com qualquer giro de cima), e cada um mexe só no par da frente-direita.
````

6. Na seção 7.2:

````md
1. **Montar:** aparece o embaralhamento do caso (seção 5.5) e uma figura 2D: a camada de cima na OLL e na PLL, ou o canto e a aresta do par no F2L. A pessoa monta o caso no cubo de verdade e confere pela figura.
````

por:

````md
1. **Montar:** aparece o embaralhamento do caso (seção 5.5) e uma figura 2D: a camada de cima na OLL e na PLL (nos 3 casos da cruz amarela, só as arestas), ou o canto e a aresta do par no F2L. A pessoa monta o caso no cubo de verdade e confere pela figura.
````

7. Na seção 7.3:

````md
2. Depois, o peso de cada caso é 16 ÷ 2^nível. O peso dobra se a média das últimas 5 tentativas certas do caso passar de 1,25 vez a média do conjunto.
````

por:

````md
2. Depois, o peso de cada caso é 16 ÷ 2^nível. O peso dobra se a média das últimas 5 tentativas certas do caso passar de 1,25 vez a média do conjunto. Para o tempo, conta a tentativa certa e sem ajuda; a média do conjunto é a média das médias de 5 dos casos que têm uma.
````

8. Na seção 7.5:

````md
- **Melhor tempo do caso:** feliz, sem salto.
````

por:

````md
- **Melhor tempo do caso:** feliz, sem salto, quando a tentativa certa e sem ajuda bate o melhor tempo anterior do caso (a primeira tentativa não conta).
````

9. Na seção 8.5:

````md
- **A pergunta:** a apresentação (`dialogs/onboarding`) ganha um último passo, "Já resolve o cubo?".
````

por:

````md
- **A pergunta:** a apresentação (`dialogs/OnboardingDialog`) ganha um último passo, "Já resolve o cubo?", com "Ainda não" e, abaixo de "Já resolvo", as opções de sempre no mesmo passo. "Pular apresentação" leva a ele.
````

10. Na seção 9.1:

````md
- **Repositório:** ganha `addPractice`, `listPractice`, `updatePractice` e `deletePractice`. A interface só usa as duas últimas na correção da última tentativa.
````

por:

````md
- **Repositório:** ganha `addPractice`, `listPractice`, `updatePractice` e `deletePractice`. A interface só usa as duas últimas na correção da última tentativa. Cada escrita avisa as outras abas (`'practice'`).
````

11. Na seção 9.3, importar e restaurar:

````md
- **Importar:** junta o treino pelo id, sem duplicar.
- **Restaurar uma cópia:** troca o treino junto com o resto.
````

por:

````md
- **Importar:** junta o treino pelo id, sem duplicar. No perfil, a escolha de algoritmo e o passo das aulas juntam caso a caso (vale o do arquivo), e os casos fora do sorteio são os do arquivo.
- **Restaurar uma cópia:** troca o treino junto com o resto. Uma cópia de antes do treino (sem `practice`) não apaga o treino daqui, e um perfil sem os campos do treino mantém a escolha de algoritmos, os casos fora do sorteio e o passo das aulas daqui.
````

12. e a cópia do dia:

````md
- **Cópia do dia:** inclui o treino.
````

por:

````md
- **Cópia do dia:** inclui o treino. Um dia só de treino também ganha a cópia: a primeira tentativa depois de uma cópia conta como mudança.
````

13. Na seção 9.5:

````md
- **A conferir no plano:** que o pedaço do 3D cabe no limite de tamanho do cache.
````

por:

````md
- **Conferido:** o maior arquivo de `public/vendor/cubing` (uns 670 KB) cabe no limite do cache (6 MiB); um teste de unidade guarda isso.
````

- [ ] **Step 4: Os portões, uma última vez**

Run: `pnpm test`
Expected: PASS (a suíte inteira).

Run: `rtk proxy pnpm check`
Expected: 0 erros.

Run: `pnpm test:e2e`
Expected: PASS (a suíte inteira; o projeto mobile só roda `timer` e `sessions`).

Run: `pnpm build`
Expected: o build termina sem erro, e `dist/assets` tem um pedaço próprio da aba Trilha (o `TrilhaScreen-*.js`, com as aulas).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/trilha.spec.ts tests/e2e/a11y.spec.ts tests/unit/pwa-cache.test.ts ../docs/superpowers/specs/2026-10-14-klick-trilha-design.md
git commit -m "test(app): ponta a ponta da trilha, pré-cache do cubo e spec em dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois do plano (o controlador faz, com o ok do Ranielli)

1. **Beta.** Publicar no beta: `pnpm build && npx wrangler deploy`, dentro de `app/`.
2. **Conferência manual da spec 10:**
   - as 9 aulas num cubo de verdade, passo a passo, com o texto ao lado;
   - o cubo 3D num celular (Android médio e iPhone): a aula 1 e a "Sune";
   - uma rodada de treino com os dois polegares.
3. **Raiz e push.** A raiz (`npx wrangler deploy --env production`) só depois da revisão das aulas num cubo de verdade; `git push` só com o ok explícito.
