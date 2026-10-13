<script lang="ts">
  // O aviso fixo do banco (state/db-notice.svelte.ts). "Atualizado em outra aba": esta aba largou o banco para a outra migrar e só
  // volta a gravar depois de recarregar; com solve só nesta aba, oferece exportar antes. "Feche as outras abas": esta é a versão
  // nova e espera uma aba antiga largar o banco. Fica montado sempre, até antes do app existir (o segundo caso é do boot).
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { dbNotice } from '../state/db-notice.svelte';

  let { app, reload = () => window.location.reload() }: { app: AppState | null; reload?: () => void } = $props();

  const kind = $derived(dbNotice());
  const unsaved = $derived(app?.unsaved ?? false);
  const text = $derived(
    kind === 'updated' ? (unsaved ? T.data.dbUpdatedUnsaved : T.data.dbUpdated) : kind === 'closeOthers' ? T.data.dbCloseOthers : '',
  );
</script>

<!-- Um alerta é lido quando entra na tela: o aviso só existe enquanto há o que avisar. -->
{#if kind !== null}
  <div class="db-notice" data-db-notice>
    <p role="alert" class="db-notice-text">{text}</p>
    {#if kind === 'updated'}
      <span class="db-notice-actions">
        {#if unsaved && app}
          <button type="button" class="btn" onclick={() => void app?.exportFile('klick')}>{T.data.exportNow}</button>
        {/if}
        <button type="button" class="btn primary" onclick={reload}>{T.update.reload}</button>
      </span>
    {/if}
  </div>
{/if}

<style>
  /* No topo, por cima de tudo: sem recarregar, nada mais grava. */
  .db-notice {
    position: fixed;
    left: 50%;
    top: calc(12px + env(safe-area-inset-top, 0px));
    transform: translateX(-50%);
    z-index: 40;
    width: max-content;
    max-width: calc(100vw - 32px);
    display: flex;
    flex-wrap: wrap;
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

  .db-notice-text {
    margin: 0;
  }

  .db-notice-actions {
    display: flex;
    gap: 8px;
  }
</style>
