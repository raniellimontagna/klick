<script lang="ts">
  // As cópias automáticas, a mais recente primeiro. Restaurar troca tudo, então pede um segundo clique. A troca em si é do AppState
  // (restoreFromBackup): fila, prazo e recarregamento ficam lá.
  import type { BackupRecord } from '../../data/db';
  import { T } from '../../strings';
  import { dateLabel, timeOfDay } from '../format';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let backups = $state<BackupRecord[]>([]);
  let loaded = $state(false);
  let asking = $state<string | null>(null); // a cópia que espera o segundo clique
  let busy = $state(false);

  $effect(() => {
    if (!open) return;
    loaded = false;
    void load();
  });

  async function load(): Promise<void> {
    asking = null;
    try {
      backups = await app.listBackups();
    } catch {
      backups = [];
      app.showToast(T.backupsDialog.loadFailed);
    }
    loaded = true;
  }

  // Fechou por qualquer caminho: esquece o segundo clique pendente e libera o diálogo no estado, se ele ainda for este.
  function onclose(): void {
    asking = null;
    if (app.dialog === 'backups') app.dialog = null;
  }

  async function restore(b: BackupRecord): Promise<void> {
    if (busy) return;
    // Outra restauração corre (ou o portão segue fechado depois de um prazo): esta não começa e não pede confirmação.
    if (app.restoreRunning) {
      app.showToast(T.backupsDialog.restoreBusy);
      return;
    }
    if (asking !== b.id) {
      asking = b.id;
      return;
    }
    busy = true;
    let ok = false;
    try {
      ok = await app.restoreFromBackup(b.id);
    } catch {
      // Cópia que não abre, ou erro ao trocar: a troca não gravou nada, e o aviso diz que os dados seguem como estavam.
      app.showToast(T.backupsDialog.restoreFailed);
    } finally {
      busy = false;
      asking = null;
    }
    if (ok) {
      app.showToast(T.backupsDialog.restored);
      dialogEl?.close();
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.backupsDialog.title} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.backupsDialog.title}</h2>
    <p class="muted">{T.backupsDialog.intro}</p>
    {#if loaded && backups.length === 0}
      <p class="muted">{T.backupsDialog.empty}</p>
    {/if}
    <ul class="sheet-list">
      {#each backups as b (b.id)}
        {@const when = `${dateLabel(b.createdAt)}, ${timeOfDay(b.createdAt)}`}
        <li class="setting">
          <span>{T.backupsDialog.reason[b.reason]}<small>{when} · {T.backupsDialog.solves(b.solveCount)}</small></span>
          <button
            type="button"
            class="btn{asking === b.id ? ' danger' : ''}"
            aria-label={asking === b.id ? undefined : T.backupsDialog.restoreAria(when)}
            onclick={() => restore(b)}>{asking === b.id ? T.backupsDialog.confirm : T.backupsDialog.restore}</button
          >
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
