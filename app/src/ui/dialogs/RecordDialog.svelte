<script lang="ts">
  // A folha de um recorde (a maquete aprovada do histórico, 5; spec §6): quais solves formam o recorde que o quadro (ou o selo do detalhe)
  // mostrou. Na ao5 e na ao12, os tempos na ordem em que foram feitos, com o melhor e o pior entre parênteses (a regra de sempre, de
  // windowOf); nas maiores, o intervalo de datas (são centenas de tempos); no single, o próprio solve e a data. "Ver na lista" fecha a folha e
  // leva a lista da Evolução até a janela (app.showInList).
  //
  // Abre por app.openRecord(kind, sessionId, event): o recorde é lido ao vivo de app.solves, com o mesmo filtro da lista (evento e sessão, como
  // o SolveDialog). Se o recorde some com a folha aberta (os solves foram excluídos noutra aba), ela fecha sem aviso.
  import { untrack } from 'svelte';
  import { formatMs, formatSolve, windowOf } from '../../core/stats';
  import { T } from '../../strings';
  import { poolStats } from '../evolucao/pool-stats';
  import { dateLabel, fullDate, shortDate, timeOfDay } from '../format';
  import type { AppState, ListJump } from '../state/app.svelte';
  import { modal } from './modal';

  let { app }: { app: AppState } = $props();
  const uid = $props.id();

  let dialogEl = $state<HTMLDialogElement>();
  let jump: ListJump | null = null; // o "Ver na lista" que espera a folha fechar

  const request = $derived(app.recordRequest);

  // Tudo o que a folha mostra, só com ela aberta. O recorde de um filtro sem solves (ou sem janela válida) é nulo. Os recordes são a conta
  // do quadro (pool-stats.ts): aberta dele, a folha não refaz nada.
  const data = $derived.by(() => {
    if (app.dialog !== 'record' || !request) return null;
    const { kind, event, sessionId } = request;
    const { pool, series, records: rec } = poolStats(app.solves, event, sessionId);
    const entry = kind === 'single' ? rec.single : rec.averages[kind];
    if (entry.best === null || entry.bestEnd === null) return null;
    const size = kind === 'single' ? 1 : kind;
    const end = entry.bestEnd;
    const first = Math.max(0, end - size + 1);
    const span = pool.slice(first, end + 1); // os solves da janela, do mais antigo ao mais novo
    const title = T.historico.recordTitle(kind, formatMs(entry.best));
    // Os tempos só na ao5 e na ao12; o losango marca os que foram recorde na época (o da lista).
    let times: { number: number; text: string; out: boolean; pb: boolean }[] | null = null;
    if (kind !== 'single' && kind <= 12) {
      const { trimmed } = windowOf(pool, kind, end);
      times = span.map((s, j) => ({ number: first + j + 1, text: formatSolve(s), out: trimmed[j]!, pb: series.pb[first + j]! }));
    }
    return { title, size, span, first, end, id: pool[end]!.id, event, sessionId, times, rule: kind === 'single' ? '' : T.historico.recordRule(kind), sub: sub(kind, first, end, span) };
  });
  const open = $derived(data !== null);

  // Um dia de outro ano leva o ano ("seg, 19 out 2025, 21:30"); no ano corrente, não (como o detalhe do solve).
  function stamp(ts: number): string {
    const year = new Date(ts).getFullYear();
    return `${dateLabel(ts)}${year === new Date().getFullYear() ? '' : ` ${year}`}, ${timeOfDay(ts)}`;
  }

  // A linha de baixo do título: o solve (ou os solves) e quando. A ao5 e a ao12 têm a hora ("seg, 19 out, 20:58 a 21:42", e o dia por extenso
  // dos dois lados se atravessam a meia-noite); as maiores, só as datas ("02/08 a 15/10", com o ano se não são deste).
  function sub(kind: 'single' | number, first: number, end: number, span: { at: number }[]): string {
    const a = span[0]!.at;
    const b = span[span.length - 1]!.at;
    if (kind === 'single') return `${T.historico.recordSolve(end + 1)} · ${stamp(a)}`;
    const solves = T.historico.recordSolves(first + 1, end + 1);
    if (kind > 12) {
      const year = new Date().getFullYear();
      const sameYear = new Date(a).getFullYear() === year && new Date(b).getFullYear() === year;
      const day = sameYear ? shortDate : fullDate;
      return `${solves} · ${T.historico.recordRange(day(a), day(b))}`;
    }
    const sameDay = dateLabel(a) === dateLabel(b) && new Date(a).getFullYear() === new Date(b).getFullYear();
    return `${solves} · ${sameDay ? `${stamp(a)} a ${timeOfDay(b)}` : T.historico.recordRange(stamp(a), stamp(b))}`;
  }

  // O recorde sumiu com a folha aberta: libera o estado, e o modal fecha a folha.
  $effect(() => {
    if (app.dialog === 'record' && request && data === null) untrack(() => (app.dialog = null));
  });

  // Fechou por qualquer caminho (Esc, Fechar, fundo, ou o "Ver na lista"): libera a folha, se ainda for esta. O pedido de "Ver na lista" só
  // sai depois do fechamento: o modal devolve o foco a quem abriu a folha logo depois, e a lista leva o foco à linha depois disso.
  function onclose(): void {
    if (app.dialog === 'record') app.dialog = null;
    const pending = jump;
    jump = null;
    if (pending) app.showInList(pending);
  }

  function viewInList(): void {
    if (!data) return;
    jump = { id: data.id, span: data.size, event: data.event, sessionId: data.sessionId };
    dialogEl?.close();
  }
</script>

<dialog bind:this={dialogEl} class="sheet hx-sheet" aria-labelledby="{uid}-t" use:modal={{ open, onclose }}>
  {#if data}
    <h2 id="{uid}-t">{data.title}</h2>
    <p class="muted">{data.sub}</p>
    {#if data.times}
      <ol class="dz-times hx-twelve">
        {#each data.times as t (t.number)}
          <li class:hx-out={t.out}>
            <span class="n">{t.number - data.first}</span>{t.out ? `(${t.text})` : t.text}{#if t.pb}<i class="hx-pb" role="img" aria-label={T.historico.recordMark}></i>{/if}
          </li>
        {/each}
      </ol>
    {/if}
    {#if data.rule !== ''}<p class="dz-note hx-rule">{data.rule}</p>{/if}
    <div class="row">
      <button type="button" class="btn primary" onclick={viewInList}>{T.historico.viewInList}</button>
      <button type="button" class="btn" onclick={() => dialogEl?.close()}>{T.dialog.close}</button>
    </div>
  {/if}
</dialog>
