<script lang="ts">
  // O link que não abre (a maquete aprovada, 10): cortado, mexido ou de outra versão do formato. O cubo vivo em erro (peças paradas, o centro
  // em destaque, como na conta), e nada mudou no aparelho. Fechar volta ao Timer. Aberto pela fase 'invalid'.
  import { T } from '../../strings';
  import { modal } from '../dialogs/modal';
  import LiveCube from '../LiveCube.svelte';
  import type { AppState } from '../state/app.svelte';
  import { focusTimerIfLost } from './focus';

  let { app }: { app: AppState } = $props();

  const open = $derived(app.duel.phase === 'invalid');

  function onclose(): void {
    if (app.duel.phase === 'invalid') app.duel.exit();
    focusTimerIfLost();
  }
</script>

<dialog class="sheet dz-sheet" role="alertdialog" aria-label={T.duel.invalidTitle} use:modal={{ open, onclose }}>
  {#if open}
    <div class="signin-status dz-invalid-head">
      <LiveCube state="error" />
      <h2>{T.duel.invalidTitle}</h2>
    </div>
    <p>{T.duel.invalidText}</p>
    <p class="muted">{T.duel.invalidNothing}</p>
    <div class="row">
      <button type="button" class="btn primary" onclick={() => app.duel.exit()}>{T.duel.close}</button>
    </div>
  {/if}
</dialog>
