<script lang="ts">
  import { T } from '../../strings';

  interface Props {
    visible: boolean; // as ações só aparecem depois do solve gravado
    plus2: boolean;
    dnf: boolean;
    note: string; // nota gravada ('' se não há)
    noteOpen: boolean;
    noteValue: string; // texto do campo (bindable)
    inputEl?: HTMLInputElement; // o campo da nota, para a tela pôr o foco (bindable)
    onPlus2: () => void;
    onDnf: () => void;
    onNote: () => void;
    onDelete: () => void;
    onNoteSave: (text: string) => void;
    onNoteClose: () => void;
    typedDnf?: boolean; // o último é um DNF digitado (sem tempo): +2 e DNF desligados, com o motivo
    penaltiesOnly?: boolean; // o desafio: só +2 e DNF (sem Nota e sem Excluir, não dá para refazer um embaralhamento)
  }

  let {
    visible,
    plus2,
    dnf,
    note,
    noteOpen,
    noteValue = $bindable(),
    inputEl = $bindable(),
    onPlus2,
    onDnf,
    onNote,
    onDelete,
    onNoteSave,
    onNoteClose,
    typedDnf = false,
    penaltiesOnly = false,
  }: Props = $props();
  const whyId = $props.id();

  // Esc fecha a nota (protótipo app.js). Quem fecha decide o foco.
  function onNoteKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    onNoteClose();
  }

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    onNoteSave(noteValue.trim());
  }
</script>

<div class="t-actions fade" data-actions hidden={!visible}>
  <!-- O DNF digitado não tem tempo: nem +2 nem voltar a OK. aria-disabled (e não disabled) deixa o botão no Tab, e o motivo se lê com ele. -->
  <button
    type="button"
    class="btn"
    data-act="plus2"
    aria-pressed={plus2 ? 'true' : 'false'}
    aria-disabled={typedDnf ? 'true' : undefined}
    aria-describedby={typedDnf ? whyId : undefined}
    onclick={() => {
      if (!typedDnf) onPlus2();
    }}>{T.actions.plus2} <kbd>P</kbd></button
  >
  <button
    type="button"
    class="btn"
    data-act="dnf"
    aria-pressed={dnf ? 'true' : 'false'}
    aria-disabled={typedDnf ? 'true' : undefined}
    aria-describedby={typedDnf ? whyId : undefined}
    onclick={() => {
      if (!typedDnf) onDnf();
    }}>{T.actions.dnf} <kbd>D</kbd></button
  >
  {#if !penaltiesOnly}
    <button type="button" class="btn" class:has-note={note !== ''} data-act="note" aria-label={note ? T.note.button(note) : undefined} onclick={onNote}>{T.actions.note} <kbd>M</kbd></button>
    <button type="button" class="btn" data-act="delete" onclick={onDelete}>{T.actions.delete} <kbd>⌫</kbd></button>
  {/if}
</div>
{#if typedDnf}
  <p class="tc-why" id={whyId} hidden={!visible}>{T.timer.typedDnfLocked}</p>
{/if}

<form class="t-note fade" data-noteform hidden={!noteOpen} onsubmit={submit}>
  <input
    type="text"
    name="note"
    maxlength="80"
    placeholder={T.note.label}
    aria-label={T.note.label}
    bind:value={noteValue}
    bind:this={inputEl}
    onkeydown={onNoteKey}
  />
  <button type="submit" class="btn">{T.note.save}</button>
</form>
