<script lang="ts">
  // A tela da Evolução (porte de prototype/scripts/ui/evolucao-view.js): indicadores, gráfico, distribuição e a lista inteira do filtro
  // (SolveList, o histórico inteiro: do mais novo ao mais antigo, com a seleção).
  // Os filtros são evento, sessão (só as do evento escolhido) e período; o evento segue a sessão atual até a pessoa escolher um.
  // Os números vêm de core/stats.ts e os gráficos de ui/charts.ts. Os textos ficam em strings.ts.
  //
  // Os desafios (a maquete aprovada do desafio, 9a a 9c): com pelo menos um guardado, o cartão "Desafios" no topo, fora dos filtros (os
  // desafios não entram nos números), com o resumo e o mini placar do último; ele abre a lista, e a lista abre a partida. Onde a tela está
  // fica em app.evolucaoView. Sem desafios, a tela é a de sempre.
  import { tick, untrack } from 'svelte';
  import { EVENTS } from '../../core/events';
  import {
    averageOf,
    bestSingle,
    effectiveMs,
    formatMs,
    meanOf,
    officialAverage,
    officialAverageLabel,
    pbFlags,
    rollingAverages,
    stdDevMs,
  } from '../../core/stats';
  import type { Duel, EventId, Solve } from '../../core/types';
  import { T } from '../../strings';
  import { type Bin, evolutionChart, histogramBins } from '../charts';
  import { duelsSummary, miniBoardOf } from '../duel/duel-view';
  import MiniPlacar from '../duel/MiniPlacar.svelte';
  import type { AppState } from '../state/app.svelte';
  import { scoreOf } from '../state/duel.svelte';
  import DuelList from './DuelList.svelte';
  import DuelMatch from './DuelMatch.svelte';
  import type { Series } from './rows';
  import SolveList from './SolveList.svelte';

  type Period = keyof typeof T.evolucao.periods;
  interface Kpi {
    label: string;
    value: string;
    sub: string;
    pb: boolean;
  }

  const DAY = 86400000;
  const PERIODS: readonly Period[] = ['7', '30', 'all'];

  let { app }: { app: AppState } = $props();
  const uid = $props.id();

  // O relógio da tela: a hora de montagem, atualizada a cada minuto enquanto a tela existe. Sem ele, a janela do período e o ano da data
  // na lista ficariam presos no último momento em que algo mudou (as derivadas não se refazem sozinhas com o tempo).
  const CLOCK_MS = 60000;
  let now = $state(Date.now());

  $effect(() => {
    const clock: ReturnType<typeof setInterval> = setInterval(() => {
      now = Date.now();
    }, CLOCK_MS);
    return () => clearInterval(clock);
  });

  // A escolha de evento e de sessão; o evento segue a sessão atual enquanto a pessoa não escolhe um.
  let eventPick = $state<EventId | null>(null);
  let sessionPick = $state('all');
  let period = $state<Period>('30');

  const eventOf = (value: string): EventId | null => EVENTS.find((e) => e.id === value)?.id ?? null;
  const event = $derived<EventId>(eventPick ?? app.event);
  const official = $derived(officialAverageLabel(event)); // { n, kind }: Ao5 ou Mo3, pelo catálogo
  const eventSessions = $derived(app.sessions.filter((s) => s.event === event));
  // Uma sessão de outro evento não fica escolhida: o seletor volta para "Todas as sessões".
  const sessionId = $derived(eventSessions.some((s) => s.id === sessionPick) ? sessionPick : 'all');

  // Trocar de evento volta a "Todas as sessões": a sessão escolhida num evento não fica valendo quando se volta a ele.
  function onEvent(select: HTMLSelectElement): void {
    const next = eventOf(select.value);
    if (!next) return;
    eventPick = next;
    sessionPick = 'all';
  }

  function onSession(select: HTMLSelectElement): void {
    sessionPick = select.value;
  }

  // Os solves do filtro: o evento escolhido e, se houver, a sessão.
  const pool = $derived(app.solves.filter((s) => s.event === event && (sessionId === 'all' || s.sessionId === sessionId)));

  // O período parte o filtro: os solves antes dele são a comparação dos indicadores.
  const split = $derived.by(() => {
    const start = period === 'all' ? -Infinity : now - Number(period) * DAY;
    const offset = pool.findIndex((x) => x.at >= start);
    const first = offset < 0 ? pool.length : offset;
    return { first, before: pool.slice(0, first), inPeriod: pool.slice(first) };
  });

  const flags = $derived(pbFlags(pool));
  const times = $derived(split.inPeriod.map(effectiveMs));
  // Médias de 5 e de 12 em cada ponto (as colunas da lista), uma vez por filtro: a lista só formata as linhas que desenha.
  const ao5Series = $derived(rollingAverages(pool, 5));
  const ao12Series = $derived(rollingAverages(pool, 12));
  const series = $derived<Series>({ ao5: ao5Series, ao12: ao12Series, pb: flags });
  // Média oficial em cada ponto (Ao5, ou Mo3 no 6×6, no 7×7 e no 3BLD): a linha do gráfico. Na Ao5, é a mesma série da lista.
  const officialSeries = $derived(official.kind === 'ao' && official.n === 5 ? ao5Series : rollingOfficial(pool, official));

  function rollingOfficial(list: Solve[], { n, kind }: { n: number; kind: 'ao' | 'mo' }): (number | null)[] {
    if (kind === 'ao') return rollingAverages(list, n);
    return list.map((_, i) => (i + 1 < n ? null : meanOf(list.slice(i + 1 - n, i + 1), n)));
  }

  function variation(now: number | null, then: number | null): string {
    if (now === null || then === null || now === Infinity || then === Infinity) return T.timer.none;
    const d = now - then;
    if (Math.abs(d) < 10) return T.evolucao.noChange;
    return T.evolucao.delta(d);
  }

  const kpis = $derived.by((): Kpi[] => {
    const { before, inPeriod } = split;
    const cell = (label: string, value: number | null, then: number | null, pb = false): Kpi => ({
      label,
      value: formatMs(value),
      pb,
      sub: period === 'all' ? ' ' : variation(value, then),
    });
    const sd = stdDevMs(inPeriod);
    return [
      cell(T.tiles.record, bestSingle(pool), bestSingle(before), true),
      cell(T.tiles.avg(official.n), officialAverage(pool, event), officialAverage(before, event)),
      cell(T.tiles.avg(12), averageOf(pool, 12), averageOf(before, 12)),
      cell(T.tiles.avg(100), averageOf(pool, 100), averageOf(before, 100)),
      {
        label: T.evolucao.stdDev,
        value: sd === null ? T.timer.none : T.evolucao.stdDevValue(sd),
        pb: false,
        sub: period === 'all' ? T.evolucao.stdDevPeriod : variation(sd, stdDevMs(before)),
      },
    ];
  });

  const chart = $derived(evolutionChart({ times, ao5: officialSeries.slice(split.first), pb: flags.slice(split.first) }));

  const bins = $derived(histogramBins(times));
  const current = $derived(officialAverage(pool, event));
  const maxCount = $derived(bins.reduce((m, b) => Math.max(m, b.count), 1));
  const hlIndex = $derived(current === null ? -1 : bins.findIndex((b) => current >= b.from && current < b.to));
  const counted = $derived(bins.reduce((sum, b) => sum + b.count, 0));
  const top = $derived(bins.reduce<Bin | undefined>((a, b) => (!a || b.count > a.count ? b : a), undefined));
  const barsLabel = $derived(top ? T.evolucao.barsSummary(counted, formatMs(top.from), formatMs(top.to)) : T.evolucao.barsEmpty);
  const distLabel = $derived(
    hlIndex >= 0 ? `${T.evolucao.distribution} · ${T.evolucao.highlight(official.n, formatMs(current))}` : T.evolucao.distribution,
  );
  const axisFrom = $derived(bins.length ? formatMs(bins[0].from).slice(0, -3) : '');
  const axisTo = $derived(bins.length ? formatMs(bins[bins.length - 1].to).slice(0, -3) : '');

  // Os desafios guardados (fora da lixeira), relidos a cada aviso de mudança neles. null enquanto a primeira leitura não volta: o cartão e
  // a lista esperam, sem piscar. Uma leitura que falha deixa o que havia e avisa, se a pessoa está na lista ou numa partida; se nem a
  // primeira voltou, não há o que mostrar ali, e a tela volta aos números (nunca fica em branco).
  let duels = $state.raw<Duel[] | null>(null);
  let reading = 0;
  $effect(() => {
    void app.duelChanges;
    const mine = ++reading;
    untrack(() => app.listDuels()).then(
      (list) => {
        if (mine === reading) duels = list;
      },
      () => {
        if (mine !== reading || app.evolucaoView.kind === 'stats') return;
        app.showToast(T.data.readFailed);
        if (duels === null) app.evolucaoView = { kind: 'stats' };
      },
    );
  });

  const view = $derived(app.evolucaoView);
  const latest = $derived(duels?.[0] ?? null);
  const latestBoard = $derived(latest ? miniBoardOf(latest, scoreOf(latest)) : null);
  const summary = $derived(duels ? duelsSummary(duels) : '');
  const opened = $derived(view.kind === 'duel' ? (duels?.find((d) => d.id === view.id) ?? null) : null);

  // A partida aberta que sumiu (para a lixeira, noutra aba ou aqui) volta à lista; sem nenhum desafio guardado (o último excluído, um wipe),
  // a Evolução volta a ser a de sempre, como a de quem nunca desafiou.
  $effect(() => {
    if (view.kind === 'stats' || duels === null) return;
    if (duels.length === 0) untrack(() => (app.evolucaoView = { kind: 'stats' }));
    else if (view.kind === 'duel' && opened === null) untrack(() => (app.evolucaoView = { kind: 'duels' }));
  });

  // Trocar de vista (o cartão, uma linha, voltar, excluir) tira da tela o botão tocado: o foco que caiu no body vai para o título da vista
  // nova; de volta aos números, para o cartão, ou, sem ele (o último desafio excluído), para o título da Evolução. A tela que abre já numa
  // lista ou numa partida ("Ver em Desafios", que sai da tela com o toque) faz o mesmo; abrir nos números não mexe no foco.
  let shownView: string | null = null;
  $effect(() => {
    const kind = view.kind;
    const key = view.kind === 'duel' ? `duel:${view.id}` : kind;
    const ready = duels !== null;
    untrack(() => {
      if (!ready || key === shownView) return;
      const first = shownView === null;
      shownView = key;
      if (first && kind === 'stats') return;
      void tick().then(() => {
        const active = document.activeElement;
        if (active !== null && active !== document.body) return;
        const root = document.querySelector('[data-screen="evolucao"]');
        const target =
          kind === 'stats'
            ? (root?.querySelector<HTMLElement>('[data-duels-entry]') ?? root?.querySelector<HTMLElement>('[data-evo-title]'))
            : root?.querySelector<HTMLElement>('[data-evo-heading]');
        target?.focus();
      });
    });
  });

  // Mudar um filtro (evento, sessão, período) monta a lista de novo: a seleção some com ele, e um lote nunca age sobre solves que
  // saíram da lista.
  const listKey = $derived(`${event}|${sessionId}|${period}`);

  // Tocar numa linha (ou Enter nela) abre o solve. A folha do detalhe ainda não existe: por enquanto, nada abre.
  function openSolve(_id: string): void {}
</script>

<section class="screen" data-screen="evolucao" aria-label={T.tabs.evolucao}>
  {#if view.kind !== 'stats'}
    {#if opened}
      <DuelMatch {app} duel={opened} {now} />
    {:else if duels && duels.length > 0}
      <DuelList {app} {duels} {now} />
    {/if}
  {:else}
    <div class="page-h">
      <h1 tabindex="-1" data-evo-title>{T.tabs.evolucao}</h1>
      <select class="pill" data-evo-event aria-label={T.evolucao.eventLabel} value={event} onchange={(e) => onEvent(e.currentTarget)}>
        {#each EVENTS as ev (ev.id)}
          <option value={ev.id}>{ev.name}</option>
        {/each}
      </select>
      <select class="pill" data-evo-session aria-label={T.evolucao.sessionLabel} value={sessionId} onchange={(e) => onSession(e.currentTarget)}>
        <option value="all">{T.evolucao.allSessions}</option>
        {#each eventSessions as s (s.id)}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
      <div class="seg" role="group" aria-label={T.evolucao.periodLabel}>
        {#each PERIODS as p (p)}
          <button type="button" data-period={p} aria-pressed={period === p ? 'true' : 'false'} onclick={() => (period = p)}>{T.evolucao.periods[p]}</button>
        {/each}
      </div>
    </div>

    {#if duels && latest && latestBoard}
      <!-- 9a: o nome é o resumo; o mini placar do último desafio fica de descrição. -->
      <button
        type="button"
        class="card dz-entry"
        data-duels-entry
        aria-label="{T.duel.entryLabel}, {summary}"
        aria-describedby="{uid}-last"
        onclick={() => app.openDuels()}
      >
        <span><span class="label">{T.duel.entryLabel}</span><span>{summary}</span></span>
        <MiniPlacar board={latestBoard} id="{uid}-last" />
        <span class="dz-chev" aria-hidden="true">›</span>
      </button>
    {/if}

    <div class="kpis">
      {#each kpis as k (k.label)}
        <div class="tile">
          <small>{k.label}</small>
          <b class:pb={k.pb}>{k.value}</b>
          <em>{k.sub}</em>
        </div>
      {/each}
    </div>

    <div class="evo-grid">
      <div class="card">
        <div class="label">{T.evolucao.chartLabel(official.n)}</div>
        {@html chart}
      </div>
      <div class="card">
        <div class="label">{distLabel}</div>
        <div class="bars" role="img" aria-label={barsLabel}>
          {#each bins as b, i (b.from)}
            <i class:hl={i === hlIndex} style="height: {Math.max(2, (b.count / maxCount) * 100)}%" title="{b.open ? T.evolucao.binOpen(formatMs(b.from)) : `${formatMs(b.from)}–${formatMs(b.to)}`}: {b.count}"></i>
          {/each}
        </div>
        <div class="bars-x">
          {#if bins.length}
            <span>{axisFrom}</span><span>{axisTo}</span>
          {/if}
        </div>
      </div>
    </div>

    {#key listKey}
      <SolveList {app} {pool} start={split.first} {series} {now} onOpen={openSolve} />
    {/key}
  {/if}
</section>
