<script lang="ts">
  // A tela do Centro: o cubo com a jornada, os acabamentos, os marcos da temporada atual (face de cima), o resumo da trilha (face lateral,
  // que leva à aba Trilha), o histórico das temporadas e o modo silencioso. Os marcos valem só para os solves de 3×3. Os textos ficam em strings.ts.
  import { tick } from 'svelte';
  import { finishUnlocked, type MarkStatus, markLabel, seasonFinish, seasonSolves } from '../../core/season';
  import { currentStreak, formatMs } from '../../core/stats';
  import type { SeasonRecord } from '../../core/types';
  import { FINISH_INFO, T, TRAIL } from '../../strings';
  import { type Palette, paletteFor, renderCentro, type CentroTheme } from '../centro';
  import { createCentroAnimator } from '../centro/animator';
  import { fullDate, shortDate } from '../format';
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

  const finishName = (f: string): string => (isFinishKey(f) ? FINISH_INFO[f].label : FINISH_INFO.fosco.label);
  const unlocked = (f: FinishKey): boolean => finishUnlocked(f, app.profile.season.past.length);

  // A temporada atual: os marcos saem dos solves de 3×3 depois do início dela (a conta é do AppState, guardada por lista).
  const season = $derived(app.profile.season.current);
  const status = $derived(app.seasonStatus(app.solves, season));
  const done = $derived(status.filter((m) => m.achieved).length);
  const nextMilestone = $derived(status.findIndex((m) => !m.achieved));
  const streakNow = $derived(currentStreak(seasonSolves(app.solves, season), clock));
  const marks = $derived(
    status.map((m, i) => ({ label: markLabel(season.n, i, m.mark), achieved: m.achieved, progress: m.achieved ? null : progressText(m) })),
  );
  const history = $derived([...app.profile.season.past].reverse());
  const trailDone = $derived(app.profile.trail.filter(Boolean).length);
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

  // O Centro grande segue o ajuste: animado ou estático (nesta tela, "oculto" vale como estático). Parado, só pisca, olha e orbita.
  let bigEl = $state<HTMLElement>();
  let reduceMq = $state(false);
  const animator = createCentroAnimator({ svg: () => bigEl?.querySelector<SVGElement>('svg.centro') ?? null });
  $effect(() => {
    const s = app.profile.settings;
    animator.setAnimated(s.centro === 'animado' && s.reducedMotion !== 'always' && !reduceMq);
  });
  // O SVG é refeito quando as marcas, o tema ou o acabamento mudam: o animador pinta nele o parado.
  $effect(() => {
    void svg;
    void tick().then(() => {
      animator.show({ state: 'idle' });
      animator.repaint();
    });
  });
  // O animador para com a página escondida ou com o Centro grande fora da área visível (spec 6.4).
  let pageVisible = $state(true);
  let onScreen = $state(true); // o Centro grande está na área visível (IntersectionObserver)
  $effect(() => {
    animator.setPaused(!pageVisible || !onScreen);
  });
  $effect(() => {
    const sync = (): void => {
      pageVisible = !document.hidden;
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      animator.destroy();
    };
  });
  $effect(() => {
    const el = bigEl;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  });

  // O que falta num marco pendente: quantos, o melhor até agora, os dias seguidos de agora ou a menor variação.
  function progressText(m: MarkStatus): string | null {
    const { kind, target } = m.mark;
    switch (kind) {
      case 'count':
        return target === 1 ? null : T.progress.of(Math.min(m.current ?? 0, target), target);
      case 'single':
      case 'ao5':
      case 'ao12':
        return m.current === null ? null : T.progress.best(formatMs(m.current));
      case 'streak':
        return T.progress.days(Math.min(streakNow, target), target);
      case 'steady':
        return m.current === null ? null : T.progress.spread(formatMs(m.current));
    }
  }

  function historyRow(r: SeasonRecord): string {
    const finish = seasonFinish(r.n);
    return T.centro.historyRow(r.n, fullDate(r.startedAt), fullDate(r.endedAt), r.solves, r.endAo12 === null ? null : formatMs(r.endAo12), finish ? FINISH_INFO[finish].label : null);
  }

  function clearPreview(): void {
    previewGen++;
    clearTimeout(previewTimer);
    preview = null;
  }

  // Acabamento liberado grava o perfil e cancela a prévia. Bloqueado só mostra a prévia, por 3 s, e não grava nada.
  function pickFinish(f: FinishKey): void {
    if (unlocked(f)) {
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

  // Se a gravação falha, a caixa volta ao que está salvo (o aviso já saiu pela casca).
  async function setSilent(box: HTMLInputElement): Promise<void> {
    await app.updateSettings({ silent: box.checked });
    box.checked = app.profile.settings.silent;
  }

  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = (): void => {
      darkMq = dark.matches;
      reduceMq = reduce.matches;
    };
    sync();
    const all = [dark, reduce];
    all.forEach((mq) => mq.addEventListener('change', sync));
    return () => all.forEach((mq) => mq.removeEventListener('change', sync));
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
      <div class="big" bind:this={bigEl}>{@html svg}</div>
      <h2>{T.centro.label}</h2>
      <p>
        {T.season(season.n, done, finishName(app.profile.finish))}{#if preview}{T.centro.preview(FINISH_INFO[preview].label)}{/if}
      </p>
      <div class="finishes" role="group" aria-label={T.centro.finishes}>
        {#each FINISH_IDS as f (f)}
          {@const locked = !unlocked(f)}
          <button type="button" class="finish" class:locked data-finish={f} aria-pressed={shownFinish === f ? 'true' : 'false'} onclick={() => pickFinish(f)}>
            <i style:background={SWATCH[f](palette)}></i>
            {locked ? T.centro.finishLocked(FINISH_INFO[f].label, FINISH_INFO[f].unlock) : FINISH_INFO[f].label}
          </button>
        {/each}
      </div>
    </div>

    <div class="comp-cols">
      <div class="card">
        <div class="label">{T.centro.topFace(season.n, season.n === 1 ? null : shortDate(season.startedAt))}</div>
        <ul class="mlist">
          {#each marks as m, i (i)}
            <li class:done={m.achieved} class:next={!m.achieved && i === nextMilestone}>
              <i></i>{m.label}
              {#if m.achieved}<em>✓</em>{:else if m.progress}<em>{m.progress}</em>{/if}
            </li>
          {/each}
        </ul>
      </div>

      <!-- A trilha mora na aba dela (spec do sub-projeto 4, seção 8.3): aqui fica só o resumo, que leva até lá. -->
      <button type="button" class="card trail-summary" data-trail-summary onclick={() => app.openTrail()}>
        {T.centro.trailSummary(trailDone, nextStep >= 0 ? TRAIL[nextStep] : null)}
      </button>

      <div class="card">
        <div class="label">{T.centro.history}</div>
        {#if history.length === 0}
          <p class="muted">{T.centro.historyEmpty}</p>
        {:else}
          <ul class="mlist">
            {#each history as r (r.n)}
              <li class="done"><i></i>{historyRow(r)}</li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="card">
        <div class="label">{T.centro.card}</div>
        <div class="seg" role="group" aria-label={T.centro.mode}>
          {#each T.centro.modeOptions as [value, label] (value)}
            <button
              type="button"
              data-set="centro"
              data-val={value}
              aria-pressed={app.profile.settings.centro === value ? 'true' : 'false'}
              onclick={() => app.updateSettings({ centro: value })}>{label}</button
            >
          {/each}
        </div>
        <p class="silent-hint">{T.centro.modeHint}</p>
        <div class="silent-row">
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
  </div>
</section>

<style>
  .trail-summary {
    font: inherit;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }

  /* O cartão do Centro empilha o seletor, a dica e a linha do modo silencioso. */
  .card > .seg {
    margin-top: 10px;
  }

  .card > .silent-hint {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--ink-2);
  }

  .card > .silent-row {
    margin-top: 14px;
  }

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
