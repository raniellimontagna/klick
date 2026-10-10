<script lang="ts">
  // A primeira vez: o tour do protótipo, em três passos. No passo 2 a pessoa segura (espaço ou o botão) até o anel ficar verde e solta;
  // Continuar só libera depois disso (skipPractice libera de cara, para os testes). Pular apresentação vai ao último passo, que oferece
  // importar (do csTimer ou da versão anterior) ou começar do zero. Não há dados de exemplo. Fechar por qualquer caminho grava que a
  // primeira vez já passou (profile.onboarded), e o tour não volta sozinho.
  import { tick, untrack } from 'svelte';
  import { type CentroTheme, type Eyes, eyesFor, type Ring, renderCentro, ringFor, updateCentro } from '../centro';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open, skipPractice = false }: { app: AppState; open: boolean; skipPractice?: boolean } = $props();

  // O Centro de cada passo, como no protótipo: o anel e os olhos do passo, e os marcos acesos no último.
  const STEP_CENTRO: readonly { ring: Ring; eyes: Eyes; topLit: number }[] = [
    { ring: [null, null, 'idle', null, null, null, null, null], eyes: 'open', topLit: 0 },
    { ring: Array<null>(8).fill(null), eyes: 'open', topLit: 0 },
    { ring: ['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F'], eyes: 'happy', topLit: 1 },
  ];

  let dialogEl = $state<HTMLDialogElement>();
  let boxEl = $state<HTMLElement>();
  let step = $state(1);
  let practiced = $state(false); // já segurou até o verde e soltou
  let pressing = $state(false); // o segurar está ativo agora
  let ready = $state(false); // o segurar chegou ao verde (ainda não soltou)
  let pressAt = 0; // quando o segurar começou (performance.now); não é reativo
  let raf = 0;

  // O tema do Centro: o do ajuste, ou o do sistema quando o ajuste é "Sistema".
  const systemDark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  let darkNow = $state(systemDark?.matches ?? false);
  $effect(() => {
    const mq = systemDark;
    if (!mq) return;
    const sync = (): void => {
      darkNow = mq.matches;
    };
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
  const theme = $derived<CentroTheme>(
    app.profile.settings.theme === 'system' ? (darkNow ? 'dark' : 'light') : app.profile.settings.theme === 'dark' ? 'dark' : 'light',
  );

  const current = $derived(T.onboarding.steps[step - 1]);
  // O markup do Centro muda só com o passo e o tema; o anel e os olhos do segurar mudam pelo DOM (updateCentro), sem refazer o SVG.
  const centroMarkup = $derived(renderCentro({ theme, ...STEP_CENTRO[step - 1], label: T.centro.label }));
  const holdClass = $derived(ready ? 'ready' : pressing ? 'arming' : practiced ? 'ready' : '');
  const holdLabel = $derived(practiced ? T.onboarding.holdDone : ready ? T.onboarding.holdReady : T.onboarding.holdIdle);

  function paint(state: 'idle' | 'arming' | 'ready' | 'reaction', extra: { progress?: number; result?: 'good' } = {}): void {
    const svg = boxEl?.querySelector('svg') ?? null;
    if (state === 'reaction') {
      updateCentro(svg, { theme, ring: ringFor({ state: 'reaction', result: extra.result }), eyes: eyesFor({ state: 'reaction', result: extra.result }) });
      return;
    }
    updateCentro(svg, { theme, ring: ringFor({ state, armProgress: extra.progress ?? 0 }), eyes: eyesFor({ state }) });
  }

  // O segurar chega ao verde quando passa de holdMs (0 vale já). Ao chegar, o anel fica verde até soltar.
  function frame(): void {
    const holdMs = app.profile.settings.holdMs;
    const progress = holdMs <= 0 ? 1 : Math.min(1, (performance.now() - pressAt) / holdMs);
    if (progress >= 1) {
      ready = true;
      paint('ready');
      return;
    }
    paint('arming', { progress });
    raf = requestAnimationFrame(frame);
  }

  function holdDown(): void {
    if (step !== 2 || pressing) return;
    pressing = true;
    ready = false;
    pressAt = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // Soltar: se chegou ao verde, o passo está praticado (e o reflexo de acerto sai no Centro); se não, volta ao repouso.
  function holdUp(): void {
    if (!pressing) return;
    cancelAnimationFrame(raf);
    pressing = false;
    if (ready) {
      ready = false;
      practiced = true;
      paint('reaction', { result: 'good' });
    } else {
      paint('idle');
    }
  }

  // Espaço segura no passo 2, fora dos outros botões (que continuam ativando com espaço). Fica no document: o foco pode cair no corpo.
  function isHoldKey(e: KeyboardEvent): boolean {
    return e.code === 'Space' && step === 2 && !(e.target instanceof Element && e.target.closest('button:not([data-hold]), input, select, textarea, a'));
  }
  function onKeyDown(e: KeyboardEvent): void {
    if (!isHoldKey(e)) return;
    e.preventDefault();
    if (!e.repeat) holdDown();
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.code !== 'Space' || !pressing) return;
    e.preventDefault();
    holdUp();
  }

  // Foco no que se usa a seguir: o botão de segurar no passo 2, a ação principal nos outros.
  function focusStep(): void {
    if (!open) return;
    const target = step === 2 ? dialogEl?.querySelector<HTMLElement>('[data-hold]') : dialogEl?.querySelector<HTMLElement>('.actions .primary');
    target?.focus();
  }

  async function goTo(next: number): Promise<void> {
    cancelAnimationFrame(raf);
    pressing = false;
    ready = false;
    step = next;
    await tick();
    focusStep();
  }

  // Cada abertura começa do passo 1, sem o que já foi praticado; os atalhos do document existem só enquanto o tour está aberto.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      step = 1;
      practiced = false;
      pressing = false;
      ready = false;
    });
    void tick().then(focusStep);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      cancelAnimationFrame(raf);
    };
  });

  // Fechou por qualquer caminho (Esc, o fundo, ou uma das opções do fim): a primeira vez passou. Só libera app.dialog se ainda for este.
  function onclose(): void {
    cancelAnimationFrame(raf);
    if (app.dialog === 'onboarding') app.dialog = null;
    void app.finishOnboarding();
  }

  function close(): void {
    dialogEl?.close();
  }

  function importCsTimer(): void {
    close();
    app.requestDataAction('importFile');
  }

  function importV1(): void {
    close();
    app.requestDataAction('importV1');
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.onboarding.title} use:modal={{ open, onclose }}>
  {#if open}
    <div class="onb">
      <div class="label">{T.onboarding.stepOf(step)}</div>
      <div class="centro-box" bind:this={boxEl}>{@html centroMarkup}</div>
      <h2>{current.title}</h2>
      <p>{current.text}</p>
      {#if step === 2}
        <button
          type="button"
          class="hold {holdClass}"
          data-hold
          onpointerdown={(e) => {
            e.preventDefault();
            holdDown();
          }}
          onpointerup={holdUp}
          onpointercancel={holdUp}>{holdLabel}</button
        >
      {/if}
      {#if step === 3}
        <p>{T.onboarding.end}</p>
      {/if}
      <div class="actions">
        {#if step === 1}
          <button type="button" class="btn" onclick={() => goTo(3)}>{T.onboarding.skip}</button>
          <button type="button" class="btn primary" onclick={() => goTo(2)}>{T.onboarding.next}</button>
        {:else if step === 2}
          <button type="button" class="btn" onclick={() => goTo(1)}>{T.onboarding.back}</button>
          <button type="button" class="btn" onclick={() => goTo(3)}>{T.onboarding.skip}</button>
          <button type="button" class="btn primary" disabled={!practiced && !skipPractice} onclick={() => goTo(3)}>{T.onboarding.next}</button>
        {:else}
          <button type="button" class="btn" onclick={importCsTimer}>{T.onboarding.importCsTimer}</button>
          {#if app.v1Available}
            <button type="button" class="btn" onclick={importV1}>{T.onboarding.importV1}</button>
          {/if}
          <button type="button" class="btn primary" onclick={close}>{T.onboarding.fresh}</button>
        {/if}
      </div>
    </div>
  {/if}
</dialog>
