<script lang="ts">
  // Entrar ou criar conta (spec 7.2 e 9.2), na folha dos outros diálogos: e-mail, código, passkey e o primeiro sync. Num aparelho com
  // passkey, ela vem primeiro, com o código como alternativa. Depois do código, se o aparelho tem dados de outra conta, a pergunta da
  // spec 7.6 entra antes da passkey. O último passo segue o estado da conta (signInSync), não a promessa: numa aba que não lidera, o
  // pedido resolve antes de a líder fazer o trabalho, e um primeiro login cancelado (sair noutra aba) não pode dizer "Pronto".
  import { tick, untrack } from 'svelte';
  import { T } from '../../strings';
  import type { SyncStatus } from '../../sync/engine';
  import type { SignInNext, VerifyOutcome } from '../state/account.svelte';
  import type { AppState } from '../state/app.svelte';
  import { syncLine } from '../sync-status';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  type Step = 'email' | 'code' | 'other' | 'passkey' | 'sync';
  type Mode = 'join' | 'erase' | 'resume';
  const STEP_NUMBER: Record<Step, number> = { email: 1, code: 2, other: 2, passkey: 3, sync: 4 };

  const account = $derived(app.account);
  let dialogEl = $state<HTMLDialogElement>();
  let bodyEl = $state<HTMLElement>();
  let captchaHost = $state<HTMLElement>();
  let step = $state<Step>('email');
  let email = $state('');
  let code = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  let mode = $state<Mode>('join');
  let joining = $state(0); // solves deste aparelho que sobem (o aviso da spec 6.5)
  let requested = $state(false); // continueSignIn pediu o sync: daqui em diante, o passo 4 lê signInSync
  const webauthn = typeof PublicKeyCredential !== 'undefined';

  const progress = $derived(requested ? (account?.signInSync ?? null) : null);

  // Só a abertura zera o diálogo: o estado da conta muda no meio do fluxo (e o reset o lê), sem voltar ao passo 1.
  $effect(() => {
    if (open) untrack(reset);
  });

  function reset(): void {
    step = 'email';
    email = account?.sync.email ?? '';
    code = '';
    error = null;
    busy = false;
    mode = 'join';
    joining = 0;
    requested = false;
  }

  // Cada passo novo leva o foco ao primeiro controle dele (spec 9.6).
  async function go(next: Step): Promise<void> {
    step = next;
    error = null;
    await tick();
    bodyEl?.querySelector<HTMLElement>('input, button')?.focus();
  }

  function onclose(): void {
    // Fechar na pergunta da outra conta é desistir (spec 7.6): a sessão nova sai. Na oferta da passkey é pular: a escolha já foi feita, e a
    // pessoa não fica com a sessão aberta e o aparelho fora da conta.
    if (step === 'other') void account?.cancelSignIn();
    else if (step === 'passkey' && account && !busy) {
      // (Com a passkey sendo criada, createPasskey segue para o sync sozinho.) Sem como continuar (mudanças esperando, o banco), desiste.
      const ongoing = account;
      void ongoing
        .continueSignIn(mode)
        .catch(() => 'failed' as const)
        .then((r) => (r === 'ok' ? undefined : ongoing.cancelSignIn()));
    }
    step = 'email';
    if (app.dialog === 'signin') app.dialog = null;
  }

  async function send(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!account || busy || !captchaHost) return;
    busy = true;
    try {
      const result = await account.sendCode(email, captchaHost);
      if (result === 'sent') {
        code = '';
        await go('code');
      } else error = result === 'limited' ? T.conta.limited : result === 'captcha' ? T.conta.captchaFailed : T.conta.sendFailed;
    } finally {
      busy = false;
    }
  }

  // Colar "123 456" ou "Seu código: 123456" funciona: só os dígitos ficam (sem maxlength no campo, que cortaria a colagem antes).
  function onCode(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    code = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = code;
  }

  async function verify(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!account || busy || code.length !== 6) return;
    busy = true;
    let result: VerifyOutcome;
    try {
      result = await account.verifyCode(email, code);
    } catch {
      result = { ok: false, reason: 'failed' }; // o banco falhou ao ler a conta deste aparelho
    } finally {
      busy = false;
    }
    if (result.ok) await after(result.next);
    else error = { 'bad-code': T.conta.badCode, expired: T.conta.expiredCode, 'too-many': T.conta.tooMany, failed: T.conta.verifyFailed }[result.reason];
  }

  async function withPasskey(): Promise<void> {
    if (!account || busy) return;
    busy = true;
    let next: SignInNext | null;
    try {
      next = await account.passkeySignIn();
    } finally {
      busy = false;
    }
    if (next) await after(next);
    else error = T.conta.passkeyFirstFailed;
  }

  async function after(next: SignInNext): Promise<void> {
    if (next === 'other-account') return go('other');
    mode = next === 'resume' ? 'resume' : 'join';
    return offerPasskey();
  }

  async function chooseOther(choice: 'join' | 'erase'): Promise<void> {
    if (!account || busy) return;
    if (choice === 'erase') {
      const waiting = await account.pending();
      if (waiting > 0) {
        error = T.conta.pendingBlock(waiting);
        return;
      }
    }
    mode = choice;
    await offerPasskey();
  }

  async function cancelOther(): Promise<void> {
    if (!account) return;
    step = 'email'; // fechar daqui não desiste de novo
    await account.cancelSignIn();
    dialogEl?.close();
  }

  async function offerPasskey(): Promise<void> {
    if (webauthn && !account?.sync.passkey) return go('passkey');
    return startSync();
  }

  async function createPasskey(): Promise<void> {
    if (!account || busy) return;
    busy = true;
    try {
      if (!(await account.addPasskey())) app.showToast(T.conta.passkeyFailed);
    } finally {
      busy = false;
    }
    await startSync();
  }

  async function startSync(): Promise<void> {
    if (!account || busy) return;
    joining = mode === 'join' ? app.solves.length : 0;
    requested = false;
    busy = true;
    await go('sync');
    let result: 'ok' | 'pending' | 'refused' | 'failed';
    try {
      result = await account.continueSignIn(mode);
    } catch {
      result = 'failed'; // o banco falhou: nada mudou aqui
    } finally {
      busy = false;
    }
    if (result === 'ok') {
      requested = true;
      return;
    }
    if (result === 'pending') {
      // Uma gravação entre a conferência e o apagar (decisão 12): de volta à pergunta, com o aviso.
      const waiting = await account.pending();
      await go('other');
      error = T.conta.pendingBlock(Math.max(waiting, 1));
      return;
    }
    await go('email');
    error = T.conta.verifyFailed;
  }

  // Enquanto o primeiro sync não termina: o progresso, a falta de rede ou o erro (com a nova tentativa); antes da primeira rodada, "Sincronizando…".
  function waitingLine(s: SyncStatus): string {
    return s.phase === 'syncing' || s.phase === 'offline' || s.phase === 'error' ? syncLine(s, Date.now()) : T.conta.syncing;
  }
</script>

<dialog bind:this={dialogEl} class="sheet signin" aria-label={T.conta.signInTitle} use:modal={{ open, onclose }}>
  {#if open && account}
    <h2>{T.conta.signInTitle} <small class="muted">{T.conta.stepOf(STEP_NUMBER[step])}</small></h2>
    <div bind:this={bodyEl} data-signin-step={step}>
      {#if step === 'email'}
        {#if account.sync.passkey && webauthn}
          <div class="row">
            <button type="button" class="btn primary" disabled={busy} onclick={withPasskey}>{T.conta.passkeyFirst}</button>
          </div>
          <p class="muted">{T.conta.orCode}</p>
        {:else}
          <p>{T.conta.emailIntro}</p>
        {/if}
        <form onsubmit={send}>
          <label class="field">
            <span>{T.conta.emailLabel}</span>
            <input type="email" required autocomplete="email webauthn" bind:value={email} />
          </label>
          <div data-turnstile bind:this={captchaHost}></div>
          <div class="row">
            <button type="submit" class="btn primary" disabled={busy}>{busy ? T.conta.sending2 : T.conta.sendCode}</button>
          </div>
        </form>
        <p class="muted"><a href="/privacidade" target="_blank" rel="noopener">{T.conta.privacy}</a></p>
      {:else if step === 'code'}
        <p>{T.conta.codeIntro(email.trim())}</p>
        <form onsubmit={verify}>
          <label class="field">
            <span>{T.conta.codeLabel}</span>
            <input type="text" inputmode="numeric" autocomplete="one-time-code" value={code} oninput={onCode} data-code />
          </label>
          <div class="row">
            <button type="submit" class="btn primary" disabled={busy || code.length !== 6}>{T.conta.enter}</button>
            <button type="button" class="btn" disabled={busy} onclick={() => go('email')}>{T.conta.resend}</button>
          </div>
        </form>
      {:else if step === 'other'}
        <h3>{T.conta.otherTitle}</h3>
        <p>{T.conta.otherText}</p>
        <div class="stack">
          <button type="button" class="btn" disabled={busy} onclick={() => chooseOther('join')}>{T.conta.otherJoin}</button>
          <button type="button" class="btn danger" disabled={busy} onclick={() => chooseOther('erase')}>{T.conta.otherErase}</button>
          <button type="button" class="btn" disabled={busy} onclick={cancelOther}>{T.conta.cancel}</button>
        </div>
      {:else if step === 'passkey'}
        <h3>{T.conta.passkeyTitle}</h3>
        <p>{T.conta.passkeyText}</p>
        <div class="row">
          <button type="button" class="btn primary" disabled={busy} onclick={createPasskey}>{T.conta.passkeyOffer}</button>
          <button type="button" class="btn" disabled={busy} onclick={startSync}>{T.conta.skip}</button>
        </div>
      {:else}
        <h3>{T.conta.syncTitle}</h3>
        {#if mode === 'resume'}
          <p>{T.conta.resuming}</p>
        {:else}
          <p data-joining>{T.conta.joining(joining)}</p>
          {#if joining > 0 && (progress === 'started' || progress === 'done')}<p class="muted">{T.conta.joinNote}</p>{/if}
        {/if}
        {#if progress === 'cancelled'}
          <p role="alert">{T.conta.syncCancelled}</p>
          <div class="row">
            <button type="button" class="btn primary" onclick={() => go('email')}>{T.conta.signInAgain}</button>
            <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
          </div>
        {:else}
          <p class="muted" data-sync-line>{progress === 'done' ? T.conta.done : waitingLine(account.status)}</p>
          {#if progress !== 'done'}<p class="muted">{T.conta.keepsGoing}</p>{/if}
          <div class="row">
            <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
          </div>
        {/if}
      {/if}
      {#if error}
        <p role="alert">{error}</p>
      {/if}
    </div>
  {/if}
</dialog>
