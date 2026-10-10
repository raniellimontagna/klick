<script lang="ts">
  // Importar um arquivo do csTimer: as sessões lidas, com um <select> de evento para as que não trazem um. As que ficam sem evento não
  // entram. Depois de importar, o diálogo mostra o resumo (o pai o passa pela prop summary). A gravação é do pai (AppState).
  import { EVENTS, eventInfo } from '../../core/events';
  import type { EventId } from '../../core/types';
  import type { CsTimerSession } from '../../data/transfer';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let {
    app,
    open,
    sessions,
    summary,
    onconfirm,
  }: {
    app: AppState;
    open: boolean;
    sessions: CsTimerSession[] | null; // sessões de um arquivo do csTimer à espera de confirmação
    summary: string[] | null; // linhas do resumo depois de uma importação
    onconfirm: (mapping: Record<string, EventId | undefined>) => void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  // O evento escolhido para cada sessão sem evento, pela chave dela no arquivo. Um arquivo novo zera as escolhas.
  let choices = $state<Record<string, EventId | undefined>>({});
  $effect(() => {
    void sessions;
    choices = {};
  });

  const chosen = (s: CsTimerSession): EventId | null => s.event ?? choices[s.key] ?? null;
  const importable = $derived((sessions ?? []).filter((s) => chosen(s) !== null).length);

  function pick(key: string, value: string): void {
    choices[key] = EVENTS.find((e) => e.id === value)?.id;
  }

  function confirm(): void {
    const mapping: Record<string, EventId | undefined> = {};
    for (const s of sessions ?? []) if (choices[s.key] !== undefined) mapping[s.key] = choices[s.key];
    onconfirm(mapping);
  }

  // Fechou por qualquer caminho: libera o diálogo no estado, se ele ainda for este.
  function onclose(): void {
    if (app.dialog === 'import') app.dialog = null;
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.importDialog.title} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.importDialog.title}</h2>
    {#if sessions}
      <p class="muted">{T.importDialog.csTimerIntro}</p>
      <ul class="sheet-list">
        {#each sessions as s (s.key)}
          <li class="setting">
            <span>{s.name}<small>{T.importDialog.count(s.solves.length)}</small></span>
            {#if s.event}
              <span class="muted">{eventInfo(s.event).name}</span>
            {:else}
              <select
                aria-label={T.importDialog.eventLabel(s.name)}
                value={choices[s.key] ?? ''}
                onchange={(e) => pick(s.key, e.currentTarget.value)}
              >
                <option value="">{T.importDialog.eventPlaceholder}</option>
                {#each EVENTS as ev (ev.id)}
                  <option value={ev.id}>{ev.name}</option>
                {/each}
              </select>
            {/if}
          </li>
        {/each}
      </ul>
      {#if importable === 0}
        <p class="muted">{T.importDialog.needEvent}</p>
      {/if}
      <div class="row">
        <button type="button" class="btn primary" disabled={importable === 0} onclick={confirm}>{T.importDialog.confirm}</button>
        <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
      </div>
    {:else if summary}
      <div role="status">
        {#each summary as line (line)}
          <p>{line}</p>
        {/each}
      </div>
      <div class="row">
        <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
      </div>
    {/if}
  {/if}
</dialog>
