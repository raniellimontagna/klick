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

  // Não é estado: o div só serve de lugar para o desenho. Torná-lo reativo faria o efeito rodar de novo à toa.
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
    // Embaralhamento vazio não tem o que desenhar: sem ele, o padrão seria o cubo resolvido.
    if (!aberta || alg === '') return;

    // Se o efeito rodar de novo antes deste carregamento terminar, a limpeza marca esta execução como superada.
    let atual = true;
    loadCubing()
      .then(async (cubing) => {
        const puzzle = cubing.puzzles[eventInfo(ev).puzzle];
        if (!puzzle) return;
        const kpuzzle = await puzzle.kpuzzle();
        const svg = await puzzle.svg();
        if (!atual) return;
        // O padrão sai antes do animador: um embaralhamento inválido lança aqui e o div fica vazio, sem o wrapper pela metade.
        const padrao = kpuzzle.defaultPattern().applyAlg(alg);
        const animador = new cubing.ExperimentalSVGAnimator(kpuzzle, svg);
        animador.draw(padrao);
        div.replaceChildren(animador.wrapperElement);
      })
      // Se algo falhar, o div fica vazio: o embaralhamento em texto continua na tela.
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
    overflow: hidden;
  }

  .scr-img.wide {
    width: 160px;
  }

  /* O animador entrega um wrapper com um svg de viewBox: os dois ocupam o div, e o svg cabe pela proporção. */
  .scr-img :global(.svg-wrapper),
  .scr-img :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
