<script lang="ts">
  // Sair da conta (spec 7.7): os dados ficam no aparelho, com a opção de apagá-los. Apagar só vale sem mudanças esperando para subir
  // (decisão 12): com alguma, o aviso aparece no lugar de sair, e nada muda.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let erase = $state(false);
  let blocked = $state<number | null>(null); // mudanças esperando: o aviso no lugar de sair
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
      if ((await account.signOut(erase)) === 'pending') {
        blocked = Math.max(await account.pending(), 1);
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
      <p role="alert">{T.conta.pendingBlock(blocked)}</p>
    {/if}
    <div class="row">
      <button type="button" class="btn{erase ? ' danger' : ''}" disabled={busy} onclick={leave}>{T.conta.signOut}</button>
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.conta.cancel}</button>
    </div>
  {/if}
</dialog>
