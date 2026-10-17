<script lang="ts">
  // "Conta e sync" (spec 9.1): sem conta, o convite; com conta, o e-mail, a situação do sync e o que dá para fazer. Só aparece com a conta
  // ligada no ambiente (ou, sem resposta do servidor, com este aparelho já numa conta). No desktop, é a primeira seção da coluna da direita;
  // no celular, a primeira da lista (screens.css). Os diálogos de sair, das cópias na nuvem e de apagar a conta ficam montados aqui; o de
  // entrar é da casca (o lembrete do Timer também o abre), e este botão só pede a abertura (app.dialog = 'signin').
  import { onDestroy, onMount, tick } from 'svelte';
  import { T } from '../../strings';
  import CloudCopiesDialog from '../dialogs/CloudCopiesDialog.svelte';
  import DeleteAccountDialog from '../dialogs/DeleteAccountDialog.svelte';
  import SignOutDialog from '../dialogs/SignOutDialog.svelte';
  import { dateLabel } from '../format';
  import LiveCube from '../LiveCube.svelte';
  import type { AppState, DialogId } from '../state/app.svelte';
  import { syncLine } from '../sync-status';

  let { app }: { app: AppState } = $props();

  const account = $derived(app.account);
  let now = $state(Date.now()); // o "há 2 min" anda sozinho
  let confirmAll = $state(false); // "Sair de todos os aparelhos" espera o segundo clique
  let busy = $state(false);
  let sectionEl = $state<HTMLElement>();

  // Os diálogos que esta seção abre.
  const ACCOUNT_DIALOGS: readonly DialogId[] = ['signout', 'cloud', 'deleteAccount'];

  // "Sincronizar agora" com o cubinho (spec visual 7 e decisão 9): o verde passageiro da linha e a onda do cubo só vêm depois de um sync que
  // a pessoa pediu pelo toque e que terminou bem. Os syncs automáticos com Ajustes aberto não piscam. A marca "pedido pelo toque" é gasta
  // no primeiro fim de rodada (bem ou mal) e não é lida pela tela, por isso não é reativa.
  const FRESH_MS = 1200;
  let requested = false;
  let prevPhase: string | undefined;
  let fresh = $state(false);
  let freshTimer: ReturnType<typeof setTimeout> | undefined;

  function syncNow(): void {
    requested = true;
    void account?.syncNow();
  }

  $effect(() => {
    const phase = account?.status.phase;
    const failed = account?.status.error != null;
    const was = prevPhase;
    prevPhase = phase;
    if (!requested || was !== 'syncing' || phase === 'syncing') return;
    requested = false;
    if (phase !== 'idle' || failed) return;
    fresh = true;
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => (fresh = false), FRESH_MS);
  });

  // O cubinho do botão: gira enquanto sincroniza, erro com o erro, onda uma vez com o verde; o resto, parado. Passa por "turn" entre um
  // toque e outro, então a onda toca de novo.
  const cube = $derived(
    account?.status.phase === 'syncing' ? 'turn' : account?.status.error != null ? 'error' : fresh ? 'wave' : 'idle'
  );

  onMount(() => {
    const h = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(h);
  });
  onDestroy(() => clearTimeout(freshTimer));

  // Sair de Ajustes com um destes diálogos aberto solta o estado: senão, na volta, o diálogo reabriria sozinho.
  onDestroy(() => {
    if (app.dialog !== null && ACCOUNT_DIALOGS.includes(app.dialog)) app.dialog = null;
  });

  $effect(() => {
    if (account?.signedIn && account.passkeys === null) void account.loadPasskeys();
  });

  // A seção troca de conteúdo ao entrar, sair ou apagar a conta, e o botão que tinha o foco (ou que abriu o diálogo) some com ela. Depois
  // da troca, com nenhum diálogo aberto, o foco que caiu no <body> vai para o primeiro controle da seção (spec 9.6): "Entrar ou criar
  // conta", ao sair. Um foco que está em outro lugar fica onde está.
  let shownSignedIn: boolean | undefined;
  let refocus = $state(false);
  $effect(() => {
    const signedIn = account?.signedIn;
    if (shownSignedIn !== undefined && signedIn !== shownSignedIn) refocus = true;
    shownSignedIn = signedIn;
  });
  $effect(() => {
    if (!refocus || app.dialog !== null) return;
    refocus = false;
    void tick().then(() => {
      const active = document.activeElement;
      if (active !== null && active !== document.body && active.isConnected) return;
      sectionEl?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    });
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
  <fieldset class="account" data-slot="conta" bind:this={sectionEl}>
    <legend>{T.conta.title}</legend>
    {#if !account.signedIn}
      <div class="setting">
        {@render caption(T.conta.pitch)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.signIn}</button>
      </div>
    {:else}
      <div class="setting">
        <span>{account.sync.email}<small data-sync-line data-fresh={fresh ? 'true' : undefined}>{syncLine(account.status, now)}</small></span>
        {#if account.status.error === 'auth'}
          <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.signInAgain}</button>
        {:else}
          <button type="button" class="btn" disabled={account.status.phase === 'syncing'} onclick={syncNow}
            ><LiveCube state={cube} size="sm" />{T.conta.syncNow}</button
          >
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
        {@render caption(T.conta.cloud, T.conta.cloudHint)}
        <button type="button" class="btn" onclick={() => (app.dialog = 'cloud')}>{T.conta.cloudView}</button>
      </div>

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
      <div class="setting">
        {@render caption(T.conta.deleteAccount, T.conta.deleteAccountHint)}
        <button type="button" class="btn danger" onclick={() => (app.dialog = 'deleteAccount')}>{T.conta.deleteAccount}</button>
      </div>
    {/if}
  </fieldset>
{/if}

<SignOutDialog {app} open={app.dialog === 'signout'} />
<CloudCopiesDialog {app} open={app.dialog === 'cloud'} />
<DeleteAccountDialog {app} open={app.dialog === 'deleteAccount'} />
