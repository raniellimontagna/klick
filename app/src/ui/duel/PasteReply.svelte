<script lang="ts">
  // "Colar a resposta" (a revisão final), no desafio de A com os sete, ainda sem resposta (esperando, ou jogando porque a marca de mandado não
  // gravou): na tela de mandar (4) e na partida aberta em Evolução (9c).
  // No iPhone, o Klick da tela de início guarda à parte do Safari, e a resposta tocada no WhatsApp abre no Safari, sem o desafio (só para
  // ver). O toque lê a área de transferência na hora (dentro do gesto, sem esperar nada antes) e abre o link no Timer como se ele tivesse
  // sido tocado: valem as regras de sempre da resposta (app.duel.openLink). Sem a leitura (o navegador não a tem, ou a pessoa recusou), o
  // campo para colar à mão, com "Abrir". O que não é link de desafio avisa e não abre nada.
  import { onDestroy, tick } from 'svelte';
  import { duelPayloadIn } from '../../core/duel/link';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import { readLink } from './send';

  let { app, wide = false }: { app: AppState; wide?: boolean } = $props();
  const uid = $props.id();

  let typing = $state(false); // a leitura não deu: o campo para colar à mão
  let text = $state('');
  let fieldEl = $state<HTMLInputElement>();
  let destroyed = false;

  onDestroy(() => {
    destroyed = true;
  });

  function paste(): void {
    void readLink().then((read) => {
      if (destroyed) return;
      if (read !== null) {
        void open(read);
        return;
      }
      typing = true;
      void tick().then(() => fieldEl?.focus());
    });
  }

  async function open(value: string): Promise<void> {
    const payload = await duelPayloadIn(value);
    if (payload === null) {
      app.showToast(T.duel.pasteNotDuel);
      return;
    }
    app.tab = 'timer'; // a resposta é do Timer, como o link tocado
    void app.duel.openLink(payload);
  }

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    void open(text);
  }
</script>

<button type="button" class="btn" class:dz-wide={wide} onclick={paste}>{T.duel.paste}</button>
{#if typing}
  <form class="dz-paste" novalidate onsubmit={submit}>
    <label class="field dz-field">
      <span id="{uid}-label">{T.duel.pasteLabel}</span>
      <input type="text" inputmode="url" autocomplete="off" spellcheck="false" aria-labelledby="{uid}-label" bind:value={text} bind:this={fieldEl} />
    </label>
    <button type="submit" class="btn">{T.duel.pasteOpen}</button>
  </form>
{/if}
