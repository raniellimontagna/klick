<script lang="ts">
  // O aviso de nova versão. A região de status fica montada sempre: o leitor de tela já a conhece quando o texto entra. Só aparece
  // com o timer parado (app.timerBusy), sem espaço segurado antes da inspeção (app.pendingInspect) e sem solve em voo ou na fila
  // (app.unsaved): recarregar nesses momentos perderia a reação ou a gravação. A função de atualizar vem do main.ts, por
  // update.svelte.ts, que também recarrega esta aba quando outra aceita a versão e esta fica livre.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { pendingUpdate, reloadIfFree } from '../state/update.svelte';

  let { app }: { app: AppState } = $props();

  const apply = $derived(pendingUpdate());
  const show = $derived(apply !== null && !app.timerBusy && !app.unsaved && !app.pendingInspect);

  // Outra aba aceitou a versão nova: esta recarrega quando a tela ficar livre (o pedido e a regra estão em update.svelte.ts).
  $effect(() => {
    reloadIfFree({ timerBusy: app.timerBusy, pendingInspect: app.pendingInspect, unsaved: app.unsaved });
  });
</script>

<div class="update-prompt" class:shown={show} data-update-prompt>
  <p role="status" class="update-text">{show ? T.update.ready : ''}</p>
  {#if show}
    <button type="button" class="btn primary" onclick={() => void apply?.()}>{T.update.reload}</button>
  {/if}
</div>

<style>
  /* Sem aviso, o contêiner não tem caixa nem texto: a região de status continua na árvore de acessibilidade, sem ocupar a tela. */
  .update-prompt {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 6;
    width: max-content;
    max-width: calc(100vw - 32px);
  }

  .update-prompt.shown {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 16px;
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    background: var(--surface);
    color: var(--ink);
    font-size: 14px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }

  .update-text {
    margin: 0;
  }

  /* No celular a barra de abas fica no pé da tela: o aviso sobe para cima dela. */
  @media (max-width: 639px) {
    .update-prompt {
      bottom: calc(76px + env(safe-area-inset-bottom));
    }
  }
</style>
