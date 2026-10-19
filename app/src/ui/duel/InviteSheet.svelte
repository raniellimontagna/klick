<script lang="ts">
  // O convite (a maquete aprovada, 5): quem desafiou, o evento e as regras, e que não precisa de conta nem de instalar. Aceitar começa o
  // desafio no Timer; "Agora não" (e Esc, e o fundo) fecha sem gravar nada, e o mesmo link abre de novo depois. Aberto pela fase 'receive'.
  // Os tempos de quem desafiou não chegam aqui: o convite só traz o evento e o nome.
  import { eventInfo } from '../../core/events';
  import { T } from '../../strings';
  import { modal } from '../dialogs/modal';
  import type { AppState } from '../state/app.svelte';
  import Bidi from './Bidi.svelte';
  import DuelCentro from './DuelCentro.svelte';
  import { isolate, plain } from './duel-view';
  import { focusTimerIfLost } from './focus';

  let { app }: { app: AppState } = $props();

  const invite = $derived(app.duel.invite);
  const open = $derived(app.duel.phase === 'receive' && invite !== null);
  const name = $derived(isolate(invite?.name ?? '')); // o nome isolado na tela (Bidi); o rótulo da folha vai sem as marcas
  const title = $derived(T.duel.invited(name));

  function onclose(): void {
    if (app.duel.phase === 'receive') app.duel.decline();
    focusTimerIfLost();
  }
</script>

<dialog class="sheet dz-sheet" aria-label={plain(title)} use:modal={{ open, onclose }}>
  {#if open && invite}
    <div class="signin-status dz-invite-head">
      <div class="dz-invite-centro"><DuelCentro {app} /></div>
      <div>
        <div class="label">{T.duel.inviteLabel}</div>
        <h2><Bidi text={title} /></h2>
      </div>
    </div>
    <div class="chips">
      <span class="chip">{eventInfo(invite.event).short}</span>
      <span class="chip">{T.duel.chipScrambles}</span>
      <span class="chip">{T.duel.chipTarget}</span>
    </div>
    <p><Bidi text={T.duel.inviteText(name)} /></p>
    <!-- Com conta, o desafio sobe no sync com o resto: os tempos ficam também na conta. -->
    <p><b>{T.duel.noAccount}</b> <span class="muted">{app.account?.signedIn ? T.duel.localAndAccount : T.duel.localOnly}</span></p>
    <div class="row">
      <button type="button" class="btn primary" onclick={() => app.duel.accept()}>{T.duel.accept}</button>
      <button type="button" class="btn" onclick={() => app.duel.decline()}>{T.duel.notNow}</button>
    </div>
  {/if}
</dialog>
