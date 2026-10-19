<script lang="ts">
  // Evolução › Desafios (a maquete aprovada, 9b): os desafios guardados, o mais novo em cima. Cada linha: o mini placar (a linha de cima é
  // você), o oponente, o evento, o estado e a data. "Jogando" abre direto no ponto em que parou, no Timer; os outros abrem a partida (9c).
  import type { Duel } from '../../core/types';
  import { T } from '../../strings';
  import { duelItemOf, miniBoardOf } from '../duel/duel-view';
  import { focusTimerIfLost } from '../duel/focus';
  import MiniPlacar from '../duel/MiniPlacar.svelte';
  import type { AppState } from '../state/app.svelte';
  import { scoreOf } from '../state/duel.svelte';

  let { app, duels, now }: { app: AppState; duels: readonly Duel[]; now: number } = $props();
  const uid = $props.id();

  const rows = $derived(
    duels.map((d) => {
      const score = scoreOf(d);
      return { d, board: miniBoardOf(d, score), item: duelItemOf(d, score, now) };
    }),
  );

  async function open(d: Duel): Promise<void> {
    if (d.status !== 'playing') {
      app.evolucaoView = { kind: 'duel', id: d.id };
      return;
    }
    if (!(await app.duel.resume(d.id))) return;
    app.tab = 'timer';
    focusTimerIfLost();
  }
</script>

<button type="button" class="link dz-back" aria-label={T.duel.backTo(T.tabs.evolucao)} onclick={() => (app.evolucaoView = { kind: 'stats' })}
  ><span aria-hidden="true">‹</span> {T.tabs.evolucao}</button
>
<div class="page-h"><h1 tabindex="-1" data-evo-heading>{T.duel.listTitle}</h1></div>
<ul class="dz-list">
  {#each rows as { d, board, item } (d.id)}
    <li>
      <!-- O nome é a linha (oponente, evento, estado, data); o placar por extenso fica de descrição. -->
      <button type="button" class="dz-item" aria-label={item.label} aria-describedby="{uid}-{d.id}" onclick={() => open(d)}>
        <MiniPlacar {board} id="{uid}-{d.id}" />
        <span class="dz-item-t">
          <b>{item.title} <span>· {item.event}</span></b>
          <small><span class="tag" class:wait={item.tag === 'wait'} class:live={item.tag === 'live'}>{item.tagText}</span>{item.detail}</small>
        </span>
        <span class="dz-chev" aria-hidden="true">›</span>
      </button>
    </li>
  {/each}
</ul>
<p class="dz-note dz-list-note">{T.duel.listNote}</p>
