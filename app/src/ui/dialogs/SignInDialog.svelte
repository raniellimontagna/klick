<script lang="ts">
  // Entrar ou criar conta (spec 7.2 e 9.2), na folha dos outros diálogos: e-mail, código, passkey e o primeiro sync. Num aparelho com
  // passkey, ela vem primeiro, com o código como alternativa. Depois do código, se o aparelho tem dados de outra conta, a pergunta da
  // spec 7.6 entra antes da passkey. O último passo segue o estado da conta (signInSync), não a promessa: numa aba que não lidera, o
  // pedido resolve antes de a líder fazer o trabalho, e um primeiro login cancelado (sair noutra aba) não pode dizer "Pronto".
  // O visual (spec 2026-10-17, seção 5): o cubo vivo conta cada passo, e o código aparece em seis peças por cima de um campo só.
  import { tick, untrack } from 'svelte';
  import { T } from '../../strings';
  import type { SyncStatus } from '../../sync/engine';
  import LiveCube from '../LiveCube.svelte';
  import { type CubeState, firstSyncCube, motionReduced } from '../live-cube';
  import type { SignInNext, VerifyOutcome } from '../state/account.svelte';
  import type { AppState } from '../state/app.svelte';
  import { syncLine } from '../sync-status';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  type Step = 'email' | 'code' | 'other' | 'passkey' | 'sync';
  type Mode = 'join' | 'erase' | 'resume';
  const STEP_NUMBER: Record<Step, number> = { email: 1, code: 2, other: 2, passkey: 3, sync: 4 };
  const CODE_PIECES = [0, 1, 2, 3, 4, 5];
  // O código certo: as peças viram verdes em cascata (o CSS de .code-piece, ~300 ms) e só então o passo segue (decisão 3 da spec visual).
  const CODE_OK_MS = 330;

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
  let codeCube = $state<CubeState>('wave'); // o cubo do passo 2: a onda do código que acabou de sair, girando enquanto confere
  let codeOk = $state(false); // o código certo, durante a cascata verde
  // Cada abertura e cada fechamento começam uma vez nova: a resposta de continueSignIn que chega depois de fechar (ou de reabrir) não mexe
  // na tela, só desfaz a entrada que não continuou.
  let round = 0;
  const webauthn = typeof PublicKeyCredential !== 'undefined';

  const progress = $derived(requested ? (account?.signInSync ?? null) : null);
  // As peças do código: verdes no certo; vermelhas (e o tremor) só no código errado, enquanto o aviso dele está na tela, menos durante uma
  // nova conferência, para o tremor tocar de novo se ela também falhar; digitar limpa esse aviso (decisão 4). Vencido, tentativas demais e
  // falha de rede mostram o aviso de hoje, sem o vermelho: não é o código digitado que está errado.
  const codeState = $derived<'typing' | 'ok' | 'bad'>(codeOk ? 'ok' : error === T.conta.badCode && !busy ? 'bad' : 'typing');

  // Só a abertura zera o diálogo: o estado da conta muda no meio do fluxo (e o reset o lê), sem voltar ao passo 1.
  $effect(() => {
    if (open) untrack(reset);
  });

  function reset(): void {
    round += 1;
    step = 'email';
    email = account?.sync.email ?? '';
    code = '';
    error = null;
    busy = false;
    mode = 'join';
    joining = 0;
    requested = false;
    codeOk = false;
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
    round += 1; // o passo 4 que esperava continueSignIn: a resposta, se não continuar, só desfaz a entrada (startSync)
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
        codeOk = false;
        codeCube = 'wave'; // o passo do código nasce de novo a cada envio: a onda toca outra vez
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
    // Só o código errado sai ao digitar (as peças voltam do vermelho na hora); vencido, tentativas demais e a falha ficam até pedir outro
    // código ou tentar de novo.
    if (error === T.conta.badCode) error = null;
  }

  // As peças não levam o toque a uma posição: o cursor fica sempre no fim, e o Backspace sempre tira o último dígito. Só mexe quando está
  // fora do fim (mover a seleção dispara "select" de novo, e isso não pode virar um laço). A seleção do valor todo (Ctrl+A) fica como está:
  // é como a pessoa troca o código errado, digitando ou colando por cima.
  function caretToEnd(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const end = input.value.length;
    if (end > 0 && input.selectionStart === 0 && input.selectionEnd === end) return;
    if (input.selectionStart !== end || input.selectionEnd !== end) input.setSelectionRange(end, end);
  }

  // Um código inteiro colado (6 dígitos ou mais, com texto em volta ou não) vira o código, por cima do que havia: o colar do navegador
  // entraria no fim e o corte de 6 dígitos jogaria fora o que veio. Menos de 6 dígitos seguem o colar de sempre, que o oninput limpa.
  function onPaste(e: ClipboardEvent): void {
    const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    if (digits.length < 6) return;
    e.preventDefault();
    code = digits.slice(0, 6);
    (e.currentTarget as HTMLInputElement).value = code;
    if (error === T.conta.badCode) error = null;
  }

  async function verify(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!account || busy || code.length !== 6) return;
    const ongoing = account;
    busy = true;
    error = null; // o aviso da conferência anterior sai: não fica ao lado de "Conferindo…" nem da cascata verde, e uma falha igual volta anunciada
    codeCube = 'turn'; // e a linha "Conferindo o código…" ao lado dele
    let result: VerifyOutcome;
    try {
      result = await ongoing.verifyCode(email, code);
    } catch {
      result = { ok: false, reason: 'failed' }; // o banco falhou ao ler a conta deste aparelho
    }
    codeCube = 'idle';
    // Os botões seguem desabilitados durante a cascata; com menos movimento, não há cascata nem espera.
    if (result.ok && !motionReduced()) {
      codeOk = true;
      const mine = round;
      await new Promise((resolve) => setTimeout(resolve, CODE_OK_MS));
      if (mine !== round) {
        // Fechado (ou fechado e reaberto) durante a cascata: a vez nova não avança. Com dados de outra conta, desiste, como fechar na
        // pergunta dela (spec 7.6): o aparelho não fica fora da conta de antes com a sessão nova aberta. No primeiro login e na volta, só
        // para, como fechar no passo do código.
        if (result.next === 'other-account') void ongoing.cancelSignIn();
        return;
      }
    }
    busy = false;
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
      const onlyHere = await account.localOnly();
      if (onlyHere > 0) {
        error = T.conta.localOnlyBlock(onlyHere);
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

  // A entrada que não continua (o modo recusado, o banco que falhou, ou o apagar recusado com o diálogo já fechado) é desfeita (spec 9.2):
  // sai da sessão nova, e a conta de antes volta como estava. Só o apagar recusado ('pending', 'local-only') com o diálogo aberto volta à
  // pergunta da outra conta, que ainda dá para responder.
  async function startSync(): Promise<void> {
    if (!account || busy) return;
    const ongoing = account;
    const mine = round;
    joining = mode === 'join' ? app.solves.length : 0;
    requested = false;
    busy = true;
    await go('sync');
    let result: 'ok' | 'pending' | 'local-only' | 'refused' | 'failed';
    try {
      result = await ongoing.continueSignIn(mode);
    } catch {
      result = 'failed'; // o banco falhou: nada mudou aqui
    } finally {
      if (mine === round) busy = false;
    }
    if (mine !== round) {
      if (result !== 'ok') await ongoing.cancelSignIn();
      return;
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
    if (result === 'local-only') {
      const onlyHere = await account.localOnly();
      await go('other');
      error = T.conta.localOnlyBlock(Math.max(onlyHere, 1));
      return;
    }
    await ongoing.cancelSignIn();
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
        <p class="muted"><a href="/privacidade/" target="_blank" rel="noopener">{T.conta.privacy}</a></p>
      {:else if step === 'code'}
        <div class="signin-status">
          <LiveCube state={codeCube} />
          <div>
            <p>{T.conta.codeIntro(email.trim())}</p>
            <!-- O lugar da linha fica guardado: aparecer e sumir não empurra o campo. Não é anunciada (spec 9.6). -->
            <p class="muted signin-checking" data-checking>{codeCube === 'turn' ? T.conta.checkingCode : ''}</p>
          </div>
        </div>
        <form onsubmit={verify}>
          <label class="field">
            <span>{T.conta.codeLabel}</span>
            <!-- Um campo só, real e transparente, por cima das peças: o toque, o colar e a sugestão do código do Mail são dele. -->
            <span class="code-field">
              <span class="code-pieces" data-code-pieces data-code-state={codeState} aria-hidden="true">
                {#each CODE_PIECES as i (i)}
                  <span
                    class="code-piece"
                    data-code-piece
                    data-filled={i < code.length ? '' : undefined}
                    data-next={i === code.length ? '' : undefined}
                    style:--i={i}>{code[i] ?? ''}</span>
                {/each}
              </span>
              <input type="text" inputmode="numeric" autocomplete="one-time-code" value={code} oninput={onCode} onpaste={onPaste} onfocus={caretToEnd} onclick={caretToEnd} onselect={caretToEnd} data-code />
            </span>
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
        <div class="signin-status">
          <LiveCube state="idle" />
          <p>{T.conta.passkeyText}</p>
        </div>
        <div class="row">
          <button type="button" class="btn primary" disabled={busy} onclick={createPasskey}>{T.conta.passkeyOffer}</button>
          <button type="button" class="btn" disabled={busy} onclick={startSync}>{T.conta.skip}</button>
        </div>
      {:else}
        {@const cube = firstSyncCube(progress, account.status)}
        <h3>{T.conta.syncTitle}</h3>
        {#if mode === 'resume'}
          <p>{T.conta.resuming}</p>
        {:else}
          <p data-joining>{T.conta.joining(joining)}</p>
          {#if joining > 0 && (progress === 'started' || progress === 'done')}<p class="muted">{T.conta.joinNote}</p>{/if}
        {/if}
        <div class="signin-status">
          <LiveCube state={cube.state} filled={cube.filled} />
          {#if progress === 'cancelled'}
            <p role="alert">{T.conta.syncCancelled}</p>
          {:else}
            <p class="muted" data-sync-line>{progress === 'done' ? T.conta.done : waitingLine(account.status)}</p>
          {/if}
        </div>
        {#if progress === 'cancelled'}
          <div class="row">
            <button type="button" class="btn primary" onclick={() => go('email')}>{T.conta.signInAgain}</button>
            <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
          </div>
        {:else}
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
