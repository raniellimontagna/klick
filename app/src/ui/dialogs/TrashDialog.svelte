<script lang="ts">
  // A lixeira: solves e sessões excluídos, os mais recentes primeiro. Restaurar devolve o item (uma sessão traz os solves que saíram
  // junto com ela, por isso eles aparecem só como contagem na linha da sessão: ui/trash.ts). Depois de restaurar, o foco vai para o
  // próximo item da lista (ou para Fechar, se a lista acabou): o botão de quem sai some. Os desafios (excluídos em Evolução, ou mandados
  // para cá por uma restauração) vêm depois, cada um na sua linha, com o título da lista dos Desafios: "Desafio · Bia · 3×3". Só com um
  // desafio na lixeira o texto de cima fala deles.
  import { tick } from 'svelte';
  import { eventInfo } from '../../core/events';
  import { formatSolve } from '../../core/stats';
  import { T } from '../../strings';
  import { dateLabel, timeOfDay } from '../format';
  import { groupTrash, type TrashView } from '../trash';
  import Bidi from '../duel/Bidi.svelte';
  import { duelTitle, plain } from '../duel/duel-view';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let listEl = $state<HTMLElement>();
  let closeEl = $state<HTMLButtonElement>();
  let view = $state<TrashView>({ sessions: [], solves: [], count: 0 });
  let loaded = $state(false);
  let busy = $state(false);

  $effect(() => {
    if (!open) return;
    loaded = false;
    void load();
  });

  async function load(): Promise<void> {
    try {
      view = groupTrash(await app.listTrash());
    } catch {
      view = { sessions: [], solves: [], count: 0 };
      app.showToast(T.trashDialog.loadFailed);
    }
    loaded = true;
  }

  // O botão restaurar de cada item tem a chave data-restore ("solve:ID", "session:ID" ou "duel:ID"): é por ela que o foco volta.
  function restoreButtons(): HTMLButtonElement[] {
    return listEl ? [...listEl.querySelectorAll<HTMLButtonElement>('button[data-restore]')] : [];
  }

  async function restore(kind: 'solve' | 'session' | 'duel', id: string): Promise<void> {
    if (busy) return;
    const key = `${kind}:${id}`;
    const before = restoreButtons().findIndex((b) => b.dataset.restore === key);
    busy = true;
    let ok = false;
    try {
      ok = await app.restoreFromTrash({ kind, id });
    } finally {
      busy = false;
    }
    if (!ok) return; // o aviso já saiu pela casca; o item continua na lixeira e o foco não muda
    await load();
    await tick();
    const after = restoreButtons();
    const next = after[Math.min(Math.max(before, 0), after.length - 1)] ?? closeEl;
    next?.focus();
    app.showToast(T.trashDialog.restored);
  }

  // Fechou por qualquer caminho: libera o diálogo no estado, se ele ainda for este.
  function onclose(): void {
    if (app.dialog === 'trash') app.dialog = null;
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.trashDialog.title} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.trashDialog.title}</h2>
    <p class="muted">{view.duels?.length ? T.duel.trashIntro : T.trashDialog.intro}</p>
    {#if loaded && view.count === 0}
      <p class="muted">{T.trashDialog.empty}</p>
    {/if}
    <div bind:this={listEl}>
      <ul class="sheet-list">
        {#each view.sessions as { session: s, solves: n } (s.id)}
          {@const when = dateLabel(s.deletedAt ?? s.updatedAt)}
          <li class="setting">
            <span>{s.name}<small>{T.trashDialog.sessionKind} · {eventInfo(s.event).short} · {T.trashDialog.sessionSolves(n)} · {T.trashDialog.deletedOn(`${when}, ${timeOfDay(s.deletedAt ?? s.updatedAt)}`)}</small></span>
            <button
              type="button"
              class="btn"
              data-restore={`session:${s.id}`}
              aria-label={T.trashDialog.restoreSession(s.name)}
              onclick={() => restore('session', s.id)}>{T.trashDialog.restore}</button
            >
          </li>
        {/each}
        {#each view.solves as s (s.id)}
          {@const when = dateLabel(s.deletedAt ?? s.updatedAt)}
          <li class="setting">
            <span>{formatSolve(s)} · {eventInfo(s.event).short}<small>{T.trashDialog.deletedOn(`${when}, ${timeOfDay(s.deletedAt ?? s.updatedAt)}`)}</small></span>
            <button
              type="button"
              class="btn"
              data-restore={`solve:${s.id}`}
              aria-label={T.trashDialog.restoreSolve(formatSolve(s))}
              onclick={() => restore('solve', s.id)}>{T.trashDialog.restore}</button
            >
          </li>
        {/each}
        {#each view.duels ?? [] as d (d.id)}
          {@const when = dateLabel(d.deletedAt ?? d.updatedAt)}
          {@const event = eventInfo(d.event).short}
          {@const title = duelTitle(d)}
          <li class="setting">
            <span><Bidi text={T.duel.trashRow(title, event, d.side === 'a' && d.theirs === null)} /><small>{T.trashDialog.deletedOn(`${when}, ${timeOfDay(d.deletedAt ?? d.updatedAt)}`)}</small></span>
            <button
              type="button"
              class="btn"
              data-restore={`duel:${d.id}`}
              aria-label={plain(T.duel.trashRestore(title, event))}
              onclick={() => restore('duel', d.id)}>{T.trashDialog.restore}</button
            >
          </li>
        {/each}
      </ul>
    </div>
    <div class="row">
      <button type="button" class="btn" bind:this={closeEl} onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
