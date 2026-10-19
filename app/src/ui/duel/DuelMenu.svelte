<script lang="ts">
  // A folha da pílula do modo (a maquete aprovada, 3b): continuar (fecha a folha), pausar e voltar ao Timer (o desafio fica guardado e
  // continua de onde parou) e, só para quem desafia, descartar, que pede o segundo toque como as outras ações sem volta do app. B não
  // descarta: o desafio aceito vai até o fim (spec §3). Aberta por app.dialog 'duel'.
  import { confirmReady } from '../confirm';
  import { eventInfo } from '../../core/events';
  import { T } from '../../strings';
  import { modal } from '../dialogs/modal';
  import type { AppState } from '../state/app.svelte';
  import { focusTimerIfLost } from './focus';

  let { app }: { app: AppState } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let armed = $state(false); // "Descartar" espera o segundo toque
  let armedAt: number | null = null; // a hora do primeiro: o segundo antes de CONFIRM_DELAY_MS é o toque duplo e não vale
  let busy = $state(false);

  const duel = $derived(app.duel.current);
  const playing = $derived(['solving', 'confirm', 'reveal', 'finished'].includes(app.duel.phase));
  const open = $derived(app.dialog === 'duel' && playing && duel !== null);
  const index = $derived(app.duel.index);

  // Fechou por qualquer caminho: o segundo toque desarma e o diálogo é liberado, se ainda for este.
  function onclose(): void {
    armed = false;
    armedAt = null;
    if (app.dialog === 'duel') app.dialog = null;
    focusTimerIfLost();
  }

  function pause(): void {
    app.duel.exit();
    dialogEl?.close();
  }

  async function discard(): Promise<void> {
    if (busy) return;
    if (!armed) {
      armed = true;
      armedAt = Date.now();
      return;
    }
    if (!confirmReady(armedAt, Date.now())) return;
    busy = true;
    try {
      await app.duel.discard();
    } finally {
      busy = false;
    }
    dialogEl?.close();
  }

</script>

<dialog bind:this={dialogEl} class="sheet dz-sheet" aria-label={T.duel.menuLabel} use:modal={{ open, onclose }}>
  {#if open && duel}
    <h2>{T.duel.menuTitle(eventInfo(duel.event).short)}</h2>
    <p>{T.duel.menuText(index >= 0 ? index + 1 : null)}</p>
    <div class="stack">
      <button type="button" class="btn primary" onclick={() => dialogEl?.close()}>{T.duel.keepGoing}</button>
      <button type="button" class="btn" onclick={pause}>{T.duel.pause}</button>
      {#if duel.side === 'a'}
        <button type="button" class="btn danger" disabled={busy} onclick={discard}>{armed ? T.duel.confirmAgain : T.duel.discard}</button>
      {/if}
    </div>
  {/if}
</dialog>
