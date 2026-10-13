<script lang="ts">
  import type { FinishId } from '../../core/types';
  import { T } from '../../strings';
  import { type CentroTheme, renderCentro } from '../centro';

  interface Props {
    theme: CentroTheme;
    finish: FinishId;
    topLit: number; // marcos conquistados (face de cima)
    sideLit: number; // trilha marcada (face lateral)
  }

  let { theme, finish, topLit, sideLit }: Props = $props();

  // O SVG é refeito só quando tema, acabamento ou marcas mudam. O anel, os olhos e o corpo mudam pelo animador (centro/animator.ts).
  const markup = $derived(renderCentro({ theme, finish, topLit, sideLit, label: T.centro.label }));
</script>

<div class="t-centro" data-centro-slot>{@html markup}</div>
