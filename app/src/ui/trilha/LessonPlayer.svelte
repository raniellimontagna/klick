<script lang="ts">
  // O leitor de aula (spec do sub-projeto 4, seção 6): o Centro pequeno, o nome da etapa e os pontos do progresso; o cubo animado com as
  // peças que importam em destaque; o algoritmo escrito com o movimento atual; os controles; o texto e a dica; Voltar e Próximo.
  // ← e → andam um movimento (sem passar do começo nem do fim) e o espaço toca ou pausa (a tela não tem timer). Cada troca de passo guarda
  // onde a aula parou (profile.lessonAt), e a aula volta dali; a troca é anunciada. O último passo conclui: marca a etapa, a face lateral
  // pisca e o Centro fica feliz. "Reduzir movimento" ou o Centro estático: nada toca sozinho, o cubo anda só pelos controles.
  import { tick, untrack } from 'svelte';
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
  let cubeFailed = $state(false); // a figura 2D parada no lugar do 3D
  let cubeMissing = $state(false); // nem a figura: o cubing.js não carregou
  let navEl = $state<HTMLElement>();
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

  // O cubo monta uma vez por aula. A tela pode fechar antes de o cubing.js carregar: aí o cubo que chegar é desmontado na hora. E o passo
  // pode mudar antes de ele chegar (o goTo não acha cubo para mostrar): ao chegar, ele mostra o passo de agora, e a decisão de tocar
  // sozinho também sai dele.
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
      cubeMissing = view === null;
      cubeFailed = view !== null && !view.moving;
      view?.listen((s) => {
        cubeState = s;
      });
      if (view) untrack(() => view.show(specOf(part), autoplay()));
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
    app.announce(T.trilha.lesson.partNow(i + 1, lesson.parts.length, lesson.parts[i].title));
    await app.setLessonAt(step, i);
  }

  async function complete(): Promise<void> {
    if (saving) return;
    saving = true;
    const ok = await app.completeLesson(step);
    saving = false;
    if (!ok) return; // o aviso já saiu; a etapa fica como estava (e o foco, no botão)
    completed = true;
    app.announce(T.trilha.lesson.completed(TRAIL[step]));
    // O botão de concluir sumiu: o foco vai para a ação principal nova (a próxima etapa, o treino ou a volta à trilha).
    await tick();
    navEl?.querySelector<HTMLElement>('button')?.focus();
  }

  // Avançar e concluir são o mesmo botão (o rótulo e a ação mudam no último passo): o foco não cai quando o passo muda.
  function forward(): void {
    if (part < last) void goTo(part + 1);
    else void complete();
  }

  function onKey(e: KeyboardEvent): void {
    if (!cube?.moving || moves.length === 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select')) return;
    // As setas param nas pontas (como os botões, que ficam desligados lá) e não repetem com a tecla segurada.
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (!e.repeat && !cubeState.atEnd) cube.step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!e.repeat && !cubeState.atStart) cube.step(-1);
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

  <!-- Sem o cubing.js, a caixa recolhe: não há figura para mostrar nela. -->
  <div class="cube" class:flat={cube !== null && !cube.moving} hidden={cubeMissing} aria-hidden="true" data-cube bind:this={host}></div>
  {#if cubeMissing}
    <p class="muted note" data-cube-missing>{T.trilha.lesson.noCube}</p>
  {:else if cubeFailed}
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

  <div class="nav" bind:this={navEl}>
    {#if completed}
      {#if lesson.cases}
        <button type="button" class="btn primary" onclick={() => app.openTrail({ kind: 'set', set: lesson.cases! })}>{T.trilha.lesson.train}</button>
      {:else if step < 8}
        <button type="button" class="btn primary" onclick={() => app.openTrail({ kind: 'lesson', step: (step + 1) as TrailStep })}>{T.trilha.lesson.nextStep}</button>
      {/if}
      <button type="button" class="btn" onclick={() => app.openTrail()}>{T.trilha.lesson.exit}</button>
    {:else}
      <button type="button" class="btn" disabled={part === 0} onclick={() => goTo(part - 1)}>{T.trilha.lesson.prev}</button>
      <button type="button" class="btn primary" onclick={forward}>{part < last ? T.trilha.lesson.next : marked ? T.trilha.lesson.finish : T.trilha.lesson.done}</button>
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

  /* O texto fica na cor normal (a cor da trilha no tema escuro não chega a 4,5:1 sobre o fundo); o destaque é o sublinhado grosso. */
  .alg .now {
    font-weight: 700;
    text-decoration: underline;
    text-decoration-color: var(--trail);
    text-decoration-thickness: 3px;
    text-underline-offset: 5px;
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
