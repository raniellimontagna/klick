<script lang="ts">
  // A tela do Timer (porte de prototype/scripts/app.js e ui/timer-view.js). Dona do timer, da entrada, da reação, do coach e da
  // pintura do tempo. O solve é gravado antes da reação: a reação só começa depois que o solve está em app.solves.
  import { tick, untrack } from 'svelte';
  import { pickCoachMessage } from '../../core/coach';
  import { eventInfo } from '../../core/events';
  import {
    achievedIds,
    averageOf,
    bestSingleSolve,
    currentStreak,
    effectiveMs,
    formatMs,
    formatSolve,
    monthHeat,
    type MilestoneId,
    officialAverage,
    officialAverageLabel,
    type ResultKind,
    resultKind,
    solveDeltas,
    solvesOnDay,
  } from '../../core/stats';
  import { createTimer, type Timer, type TimerResult, type TimerState } from '../../core/timer';
  import { createTouchArm } from '../../core/touch';
  import type { EventId, Solve } from '../../core/types';
  import { T } from '../../strings';
  import { daysAgoLabel, monthLabel } from '../format';
  import { type CentroView as Vista, eyesFor, ringFor, updateCentro } from '../centro';
  import { createSound } from '../sound';
  import { createWakeLock } from '../wakelock';
  import type { AppState, Tab } from '../state/app.svelte';
  import CentroView from './CentroView.svelte';
  import ResultActions from './ResultActions.svelte';
  import ScrambleBlock from './ScrambleBlock.svelte';
  import Zones from './Zones.svelte';
  import { type ActionName, createInputController, type InputController } from './input';
  import { createTimeLoop, paintTime } from './TimeDisplay';

  // Números do protótipo: a reação começa meio segundo depois da gravação e dura 2,5 s; o coach fala por 6 s.
  const REACTION_DELAY = 500;
  const REACTION_MS = 2500;
  const COACH_MS = 6000;
  const SLEEP_AFTER = 5 * 60000; // parado com o timer desligado por 5 min: o Centro dorme
  const ORBIT_MS = 950; // o adesivo ocioso dá uma volta no anel a cada passo

  const TAB_OF: Readonly<Record<'tab1' | 'tab2' | 'tab3' | 'tab4', Tab>> = {
    tab1: 'timer',
    tab2: 'evolucao',
    tab3: 'companion',
    tab4: 'ajustes',
  };

  type Chip = { text: string; pb: boolean };
  type Tile = { label: string; value: string; sub: string };
  type Cell = { day: number; cls: string; text: string };

  let { app }: { app: AppState } = $props();

  // Os solves da lista antes do solve dado (a lista vem em ordem de tempo).
  const before = (list: Solve[], solve: Solve | null): Solve[] => {
    if (!solve) return [];
    const i = list.findIndex((s) => s.id === solve.id);
    return i < 0 ? [] : list.slice(0, i);
  };
  // Os marcos valem só para os eventos que os têm (o 3×3, segundo o catálogo).
  const milestoneSolves = (list: Solve[]): Solve[] => list.filter((s) => eventInfo(s.event).milestones);

  // A inspeção vale quando o ajuste pede e o evento tem (o 3BLD não tem). Os ajustes do timer, do toque e do som entram pelo
  // efeito de ajustes, logo na montagem, antes de qualquer toque.
  const inspectionOn = (): boolean => app.profile.settings.inspection && eventInfo(app.event).inspection;
  const timer: Timer = createTimer({ now: () => performance.now() });
  const sound = createSound();
  const touch = createTouchArm({
    press: (at) => timer.press(at),
    release: (at) => timer.release(at),
    cancel: () => timer.cancel(),
    getState: () => timer.state,
    getInspection: inspectionOn,
  });
  const wake = createWakeLock();
  const loop = createTimeLoop(paint);

  // Elementos e estado que a tela desenha de novo. Os que mudam a cada quadro (tempo, anel, coach) são pintados à mão.
  let screenEl = $state<HTMLElement>();
  let zonesEl = $state<HTMLElement>();
  let noteInput = $state<HTMLInputElement>();
  let timeEl: HTMLElement | undefined;
  let lastId = $state<string | null>(null); // o solve que a tela mostra; null = o último da sessão
  let showResult = $state(false); // o solve está gravado e a pessoa ainda pode agir sobre ele
  let saving = $state(false); // gravação em voo: o tempo mostra o resultado do timer e os chips somem
  let unstored = $state<number | null>(null); // a gravação falhou: o instante (at) do solve que ficou na fila; o tempo segue o timer até ele entrar nos dados
  let deleting = $state(false);
  let noteOpen = $state(false);
  let noteValue = $state('');
  let coachShown = $state<string | null>(null);
  let sleeping = $state(false);
  let reloadHint = $state(false);
  let pageVisible = $state(true);
  let darkMq = $state(false);
  let reduceMq = $state(false);
  let coarseMq = $state(false);

  let noteId: string | null = null; // o solve que o formulário da nota está editando
  let reaction: { from: number; until: number } | null = null;
  let coach: { text: string; from: number; until: number } | null = null;
  let orbit = 0;
  let lastInput = Date.now();
  let chordTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let lastSvg: SVGElement | null = null;
  let lastSig = '';
  let failStreak = 0; // falhas seguidas do gerador de embaralhamentos
  let solveSeq = 0; // o último solve que a tela acompanha: uma gravação mais antiga que termina depois não mexe na tela
  let controller: InputController | null = null;

  const theme = $derived<'light' | 'dark'>(
    app.profile.settings.theme === 'system' ? (darkMq ? 'dark' : 'light') : app.profile.settings.theme === 'dark' ? 'dark' : 'light',
  );
  const reduced = (): boolean => app.profile.settings.reducedMotion === 'always' || reduceMq;

  // O solve que a tela mostra: o marcado, ou o último da sessão enquanto nenhum foi marcado (ou se o marcado sumiu).
  const last = $derived.by((): Solve | null => app.solves.find((s) => s.id === lastId) ?? app.sessionSolves.at(-1) ?? null);
  const eventBefore = $derived(before(app.eventSolves, last));
  const sessBefore = $derived(before(app.sessionSolves, last));
  const sessionNumber = $derived(last ? app.sessionSolves.findIndex((s) => s.id === last.id) + 1 : 0);
  const deltas = $derived(last ? solveDeltas(eventBefore, last, sessBefore) : null);
  const kind = $derived<ResultKind | null>(last ? resultKind(eventBefore, last, sessBefore) : null);
  const pbTag = $derived(showResult && kind === 'pb');
  const actionsShown = $derived(showResult && last !== null);

  // Enquanto a fila segura o solve, a tela mostra o tempo do timer e não mostra os chips (o solve não está nos dados ainda).
  const holding = $derived(unstored !== null);

  const chips = $derived.by((): Chip[] => {
    const d = deltas;
    if (!last || !d || saving || deleting || holding) return [];
    const out: Chip[] = [];
    if (d.vsAvg !== null) out.push({ text: T.chips.vsAvg(d.vsAvg, d.avgN), pb: false });
    if (d.isPb && d.vsPb !== null) out.push({ text: T.chips.newPb(-d.vsPb), pb: true });
    else if (d.vsPb !== null) out.push({ text: T.chips.vsPb(d.vsPb), pb: false });
    out.push({ text: T.chips.solveN(sessionNumber), pb: false });
    return out;
  });

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

  // Os marcos conquistados percorrem o histórico inteiro: a conta é guardada por lista (a mesma lista não se conta duas vezes) e
  // não roda no caminho do solve. A contagem do Centro é atualizada numa macrotarefa depois de cada mudança dos solves.
  const achievedMemo = new WeakMap<Solve[], MilestoneId[]>();
  const achievedOf = (list: Solve[]): MilestoneId[] => {
    let ids = achievedMemo.get(list);
    if (!ids) {
      ids = achievedIds(milestoneSolves(list), Date.now());
      achievedMemo.set(list, ids);
    }
    return ids;
  };
  let topLit = $state(0);
  $effect(() => {
    const list = app.solves;
    const later = setTimeout(() => {
      topLit = achievedOf(list).length;
    }, 0);
    return () => clearTimeout(later);
  });
  const sideLit = $derived(app.profile.trail.filter(Boolean).length);

  // ----- Texto e pintura (a cada quadro, sem passar pelo Svelte) -----

  function idleText(): string {
    if (!coarseMq) return inspectionOn() ? T.coach.idleInsp : T.coach.idle;
    if (inspectionOn()) return T.coach.idleInspTouch;
    return app.profile.settings.mobileArm === 'one' ? T.coach.idleOne : T.coach.idleTouch;
  }

  function centroView(now: number): Vista {
    if (sleeping) return { state: 'sleep' };
    if (timer.state === 'inspect') return { state: 'inspect', inspectElapsed: timer.inspectElapsed };
    if (timer.state === 'arming') return { state: 'arming', armProgress: timer.armProgress };
    if (timer.state === 'ready' || timer.state === 'running') return { state: timer.state };
    if (reaction && now < reaction.from) return { state: 'running' }; // ainda imóvel: a reação vem depois
    if (reaction && now < reaction.until) return { state: 'reaction', result: kind ?? undefined };
    return { state: 'idle', orbit: reduced() ? null : orbit };
  }

  function coachFor(view: Vista, now: number): string | null {
    if (coach && now >= coach.from && now < coach.until) return coach.text;
    if (timer.state === 'inspect') return T.coach.inspect;
    if (timer.state === 'arming') return T.coach.arming;
    if (timer.state === 'ready') return T.coach.ready;
    if (view.state === 'running' || view.state === 'reaction') return null;
    return idleText();
  }

  // O resultado que o timer acabou de dar, antes de o solve entrar na lista (+2 soma os 2 s).
  function resultText(r: TimerResult): string {
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
    return last ? formatSolve(last) : T.timer.zero;
  }

  function paintCentro(view: Vista): void {
    const svg = screenEl?.querySelector<SVGElement>('[data-centro-slot] svg.centro') ?? null;
    if (!svg) return;
    const ring = ringFor(view);
    const eyes = eyesFor(view);
    const sig = `${ring.join()}|${eyes}`;
    // Um SVG novo (o tema ou as marcas mudaram) sempre recebe o anel atual, mesmo que a assinatura seja a mesma.
    if (svg === lastSvg && sig === lastSig) return;
    updateCentro(svg, { ring, eyes, theme, finish: app.profile.finish });
    lastSvg = svg;
    lastSig = sig;
  }

  function needsFrame(now: number): boolean {
    if (['inspect', 'arming', 'ready', 'running'].includes(timer.state)) return true;
    if (reaction && now < reaction.until) return true;
    return coach !== null && now < coach.until;
  }

  // Um quadro: o timer avança (pronto e os avisos da inspeção saem daqui), depois tempo, Centro, atributos do body e coach.
  // Devolve true enquanto o laço precisa continuar.
  function paint(): boolean {
    if (destroyed) return false;
    timer.tick();
    const now = performance.now();
    const view = centroView(now);
    const body = document.body;
    body.dataset.cview = view.state;
    body.dataset.result = timer.state === 'done' && showResult && kind ? kind : '';
    const e = timer.inspectElapsed;
    body.dataset.insp = timer.state === 'inspect' ? (e > 15000 ? 'over' : e >= 12000 ? '12' : e >= 8000 ? '8' : '') : '';
    if (timeEl) paintTime(timeEl, timeText());
    paintCentro(view);
    coachShown = coachFor(view, now);
    return needsFrame(now);
  }

  function kick(): void {
    if (!destroyed) loop.kick();
  }

  // ----- Solve: gravar, depois reagir -----

  // Uma tecla ou toque que para o timer chega aqui. A gravação acontece antes de qualquer reação.
  async function finishSolve({ ms, penalty }: TimerResult): Promise<void> {
    const mine = ++solveSeq;
    const now = Date.now();
    const sessionAtStart = app.activeSession?.id ?? null;
    const eventList = app.eventSolves;
    const sessionList = app.sessionSolves;
    const prevAnyAt = app.solves.at(-1)?.at;
    const listBefore = app.solves; // os marcos de antes são contados depois, na lista que estava aqui (a gravação não espera por eles)
    saving = true;
    unstored = null;
    showResult = false;
    lastId = null;
    reaction = null;
    coach = null;
    closeNote();
    kick();
    // O finally vale mesmo se a gravação lançar: sem ele, o tempo ficaria preso no resultado do timer.
    const solve = await app.addSolve({ ms, penalty, at: now }).finally(() => {
      if (mine === solveSeq) saving = false;
    });
    // Um solve mais novo já tomou a tela, ou ela fechou, ou a sessão mudou: nada disso é mais deste solve.
    if (destroyed || mine !== solveSeq || app.activeSession?.id !== sessionAtStart) {
      kick();
      return;
    }
    // A gravação falhou: o solve ficou na fila e o aviso fixo aparece. O tempo fica na tela até o solve entrar nos dados.
    if (!solve) {
      unstored = now;
      kick();
      return;
    }
    lastId = solve.id;
    // A pessoa já armou de novo: o solve está gravado (e aparece nos dados), mas a reação não entra por cima. O tempo final
    // ainda é anunciado.
    if (timer.state !== 'done') {
      app.announce(T.aria.final(formatSolve(solve)));
      kick();
      return;
    }
    showResult = true;
    kick();
    // O resultado e as ações já estão na tela. Os marcos e o coach vêm numa macrotarefa depois, para a conta não atrasar o quadro;
    // se a pessoa armou de novo ou outro solve tomou a tela nesse intervalo, a reação não entra.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (destroyed || mine !== solveSeq) return;
    if (timer.state !== 'done') {
      app.announce(T.aria.final(formatSolve(solve)));
      kick();
      return;
    }
    const milestone = eventInfo(solve.event).milestones;
    const milestonesBefore = milestone ? achievedOf(listBefore) : [];
    const after = milestone ? achievedOf(app.solves) : [];
    const fresh = milestone ? after.filter((id) => !milestonesBefore.includes(id)) : [];
    const s = app.profile.settings;
    const msg = pickCoachMessage({
      solve,
      history: eventList,
      sessionSolves: sessionList,
      newMilestones: fresh,
      achievedCount: after.length,
      dailyGoal: s.dailyGoal,
      todayCount: solvesOnDay(app.solves, solve.at).length,
      prevAnyAt,
      silent: s.silent,
      event: solve.event,
    });
    const t0 = performance.now();
    reaction = { from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + REACTION_MS };
    coach = msg ? { text: msg.text, from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + COACH_MS } : null;
    clearTimeout(chordTimer);
    if (kind === 'pb') {
      chordTimer = setTimeout(() => {
        if (reaction && kind === 'pb' && timer.state === 'done') sound.chord();
      }, REACTION_DELAY);
    }
    app.announce(`${T.aria.final(formatSolve(solve))}${msg ? ` ${msg.text}` : ''}`);
    kick();
    await tick();
    popToday();
  }

  // Ações sobre o último solve. Só valem enquanto o solve está gravado e o timer parado no resultado.
  async function penalize(p: '+2' | 'DNF'): Promise<void> {
    const solve = last;
    if (!solve || timer.state !== 'done' || !showResult || deleting) return;
    coach = null;
    kick();
    await app.setPenalty(solve.id, solve.penalty === p ? null : p);
    const updated = app.solves.find((s) => s.id === solve.id);
    if (updated) app.announce(T.aria.final(formatSolve(updated)));
  }

  async function removeLast(): Promise<void> {
    const solve = last;
    if (!solve || timer.state !== 'done' || !showResult || deleting) return;
    const hadFocus = focusInside(); // as ações vão sumir: se o foco estava nelas, ele volta para a tela do Timer
    deleting = true;
    reaction = null;
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
    if (!solve || timer.state !== 'done' || !showResult || deleting) return;
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
    switch (name) {
      case 'plus2':
        void penalize('+2');
        return;
      case 'dnf':
        void penalize('DNF');
        return;
      case 'note':
        void openNote();
        return;
      case 'delete':
        void removeLast();
        return;
      case 'undo':
        void app.undoDelete();
        return;
      case 'next':
        void app.nextScramble();
        return;
      case 'shortcuts':
        app.dialog = 'shortcuts';
        return;
      case 'tab1':
      case 'tab2':
      case 'tab3':
      case 'tab4':
        app.tab = TAB_OF[name];
        return;
    }
  }

  // Qualquer entrada da pessoa acorda o Centro (e destrava o áudio, que o navegador só libera num gesto).
  function onWake(): void {
    lastInput = Date.now();
    sound.unlock();
    if (sleeping) {
      sleeping = false;
      paint();
    }
  }

  // Ao armar ou abrir a inspeção, a reação, o coach e a nota da solve anterior saem da tela.
  function onState(next: TimerState): void {
    if (destroyed) return;
    // O app sabe se o timer está ocupado (inspeção, armado, pronto ou rodando): o guia de instalação e o lembrete de exportar esperam.
    app.timerBusy = next === 'inspect' || next === 'arming' || next === 'ready' || next === 'running';
    document.body.dataset.tstate = next;
    document.body.classList.toggle('solving', next === 'running');
    if (next === 'ready') sound.klick();
    if (next === 'inspect' || next === 'arming') {
      // As ações somem agora: se o foco estava nelas (ou na nota), ele vai para a tela, e não se perde no corpo do documento.
      if (focusInside()) screenEl?.focus({ preventScroll: true });
      reaction = null;
      coach = null;
      showResult = false;
      unstored = null;
      closeNote();
    }
    kick();
  }

  function onDone(r: TimerResult): void {
    if (destroyed) return;
    sound.klick();
    void finishSolve(r);
  }

  // Trocar de sessão (ou de evento, que vem com a sessão) zera a tela, como o resetUi do protótipo.
  function resetForSession(): void {
    lastId = null;
    showResult = false;
    unstored = null;
    closeNote();
    reaction = null;
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
      showResult = timer.state === 'done';
      kick();
    });
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
      clearTimeout(chordTimer);
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
    timer.setOptions({ holdMs: s.holdMs, inspection: s.inspection && eventInfo(app.event).inspection });
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

  // Órbita do adesivo ocioso e sono depois de 5 min parado.
  $effect(() => {
    const id = setInterval(() => {
      if (!sleeping && Date.now() - lastInput > SLEEP_AFTER && (timer.state === 'idle' || timer.state === 'done')) sleeping = true;
      if (!document.hidden && centroView(performance.now()).state === 'idle' && !reduced()) orbit += 1;
      paint();
    }, ORBIT_MS);
    return () => clearInterval(id);
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

<section class="screen timer" data-screen="timer" aria-label={T.tabs.timer} hidden={app.tab !== 'timer'} tabindex="-1" bind:this={screenEl}>
  <div class="t-main">
    <ScrambleBlock
      event={app.event}
      scramble={app.scramble}
      error={app.scrambleError}
      {reloadHint}
      pb={pbTag}
      imageOn={app.profile.settings.scrambleImage}
    />
    {#if app.savePending > 0 || app.saveStalled}
      <div class="save-warn">
        <p>{T.data.saveFailed}</p>
        <button type="button" class="btn" onclick={exportNow}>{T.data.exportNow}</button>
      </div>
    {/if}
    <div class="time" data-time aria-hidden="true" bind:this={timeEl}></div>
    <div class="chips t-chips fade" data-chips>
      {#each chips as c, i (i)}
        <span class="chip" class:pb={c.pb}>{c.text}</span>
      {/each}
    </div>
    <ResultActions
      visible={actionsShown}
      plus2={last?.penalty === '+2'}
      dnf={last?.penalty === 'DNF'}
      note={last?.note ?? ''}
      {noteOpen}
      bind:noteValue
      bind:inputEl={noteInput}
      onPlus2={() => penalize('+2')}
      onDnf={() => penalize('DNF')}
      onNote={() => openNote()}
      onDelete={() => removeLast()}
      onNoteSave={(text) => saveNote(text)}
      onNoteClose={closeNoteAndFocus}
    />
    <!-- Lembrete de exportar: acima dos tiles. Só aparece parado (inativo ou com o solve pronto para a reação), nunca na inspeção, armado,
         pronto ou rodando. -->
    {#if app.exportReminder && !app.timerBusy}
      <div class="export-reminder" data-export-reminder>
        <p>{T.reminder.text}</p>
        <span class="data-actions">
          <button type="button" class="btn" onclick={exportNow}>{T.data.exportNow}</button>
          <button type="button" class="btn" onclick={exportLater}>{T.reminder.later}</button>
        </span>
      </div>
    {/if}
  </div>

  <aside class="t-side" aria-label={T.timer.side}>
    <div class="card t-coach">
      <CentroView {theme} finish={app.profile.finish} {topLit} {sideLit} />
      <div class="t-coachtext">
        <div class="label fade">{T.timer.coachLabel}</div>
        <p class="coach" class:quiet={coachShown === null}>{coachShown ?? ''}</p>
      </div>
    </div>
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
  </aside>

  <div class="tiles t-tiles fade" data-tiles>
    {#each tiles as t (t.label)}
      <div class="tile">
        <small>{t.label}</small>
        <b>{t.value}</b>
        {#if t.sub}<em>{t.sub}</em>{/if}
      </div>
    {/each}
  </div>

  <Zones bind:el={zonesEl} one={app.profile.settings.mobileArm === 'one'} />
  <p class="t-hints fade muted">{T.timer.hints}</p>
</section>

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
