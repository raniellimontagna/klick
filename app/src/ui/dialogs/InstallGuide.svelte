<script lang="ts">
  // O guia de instalação. No iPhone, os passos do Safari: instalar na Tela de Início protege os dados do site. Nos outros navegadores,
  // o botão Instalar usa o evento beforeinstallprompt, quando o navegador manda um. Fechar, de qualquer jeito, grava que o guia foi
  // dispensado (meta.installGuideDismissed): o aparecimento automático vale uma vez.
  //
  // O navegador manda beforeinstallprompt cedo, então este componente deve ficar montado com o app (não só com o diálogo aberto).
  import { T } from '../../strings';
  import { isIOS } from '../platform';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  // O evento que o Chromium manda antes de oferecer a instalação. Não está no lib.dom do TypeScript.
  interface InstallPromptEvent extends Event {
    prompt(): Promise<void>;
  }

  let { app, open }: { app: AppState; open: boolean } = $props();

  const ios = isIOS();
  let installEvent = $state<InstallPromptEvent | null>(null);
  let dialogEl: HTMLDialogElement | undefined;

  $effect(() => {
    const keep = (e: Event): void => {
      e.preventDefault(); // o aviso padrão do navegador sai de cena; o botão do guia assume
      installEvent = e as InstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', keep);
    return () => window.removeEventListener('beforeinstallprompt', keep);
  });

  // O evento vale uma vez. Se o navegador recusa a janela, o menu dele continua disponível.
  async function install(): Promise<void> {
    const ev = installEvent;
    if (!ev) return;
    installEvent = null;
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
  <h2>{T.install.title}</h2>
  {#if ios}
    <p>{T.install.iosIntro}</p>
    <ol class="steps">
      {#each T.install.iosSteps as step (step)}
        <li>{step}</li>
      {/each}
    </ol>
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
</dialog>
