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
