<script lang="ts">
  // A lista inteira do filtro da Evolução (spec §3; a maquete aprovada, 1a a 2b), do mais novo ao mais antigo, no lugar da tabela dos 30.
  // A linha tem altura fixa (--hx-h no CSS: 36 px, 44 no toque), então a lista desenha só as linhas da tela e uma margem: a altura
  // inteira fica reservada, cada linha vai para a posição dela, e rolar a página troca quais estão desenhadas (um quadro por vez). Os
  // solves continuam na memória; nada aqui lê o banco.
  //
  // Teclado (1c): a lista é uma parada só de Tab (a grade, com a linha da vez focável); as setas, Page Up/Down, Home e End andam, e Enter
  // abre o solve. Selecionar (2a, 2b): o botão do topo ou o toque longo numa linha; a linha inteira marca (Espaço, no teclado), Shift
  // marca o intervalo desde a última, e Esc sai. A barra do lote leva "Mover para…" (a folha de mover) e "Excluir" (segundo toque). Até
  // MAX_SELECTION de uma vez. Depois de um lote, a seleção some e o modo sai; um solve que sai da lista sai da seleção.
  import { tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { Solve } from '../../core/types';
  import { T } from '../../strings';
  import { confirmReady } from '../confirm';
  import { LONG_PRESS_MS, longpress } from '../longpress';
  import type { AppState } from '../state/app.svelte';
  import { MAX_SELECTION, rowAt, type Series } from './rows';

  let {
    app,
    pool,
    start = 0,
    series,
    now = Date.now(),
    onOpen,
  }: {
    app: AppState;
    pool: readonly Solve[]; // os solves do filtro (evento e sessão), na ordem de `at`: o número e as médias contam neles
    start?: number; // onde o período começa no pool: a lista mostra de `start` ao fim
    series: Series; // as médias e os recordes do pool, uma posição por solve
    now?: number;
    onOpen: (id: string) => void;
  } = $props();
  const uid = $props.id();

  const ROW_H = 36; // a altura da linha quando o CSS não diz (sem folha de estilo, nos testes)
  const FALLBACK_ROWS = 20; // as linhas da tela quando a janela não tem altura
  const OVERSCAN = 10; // a margem desenhada acima e abaixo da tela

  // k é a posição na lista (0, o mais novo, em cima); o solve dela está no fim do pool.
  const count = $derived(Math.max(0, pool.length - start));
  const indexOf = (k: number): number => pool.length - 1 - k;
  const idAt = (k: number): string => pool[indexOf(k)]!.id;

  let rowsEl = $state<HTMLElement>();
  let modeEl = $state<HTMLButtonElement>();
  let viewTop = $state(0); // a primeira linha na tela
  let viewRows = $state(FALLBACK_ROWS); // quantas cabem nela
  let active = $state(0); // a linha com a parada de Tab
  const focusK = $derived(Math.min(active, Math.max(0, count - 1)));

  // A tela é a janela: a lista rola com a página, e o cabeçalho das colunas gruda no topo. Com o foco fora da lista, a parada de Tab vai
  // junto com a tela (entrar na lista pelo Tab cai numa linha que está à vista).
  function measure(): void {
    const el = rowsEl;
    if (!el) return;
    const css = Number.parseFloat(getComputedStyle(el).getPropertyValue('--hx-h'));
    const h = css > 0 ? css : ROW_H;
    const height = window.innerHeight || 0;
    viewTop = Math.max(0, Math.floor(-el.getBoundingClientRect().top / h));
    viewRows = height > 0 ? Math.ceil(height / h) + 1 : FALLBACK_ROWS;
    if (!el.contains(document.activeElement)) active = Math.min(viewTop, Math.max(0, count - 1));
  }

  // As linhas desenhadas: as da tela e a margem, mais a da parada de Tab (que não pode sumir com o foco nela).
  const drawn = $derived.by(() => {
    const from = Math.min(Math.max(0, viewTop - OVERSCAN), count);
    const to = Math.min(count, viewTop + viewRows + OVERSCAN);
    const ks: number[] = [];
    if (count > 0 && focusK < from) ks.push(focusK);
    for (let k = from; k < to; k++) ks.push(k);
    if (count > 0 && focusK >= to) ks.push(focusK);
    return ks.map((k) => ({ k, row: rowAt(pool, indexOf(k), series, now) }));
  });

  // Rolar e redimensionar medem de novo uma vez por quadro (sem rolagem animada: "reduzir movimento" não tem o que tirar).
  $effect(() => {
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16) as unknown as number;
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id: number) => clearTimeout(id);
    let frame = 0;
    const schedule = (): void => {
      if (frame) return;
      frame = raf(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancel(frame);
    };
  });

  // Ao montar e quando a lista muda de tamanho.
  $effect(() => {
    void count;
    void rowsEl;
    untrack(measure);
  });

  const rowEl = (k: number): HTMLElement | null => rowsEl?.querySelector<HTMLElement>(`[data-k="${k}"]`) ?? null;

  // Leva a parada de Tab e o foco para a linha k, desenhando-a antes se ela estava fora da tela.
  async function focusRow(k: number): Promise<void> {
    active = k;
    await tick();
    const el = rowEl(k);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest' });
  }

  function onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement;
    if (!el.classList.contains('hx-row')) return; // a caixa, se tem o foco, cuida do próprio Espaço
    const k = Number(el.dataset.k);
    const page = Math.max(1, viewRows - 2);
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowDown':
        next = k + 1;
        break;
      case 'ArrowUp':
        next = k - 1;
        break;
      case 'PageDown':
        next = k + page;
        break;
      case 'PageUp':
        next = k - page;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      case 'Enter':
        onOpen(el.dataset.id!);
        break;
      case ' ':
        if (selecting) toggle(k, e.shiftKey);
        else onOpen(el.dataset.id!);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next !== null) void focusRow(Math.min(Math.max(next, 0), count - 1));
  }

  function onFocusIn(e: FocusEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.hx-row');
    if (el) active = Number(el.dataset.k);
  }

  // --- A seleção ---
  let selecting = $state(false);
  const selected = new SvelteSet<string>();
  let anchor: number | null = null; // a última linha tocada: Shift marca daqui até a próxima
  let armed = $state(false); // "Excluir" espera o segundo toque
  let armedAt: number | null = null; // a hora do primeiro: o segundo antes de CONFIRM_DELAY_MS é o toque duplo e não vale
  let busy = $state(false);
  const full = $derived(selected.size >= MAX_SELECTION);
  const barText = $derived(full ? `${T.historico.selected(selected.size)} · ${T.historico.atMax}` : T.historico.selected(selected.size));

  function disarm(): void {
    armed = false;
    armedAt = null;
  }

  function leave(): void {
    selecting = false;
    selected.clear();
    anchor = null;
    disarm();
  }

  // Marca um; no máximo, não marca e avisa.
  function add(id: string): boolean {
    if (selected.has(id)) return true;
    if (selected.size >= MAX_SELECTION) return false;
    selected.add(id);
    return true;
  }

  function toggle(k: number, extend: boolean): void {
    disarm();
    active = k;
    let ok = true;
    if (extend && anchor !== null && anchor !== k && anchor < count) {
      const step = k > anchor ? 1 : -1;
      for (let j = anchor; ok; j += step) {
        ok = add(idAt(j));
        if (j === k) break;
      }
    } else {
      const id = idAt(k);
      if (selected.has(id)) selected.delete(id);
      else ok = add(id);
    }
    anchor = k;
    if (!ok) app.showToast(T.historico.selectionCap);
  }

  function onRowClick(e: MouseEvent, k: number, id: string): void {
    active = k;
    if (selecting) toggle(k, e.shiftKey);
    else onOpen(id);
  }

  // A caixa marca como a linha; o clique dela não chega à linha (marcaria duas vezes). Acima do máximo, ela volta a ficar vazia.
  function onCheck(e: MouseEvent, k: number): void {
    e.stopPropagation();
    const box = e.currentTarget as HTMLInputElement;
    toggle(k, e.shiftKey);
    box.checked = selected.has(idAt(k));
    rowEl(k)?.focus({ preventScroll: true }); // o teclado continua na linha
  }

  // O toque longo entra na seleção com a linha marcada (ou, já selecionando, marca ou desmarca a linha).
  function onLong(k: number): void {
    selecting = true;
    toggle(k, false);
  }

  // Depois de um lote: sai da seleção, e o foco (que estava na barra, que some) vai para "Selecionar".
  function finish(): void {
    leave();
    void tick().then(() => modeEl?.focus());
  }

  function moveSelected(): void {
    const ids = [...selected];
    const one = ids.length === 1 ? pool.findIndex((s) => s.id === ids[0]) : -1;
    app.openMove(ids, { number: one >= 0 ? one + 1 : undefined, done: finish });
  }

  async function removeSelected(): Promise<void> {
    if (busy) return;
    if (!armed) {
      armed = true;
      armedAt = Date.now();
      return;
    }
    if (!confirmReady(armedAt, Date.now())) return;
    busy = true;
    let ok = false;
    try {
      ok = await app.deleteSolves([...selected]);
    } finally {
      busy = false;
    }
    if (ok) finish();
  }

  // Um solve que saiu da lista (o período andou, outra aba o excluiu ou o moveu) sai da seleção: o lote nunca age sobre o que não se vê.
  $effect(() => {
    const list = pool;
    const from = start;
    untrack(() => {
      if (selected.size === 0) return;
      const live = new Set<string>();
      for (let i = from; i < list.length; i++) live.add(list[i]!.id);
      for (const id of [...selected]) if (!live.has(id)) selected.delete(id);
    });
  });

  function onWindowKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && selecting && app.dialog === null && !e.defaultPrevented) leave();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<section class="card hx-list" data-select={selecting ? '' : undefined} aria-labelledby="{uid}-h">
  <div class="hx-list-h">
    <h2 class="label" id="{uid}-h">{T.historico.listTitle(count)}</h2>
    {#if count > 0}
      <button
        bind:this={modeEl}
        type="button"
        class="btn"
        aria-pressed={selecting ? 'true' : undefined}
        onclick={() => (selecting ? leave() : (selecting = true))}>{selecting ? T.historico.cancel : T.historico.select}</button
      >
    {/if}
  </div>
  {#if count === 0}
    <p class="hx-empty muted">{T.evolucao.empty}</p>
  {:else}
    <div role="grid" aria-labelledby="{uid}-h" aria-rowcount={count + 1} aria-multiselectable={selecting ? 'true' : undefined} onfocusin={onFocusIn}>
      <div role="row" aria-rowindex={1} class="hx-cols">
        {#if selecting}<span role="columnheader" class="hx-c"><span class="sr-only">{T.historico.columns.pick}</span></span>{/if}
        <span role="columnheader" class="hx-n">{T.evolucao.columns.number}</span>
        <span role="columnheader">{T.evolucao.columns.time}</span>
        <span role="columnheader">{T.tiles.avg(5)}</span>
        <span role="columnheader">{T.tiles.avg(12)}</span>
        <span role="columnheader" class="hx-scr">{T.evolucao.columns.scramble}</span>
        <span role="columnheader" class="hx-note">{T.historico.columns.note}</span>
        <span role="columnheader">{T.evolucao.columns.when}</span>
      </div>
      <div bind:this={rowsEl} role="rowgroup" class="hx-rows" style="--n: {count}">
        {#each drawn as { k, row } (row.id)}
          {@const sel = selecting && selected.has(row.id)}
          <div
            role="row"
            class="hx-row"
            style="--k: {k}"
            data-k={k}
            data-id={row.id}
            aria-rowindex={k + 2}
            aria-label={row.label}
            aria-selected={selecting ? (sel ? 'true' : 'false') : undefined}
            tabindex={k === focusK ? 0 : -1}
            onclick={(e) => onRowClick(e, k, row.id)}
            onkeydown={onKey}
            use:longpress={{ ms: LONG_PRESS_MS, onLong: () => onLong(k) }}
          >
            {#if selecting}
              <span role="gridcell" class="hx-c"
                ><input
                  type="checkbox"
                  class="hx-check"
                  tabindex="-1"
                  checked={sel}
                  aria-label={T.historico.pick(row.number.toLocaleString('pt-BR'))}
                  aria-disabled={full && !sel ? 'true' : undefined}
                  onclick={(e) => onCheck(e, k)}
                /></span
              >
            {/if}
            <span role="gridcell" class="hx-n">{row.number.toLocaleString('pt-BR')}</span>
            <span role="gridcell" class="hx-t"
              >{row.time}{#if row.plus2}<span class="tag hx-p2">{T.timer.plus2}</span>{/if}{#if row.pb}<i class="hx-pb"></i>{/if}{#if row.note}<i
                  class="hx-dot"
                ></i>{/if}</span
            >
            <span role="gridcell">{row.ao5}</span>
            <span role="gridcell">{row.ao12}</span>
            <span role="gridcell" class="hx-scr">{row.scramble}</span>
            <span role="gridcell" class="hx-note">{row.note}</span>
            <span role="gridcell" class="hx-when">{row.when}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  {#if selecting && selected.size > 0}
    <div class="hx-bulk" role="region" aria-label={T.historico.selection} data-max={full ? '' : undefined}>
      <b data-bulk-count>{barText}</b>
      <button type="button" class="btn" onclick={moveSelected}>{T.historico.moveTo}</button>
      <button type="button" class="btn danger" disabled={busy} onclick={removeSelected}>{armed ? T.historico.confirmAgain : T.historico.remove}</button>
    </div>
  {/if}
</section>
