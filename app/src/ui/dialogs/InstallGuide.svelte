<script lang="ts">
  // O guia de instalação. No iPhone, os passos do Safari: instalar na Tela de Início protege os dados do site. Nos outros navegadores,
  // o botão Instalar usa o evento beforeinstallprompt que a casca guardou (installEvent), quando o navegador mandou um. Fechar, de
  // qualquer jeito, grava que o guia foi dispensado (meta.installGuideDismissed): o aparecimento automático vale uma vez.
  import { T } from '../../strings';
  import { type InstallPromptEvent, isIOS } from '../platform';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let {
    app,
    open,
    installEvent = null,
    onused,
  }: { app: AppState; open: boolean; installEvent?: InstallPromptEvent | null; onused?: () => void } = $props();

  const ios = isIOS();
  let dialogEl = $state<HTMLDialogElement>();

  // O evento vale uma vez: quem usa o botão o tira da casca (onused). Se o navegador recusa a janela, o menu dele continua disponível.
  async function install(): Promise<void> {
    const ev = installEvent;
    if (!ev) return;
    onused?.();
    try {
      await ev.prompt();
    } catch {
      // nada a fazer: o menu do navegador segue como alternativa
    }
  }

  function onclose(): void {
    if (app.dialog === 'install') app.dialog = null;
    void app.updateMeta({ installGuideDismissed: true });
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.install.title} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.install.title}</h2>
    {#if ios}
      <p>{T.install.iosIntro}</p>
      <ol class="steps">
        {#each T.install.iosSteps as step (step)}
          <li>{step}</li>
        {/each}
      </ol>
      <p class="muted">{T.install.iosDataNote}</p>
    {:else}
      <p>{T.install.otherIntro}</p>
      {#if installEvent}
        <div class="row">
          <button type="button" class="btn primary" onclick={install}>{T.install.installButton}</button>
        </div>
      {:else}
        <p class="muted">{T.install.menuHint}</p>
      {/if}
    {/if}
    <div class="row">
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
