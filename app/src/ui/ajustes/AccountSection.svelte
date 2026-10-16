<script lang="ts">
  // "Conta e sync" (spec 9.1): sem conta, o convite; com conta, o e-mail, a situação do sync e o que dá para fazer. Só aparece com a conta
  // ligada no ambiente (ou, sem resposta do servidor, com este aparelho já numa conta). No desktop, é a primeira seção da coluna da direita;
  // no celular, a primeira da lista (screens.css). O diálogo de sair fica montado aqui; o de entrar é da casca (o lembrete do Timer também o
  // abre), e este botão só pede a abertura (app.dialog = 'signin').
  import { onDestroy, onMount } from 'svelte';
  import { T } from '../../strings';
  import SignOutDialog from '../dialogs/SignOutDialog.svelte';
  import { dateLabel } from '../format';
  import type { AppState, DialogId } from '../state/app.svelte';
  import { syncLine } from '../sync-status';

  let { app }: { app: AppState } = $props();

  const account = $derived(app.account);
  let now = $state(Date.now()); // o "há 2 min" anda sozinho
  let confirmAll = $state(false); // "Sair de todos os aparelhos" espera o segundo clique
  let busy = $state(false);

  // Os diálogos que esta seção abre.
  const ACCOUNT_DIALOGS: readonly DialogId[] = ['signout'];

  onMount(() => {
    const h = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(h);
  });

  // Sair de Ajustes com um destes diálogos aberto solta o estado: senão, na volta, o diálogo reabriria sozinho.
  onDestroy(() => {
    if (app.dialog !== null && ACCOUNT_DIALOGS.includes(app.dialog)) app.dialog = null;
  });

  $effect(() => {
    if (account?.signedIn && account.passkeys === null) void account.loadPasskeys();
  });

  async function addPasskey(): Promise<void> {
    if (!account || busy) return;
    busy = true;
    try {
      app.showToast((await account.addPasskey()) ? T.conta.passkeyAdded : T.conta.passkeyFailed);
    } finally {
      busy = false;
    }
  }

  async function removePasskey(id: string): Promise<void> {
    if (!account || busy) return;
    busy = true;
    try {
      await account.removePasskey(id);
    } finally {
      busy = false;
    }
  }

  async function signOutAll(): Promise<void> {
    if (!account || busy) return;
    if (!confirmAll) {
      confirmAll = true;
      return;
    }
    busy = true;
    try {
      app.showToast((await account.signOutEverywhere()) ? T.conta.signOutAllDone : T.conta.signOutAllFailed);
    } catch {
      app.showToast(T.conta.signOutAllFailed);
    } finally {
      busy = false;
      confirmAll = false;
    }
  }
</script>

{#snippet caption(label: string, hint?: string)}
  <span>{label}{#if hint}<small>{hint}</small>{/if}</span>
{/snippet}

{#if account?.available}
  <fieldset class="account" data-slot="conta">
    <legend>{T.conta.title}</legend>
    {#if !account.signedIn}
      <div class="setting">
        {@render caption(T.conta.pitch)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.signIn}</button>
      </div>
    {:else}
      <div class="setting">
        <span>{account.sync.email}<small data-sync-line>{syncLine(account.status, now)}</small></span>
        {#if account.status.error === 'auth'}
          <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.signInAgain}</button>
        {:else}
          <button type="button" class="btn" disabled={account.status.phase === 'syncing'} onclick={() => account.syncNow()}>{T.conta.syncNow}</button>
        {/if}
      </div>

      <div class="setting">
        {@render caption(T.conta.passkeys, T.conta.passkeysHint)}
        <button type="button" class="btn" disabled={busy} onclick={addPasskey}>{T.conta.passkeyAdd}</button>
      </div>
      {#if account.passkeys && account.passkeys.length > 0}
        <ul class="sheet-list passkeys" aria-label={T.conta.passkeys}>
          {#each account.passkeys as p (p.id)}
            {@const when = dateLabel(p.createdAt)}
            <li class="setting">
              <span>{p.name ?? T.conta.passkeys}<small>{T.conta.passkeyName(when)}</small></span>
              <button type="button" class="btn" disabled={busy} aria-label={T.conta.passkeyRemoveAria(when)} onclick={() => removePasskey(p.id)}
                >{T.conta.passkeyRemove}</button
              >
            </li>
          {/each}
        </ul>
      {/if}

      <div class="setting">
        {@render caption(T.conta.signOut, T.conta.signOutHint)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'signout')}>{T.conta.signOut}</button>
      </div>
      <div class="setting">
        {@render caption(T.conta.signOutAll, T.conta.signOutAllHint)}
        <button type="button" class="btn{confirmAll ? ' danger' : ''}" disabled={busy} onclick={signOutAll}
          >{confirmAll ? T.conta.confirmAgain : T.conta.signOutAll}</button
        >
      </div>
    {/if}
  </fieldset>
{/if}

<SignOutDialog {app} open={app.dialog === 'signout'} />
