<script lang="ts">
  // As telas de fim do desafio (a maquete aprovada), no lugar do Timer, na aba dele: 4, A terminou (os sete tempos, o nome e "Mandar o
  // desafio"); 7, B terminou (o resultado, o placar, a partida ponto a ponto, "Mandar a resposta" e "Desafiar de volta"); 8, A abre a
  // resposta (a partida inteira, com a barra normal); e a partida só para ver (view), que não grava nada. O Centro reage ao resultado de
  // quem vê. Mandar compartilha o link pela folha do sistema ou o copia (send.ts); sem o link (a gravação falhou), o aviso, e nada sai.
  import { tick, untrack } from 'svelte';
  import { MAX_DUEL_NAME } from '../../core/duel/link';
  import { eventInfo } from '../../core/events';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import DuelCentro from './DuelCentro.svelte';
  import { bestOf, boardOf, duelTime, matchOf, outcomeOf, rowName } from './duel-view';
  import { focusTimerIfLost } from './focus';
  import Placar from './Placar.svelte';
  import { sendLink } from './send';

  let { app }: { app: AppState } = $props();
  const uid = $props.id();

  let sectionEl = $state<HTMLElement>();
  let titleEl = $state<HTMLElement>();
  let name = $state(untrack(() => app.profile.duelName)); // o último usado (Ajustes); vazio, quem recebe lê "Alguém te desafiou"
  let sending = $state(false);

  const duel = $derived(app.duel.current);
  const phase = $derived(app.duel.phase);
  const score = $derived(app.duel.score);
  const short = $derived(duel ? eventInfo(duel.event).short : '');
  // A tela de mandar de A (4): os sete feitos, ainda sem a resposta. Uma partida só para ver, sem o outro lado, mostra os tempos do mesmo jeito.
  const ready = $derived(duel !== null && duel.side === 'a' && (phase === 'finished' || (phase === 'view' && score === null)));
  const outcome = $derived(duel && score ? outcomeOf(duel, score) : null);
  const board = $derived(duel && score ? boardOf(duel, score, null) : null);
  const match = $derived(duel && score ? matchOf(duel, score) : null);
  const them = $derived(rowName(duel?.theirName ?? ''));

  // Na montagem, o foco vem para o resultado (o Timer, que o tinha, saiu da tela): o leitor de tela começa por ele.
  $effect(() => {
    untrack(() => {
      void tick().then(() => {
        const active = document.activeElement;
        if (active !== null && active !== document.body && !active.closest('[data-screen="timer"]')) return;
        (titleEl ?? sectionEl)?.focus({ preventScroll: true });
      });
    });
  });

  // O link saiu (gravado): a folha do sistema, ou a cópia com o aviso. Sem o link, o aviso honesto, e nada é compartilhado.
  async function deliver(make: () => Promise<string | null>, text: () => string): Promise<void> {
    if (sending) return;
    sending = true;
    try {
      const url = await make().catch(() => null);
      if (!url) {
        app.showToast(T.duel.linkFailed);
        return;
      }
      const sent = await sendLink(text(), url);
      if (sent === 'copied') app.showToast(T.duel.copied);
      else if (sent === 'failed') app.showToast(T.duel.copyFailed);
    } finally {
      sending = false;
    }
  }

  const sendChallenge = (): Promise<void> =>
    deliver(
      () => app.duel.challengeUrl(location.origin, name),
      () => T.duel.shareText(app.profile.duelName, short),
    );
  const sendReply = (): Promise<void> =>
    deliver(
      () => app.duel.replyUrl(location.origin, name),
      () => T.duel.replyText(app.profile.duelName, short),
    );

  function close(): void {
    app.duel.exit();
    focusTimerIfLost();
  }

  // "Ver em Desafios": a Evolução, onde ficam os desafios guardados.
  function seeAll(): void {
    app.duel.exit();
    app.tab = 'evolucao';
  }
</script>

<!-- O rótulo é o do campo; o aviso e a contagem ficam como descrição (dentro do label, o nome acessível levaria os dois). -->
{#snippet nameField(hint: string)}
  <label class="field dz-field">
    <span id="{uid}-name">{T.duel.nameLabel}</span>
    <input
      type="text"
      bind:value={name}
      maxlength={MAX_DUEL_NAME}
      autocomplete="nickname"
      aria-labelledby="{uid}-name"
      aria-describedby="{uid}-hint"
    />
    <small id="{uid}-hint"><span>{hint}</span><span class="num">{T.duel.nameCount(name.length, MAX_DUEL_NAME)}</span></small>
  </label>
{/snippet}

{#snippet matchCards()}
  {#if board && match && duel}
    <div class="card dz-board"><Placar {board} {them} /></div>
    <div class="card hist dz-match">
      <table>
        <thead>
          <tr>
            <th>{T.duel.colNumber}</th>
            <th>{T.duel.me}</th>
            <th>{them}</th>
            <th>{T.duel.colPoint}</th>
          </tr>
        </thead>
        <tbody>
          {#each match.rows as row (row.n)}
            <tr>
              <td>{row.n}</td>
              <td class:w={row.winner === 'me'}>{row.mine}</td>
              <td class:w={row.winner === 'them'}>{row.theirs}</td>
              <td>{row.point}</td>
            </tr>
          {/each}
          {#if match.rest}
            <tr class="dz-skip">
              <td>{match.rest.label}</td>
              <td colspan="3" class="dz-rest">{match.rest.text}</td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

{#if duel}
  {#if ready}
    <!-- 4: A terminou -->
    <section class="screen dz-end" data-screen="duel" aria-label={T.duel.readyLabel} tabindex="-1" bind:this={sectionEl}>
      {#if phase === 'finished'}
        <div class="card dz-coach">
          <div><DuelCentro {app} /></div>
          <div>
            <div class="label">{T.duel.readyLabel}</div>
            <p class="coach">{T.duel.readyCoach}</p>
          </div>
        </div>
      {/if}
      <div class="card">
        <div class="card-h"><span class="label">{T.duel.myTimes(short)}</span><span class="muted num">{T.progress.best(bestOf(duel.mine))}</span></div>
        <ol class="dz-times cols" data-duel-times>
          {#each duel.mine as t, i (i)}
            <li><span class="n">{i + 1}</span>{duelTime(t)}{#if t.penalty === '+2'}<span class="tag">{T.timer.plus2}</span>{/if}</li>
          {/each}
        </ol>
      </div>
      {#if phase === 'finished'}
        {@render nameField(T.duel.nameHint)}
        <button type="button" class="btn primary dz-wide" disabled={sending} onclick={sendChallenge}>{T.duel.send}</button>
        <p class="dz-note dz-center">{T.duel.sendNote}</p>
      {:else}
        <div class="row"><button type="button" class="btn" onclick={close}>{T.duel.close}</button></div>
      {/if}
    </section>
  {:else if outcome && phase === 'finished'}
    <!-- 7: B terminou -->
    <section class="screen dz-end center" data-screen="duel" aria-label={outcome.title} tabindex="-1" bind:this={sectionEl}>
      <div class="dz-hero"><DuelCentro {app} view={outcome.centro ? { state: 'reaction', result: outcome.centro } : undefined} jump={outcome.won} /></div>
      <div>
        <h1 class="dz-result" tabindex="-1" bind:this={titleEl}>{outcome.title}</h1>
        <p class="dz-sub">{T.duel.against(duel.theirName, short, outcome.played)}</p>
      </div>
      {@render matchCards()}
      {@render nameField(T.duel.nameHintReply(them))}
      <button type="button" class="btn primary dz-wide" disabled={sending} onclick={sendReply}>{T.duel.sendReply}</button>
      <p class="dz-note">{T.duel.replyNote(duel.theirName)}</p>
      <button type="button" class="btn dz-wide" onclick={() => app.duel.rematch()}>{T.duel.rematch}</button>
    </section>
  {:else if outcome && score}
    <!-- 8: A abre a resposta (e a partida só para ver) -->
    <section class="screen dz-end center" data-screen="duel" aria-label={outcome.title} tabindex="-1" bind:this={sectionEl}>
      <div class="label dz-reply-label">{T.duel.replyLabel}</div>
      <div class="dz-hero dz-hero-tight"><DuelCentro {app} view={outcome.centro ? { state: 'reaction', result: outcome.centro } : undefined} jump={outcome.won} /></div>
      <div>
        <h1 class="dz-result" tabindex="-1" bind:this={titleEl}>{outcome.title}</h1>
        {#if score.over}
          <p class="coach dz-closed">{outcome.closed}{duel.side === 'a' ? ` ${T.duel.myBest(bestOf(duel.mine, outcome.played))}` : ''}</p>
        {/if}
      </div>
      {@render matchCards()}
      <div class="row">
        {#if phase === 'reply'}
          <button type="button" class="btn primary" onclick={seeAll}>{T.duel.seeAll}</button>
        {/if}
        <button type="button" class="btn" class:primary={phase !== 'reply'} onclick={close}>{T.duel.close}</button>
        {#if phase === 'reply'}
          <button type="button" class="btn" onclick={() => app.duel.rematch()}>{T.duel.rematch}</button>
        {/if}
      </div>
    </section>
  {/if}
{/if}
