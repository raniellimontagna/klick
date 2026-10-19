<script lang="ts">
  // Uma partida aberta em Evolução › Desafios (a maquete aprovada, 9c): quem desafiou, o evento e a hora, o resultado, o placar e a partida
  // ponto a ponto, e "Excluir", que manda para a lixeira com o segundo toque, como as outras ações sem volta do app (o aviso de desfazer vem
  // depois, na lista). O desafio de A que espera a resposta mostra os sete tempos e "Mandar de novo": o mesmo link, preparado antes do toque
  // (a folha do sistema só abre dentro dele), como na tela de mandar. A partida terminada de B oferece "Mandar a resposta", que volta à tela
  // do fim (7), onde o envio de sempre corre dentro do toque; o registro de B não sabe se a resposta já saiu, então ela vale sempre. O de A
  // com os sete, ainda sem resposta (esperando, ou jogando porque a marca de mandado não gravou), também oferece "Colar a resposta", para a
  // resposta que abriu fora do app (PasteReply).
  import { onDestroy, untrack } from 'svelte';
  import { DUEL_SCRAMBLES } from '../../core/duel/score';
  import { eventInfo } from '../../core/events';
  import type { Duel } from '../../core/types';
  import { T } from '../../strings';
  import { confirmReady } from '../confirm';
  import Bidi from '../duel/Bidi.svelte';
  import { bestOf, duelTime, matchLabelOf, outcomeOf } from '../duel/duel-view';
  import { focusTimerIfLost } from '../duel/focus';
  import MatchCards from '../duel/MatchCards.svelte';
  import PasteReply from '../duel/PasteReply.svelte';
  import { canShare, copyLink, shareLink } from '../duel/send';
  import type { AppState } from '../state/app.svelte';
  import { scoreOf } from '../state/duel.svelte';

  let { app, duel, now }: { app: AppState; duel: Duel; now: number } = $props();

  const score = $derived(scoreOf(duel));
  const outcome = $derived(score ? outcomeOf(duel, score) : null);
  const short = $derived(eventInfo(duel.event).short);
  const waiting = $derived(duel.side === 'a' && duel.status === 'waiting');
  const playing = $derived(duel.status === 'playing');
  const replyable = $derived(duel.side === 'b' && duel.status === 'done');
  // A resposta pode fechar este desafio (a emenda da I2): o de A com os sete, ainda sem resposta.
  const pasteable = $derived(duel.side === 'a' && duel.status !== 'done' && duel.mine.length === DUEL_SCRAMBLES);
  const title = $derived(waiting ? T.duel.waitingTitle : (outcome?.title ?? T.duel.ownTitle));

  let armed = $state(false); // "Excluir" espera o segundo toque
  let armedAt: number | null = null;
  let busy = $state(false);
  let prepared = $state<string | null>(null); // o link de "Mandar de novo", pronto para o toque
  let copyOffer = $state<string | null>(null); // a folha recusou: o link que "Copiar o link" copia
  let destroyed = false;
  let generation = 0;

  onDestroy(() => {
    destroyed = true;
  });

  // O link fica pronto antes do toque, de novo a cada desafio que espera (o mesmo, relido, não prepara outra vez).
  const resendId = $derived(waiting ? duel.id : null);
  $effect(() => {
    const id = resendId;
    untrack(() => {
      const mine = ++generation;
      prepared = null;
      copyOffer = null;
      if (id === null) return;
      void app.duel
        .resend(id, location.origin)
        .catch(() => null)
        .then((url) => {
          if (!destroyed && mine === generation) prepared = url;
        });
    });
  });

  // "Mandar de novo": a folha do sistema na hora do toque (ou, sem ela, a cópia). O desafio já espera a resposta: fechar a folha não muda nada.
  function resend(): void {
    const url = prepared;
    if (!url) return;
    if (!canShare()) {
      copyNow(url);
      return;
    }
    copyOffer = null;
    void shareLink(T.duel.shareText(duel.myName, short), url).then((how) => {
      if (how === 'failed' && !destroyed) copyOffer = url;
    });
  }

  function copyNow(url: string): void {
    void copyLink(url).then((how) => {
      if (how === 'failed') {
        app.showToast(T.duel.copyFailed);
        return;
      }
      app.showToast(T.duel.copied);
      if (!destroyed) copyOffer = null;
    });
  }

  async function remove(): Promise<void> {
    if (busy) return;
    if (!armed) {
      armed = true;
      armedAt = Date.now();
      return;
    }
    if (!confirmReady(armedAt, Date.now())) return;
    busy = true;
    try {
      if (await app.deleteDuel(duel)) app.evolucaoView = { kind: 'duels' };
    } finally {
      busy = false;
      armed = false;
      armedAt = null;
    }
  }

  // Um desafio que ainda joga (aberto aqui por fora da lista) continua no Timer; a partida terminada de B volta à tela do fim, para mandar.
  async function keepGoing(): Promise<void> {
    if (!(await app.duel.resume(duel.id))) return;
    app.tab = 'timer';
    focusTimerIfLost();
  }
</script>

<div class="dz-end">
  <button type="button" class="link dz-back" aria-label={T.duel.backTo(T.duel.listTitle)} onclick={() => (app.evolucaoView = { kind: 'duels' })}
    ><span aria-hidden="true">‹</span> {T.duel.listTitle}</button
  >
  <div>
    <div class="label"><Bidi text={matchLabelOf(duel, now)} /></div>
    <h1 class="dz-result dz-match-title" tabindex="-1" data-evo-heading><Bidi text={title} /></h1>
  </div>
  {#if score}
    <MatchCards {duel} {score} />
  {:else}
    <!-- Sem a resposta ainda: os sete tempos de quem desafiou, como na tela de mandar (4). -->
    <div class="card">
      <div class="card-h"><span class="label">{T.duel.myTimes(short)}</span><span class="muted num">{T.progress.best(bestOf(duel.mine))}</span></div>
      <ol class="dz-times cols" data-duel-times>
        {#each duel.mine as t, i (i)}
          <li><span class="n">{i + 1}</span>{duelTime(t)}{#if t.penalty === '+2'}<span class="tag">{T.timer.plus2}</span>{/if}</li>
        {/each}
      </ol>
    </div>
  {/if}
  <div class="row">
    {#if waiting}
      <button type="button" class="btn primary" disabled={prepared === null} aria-busy={prepared === null} onclick={resend}
        >{prepared === null ? T.duel.preparing : T.duel.resend}</button
      >
      {#if copyOffer}
        <button type="button" class="btn" onclick={() => copyOffer && copyNow(copyOffer)}>{T.duel.copyLink}</button>
      {/if}
    {/if}
    {#if replyable}
      <button type="button" class="btn primary" onclick={keepGoing}>{T.duel.sendReply}</button>
    {/if}
    {#if playing}
      <button type="button" class="btn primary" onclick={keepGoing}>{T.duel.keepGoing}</button>
    {/if}
    {#if pasteable}
      <PasteReply {app} />
    {/if}
    {#if !playing}
      <button type="button" class="btn danger" disabled={busy} onclick={remove}>{armed ? T.duel.confirmAgain : T.duel.delete}</button>
    {/if}
  </div>
  {#if !playing}
    <p class="dz-note">{T.duel.deleteNote}</p>
  {/if}
</div>
