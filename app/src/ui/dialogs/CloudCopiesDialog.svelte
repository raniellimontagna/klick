<script lang="ts">
  // As cópias na nuvem (spec 8.3 e 9.1): os últimos 30 dias, com o número de solves de cada um. Restaurar pede um segundo clique: troca a
  // conta inteira, em todos os aparelhos. A cópia que não existe mais (passou dos 30 dias) avisa e a lista relê. As cópias pausadas dizem
  // por quê no topo, e cada recusa da restauração tem a mensagem dela, sem nada mudar (endurecimento 4.2 e decisões 1, 2, 3 e 6).
  import type { CopiesPaused, RestoreRefusal } from '../../core/sync/types';
  import { T } from '../../strings';
  import { ApiError, type CloudCopy } from '../../sync/api';
  import { confirmReady } from '../confirm';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl = $state<HTMLDialogElement>();
  let copies = $state<CloudCopy[]>([]);
  let loaded = $state(false);
  let failed = $state(false); // a lista não carregou: o aviso diz isso, não que não há cópias
  let listPaused = $state<CopiesPaused | null>(null); // a pausa que a lista trouxe ('ops' também quando ela não carregou por isso)
  let asking = $state<string | null>(null); // a cópia que espera o segundo clique
  let armedAt: number | null = null; // a hora do primeiro clique: o segundo, antes de CONFIRM_DELAY_MS, é o clique duplo e não vale
  let busy = $state(false);
  // A pausa no topo: a da lista, quando ela carregou (a mais nova; 'ops' também é a lista que não se renovou este mês) ou quando não carregou
  // por falta de operações do R2 no mês; antes, ou numa falha sem pausa, a do último sync.
  const paused = $derived(loaded && (!failed || listPaused !== null) ? listPaused : (app.account?.sync.copiesPaused ?? null));

  // A mensagem de cada recusa da restauração.
  const REFUSED: Readonly<Record<RestoreRefusal, string>> = {
    'no-room': T.conta.cloudNoRoom,
    'restore-limit': T.conta.cloudRestoreLimit,
    'r2-budget': T.conta.cloudOpsLimit,
    'too-big': T.conta.cloudTooBig,
    'write-budget': T.conta.cloudWriteBudget,
  };

  $effect(() => {
    if (!open) return;
    loaded = false;
    void load();
  });

  async function load(): Promise<void> {
    asking = null;
    failed = false;
    try {
      const list = await app.account?.cloudCopies();
      copies = list?.copies ?? [];
      listPaused = list?.paused ?? null;
    } catch (err) {
      // Sem operações do R2 no mês e sem lista guardada, o servidor diz isso: o aviso, e a pausa fica no topo; o resto é a falta de rede de
      // sempre.
      const ops = err instanceof ApiError && err.code === 'r2-budget';
      copies = [];
      listPaused = ops ? 'ops' : null;
      failed = true;
      app.showToast(ops ? T.conta.cloudOpsLimit : T.conta.cloudLoadFailed);
    }
    loaded = true;
  }

  // Fechou por qualquer caminho: esquece o segundo clique pendente e libera o diálogo no estado, se ele ainda for este.
  function onclose(): void {
    asking = null;
    if (app.dialog === 'cloud') app.dialog = null;
  }

  async function restore(c: CloudCopy): Promise<void> {
    const account = app.account;
    if (busy || !account) return;
    if (asking !== c.name) {
      asking = c.name;
      armedAt = Date.now();
      return;
    }
    if (!confirmReady(armedAt, Date.now())) return;
    busy = true;
    try {
      const outcome = await account.restoreCloudCopy(c.name);
      if (outcome === 'ok') {
        app.showToast(T.conta.cloudRestored);
        dialogEl?.close();
      } else if (outcome === 'gone') {
        app.showToast(T.conta.cloudGone);
        void load();
      } else app.showToast(outcome === 'failed' ? T.conta.cloudRestoreFailed : REFUSED[outcome]);
    } finally {
      busy = false;
      asking = null;
    }
  }
</script>

<dialog bind:this={dialogEl} class="sheet account-sheet" aria-label={T.conta.cloudTitle} use:modal={{ open, onclose }}>
  {#if open}
    <h2>{T.conta.cloudTitle}</h2>
    {#if paused}
      <p data-cloud-paused>{T.conta.cloudPaused(paused)}</p>
    {/if}
    <p class="muted">{T.conta.cloudIntro}</p>
    {#if loaded && !failed && copies.length === 0}
      <p class="muted">{T.conta.cloudEmpty}</p>
    {/if}
    <ul class="sheet-list">
      {#each copies as c (c.name)}
        {@const label = T.conta.cloudDay(c.day, c.kind)}
        <li class="setting">
          <span>{label}<small>{T.backupsDialog.solves(c.solves)}</small></span>
          <button
            type="button"
            class="btn{asking === c.name ? ' danger' : ''}"
            disabled={busy}
            aria-label={asking === c.name ? undefined : T.conta.cloudRestoreAria(label)}
            onclick={() => restore(c)}>{asking === c.name ? T.conta.confirmAgain : T.conta.cloudRestore}</button
          >
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
