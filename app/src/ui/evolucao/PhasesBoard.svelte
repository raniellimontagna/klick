<script lang="ts">
  // O quadro "Fases" da Evolução (a maquete aprovada, 7a–7b e 8d; spec §4): a média de cada fase dos últimos 12 solves com fases, a parte de cada
  // uma no tempo e a que mais pesa, na mesma barra do resultado e do detalhe (PhaseBar). Fica logo abaixo do quadro de recordes e segue o filtro
  // de evento e sessão, sem o período, como ele. As médias chegam prontas (pool-stats.ts) e só valem os solves do mesmo número de fases do mais
  // recente; sem nenhum solve com fases, o quadro some.
  import { phaseLabels, phaseShares, type PhaseAverages } from '../../core/phases';
  import type { EventId } from '../../core/types';
  import { T } from '../../strings';
  import PhaseBar from '../timer/PhaseBar.svelte';

  let { phases, event }: { phases: PhaseAverages | null; event: EventId } = $props();
  const uid = $props.id();

  const labels = $derived(phases ? phaseLabels(phases.n, event) : []);
  // A nota da que mais pesa: o nome da fase é o número ("fase 2") ou o do CFOP ("fase F2L").
  const top = $derived.by(() => {
    if (!phases) return '';
    const i = phases.heaviest;
    const label = labels[i] ?? T.fases.n(i + 1);
    const name = label === T.fases.n(i + 1) ? String(i + 1) : label;
    return T.fases.boardTop(name, phaseShares(phases.means)[i] ?? 0, phases.means[i] ?? 0);
  });
</script>

{#if phases}
  <section class="card tc-fases" aria-labelledby="{uid}-h">
    <div class="card-h">
      <h2 class="label" id="{uid}-h">{T.fases.boardTitle}</h2>
      <span class="muted">{T.fases.boardScope(phases.used, phases.n)}</span>
    </div>
    <PhaseBar phases={phases.means} {labels} heaviest={phases.heaviest} label={T.fases.boardBar} />
    <p class="dz-note tc-top">{top}</p>
  </section>
{/if}
