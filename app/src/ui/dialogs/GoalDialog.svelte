<script lang="ts">
  // A folha de uma meta (a maquete aprovada, 3a, 3b, 3d, 3e e 7c, 7d, 7f; spec §5): o tipo (single, média de 5 ou de 12), o evento e o tempo
  // ("abaixo de"). Embaixo do tempo, duas linhas que seguem o que se digita: como a meta fica (vazio ou torto, a dica; o erro só ao salvar,
  // como no Digitar, e some assim que o campo muda) e o seu melhor agora no tipo e no evento escolhidos, com o quanto falta, ou a data com que
  // ela nasce alcançada. Salvar fecha e a meta entra no quadro (sem comemorar); se o AppState recusa (o limite, ou a meta sumiu), a folha fica.
  // Editar tem Excluir, que pede o segundo toque (como as outras exclusões) e fecha.
  //
  // Abre por app.openGoal(id, event): a nova começa em Single, no evento do filtro da Evolução; a de editar, com o tipo, o evento e o alvo da
  // própria meta (o alvo como se digita: "13", "12.5", "1:30"). A meta é lida ao vivo de app.profile.goals: se some com a folha aberta
  // (excluída noutro aparelho), ela fecha sem aviso.
  import { tick, untrack } from 'svelte';
  import { EVENTS, eventInfo } from '../../core/events';
  import { formatTarget, type GoalKind, goalPhrase, type GoalSeries, goalSeries, parseGoalTarget } from '../../core/goals';
  import { formatMs } from '../../core/stats';
  import type { EventId, Solve } from '../../core/types';
  import { T } from '../../strings';
  import { confirmReady } from '../confirm';
  import { fullDate } from '../format';
  import type { AppState, GoalRequest } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();
  const uid = $props.id();

  const KINDS: readonly GoalKind[] = ['single', 'ao5', 'ao12'];

  let dialogEl = $state<HTMLDialogElement>();
  let inputEl = $state<HTMLInputElement>();
  let kind = $state<GoalKind>('single');
  let event = $state<EventId>('333');
  let text = $state('');
  let error = $state<'bad' | 'range' | null>(null); // só ao salvar
  let armed = $state(false); // "Excluir" espera o segundo toque
  let armedAt: number | null = null; // a hora do primeiro: o segundo antes de CONFIRM_DELAY_MS é o toque duplo e não vale
  let busy = $state(false);
  let loaded: GoalRequest | null = null; // o pedido cujos valores estão nos campos
  let initial: { text: string; ms: number } | null = null; // o alvo da meta de editar, como abriu: sem mexer no texto, vai o de antes

  const request = $derived(app.goalRequest);
  const editId = $derived(request?.id ?? null);
  const gone = $derived(editId !== null && app.profile.goals[editId] === undefined);
  // Aberta pelo pai (open) e enquanto o diálogo da vez é este: fechar por dentro (onclose) a fecha mesmo antes de o pai refazer o open.
  const shown = $derived(open && app.dialog === 'goal' && request !== null && !gone);

  // A meta sumiu com a folha aberta (ou o pedido chegou sem ela): libera o estado, e o modal fecha a folha.
  $effect(() => {
    if (app.dialog === 'goal' && gone) untrack(() => (app.dialog = null));
  });

  // Um pedido novo enche os campos (antes de desenhar): a meta nova, vazia; a de editar, com a própria meta. Depois, só a pessoa mexe neles.
  $effect.pre(() => {
    const r = request;
    if (!shown || r === null || r === loaded) return;
    untrack(() => {
      loaded = r;
      const goal = r.id === null ? undefined : app.profile.goals[r.id];
      kind = goal?.kind ?? 'single';
      event = goal?.event ?? r.event;
      text = goal ? formatTarget(goal.targetMs).replace(/ s$/, '') : '';
      initial = goal ? { text, ms: goal.targetMs } : null;
      error = null;
      disarm();
    });
  });

  // A prévia, só com a folha aberta: os solves do evento em todas as sessões (como a meta conta), o melhor do tipo e, se o alvo é válido e o
  // histórico já passou dele, a data com que ela nasce alcançada (a do primeiro solve que chegou). A série de cada evento e tipo fica guardada
  // enquanto a folha está aberta com os mesmos solves: digitar o alvo não a refaz, e voltar a um tipo ou evento já visto também não.
  let seen: { solves: readonly Solve[]; series: Map<string, GoalSeries> } | null = null;
  function seriesOf(solves: readonly Solve[], ev: EventId, k: GoalKind): GoalSeries {
    if (seen?.solves !== solves) seen = { solves, series: new Map() };
    const key = `${ev} ${k}`;
    let s = seen.series.get(key);
    if (!s) seen.series.set(key, (s = goalSeries(solves.filter((x) => x.event === ev), k)));
    return s;
  }
  const parsed = $derived(parseGoalTarget(text));
  const series = $derived(seriesOf(app.solves, event, kind));
  const best = $derived(series.best);
  const reach = $derived(parsed.ok && best !== null && best < parsed.ms ? series.reach(parsed.ms) : null);

  function disarm(): void {
    armed = false;
    armedAt = null;
  }

  // Fechou por qualquer caminho (Esc, Cancelar, fundo, Salvar, Excluir, a meta sumida): libera a folha, se ainda for esta. O modal devolve o
  // foco a quem a abriu; se ele saiu da tela (a linha da meta excluída, o "Criar uma meta" que virou a lista), o foco vai para o botão de
  // criar do quadro.
  function onclose(): void {
    disarm();
    loaded = null;
    initial = null;
    seen = null;
    error = null;
    if (app.dialog === 'goal') app.dialog = null;
    void tick().then(() => {
      if (document.activeElement === document.body) document.querySelector<HTMLElement>('.es-metas .es-new')?.focus();
    });
  }

  async function save(): Promise<void> {
    if (busy || !request) return;
    // O texto do tempo como abriu vale o alvo de antes, e não o que ele lê: editar só o tipo ou o evento não mexe no alvo.
    const p = initial !== null && text === initial.text ? ({ ok: true, ms: initial.ms } as const) : parseGoalTarget(text);
    if (!p.ok) {
      // Vazio não é erro: o campo volta a ter o foco.
      if (p.reason === 'empty') inputEl?.focus();
      else error = p.reason;
      return;
    }
    busy = true;
    try {
      const ok = await app.saveGoal({ ...(request.id === null ? {} : { id: request.id }), kind, event, targetMs: p.ms });
      if (ok) dialogEl?.close();
    } finally {
      busy = false;
    }
  }

  // Excluir pede o segundo toque (o primeiro arma). Depois, a meta some de app.profile.goals e a folha fecha.
  async function remove(): Promise<void> {
    if (busy || editId === null) return;
    if (!armed) {
      armed = true;
      armedAt = Date.now();
      return;
    }
    if (!confirmReady(armedAt, Date.now())) return;
    busy = true;
    try {
      if (await app.deleteGoal(editId)) dialogEl?.close();
    } finally {
      busy = false;
      disarm();
    }
  }

  // Enter salva (com composição de texto em andamento, o IME só confirma a letra: o Safari a termina com um Enter de keyCode 229).
  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.isComposing && e.keyCode !== 229) void save();
  }
</script>

<dialog bind:this={dialogEl} class="sheet es-sheet" aria-labelledby="{uid}-t" use:modal={{ open: shown, onclose }}>
  {#if shown && request}
    <h2 id="{uid}-t">{request.id === null ? T.metas.newTitle : T.metas.editTitle}</h2>
    <p class="muted es-intro">{request.id === null ? T.metas.newIntro : T.metas.editIntro}</p>

    <div class="hx-sec">
      <div class="label" id="{uid}-k">{T.metas.kindLabel}</div>
      <div class="seg" role="group" aria-labelledby="{uid}-k">
        {#each KINDS as k (k)}
          <button type="button" aria-pressed={kind === k ? 'true' : 'false'} onclick={() => (kind = k)}>{T.metas.kind[k]}</button>
        {/each}
      </div>
    </div>

    <div class="hx-sec">
      <label class="label" for="{uid}-e">{T.metas.eventLabel}</label>
      <select class="es-field" id="{uid}-e" bind:value={event}>
        {#each EVENTS as ev (ev.id)}
          <option value={ev.id}>{ev.name}</option>
        {/each}
      </select>
    </div>

    <div class="hx-sec">
      <label class="label" for="{uid}-t-in">{T.metas.targetLabel}</label>
      <input
        type="text"
        class="es-field"
        id="{uid}-t-in"
        inputmode="decimal"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="done"
        placeholder={T.metas.placeholder}
        aria-describedby="{uid}-m {uid}-b"
        aria-invalid={error ? 'true' : undefined}
        bind:value={text}
        bind:this={inputEl}
        oninput={() => (error = null)}
        onkeydown={onKey}
      />
      <!-- Como a meta fica (a região viva, como na maquete: o erro ao salvar é lido) e o seu melhor agora. -->
      <p class="tc-msg" class:err={error !== null} id="{uid}-m" aria-live="polite">{#if error}{error === 'range' ? T.metas.range : T.metas.bad}{:else if parsed.ok}{T.metas.fica}<b>{goalPhrase({ kind, targetMs: parsed.ms })}</b>{T.metas.end}{:else}{T.metas.hint}{/if}</p>
      <p class="tc-msg" id="{uid}-b">{#if best === null}{T.metas.noTime(kind, eventInfo(event).name)}{:else if reach !== null}{T.metas.born(fullDate(reach))}{:else}{T.metas.bestNow}<b>{formatMs(best)}</b>{T.metas.end}{#if parsed.ok}{T.metas.leftNow(best - parsed.ms)}{/if}{/if}</p>
    </div>

    <div class="row">
      <button type="button" class="btn primary" onclick={save}>{T.metas.save}</button>
      {#if request.id !== null}
        <button type="button" class="btn danger" disabled={busy} onclick={remove}>{armed ? T.metas.confirmAgain : T.metas.remove}</button>
      {/if}
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.metas.cancel}</button>
    </div>
  {/if}
</dialog>
