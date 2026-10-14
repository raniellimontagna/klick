<script lang="ts">
  // A aba Trilha (spec do sub-projeto 4, seção 8.2): o começo (as 9 etapas, o treino e o aviso para quem já resolve), a aula de uma etapa e
  // o treino de um conjunto. Onde ela está fica em app.trailView: trocar de aba e voltar cai no mesmo lugar.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import LessonPlayer from './LessonPlayer.svelte';
  import TrailHome from './TrailHome.svelte';

  let { app }: { app: AppState } = $props();
</script>

<section class="screen" data-screen="trilha" aria-label={T.tabs.trilha}>
  {#if app.trailView.kind === 'home'}
    <TrailHome {app} />
  {:else if app.trailView.kind === 'lesson'}
    <!-- Uma aula por vez: trocar de etapa desmonta a anterior (e o cubo dela). -->
    {#key app.trailView.step}
      <LessonPlayer {app} step={app.trailView.step} />
    {/key}
  {/if}
</section>
