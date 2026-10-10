<script lang="ts">
  // Texto de uma exportação que o navegador não baixou (iframe, ou o download falhou). A pessoa copia; se a cópia é recusada, o texto
  // fica selecionado para ela copiar à mão. A exportação só conta como guardada depois de uma cópia que deu certo: ver o texto aqui
  // não basta.
  import { tick } from 'svelte';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let areaEl = $state<HTMLTextAreaElement>();
  let notice = $state('');
  const pending = $derived(app.pendingExport);

  // Seleciona o texto ao abrir (ou quando chega outro): a pessoa pode copiar direto pelo teclado.
  $effect(() => {
    if (!open || !pending) return;
    void tick().then(() => areaEl?.select());
  });

  // Fechou por qualquer caminho: limpa o texto e libera o diálogo, se ele ainda for este.
  function onclose(): void {
    notice = '';
    app.pendingExport = null;
    if (app.dialog === 'export') app.dialog = null;
  }

  async function copy(): Promise<void> {
    const current = pending;
    if (!current) return;
    // Sem área de transferência (ou a cópia recusada), o texto fica selecionado para a pessoa copiar à mão.
    const clipboard: Clipboard | undefined = navigator.clipboard;
    const copied = clipboard ? await clipboard.writeText(current.text).then(() => true, () => false) : false;
    if (!copied) {
      notice = T.exportDialog.copyManual;
      areaEl?.focus();
      areaEl?.select();
      return;
    }
    // "Copiado" só se a exportação ficou marcada; se a gravação falhou, o aviso de salvar já saiu.
    const saved = await app.markExported();
    if (saved) app.showToast(current.format === 'klick' ? T.exportDialog.copiedKlick : T.toast.exportCopied);
    dialogEl?.close();
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.exportDialog.title} use:modal={{ open, onclose }}>
  {#if open && pending}
    <h2>{T.exportDialog.title}</h2>
    <p class="muted">{pending.format === 'klick' ? T.exportDialog.klickIntro : T.exportDialog.csIntro}</p>
    <textarea
      bind:this={areaEl}
      class="export-text"
      readonly
      rows="8"
      aria-label={pending.format === 'klick' ? T.exportDialog.klickLabel : T.exportDialog.csLabel}
      value={pending.text}
    ></textarea>
    {#if notice}
      <p class="muted" role="status">{notice}</p>
    {/if}
    <div class="row">
      <button type="button" class="btn primary" onclick={copy}>{T.exportDialog.copy}</button>
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
