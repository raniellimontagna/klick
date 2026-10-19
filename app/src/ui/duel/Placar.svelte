<script lang="ts">
  // O placar em peças (a maquete aprovada): uma linha por pessoa ("Você" em cima), uma coluna por embaralhamento, os pontos na ponta. A
  // coluna da vez ganha o contorno na tinta em volta das duas peças. Para o leitor de tela, uma imagem com o placar por extenso.
  import { DUEL_SCRAMBLES } from '../../core/duel/score';
  import { T } from '../../strings';
  import Bidi from './Bidi.svelte';
  import type { Board } from './duel-view';

  let { board, them }: { board: Board; them: string } = $props();

  const cols = Array.from({ length: DUEL_SCRAMBLES }, (_, i) => i);
</script>

<div class="placar" role="img" aria-label={board.label} data-placar>
  <span></span>
  {#each cols as i (i)}
    <small data-now={board.now === i ? '' : undefined} data-skip={board.me[i] === 'skip' ? '' : undefined}>{i + 1}</small>
  {/each}
  <span></span>
  <b class="pl-name">{T.duel.me}</b>
  {#each board.me as p, i (i)}
    <i data-p={p}></i>
  {/each}
  <b class="pl-score num">{board.mine}</b>
  <b class="pl-name"><Bidi text={them} /></b>
  {#each board.them as p, i (i)}
    <i data-p={p}></i>
  {/each}
  <b class="pl-score num">{board.theirs}</b>
  {#if board.now !== null}
    <!-- A coluna da vez: a primeira coluna da grade é a dos nomes. -->
    <span class="pl-now" style:grid-column="{board.now + 2} / {board.now + 3}"></span>
  {/if}
</div>
