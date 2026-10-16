<script lang="ts">
  import { onMount } from 'svelte';
  import { eventInfo } from '../core/events';
  import { T } from '../strings';
  import { dateLabel } from './format';
  import { importFile } from './import-flow';
  import { type InstallPromptEvent, isStandalone, shouldShowInstallGuide } from './platform';
  import type { AppState, DialogId, Tab } from './state/app.svelte';
  import { boot } from './state/boot';
  import AjustesScreen from './ajustes/AjustesScreen.svelte';
  import CentroScreen from './centro/CentroScreen.svelte';
  import EvolucaoScreen from './evolucao/EvolucaoScreen.svelte';
  import InstallGuide from './dialogs/InstallGuide.svelte';
  import OnboardingDialog from './dialogs/OnboardingDialog.svelte';
  import SessionsDialog from './dialogs/SessionsDialog.svelte';
  import ShortcutsDialog from './dialogs/ShortcutsDialog.svelte';
  import SignInDialog from './dialogs/SignInDialog.svelte';
  import UpdatePrompt from './dialogs/UpdatePrompt.svelte';
  import DbNotice from './dialogs/DbNotice.svelte';
  import { dbNotice, dbUpgrade } from './state/db-notice.svelte';
  import TimerScreen from './timer/TimerScreen.svelte';

  // Quanto o boot pode demorar antes de a casca desistir e mostrar o aviso de banco indisponível.
  const BOOT_DEADLINE_MS = 8000;
  // O guia de instalação aparece depois deste número de solves (no iPhone, fora do app instalado, uma vez).
  const INSTALL_GUIDE_SOLVES = 5;

  const TABS: readonly { id: Tab; label: string }[] = [
    { id: 'timer', label: T.tabs.timer },
    { id: 'evolucao', label: T.tabs.evolucao },
    { id: 'trilha', label: T.tabs.trilha },
    { id: 'companion', label: T.tabs.companion },
    { id: 'ajustes', label: T.tabs.ajustes },
  ];

  // A aba Trilha carrega na primeira vez que abre: as aulas ficam fora do código da abertura (spec 9.5). O service worker guarda o pedaço.
  // Se ele não carrega, a aba mostra a linha de erro, e "Tentar de novo" refaz o import (loadTrilha é trocável nos testes). Alguns
  // navegadores guardam a falha do import dinâmico: se a nova tentativa também falha, a linha oferece recarregar a página.
  let { loadTrilha = () => import('./trilha/TrilhaScreen.svelte') }: { loadTrilha?: () => Promise<typeof import('./trilha/TrilhaScreen.svelte')> } =
    $props();
  let trilhaTry = $state(0);
  // O botão de tentar de novo sumiu com o clique (o bloco refaz o import): o de recarregar, que entra no lugar dele, recebe o foco que
  // caiu no body.
  const takeFocus = (el: HTMLElement): void => {
    if (document.activeElement === null || document.activeElement === document.body) el.focus();
  };

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
  // a mensagem sai no lugar. Se ele termina depois do prazo, a casca aparece no lugar da mensagem. Enquanto o banco migra (spec 5.6), o
  // prazo não vale: num aparelho antigo com muito histórico a migração passa dos 8 s, e recarregar a abortaria. Quando ela termina e o
  // boot ainda não, o prazo recomeça inteiro.
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let booting = true;
  const armDeadline = (): void => {
    clearTimeout(deadline);
    deadline = setTimeout(() => {
      if (!app && dbUpgrade() !== 'running') failed = true;
    }, BOOT_DEADLINE_MS);
  };
  onMount(() => {
    armDeadline();
    boot()
      .then((ready) => {
        app = ready;
      })
      .catch(() => {
        failed = true;
      })
      .finally(() => {
        booting = false;
        clearTimeout(deadline);
      });
    return () => {
      booting = false;
      clearTimeout(deadline);
    };
  });
  let wasUpgrading = false;
  $effect(() => {
    const upgrading = dbUpgrade() === 'running';
    if (wasUpgrading && !upgrading && booting) armDeadline();
    wasUpgrading = upgrading;
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

  // Instalado, o navegador costuma liberar a proteção dos dados: o pedido de proteção sai de novo (o AppState decide se cabe).
  onMount(() => {
    const installed = (): void => {
      void app?.retryPersistence();
    };
    window.addEventListener('appinstalled', installed);
    return () => window.removeEventListener('appinstalled', installed);
  });

  // O navegador manda beforeinstallprompt cedo, antes de qualquer diálogo: o ouvinte fica aqui desde a montagem, e o guia recebe o evento
  // guardado. O evento vale uma vez (onused, do guia, o tira daqui).
  let installEvent = $state.raw<InstallPromptEvent | null>(null); // raw: um Event do navegador não é um objeto para virar proxy
  onMount(() => {
    const keep = (e: Event): void => {
      e.preventDefault(); // o aviso padrão do navegador sai de cena; o botão do guia assume
      installEvent = e as InstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', keep);
    return () => window.removeEventListener('beforeinstallprompt', keep);
  });

  // As aberturas sozinhas valem uma vez por abertura do app. Dispensar o guia fica gravado (meta), então ele não volta nas próximas.
  let tourOffered = false;
  let installOffered = false;

  // Primeira vez: o tour abre quando nenhum outro diálogo está aberto e o perfil ainda não foi marcado como visto.
  $effect(() => {
    if (!app || tourOffered || app.dialog !== null || app.profile.onboarded) return;
    tourOffered = true;
    app.dialog = 'onboarding';
  });

  // O guia de instalação: no iPhone, fora do app instalado, depois do 5º solve, uma vez, e só com o timer parado (o solve acabou). A regra
  // de plataforma fica em shouldShowInstallGuide.
  $effect(() => {
    const meta = app?.meta;
    if (!app || !meta || installOffered || app.dialog !== null || app.timerBusy || app.solves.length < INSTALL_GUIDE_SOLVES) return;
    const offer = shouldShowInstallGuide({
      ua: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      standalone: isStandalone(),
      dismissed: meta.installGuideDismissed,
    });
    if (!offer) return;
    installOffered = true;
    app.dialog = 'install';
  });

  function go(tab: Tab): void {
    if (app) app.tab = tab;
  }

  // Trocar de aba volta ao topo: a página rola na janela, e a aba nova abria na rolagem da anterior (a Evolução no meio do histórico,
  // depois de Ajustes). Vale para qualquer troca (abas, atalhos, tour, exportar); abrir o app não mexe na rolagem.
  let shownTab: Tab | null = null;
  $effect(() => {
    const tab = app?.tab;
    if (!tab) return;
    if (shownTab !== null && shownTab !== tab) window.scrollTo(0, 0);
    shownTab = tab;
  });

  function current(tab: Tab): 'page' | undefined {
    return app?.tab === tab ? 'page' : undefined;
  }

  function openDialog(id: DialogId): void {
    if (app) app.dialog = id;
  }

  // O seletor do tour ("Importar do csTimer"). Fica montado com o app, fora das telas, para o toque abrir o seletor na hora (o iOS só
  // abre o seletor dentro do toque). Escolher um arquivo usa o mesmo fluxo da seção Seus dados; se o resultado é um diálogo de importar,
  // a tela vai para Ajustes, onde o ImportDialog está.
  let importInput = $state<HTMLInputElement>();
  async function onTourFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const a = app;
    if (!file || !a) return;
    await importFile(a, file);
    if (a.dialog === 'import') a.tab = 'ajustes';
  }
</script>

{#snippet icon(id: Tab)}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if id === 'timer'}
      <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" />
    {:else if id === 'evolucao'}
      <path d="M3 3v18h18" /><path d="m7 14 4-4 4 4 5-6" />
    {:else if id === 'trilha'}
      <path d="M3 21h5v-5h5v-5h5V6h3" /><circle cx="20" cy="3.5" r="1.5" />
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
        <button type="button" class="pill" data-session-pill aria-haspopup="dialog" onclick={() => openDialog('sessions')}>{T.session.pill(eventInfo(app.event).short, app.activeSession?.name ?? '')}</button>
        <span data-date>{dateLabel(Date.now())}</span>
      </div>
    </header>

    <main id="main">
      <TimerScreen {app} />
      <!-- Evolução e Centro só são montadas com a aba aberta: o relógio da Evolução (a hora de "Quando" e a janela do período) só anda
           enquanto a tela existe, e fora da aba não deixa seção escondida na árvore de acessibilidade. Os filtros da Evolução
           voltam ao padrão ao trocar de aba. -->
      {#if app.tab === 'evolucao'}
        <EvolucaoScreen {app} />
      {/if}
      {#if app.tab === 'trilha'}
        {#key trilhaTry}
          {#await loadTrilha() then { default: TrilhaScreen }}
            <TrilhaScreen {app} />
          {:catch}
            <section class="screen" data-screen="trilha" aria-label={T.tabs.trilha}>
              {#if trilhaTry === 0}
                <p role="alert" data-trail-load-failed>{T.trilha.loadFailed}</p>
                <button type="button" class="btn" onclick={() => trilhaTry++}>{T.trilha.retry}</button>
              {:else}
                <p role="alert" data-trail-load-failed>{T.trilha.loadFailedAgain}</p>
                <button type="button" class="btn" onclick={() => location.reload()} {@attach takeFocus}>{T.trilha.reload}</button>
              {/if}
            </section>
          {/await}
        {/key}
      {/if}
      {#if app.tab === 'companion'}
        <CentroScreen {app} />
      {/if}
      <!-- A tela Ajustes só é montada com a aba aberta, como as outras que não são o Timer. -->
      {#if app.tab === 'ajustes'}
        <AjustesScreen {app} />
      {/if}
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

    <UpdatePrompt {app} />

    <!-- Diálogos da casca, sempre montados: cada um abre quando app.dialog é o seu id. Os de "Seus dados" (exportar, importar, cópias e
         lixeira) ficam na seção Ajustes, que os monta e os desmonta com ela. -->
    <input
      bind:this={importInput}
      type="file"
      accept=".json,.txt"
      hidden
      aria-label={T.onboarding.importFileTour}
      data-import-input
      onchange={onTourFile}
    />

    <div data-dialogs>
      <SessionsDialog {app} open={app.dialog === 'sessions'} />
      <ShortcutsDialog {app} open={app.dialog === 'shortcuts'} />
      <OnboardingDialog {app} open={app.dialog === 'onboarding'} onpickfile={() => importInput?.click()} />
      <InstallGuide {app} open={app.dialog === 'install'} {installEvent} onused={() => (installEvent = null)} />
      {#if app.account}
        <SignInDialog {app} open={app.dialog === 'signin'} />
      {/if}
    </div>
  {:else if dbUpgrade() === 'running'}
    <main class="screen">
      <p role="status">{T.data.upgrading}</p>
    </main>
  {:else if failed && dbUpgrade() === 'failed'}
    <main class="screen">
      <p role="alert">{T.data.upgradeFailed}</p>
    </main>
  {:else if failed && dbNotice() !== 'closeOthers'}
    <main class="screen">
      <p role="alert">{T.data.dbUnavailable}</p>
    </main>
  {/if}
  <DbNotice {app} />
</div>
