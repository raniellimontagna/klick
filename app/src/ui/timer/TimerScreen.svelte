<script lang="ts">
  // A tela do Timer (porte de prototype/scripts/app.js e ui/timer-view.js). Dona do timer, da entrada, da reação, do coach e da
  // pintura do tempo. O solve é gravado antes da reação: a reação só começa depois que o solve está em app.solves.
  //
  // O desafio por link é um modo desta tela (a maquete aprovada): o mesmo timer joga o embaralhamento da vez, e o solve vai para o desafio
  // (app.duel.record), nunca para os solves. No modo, o embaralhamento diz "N de 7", o progresso (A) ou o placar (B) fica no topo (no
  // desktop, no cartão "Desafio" da coluna da direita, no lugar da constância), os chips viram a lista dos tempos, os tiles de média somem e
  // só +2 e DNF ficam (N e ⌫ não fazem nada). B confere a penalidade e vê o ponto antes do próximo: aí o Timer não arma.
  //
  // O modo Digitar (settings.entry === 'typing', fora do desafio) é o outro jeito de o tempo entrar: o campo (TypedEntry) no lugar do tempo
  // grande, sem zonas e sem armar. Salvar passa pelo mesmo finishSolve do cronômetro (resultado, chips, Centro e coach iguais), sem inspeção.
  import { tick, untrack } from 'svelte';
  import { type CoachMessage, type CoachSeason, pickCoachMessage, type SeasonEnd, seasonEndMessage } from '../../core/coach';
  import { eventInfo } from '../../core/events';
  import { closeRecord, seasonFinish, seasonSolves } from '../../core/season';
  import {
    averageOf,
    bestSingleSolve,
    currentStreak,
    effectiveMs,
    formatMs,
    formatSolve,
    monthHeat,
    officialAverage,
    officialAverageLabel,
    type ResultKind,
    resultKind,
    solveDeltas,
    solvesOnDay,
  } from '../../core/stats';
  import { createTimer, type Timer, type TimerResult, type TimerState } from '../../core/timer';
  import { isTypedDnf } from '../../core/typed';
  import { createTouchArm } from '../../core/touch';
  import type { EventId, Penalty, SeasonState, Solve } from '../../core/types';
  import { T } from '../../strings';
  import DuelBoard from '../duel/DuelBoard.svelte';
  import Bidi from '../duel/Bidi.svelte';
  import DuelEnd from '../duel/DuelEnd.svelte';
  import { duelTime, revealOf, splitTime } from '../duel/duel-view';
  import { daysAgoLabel, monthLabel } from '../format';
  import { wideLayout } from '../layout';
  import type { CentroView as Vista } from '../centro';
  import { createCentroAnimator } from '../centro/animator';
  import { TIMING } from '../centro/behavior';
  import { createCentroLive, REACTION_DELAY, SLEEP_AFTER } from './centro-live';
  import { createSound } from '../sound';
  import { createWakeLock } from '../wakelock';
  import type { AppState, Tab } from '../state/app.svelte';
  import CentroView from './CentroView.svelte';
  import ResultActions from './ResultActions.svelte';
  import ScrambleBlock from './ScrambleBlock.svelte';
  import TypedEntry from './TypedEntry.svelte';
  import Zones from './Zones.svelte';
  import { type ActionName, createInputController, type InputController } from './input';
  import { createTimeLoop, paintTime } from './TimeDisplay';

  // O coach fala por 6 s (a reação e o sono ficam em centro-live.ts).
  const COACH_MS = 6000;

  const TAB_OF: Readonly<Record<'tab1' | 'tab2' | 'tab3' | 'tab4' | 'tab5', Tab>> = {
    tab1: 'timer',
    tab2: 'evolucao',
    tab3: 'trilha',
    tab4: 'companion',
    tab5: 'ajustes',
  };

  type Chip = { text: string; pb: boolean };
  type Tile = { label: string; value: string; sub: string };
  type Cell = { day: number; cls: string; text: string };

  let { app }: { app: AppState } = $props();

  // O modo desafio: o embaralhamento da vez (solving) e, de B, a confirmação da penalidade (confirm) e a revelação do ponto (reveal). No fim
  // (os sete de A, a partida de B, a resposta, a partida só para ver), a tela de fim fica no lugar do Timer.
  const duel = $derived(app.duel.current);
  const duelPhase = $derived(app.duel.phase);
  const duelOn = $derived(duel !== null && (duelPhase === 'solving' || duelPhase === 'confirm' || duelPhase === 'reveal'));
  const duelEnd = $derived(duel !== null && (duelPhase === 'finished' || duelPhase === 'reply' || duelPhase === 'view'));
  const reviewing = $derived(duelOn && duelPhase !== 'solving'); // B confere a penalidade ou vê o ponto: o Timer não arma
  const playEvent = $derived(duelOn && duel ? duel.event : app.event); // o evento que o timer joga (a inspeção e a imagem seguem ele)
  const duelLast = $derived(duelOn ? (duel?.mine.at(-1) ?? null) : null); // o último tempo deste lado
  const reveal = $derived(duelPhase === 'reveal' && duel && app.duel.score ? revealOf(duel, app.duel.score, app.duel.index) : null);
  const revealTime = $derived(reveal ? splitTime(reveal.time) : null);
  // O modo Digitar (o tempo vem de um timer de fora): o campo no lugar do tempo grande, sem zonas e sem armar. Não vale no desafio.
  const typingOn = $derived(app.profile.settings.entry === 'typing' && !duelOn);
  const wide = wideLayout(); // no desktop, o placar do desafio vai para a coluna da direita
  // A dica de teclado do desktop. Na confirmação e na revelação o espaço não arma: fica só o que vale ali.
  const hint = $derived(
    !duelOn ? (typingOn ? T.timer.hintsTyped : T.timer.hints) : duelPhase === 'confirm' ? T.duel.hintsConfirm : duelPhase === 'reveal' ? T.duel.hintsReveal : T.duel.hints,
  );
  // O espaço e o toque só armam no Timer de sempre e no embaralhamento da vez do desafio (o timer que corre ainda para com qualquer toque).
  // No modo Digitar não há o que armar.
  const armable = (): boolean => (app.duel.phase === 'idle' || app.duel.phase === 'solving') && !typingOn;
  // O solve gravado está na tela como resultado: o timer parou nele, ou (no modo Digitar) o timer está parado e o tempo veio do campo.
  const resting = (): boolean => timer.state === 'done' || (typingOn && timer.state === 'idle');

  // Os solves da lista antes do solve dado (a lista vem em ordem de tempo).
  const before = (list: Solve[], solve: Solve | null): Solve[] => {
    if (!solve) return [];
    const i = list.findIndex((s) => s.id === solve.id);
    return i < 0 ? [] : list.slice(0, i);
  };

  // A inspeção vale quando o ajuste pede e o evento tem (o 3BLD não tem). Os ajustes do timer, do toque e do som entram pelo
  // efeito de ajustes, logo na montagem, antes de qualquer toque.
  const inspectionOn = (): boolean => app.profile.settings.inspection && eventInfo(playEvent).inspection;
  const timer: Timer = createTimer({ now: () => performance.now() });
  const sound = createSound();
  const touch = createTouchArm({
    press: (at) => {
      if (timer.state === 'running' || armable()) timer.press(at);
    },
    release: (at) => timer.release(at),
    cancel: () => timer.cancel(),
    getState: () => timer.state,
    getInspection: inspectionOn,
  });
  const wake = createWakeLock();
  const loop = createTimeLoop(paint);
  // O Centro do Timer: o animador desenha (sob demanda, nada no solve) e o controlador diz o estado de cada quadro.
  const animator = createCentroAnimator({ svg: () => screenEl?.querySelector<SVGElement>('[data-centro-slot] svg.centro') ?? null });
  const live = createCentroLive(timer, animator, Date.now());
  let onScreen = $state(true); // o Centro está na área visível (IntersectionObserver)
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;

  // Elementos e estado que a tela desenha de novo. Os que mudam a cada quadro (tempo, coach) são pintados à mão; o Centro, pelo animador.
  let screenEl = $state<HTMLElement>();
  let zonesEl = $state<HTMLElement>();
  let noteInput = $state<HTMLInputElement>();
  let timeEl = $state<HTMLElement>(); // o tempo grande (sai da tela no modo Digitar)
  let lastId = $state<string | null>(null); // o solve que a tela mostra; null = o último da sessão
  let showResult = $state(false); // o solve está gravado e a pessoa ainda pode agir sobre ele
  let typedPending = $state<string | null>(null); // o tempo digitado que está gravando (ou na fila): aparece no lugar do último solve
  let saving = $state(false); // gravação em voo: o tempo mostra o resultado do timer e os chips somem
  let unstored = $state<number | null>(null); // a gravação falhou: o instante (at) do solve que ficou na fila; o tempo segue o timer até ele entrar nos dados
  let deleting = $state(false);
  let penalizing = false; // uma troca de penalidade gravando
  let noteOpen = $state(false);
  let noteValue = $state('');
  let coachShown = $state<string | null>(null);
  let reloadHint = $state(false);
  let pageVisible = $state(true);
  let darkMq = $state(false);
  let reduceMq = $state(false);
  let coarseMq = $state(false);

  let noteId: string | null = null; // o solve que o formulário da nota está editando
  let coach: { text: string; from: number; until: number } | null = null;
  let chordTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let failStreak = 0; // falhas seguidas do gerador de embaralhamentos
  let solveSeq = 0; // o último solve que a tela acompanha: uma gravação mais antiga que termina depois não mexe na tela
  let runningDuel: string | null = null; // o solve que corre começou no desafio aberto (o id dele): vai para o desafio, nunca para os solves
  let controller: InputController | null = null;

  const theme = $derived<'light' | 'dark'>(
    app.profile.settings.theme === 'system' ? (darkMq ? 'dark' : 'light') : app.profile.settings.theme === 'dark' ? 'dark' : 'light',
  );
  const reduced = (): boolean => app.profile.settings.reducedMotion === 'always' || reduceMq;
  const mode = $derived(app.profile.settings.centro);

  // O solve que a tela mostra: o marcado, ou o último da sessão enquanto nenhum foi marcado (ou se o marcado sumiu).
  const last = $derived.by((): Solve | null => app.solves.find((s) => s.id === lastId) ?? app.sessionSolves.at(-1) ?? null);
  const eventBefore = $derived(before(app.eventSolves, last));
  const sessBefore = $derived(before(app.sessionSolves, last));
  const sessionNumber = $derived(last ? app.sessionSolves.findIndex((s) => s.id === last.id) + 1 : 0);
  const deltas = $derived(last ? solveDeltas(eventBefore, last, sessBefore) : null);
  const kind = $derived<ResultKind | null>(last ? resultKind(eventBefore, last, sessBefore) : null);
  const pbTag = $derived(!duelOn && showResult && kind === 'pb');
  // No desafio, as ações (só +2 e DNF) são do último tempo deste lado: de A, com o resultado na tela; de B, na confirmação.
  const actionsShown = $derived(
    duelOn ? (duel?.side === 'a' ? duelPhase === 'solving' && showResult && duelLast !== null : duelPhase === 'confirm') : showResult && last !== null,
  );

  // Enquanto a fila segura o solve, a tela mostra o tempo do timer e não mostra os chips (o solve não está nos dados ainda).
  const holding = $derived(unstored !== null);

  const chips = $derived.by((): Chip[] => {
    const d = deltas;
    if (duelOn || !last || !d || saving || deleting || holding) return [];
    const out: Chip[] = [];
    if (d.vsAvg !== null) out.push({ text: T.chips.vsAvg(d.vsAvg, d.avgN), pb: false });
    if (d.isPb && d.vsPb !== null) out.push({ text: T.chips.newPb(-d.vsPb), pb: true });
    else if (d.vsPb !== null) out.push({ text: T.chips.vsPb(d.vsPb), pb: false });
    out.push({ text: T.chips.solveN(sessionNumber), pb: false });
    return out;
  });

  // No desafio, os chips de A viram a lista dos tempos até aqui (o número e o tempo). B tem o placar.
  const duelChips = $derived(duelOn && duel?.side === 'a' ? duel.mine.map((t, i) => ({ n: i + 1, text: duelTime(t) })) : []);

  // Tiles: a média oficial e a de 12 são da sessão; o recorde é do evento; "hoje" conta todos os eventos.
  const tiles = $derived.by((): Tile[] => {
    const now = Date.now();
    const ev = app.event;
    const best = bestSingleSolve(app.eventSolves);
    return [
      { label: T.tiles.avg(officialAverageLabel(ev).n), value: formatMs(officialAverage(app.sessionSolves, ev)), sub: '' },
      { label: T.tiles.avg12, value: formatMs(averageOf(app.sessionSolves, 12)), sub: '' },
      { label: T.tiles.record, value: best ? formatMs(effectiveMs(best)) : T.timer.none, sub: best ? daysAgoLabel(best.at, now) : '' },
      { label: T.tiles.today, value: String(solvesOnDay(app.solves, now).length), sub: T.tiles.todaySub(app.profile.settings.dailyGoal) },
    ];
  });

  // Mapa de constância do mês: todos os eventos. Os quadros que faltam para 32 são espaço vazio.
  const heat = $derived.by(() => {
    const now = Date.now();
    const days = monthHeat(app.solves, now);
    const cells: Cell[] = days.map((h) => ({
      day: h.day,
      cls: [h.pb ? 'pb' : h.level ? `l${h.level}` : '', h.today ? 'today' : ''].filter(Boolean).join(' '),
      text: T.heat.day(h.day, h.count, h.pb, h.today),
    }));
    return {
      label: T.heat.label(monthLabel(now)),
      streak: T.heat.streak(currentStreak(app.solves, now)),
      cells,
      pads: Array.from({ length: Math.max(0, 32 - cells.length) }, (_, i) => i),
    };
  });

  // Os marcos da temporada atual, para a face de cima. A conta é do AppState (guardada por lista; continua de onde parou) e roda numa
  // macrotarefa depois de cada mudança dos solves ou da temporada, fora do caminho do solve.
  let topLit = $state(0);
  $effect(() => {
    const list = app.solves;
    const state = app.profile.season.current;
    const later = setTimeout(() => {
      topLit = app.seasonStatus(list, state).filter((m) => m.achieved).length;
    }, 0);
    return () => clearTimeout(later);
  });
  // Na virada, a face de cima segue cheia durante a reação e só depois esvazia (spec 8). null: mostra a contagem de agora.
  let topHold = $state<number | null>(null);
  let topHoldTimer: ReturnType<typeof setTimeout> | undefined;
  const topShown = $derived(topHold ?? topLit);
  const sideLit = $derived(app.profile.trail.filter(Boolean).length);

  // ----- Texto e pintura (a cada quadro, sem passar pelo Svelte) -----

  // No celular, o modo dois polegares só responde nas áreas de polegar; no modo um toque, a tela inteira responde.
  function idleText(): string {
    if (typingOn) return T.coach.idleTyped;
    if (!coarseMq) return inspectionOn() ? T.coach.idleInsp : T.coach.idle;
    const one = app.profile.settings.mobileArm === 'one';
    if (inspectionOn()) return one ? T.coach.idleInspTouch : T.coach.idleInspThumb;
    return one ? T.coach.idleOne : T.coach.idleTouch;
  }

  function coachFor(view: Vista, now: number): string | null {
    if (coach && now >= coach.from && now < coach.until) return coach.text;
    if (timer.state === 'inspect') return T.coach.inspect;
    if (timer.state === 'arming') return T.coach.arming;
    if (timer.state === 'ready') return T.coach.ready;
    if (view.state === 'running' || view.state === 'reaction') return null;
    if (reviewing) return null; // B confere a penalidade ou vê o ponto: as notas da tela falam
    return idleText();
  }

  // O resultado que o timer acabou de dar, antes de o solve entrar na lista (+2 soma os 2 s).
  function resultText(r: Pick<TimerResult, 'ms' | 'penalty'>): string {
    if (r.penalty === 'DNF') return T.timer.dnf;
    return formatMs(r.ms + (r.penalty === '+2' ? 2000 : 0)) + (r.penalty === '+2' ? T.timer.plus2Suffix : '');
  }

  function timeText(): string {
    const e = timer.inspectElapsed;
    if (timer.state === 'running') return formatMs(timer.elapsed);
    if (e > 0 && (timer.state === 'inspect' || timer.state === 'arming' || timer.state === 'ready')) {
      return e > 17000 ? T.timer.dnf : e > 15000 ? T.timer.plus2 : String(Math.ceil((15000 - e) / 1000));
    }
    if (timer.state === 'arming' || timer.state === 'ready') return T.timer.zero;
    if ((saving || holding) && timer.result) return resultText(timer.result);
    if (duelOn) return duelLast ? duelTime(duelLast) : T.timer.zero;
    return last ? formatSolve(last) : T.timer.zero;
  }

  function needsFrame(now: number): boolean {
    if (['inspect', 'arming', 'ready', 'running'].includes(timer.state)) return true;
    if (live.reacting(now)) return true;
    return coach !== null && now < coach.until;
  }

  // Um quadro: o timer avança (pronto e os avisos da inspeção saem daqui), depois tempo, Centro, atributos do body e coach.
  // Devolve true enquanto o laço precisa continuar.
  function paint(): boolean {
    if (destroyed) return false;
    timer.tick();
    const now = performance.now();
    const view = live.paint(now);
    const body = document.body;
    body.dataset.cview = view.state;
    body.dataset.result = !duelOn && resting() && showResult && kind ? kind : '';
    const e = timer.inspectElapsed;
    body.dataset.insp = timer.state === 'inspect' ? (e > 15000 ? 'over' : e >= 12000 ? '12' : e >= 8000 ? '8' : '') : '';
    if (timeEl) paintTime(timeEl, timeText());
    coachShown = coachFor(view, now);
    return needsFrame(now);
  }

  function kick(): void {
    if (!destroyed) loop.kick();
  }

  // ----- Solve: gravar, depois reagir -----

  // A temporada do solve para o coach: os marcos antes e depois dele, os solves da temporada antes dele e, se ele fechou a temporada, o
  // resumo dela. Conta na temporada de quando o solve começou: a virada pode já ter gravado a próxima. `listBefore` é a lista sem a ação
  // desta tela (app.solvesBefore): o que o sync juntou no meio não faz a virada parecer deste solve (spec 6.4).
  function seasonInput(state: SeasonState, listBefore: Solve[]): CoachSeason {
    const before = app.seasonStatus(listBefore, state);
    const after = app.seasonStatus(app.solves, state);
    const closed = before.some((m) => !m.achieved) && after.every((m) => m.achieved);
    const record = closed ? closeRecord(state, app.solves, after) : null;
    return {
      state,
      before,
      after,
      prior: seasonSolves(listBefore, state),
      end: record && { n: record.n, solves: record.solves, startAo12: record.startAo12, endAo12: record.endAo12, finish: seasonFinish(record.n) },
    };
  }

  // Uma tecla ou toque que para o timer chega aqui (ou, no modo Digitar, o Salvar do campo: `typed`, sem timer parado no resultado). A
  // gravação acontece antes de qualquer reação.
  async function finishSolve({ ms, penalty }: Pick<TimerResult, 'ms' | 'penalty'>, typed = false): Promise<void> {
    const settled = (): boolean => typed || timer.state === 'done'; // o resultado ainda é o desta tela (a pessoa não armou de novo)
    const mine = ++solveSeq;
    const now = Date.now();
    const sessionAtStart = app.activeSession?.id ?? null;
    const eventList = app.eventSolves;
    const sessionList = app.sessionSolves;
    const prevAnyAt = app.solves.at(-1)?.at;
    const listBefore = app.solves; // os marcos de antes são contados depois, na lista que estava aqui (a gravação não espera por eles)
    const seasonAtStart = $state.snapshot(app.profile.season.current); // a temporada em que este solve cai
    saving = true;
    unstored = null;
    showResult = false;
    lastId = null;
    live.hold(); // o Centro segue parado (foco) enquanto grava: a reação só vem depois da gravação
    coach = null;
    closeNote();
    kick();
    // Toda saída sem reação solta o Centro do parado; se um solve mais novo já tomou a tela, o Centro é dele e fica como está.
    const release = (): void => {
      if (mine === solveSeq) live.clearReaction();
    };
    // O finally vale mesmo se a gravação lançar: sem ele, o tempo ficaria preso no resultado do timer (e o Centro, parado).
    const solve = await app
      .addSolve({ ms, penalty, at: now })
      .catch((err: unknown) => {
        release();
        kick();
        throw err;
      })
      .finally(() => {
        if (mine === solveSeq) saving = false;
      });
    // Um solve mais novo já tomou a tela, ou ela fechou, ou a sessão mudou: nada disso é mais deste solve.
    if (destroyed || mine !== solveSeq || app.activeSession?.id !== sessionAtStart) {
      release();
      kick();
      return;
    }
    // A gravação falhou: o solve ficou na fila e o aviso fixo aparece. O tempo fica na tela até o solve entrar nos dados.
    if (!solve) {
      unstored = now;
      release();
      kick();
      return;
    }
    lastId = solve.id;
    // A pessoa já armou de novo: o solve está gravado (e aparece nos dados), mas a reação não entra por cima. O tempo final
    // ainda é anunciado.
    if (!settled()) {
      release();
      app.announce(T.aria.final(formatSolve(solve)));
      kick();
      return;
    }
    showResult = true;
    typedPending = null;
    kick();
    // O resultado e as ações já estão na tela. Os marcos e o coach vêm numa macrotarefa depois, para a conta não atrasar o quadro;
    // se a pessoa armou de novo ou outro solve tomou a tela nesse intervalo, a reação não entra.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (destroyed || mine !== solveSeq) {
      release();
      return;
    }
    if (!settled()) {
      release();
      app.announce(T.aria.final(formatSolve(solve)));
      kick();
      return;
    }
    // Os marcos e o coach. Se a conta lançar (um erro de código), a reação entra assim mesmo, sem coach e sem o fim de temporada: sem
    // isso o Centro ficaria preso no foco até o próximo solve, e a promessa rejeitaria sem dono. A temporada fecha na conferência.
    let seasonClosed = false;
    let msg: CoachMessage | null = null;
    try {
      const season = eventInfo(solve.event).milestones ? seasonInput(seasonAtStart, app.solvesBefore(listBefore, solve)) : undefined;
      const s = app.profile.settings;
      msg = pickCoachMessage({
        solve,
        history: eventList,
        sessionSolves: sessionList,
        season,
        dailyGoal: s.dailyGoal,
        todayCount: solvesOnDay(app.solves, solve.at).length,
        prevAnyAt,
        silent: s.silent,
        event: solve.event,
      });
      seasonClosed = season?.end != null;
    } catch {
      // seasonClosed e msg ficam como estão (false e null): a reação entra sem coach e sem o fim de temporada.
    }
    const t0 = performance.now();
    live.react(kind, t0, seasonClosed);
    clearTimeout(topHoldTimer);
    if (seasonClosed) holdTop(REACTION_DELAY + TIMING.flash);
    coach = msg ? { text: msg.text, from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + COACH_MS } : null;
    clearTimeout(chordTimer);
    if (kind === 'pb') {
      chordTimer = setTimeout(() => {
        if (live.reacting(performance.now()) && kind === 'pb' && settled()) sound.chord();
      }, REACTION_DELAY);
    }
    app.announce(`${T.aria.final(formatSolve(solve))}${msg ? ` ${msg.text}` : ''}`);
    kick();
    await tick();
    popToday();
  }

  // O Salvar do campo (Enter ou o botão): o mesmo caminho do solve cronometrado, sem inspeção. Até o solve entrar nos dados, o tempo
  // digitado fica no lugar do último (como o resultado do timer, na gravação).
  function saveTyped(t: { ms: number; penalty: Penalty }): void {
    if (!typingOn) return;
    typedPending = resultText(t);
    void finishSolve(t, true);
  }

  // O tempo embaixo do campo: o que está gravando ou na fila, ou o último solve; nada antes do primeiro.
  const typedShown = $derived<string | null>((saving || holding) && typedPending !== null ? typedPending : last ? formatSolve(last) : null);
  // "0:12" e ".34+" (o decimal menor, como no tempo grande); o DNF não tem ponto e vai inteiro.
  const typedParts = $derived.by(() => {
    const text = typedShown;
    if (text === null) return null;
    const cut = text.indexOf('.');
    return cut < 0 ? { int: text, dec: '' } : { int: text.slice(0, cut), dec: text.slice(cut) };
  });

  // Um solve do desafio: vai para o desafio aberto (app.duel.record), nunca para os solves, e não passa pelas contas do Timer (médias,
  // recordes, marcos, coach). O Centro fica parado enquanto grava; depois, o de A volta ao parado (os pontos são de B) e o de B espera o
  // ponto, com o anel apagado.
  async function finishDuelSolve({ ms, penalty }: TimerResult, id: string): Promise<void> {
    const mine = ++solveSeq;
    const before = app.duel.current?.id === id ? app.duel.current.mine.length : null;
    saving = true;
    unstored = null;
    showResult = false;
    lastId = null;
    live.hold();
    coach = null;
    closeNote();
    kick();
    try {
      if (before !== null) await app.duel.record({ ms, penalty });
    } finally {
      if (mine === solveSeq) saving = false;
    }
    if (destroyed || mine !== solveSeq) {
      kick();
      return;
    }
    const d = app.duel.current;
    const t = before !== null && d?.id === id && d.mine.length > before ? d.mine.at(-1) : undefined;
    live.clearReaction();
    if (app.duel.phase === 'confirm') live.wait(true);
    showResult = t !== undefined && timer.state === 'done';
    // O tempo final é sempre anunciado (o sétimo de A também: a tela de mandar já tirou o Timer do modo, e ele voltou ao parado). O que vem
    // depois, só com o resultado na tela.
    if (t) {
      const done = timer.state === 'done';
      const after =
        done && app.duel.phase === 'confirm' ? ` ${T.duel.checkPenalty}` : done && app.duel.phase === 'solving' ? ` ${T.duel.scramble(app.duel.index + 1)}.` : '';
      app.announce(`${T.aria.final(duelTime(t))}${after}`);
    }
    kick();
  }

  // +2 e DNF no desafio: de A, no último solve, com o resultado na tela (até armar o próximo) ou na tela de mandar; de B, só na confirmação,
  // antes de ver o ponto. O estado do desafio confere de novo (depois da revelação, nunca).
  async function duelPenalize(p: '+2' | 'DNF'): Promise<void> {
    const d = app.duel.current;
    const t = d?.mine.at(-1);
    if (!d || !t || penalizing) return;
    const phase = app.duel.phase;
    const open =
      d.side === 'a'
        ? (phase === 'solving' && showResult && timer.state === 'done') || (phase === 'finished' && d.status === 'playing' && !app.duel.linkOut)
        : phase === 'confirm';
    if (!open) return;
    penalizing = true;
    try {
      await app.duel.setPenalty(t.penalty === p ? null : p);
    } finally {
      penalizing = false;
    }
    // Só uma troca de verdade é anunciada (o link que já saiu não muda, e nada é dito).
    const now = app.duel.current?.mine.at(-1);
    if (now && now.penalty !== t.penalty) app.announce(T.aria.final(duelTime(now)));
    kick();
  }

  // "Ver o ponto" (B): a revelação gravada, o Centro reage ao ponto (seu: 6 verdes; do oponente: 3 em âmbar; ninguém: o "="), o anúncio e
  // o foco em "Próximo" (o botão que tinha o foco sumiu).
  // Um toque por vez: o segundo, com a revelação ainda gravando, não recomeça a reação nem anuncia de novo.
  let seeing = false;
  async function seePoint(): Promise<void> {
    const id = app.duel.current?.id;
    const phase = app.duel.phase;
    if (seeing || phase !== 'confirm' || !id) return;
    seeing = true;
    try {
      const refocus = focusLost() || (screenEl?.contains(document.activeElement) ?? false);
      await app.duel.reveal();
      const d = app.duel.current;
      const score = app.duel.score;
      if (destroyed || app.duel.phase !== 'reveal' || d?.id !== id || !score) return;
      const shown = revealOf(d, score, app.duel.index);
      if (!shown) return;
      live.react(shown.centro, performance.now());
      app.announce(shown.aria);
      kick();
      if (!refocus) return;
      await tick();
      if (!destroyed) screenEl?.querySelector<HTMLElement>('[data-duel-next]')?.focus({ preventScroll: true });
    } finally {
      seeing = false;
    }
  }

  // "Próximo": o embaralhamento seguinte (ou o resultado). O botão some: o foco vai para a tela, como quando uma ação do Timer some.
  async function nextPoint(): Promise<void> {
    const refocus = focusLost() || (screenEl?.contains(document.activeElement) ?? false);
    app.duel.next();
    live.clearReaction();
    showResult = false;
    kick();
    if (!refocus) return;
    await tick();
    if (!destroyed && app.duel.phase === 'solving') screenEl?.focus({ preventScroll: true });
  }

  // O foco caiu no body (ou em nada): o elemento que o tinha sumiu.
  const focusLost = (): boolean => document.activeElement === null || document.activeElement === document.body;

  // Na virada, a face de cima segue cheia até a piscada passar e só depois esvazia (spec 8).
  function holdTop(until: number): void {
    clearTimeout(topHoldTimer);
    topHold = 9;
    topHoldTimer = setTimeout(() => {
      topHold = null;
    }, until);
  }

  // O fim de temporada que uma troca de penalidade causou, ou null. Se a conta lançar (um erro de código), a troca segue sem a virada
  // na tela; a temporada fecha na conferência do AppState.
  function seasonEndOf(solve: Solve, state: SeasonState, listBefore: Solve[]): SeasonEnd | null {
    if (!eventInfo(solve.event).milestones) return null;
    try {
      return seasonInput(state, listBefore).end;
    } catch {
      return null;
    }
  }

  // Ações sobre o último solve. Só valem enquanto o solve está gravado e o timer parado no resultado.
  async function penalize(p: '+2' | 'DNF'): Promise<void> {
    const solve = last;
    // Uma troca por vez: um segundo toque com a primeira ainda gravando leria a penalidade antiga (e mostraria a virada duas vezes).
    if (!solve || !resting() || !showResult || deleting || penalizing || isTypedDnf(solve)) return; // o DNF digitado não tem tempo: não vira OK nem +2
    penalizing = true;
    try {
      const listBefore = app.solves;
      const seasonAtStart = $state.snapshot(app.profile.season.current);
      coach = null;
      kick();
      await app.setPenalty(solve.id, solve.penalty === p ? null : p);
      live.setResult(kind); // no meio da reação, o Centro passa na hora para o +2 ou o DNF (sem novo salto)
      kick();
      const updated = app.solves.find((s) => s.id === solve.id);
      if (!updated) return;
      // A troca pode fechar a temporada (tirar um DNF completa uma média; um +2 pode deixar 5 seguidos mais constantes). A virada aparece
      // como depois de um solve: o fim de temporada no coach e a piscada da face de cima, mas sem novo salto e sem a espera de 0,5 s (não
      // há gravação a esperar). A conta vem numa macrotarefa depois, para não atrasar o quadro que mostra a penalidade.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const still = !destroyed && lastId === solve.id && resting();
      const end = still ? seasonEndOf(updated, seasonAtStart, app.solvesBefore(listBefore, updated, solve)) : null;
      let msg: CoachMessage | null = null;
      if (end) {
        const t0 = performance.now();
        live.seasonEnd(kind, t0);
        holdTop(TIMING.flash);
        msg = app.profile.settings.silent ? null : seasonEndMessage(end);
        coach = msg ? { text: msg.text, from: t0, until: t0 + COACH_MS } : null;
        kick();
      }
      app.announce(`${T.aria.final(formatSolve(updated))}${msg ? ` ${msg.text}` : ''}`);
    } finally {
      penalizing = false;
    }
  }

  async function removeLast(): Promise<void> {
    const solve = last;
    if (!solve || !resting() || !showResult || deleting) return;
    const hadFocus = focusInside(); // as ações vão sumir: se o foco estava nelas, ele volta para a tela do Timer
    deleting = true;
    live.clearReaction();
    coach = null;
    closeNote();
    kick();
    // O solve e as ações ficam até a exclusão terminar: se ela falhar, o solve segue na lista e as ações continuam na tela.
    await app.deleteSolve(solve.id).finally(() => {
      deleting = false;
    });
    if (app.solves.some((x) => x.id === solve.id)) {
      kick();
      return;
    }
    // As ações saem só se ainda são as do solve excluído: um solve mais novo que tomou a tela durante a exclusão continua com elas.
    if (lastId === solve.id) {
      showResult = false;
      lastId = null;
      if (hadFocus) screenEl?.focus({ preventScroll: true });
    }
    kick();
  }

  async function openNote(): Promise<void> {
    const solve = last;
    if (!solve || !resting() || !showResult || deleting) return;
    noteId = solve.id;
    noteValue = solve.note;
    noteOpen = true;
    await tick();
    noteInput?.focus();
  }

  function closeNote(): void {
    noteOpen = false;
    noteId = null;
  }

  // Fechar a nota (cancelada ou salva) devolve o foco ao botão Nota: quem usa teclado continua de onde estava.
  function closeNoteAndFocus(): void {
    closeNote();
    const nota = screenEl?.querySelector<HTMLElement>('[data-act="note"]');
    if (nota && !nota.closest('[hidden]')) nota.focus({ preventScroll: true });
    else screenEl?.focus({ preventScroll: true });
  }

  // Só grava se o solve ainda existe: se ele sumiu (outra aba, lixeira), a nota não tem a quem ir.
  async function saveNote(text: string): Promise<void> {
    const id = noteId;
    closeNoteAndFocus();
    if (id === null || !app.solves.some((s) => s.id === id)) return;
    await app.setNote(id, text.trim());
  }

  // Exportar agora (o aviso de salvar e o lembrete): o mesmo caminho da seção Seus dados. Se o navegador baixa, o foco volta para a
  // tela (o botão que o pediu pode ter sumido); se não baixa, o AppState leva para Ajustes, onde o ExportDialog mostra o texto.
  async function exportNow(): Promise<void> {
    await app.exportFile('klick');
    if (app.dialog === null && app.tab === 'timer') screenEl?.focus({ preventScroll: true });
  }

  // "Agora não": tira o lembrete e devolve o foco para a tela (o botão some junto com o aviso).
  async function exportLater(): Promise<void> {
    await app.dismissExportReminder();
    screenEl?.focus({ preventScroll: true });
  }

  function onAction(name: ActionName): void {
    // O timer do treino (aba Trilha) está rodando: a tecla que o para chega aqui também, e não pode trocar de aba nem abrir os atalhos.
    if (app.trainerRunning) return;
    switch (name) {
      case 'plus2':
        void (duelOn || duelEnd ? duelPenalize('+2') : penalize('+2'));
        return;
      case 'dnf':
        void (duelOn || duelEnd ? duelPenalize('DNF') : penalize('DNF'));
        return;
      case 'note':
        if (!duelOn && !duelEnd) void openNote(); // no desafio não há nota
        return;
      case 'delete':
        if (!duelOn && !duelEnd) void removeLast(); // nem excluir: não dá para refazer um embaralhamento
        return;
      case 'undo':
        void app.undoLast(); // o último "Desfazer": um solve, um lote excluído ou movido
        return;
      case 'next':
        if (!duelOn && !duelEnd) void app.nextScramble(); // o embaralhamento do desafio é o da vez
        return;
      case 'shortcuts':
        app.dialog = 'shortcuts';
        return;
      case 'tab1':
      case 'tab2':
      case 'tab3':
      case 'tab4':
      case 'tab5':
        app.tab = TAB_OF[name];
        return;
    }
  }

  // Qualquer entrada da pessoa acorda o Centro, conta a inatividade de novo (e destrava o áudio, que o navegador só libera num gesto).
  function onWake(): void {
    const wasSleeping = live.sleeping;
    live.wake(Date.now());
    armSleep();
    sound.unlock();
    if (wasSleeping) paint();
  }

  // O sono depois de 5 min parado: um temporizador só, refeito a cada entrada (sem laço contínuo). Se o timer estiver ocupado na hora,
  // confere de novo em 1 s.
  function armSleep(ms: number = SLEEP_AFTER): void {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      if (destroyed) return;
      if (live.sleepIfIdle(Date.now())) paint();
      else armSleep(1000);
    }, ms);
  }

  // Ao armar ou abrir a inspeção, a reação, o coach e a nota da solve anterior saem da tela.
  function onState(next: TimerState): void {
    if (destroyed) return;
    // O app sabe se o timer está ocupado (inspeção, armado, pronto ou rodando): o guia de instalação e o lembrete de exportar esperam.
    app.timerBusy = next === 'inspect' || next === 'arming' || next === 'ready' || next === 'running';
    document.body.dataset.tstate = next;
    document.body.classList.toggle('solving', next === 'running');
    if (next === 'running') {
      animator.freeze(); // nada do Centro roda no solve (spec 6.4), já neste quadro
      runningDuel = duelOn && app.duel.phase === 'solving' ? (duel?.id ?? null) : null; // o solve é do modo em que começou a correr
    }
    if (next === 'ready') sound.klick();
    if (next === 'inspect' || next === 'arming') {
      // As ações somem agora: se o foco estava nelas (ou na nota), ele vai para a tela, e não se perde no corpo do documento.
      if (focusInside()) screenEl?.focus({ preventScroll: true });
      live.clearReaction();
      coach = null;
      showResult = false;
      unstored = null;
      topHold = null;
      clearTimeout(topHoldTimer);
      closeNote();
    }
    kick();
  }

  function onDone(r: TimerResult): void {
    if (destroyed) return;
    sound.klick();
    const id = runningDuel;
    runningDuel = null;
    void (id !== null ? finishDuelSolve(r, id) : finishSolve(r));
  }

  // Trocar de sessão (ou de evento, que vem com a sessão) zera a tela, como o resetUi do protótipo.
  function resetForSession(): void {
    lastId = null;
    showResult = false;
    unstored = null;
    typedPending = null;
    closeNote();
    live.clearReaction();
    coach = null;
    if (timer.state !== 'running') timer.reset();
    kick();
  }

  // O foco está numa ação ou no campo da nota (o que some quando a tela arma de novo ou exclui).
  function focusInside(): boolean {
    const ativo = document.activeElement;
    return ativo !== null && screenEl !== undefined && screenEl.contains(ativo) && ativo.closest('[data-actions], [data-noteform]') !== null;
  }

  // Como o protótipo: o quadrado de hoje pulsa depois de cada solve. A classe pop vem de components.css.
  function popToday(): void {
    const hoje = screenEl?.querySelector<HTMLElement>('[data-heat] .today');
    if (!hoje) return;
    hoje.classList.remove('pop');
    void hoje.offsetWidth; // o reflow reinicia a animação
    hoje.classList.add('pop');
  }

  // ----- Efeitos: cada um limpa o que liga (ouvintes, laço, timers, bloqueio de tela) -----

  // Um solve que ficou na fila entra nos dados quando a fila grava: aí a tela o assume e as ações voltam.
  $effect(() => {
    const at = unstored;
    if (at === null || app.savePending > 0) return;
    const entrou = app.solves.find((x) => x.at === at);
    if (!entrou) return;
    untrack(() => {
      lastId = entrou.id;
      unstored = null;
      showResult = resting();
      typedPending = null;
      kick();
    });
  });

  // A tela parada não tem laço: o tempo, o resultado no body e o texto do coach leem dados que mudam fora dele (penalidade, desfazer,
  // outra aba, ajustes, toque). Quando eles mudam, um quadro novo.
  $effect(() => {
    void timeText();
    void idleText();
    void typingOn; // o tempo grande volta (ou sai) com o ajuste: um quadro novo o pinta
    void kind;
    void showResult;
    untrack(() => kick());
  });

  // Estado inicial do body e a limpeza na saída: o CSS da tela lê estes atributos.
  $effect(() => {
    untrack(() => {
      document.body.dataset.tstate = timer.state;
      paint();
      kick();
    });
    return () => {
      destroyed = true;
      loop.stop();
      animator.destroy();
      clearTimeout(chordTimer);
      clearTimeout(topHoldTimer);
      clearTimeout(sleepTimer);
      const body = document.body;
      body.classList.remove('solving');
      for (const k of ['tstate', 'cview', 'result', 'insp']) delete body.dataset[k];
      app.timerBusy = false; // sem a tela, o timer não está mais ocupado para ninguém
      app.pendingInspect = false;
    };
  });

  $effect(() => {
    const offs = [
      timer.on('state', onState),
      timer.on('warn', () => sound.tick()),
      timer.on('done', onDone),
      // O espaço segurado antes da inspeção: o timer ainda parece parado, mas já está ocupado (o aviso de nova versão espera).
      timer.on('pending', (held) => {
        app.pendingInspect = held;
      }),
    ];
    return () => offs.forEach((off) => off());
  });

  // Ajustes do aparelho e do evento: o timer e o toque seguem o que a pessoa escolheu.
  $effect(() => {
    const s = app.profile.settings;
    timer.setOptions({ holdMs: s.holdMs, inspection: s.inspection && eventInfo(playEvent).inspection });
    touch.setMode(s.mobileArm);
    sound.setEnabled('klick', s.sound.klick);
    sound.setEnabled('insp', s.sound.insp);
    sound.setEnabled('pb', s.sound.pb);
    // O modo silencioso (ligado no Centro) cala a mensagem que o coach está mostrando agora.
    if (s.silent && coach) {
      coach = null;
      kick();
    }
  });

  // Trocar de aba, de evento ou de sessão no meio do armar ou da inspeção abandona sem largar o timer. A primeira passada só
  // lembra o contexto: não há o que abandonar na montagem.
  let seen: { tab: Tab; event: EventId; session: string | null } | null = null;
  $effect(() => {
    const tab = app.tab;
    const event = app.event;
    const session = app.activeSession?.id ?? null;
    untrack(() => {
      const prev = seen;
      seen = { tab, event, session };
      if (!prev) return;
      if (tab !== prev.tab || event !== prev.event || session !== prev.session) controller?.abandonHold();
      if (session !== prev.session) resetForSession();
    });
  });

  // Entrar no modo desafio, sair dele ou trocar de desafio zera a tela, como trocar de sessão (o que estiver armado é abandonado). A
  // primeira passada só lembra: na montagem não há o que zerar.
  let duelSeen: string | null = null;
  $effect(() => {
    const key = duelOn ? (duel?.id ?? null) : null;
    untrack(() => {
      if (key === duelSeen) return;
      duelSeen = key;
      controller?.abandonHold();
      resetForSession();
    });
  });

  // Ligar ou desligar o modo Digitar zera a tela, como trocar de sessão (o resultado de um modo não é o do outro). A primeira passada só
  // lembra: na montagem não há o que zerar.
  let typingSeen: boolean | null = null;
  $effect(() => {
    const on = typingOn;
    untrack(() => {
      const prev = typingSeen;
      typingSeen = on;
      if (prev === null || prev === on) return;
      controller?.abandonHold();
      resetForSession();
    });
  });

  // B confere a penalidade (o solve gravado, ou o desafio reaberto nesse ponto): o Centro espera o ponto, com o anel apagado.
  $effect(() => {
    const waiting = duelOn && duelPhase === 'confirm';
    untrack(() => {
      if (saving) return; // o solve ainda grava: finishDuelSolve decide depois
      live.wait(waiting);
      kick();
    });
  });

  // A entrada liga-se às zonas e ao documento quando a tela existe, e desliga (abandonando o que estiver armado) ao sair.
  $effect(() => {
    const screen = screenEl;
    const zones = zonesEl;
    if (!screen || !zones) return;
    const ctl = createInputController(
      {
        timer,
        touch,
        tabIsTimer: () => app.tab === 'timer',
        dialogOpen: () => document.querySelector('dialog[open]') !== null,
        onAction,
        onWake,
        canArm: armable,
      },
      { coarse: () => coarseMq, armMode: () => app.profile.settings.mobileArm },
    );
    controller = ctl;
    const detach = ctl.attach(document, window, zones, screen);
    return () => {
      ctl.abandonHold();
      detach();
      if (controller === ctl) controller = null;
    };
  });

  // A tela acesa fica pedida só com a aba do Timer visível; sai ao trocar de aba ou esconder a página.
  $effect(() => {
    void wake.want(app.tab === 'timer' && pageVisible);
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
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = matchMedia('(pointer: coarse)');
    const sync = (): void => {
      darkMq = dark.matches;
      reduceMq = reduce.matches;
      coarseMq = coarse.matches;
    };
    sync();
    const all = [dark, reduce, coarse];
    all.forEach((mq) => mq.addEventListener('change', sync));
    return () => all.forEach((mq) => mq.removeEventListener('change', sync));
  });

  $effect(() => {
    untrack(() => armSleep());
    return () => clearTimeout(sleepTimer);
  });

  // O animador para com a página escondida, com o Centro fora da tela e fora da aba do Timer.
  $effect(() => {
    animator.setPaused(!pageVisible || !onScreen || app.tab !== 'timer' || mode === 'oculto');
  });
  $effect(() => {
    void mode; // o espaço do Centro some e volta com o ajuste: o observador passa para o novo
    const slot = screenEl?.querySelector('[data-centro-slot]');
    if (!slot || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
    });
    io.observe(slot);
    return () => io.disconnect();
  });
  // Animado, estático ou oculto (spec 6.5); movimento reduzido vale como estático.
  $effect(() => {
    animator.setAnimated(mode === 'animado' && !reduced());
  });
  // O SVG é refeito quando o tema, o acabamento ou as marcas mudam: o animador pinta nele o estado atual.
  $effect(() => {
    void theme;
    void app.profile.finish;
    void topShown;
    void sideLit;
    void tick().then(() => animator.repaint());
  });

  // Duas falhas seguidas do gerador: a tela sugere recarregar a página.
  $effect(() => {
    const failed = app.scrambleError;
    const text = app.scramble;
    untrack(() => {
      if (text !== '') failStreak = 0;
      else if (failed) failStreak += 1;
      reloadHint = failStreak >= 2;
    });
  });
</script>

<section
  class="screen timer"
  data-screen="timer"
  data-duel={duelOn ? duelPhase : undefined}
  aria-label={T.tabs.timer}
  hidden={app.tab !== 'timer' || duelEnd}
  tabindex="-1"
  bind:this={screenEl}
>
  <div class="t-main">
    {#if duelOn && duel && !wide.current}
      <DuelBoard {duel} score={app.duel.score} index={app.duel.index} wide={false} />
    {/if}
    {#if duelOn}
      <!-- Na revelação, o placar fica no lugar do embaralhamento (6b). -->
      {#if duelPhase !== 'reveal'}
        <ScrambleBlock
          event={playEvent}
          scramble={app.duel.scramble}
          error={false}
          reloadHint={false}
          pb={false}
          imageOn={app.profile.settings.scrambleImage}
          label={T.duel.scramble(app.duel.index + 1)}
        />
      {/if}
    {:else}
      <ScrambleBlock
        event={app.event}
        scramble={app.scramble}
        error={app.scrambleError}
        {reloadHint}
        pb={pbTag}
        imageOn={app.profile.settings.scrambleImage}
      />
    {/if}
    {#if app.savePending > 0 || app.saveStalled}
      <div class="save-warn">
        <p>{T.data.saveFailed}</p>
        <button type="button" class="btn" onclick={exportNow}>{T.data.exportNow}</button>
      </div>
    {/if}
    {#if typingOn}
      <TypedEntry onSave={saveTyped} closeKeyboard={coarseMq} />
      {#if typedParts}
        <!-- O último solve embaixo do campo (a maquete, 2d): o tempo do detalhe, e depois os chips e as ações de sempre. -->
        <div class="tc-last hx-time" aria-hidden="true"><span class="int">{typedParts.int}</span><span class="dec">{typedParts.dec}</span></div>
      {/if}
    {:else}
      <div class="time" data-time aria-hidden="true" bind:this={timeEl}></div>
    {/if}
    <!-- No desafio, B não tem chips (o placar é o dele): a linha some, sem deixar o vão. -->
    <div class="chips t-chips fade" data-chips hidden={duelOn && duelChips.length === 0}>
      {#if duelOn}
        {#each duelChips as c (c.n)}
          <span class="chip"><span class="chip-n">{c.n}</span>{c.text}</span>
        {/each}
      {:else}
        {#each chips as c, i (i)}
          <span class="chip" class:pb={c.pb}>{c.text}</span>
        {/each}
      {/if}
    </div>
    {#if reveal && revealTime}
      <!-- A revelação (6b): o selo do ponto e, logo abaixo do tempo de B, o do oponente naquele embaralhamento. -->
      <div class="dz-reveal" data-duel-reveal>
        <span class="dz-verdict" class:op={!reveal.mine}><Bidi text={reveal.verdict} /></span>
        <div class="dz-vs"><span class="label"><Bidi text={reveal.them} /></span><b>{revealTime.int}<span class="dec">{revealTime.dec}</span></b></div>
        {#if reveal.sub}<p class="dz-sub"><Bidi text={reveal.sub} /></p>{/if}
      </div>
    {/if}
    <ResultActions
      visible={actionsShown}
      plus2={duelOn ? duelLast?.penalty === '+2' : last?.penalty === '+2'}
      dnf={duelOn ? duelLast?.penalty === 'DNF' : last?.penalty === 'DNF'}
      note={duelOn ? '' : (last?.note ?? '')}
      {noteOpen}
      bind:noteValue
      bind:inputEl={noteInput}
      onPlus2={() => (duelOn ? duelPenalize('+2') : penalize('+2'))}
      onDnf={() => (duelOn ? duelPenalize('DNF') : penalize('DNF'))}
      onNote={() => openNote()}
      onDelete={() => removeLast()}
      onNoteSave={(text) => saveNote(text)}
      onNoteClose={closeNoteAndFocus}
      typedDnf={!duelOn && last !== null && isTypedDnf(last)}
      penaltiesOnly={duelOn}
    />
    {#if duelOn && duelPhase === 'confirm'}
      <!-- 6a: a penalidade antes do ponto. -->
      <button type="button" class="btn primary dz-wide dz-step" data-duel-see onclick={seePoint}>{T.duel.seePoint}</button>
      <p class="dz-note dz-step">{T.duel.checkPenalty}</p>
    {:else if duelOn && duelPhase === 'reveal'}
      <button type="button" class="btn primary dz-wide dz-step" data-duel-next onclick={nextPoint}>{T.duel.next}</button>
      {#if !app.duel.score?.over}
        <p class="dz-note dz-step">{T.duel.scramble(app.duel.index + 2)}</p>
      {/if}
    {/if}
    <!-- Lembrete de exportar: acima dos tiles. Só aparece parado (inativo ou com o solve pronto para a reação), nunca na inspeção, armado,
         pronto ou rodando. Quem tem conta não o vê (spec 9.4): entrar pelo convite o tira da tela. -->
    {#if app.exportReminder && !app.timerBusy && !app.account?.signedIn && !duelOn}
      <div class="export-reminder" data-export-reminder>
        <p>{T.reminder.text}</p>
        <span class="data-actions">
          <button type="button" class="btn" onclick={exportNow}>{T.data.exportNow}</button>
          {#if app.account?.available && !app.account.signedIn}
            <!-- Com a conta ligada no ambiente, o lembrete oferece também a nuvem (spec 9.4). -->
            <button type="button" class="btn" onclick={() => (app.dialog = 'signin')}>{T.conta.protect}</button>
          {/if}
          <button type="button" class="btn" onclick={exportLater}>{T.reminder.later}</button>
        </span>
      </div>
    {/if}
  </div>

  <aside class="t-side" aria-label={T.timer.side}>
    <div class="card t-coach" class:sem-centro={mode === 'oculto'}>
      {#if mode !== 'oculto'}
        <CentroView {theme} finish={app.profile.finish} topLit={topShown} {sideLit} />
      {/if}
      <div class="t-coachtext">
        <div class="label fade">{T.timer.coachLabel}</div>
        <p class="coach" class:quiet={coachShown === null} hidden={reviewing}>{coachShown ?? ''}</p>
      </div>
    </div>
    {#if duelOn && duel}
      {#if wide.current}
        <DuelBoard {duel} score={app.duel.score} index={app.duel.index} wide />
      {/if}
    {:else}
      <div class="card t-heat fade">
        <div class="card-h">
          <span class="label">{heat.label}</span>
          <span class="muted num">{heat.streak}</span>
        </div>
        <div class="heat" data-heat role="group" aria-label={heat.label}>
          {#each heat.cells as c (c.day)}
            <i role="img" class={c.cls} title={c.text} aria-label={c.text}></i>
          {/each}
          {#each heat.pads as p (p)}
            <i style="visibility:hidden"></i>
          {/each}
        </div>
      </div>
    {/if}
  </aside>

  <!-- No desafio, os tiles de média somem: os tempos dele não entram nas médias. -->
  {#if !duelOn}
    <div class="tiles t-tiles fade" data-tiles>
      {#each tiles as t (t.label)}
        <div class="tile">
          <small>{t.label}</small>
          <b>{t.value}</b>
          {#if t.sub}<em>{t.sub}</em>{/if}
        </div>
      {/each}
    </div>
  {/if}

  <Zones bind:el={zonesEl} one={app.profile.settings.mobileArm === 'one'} hidden={reviewing || typingOn} />
  <p class="t-hints fade muted">{hint}</p>
</section>

{#if duelEnd && app.tab === 'timer'}
  <DuelEnd {app} />
{/if}

<style>
  /* A tela recebe o foco quando uma ação some: ele continua visível, com o contorno dos controles. */
  .timer:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 4px;
  }

  .save-warn {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    padding: 10px 14px;
    border: 1px solid var(--arm);
    border-radius: var(--r-card);
    background: var(--surface);
    color: var(--arm-ink);
    font-size: 14px;
  }

  /* O lembrete de exportar é discreto: a borda e a cor do texto, sem o destaque do aviso de salvar. Pelo celular os tiles somem, e o
     lembrete vai para o fim da tela. */
  .export-reminder {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 12px;
    margin-top: 12px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    background: var(--surface);
    color: var(--ink-2);
    font-size: 14px;
  }

  .export-reminder p {
    margin: 0;
  }

  @media (max-width: 1023px) {
    .export-reminder {
      order: 9;
    }
  }
</style>
