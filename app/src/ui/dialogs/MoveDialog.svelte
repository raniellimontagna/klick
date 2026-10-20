<script lang="ts">
  // A folha de mover (a maquete aprovada, 4): as sessões do mesmo evento dos solves, com a contagem de cada uma, e a de onde eles vêm
  // marcada e parada (com a borda na tinta e "está aqui"). Tocar numa sessão já move e fecha; o aviso com o Desfazer é do AppState. Vem da
  // barra da seleção (e do detalhe de um solve), por app.openMove; mover para outro evento o repositório nem aceitaria, e aqui nem aparece.
  import { eventInfo } from '../../core/events';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app }: { app: AppState } = $props();
  const uid = $props.id();

  let dialogEl = $state<HTMLDialogElement>();
  let busy = $state(false);

  const request = $derived(app.moveRequest);
  const open = $derived(app.dialog === 'move' && request !== null);

  // Os solves do pedido que ainda existem; o evento é o deles (a lista só seleciona dentro de um evento).
  const picked = $derived.by(() => {
    if (!open || !request) return [];
    const ids = new Set(request.ids);
    return app.solves.filter((s) => ids.has(s.id));
  });
  const event = $derived(picked[0]?.event ?? null);
  // A sessão de origem, quando todos vêm da mesma (com "Todas as sessões", um lote pode vir de várias, e nenhuma fica marcada).
  const from = $derived(picked.length > 0 && picked.every((s) => s.sessionId === picked[0]!.sessionId) ? picked[0]!.sessionId : null);
  const sessions = $derived(event === null ? [] : app.sessions.filter((s) => s.event === event));

  // Solves por sessão, só do evento e só com a folha aberta (uma passada).
  const counts = $derived.by(() => {
    const m = new Map<string, number>();
    if (!open || event === null) return m;
    for (const s of app.solves) if (s.event === event) m.set(s.sessionId, (m.get(s.sessionId) ?? 0) + 1);
    return m;
  });

  // Fechou por qualquer caminho (Esc, Cancelar, fundo, ou depois de mover): libera a folha, se ainda for esta. Aberta pelo detalhe, o foco
  // volta à linha da lista de onde ele abriu (ou à que ficou no lugar dela, se o solve saiu do filtro): o modal só o devolveria à linha se
  // ela ainda estivesse lá.
  function onclose(): void {
    const back = app.moveRequest?.back;
    if (app.dialog === 'move') app.dialog = null;
    app.moveRequest = null;
    back?.();
  }

  // Uma recusa (a sessão foi para a lixeira noutra aba) deixa a folha aberta: o aviso de falha é do AppState, e dá para escolher outra.
  async function pick(sessionId: string): Promise<void> {
    const req = request;
    if (busy || !req) return;
    busy = true;
    let ok = false;
    try {
      ok = await app.moveSolves(req.ids, sessionId);
    } finally {
      busy = false;
    }
    if (!ok) return;
    req.done?.();
    dialogEl?.close();
  }
</script>

<dialog bind:this={dialogEl} class="sheet hx-sheet" aria-labelledby="{uid}-t" use:modal={{ open, onclose }}>
  {#if open && request}
    <!-- A contagem é a dos que ainda existem (um pode sumir com a folha aberta: excluído noutra aba). -->
    <h2 id="{uid}-t">{T.historico.moveTitle(picked.length, request.number)}</h2>
    {#if event !== null}
      <p class="muted">{T.historico.moveIntro(eventInfo(event).name, picked.length)}</p>
    {/if}
    <ul class="sheet-list hx-move">
      {#each sessions as s (s.id)}
        <li>
          <button
            type="button"
            class="list-btn"
            aria-current={s.id === from ? 'true' : undefined}
            disabled={s.id === from}
            onclick={() => pick(s.id)}
          >
            <span>{s.name}{#if s.id === from}{' '}<span class="tag">{T.historico.here}</span>{/if}</span>
            <span class="muted num">{T.historico.count(counts.get(s.id) ?? 0)}</span>
          </button>
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.historico.cancel}</button>
    </div>
  {/if}
</dialog>
