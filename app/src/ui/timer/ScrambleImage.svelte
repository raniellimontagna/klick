<script lang="ts">
  import { loadCubing } from '../../scramble/cubing-loader';
  import { eventInfo } from '../../core/events';
  import type { EventId } from '../../core/types';

  interface Props {
    event: EventId;
    scramble: string;
    visible: boolean;
  }

  let { event, scramble, visible }: Props = $props();

  // Não é estado: o div só serve de lugar para o twisty. Torná-lo reativo faria o efeito rodar de novo à toa.
  let host: HTMLDivElement | undefined;

  $effect(() => {
    // Lê as props aqui, de forma síncrona: o que vem depois do await não entra nas dependências do efeito.
    const ev = event;
    const alg = scramble;
    const aberta = visible;
    const div = host;
    if (!div) return;

    // Cena trocada ou imagem fechada: o desenho anterior sai já, para não ficar um embaralhamento errado enquanto o novo carrega.
    div.replaceChildren();
    if (!aberta) return;

    // Se o efeito rodar de novo antes deste carregamento terminar, a limpeza marca esta execução como superada.
    let atual = true;
    loadCubing()
      .then((cubing) => {
        if (!atual) return;
        div.replaceChildren(
          new cubing.TwistyPlayer({
            puzzle: eventInfo(ev).puzzle,
            alg: '',
            experimentalSetupAlg: alg,
            visualization: '2D',
            background: 'none',
            controlPanel: 'none',
          }),
        );
      })
      // Se o carregamento falhar, o div fica vazio: o embaralhamento em texto continua na tela.
      .catch(() => {});

    return () => {
      atual = false;
    };
  });
</script>

<div class="scr-img" class:wide={event === 'minx' || event === 'sq1'} aria-hidden="true" bind:this={host}></div>

<style>
  .scr-img {
    width: 132px;
    height: 100px;
    flex-shrink: 0;
  }

  .scr-img.wide {
    width: 160px;
  }

  .scr-img :global(twisty-player) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
