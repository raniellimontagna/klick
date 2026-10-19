<script lang="ts">
  import { T } from '../../strings';

  interface Props {
    el?: HTMLElement; // a área de toque: a entrada liga os ouvintes nela (bindable)
    one: boolean; // modo de um toque: a zona da esquerda cobre a tela inteira
    hidden?: boolean; // o desafio: B confere a penalidade e vê o ponto, sem armar (a área fica, a entrada segue ligada nela)
  }

  let { el = $bindable(), one, hidden = false }: Props = $props();
</script>

<div class="zones" data-zones aria-hidden="true" {hidden} bind:this={el}>
  <div class="zone" data-zone="left">{one ? T.zones.one : T.zones.two}</div>
  <div class="zone" data-zone="right">{T.zones.two}</div>
</div>
