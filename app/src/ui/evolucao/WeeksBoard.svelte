<script lang="ts">
  // O quadro "Semanas" da Evolução (a maquete aprovada, 1a–1c, 6a, 6c e 7a; spec §3): a linha dos últimos 28 dias e as últimas 12 semanas de
  // seg a dom, com solves, média, melhor e a mudança sobre a semana anterior. Segue o filtro de evento e sessão, sem o período, como os quadros
  // de recordes e de fases. A tabela é de papéis ARIA (como a lista de solves): no celular as células se arrumam em duas linhas por semana sem
  // perder a tabela. Sem solve nas 12 semanas, o quadro some.
  import { bestSingle, dayKey, formatMs } from '../../core/stats';
  import type { Solve } from '../../core/types';
  import { periodSummary, weekRows, type WeekRow } from '../../core/weeks';
  import { T } from '../../strings';
  import { weekLabel } from '../format';

  let { pool, now }: { pool: readonly Solve[]; now: number } = $props();
  const uid = $props.id();

  // As semanas e o resumo, por lista e por dia: o relógio da Evolução anda a cada minuto, e no mesmo dia, com a mesma lista, nada muda (um
  // solve novo troca a lista).
  let memo: { pool: readonly Solve[]; day: string; rows: WeekRow[]; summary: number | null } | null = null;
  const view = $derived.by(() => {
    const day = dayKey(now);
    if (memo?.pool !== pool || memo.day !== day) memo = { pool, day, rows: weekRows(pool, now), summary: periodSummary(pool, now) };
    return memo;
  });
  const rows = $derived(view.rows);
  const summary = $derived(view.summary);
  // O recorde do single do filtro: a semana cujo melhor é ele leva o losango da lista.
  const record = $derived(bestSingle(pool));

  // A diferença que o centésimo mostra: abaixo dele é "igual" (não vale "▼ 0.00 s").
  const same = (ms: number): boolean => Math.abs(ms) < 10;
  const dir = (r: WeekRow): 'down' | 'up' | 'same' | 'none' => (r.change === null ? 'none' : same(r.change) ? 'same' : r.change < 0 ? 'down' : 'up');
</script>

{#if rows.length > 0}
  <section class="card es-weeks" aria-labelledby="{uid}-h">
    <div class="card-h">
      <h2 class="label" id="{uid}-h">{T.semanas.title}</h2>
      <span class="muted">{T.semanas.scope}</span>
    </div>
    {#if summary !== null}
      <p class="es-sum">
        {#if same(summary)}{T.semanas.sumSame}{:else}{summary < 0 ? T.semanas.sumFell : T.semanas.sumRose}<b>{T.semanas.diff(Math.abs(summary))}</b>{T.semanas.sumEnd}{/if}
      </p>
    {/if}
    <div class="es-wks" role="table" aria-labelledby="{uid}-h" aria-describedby="{uid}-r">
      <div role="rowgroup">
        <div role="row" class="es-wk-h">
          <span role="columnheader">{T.semanas.cols.week}</span>
          <span role="columnheader">{T.semanas.cols.solves}</span>
          <span role="columnheader">{T.semanas.cols.mean}</span>
          <span role="columnheader">{T.semanas.cols.best}</span>
          <span role="columnheader">{T.semanas.cols.change}</span>
        </div>
      </div>
      <div role="rowgroup">
        {#each rows as r (r.start)}
          {@const d = dir(r)}
          <div role="row" class="es-wk" data-empty={r.count === 0 ? '' : undefined} data-now={r.current ? '' : undefined}>
            <span role="rowheader" class="es-w">{r.current ? T.semanas.now : weekLabel(r.start)}</span>
            {#if r.count === 0}
              <span role="cell" class="es-n">{T.semanas.none}</span>
              <span role="cell" class="es-a"></span>
              <span role="cell" class="es-b"></span>
              <span role="cell" class="es-c"></span>
            {:else}
              <span role="cell" class="es-n">{r.count}<span class="es-ph" aria-hidden="true">{T.semanas.solvesWord(r.count)}{r.dnf > 0 ? T.semanas.dot : ''}</span>{#if r.dnf > 0}<span class="es-dnf">{T.semanas.dnf(r.dnf)}</span>{/if}</span>
              <span role="cell" class="es-a">{r.mean === null ? T.semanas.dash : formatMs(r.mean)}</span>
              <span role="cell" class="es-b"><span class="es-ph" aria-hidden="true">{T.semanas.bestWord}</span>{r.best === null ? T.semanas.dash : formatMs(r.best)}{#if r.best !== null && r.best === record}<i class="hx-pb" role="img" aria-label={T.semanas.record}></i>{/if}</span>
              <span role="cell" class="es-c" data-d={d}>
                {#if d === 'none'}{T.semanas.dash}{:else if d === 'same'}{T.semanas.same}{:else}<span aria-hidden="true">{d === 'down' ? '▼ ' : '▲ '}</span>{T.semanas.diff(Math.abs(r.change ?? 0))}<span class="sr-only">{d === 'down' ? T.semanas.faster : T.semanas.slower}</span>{/if}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
    <p class="dz-note es-rule" id="{uid}-r">{T.semanas.rule}</p>
  </section>
{/if}
