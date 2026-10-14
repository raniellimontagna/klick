<script lang="ts">
  // A rodada do treino (spec do sub-projeto 4, seção 7.2). Montar: o embaralhamento do caso e a figura. Executar: o timer de sempre
  // (o mesmo espaço e os mesmos dois polegares), sem inspeção. Marcar: "Acertei" (o padrão, por Enter ou toque) e "Errei". O resultado
  // mostra o caso, o algoritmo, o tempo e a média do caso, e o próximo caso vem em seguida. A última tentativa pode ser corrigida até a
  // próxima rodada começar. Nada daqui vira solve: o núcleo do timer é reaproveitado, e a gravação é a do treino (app.addPractice).
  import { untrack } from 'svelte';
  import { chosenAlg } from '../../core/trail/cases';
  import { formatMs } from '../../core/stats';
  import { createTimer, type TimerResult, type TimerState } from '../../core/timer';
  import { createTouchArm } from '../../core/touch';
  import { byCase, caseScramble, caseStats, nextCase } from '../../core/trail/train';
  import type { CaseSet, CubeAngle, MaskKind, TrainCase } from '../../core/trail/types';
  import { T } from '../../strings';
  import type { CentroView } from '../centro';
  import { createSound } from '../sound';
  import type { AppState } from '../state/app.svelte';
  import { createInputController } from '../timer/input';
  import { createTimeLoop, paintTime } from '../timer/TimeDisplay';
  import Zones from '../timer/Zones.svelte';
  import CaseFigure from './CaseFigure.svelte';
  import MiniCentro from './MiniCentro.svelte';

  let { app, set, rng = Math.random }: { app: AppState; set: CaseSet; rng?: () => number } = $props();

  const EDGE_CASES: readonly string[] = ['oll2-linha', 'oll2-l', 'oll2-ponto'];
  // A figura de cada conjunto: a camada de cima na OLL (só as arestas nos 3 casos da cruz) e na PLL; o par da frente-direita no F2L.
  const figureOf = (c: TrainCase): { view: CubeAngle; mask: MaskKind } =>
    c.set === 'f2l' ? { view: '3D', mask: 'pair' } : { view: 'top', mask: c.set === 'pll2' ? 'pll' : EDGE_CASES.includes(c.id) ? 'eoll' : 'oll' };

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
  let coarseMq = $state(false);
  let destroyed = false;
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

  // "Ver o algoritmo" antes de começar: a tentativa fica "com ajuda" e não sobe o nível.
  function help(): void {
    if (phase === 'setup' && timer.state === 'idle') helped = true;
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
      return;
    }
    last = { id: saved.id, caseId: c.id, name: c.name, alg, ms, ok, helped };
    canFix = true;
    // O Centro reage sem texto (spec 7.5): olho entreaberto no erro, feliz (sem salto) quando bate o melhor tempo do caso.
    centro = !ok ? { state: 'reaction', result: 'plus2' } : !helped && best !== null && ms < best ? { state: 'reaction', result: 'pb' } : { state: 'idle' };
    app.announce(`${c.name}: ${T.trilha.round.outcome(ok, helped)}, ${formatMs(ms)}`);
    nextRound();
  }

  async function fix(ok: boolean): Promise<void> {
    if (!last || !canFix) return;
    if (await app.setPracticeOk(last.id, ok)) last = { ...last, ok };
  }

  async function remove(): Promise<void> {
    if (!last || !canFix) return;
    if (await app.deletePractice(last.id)) {
      last = null;
      app.announce(T.trilha.round.removed);
    }
  }

  function onState(next: TimerState): void {
    if (destroyed) return;
    app.timerBusy = next === 'arming' || next === 'ready' || next === 'running';
    app.trainerRunning = next === 'running';
    document.body.dataset.tstate = next;
    document.body.classList.toggle('solving', next === 'running');
    if (next === 'ready') sound.klick();
    if (next === 'arming') centro = { state: 'idle' };
    if (next === 'running') canFix = false; // a próxima rodada começou: a anterior não se corrige mais
    loop.kick();
  }

  function onDone(r: TimerResult): void {
    if (destroyed) return;
    sound.klick();
    resultMs = r.ms;
    phase = 'mark';
    loop.kick();
  }

  // Enter marca "Acertei" depois de parar. Num botão focado, o Enter é do botão (não marca as duas coisas).
  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || phase !== 'mark' || e.repeat) return;
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

<div class="round" data-round={set} bind:this={screenEl}>
  <header class="round-top fade">
    <MiniCentro {app} view={centro} />
    <h2>{T.trilha.sets[set]}</h2>
    <button type="button" class="link" onclick={() => app.openTrail({ kind: 'set', set })}>{T.trilha.round.end}</button>
  </header>

  {#if current}
    <div class="case fade">
      <CaseFigure setup={scramble} {...figureOf(current)} />
      <div>
        <div class="label">{T.trilha.round.setup}</div>
        <p class="scramble" data-train-scramble>{scramble}</p>
        <p class="muted hint">{T.trilha.round.setupHint}</p>
        {#if helped}
          <p class="help-alg"><span class="chip">{T.trilha.round.helped}</span> <span class="mono" data-help-alg>{alg}</span></p>
        {:else if phase === 'setup'}
          <button type="button" class="btn" onclick={help}>{T.trilha.round.help}</button>
        {/if}
      </div>
    </div>

    <div class="time" data-time aria-hidden="true" bind:this={timeEl}></div>

    {#if phase !== 'setup'}
      <div class="marks" data-marks>
        <button type="button" class="btn primary" disabled={phase === 'saving'} onclick={() => mark(true)}>{T.trilha.round.ok}</button>
        <button type="button" class="btn" disabled={phase === 'saving'} onclick={() => mark(false)}>{T.trilha.round.miss}</button>
      </div>
    {:else}
      <p class="muted fade">{T.trilha.round.hint}</p>
    {/if}
  {:else}
    <p data-round-empty>{T.trilha.round.empty}</p>
  {/if}

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

  <!-- O invólucro fica sempre: a entrada (teclado, parar com um toque, engolir o clique que vem depois) segue ligada nele. As zonas só
       existem enquanto o caso pode ser armado (a montagem, com um caso, e a execução, que nasce dela); sem elas o toque não arma. -->
  <div class="zones-host" bind:this={zonesEl}>
    {#if phase === 'setup' && current}
      <Zones one={app.profile.settings.mobileArm === 'one'} />
    {/if}
  </div>
</div>

<style>
  .round {
    display: grid;
    gap: 14px;
    max-width: 640px;
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

  .mono {
    font-family: var(--mono);
  }

  .zones-host {
    display: contents;
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
