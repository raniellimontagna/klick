<script lang="ts">
  // As cópias na nuvem (spec 8.3 e 9.1): os últimos 30 dias, com o número de solves de cada um. Restaurar pede um segundo clique: troca a
  // conta inteira, em todos os aparelhos. A cópia que não existe mais (passou dos 30 dias) avisa e a lista relê.
  import { T } from '../../strings';
  import type { CloudCopy } from '../../sync/api';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let copies = $state<CloudCopy[]>([]);
  let loaded = $state(false);
  let failed = $state(false); // a lista não carregou: o aviso diz isso, não que não há cópias
  let asking = $state<string | null>(null); // a cópia que espera o segundo clique
  let busy = $state(false);

  $effect(() => {
    if (!open) return;
    loaded = false;
    void load();
  });

  async function load(): Promise<void> {
    asking = null;
    failed = false;
    try {
      copies = (await app.account?.cloudCopies()) ?? [];
    } catch {
      copies = [];
      failed = true;
      app.showToast(T.conta.cloudLoadFailed);
    }
    loaded = true;
  }

  // Fechou por qualquer caminho: esquece o segundo clique pendente e libera o diálogo no estado, se ele ainda for este.
  function onclose(): void {
    asking = null;
    if (app.dialog === 'cloud') app.dialog = null;
  }

  async function restore(c: CloudCopy): Promise<void> {
    const account = app.account;
    if (busy || !account) return;
    if (asking !== c.name) {
      asking = c.name;
      return;
    }
    busy = true;
    try {
      const outcome = await account.restoreCloudCopy(c.name);
      if (outcome === 'ok') {
        app.showToast(T.conta.cloudRestored);
        dialogEl?.close();
      } else if (outcome === 'gone') {
        app.showToast(T.conta.cloudGone);
        void load();
      } else app.showToast(T.conta.cloudRestoreFailed);
    } finally {
      busy = false;
      asking = null;
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet account-sheet" aria-label={T.conta.cloudTitle} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.conta.cloudTitle}</h2>
    <p class="muted">{T.conta.cloudIntro}</p>
    {#if loaded && !failed && copies.length === 0}
      <p class="muted">{T.conta.cloudEmpty}</p>
    {/if}
    <ul class="sheet-list">
      {#each copies as c (c.name)}
        {@const label = T.conta.cloudDay(c.day, c.kind)}
        <li class="setting">
          <span>{label}<small>{T.backupsDialog.solves(c.solves)}</small></span>
          <button
            type="button"
            class="btn{asking === c.name ? ' danger' : ''}"
            disabled={busy}
            aria-label={asking === c.name ? undefined : T.conta.cloudRestoreAria(label)}
            onclick={() => restore(c)}>{asking === c.name ? T.conta.confirmAgain : T.conta.cloudRestore}</button
          >
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
