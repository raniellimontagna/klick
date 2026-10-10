<script lang="ts">
  // O aviso de nova versão. Só aparece com o timer parado (app.timerBusy: inspeção, armado, pronto ou rodando): recarregar a página
  // no meio de um solve perderia a reação. A função de atualizar vem do main.ts, por update.svelte.ts.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { pendingUpdate } from '../state/update.svelte';

  let { app }: { app: AppState } = $props();

  const apply = $derived(pendingUpdate());
  const show = $derived(apply !== null && !app.timerBusy);
</script>

{#if show}
  <div class="update-prompt" role="status" data-update-prompt>
    <p>{T.update.ready}</p>
    <button type="button" class="btn primary" onclick={() => void apply?.()}>{T.update.reload}</button>
  </div>
{/if}

<style>
  .update-prompt {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 12px;
    width: max-content;
    max-width: calc(100vw - 32px);
    padding: 10px 12px 10px 16px;
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    background: var(--surface);
    color: var(--ink);
    font-size: 14px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }

  .update-prompt p {
    margin: 0;
  }

  /* No celular a barra de abas fica no pé da tela: o aviso sobe para cima dela. */
  @media (max-width: 639px) {
    .update-prompt {
      bottom: calc(76px + env(safe-area-inset-bottom));
    }
  }
</style>
