<script lang="ts">
  // A figura 2D de um caso do treino (spec 7.2): a camada de cima na OLL e na PLL, o par da frente-direita no F2L, já no estado do
  // embaralhamento. Sem o cubing.js, fica vazia: o embaralhamento escrito continua na tela. `small`: a versão pequena, ao lado do algoritmo
  // na rodada (como segurar o caso), para não empurrar o tempo e as zonas para baixo.
  import type { CubeAngle, MaskKind } from '../../core/trail/types';
  import { drawFigure } from './cube-view';

  let { setup, view, mask, small = false }: { setup: string; view: CubeAngle; mask: MaskKind; small?: boolean } = $props();

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

<div class="case-fig" class:top={view === 'top'} class:small aria-hidden="true" data-case-figure bind:this={host}></div>

<style>
  .case-fig {
    width: 180px;
    height: 135px;
  }

  .case-fig.top {
    width: 140px;
    height: 140px;
  }

  .case-fig.small {
    width: 96px;
    height: 72px;
  }

  .case-fig.small.top {
    width: 88px;
    height: 88px;
  }

  .case-fig :global(.svg-wrapper),
  .case-fig :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
