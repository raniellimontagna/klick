<script lang="ts">
  // "Seus dados" (Ajustes): armazenamento, cópias automáticas, lixeira, exportar, importar, pasta das cópias e instalação. Porte do
  // markup da tela (linhas .setting, botões .btn). Os diálogos que a seção abre (exportar, importar, cópias e lixeira) ficam montados
  // aqui. O guia de instalação é montado pelo App: este botão só pede a abertura (app.dialog = 'install'). A importação de arquivo é a
  // mesma do tour (ui/import-flow.ts): o estado do ImportDialog vive no AppState.
  import { onDestroy, onMount, tick } from 'svelte';
  import { folderSupported } from '../../data/folder';
  import { T } from '../../strings';
  import { daysAgoLabel } from '../format';
  import { isStandalone } from '../platform';
  import { groupTrash } from '../trash';
  import { confirmCsTimerImport, importFile, importV1Flow } from '../import-flow';
  import BackupsDialog from '../dialogs/BackupsDialog.svelte';
  import ExportDialog from '../dialogs/ExportDialog.svelte';
  import ImportDialog from '../dialogs/ImportDialog.svelte';
  import TrashDialog from '../dialogs/TrashDialog.svelte';
  import type { AppState, DialogId } from '../state/app.svelte';

  let { app }: { app: AppState } = $props();

  const folderOk = folderSupported();
  const installed = isStandalone(); // aberto como app instalado: não há o que ensinar a instalar
  // Os diálogos que esta seção abre (o guia de instalação é do App).
  const DATA_DIALOGS: readonly DialogId[] = ['export', 'import', 'backups', 'trash'];

  interface StorageView {
    persisted: boolean | null;
    usage: number | null;
    quota: number | null;
  }
  let storage = $state<StorageView | null>(null); // null enquanto consulta
  let backupCount = $state<number | null>(null);
  let trashCount = $state<number | null>(null);
  let trashDuels = $state(false); // há desafio na lixeira: o texto dela fala deles
  let folderChosen = $state<boolean | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let statusEl = $state<HTMLElement>();

  const showProtect = $derived(storage?.persisted === false);

  const storageLabel = $derived(
    storage === null
      ? T.dados.checking
      : storage.persisted === true
        ? T.dados.protectedLabel
        : storage.persisted === false
          ? T.dados.unprotectedLabel
          : T.dados.unknownLabel,
  );

  const storageHint = $derived.by(() => {
    if (storage === null) return '';
    const base =
      storage.persisted === true ? T.dados.protectedHint : storage.persisted === false ? T.dados.unprotectedHint : T.dados.unknownHint;
    if (storage.usage === null) return base;
    const quota = storage.quota === null ? null : T.dados.bytes(storage.quota);
    return `${base} ${T.dados.usage(T.dados.bytes(storage.usage), quota)}.`;
  });

  const exportNote = $derived.by(() => {
    const last = app.meta?.lastExportAt ?? null;
    const since = app.meta?.solvesSinceExport ?? 0;
    const when = last === null ? T.dados.neverExported : T.dados.lastExport(daysAgoLabel(last, Date.now()));
    return since > 0 ? `${when} ${T.dados.sinceExport(since)}` : when;
  });

  async function refreshStorage(): Promise<void> {
    storage = await app.storageInfo();
  }

  async function refreshCounts(): Promise<void> {
    const [backups, trash, folder] = await Promise.all([
      app.listBackups().then((list) => list.length, () => null),
      app.listTrash().then((t) => ({ count: groupTrash(t).count, duels: t.duels.length > 0 }), () => null),
      app.hasBackupFolder().catch(() => null),
    ]);
    backupCount = backups;
    trashCount = trash?.count ?? null;
    trashDuels = trash?.duels ?? false;
    folderChosen = folder;
  }

  onMount(() => {
    void refreshStorage();
  });

  // Ao montar e sempre que um diálogo fecha: uma cópia nova ou a lixeira podem ter mudado.
  $effect(() => {
    if (app.dialog === null) void refreshCounts();
  });

  // Desmontar a seção com um dos seus diálogos aberto (a aba mudou, por exemplo) solta o estado: senão, na volta, o diálogo reabriria
  // sozinho. O destroy do modal não faz isso.
  onDestroy(() => {
    if (app.dialog !== null && DATA_DIALOGS.includes(app.dialog)) app.dialog = null;
  });

  // "Proteger meus dados". Quando o pedido dá certo, o botão sai: o foco vai para o estado, que continua na tela.
  async function protect(): Promise<void> {
    const result = await app.requestProtection();
    await refreshStorage();
    if (!showProtect) {
      await tick();
      statusEl?.focus();
    }
    if (result === 'denied') app.showToast(T.dados.persistDenied);
    else if (result === 'unsupported') app.showToast(T.dados.persistUnsupported);
  }

  // O seletor desta seção. O mesmo arquivo pode ser escolhido de novo, então o campo esvazia.
  async function onFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await importFile(app, file);
  }

  // Escolher a pasta é um gesto só: o seletor do navegador sai daqui, direto do clique.
  async function chooseFolder(): Promise<void> {
    await app.chooseBackupFolder();
    await refreshCounts();
  }
</script>

{#snippet caption(label: string, hint?: string)}
  <span>{label}{#if hint}<small>{hint}</small>{/if}</span>
{/snippet}

<fieldset data-slot="seus-dados">
  <legend>{T.dados.title}</legend>

  <div class="setting">
    {@render caption(T.dados.storage, storageHint)}
    <span class="data-actions">
      <span class="data-status" tabindex="-1" bind:this={statusEl}>{storageLabel}</span>
      {#if showProtect}
        <button type="button" class="btn" onclick={protect}>{T.dados.protect}</button>
      {/if}
    </span>
  </div>

  <div class="setting">
    {@render caption(T.dados.backups, T.dados.backupsHint)}
    <button type="button" class="btn" onclick={() => (app.dialog = 'backups')}>{T.dados.backupsView(backupCount)}</button>
  </div>

  <div class="setting">
    {@render caption(T.dados.trash, trashDuels ? T.duel.trashHint : T.dados.trashHint)}
    <button type="button" class="btn" onclick={() => (app.dialog = 'trash')}>{T.dados.trashView(trashCount)}</button>
  </div>

  <div class="setting">
    {@render caption(T.dados.export, exportNote)}
    <span class="data-actions">
      <button type="button" class="btn" onclick={() => app.exportFile('klick')}>{T.dados.exportKlick}</button>
      <button type="button" class="btn" onclick={() => app.exportFile('cstimer')}>{T.dados.exportCsTimer}</button>
    </span>
  </div>

  <div class="setting">
    {@render caption(T.dados.import, T.dados.importHint)}
    <button type="button" class="btn" disabled={app.importBusy} onclick={() => fileInput?.click()}>{T.dados.importFile}</button>
  </div>

  {#if app.v1Available}
    <div class="setting">
      {@render caption(T.dados.importV1, T.dados.importV1Hint)}
      <button type="button" class="btn" disabled={app.importBusy} onclick={() => importV1Flow(app)}>{T.dados.importV1}</button>
    </div>
  {/if}

  {#if folderOk}
    <div class="setting">
      {@render caption(T.dados.folder, app.folderNeedsPermission ? T.dados.folderPermissionLost : folderChosen ? T.dados.folderChosen : T.dados.folderHint)}
      <span class="data-actions">
        {#if app.folderNeedsPermission}
          <button type="button" class="btn" onclick={() => app.reauthorizeFolder()}>{T.dados.folderAllowAgain}</button>
        {/if}
        <button type="button" class="btn" onclick={chooseFolder}>{folderChosen ? T.dados.folderChange : T.dados.folderChoose}</button>
      </span>
    </div>
  {/if}

  <div class="setting">
    {#if installed}
      {@render caption(T.dados.install, T.dados.installedHint)}
      <span class="data-status">{T.dados.installedLabel}</span>
    {:else}
      {@render caption(T.dados.install, T.dados.installHint)}
      <button type="button" class="btn" onclick={() => (app.dialog = 'install')}>{T.dados.installButton}</button>
    {/if}
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept=".json,.txt"
    hidden
    aria-label={T.dados.importFile}
    onchange={onFile}
  />
</fieldset>

<ExportDialog {app} open={app.dialog === 'export'} />
<ImportDialog
  {app}
  open={app.dialog === 'import'}
  sessions={app.importDraft}
  summary={app.importSummary}
  onconfirm={(mapping) => confirmCsTimerImport(app, mapping)}
/>
<BackupsDialog {app} open={app.dialog === 'backups'} />
<TrashDialog {app} open={app.dialog === 'trash'} />
