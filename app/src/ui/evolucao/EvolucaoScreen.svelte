<script lang="ts">
  // A tela da Evolução (porte de prototype/scripts/ui/evolucao-view.js): indicadores, gráfico, distribuição e histórico.
  // Os filtros são evento, sessão (só as do evento escolhido) e período; o evento segue a sessão atual até a pessoa escolher um.
  // Os números vêm de core/stats.ts e os gráficos de ui/charts.ts. Os textos ficam em strings.ts.
  import { EVENTS } from '../../core/events';
  import {
    averageOf,
    bestSingle,
    effectiveMs,
    formatMs,
    formatSolve,
    meanOf,
    officialAverage,
    officialAverageLabel,
    pbFlags,
    rollingAverages,
    stdDevMs,
  } from '../../core/stats';
  import type { EventId, Solve } from '../../core/types';
  import { T } from '../../strings';
  import { type Bin, evolutionChart, histogramBins } from '../charts';
  import { relativeTime, truncate } from '../format';
  import type { AppState } from '../state/app.svelte';

  type Period = keyof typeof T.evolucao.periods;
  interface Kpi {
    label: string;
    value: string;
    sub: string;
    pb: boolean;
  }
  interface Row {
    id: string;
    number: number;
    time: string;
    pb: boolean;
    plus2: boolean;
    note: string;
    avg: string;
    scramble: string;
    when: string;
  }

  const DAY = 86400000;
  const PERIODS: readonly Period[] = ['7', '30', 'all'];
  const TABLE_ROWS = 30; // os últimos solves do período que a tabela mostra

  let { app }: { app: AppState } = $props();

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

  function onEvent(select: HTMLSelectElement): void {
    const next = eventOf(select.value);
    if (next) eventPick = next;
  }

  function onSession(select: HTMLSelectElement): void {
    sessionPick = select.value;
  }

  // Os solves do filtro: o evento escolhido e, se houver, a sessão.
  const pool = $derived(app.solves.filter((s) => s.event === event && (sessionId === 'all' || s.sessionId === sessionId)));

  // O período parte o filtro: os solves antes dele são a comparação dos indicadores.
  const split = $derived.by(() => {
    const start = period === 'all' ? -Infinity : Date.now() - Number(period) * DAY;
    const offset = pool.findIndex((x) => x.at >= start);
    const first = offset < 0 ? pool.length : offset;
    return { first, before: pool.slice(0, first), inPeriod: pool.slice(first) };
  });

  const flags = $derived(pbFlags(pool));
  const times = $derived(split.inPeriod.map(effectiveMs));
  // Média oficial em cada ponto (Ao5, ou Mo3 no 6×6 e no 7×7): a linha do gráfico.
  const officialSeries = $derived(rollingOfficial(pool, official));
  // Média de 5 em cada ponto: a coluna da tabela.
  const ao5Series = $derived(rollingAverages(pool, 5));

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

  const rows = $derived.by((): Row[] => {
    const now = Date.now();
    const out: Row[] = [];
    const lowest = Math.max(split.first, pool.length - TABLE_ROWS);
    for (let i = pool.length - 1; i >= lowest; i--) {
      const x = pool[i];
      out.push({
        id: x.id,
        number: i + 1,
        time: formatSolve(x),
        pb: flags[i],
        plus2: x.penalty === '+2',
        note: x.note,
        avg: formatMs(ao5Series[i]),
        scramble: truncate(x.scramble, 28),
        when: relativeTime(x.at, now),
      });
    }
    return out;
  });
</script>

<section class="screen" data-screen="evolucao" aria-label={T.tabs.evolucao} hidden={app.tab !== 'evolucao'}>
  <div class="page-h">
    <h1>{T.tabs.evolucao}</h1>
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
          <i class:hl={i === hlIndex} style="height: {Math.max(2, (b.count / maxCount) * 100)}%" title="{formatMs(b.from)}–{formatMs(b.to)}: {b.count}"></i>
        {/each}
      </div>
      <div class="bars-x">
        {#if bins.length}
          <span>{axisFrom}</span><span>{axisTo}</span>
        {/if}
      </div>
    </div>
  </div>

  <div class="card hist">
    <table>
      <thead>
        <tr>
          <th>{T.evolucao.columns.number}</th>
          <th>{T.evolucao.columns.time}</th>
          <th>{T.tiles.avg(5)}</th>
          <th class="scr">{T.evolucao.columns.scramble}</th>
          <th>{T.evolucao.columns.when}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.id)}
          <tr>
            <td class="num">{r.number}</td>
            <td>
              {r.time}
              {#if r.pb}<span class="tag pb">{T.evolucao.pbTag}</span>{:else if r.plus2}<span class="tag">{T.timer.plus2}</span>{/if}
              {#if r.note}<small class="note">{truncate(r.note, 48)}</small>{/if}
            </td>
            <td>{r.avg}</td>
            <td class="scr">{r.scramble}</td>
            <td>{r.when}</td>
          </tr>
        {:else}
          <tr><td colspan="5" class="muted">{T.evolucao.empty}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
