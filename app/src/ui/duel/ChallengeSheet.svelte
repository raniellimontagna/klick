<script lang="ts">
  // A folha "Desafiar" (a maquete aprovada, 2a e 2b): o evento (o da sessão, por padrão) e "Começar". Enquanto os sete embaralhamentos são
  // gerados, o cubo vivo da conta gira (parado com menos movimento: o CSS de base desliga a animação) e o texto diz o que acontece; prontos
  // os sete, a folha fecha e o Timer entra no modo desafio. A falha avisa, e Começar tenta de novo. Aberta pelas fases do desafio: escolhendo
  // e gerando. Fechar (Esc, fundo, Cancelar) sai sem começar nada.
  import { EVENTS } from '../../core/events';
  import type { EventId } from '../../core/types';
  import { T } from '../../strings';
  import { modal } from '../dialogs/modal';
  import LiveCube from '../LiveCube.svelte';
  import type { AppState } from '../state/app.svelte';
  import { focusTimerIfLost } from './focus';

  let { app }: { app: AppState } = $props();

  const loading = $derived(app.duel.phase === 'loading');
  const open = $derived(app.duel.phase === 'picking' || loading);

  // Fechou por Esc ou pelo fundo: é o Cancelar. Fechou porque os sete ficaram prontos: o Timer já está no desafio.
  function onclose(): void {
    if (app.duel.phase === 'picking' || app.duel.phase === 'loading') app.duel.exit();
    focusTimerIfLost();
  }

  function pick(e: Event): void {
    app.duel.pickEvent = (e.currentTarget as HTMLSelectElement).value as EventId;
  }
</script>

<dialog class="sheet dz-sheet" aria-label={T.duel.sheetTitle} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.duel.sheetTitle}</h2>
    <p>{T.duel.sheetText}</p>
    <label class="field dz-field">
      <span>{T.duel.eventLabel}</span>
      <select value={app.duel.pickEvent} disabled={loading} onchange={pick}>
        {#each EVENTS as ev (ev.id)}
          <option value={ev.id}>{ev.name}</option>
        {/each}
      </select>
    </label>
    {#if loading}
      <div class="signin-status">
        <LiveCube state="turn" />
        <p class="muted" role="status">{T.duel.generating}</p>
      </div>
    {:else if app.duel.scrambleError}
      <div class="signin-status">
        <LiveCube state="error" />
        <p role="alert">{T.duel.generateFailed}</p>
      </div>
    {:else}
      <p class="dz-note">{T.duel.outsideStats}</p>
    {/if}
    <div class="row">
      <button type="button" class="btn primary" disabled={loading} onclick={() => app.duel.start(app.duel.pickEvent)}>{T.duel.start}</button>
      <button type="button" class="btn" onclick={() => app.duel.exit()}>{T.duel.cancel}</button>
    </div>
  {/if}
</dialog>
