<script lang="ts">
  // O campo do tempo no lugar do tempo grande (a maquete aprovada, estados 2a–2f e 3a), para quem cronometra num timer de fora. Embaixo, uma
  // linha só: a dica, como o tempo vai ficar ou o erro. O erro só vem ao salvar (Enter ou Salvar), e some assim que a pessoa digita de novo.
  // Quem grava é a tela do Timer (onSave): o mesmo caminho do solve cronometrado, para o resultado, os chips e o Centro serem os de sempre.
  import type { Penalty } from '../../core/types';
  import { parseTyped, previewTyped, tooLong } from '../../core/typed';
  import { T } from '../../strings';
  import { phoneLayout } from '../layout';

  interface Props {
    onSave: (time: { ms: number; penalty: Penalty }) => void;
    closeKeyboard?: boolean; // no celular, salvar solta o campo: o teclado fecha
  }

  let { onSave, closeKeyboard = false }: Props = $props();
  const uid = $props.id();
  const phone = phoneLayout();

  let text = $state('');
  let error = $state<'bad' | 'long' | null>(null);
  let inputEl = $state<HTMLInputElement>();

  // Como o tempo fica (core/typed.ts): o tempo com a penalidade e, no +2, o tempo cru por extenso.
  const preview = $derived(previewTyped(text));

  function save(): void {
    if (text.trim() === '') {
      inputEl?.focus(); // nada a salvar: o campo volta a ter o foco, sem erro
      return;
    }
    const p = parseTyped(text);
    if (!p.ok) {
      error = tooLong(text) ? 'long' : 'bad';
      return;
    }
    error = null;
    text = '';
    onSave({ ms: p.ms, penalty: p.penalty });
    // No celular, Salvar solta o campo (o teclado fecha); no desktop o foco volta a ele, pronto para o próximo (o clique o tinha levado ao botão).
    if (closeKeyboard) inputEl?.blur();
    else inputEl?.focus();
  }

  // Um caractere do tempo que chegou com o campo solto (o teclado do computador, I2 da revisão final): o foco vai para o campo e o caractere entra
  // no fim, como se a pessoa já estivesse nele. Quem chama é a tela do Timer (o atalho de números não pode trocar de aba nesse modo).
  export function put(c: string): void {
    text += c;
    error = null;
    inputEl?.focus();
  }

  // Enter salva (com composição de texto em andamento, o IME só confirma a letra: o Safari a termina com um Enter de keyCode 229); Esc solta
  // o campo e devolve os atalhos do Timer.
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.isComposing && e.keyCode !== 229) save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      inputEl?.blur();
    }
  }
</script>

<div class="tc-entry" data-typed>
  <label class="label" for="{uid}-in">{T.timer.typedLabel}</label>
  <div class="tc-field">
    <input
      id="{uid}-in"
      class="tc-input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="done"
      placeholder={T.timer.zero}
      aria-describedby="{uid}-m"
      aria-invalid={error ? 'true' : undefined}
      bind:value={text}
      bind:this={inputEl}
      oninput={() => (error = null)}
      onkeydown={onKey}
    />
    <button type="button" class="btn primary" onclick={save}>{T.timer.typedSave}</button>
  </div>
  <p class="tc-msg" class:err={error !== null} id="{uid}-m" aria-live="polite">
    {#if error}{error === 'long' ? T.timer.typedTooLong : T.timer.typedError}{:else if preview}{T.timer.typedFica} <b>{preview.time}</b>{preview.plus2 ? T.timer.typedFicaPlus2(preview.raw) : '.'}{:else}{phone.current ? T.timer.typedHint : T.timer.typedHintLong}{/if}
  </p>
</div>
