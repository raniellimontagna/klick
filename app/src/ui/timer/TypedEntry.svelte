<script module lang="ts">
  // Um tempo que parece certo mas passa de uma hora ("1:02:03.45", "60:00.00", "1020345"): o erro diz o limite, em vez do genérico. Só é
  // chamada com o que o parseTyped recusou.
  export function tooLong(text: string): boolean {
    const t = text.trim().replace(/\+$/, '').trim();
    if (/^\d+:\d+:\d+(?:[.,]\d+)?$/.test(t)) return true; // horas:minutos:segundos
    const clock = /^(\d{1,2}):(\d{1,2})(?:[.,]\d{1,2})?$/.exec(t);
    if (clock) return Number(clock[1]) >= 60 && Number(clock[2]) < 60;
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      return Math.floor(n / 10000) >= 60 && Math.floor(n / 100) % 100 < 60; // os dois últimos dígitos são os centésimos, os dois antes os segundos
    }
    const plain = /^(\d+)[.,]\d{1,2}$/.exec(t);
    return plain !== null && Number(plain[1]) >= 3600;
  }
</script>

<script lang="ts">
  // O campo do tempo no lugar do tempo grande (a maquete aprovada, estados 2a–2f e 3a), para quem cronometra num timer de fora. Embaixo, uma
  // linha só: a dica, como o tempo vai ficar ou o erro. O erro só vem ao salvar (Enter ou Salvar), e some assim que a pessoa digita de novo.
  // Quem grava é a tela do Timer (onSave): o mesmo caminho do solve cronometrado, para o resultado, os chips e o Centro serem os de sempre.
  import { formatMs } from '../../core/stats';
  import type { Penalty } from '../../core/types';
  import { parseTyped } from '../../core/typed';
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

  // Como o tempo fica: o tempo com a penalidade ("0:14.34+" para 12.34+, que soma os 2 s) e, no +2, o tempo cru por extenso.
  const preview = $derived.by(() => {
    const p = parseTyped(text);
    if (!p.ok) return null;
    if (p.penalty === 'DNF') return { time: T.timer.dnf, note: '.' };
    if (p.penalty === '+2') return { time: formatMs(p.ms + 2000) + T.timer.plus2Suffix, note: T.timer.typedFicaPlus2(formatMs(p.ms)) };
    return { time: formatMs(p.ms), note: '.' };
  });

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
    {#if error}{error === 'long' ? T.timer.typedTooLong : T.timer.typedError}{:else if preview}{T.timer.typedFica} <b>{preview.time}</b>{preview.note}{:else}{phone.current ? T.timer.typedHint : T.timer.typedHintLong}{/if}
  </p>
</div>
