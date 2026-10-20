<script lang="ts">
  // O detalhe de um solve (a maquete aprovada, estados 3 e 8b–8c): uma folha como as outras (.sheet). Mostra o tempo grande, a penalidade
  // (OK / +2 / DNF: um seletor de três valores, que já refaz médias e recordes), a data, o evento e a sessão, as médias de 5 e de 12 que
  // terminam nele, o selo de recorde (um botão: abre a folha do recorde), o embaralhamento (com a imagem, se o ajuste deixa) e a nota. Muda só a penalidade, a nota, a sessão
  // (Mover, pela folha de mover) e a lixeira; o tempo e o embaralhamento não.
  //
  // Abre por app.openSolve(id, sessionId): o solve é lido ao vivo de app.solves (uma penalidade nova aparece na hora), e as médias, o número
  // e o recorde vêm da mesma conta da lista, o filtro de onde ele foi aberto (o pool sai de app.solves, no mesmo evento e na mesma sessão
  // da lista, em vez de a lista passar o seu). Se o solve some com a folha aberta (excluído em outra aba), ela fecha sem aviso.
  import { untrack } from 'svelte';
  import { eventInfo } from '../../core/events';
  import { effectiveMs, formatMs, formatSolve, RECORD_SIZES } from '../../core/stats';
  import type { Penalty } from '../../core/types';
  import { T } from '../../strings';
  import { copyText } from '../clipboard';
  import { confirmReady } from '../confirm';
  import { poolStats } from '../evolucao/pool-stats';
  import { copyTextOf } from '../evolucao/rows';
  import { dateLabel, timeOfDay } from '../format';
  import type { AppState, RecordKind } from '../state/app.svelte';
  import ScrambleImage from '../timer/ScrambleImage.svelte';
  import { modal } from './modal';

  let { app }: { app: AppState } = $props();
  const uid = $props.id();

  let dialogEl = $state<HTMLDialogElement>();
  let noteEl = $state<HTMLInputElement>();
  let draft = $state(''); // o texto do campo da nota
  let armed = $state(false); // "Excluir" espera o segundo toque
  let armedAt: number | null = null; // a hora do primeiro: o segundo antes de CONFIRM_DELAY_MS é o toque duplo e não vale
  let busy = $state(false);
  let saving: string | null = null; // a nota que está sendo gravada: sair do campo e tocar em Salvar não gravam duas vezes
  let then: (() => void) | null = null; // a folha que abre quando esta fechar (Mover, o selo do recorde)

  const request = $derived(app.solveRequest);
  const solve = $derived(app.dialog === 'solve' && request ? app.solves.find((s) => s.id === request.id) : undefined);
  const open = $derived(solve !== undefined);

  // O solve sumiu com a folha aberta: libera o estado, e o modal fecha a folha.
  $effect(() => {
    if (app.dialog === 'solve' && request && !solve) untrack(() => (app.dialog = null));
  });

  // O rascunho da nota segue a nota gravada (outro solve, ou a nota mudou noutra aba), menos enquanto a pessoa digita nele.
  $effect(() => {
    void solve?.id;
    const note = solve?.note ?? '';
    untrack(() => {
      if (document.activeElement !== noteEl) draft = note;
    });
  });

  // Tudo o que a folha mostra do solve, só com ela aberta: o número no filtro, as médias que terminam nele e em que recordes ele está (o
  // melhor single, ou uma janela da melhor média). O pool é o do filtro da lista; se o solve já não cai nele (outra aba o moveu), a sessão
  // dele. As médias e os recordes são a conta da lista (pool-stats.ts): aberta da lista, a folha não refaz nada.
  const view = $derived.by(() => {
    if (!solve || !request) return null;
    let sessionId = request.sessionId; // o filtro da conta (o do selo, também)
    let stats = poolStats(app.solves, solve.event, sessionId);
    let at = stats.pool.findIndex((s) => s.id === solve.id);
    if (at < 0) {
      sessionId = solve.sessionId;
      stats = poolStats(app.solves, solve.event, sessionId);
      at = stats.pool.findIndex((s) => s.id === solve.id);
    }
    const ao5 = stats.series.ao5[at] ?? null;
    const ao12 = stats.series.ao12[at] ?? null;
    const best = stats.records;
    // O selo é um só, como na maquete: o maior recorde em que ele está (a janela de uma média de n termina em bestEnd e tem n solves); sem
    // nenhuma média, o recorde de single, se for o caso.
    let record: RecordKind | null = best.single.bestEnd === at ? 'single' : null;
    for (const n of RECORD_SIZES) {
      const end = best.averages[n].bestEnd;
      if (end !== null && end - n + 1 <= at && at <= end) record = n;
    }
    return { number: at + 1, ao5: formatMs(ao5), ao12: formatMs(ao12), record, sessionId };
  });

  // O tempo grande: "0:15" e ".24+" (o decimal menor, como no Timer); o DNF não tem ponto e vai inteiro.
  const shown = $derived(solve ? formatSolve(solve) : '');
  const cut = $derived(shown.indexOf('.'));
  const sec = $derived(cut < 0 ? shown : shown.slice(0, cut));
  const cs = $derived(cut < 0 ? '' : shown.slice(cut));
  const spoken = $derived(
    !solve ? '' : solve.penalty === '+2' ? T.historico.plus2Spoken(formatMs(effectiveMs(solve))) : solve.penalty === 'DNF' ? T.actions.dnf : shown,
  );
  const raw = $derived(
    !solve || solve.penalty === null ? '' : solve.penalty === '+2' ? T.historico.rawPlus2(formatMs(solve.ms)) : T.historico.rawDnf(formatMs(solve.ms)),
  );
  // "seg, 19 out, 21:30 · 3×3 · Principal": de outro ano, a data leva o ano. Uma sessão que já não existe fica de fora.
  const meta = $derived.by(() => {
    if (!solve) return '';
    const year = new Date(solve.at).getFullYear();
    const day = `${dateLabel(solve.at)}${year === new Date().getFullYear() ? '' : ` ${year}`}, ${timeOfDay(solve.at)}`;
    const session = app.sessions.find((s) => s.id === solve.sessionId)?.name;
    return [day, eventInfo(solve.event).name, session].filter((part) => part !== undefined && part !== '').join(' · ');
  });

  const PENALTIES: readonly { value: Penalty; label: string }[] = [
    { value: null, label: T.historico.penaltyOk },
    { value: '+2', label: T.actions.plus2 },
    { value: 'DNF', label: T.actions.dnf },
  ];

  function disarm(): void {
    armed = false;
    armedAt = null;
  }

  // Fechou por qualquer caminho (Esc, Fechar, fundo, o solve excluído, ou o Mover e o selo, que abrem outra folha): libera a folha, se ainda
  // for esta. O modal já devolve o foco à linha de onde ela abriu; se a linha saiu (o solve foi excluído), a lista o leva para a que ficou
  // no lugar (request.back). A outra folha abre só agora, com o foco de volta na linha: ela o devolve à linha quando fechar.
  function onclose(): void {
    disarm();
    const next = then;
    then = null;
    if (app.dialog === 'solve') app.dialog = null;
    if (next) next();
    else request?.back?.();
  }

  // Fecha esta folha e abre a outra depois (onclose).
  function closeThen(open: () => void): void {
    then = open;
    dialogEl?.close();
  }

  function setPenalty(penalty: Penalty): void {
    if (!solve || solve.penalty === penalty) return;
    void app.setPenalty(solve.id, penalty);
  }

  async function saveNote(): Promise<void> {
    if (!solve) return;
    const text = draft.trim();
    draft = text;
    if (text === solve.note || text === saving) return;
    saving = text;
    try {
      await app.setNote(solve.id, text);
    } finally {
      saving = null;
    }
  }

  // Enter salva e Esc volta à nota gravada; o Esc não chega à folha (que fecharia com o rascunho). Com composição de texto em andamento
  // (IME), o Enter só confirma a letra: o Safari a termina com um Enter sem isComposing, mas com keyCode 229.
  function onNoteKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.isComposing && e.keyCode !== 229) void saveNote();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      draft = solve?.note ?? '';
    }
  }

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    void saveNote();
  }

  // O selo abre a folha do recorde, com o mesmo filtro da conta (o detalhe fecha antes: a folha é uma só por vez).
  function openRecord(): void {
    if (!solve || !view || view.record === null) return;
    const { record, sessionId } = view;
    const { event } = solve;
    closeThen(() => app.openRecord(record, sessionId, event));
  }

  // A folha de mover leva o caminho de volta da lista: Esc ou escolher uma sessão devolvem o foco à linha.
  function move(): void {
    if (!solve || !view) return;
    const ids = [solve.id];
    const number = view.number;
    const back = request?.back;
    closeThen(() => app.openMove(ids, { number, ...(back ? { back } : {}) }));
  }

  // O toque chama a área de transferência na hora (dentro do gesto); só o aviso espera o resultado.
  function copy(): void {
    if (!solve) return;
    void copyText(copyTextOf(solve)).then((how) => app.showToast(how === 'copied' ? T.historico.copied : T.historico.copyFailed));
  }

  // Excluir pede o segundo toque (o primeiro arma). Depois, o solve some de app.solves, e a folha fecha sozinha; o aviso com o Desfazer é
  // do AppState.
  async function remove(): Promise<void> {
    if (busy || !solve) return;
    if (!armed) {
      armed = true;
      armedAt = Date.now();
      return;
    }
    if (!confirmReady(armedAt, Date.now())) return;
    busy = true;
    try {
      await app.deleteSolve(solve.id);
    } finally {
      busy = false;
      disarm();
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet hx-sheet" aria-labelledby="{uid}-t {uid}-time" use:modal={{ open, onclose }}>
  {#if solve && view}
    <h2 id="{uid}-t">{T.historico.solveTitle(view.number)}</h2>
    <div class="hx-time" id="{uid}-time" role="img" aria-label={spoken}><span class="int">{sec}</span><span class="dec">{cs}</span></div>
    {#if raw !== ''}<p class="hx-raw">{raw}</p>{/if}
    <p class="hx-meta">{meta}</p>

    <div class="hx-sec">
      <div class="label" id="{uid}-p">{T.historico.penalty}</div>
      <div class="seg hx-pen" role="group" aria-labelledby="{uid}-p">
        {#each PENALTIES as p (p.label)}
          <button type="button" aria-pressed={solve.penalty === p.value ? 'true' : 'false'} onclick={() => setPenalty(p.value)}>{p.label}</button>
        {/each}
      </div>
    </div>

    <div class="hx-sec chips">
      <span class="chip">{T.historico.avgChip(5, view.ao5)}</span>
      <span class="chip">{T.historico.avgChip(12, view.ao12)}</span>
      {#if view.record !== null}
        <button type="button" class="chip pb hx-chip" onclick={openRecord}>{T.historico.inRecord(view.record)} <span aria-hidden="true">›</span></button>
      {/if}
    </div>

    <div class="hx-sec">
      <div class="label">{T.timer.scramble}</div>
      <div class="scr-row">
        <p class="scramble scr-text">{solve.scramble}</p>
        {#if app.profile.settings.scrambleImage}
          <ScrambleImage event={solve.event} scramble={solve.scramble} visible={app.profile.settings.scrambleImage} />
        {/if}
      </div>
    </div>

    <form class="hx-sec hx-noteform" onsubmit={submit}>
      <label class="label" for="{uid}-n">{T.actions.note}</label>
      <div class="t-note">
        <input
          type="text"
          id="{uid}-n"
          maxlength="80"
          placeholder={T.note.label}
          bind:value={draft}
          bind:this={noteEl}
          onkeydown={onNoteKey}
          onblur={() => void saveNote()}
        />
        <button type="submit" class="btn">{T.note.save}</button>
      </div>
    </form>

    <div class="row">
      <button type="button" class="btn" onclick={move}>{T.historico.moveButton}</button>
      <button type="button" class="btn" onclick={copy}>{T.historico.copy}</button>
      <button type="button" class="btn danger" disabled={busy} onclick={remove}>{armed ? T.historico.confirmAgain : T.historico.remove}</button>
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>

<style>
  .scr-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .scr-text {
    flex: 1;
    min-width: 0;
  }
</style>
