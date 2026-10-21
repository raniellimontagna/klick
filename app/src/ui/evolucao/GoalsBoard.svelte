<script lang="ts">
  // O quadro "Metas" da Evolução (a maquete aprovada, 1b, 1c, 3c, 6b, 7b e 7e; spec §5): uma linha por meta, com o nome, a etiqueta do evento,
  // o quanto falta e a barra, que vai do melhor de quando a meta nasceu até o alvo; alcançada, a data e a barra cheia no dourado dos marcos.
  // As em andamento primeiro, as alcançadas no fim, cada grupo na ordem em que nasceram. Conta além do filtro (todas as sessões do evento de
  // cada meta) e diz isso no cabeçalho. Cada linha abre a folha da meta; "Nova meta" abre a folha nova no evento do filtro (`event`). Com
  // GOAL_MAX metas ou mais (o sync pode trazer uma sétima), "Nova meta" fica desligado, no Tab, com o motivo. Sem metas, o convite.
  import { eventInfo } from '../../core/events';
  import { type Goal, GOAL_MAX, goalName, type GoalSeries, goalSeries, goalStatus } from '../../core/goals';
  import { formatMs } from '../../core/stats';
  import type { EventId, Solve } from '../../core/types';
  import { T } from '../../strings';
  import { fullDate } from '../format';
  import type { AppState } from '../state/app.svelte';

  let { app, event }: { app: AppState; event: EventId } = $props();
  const uid = $props.id();

  interface Row {
    id: string;
    name: string;
    tag: string;
    done: boolean;
    left: number | null; // em andamento: o quanto falta (vai em negrito, antes do melhor)
    text: string; // o resto da linha de baixo ("· melhor 0:13.58"), ou ela inteira (a data, "ainda sem…")
    pct: number; // a barra
    label: string;
  }

  // O estado de cada meta, numa conta por mudança (das metas ou dos solves): os solves de cada evento saem numa passada só, na ordem de
  // app.solves (cronológica), e a série de cada evento e tipo uma vez, dividida pelas metas do par.
  const rows = $derived.by((): Row[] => {
    const entries = Object.entries(app.profile.goals);
    const byEvent = new Map<EventId, Solve[]>(entries.map(([, g]) => [g.event, []]));
    for (const s of app.solves) byEvent.get(s.event)?.push(s);
    const series = new Map<string, GoalSeries>();
    const seriesOf = (event: EventId, kind: Goal['kind']): GoalSeries => {
      const key = `${event} ${kind}`;
      let s = series.get(key);
      if (!s) series.set(key, (s = goalSeries(byEvent.get(event)!, kind)));
      return s;
    };
    return entries
      .map(([id, goal]) => ({ id, goal, status: goalStatus(goal, byEvent.get(goal.event)!, seriesOf(goal.event, goal.kind)) }))
      .sort((a, b) => Number(a.status.reachedAt !== null) - Number(b.status.reachedAt !== null) || a.goal.createdAt - b.goal.createdAt || (a.id < b.id ? -1 : 1))
      .map(({ id, goal, status: { best, reachedAt, start, progress, left } }): Row => {
        const name = goalName(goal);
        const tag = eventInfo(goal.event).short;
        const row = { id, name, tag, done: false, left: null };
        if (reachedAt !== null) {
          const date = fullDate(reachedAt);
          const shown = best === null ? null : formatMs(best);
          const text = `${T.metas.reached(date)}${shown === null ? '' : T.metas.best(shown)}`;
          return { ...row, done: true, text, pct: 100, label: T.metas.rowReached(name, tag, date, shown) };
        }
        if (best === null || left === null) {
          const none = T.metas.none[goal.kind];
          return { ...row, text: none, pct: 0, label: T.metas.rowNone(name, tag, none) };
        }
        const pct = Math.round(progress * 100);
        return { ...row, left, text: T.metas.best(formatMs(best)), pct, label: T.metas.rowGoing(name, tag, formatMs(best), left, pct, formatMs(start)) };
      });
  });

  const full = $derived(rows.length >= GOAL_MAX);

  // Desligado é aria-disabled: o botão segue no Tab (o leitor lê o motivo) e o toque não faz nada.
  function create(): void {
    if (!full) app.openGoal(null, event);
  }
</script>

<section class="card es-metas" aria-labelledby="{uid}-h">
  <div class="card-h">
    <h2 class="label" id="{uid}-h">{T.metas.title}</h2>
    <span class="muted">{T.metas.scope}</span>
  </div>
  {#if rows.length === 0}
    <p class="es-empty">{T.metas.empty}</p>
    <button type="button" class="btn primary es-new" onclick={create}>{T.metas.create}</button>
  {:else}
    <ul class="es-goals">
      {#each rows as r (r.id)}
        <li>
          <button type="button" class="es-goal" data-done={r.done ? '' : undefined} aria-label={r.label} onclick={() => app.openGoal(r.id, event)}>
            <span class="es-goal-n">{r.name}<span class="tag">{r.tag}</span></span>
            <span class="es-goal-v">{#if r.left !== null}<b>{T.metas.left(r.left)}</b>{/if}{r.text}</span>
            <span class="es-bar" style:--p="{r.pct}%"><i></i></span>
            <span class="dz-chev" aria-hidden="true">›</span>
          </button>
        </li>
      {/each}
    </ul>
    <button
      type="button"
      class="btn es-new"
      aria-disabled={full ? 'true' : undefined}
      aria-describedby={full ? `${uid}-why` : undefined}
      onclick={create}>{T.metas.new}</button
    >
    {#if full}<p class="tc-why" id="{uid}-why">{T.metas.full}</p>{/if}
  {/if}
</section>
