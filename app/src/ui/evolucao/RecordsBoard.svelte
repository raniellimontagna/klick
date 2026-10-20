<script lang="ts">
  // O quadro de recordes da sessão (a maquete aprovada do histórico, 1a e 1c; spec §6): o melhor single e a melhor média de 5, 12, 50, 100 e
  // 1000, cada um com o valor atual ao lado. Os solves são o filtro da Evolução (evento e sessão) sem o período: o histórico inteiro, e o
  // cabeçalho diz isso. No celular, uma linha por recorde; no desktop, seis colunas num cartão só. Cada recorde é um botão que abre a folha
  // com os solves dele (onOpen). Uma média só aparece quando há solves para ela (e uma janela sem DNF); sem nenhum recorde, o quadro some.
  import { formatMs, RECORD_SIZES, type RecordEntry, records } from '../../core/stats';
  import type { Solve } from '../../core/types';
  import { T } from '../../strings';
  import type { RecordKind } from '../state/app.svelte';

  let {
    solves,
    all = false,
    onOpen,
  }: {
    solves: readonly Solve[]; // o filtro (evento e sessão) em ordem de `at`, sem o período
    all?: boolean; // o filtro é "Todas as sessões": o cabeçalho fala do evento
    onOpen: (kind: RecordKind) => void;
  } = $props();
  const uid = $props.id();

  interface Row {
    kind: RecordKind;
    label: string;
    best: string;
    now: string; // "atual 0:14.09" (no single, "último 0:13.92")
    name: string; // o nome lido do botão
  }

  const rows = $derived.by((): Row[] => {
    const rec = records(solves);
    const entries: { kind: RecordKind; label: string; entry: RecordEntry; now: (time: string) => string }[] = [
      { kind: 'single', label: T.historico.recordSingle, entry: rec.single, now: T.historico.recordLast },
      ...RECORD_SIZES.map((n) => ({ kind: n, label: T.tiles.avg(n), entry: rec.averages[n], now: T.historico.recordNow })),
    ];
    return entries
      .filter(({ entry }) => entry.best !== null)
      .map(({ kind, label, entry, now }) => {
        const best = formatMs(entry.best);
        const current = now(formatMs(entry.current));
        return { kind, label, best, now: current, name: T.historico.recordRow(label, best, current) };
      });
  });
</script>

{#if rows.length > 0}
  <section class="card hx-recs" aria-labelledby="{uid}-h">
    <div class="card-h">
      <h2 class="label" id="{uid}-h">{all ? T.historico.recordsTitleAll : T.historico.recordsTitle}</h2>
      <span class="muted">{all ? T.historico.recordsScopeAll : T.historico.recordsScope}</span>
    </div>
    <ul class="hx-rec-list">
      {#each rows as r (r.kind)}
        <li>
          <button type="button" class="hx-rec" aria-label={r.name} data-record={r.kind} onclick={() => onOpen(r.kind)}>
            <span class="hx-rec-k">{r.label}</span>
            <b>{r.best}</b>
            <em>{r.now}</em>
            <span class="dz-chev" aria-hidden="true">›</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}
