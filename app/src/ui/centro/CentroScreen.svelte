<script lang="ts">
  // A tela do Centro (porte de prototype/scripts/ui/companion-view.js): o cubo com a jornada, os acabamentos, os marcos (face de
  // cima), a trilha (face lateral) e o modo silencioso. Os marcos valem só para os solves de 3×3. Os textos ficam em strings.ts.
  import { MILESTONES, milestoneProgress } from '../../core/stats';
  import { FINISH_INFO, MILESTONE_INFO, T, TRAIL } from '../../strings';
  import { type Palette, paletteFor, renderCentro, type CentroTheme } from '../centro';
  import type { AppState } from '../state/app.svelte';

  type FinishKey = keyof typeof FINISH_INFO;

  const PREVIEW_MS = 3000; // a prévia de um acabamento bloqueado dura isto
  const isFinishKey = (f: string): f is FinishKey => Object.hasOwn(FINISH_INFO, f);
  const FINISH_IDS: readonly FinishKey[] = Object.keys(FINISH_INFO).filter(isFinishKey);
  // Cor de amostra de cada acabamento na lista (o fosco segue a cor do corpo do tema).
  const SWATCH: Readonly<Record<FinishKey, (p: Palette) => string>> = Object.freeze({
    fosco: (p) => p.body,
    brilho: (p) => `linear-gradient(135deg, #8a8a90, ${p.body} 60%)`,
    gelo: () => '#bfd9e6',
    carbono: () => 'repeating-linear-gradient(45deg, #222 0 3px, #151515 3px 6px)',
  });

  let { app }: { app: AppState } = $props();

  // O relógio da tela, renovado a cada minuto (como a Evolução): a sequência de dias e os marcos não ficam presos no dia em que a tela abriu.
  const CLOCK_MS = 60000;
  let clock = $state(Date.now());
  $effect(() => {
    const tick: ReturnType<typeof setInterval> = setInterval(() => {
      clock = Date.now();
    }, CLOCK_MS);
    return () => clearInterval(tick);
  });

  let darkMq = $state(false);
  let preview = $state<FinishKey | null>(null); // a prévia de um acabamento bloqueado, por PREVIEW_MS
  let previewGen = 0; // só o temporizador da prévia mais recente apaga a prévia
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  // Escritas da trilha em fila: cada toque lê o perfil depois da gravação anterior, então toques seguidos não se perdem.
  let trailWrites: Promise<void> = Promise.resolve();

  const finishName = (f: string): string => (isFinishKey(f) ? FINISH_INFO[f].label : FINISH_INFO.fosco.label);
  const unlocked = (f: FinishKey, done: number): boolean => f === 'fosco' || (f === 'brilho' && done === MILESTONES.length);

  // Os marcos saem só dos solves de 3×3.
  const milestones = $derived(milestoneProgress(app.solves.filter((s) => s.event === '333'), clock));
  const done = $derived(milestones.filter((m) => m.achieved).length);
  const trailDone = $derived(app.profile.trail.filter(Boolean).length);
  const nextMilestone = $derived(milestones.findIndex((m) => !m.achieved));
  const nextStep = $derived(app.profile.trail.findIndex((x) => !x));
  const shownFinish = $derived<FinishKey>(preview ?? (isFinishKey(app.profile.finish) ? app.profile.finish : 'fosco'));
  const theme = $derived<CentroTheme>(
    app.profile.settings.theme === 'system' ? (darkMq ? 'dark' : 'light') : app.profile.settings.theme === 'dark' ? 'dark' : 'light',
  );
  const palette = $derived(paletteFor(theme, 'fosco'));
  const svg = $derived(
    renderCentro({
      theme,
      eyes: 'open',
      topLit: done,
      sideLit: trailDone,
      finish: shownFinish,
      label: T.centro.progressLabel(done, trailDone),
    }),
  );

  function clearPreview(): void {
    previewGen++;
    clearTimeout(previewTimer);
    preview = null;
  }

  // Acabamento liberado grava o perfil e cancela a prévia. Bloqueado só mostra a prévia, por 3 s, e não grava nada.
  function pickFinish(f: FinishKey): void {
    if (unlocked(f, done)) {
      clearPreview();
      void app.updateProfile({ finish: f });
      return;
    }
    preview = f;
    const gen = ++previewGen;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (gen === previewGen) preview = null;
    }, PREVIEW_MS);
  }

  function toggleTrail(i: number): void {
    trailWrites = trailWrites
      .then(() => {
        const trail = [...app.profile.trail];
        trail[i] = !trail[i];
        return app.updateProfile({ trail });
      })
      // updateProfile não rejeita (AppState.write já mostra o aviso). Este catch só evita que uma rejeição inesperada deixe a
      // fila rejeitada, o que faria todos os toques seguintes sumirem sem aviso.
      .catch(() => app.showToast(T.data.saveFailed));
  }

  // Se a gravação falha, a caixa volta ao que está salvo (o aviso já saiu pela casca).
  async function setSilent(box: HTMLInputElement): Promise<void> {
    await app.updateSettings({ silent: box.checked });
    box.checked = app.profile.settings.silent;
  }

  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const sync = (): void => {
      darkMq = dark.matches;
    };
    sync();
    dark.addEventListener('change', sync);
    return () => dark.removeEventListener('change', sync);
  });

  // Ao sair da tela, a prévia pendente não pode disparar depois.
  $effect(() => {
    return () => {
      previewGen++;
      clearTimeout(previewTimer);
    };
  });
</script>

<section class="screen" data-screen="companion" aria-label={T.tabs.companion}>
  <div class="comp">
    <div class="stage">
      <div class="big">{@html svg}</div>
      <h2>{T.centro.label}</h2>
      <p>
        {T.season(done, finishName(app.profile.finish))}{#if preview}{T.centro.preview(FINISH_INFO[preview].label)}{/if}
      </p>
      <div class="finishes" role="group" aria-label={T.centro.finishes}>
        {#each FINISH_IDS as f (f)}
          {@const locked = !unlocked(f, done)}
          <button type="button" class="finish" class:locked data-finish={f} aria-pressed={shownFinish === f ? 'true' : 'false'} onclick={() => pickFinish(f)}>
            <i style:background={SWATCH[f](palette)}></i>
            {locked ? T.centro.finishLocked(FINISH_INFO[f].label, FINISH_INFO[f].unlock) : FINISH_INFO[f].label}
          </button>
        {/each}
      </div>
    </div>

    <div class="comp-cols">
      <div class="card">
        <div class="label">{T.centro.topFace}</div>
        <ul class="mlist">
          {#each milestones as m, i (m.id)}
            <li class:done={m.achieved} class:next={!m.achieved && i === nextMilestone}>
              <i></i>{MILESTONE_INFO[m.id].label}
              {#if m.achieved}<em>✓</em>{:else if m.progress}<em>{m.progress}</em>{/if}
            </li>
          {/each}
        </ul>
      </div>

      <div class="card">
        <div class="label">{T.centro.sideFace}</div>
        <ul class="mlist trail">
          {#each TRAIL as name, i (name)}
            {@const marked = Boolean(app.profile.trail[i])}
            <li class:done={marked} class:next={!marked && i === nextStep}>
              <i></i>{name}
              <button type="button" class="link" data-trail={i} aria-label={T.centro.trailAria(name, marked)} onclick={() => toggleTrail(i)}>
                {marked ? T.centro.undo : T.centro.know}
              </button>
            </li>
          {/each}
        </ul>
      </div>

      <div class="card silent-row">
        <input
          type="checkbox"
          class="switch"
          id="silent"
          data-silent
          checked={app.profile.settings.silent}
          onchange={(e) => setSilent(e.currentTarget)}
        />
        <label for="silent">
          <span class="label">{T.timer.coachLabel}</span>
          <span class="silent-hint">{T.centro.silentHint}</span>
        </label>
      </div>
    </div>
  </div>
</section>

<style>
  /* Em toque, o rótulo do modo silencioso é o alvo da caixa: 44 px de altura. */
  @media (pointer: coarse) {
    .silent-row label {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 44px;
    }
  }
</style>
