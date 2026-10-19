<script lang="ts">
  // O placar em peças e a partida ponto a ponto (a maquete aprovada, 7, 8 e 9c): uma linha por embaralhamento jogado, o tempo de quem levou
  // o ponto em negrito, e uma linha só para os que ficaram de fora. As telas de fim do desafio e a partida aberta em Evolução mostram o mesmo.
  import type { DuelScore } from '../../core/duel/score';
  import type { Duel } from '../../core/types';
  import { T } from '../../strings';
  import { boardOf, matchOf, rowName } from './duel-view';
  import Placar from './Placar.svelte';

  let { duel, score }: { duel: Duel; score: DuelScore } = $props();

  const board = $derived(boardOf(duel, score, null));
  const match = $derived(matchOf(duel, score));
  const them = $derived(rowName(duel.theirName));
</script>

<div class="card dz-board"><Placar {board} {them} /></div>
<div class="card hist dz-match">
  <table>
    <thead>
      <tr>
        <th>{T.duel.colNumber}</th>
        <th>{T.duel.me}</th>
        <th>{them}</th>
        <th>{T.duel.colPoint}</th>
      </tr>
    </thead>
    <tbody>
      {#each match.rows as row (row.n)}
        <tr>
          <td>{row.n}</td>
          <td class:w={row.winner === 'me'}>{row.mine}</td>
          <td class:w={row.winner === 'them'}>{row.theirs}</td>
          <td>{row.point}</td>
        </tr>
      {/each}
      {#if match.rest}
        <tr class="dz-skip">
          <td>{match.rest.label}</td>
          <td colspan="3" class="dz-rest">{match.rest.text}</td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>
