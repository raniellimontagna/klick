<script lang="ts">
  // As sessões, agrupadas por evento (só os eventos que têm alguma), com a atual marcada. Escolher uma troca a atual; criar pede o
  // evento (um <select>) e um nome opcional; renomear e excluir ficam na própria linha. Excluir manda a sessão para a lixeira (o
  // AppState faz isso). O diálogo fica aberto depois de cada ação: a lista mostra o que mudou, e Fechar, Esc ou o fundo fecham.
  // Clicar no respiro não fecha; só o fundo.
  import { tick, untrack } from 'svelte';
  import { EVENTS } from '../../core/events';
  import type { EventId, Session } from '../../core/types';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let listEl = $state<HTMLElement>();
  let createEl = $state<HTMLSelectElement>();
  let renameEl = $state<HTMLInputElement>();
  let newEvent = $state<string>('333'); // o evento da nova sessão (um dos EVENTS)
  let newName = $state('');
  let renaming = $state<string | null>(null); // id da sessão que está sendo renomeada
  let draft = $state('');

  // Só os eventos com sessão, na ordem do catálogo. Dentro de cada evento, a ordem das sessões (a da lista do AppState).
  const groups = $derived(
    EVENTS.map((info) => ({ info, sessions: app.sessions.filter((s) => s.event === info.id) })).filter((g) => g.sessions.length > 0),
  );

  // Solves por sessão, para o contador de cada linha (uma passada só).
  const counts = $derived.by(() => {
    const m = new Map<string, number>();
    for (const s of app.solves) m.set(s.sessionId, (m.get(s.sessionId) ?? 0) + 1);
    return m;
  });

  // Ao abrir, o evento da nova sessão é o da sessão atual.
  $effect(() => {
    if (open) untrack(() => (newEvent = app.event));
  });

  // Fechou por qualquer caminho (Esc, Fechar ou fundo): libera o diálogo no estado, se ele ainda for este.
  function onclose(): void {
    renaming = null;
    if (app.dialog === 'sessions') app.dialog = null;
  }

  // Os botões da lista têm a chave data-focus ("switch:ID", "rename:ID", "remove:ID"): é por ela que o foco volta depois de uma ação.
  function focusKey(key: string): void {
    const el = listEl ? [...listEl.querySelectorAll<HTMLElement>('[data-focus]')].find((x) => x.dataset.focus === key) : undefined;
    (el ?? createEl)?.focus();
  }

  // As sessões da lista, na ordem em que aparecem (só as escolhas, para o foco cair numa sessão e não num botão de quem sai).
  function switchKeys(): string[] {
    return listEl ? [...listEl.querySelectorAll<HTMLElement>('[data-focus^="switch:"]')].map((x) => x.dataset.focus ?? '') : [];
  }

  async function create(): Promise<void> {
    const name = newName.trim();
    newName = '';
    await app.createSession(newEvent as EventId, name === '' ? undefined : name);
  }

  async function pick(id: string): Promise<void> {
    await app.switchSession(id);
  }

  async function startRename(s: Session): Promise<void> {
    renaming = s.id;
    draft = s.name;
    await tick();
    renameEl?.focus();
    renameEl?.select();
  }

  async function saveRename(s: Session): Promise<void> {
    const name = draft.trim();
    renaming = null;
    if (name !== '' && name !== s.name) await app.renameSession(s.id, name);
    await tick();
    focusKey(`rename:${s.id}`);
  }

  async function cancelRename(s: Session): Promise<void> {
    renaming = null;
    await tick();
    focusKey(`rename:${s.id}`);
  }

  // Excluir some com a linha: o foco vai para a sessão que ficou no lugar dela (ou a anterior, se era a última; ou para o evento novo).
  async function remove(s: Session): Promise<void> {
    const before = switchKeys();
    const at = before.indexOf(`switch:${s.id}`);
    await app.deleteSession(s.id);
    await tick();
    const after = switchKeys();
    if (after.length === 0) createEl?.focus();
    else focusKey(after[Math.min(Math.max(at, 0), after.length - 1)]);
  }

  // Enter salva e Esc cancela; o Esc não chega ao diálogo (que fecharia com o rascunho).
  // Com composição de texto em andamento (IME), o Enter só confirma a letra: não salva nem cria.
  function onRenameKey(e: KeyboardEvent, s: Session): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      void saveRename(s);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      void cancelRename(s);
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.sessions.title} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.sessions.title}</h2>
    <p class="muted">{T.sessions.intro}</p>

    <div bind:this={listEl}>
      {#each groups as group (group.info.id)}
        <section>
          <h3>{group.info.name}</h3>
          <ul class="sheet-list">
            {#each group.sessions as s (s.id)}
              <li class="setting">
                {#if renaming === s.id}
                  <input
                    bind:this={renameEl}
                    type="text"
                    bind:value={draft}
                    aria-label={T.sessions.renameLabel(s.name)}
                    onkeydown={(e) => onRenameKey(e, s)}
                  />
                  <span class="data-actions">
                    <button type="button" class="btn primary" onclick={() => saveRename(s)}>{T.sessions.save}</button>
                    <button type="button" class="btn" onclick={() => cancelRename(s)}>{T.sessions.cancel}</button>
                  </span>
                {:else}
                  <button
                    type="button"
                    class="list-btn"
                    data-focus={`switch:${s.id}`}
                    aria-current={s.id === app.currentSession?.id ? 'true' : undefined}
                    onclick={() => pick(s.id)}
                  >
                    <span>{s.name}</span>
                    <span class="muted num">{T.sessions.count(counts.get(s.id) ?? 0)}</span>
                  </button>
                  <span class="data-actions">
                    <button
                      type="button"
                      class="btn"
                      data-focus={`rename:${s.id}`}
                      aria-label={T.sessions.renameAria(s.name)}
                      onclick={() => startRename(s)}>{T.sessions.rename}</button
                    >
                    <button
                      type="button"
                      class="btn"
                      data-focus={`remove:${s.id}`}
                      aria-label={T.sessions.removeAria(s.name)}
                      onclick={() => remove(s)}>{T.sessions.remove}</button
                    >
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>

    <div class="row">
      <select bind:this={createEl} bind:value={newEvent} aria-label={T.sessions.newEvent}>
        {#each EVENTS as ev (ev.id)}
          <option value={ev.id}>{ev.name}</option>
        {/each}
      </select>
      <input
        type="text"
        bind:value={newName}
        aria-label={T.sessions.newName}
        placeholder={T.sessions.newNamePlaceholder}
        onkeydown={(e) => {
          // Enter cria, como o botão (o campo não está num formulário, então o Enter não faria nada sozinho). Com composição em
          // andamento (IME), o Enter só confirma a letra.
          if (e.key !== 'Enter' || e.isComposing) return;
          e.preventDefault();
          void create();
        }}
      />
      <button type="button" class="btn primary" onclick={create}>{T.sessions.create}</button>
    </div>

    <div class="row">
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
