<script lang="ts">
  // A barra das fases (a maquete aprovada, peça tc-split; estados 5a–5b, 6 e 7a): as fases de um solve, ou as médias no quadro da Evolução.
  // Uma barra dividida na proporção de cada fase (colunas em fr, com o mínimo do texto), a que mais pesa na tinta e as outras na peça apagada.
  // Embaixo de cada parte: o número (ou o nome do CFOP), a duração e a parte do tempo. O leitor ouve "Fase 2, 6.12 s, 46% do tempo, a que mais
  // pesa". Quem chama confere as fases (validPhases): aqui elas chegam válidas.
  import { phaseShares } from '../../core/phases';
  import { T } from '../../strings';

  interface Props {
    phases: readonly number[]; // a duração (ou a média) de cada fase, em ms
    labels: readonly string[]; // o nome de cada fase (phaseLabels): "Fase 1"… ou os do CFOP
    heaviest?: number; // a que mais pesa; sem ela, a de maior duração
    label?: string; // o nome da lista para o leitor
  }

  let { phases, labels, heaviest, label = T.fases.bar }: Props = $props();

  const top = $derived(heaviest ?? phases.indexOf(Math.max(...phases)));
  const shares = $derived(phaseShares(phases));
  const cols = $derived(phases.map((ms) => `minmax(max-content, ${Math.max(0, ms)}fr)`).join(' '));
</script>

<ol class="tc-split" style:grid-template-columns={cols} aria-label={label}>
  {#each phases as ms, i (i)}
    {@const name = labels[i] ?? T.fases.n(i + 1)}
    <!-- O nome genérico ("Fase 2") mostra só o número; a palavra fica para o leitor. As vírgulas também são só dele (os espaços vão como
         expressão: o Svelte apara o texto solto no fim de um elemento). -->
    <li data-top={i === top ? '' : undefined}>
      <b><span class="n">{#if name === T.fases.n(i + 1)}<span class="sr-only">{`${T.fases.word} `}</span>{i + 1}{:else}{name}{/if}</span><span class="sr-only">{', '}</span>{T.fases.dur(ms)}<span class="sr-only">{', '}</span></b>
      <small>{T.fases.share(shares[i] ?? 0)}<span class="sr-only">{i === top ? T.fases.ofTimeTop : T.fases.ofTime}</span></small>
    </li>
  {/each}
</ol>
