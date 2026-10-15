<script lang="ts">
  // A rodada do treino (spec do sub-projeto 4, seção 7.2). Montar: o embaralhamento do caso e a figura. Executar: o timer de sempre
  // (o mesmo espaço e os mesmos dois polegares), sem inspeção. Marcar: "Acertei" (o padrão, por Enter ou toque) e "Errei". O resultado
  // mostra o caso, o algoritmo, o tempo e a média do caso, e o próximo caso vem em seguida. A última tentativa pode ser corrigida até a
  // próxima rodada começar. Nada daqui vira solve: o núcleo do timer é reaproveitado, e a gravação é a do treino (app.addPractice).
  // No desktop, duas colunas como as do Timer: o caso e o tempo à esquerda; a última tentativa, a ajuda e a dica de teclado à direita.
  import { tick, untrack } from 'svelte';
  import { chosenAlg, figureOf } from '../../core/trail/cases';
  import { formatMs } from '../../core/stats';
  import { createTimer, type TimerResult, type TimerState } from '../../core/timer';
  import { invertAlg } from '../../core/trail/frame';
  import { createTouchArm } from '../../core/touch';
  import { byCase, caseScramble, caseStats, nextCase } from '../../core/trail/train';
  import type { CaseSet, TrainCase } from '../../core/trail/types';
  import { T } from '../../strings';
  import type { CentroView } from '../centro';
  import { wideLayout } from '../layout';
  import { createSound } from '../sound';
  import type { AppState } from '../state/app.svelte';
  import { createInputController } from '../timer/input';
  import { createTimeLoop, paintTime } from '../timer/TimeDisplay';
  import Zones from '../timer/Zones.svelte';
  import { createWakeLock } from '../wakelock';
  import CaseFigure from './CaseFigure.svelte';
  import MiniCentro from './MiniCentro.svelte';

  let { app, set, rng = Math.random }: { app: AppState; set: CaseSet; rng?: () => number } = $props();

  interface Last {
    id: string;
    caseId: string;
    name: string;
    alg: string;
    ms: number;
    ok: boolean;
    helped: boolean;
  }

  let current = $state.raw<TrainCase | null>(null);
  let alg = $state('');
  let scramble = $state('');
  let helped = $state(false);
  let phase = $state<'setup' | 'mark' | 'saving'>('setup');
  let resultMs = $state(0);
  let last = $state<Last | null>(null); // a última tentativa gravada; corrigível até a próxima rodada começar
  let canFix = $state(false);
  let centro = $state<CentroView>({ state: 'idle' });
  let screenEl = $state<HTMLElement>();
  let zonesEl = $state<HTMLElement>();
  let timeEl = $state<HTMLElement>();
  let helpEl = $state<HTMLElement>();
  let coarseMq = $state(false);
  let tstate = $state<TimerState>('idle'); // o estado do timer do treino: as cores do tempo vêm dele, não do body (que a tela do Timer pinta)
  let pageVisible = $state(true);
  let destroyed = false;
  const wide = wideLayout();
  const before = typeof document === 'undefined' ? undefined : document.body.dataset.tstate; // o que a tela do Timer tinha no body

  const timer = createTimer({ now: () => performance.now() });
  const sound = createSound();
  const touch = createTouchArm({
    // O toque só arma na montagem do caso (ou para o timer que corre): com o resultado na tela, ou sem caso no sorteio, ele não
    // arma por cima. O soltar que vem depois de um press barrado não faz nada (o timer parado ignora o release).
    press: (at) => {
      if (timer.state === 'running' || (phase === 'setup' && current)) timer.press(at);
    },
    release: (at) => timer.release(at),
    cancel: () => timer.cancel(),
    getState: () => timer.state,
    getInspection: () => false,
  });
  const loop = createTimeLoop(paint);
  const wake = createWakeLock(); // a tela acesa durante a rodada, como no Timer

  const avgOf = (caseId: string): number | null => caseStats(caseId, byCase(app.practice).get(caseId) ?? []).avg5;
  const lastAvg = $derived(last ? avgOf(last.caseId) : null);

  function paint(): boolean {
    if (destroyed) return false;
    timer.tick();
    const s = timer.state;
    const ms = s === 'running' ? timer.elapsed : s === 'done' ? (timer.result?.ms ?? resultMs) : 0;
    if (timeEl) paintTime(timeEl, formatMs(ms));
    return s === 'arming' || s === 'ready' || s === 'running';
  }

  // O próximo caso do sorteio (o mesmo nunca sai duas vezes seguidas), com um embaralhamento novo.
  function nextRound(): void {
    const c = nextCase({ set, practice: app.practice, off: app.profile.trainOff, last: current?.id ?? null, rng });
    current = c;
    alg = c ? chosenAlg(c, app.profile.algChoice) : '';
    scramble = c ? caseScramble(alg, rng) : '';
    helped = false;
    phase = 'setup';
    timer.reset();
    loop.kick();
  }

  // O foco caiu no body (ou em nada): o elemento que o tinha sumiu ou foi desligado.
  const isLost = (el: Element | null): boolean => el === null || el === document.body;

  // "Ver o algoritmo" antes de começar: a tentativa fica "com ajuda" e não sobe o nível.
  async function help(): Promise<void> {
    if (phase !== 'setup' || timer.state !== 'idle') return;
    // O botão some com a ajuda que abre: o foco vai para a ajuda (o algoritmo e a figura), não cai no body.
    const refocus = isLost(document.activeElement) || (screenEl?.contains(document.activeElement) ?? false);
    helped = true;
    if (refocus) {
      await tick();
      if (!destroyed) helpEl?.focus({ preventScroll: true });
    }
  }

  async function mark(ok: boolean): Promise<void> {
    const c = current;
    if (phase !== 'mark' || !c) return;
    phase = 'saving';
    const ms = resultMs;
    const best = caseStats(c.id, byCase(app.practice).get(c.id) ?? []).best;
    const saved = await app.addPractice({ caseId: c.id, ms, ok, helped, at: Date.now() });
    if (destroyed) return;
    if (!saved) {
      phase = 'mark'; // o aviso já saiu; o resultado continua na tela para marcar de novo
      // Os botões voltam a valer (desligados durante a gravação, o foco pode ter saído deles): o foco volta para "Acertei".
      await tick();
      if (isLost(document.activeElement)) screenEl?.querySelector<HTMLElement>('[data-marks] .primary')?.focus();
      return;
    }
    last = { id: saved.id, caseId: c.id, name: c.name, alg, ms, ok, helped };
    canFix = true;
    // O Centro reage sem texto (spec 7.5): olho entreaberto no erro, feliz (sem salto) quando bate o melhor tempo do caso.
    centro = !ok ? { state: 'reaction', result: 'plus2' } : !helped && best !== null && ms < best ? { state: 'reaction', result: 'pb' } : { state: 'idle' };
    app.announce(`${c.name}: ${T.trilha.round.outcome(ok, helped)}, ${formatMs(ms)}`);
    const refocus = isLost(document.activeElement) || (screenEl?.contains(document.activeElement) ?? false);
    nextRound();
    // Os botões de marcar somem com o caso seguinte: o foco vai para a rodada (como a tela do Timer quando uma ação some).
    if (refocus) {
      await tick();
      if (!destroyed) screenEl?.focus({ preventScroll: true });
    }
  }

  async function fix(ok: boolean): Promise<void> {
    if (!last || !canFix) return;
    if (await app.setPracticeOk(last.id, ok)) last = { ...last, ok };
  }

  async function remove(): Promise<void> {
    if (!last || !canFix) return;
    if (await app.deletePractice(last.id)) {
      // O cartão some com o botão: o foco vai para a rodada (como depois de marcar), não cai no body.
      const refocus = isLost(document.activeElement) || (screenEl?.contains(document.activeElement) ?? false);
      last = null;
      app.announce(T.trilha.round.removed);
      if (refocus) {
        await tick();
        if (!destroyed) screenEl?.focus({ preventScroll: true });
      }
    }
  }

  function onState(next: TimerState): void {
    if (destroyed) return;
    app.timerBusy = next === 'arming' || next === 'ready' || next === 'running';
    app.trainerRunning = next === 'running';
    tstate = next;
    document.body.dataset.tstate = next;
    document.body.classList.toggle('solving', next === 'running');
    if (next === 'ready') sound.klick();
    if (next === 'arming') centro = { state: 'idle' };
    if (next === 'running') canFix = false; // a próxima rodada começou: a anterior não se corrige mais
    loop.kick();
  }

  function onDone(r: TimerResult): void {
    if (destroyed) return;
    // O dedo que parou pode não mandar o soltar (a zona some com o resultado): o toque esquece o gesto, e o caso seguinte arma de novo.
    touch.cancelAll();
    sound.klick();
    resultMs = r.ms;
    phase = 'mark';
    app.announce(T.trilha.round.stopped(formatMs(r.ms)));
    loop.kick();
  }

  // Enter marca "Acertei" depois de parar. Num botão focado, o Enter é do botão (não marca as duas coisas); com um diálogo aberto, é dele.
  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || phase !== 'mark' || e.repeat) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    void mark(true);
  }

  $effect(() => {
    untrack(() => nextRound());
    const offs = [timer.on('state', onState), timer.on('done', onDone)];
    document.addEventListener('keydown', onKey);
    return () => {
      destroyed = true;
      offs.forEach((off) => off());
      document.removeEventListener('keydown', onKey);
      loop.stop();
      sound.close(); // um AudioContext por rodada aberta: o iOS limita quantos a página abre
      const body = document.body;
      body.classList.remove('solving');
      if (before === undefined) delete body.dataset.tstate;
      else body.dataset.tstate = before;
      app.timerBusy = false;
      app.trainerRunning = false;
    };
  });

  // O timer e o toque seguem os ajustes de sempre, sem inspeção (o caso já foi montado à vista).
  $effect(() => {
    const s = app.profile.settings;
    timer.setOptions({ holdMs: s.holdMs, inspection: false });
    touch.setMode(s.mobileArm);
    sound.setEnabled('klick', s.sound.klick);
  });

  // A entrada do Timer, ligada a esta tela: o espaço arma só na montagem do caso, e qualquer tecla para.
  $effect(() => {
    const screen = screenEl;
    const zones = zonesEl;
    if (!screen || !zones) return;
    const ctl = createInputController(
      {
        timer,
        touch,
        tabIsTimer: () => app.tab === 'trilha' && phase === 'setup' && current !== null,
        dialogOpen: () => document.querySelector('dialog[open]') !== null,
        onAction: () => {}, // os atalhos de letra e de aba são da tela do Timer, que também os ouve
        onWake: () => sound.unlock(),
      },
      { coarse: () => coarseMq, armMode: () => app.profile.settings.mobileArm },
    );
    const detach = ctl.attach(document, window, zones, screen);
    return () => {
      ctl.abandonHold();
      detach();
    };
  });

  // A tela acesa fica pedida enquanto a rodada está aberta e a página visível; sai ao esconder a página e ao sair da rodada.
  $effect(() => {
    void wake.want(app.tab === 'trilha' && pageVisible);
  });
  $effect(() => {
    return () => {
      void wake.want(false);
    };
  });
  $effect(() => {
    const sync = (): void => {
      pageVisible = !document.hidden;
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  });

  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const coarse = matchMedia('(pointer: coarse)');
    const sync = (): void => {
      coarseMq = coarse.matches;
    };
    sync();
    coarse.addEventListener('change', sync);
    return () => coarse.removeEventListener('change', sync);
  });
</script>

<!-- Ao lado do algoritmo, como segurar o caso para ele: o inverso dele, sem o giro de cima do embaralhamento. No desktop, um cartão na
     coluna da direita (que esmaece no solve, como o resto da tela); numa coluna só, dentro do caso. -->
{#snippet helpBox(c: TrainCase)}
  <div class="help" class:card={wide.current} class:fade={wide.current} tabindex="-1" bind:this={helpEl}>
    <p class="help-alg"><span class="chip">{T.trilha.round.helped}</span> <span class="mono" data-help-alg>{alg}</span></p>
    <CaseFigure small setup={invertAlg(alg)} {...figureOf(c)} />
  </div>
{/snippet}

{#snippet kbdHint()}
  <p class="muted fade kbd-hint">{T.trilha.round.hint}</p>
{/snippet}

{#snippet lastCard()}
  {#if last}
    <div class="card last fade" data-last-attempt>
      <div class="label">{T.trilha.round.last}</div>
      <p><strong>{last.name}</strong> · <span class="mono">{last.alg}</span></p>
      <p>{formatMs(last.ms)} · {T.trilha.round.outcome(last.ok, last.helped)} · {T.trilha.round.caseAvg(lastAvg === null ? null : formatMs(lastAvg))}</p>
      {#if canFix}
        <div class="fix">
          <button type="button" class="btn" onclick={() => fix(!last!.ok)}>{last.ok ? T.trilha.round.fixToMiss : T.trilha.round.fixToOk}</button>
          <button type="button" class="btn" onclick={remove}>{T.trilha.round.remove}</button>
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<div class="round" class:wide={wide.current} data-round={set} data-tstate={tstate} tabindex="-1" bind:this={screenEl}>
  <header class="round-top fade">
    <MiniCentro {app} view={centro} />
    <h2>{T.trilha.sets[set]}</h2>
    <button type="button" class="link" onclick={() => app.openTrail({ kind: 'set', set })}>{T.trilha.round.end}</button>
  </header>

  <!-- O caso e o tempo: no desktop, a coluna da esquerda; numa coluna só, o invólucro não tem caixa. -->
  <div class="round-main">
    {#if current}
      <div class="case fade">
        <CaseFigure setup={scramble} {...figureOf(current)} />
        <div class="case-text">
          <div class="case-head">
            <div class="label">{T.trilha.round.setup}</div>
            <p class="scramble" data-train-scramble>{scramble}</p>
          </div>
          <p class="muted hint">{T.trilha.round.setupHint}</p>
          {#if helped}
            {#if !wide.current}
              {@render helpBox(current)}
            {/if}
          {:else if phase === 'setup'}
            <button type="button" class="btn help-btn" onclick={help}>{T.trilha.round.help}</button>
          {/if}
        </div>
      </div>

      <!-- Classe própria, não a .time do Timer: as regras dele (o recorde, a inspeção, a ordem e o tamanho no celular) não pegam aqui. -->
      <div class="train-time" data-time aria-hidden="true" bind:this={timeEl}></div>

      {#if phase !== 'setup'}
        <div class="marks" data-marks>
          <button type="button" class="btn primary" disabled={phase === 'saving'} onclick={() => mark(true)}>{T.trilha.round.ok}</button>
          <button type="button" class="btn" disabled={phase === 'saving'} onclick={() => mark(false)}>{T.trilha.round.miss}</button>
        </div>
      {:else if !wide.current}
        {@render kbdHint()}
      {/if}
    {:else}
      <p data-round-empty>{T.trilha.round.empty}</p>
    {/if}
  </div>

  <!-- No desktop, a coluna da direita, depois da da esquerda no DOM: a última tentativa, a ajuda e a dica de teclado. -->
  {#if wide.current}
    <div class="round-side">
      {@render lastCard()}
      {#if current && helped}
        {@render helpBox(current)}
      {/if}
      {#if current && phase === 'setup'}
        {@render kbdHint()}
      {/if}
    </div>
  {/if}

  <!-- O invólucro fica sempre: a entrada (teclado, parar com um toque, engolir o clique que vem depois) segue ligada nele. As zonas só
       existem enquanto o caso pode ser armado (a montagem, com um caso, e a execução, que nasce dela); sem elas o toque não arma. -->
  <div class="zones-host" bind:this={zonesEl}>
    {#if phase === 'setup' && current}
      <Zones one={app.profile.settings.mobileArm === 'one'} />
    {/if}
  </div>

  <!-- Numa coluna só, a última tentativa vem depois das zonas: no celular, em cima delas, ela empurrava as zonas para trás da barra de
       abas. -->
  {#if !wide.current}
    {@render lastCard()}
  {/if}
</div>

<style>
  .round {
    display: grid;
    gap: 14px;
    max-width: 640px;
  }

  /* A rodada recebe o foco quando os botões de marcar somem: ele continua visível, com o contorno dos controles. */
  .round:focus {
    outline: none;
  }

  .round:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 4px;
  }

  .round-top {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .round-top h2 {
    flex: 1;
    margin: 0;
    font-size: 20px;
  }

  .case {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }

  /* O texto cresce ao lado da figura quando cabe; sem a base, ele ia sempre para baixo dela. */
  .case-text {
    flex: 1 1 240px;
    min-width: 0;
  }

  /* O tempo do treino: o tamanho do Timer no desktop, e as cores do armar e do pronto pelo estado do próprio treino. */
  .train-time {
    margin: 14px 0 14px -0.04em;
    font-weight: 600;
    font-size: clamp(96px, 15vw, 220px);
    line-height: 1;
    letter-spacing: -0.05em;
    font-variant-numeric: tabular-nums;
    transition: color var(--t-state) var(--ease);
  }

  .train-time :global(.dec) {
    font-size: 0.6em;
    letter-spacing: -0.02em;
    color: var(--dec);
    transition: color var(--t-state) var(--ease);
  }

  .round[data-tstate='arming'] .train-time,
  .round[data-tstate='arming'] .train-time :global(.dec) {
    color: var(--arm);
  }

  .round[data-tstate='ready'] .train-time,
  .round[data-tstate='ready'] .train-time :global(.dec) {
    color: var(--go);
  }

  .scramble {
    margin: 4px 0 0;
    font-family: var(--mono);
    font-size: 20px;
  }

  .hint,
  .help-alg {
    margin: 6px 0;
    font-size: 13px;
  }

  .help {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 12px;
  }

  /* A ajuda recebe o foco quando o botão que a abre some: o contorno dos controles, só pelo teclado (como o da rodada). */
  .help:focus {
    outline: none;
  }

  .help:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 4px;
  }

  .mono {
    font-family: var(--mono);
  }

  /* As zonas ficam no fluxo da rodada (uma linha da grade, na largura toda). A área nomeada e a ordem que o Timer dá a elas no celular
     não valem aqui: a área criava uma segunda coluna e empurrava a zona da direita para fora da tela. */
  .zones-host {
    display: contents;
  }

  .zones-host :global(.zones) {
    grid-area: auto;
    order: 0;
  }

  .round-main {
    display: contents;
  }

  /* No desktop (a quebra do Timer), as colunas do Timer: a da esquerda com o caso, o tempo e as marcas; a da direita na largura da dele.
     O cabeçalho fica em cima e as zonas (que só aparecem com o dedo) embaixo, na largura toda. */
  .round.wide {
    max-width: none;
    grid-template-columns: minmax(0, 1fr) var(--side-w);
    grid-template-areas:
      'top top'
      'main side';
    column-gap: var(--cols-gap);
    align-items: start;
  }

  .wide .round-top {
    grid-area: top;
  }

  .wide .round-main {
    grid-area: main;
    display: grid;
    gap: 14px;
  }

  .round-side {
    grid-area: side;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .wide .zones-host :global(.zones) {
    grid-column: 1 / -1;
  }

  /* O algoritmo da ajuda divide a linha com a figura pequena, no cartão da coluna da direita. */
  .round-side .help-alg {
    flex: 1 1 0;
    min-width: 0;
  }

  .round-side .kbd-hint {
    font-size: 13px;
  }

  /* Com o dedo, a dica de teclado não serve (como as teclas dos botões). */
  @media (pointer: coarse) {
    .kbd-hint {
      display: none;
    }
  }

  /* No celular a rodada fica compacta, para as zonas de polegar caberem inteiras acima da barra de abas (que é fixa: um polegar na parte
     escondida cairia numa aba). A figura encolhe e fica ao lado do rótulo e do embaralhamento; a dica e o botão de ajuda ocupam a
     largura toda embaixo; com a ajuda aberta, o algoritmo divide a linha com a figura pequena. */
  @media (max-width: 639px) {
    .round {
      gap: 10px;
    }

    .case {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0 12px;
    }

    .case-text {
      display: contents;
    }

    .case-head {
      grid-column: 2;
      grid-row: 1;
    }

    .hint,
    .help,
    .help-btn {
      grid-column: 1 / -1;
    }

    .help-btn {
      justify-self: start;
    }

    .help-alg {
      flex: 1 1 0;
      min-width: 0;
    }

    .case :global(.case-fig:not(.small)) {
      width: 128px;
      height: 96px;
    }

    .case :global(.case-fig.top:not(.small)) {
      width: 104px;
      height: 104px;
    }

    .scramble {
      font-size: 18px;
    }

    .train-time {
      margin: 0;
      font-size: 18vw;
    }
  }

  .marks,
  .fix {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .last p {
    margin: 4px 0 0;
  }

  .fix {
    margin-top: 8px;
  }
</style>
