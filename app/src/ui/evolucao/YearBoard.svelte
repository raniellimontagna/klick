<script lang="ts">
  // O ano de treino da Evolução (a maquete aprovada, 1b, 1c, 2a, 6c e 7b; spec §4): 53 colunas de seg a dom, um quadradinho por dia nos tons do
  // mapa do mês, a sequência atual, a maior e os dias treinados. Conta todos os eventos e sessões (nunca o filtro). A grade é só desenho
  // (aria-hidden): o leitor lê o texto do período e um item por mês. A dica do dia é do toque e do mouse: o toque abre e fecha no mesmo dia
  // (e some ao tocar fora ou rolar), o mouse abre por cima e fecha ao sair da grade; dia futuro não tem dica. Sem solve nenhum, o quadro some.
  import { tick, untrack } from 'svelte';
  import type { Solve } from '../../core/types';
  import { type YearCalendar, type YearDay, yearCalendar } from '../../core/year';
  import { T } from '../../strings';
  import { fullDate, shortDate } from '../format';

  let { solves, now }: { solves: readonly Solve[]; now: number } = $props();
  const uid = $props.id();

  const cal = $derived<YearCalendar>(yearCalendar(solves, now));
  const days = $derived(cal.weeks.flat());
  // O meio-dia de hoje: a maior sequência só mostra o dia e o mês quando cabe inteira entre a primeira coluna e hoje.
  const todayTs = $derived(days.find((d) => d.today)!.ts);

  // O mês sobre a coluna em que ele começa: a primeira cujo dia de segunda já é dele (a primeira coluna sempre leva o seu).
  const labels = $derived.by(() => {
    const out: { col: number; name: string }[] = [];
    let last = -1;
    cal.weeks.forEach((week, i) => {
      const m = new Date(week[0]!.ts).getMonth();
      if (m === last) return;
      last = m;
      out.push({ col: i + 1, name: T.date.monthsShort[m]! });
    });
    return out;
  });

  const bestRange = $derived.by(() => {
    const { from, to } = cal.best;
    if (from === null || to === null) return '';
    const inside = from >= cal.start && to <= todayTs;
    return T.constancia.range((inside ? shortDate : fullDate)(from), (inside ? shortDate : fullDate)(to));
  });
  const monthLabel = (ts: number): { name: string; year: number } => {
    const d = new Date(ts);
    return { name: T.date.months[d.getMonth()]!, year: d.getFullYear() };
  };

  // Só o nível e o anel de hoje vão na classe; o dia sem solve leva o tom 0 (a regra base) e o futuro some sem sair da grade.
  const cellClass = (d: YearDay): string => (d.future ? 'fut' : [d.level > 0 && `l${d.level}`, d.today && 'today'].filter(Boolean).join(' '));

  // A dica: o dia (índice na grade, de segunda da primeira coluna em diante) e o quadradinho onde ela aponta.
  let shown = $state<number | null>(null);
  const tipDay = $derived(shown === null ? null : days[shown]!);
  let root = $state<HTMLElement>();
  let tipEl = $state<HTMLElement>();
  let scroller = $state<HTMLElement>();
  let cellEl: HTMLElement | null = null;
  let pointer = 'touch'; // o último tipo de ponteiro dentro da grade: o clique do toque alterna, o do mouse só abre
  let more = $state(false); // há semanas à esquerda: a borda esmaece

  // O balão fica acima do quadradinho, dentro do cartão, com a ponta apontando para ele.
  function place(): void {
    if (!root || !tipEl || !cellEl) return;
    const c = root.getBoundingClientRect();
    const r = cellEl.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const mid = r.left + r.width / 2 - c.left;
    const left = Math.max(10, Math.min(c.width - w - 10, mid - w / 2));
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${r.top - c.top - tipEl.offsetHeight - 8}px`;
    tipEl.style.setProperty('--ax', `${mid - left}px`);
  }

  async function show(cell: HTMLElement): Promise<void> {
    const i = Number(cell.dataset.i);
    if (days[i]!.future) return hide();
    cellEl = cell;
    shown = i;
    await tick();
    place();
  }

  function hide(): void {
    shown = null;
    cellEl = null;
  }

  const cellOf = (e: Event): HTMLElement | null => (e.target instanceof HTMLElement && e.target.dataset.i !== undefined ? e.target : null);

  function onOver(e: PointerEvent): void {
    pointer = e.pointerType;
    const cell = cellOf(e);
    if (e.pointerType === 'mouse' && cell) void show(cell);
  }

  function onDown(e: PointerEvent): void {
    pointer = e.pointerType;
  }

  function onLeave(e: PointerEvent): void {
    if (e.pointerType === 'mouse') hide();
  }

  function onClick(e: MouseEvent): void {
    const cell = cellOf(e);
    if (!cell) return;
    if (pointer !== 'mouse' && shown === Number(cell.dataset.i)) hide();
    else void show(cell);
  }

  // Tocar fora da grade fecha a dica.
  function onWindowDown(e: PointerEvent): void {
    if (shown !== null && !(e.target instanceof Element && e.target.closest('.es-cal-g'))) hide();
  }

  function onScroll(e: Event): void {
    more = (e.currentTarget as HTMLElement).scrollLeft > 1;
    hide();
  }

  // Abre na semana de hoje (a última coluna): só importa quando a grade passa da largura, no celular.
  $effect(() => {
    const el = scroller;
    if (!el) return;
    untrack(() => {
      el.scrollLeft = el.scrollWidth;
      more = el.scrollLeft > 1;
    });
  });
</script>

<svelte:window onpointerdown={onWindowDown} />

{#if solves.length > 0}
  <section class="card es-year" bind:this={root} aria-labelledby="{uid}-h">
    <div class="card-h">
      <h2 class="label" id="{uid}-h">{T.constancia.title}</h2>
      <span class="muted">{T.constancia.scope}</span>
    </div>
    <p class="sr-only">
      {T.constancia.period(
        fullDate(cal.start),
        fullDate(todayTs),
        cal.daysTrained,
        cal.solves,
        T.constancia.days(cal.current.days),
        T.constancia.streakSr(cal.best.days, bestRange),
      )}
    </p>
    <ul class="sr-only">
      {#each cal.months as m (m.ts)}
        {@const l = monthLabel(m.ts)}
        <li>{T.constancia.month(l.name, l.year, m.days, m.solves)}</li>
      {/each}
    </ul>
    <div class="es-cal" aria-hidden="true">
      <div class="es-cal-d">
        <span>{T.date.weekdaysShort[1]}</span><span></span><span>{T.date.weekdaysShort[3]}</span><span></span><span>{T.date.weekdaysShort[5]}</span><span></span><span></span>
      </div>
      <div class="es-cal-s" data-scroll-end data-more={more ? '' : undefined} bind:this={scroller} onscroll={onScroll}>
        <div class="es-cal-m">
          {#each labels as l (l.col)}
            <span style="grid-column:{l.col}">{l.name}</span>
          {/each}
        </div>
        <!-- A grade é só desenho (o leitor tem o texto acima): o toque e o mouse mexem na dica, sem papel nem teclado. -->
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="es-cal-g" onpointerover={onOver} onpointerdown={onDown} onpointerleave={onLeave} onclick={onClick}>
          {#each days as d, i (d.ts)}
            <i class={cellClass(d)} data-i={i}></i>
          {/each}
        </div>
      </div>
    </div>
    <div class="es-legend" aria-hidden="true">{T.constancia.less}<span></span><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><span></span>{T.constancia.more}</div>
    <dl class="es-stats">
      <div>
        <dt>{T.constancia.current}</dt>
        <dd>{T.constancia.days(cal.current.days)}{#if cal.current.days > 0}<em>{T.constancia.since(shortDate(cal.current.from!))}</em>{/if}</dd>
      </div>
      <div>
        <dt>{T.constancia.best}</dt>
        <dd>{T.constancia.days(cal.best.days)}{#if cal.best.days > 0}<em>{bestRange}</em>{/if}</dd>
      </div>
      <div>
        <dt>{T.constancia.trained}</dt>
        <dd>{T.constancia.days(cal.daysTrained)}<em>{T.constancia.of(cal.periodDays)}</em></dd>
      </div>
    </dl>
    {#if tipDay}
      <div class="es-tip" bind:this={tipEl} aria-hidden="true"><b>{T.constancia.tipCount(tipDay.count)}</b>{T.constancia.tipDay(T.date.weekdaysShort[new Date(tipDay.ts).getDay()]!, fullDate(tipDay.ts))}</div>
    {/if}
  </section>
{/if}
