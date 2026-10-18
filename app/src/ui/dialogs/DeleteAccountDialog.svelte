<script lang="ts">
  // Apagar minha conta (spec 7.7): a confirmação é digitar o e-mail. O servidor apaga na hora; os dados do aparelho ficam, fora da conta.
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let typed = $state('');
  let error = $state<string | null>(null);
  let signInAgain = $state(false); // a sessão venceu: o aviso traz o caminho para entrar de novo
  let busy = $state(false);
  const email = $derived(app.account?.sync.email ?? '');

  function onclose(): void {
    typed = '';
    error = null;
    signInAgain = false;
    if (app.dialog === 'deleteAccount') app.dialog = null;
  }

  async function confirm(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const account = app.account;
    if (!account || busy) return;
    busy = true;
    signInAgain = false;
    try {
      const result = await account.deleteAccount(typed);
      if (result === 'ok') {
        app.showToast(T.conta.deleted);
        dialogEl?.close();
      } else if (result === 'auth') {
        error = T.conta.deleteSignInAgain;
        signInAgain = true;
      } else error = result === 'mismatch' ? T.conta.deleteMismatch : T.conta.deleteFailed;
    } catch {
      error = T.conta.deleteFailed; // o banco daqui falhou
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet account-sheet" aria-label={T.conta.deleteTitle} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.conta.deleteTitle}</h2>
    <p>{T.conta.deleteText}</p>
    <form onsubmit={confirm}>
      <label class="field">
        <span>{T.conta.deleteConfirmLabel(email)}</span>
        <input type="email" autocomplete="off" autocapitalize="none" spellcheck="false" bind:value={typed} data-confirm-email />
      </label>
      {#if error}
        <p role="alert">{error}</p>
      {/if}
      {#if signInAgain}
        <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.signInAgain}</button>
      {/if}
      <div class="row">
        <button type="submit" class="btn danger" disabled={busy || typed.trim() === ''}>{T.conta.deleteConfirm}</button>
        <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.conta.cancel}</button>
      </div>
    </form>
  {/if}
</dialog>
