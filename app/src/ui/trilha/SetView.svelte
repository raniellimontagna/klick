<script lang="ts">
  // Um conjunto do treino (spec do sub-projeto 4, seções 7.1 e 7.4): os casos do mais fraco ao mais firme, com nível, tentativas, % de
  // acerto e a média das últimas 5 certas. Cada caso pode sair do sorteio (profile.trainOff); tocar no nome mostra como reconhecer e os
  // algoritmos, e deixa trocar o que a pessoa usa (profile.algChoice). A figura mostra como segurar o caso para o algoritmo escolhido (o
  // inverso dele, sem giro de cima). Com todos fora, o treino não começa. No desktop, o cabeçalho na largura toda e os casos em duas colunas.
  import { casesOf, choiceOf, chosenAlg, figureOf } from '../../core/trail/cases';
  import { invertAlg } from '../../core/trail/frame';
  import { formatMs } from '../../core/stats';
  import { firmCount, levelName, setStats, weakestFirst } from '../../core/trail/train';
  import type { CaseSet, TrainCase } from '../../core/trail/types';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import CaseFigure from './CaseFigure.svelte';

  let { app, set }: { app: AppState; set: CaseSet } = $props();

  const cases = $derived(new Map(casesOf(set).map((c) => [c.id, c])));
  const stats = $derived(setStats(set, app.practice));
  const rows = $derived(weakestFirst(stats));
  const included = $derived(stats.filter((s) => !app.profile.trainOff.includes(s.id)).length);
  let open = $state<string | null>(null);

  // Se a gravação falha, a caixa volta ao que está salvo (o aviso já saiu pela casca), como o modo silencioso do Centro.
  async function setIncluded(box: HTMLInputElement, id: string): Promise<void> {
    await app.setCaseOff(id, !box.checked);
    box.checked = !app.profile.trainOff.includes(id);
  }

  async function choose(box: HTMLInputElement, c: TrainCase, i: number): Promise<void> {
    await app.setAlgChoice(c.id, i);
    const saved = choiceOf(c, app.profile.algChoice);
    box.closest('fieldset')?.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((r) => {
      r.checked = Number(r.value) === saved;
    });
  }
</script>

<div class="set-view" data-set-view={set}>
  <header class="set-top">
    <div>
      <h2>{T.trilha.sets[set]}</h2>
      <p class="muted">{T.trilha.firm(firmCount(stats), stats.length)}</p>
    </div>
    <button type="button" class="link" onclick={() => app.openTrail()}>{T.trilha.lesson.exit}</button>
  </header>

  <div class="start">
    <button type="button" class="btn primary" disabled={included === 0} onclick={() => app.openTrail({ kind: 'round', set })}>{T.trilha.set.start}</button>
    {#if included === 0}
      <p class="muted" data-none-included>{T.trilha.set.noneIncluded}</p>
    {/if}
  </div>

  <div class="card">
    <div class="label">{T.trilha.set.cases}</div>
    <ul class="cases">
      {#each rows as s (s.id)}
        {@const c = cases.get(s.id)!}
        {@const off = app.profile.trainOff.includes(c.id)}
        <li data-case={c.id}>
          <div class="case-row">
            <!-- O rótulo é a área de toque da caixa (24 px, 44 no toque); o nome vem do aria-label. -->
            <label class="include">
              <input type="checkbox" checked={!off} aria-label={T.trilha.set.include(c.name)} onchange={(e) => void setIncluded(e.currentTarget, c.id)} />
            </label>
            <button type="button" class="case-name" aria-expanded={open === c.id} onclick={() => (open = open === c.id ? null : c.id)}>{c.name}</button>
            <span class="chip level">{T.trilha.set.level[levelName(s.level)]}</span>
          </div>
          <p class="muted case-stats">{T.trilha.set.stats(s.attempts, s.okRate, s.avg5 === null ? null : formatMs(s.avg5))}</p>
          {#if open === c.id}
            <div class="case-more">
              <CaseFigure setup={invertAlg(chosenAlg(c, app.profile.algChoice))} {...figureOf(c)} />
              <p><strong>{T.trilha.set.recog}:</strong> {c.recog}</p>
              <fieldset>
                <legend class="sr-only">{T.trilha.set.algs(c.name)}</legend>
                {#each c.algs as alg, i (alg)}
                  <label class="alg-choice">
                    <input type="radio" name={`alg-${c.id}`} value={i} checked={choiceOf(c, app.profile.algChoice) === i} onchange={(e) => void choose(e.currentTarget, c, i)} />
                    <span class="mono">{alg}</span>
                  </label>
                {/each}
              </fieldset>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .set-view {
    display: grid;
    gap: 16px;
    max-width: 640px;
  }

  .set-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .set-top h2 {
    margin: 0;
    font-size: 20px;
  }

  .set-top p,
  .start p {
    margin: 4px 0 0;
    font-size: 13px;
  }

  .cases {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  .set-view {
    --box: 24px; /* a área de toque da caixa do sorteio; os detalhes do caso alinham depois dela */
  }

  .case-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .include {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: var(--box);
    min-height: var(--box);
    cursor: pointer;
  }

  .include input {
    margin: 0;
  }

  .case-name {
    border: 0;
    background: none;
    padding: 4px 0;
    font: inherit;
    font-weight: 600;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }

  .level {
    margin-left: auto;
  }

  .case-stats {
    margin: 2px 0 0 calc(var(--box) + 10px);
    font-size: 13px;
  }

  .case-more {
    margin: 8px 0 0 calc(var(--box) + 10px);
    display: grid;
    gap: 6px;
  }

  .case-more p {
    margin: 0;
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .alg-choice {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mono {
    font-family: var(--mono);
  }

  /* No desktop (a quebra do Timer), a tela ocupa a moldura toda e os casos vão em duas colunas, lidos por linha (na ordem da lista). O
     caso aberto cresce na coluna dele; o vizinho de linha fica em cima. */
  @media (min-width: 1024px) {
    .set-view {
      max-width: none;
    }

    .cases {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--cols-gap);
      align-items: start;
    }
  }

  @media (pointer: coarse) {
    .set-view {
      --box: 44px;
    }

    .case-name,
    .alg-choice {
      min-height: 44px;
    }
  }
</style>
