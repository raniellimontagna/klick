<script lang="ts">
  // As telas de fim do desafio (a maquete aprovada), no lugar do Timer, na aba dele: 4, A terminou (os sete tempos, o nome e "Mandar o
  // desafio"); 7, B terminou (o resultado, o placar, a partida ponto a ponto, "Mandar a resposta" e "Desafiar de volta"); 8, A abre a
  // resposta (a partida inteira, com a barra normal); e a partida só para ver (view), que não grava nada. O Centro reage ao resultado de
  // quem vê.
  //
  // Mandar: a folha do sistema (ou a cópia) só abre dentro do toque da pessoa, então o link fica pronto antes: ao chegar na tela, a cada
  // pausa na digitação do nome (que grava nos Ajustes ao preparar) e a cada troca da penalidade do sétimo. Até lá, o botão espera. O toque
  // dá o link por saído (app.duel.send: os tempos de A travam e a marca de mandado entra na fila, sem esperar) e abre a folha na hora; a
  // folha recusada oferece "Copiar o link", num toque novo, e a folha fechada sem mandar volta o desafio a jogar (app.duel.unsend).
  import { onDestroy, tick, untrack } from 'svelte';
  import { MAX_DUEL_NAME } from '../../core/duel/link';
  import { eventInfo } from '../../core/events';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import DuelCentro from './DuelCentro.svelte';
  import { bestOf, boardOf, duelTime, matchOf, outcomeOf, rowName } from './duel-view';
  import { focusTimerIfLost } from './focus';
  import Placar from './Placar.svelte';
  import { canShare, copyLink, shareLink } from './send';
  import ResultActions from '../timer/ResultActions.svelte';

  // A pausa na digitação do nome antes de preparar o link de novo.
  const NAME_DEBOUNCE_MS = 300;

  let { app }: { app: AppState } = $props();
  const uid = $props.id();

  let sectionEl = $state<HTMLElement>();
  let titleEl = $state<HTMLElement>();
  let name = $state(untrack(() => app.profile.duelName)); // o último usado (Ajustes); vazio, quem recebe lê "Alguém te desafiou"
  let prepared = $state<string | null>(null); // o link pronto para o toque; null enquanto prepara
  let copyOffer = $state<string | null>(null); // a folha recusou: o link que "Copiar o link" copia
  let noteValue = $state(''); // o campo de nota das ações (não aparece aqui)
  let destroyed = false;
  let generation = 0; // o preparo mais novo: um mais velho que termina depois não vale
  let debounce: ReturnType<typeof setTimeout> | undefined;

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
  // Quem manda: A com os sete (4) ou B com a partida acabada (7).
  const sendable = $derived(duel !== null && phase === 'finished');
  const last = $derived(duel?.mine.at(-1) ?? null);
  // +2 e DNF do sétimo, na tela de mandar, até o link sair (mesmo que a marca de mandado não tenha gravado).
  const penaltyOpen = $derived(duel !== null && duel.side === 'a' && phase === 'finished' && duel.status === 'playing' && !app.duel.linkOut);
  // O que muda o link: o desafio e as penalidades (o nome entra pelo campo).
  const content = $derived(duel ? `${duel.id}|${duel.mine.map((t) => t.penalty ?? '').join(',')}` : '');

  // A tela mudou de partida (a resposta chegou com a tela de mandar aberta) ou acabou de montar: o foco vai para o resultado, e uma
  // resposta que chega com a tela aberta é anunciada. Na montagem, só se o foco estava no Timer (que saiu da tela) ou perdido.
  let shownKey: string | null = null;
  $effect(() => {
    const key = `${phase}|${duel?.id ?? ''}`;
    untrack(() => {
      if (key === shownKey) return;
      const first = shownKey === null;
      shownKey = key;
      void tick().then(() => {
        if (destroyed) return;
        const active = document.activeElement;
        const lost = active === null || active === document.body || active.closest('[data-screen="timer"]') !== null;
        if (first && !lost) return;
        (titleEl ?? sectionEl)?.focus({ preventScroll: true });
        if (!first && phase === 'reply' && outcome) app.announce(T.duel.replyArrived(outcome.title, outcome.closed));
      });
    });
  });

  // O link fica pronto antes do toque. A penalidade (ou o desafio) mudou: na hora; só o nome: depois da pausa na digitação.
  let lastContent = '';
  $effect(() => {
    const ok = sendable;
    const c = content;
    const n = name;
    untrack(() => {
      if (!ok) return;
      const delay = c === lastContent ? NAME_DEBOUNCE_MS : 0;
      lastContent = c;
      prepare(n, delay);
    });
  });

  function prepare(n: string, delay: number): void {
    const mine = ++generation;
    prepared = null;
    copyOffer = null;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const side = duel?.side;
      const make = side === 'a' ? app.duel.challengeLink(location.origin, n) : app.duel.replyLink(location.origin, n);
      void make
        .catch(() => null)
        .then((url) => {
          if (!destroyed && mine === generation) prepared = url;
        });
    }, delay);
  }

  onDestroy(() => {
    destroyed = true;
    clearTimeout(debounce);
  });

  // O toque em Mandar: a marca de mandado entra na fila (sem esperar) e a folha do sistema abre na hora (ou, sem ela, a cópia), com o link já
  // pronto. Nada é esperado antes da folha: o gesto da pessoa só vale ali.
  function send(): void {
    const url = prepared;
    const d = duel;
    if (!url || !d) return;
    const text = d.side === 'a' ? T.duel.shareText(app.profile.duelName, short) : T.duel.replyText(app.profile.duelName, short);
    const marking = app.duel.send(location.origin);
    if (d.side === 'a') {
      void marking.then(
        (saved) => {
          if (!saved) app.showToast(T.duel.sentNotSaved);
        },
        () => app.showToast(T.duel.sentNotSaved),
      );
    }
    if (!canShare()) {
      copyNow(url);
      return;
    }
    copyOffer = null;
    void shareLink(text, url).then((how) => {
      if (how === 'cancelled') void app.duel.unsend(); // fechou a folha sem mandar: o desafio volta a jogar
      else if (how === 'failed' && !destroyed) copyOffer = url;
    });
  }

  // A cópia, também na hora do toque (o de Mandar sem a folha do sistema, ou o de "Copiar o link").
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

  // +2 e DNF no sétimo (a tela de mandar). O link é preparado de novo com a penalidade nova.
  async function penalize(p: '+2' | 'DNF'): Promise<void> {
    const t = last;
    if (!penaltyOpen || !t) return;
    await app.duel.setPenalty(t.penalty === p ? null : p);
    const now = app.duel.current?.mine.at(-1);
    if (now && now.penalty !== t.penalty) app.announce(T.aria.final(duelTime(now)));
  }

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

<!-- Mandar, com o link pronto (até lá, "Preparando o link…" e desligado); a folha recusada oferece a cópia num toque novo. -->
{#snippet sendButton(label: string)}
  <button type="button" class="btn primary dz-wide" disabled={prepared === null} aria-busy={prepared === null} onclick={send}
    >{prepared === null ? T.duel.preparing : label}</button
  >
  {#if copyOffer}
    <button type="button" class="btn dz-wide" onclick={() => copyOffer && copyNow(copyOffer)}>{T.duel.copyLink}</button>
  {/if}
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
        {#if penaltyOpen && last}
          <!-- O sétimo foi direto para cá: +2 e DNF dele, os mesmos do Timer, até o link sair. -->
          <div class="dz-last" role="group" aria-labelledby="{uid}-last">
            <p class="dz-note" id="{uid}-last">{T.duel.lastPenalty(duel.mine.length)}</p>
            <ResultActions
              visible
              plus2={last.penalty === '+2'}
              dnf={last.penalty === 'DNF'}
              note=""
              noteOpen={false}
              bind:noteValue
              onPlus2={() => penalize('+2')}
              onDnf={() => penalize('DNF')}
              onNote={() => {}}
              onDelete={() => {}}
              onNoteSave={() => {}}
              onNoteClose={() => {}}
              penaltiesOnly
            />
          </div>
        {/if}
      </div>
      {#if phase === 'finished'}
        {@render nameField(T.duel.nameHint)}
        {@render sendButton(T.duel.send)}
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
      {@render sendButton(T.duel.sendReply)}
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
