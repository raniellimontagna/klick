<script lang="ts">
  // Um texto da tela do desafio com os nomes isolados (isolate, duel-view.ts): cada nome num <bdi>, o resto como texto. Um nome da direita
  // para a esquerda (ou com números colados) não reordena o que vem em volta dele: "Contra …", o placar, a data.
  import { bidiParts } from './duel-view';

  let { text }: { text: string } = $props();

  const parts = $derived(bidiParts(text));
</script>

{#each parts as part, i (i)}{#if part.name}<bdi>{part.text}</bdi>{:else}{part.text}{/if}{/each}
