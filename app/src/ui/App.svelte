<script lang="ts">
  import { onMount } from 'svelte';
  import { eventInfo } from '../core/events';
  import { T } from '../strings';
  import { dateLabel } from './format';
  import type { AppState, Tab } from './state/app.svelte';
  import { boot } from './state/boot';

  // Quanto o boot pode demorar antes de a casca desistir e mostrar o aviso de banco indisponível.
  const BOOT_DEADLINE_MS = 8000;

  const TABS: readonly { id: Tab; label: string }[] = [
    { id: 'timer', label: T.tabs.timer },
    { id: 'evolucao', label: T.tabs.evolucao },
    { id: 'companion', label: T.tabs.companion },
    { id: 'ajustes', label: T.tabs.ajustes },
  ];

  let app = $state.raw<AppState | null>(null);
  let failed = $state(false);

  // A CSS mostra a barra de baixo abaixo de 640 px e esconde a do topo. O atributo hidden faz o mesmo com a barra de baixo,
  // para só uma barra de abas ficar na árvore de acessibilidade, também onde a CSS não carrega (os testes).
  const compact = typeof matchMedia === 'function' ? matchMedia('(max-width: 639px)') : null;
  let isCompact = $state(compact?.matches ?? false);

  onMount(() => {
    const query = compact;
    const sync = () => {
      isCompact = query?.matches ?? false;
    };
    query?.addEventListener('change', sync);
    return () => query?.removeEventListener('change', sync);
  });

  // Enquanto boot() não termina, só o fundo aparece. Se ele falha (o navegador bloqueou o IndexedDB), ou não termina no prazo,
  // a mensagem sai no lugar. Se ele termina depois do prazo, a casca aparece no lugar da mensagem.
  onMount(() => {
    const deadline: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (!app) failed = true;
    }, BOOT_DEADLINE_MS);
    boot()
      .then((ready) => {
        app = ready;
      })
      .catch(() => {
        failed = true;
      })
      .finally(() => clearTimeout(deadline));
    return () => clearTimeout(deadline);
  });

  // Fechar a aba com solve que não foi gravado: o navegador pede confirmação. Sem nada pendente, fecha sem perguntar.
  onMount(() => {
    const confirmLeave = (e: BeforeUnloadEvent): void => {
      if (!app?.unsaved) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  });

  function go(tab: Tab): void {
    if (app) app.tab = tab;
  }

  function current(tab: Tab): 'page' | undefined {
    return app?.tab === tab ? 'page' : undefined;
  }
</script>

{#snippet icon(id: Tab)}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if id === 'timer'}
      <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" />
    {:else if id === 'evolucao'}
      <path d="M3 3v18h18" /><path d="m7 14 4-4 4 4 5-6" />
    {:else if id === 'companion'}
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    {:else}
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    {/if}
  </svg>
{/snippet}

<div data-testid="app-root">
  {#if app}
    <a class="skip" href="#main">{T.shell.skip}</a>

    <header class="topbar">
      <div class="wordmark"><span class="glyph" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>klick</div>
      <nav class="tabs" aria-label={T.shell.nav}>
        {#each TABS as tab (tab.id)}
          <button type="button" class="tab" data-tab={tab.id} aria-current={current(tab.id)} onclick={() => go(tab.id)}>{tab.label}</button>
        {/each}
      </nav>
      <div class="meta">
        <button type="button" class="pill" aria-haspopup="dialog">{T.session.pill(eventInfo(app.event).short, app.currentSession?.name ?? '')}</button>
        <span data-date>{dateLabel(Date.now())}</span>
      </div>
    </header>

    <main id="main">
      <section class="screen" data-screen="timer" aria-label={T.tabs.timer} hidden={app.tab !== 'timer'}>
        <h2 class="label">{T.tabs.timer}</h2>
      </section>
      <section class="screen" data-screen="evolucao" aria-label={T.tabs.evolucao} hidden={app.tab !== 'evolucao'}>
        <h2 class="label">{T.tabs.evolucao}</h2>
      </section>
      <section class="screen" data-screen="companion" aria-label={T.tabs.companion} hidden={app.tab !== 'companion'}>
        <h2 class="label">{T.tabs.companion}</h2>
      </section>
      <section class="screen" data-screen="ajustes" aria-label={T.tabs.ajustes} hidden={app.tab !== 'ajustes'}>
        <h2 class="label">{T.tabs.ajustes}</h2>
      </section>
    </main>

    <nav class="tabbar" aria-label={T.shell.nav} hidden={!isCompact}>
      {#each TABS as tab (tab.id)}
        <button type="button" data-tab={tab.id} aria-current={current(tab.id)} onclick={() => go(tab.id)}>
          {@render icon(tab.id)}
          {tab.label}
        </button>
      {/each}
    </nav>

    <div class="toast" hidden={!app.toast}>
      <span>{app.toast?.text ?? ''}</span>
      {#if app.toast?.action}
        <button type="button" onclick={() => app?.toast?.onAction?.()}>{app.toast.action}</button>
      {/if}
    </div>

    <div class="sr-only" aria-live="polite" data-live>{app.live}</div>

    <!-- Diálogos: montados aqui quando uma tela pedir um (app.dialog). Por enquanto a casca só reserva o lugar. -->
    <div data-dialogs></div>
  {:else if failed}
    <main class="screen">
      <p role="alert">{T.data.dbUnavailable}</p>
    </main>
  {/if}
</div>
