<script lang="ts">
  // O mini placar (a maquete aprovada, 9a e 9b): as duas linhas de peças, sem nomes nem números, "Você" em cima. Para o leitor de tela, uma
  // imagem com o placar por extenso, como o grande; dentro de um botão, ela é a descrição dele (o `id`).
  import type { Board } from './duel-view';

  let { board, id }: { board: Board; id?: string } = $props();
</script>

<span class="placar mini" role="img" aria-label={board.label} {id} data-placar-mini>
  <span class="pl-row">
    {#each board.me as p, i (i)}
      <i data-p={p}></i>
    {/each}
  </span>
  <span class="pl-row">
    {#each board.them as p, i (i)}
      <i data-p={p}></i>
    {/each}
  </span>
</span>
