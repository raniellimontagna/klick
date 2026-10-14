<script lang="ts">
  // O começo da aba Trilha (spec do sub-projeto 4, seção 8.2): o Centro pequeno com as etapas feitas, o aviso para quem já resolve, a
  // próxima etapa, as 9 etapas (tocar abre a aula; "já sei" e "desfazer" ao lado) e os 3 conjuntos do treino.
  import { tick } from 'svelte';
  import { CASE_SETS } from '../../core/trail/cases';
  import { LESSONS } from '../../core/trail/lessons';
  import { firmCount, setStats } from '../../core/trail/train';
  import type { TrailStep } from '../../core/trail/types';
  import { T, TRAIL } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import MiniCentro from './MiniCentro.svelte';

  let { app }: { app: AppState } = $props();

  const done = $derived(app.profile.trail.filter(Boolean).length);
  const nextStep = $derived(app.profile.trail.findIndex((marked) => !marked)); // -1 com as 9 feitas
  // O passo guardado da próxima aula, no intervalo dela (um passo além do fim abre no último, como o leitor faz).
  const resumeAt = $derived(
    nextStep >= 0 ? Math.min(Math.max(app.profile.lessonAt[nextStep as TrailStep] ?? 0, 0), LESSONS[nextStep as TrailStep].parts.length - 1) : 0,
  );
  let picking = $state(false);
  let picked = $state(TRAIL.map(() => false));
  let homeEl = $state<HTMLElement>();

  // O foco não cai no body quando o botão que o tinha some: ele vai para o que se usa a seguir.
  async function focusOn(selector: string): Promise<void> {
    await tick();
    homeEl?.querySelector<HTMLElement>(selector)?.focus();
  }
  // A ação principal da tela: a próxima etapa ou, com as 9 feitas, o primeiro conjunto do treino.
  const focusMain = (): Promise<void> => focusOn('[data-next-step] .primary, [data-train-set]');

  function openPick(): void {
    picking = true;
    void focusOn('[data-pick]');
  }

  function cancelPick(): void {
    picking = false;
    void focusOn('[data-trail-prompt] .primary');
  }

  async function dismiss(): Promise<void> {
    await app.dismissTrailPrompt();
    if (!app.trailPromptShown) await focusMain();
  }

  const open = (step: number): void => app.openTrail({ kind: 'lesson', step: step as TrailStep });
  const toggle = (step: number): Promise<boolean> => app.setTrail([step as TrailStep], !app.profile.trail[step]);

  // Várias etapas de uma vez. O aviso some sozinho: com uma etapa marcada, ele não aparece mais.
  async function markPicked(): Promise<void> {
    const steps = picked.flatMap((on, i) => (on ? [i as TrailStep] : []));
    if (steps.length > 0) await app.setTrail(steps, true);
    if (!app.trailPromptShown) await focusMain();
  }
</script>

{#snippet training()}
  <div class="card" data-training>
    <div class="label">{T.trilha.train}</div>
    <p class="muted hint">{T.trilha.trainHint}</p>
    <ul class="sets">
      {#each CASE_SETS as set (set)}
        {@const stats = setStats(set, app.practice)}
        <li>
          <button type="button" class="btn set" data-train-set={set} onclick={() => app.openTrail({ kind: 'set', set })}>
            <span>{T.trilha.sets[set]}</span>
            <span class="muted">{T.trilha.firm(firmCount(stats), stats.length)}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

<div class="trail-home" bind:this={homeEl}>
  <header class="trail-top">
    <MiniCentro {app} />
    <div>
      <h2>{T.tabs.trilha}</h2>
      <p class="muted" data-trail-progress>{T.trilha.progress(done)}</p>
    </div>
  </header>

  {#if app.trailPromptShown}
    <div class="card prompt" data-trail-prompt>
      {#if picking}
        <fieldset>
          <legend>{T.trilha.promptPick}</legend>
          {#each TRAIL as name, i (name)}
            <label class="pick"><input type="checkbox" data-pick={i} bind:checked={picked[i]} />{name}</label>
          {/each}
        </fieldset>
        <div class="row">
          <button type="button" class="btn primary" disabled={!picked.some(Boolean)} onclick={markPicked}>{T.trilha.promptSave}</button>
          <button type="button" class="btn" onclick={cancelPick}>{T.trilha.promptCancel}</button>
        </div>
      {:else}
        <p>{T.trilha.prompt}</p>
        <div class="row">
          <button type="button" class="btn primary" onclick={openPick}>{T.trilha.promptOpen}</button>
          <button type="button" class="btn" onclick={dismiss}>{T.trilha.promptDismiss}</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if nextStep >= 0}
    <div class="card next" data-next-step>
      <div class="label">{T.trilha.next}</div>
      <h3>{TRAIL[nextStep]}</h3>
      <button type="button" class="btn primary" onclick={() => open(nextStep)}>{resumeAt > 0 ? T.trilha.resume(resumeAt + 1) : T.trilha.start}</button>
    </div>
  {:else}
    {@render training()}
  {/if}

  <div class="card">
    <div class="label">{T.trilha.steps}</div>
    <ul class="mlist trail" data-steps>
      {#each TRAIL as name, i (name)}
        {@const marked = Boolean(app.profile.trail[i])}
        <li class:done={marked} class:next={!marked && i === nextStep}>
          <i></i>
          <button type="button" class="step" data-step={i} onclick={() => open(i)}>{name}</button>
          <em>{marked ? T.trilha.state.done : i === nextStep ? T.trilha.state.current : T.trilha.state.ahead}</em>
          <button type="button" class="link" data-trail={i} aria-label={T.trilha.knowAria(name, marked)} onclick={() => void toggle(i)}>
            {marked ? T.trilha.undo : T.trilha.know}
          </button>
        </li>
      {/each}
    </ul>
  </div>

  {#if nextStep >= 0}
    {@render training()}
  {/if}
</div>

<style>
  .trail-home {
    display: grid;
    gap: 16px;
    max-width: 640px;
  }

  .trail-top {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .trail-top h2 {
    margin: 0;
    font-size: 20px;
  }

  .trail-top p,
  .hint {
    margin: 2px 0 0;
    font-size: 13px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .prompt p,
  .next h3 {
    margin: 6px 0 0;
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
  }

  .step {
    border: 0;
    background: none;
    padding: 4px 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  /* O estado vem antes do "já sei": a margem automática fica no estado, e o botão segue colado nele. */
  .mlist li em + .link {
    margin-left: 0;
  }

  .sets {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .set {
    width: 100%;
    justify-content: space-between;
  }

  @media (pointer: coarse) {
    .step,
    .pick {
      min-height: 44px;
    }
  }
</style>
