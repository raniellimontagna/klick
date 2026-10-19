<script lang="ts">
  // O Centro das folhas e das telas de fim do desafio (a maquete aprovada, "O Centro no desafio"): o deste aparelho (os marcos e a trilha de
  // quem joga; quem é novo no Klick tem as faces vazias), num estado dado. A vitória salta uma vez, como no recorde. Segue o ajuste do
  // Centro como o da Trilha (MiniCentro): estático, oculto e o movimento reduzido não se mexem. O tamanho vem de quem usa.
  import { tick } from 'svelte';
  import { T } from '../../strings';
  import { type CentroTheme, type CentroView, eyesFor, renderCentro, ringFor } from '../centro';
  import { createCentroAnimator } from '../centro/animator';
  import type { AppState } from '../state/app.svelte';

  let { app, view = { state: 'idle' }, jump = false }: { app: AppState; view?: CentroView; jump?: boolean } = $props();

  let box = $state<HTMLElement>();
  let darkMq = $state(false);
  let reduceMq = $state(false);
  let jumped = false;

  const topLit = $derived(app.seasonStatus().filter((m) => m.achieved).length);
  const sideLit = $derived(app.profile.trail.filter(Boolean).length);
  const theme = $derived<CentroTheme>(
    app.profile.settings.theme === 'system' ? (darkMq ? 'dark' : 'light') : app.profile.settings.theme === 'dark' ? 'dark' : 'light',
  );
  // Já desenhado no estado dado: o anel e os olhos certos desde o primeiro quadro (o animador segue dali).
  const svg = $derived(
    renderCentro({ theme, topLit, sideLit, finish: app.profile.finish, ring: ringFor({ ...view, orbit: null }), eyes: eyesFor(view), label: T.centro.label }),
  );

  const animator = createCentroAnimator({ svg: () => box?.querySelector<SVGElement>('svg.centro') ?? null });

  $effect(() => {
    const s = app.profile.settings;
    animator.setAnimated(s.centro === 'animado' && s.reducedMotion !== 'always' && !reduceMq);
  });
  $effect(() => {
    animator.show(view);
    if (jump && !jumped) {
      jumped = true;
      animator.trigger('pb');
    }
  });
  $effect(() => {
    void svg;
    void tick().then(() => animator.repaint());
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

<div class="duel-centro" data-duel-centro bind:this={box}>{@html svg}</div>

<style>
  .duel-centro :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
