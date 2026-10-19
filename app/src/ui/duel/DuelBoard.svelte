<script lang="ts">
  // O placar do modo desafio no Timer (a maquete aprovada). De quem desafia: as sete peças do progresso (feitas na tinta, a da vez com o
  // contorno) e "3 de 7". De quem recebe: o placar em peças, com a coluna da vez. Numa coluna só, no topo da tela, no lugar do progresso (3,
  // 6a, 6b); no desktop, o cartão "Desafio" da coluna da direita, no lugar da constância, com a lista dos tempos de quem desafia (3, desktop).
  import { DUEL_SCRAMBLES, type DuelScore } from '../../core/duel/score';
  import { eventInfo } from '../../core/events';
  import type { Duel } from '../../core/types';
  import { T } from '../../strings';
  import { boardOf, duelTime, rowName, stepsOf } from './duel-view';
  import Placar from './Placar.svelte';

  let { duel, score, index, wide }: { duel: Duel; score: DuelScore | null; index: number; wide: boolean } = $props();

  const steps = $derived(stepsOf(duel.mine.length, index >= 0));
  const board = $derived(duel.side === 'b' && score ? boardOf(duel, score, index >= 0 ? index : null) : null);
  const count = $derived(T.progress.of(Math.min(index >= 0 ? index + 1 : duel.mine.length, DUEL_SCRAMBLES), DUEL_SCRAMBLES));
  const cols = Array.from({ length: DUEL_SCRAMBLES }, (_, i) => i);
</script>

{#snippet prog()}
  <span class="prog" aria-hidden="true">
    {#each steps as p, i (i)}
      <i data-p={p}></i>
    {/each}
  </span>
{/snippet}

{#if wide}
  <div class="card t-duel fade" data-duel-card>
    <div class="card-h"><span class="label">{T.duel.card(eventInfo(duel.event).short)}</span><span class="muted num">{count}</span></div>
    {#if board}
      <div class="dz-side-board"><Placar {board} them={rowName(duel.theirName)} /></div>
    {:else}
      <div class="dz-side-prog">{@render prog()}</div>
      <ol class="dz-times one">
        {#each cols as i (i)}
          {#if i < duel.mine.length}
            <li><span class="n">{i + 1}</span>{duelTime(duel.mine[i]!)}</li>
          {:else if i === index}
            <li data-now><span class="n">{i + 1}</span>{T.duel.now}</li>
          {:else}
            <li class="none"><span class="n">{i + 1}</span>{T.timer.none}</li>
          {/if}
        {/each}
      </ol>
    {/if}
  </div>
{:else if board}
  <div class="card dz-board dz-top fade"><Placar {board} them={rowName(duel.theirName)} /></div>
{:else}
  <div class="dz-prog dz-top fade">{@render prog()}<span class="num">{count}</span></div>
{/if}
