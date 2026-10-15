// O desktop de duas colunas: a partir de 1024 px, a mesma quebra em que a tela do Timer ganha a coluna da direita (screens.css; abaixo
// dela, uma coluna só). As telas que só mudam de estilo usam a quebra na CSS. O começo da Trilha e a rodada mudam de estrutura: a ordem
// do DOM segue as colunas (a da esquerda antes da da direita, para o teclado e o leitor de tela), e a estrutura sai daqui.
import { MediaQuery } from 'svelte/reactivity';

export const WIDE = '(min-width: 1024px)';

// Criada na montagem do componente; `current` acompanha a largura da janela.
export const wideLayout = (): MediaQuery => new MediaQuery(WIDE);
