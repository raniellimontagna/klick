<script lang="ts">
  // Sair da conta (spec 7.7): os dados ficam no aparelho, com a opção de apagá-los. Apagar só vale sem mudanças esperando para subir
  // (decisão 12) e sem registros que só existem aqui (I4): com algum, o aviso aparece no lugar de sair, com a contagem, e nada muda.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let erase = $state(false);
  let blocked = $state<string | null>(null); // mudanças esperando, ou registros que só existem aqui: o aviso no lugar de sair
  let busy = $state(false);

  function onclose(): void {
    erase = false;
    blocked = null;
    if (app.dialog === 'signout') app.dialog = null;
  }

  async function leave(): Promise<void> {
    const account = app.account;
    if (!account || busy) return;
    busy = true;
    try {
      const result = await account.signOut(erase);
      if (result === 'pending') {
        blocked = T.conta.pendingBlock(Math.max(await account.pending(), 1));
        return;
      }
      if (result === 'local-only') {
        blocked = T.conta.localOnlyBlock(Math.max(await account.localOnly(), 1));
        return;
      }
      app.showToast(erase ? T.conta.signedOutErased : T.conta.signedOut);
      dialogEl?.close();
    } catch {
      app.showToast(T.conta.signOutFailed); // o banco falhou: a conta segue como estava
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.conta.signOutTitle} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.conta.signOutTitle}</h2>
    <p class="muted">{T.conta.signOutText}</p>
    <label class="setting">
      <span>{T.conta.eraseHere}<small>{T.conta.eraseHint}</small></span>
      <input type="checkbox" class="switch" bind:checked={erase} data-erase />
    </label>
    {#if blocked !== null}
      <p role="alert">{blocked}</p>
    {/if}
    <div class="row">
      <button type="button" class="btn{erase ? ' danger' : ''}" disabled={busy} onclick={leave}>{T.conta.signOut}</button>
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.conta.cancel}</button>
    </div>
  {/if}
</dialog>
