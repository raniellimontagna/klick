<script lang="ts">
  // O diálogo de atalhos (porte do protótipo: a mesma tabela). Aberto quando app.dialog é 'shortcuts' (a tecla "?" do Timer).
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { modal } from './modal';

  let { app, open }: { app: AppState; open: boolean } = $props();

  let dialogEl: HTMLDialogElement | undefined;

  // Fechou por qualquer caminho (Esc, Fechar ou fundo): libera o diálogo no estado, se ele ainda for este.
  function onclose(): void {
    if (app.dialog === 'shortcuts') app.dialog = null;
  }
</script>

<dialog bind:this={dialogEl} class="sheet" aria-label={T.shortcuts.title} use:modal={{ open, onclose }}>
  <h2>{T.shortcuts.title}</h2>
  <table>
    <tbody>
      {#each T.shortcuts.rows as [key, text] (key)}
        <tr>
          <td><span class="key">{key}</span></td>
          <td>{text}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="row">
    <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
  </div>
</dialog>
