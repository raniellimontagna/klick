<script lang="ts">
  import type { EventId } from '../../core/types';
  import { T } from '../../strings';
  import ScrambleImage from './ScrambleImage.svelte';

  interface Props {
    event: EventId;
    scramble: string; // '' enquanto o gerador trabalha
    error: boolean; // o gerador falhou
    reloadHint: boolean; // duas falhas seguidas: sugere recarregar a página
    pb: boolean; // o último solve foi recorde (a etiqueta aparece)
    imageOn: boolean; // ajuste: a imagem 2D ao lado do texto
    label?: string; // o rótulo (o desafio: "Embaralhamento 3 de 7")
  }

  let { event, scramble, error, reloadHint, pb, imageOn, label = T.timer.scramble }: Props = $props();

  const text = $derived(scramble !== '' ? scramble : error ? T.timer.scrambleFailed : T.timer.generating);
</script>

<div class="t-scramble fade">
  <div class="scr-row">
    <div class="scr-text">
      <div class="label">{label}</div>
      <p class="scramble" data-scramble>{text}</p>
      {#if error}<p class="scr-hint">{T.timer.scrambleRetry}</p>{/if}
      {#if reloadHint}<p class="scr-hint">{T.timer.scrambleReload}</p>{/if}
      <span class="pb-tag" data-pbtag hidden={!pb}>{T.timer.newRecord}</span>
    </div>
    {#if imageOn}
      <ScrambleImage {event} {scramble} visible={scramble !== ''} />
    {/if}
  </div>
</div>

<style>
  .scr-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .scr-text {
    flex: 1;
    min-width: 0;
  }

  .scr-hint {
    margin-top: 4px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
