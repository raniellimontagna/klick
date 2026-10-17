<script lang="ts">
  // O cubo vivo: a grade 3×3 do logo (peças na tinta, centro vermelho) em um estado. Decorativo (aria-hidden): o texto ao lado diz o que
  // acontece. Só "turn" repete; "wave" e "solved" tocam uma vez. Menos movimento: o CSS global (base.css) já desliga toda animação e
  // transição, então aqui só ficam as cores de cada estado.
  import type { CubeState } from './live-cube';

  let { state, filled = 0, size = 'lg' }: { state: CubeState; filled?: number; size?: 'lg' | 'sm' } = $props();

  const pieces = Array.from({ length: 9 }, (_, i) => i);
</script>

<span class="live-cube" data-cube={state} data-size={size} aria-hidden="true">
  {#each pieces as i (i)}
    <i data-piece data-center={i === 4 ? '' : undefined} data-on={state === 'fill' && i < filled ? 'true' : undefined} style:--d="{(Math.floor(i / 3) + (i % 3)) * 0.06}s"></i>
  {/each}
</span>

<style>
  .live-cube {
    --p: 14px;
    --gap: 3px;
    --radius: 4px;
    --lift: -6px;
    --ring: 2px;
    display: inline-grid;
    grid-template-columns: repeat(3, var(--p));
    gap: var(--gap);
    flex: none;
    vertical-align: middle;
  }

  .live-cube[data-size='sm'] {
    --p: 5px;
    --gap: 1.5px;
    --radius: 1.5px;
    --lift: -2px;
    --ring: 1px;
  }

  i {
    display: block;
    width: var(--p);
    height: var(--p);
    border-radius: var(--radius);
    background: var(--ink);
    transition: background 0.2s var(--ease);
  }

  i[data-center] {
    background: var(--arm);
  }

  /* onda: as peças sobem e descem em diagonal, da primeira à última, uma vez (~600 ms) */
  [data-cube='wave'] i {
    animation: wave 0.36s var(--ease) var(--d) 1 both;
  }

  @keyframes wave {
    0%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(var(--lift));
    }
  }

  /* girando: uma camada vira 90°, pausa, vira de novo; é o único que repete */
  [data-cube='turn'] {
    animation: turn 1.6s cubic-bezier(0.6, 0, 0.2, 1) infinite;
  }

  @keyframes turn {
    0%,
    20% {
      transform: rotate(0deg);
    }
    55%,
    100% {
      transform: rotate(90deg);
    }
  }

  /* enchendo: as peças apagadas ficam na tinta bem clara (translúcida: serve em qualquer fundo; no escuro, a cor da linha quase sumia no
     fundo do diálogo); as acesas, em verde (cor, não movimento) */
  [data-cube='fill'] i {
    background: color-mix(in srgb, var(--ink) 16%, transparent);
  }

  [data-cube='fill'] i[data-on='true'] {
    background: var(--go);
  }

  /* resolvido: um pulinho (escala ~1,1 e volta) e as peças voltam à cor do logo, uma vez */
  [data-cube='solved'] {
    animation: pop 0.6s var(--ease) 1;
  }

  [data-cube='solved'] i {
    animation: settle 0.6s var(--ease) 1;
  }

  [data-cube='solved'] i[data-center] {
    animation-name: settle-center;
  }

  @keyframes pop {
    0% {
      transform: scale(0.9);
    }
    30% {
      transform: scale(1.1);
    }
    60%,
    100% {
      transform: scale(1);
    }
  }

  @keyframes settle {
    0% {
      background: var(--go);
    }
    50%,
    100% {
      background: var(--ink);
    }
  }

  @keyframes settle-center {
    0% {
      background: var(--go);
    }
    50%,
    100% {
      background: var(--arm);
    }
  }

  /* erro: parado, o centro vermelho em destaque e o resto mais discreto */
  [data-cube='error'] i:not([data-center]) {
    opacity: 0.55;
  }

  [data-cube='error'] i[data-center] {
    box-shadow: 0 0 0 var(--ring) color-mix(in srgb, var(--arm) 35%, transparent);
  }
</style>
