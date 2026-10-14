// As 9 aulas (spec 5.3 e 6): passos curtos, cada um com o cubo animado. Os setups partem do resolvido no quadro das aulas (amarelo em
// cima, branco embaixo, verde na frente). `from` é o que o setup já cumpre e `ends` o que setup + alg cumpre; os testes conferem os dois
// com o cubing.js (tests/unit/trail-lessons.test.ts). O texto é revisado pelo Ranielli num cubo de verdade antes de ir para a raiz.
// Fica no código da aba Trilha: só carrega quando ela abre.
import type { Lesson } from './types';

export const LESSONS: readonly Lesson[] = Object.freeze([
  {
    step: 0,
    parts: [
      {
        title: 'Segure assim',
        text: 'Amarelo em cima, branco embaixo e verde de frente para você. Nas aulas o cubo fica sempre nessa posição, e é assim que você deve segurar o seu.',
        cube: { setup: '', view: '3D' },
      },
      {
        title: 'As faces têm letras',
        text: 'R é a direita, L a esquerda, U a de cima, D a de baixo, F a da frente e B a de trás. A letra sozinha é um quarto de volta no sentido do relógio, olhando de frente para aquela face.',
        cube: { setup: '', alg: 'R', view: '3D' },
      },
      {
        title: 'Apóstrofo e 2',
        text: 'Com apóstrofo (R\') a face gira para o outro lado. Com 2 (R2) ela gira meia volta. Repita no seu cubo: R U R\' U\'. Feito seis vezes seguidas, o cubo volta como estava.',
        cube: { setup: '', alg: 'R U R\' U\'', view: '3D' },
      },
      {
        title: 'A margarida',
        text: 'A primeira meta é juntar as quatro arestas brancas em volta do centro amarelo, com o branco para cima. Parece uma flor: o miolo é amarelo e as pétalas são brancas.',
        cube: { setup: 'F2 R2 B2 L2', view: '3D', mask: 'daisy', from: 'daisy' },
      },
      {
        title: 'Pétala por pétala',
        text: 'Leve cada aresta branca para cima sem derrubar as pétalas que já estão lá. Se o lugar de cima estiver ocupado, gire U antes de subir a nova aresta.',
        tip: 'Não precisa de algoritmo aqui: é só olhar e girar.',
        cube: { setup: 'F2 R2 B2 L2 F', alg: 'F\'', view: '3D', mask: 'daisy', ends: 'daisy' },
      },
      {
        title: 'Desça as pétalas',
        text: 'Gire U até uma pétala ficar em cima do centro que tem a outra cor dela. Então gire aquela face duas vezes: a aresta desce com o branco para baixo. Faça o mesmo com as outras três.',
        cube: { setup: 'F2 R2 B2 L2', alg: 'F2 R2 B2 L2', view: '3D', mask: 'cross', ends: 'cross' },
      },
      {
        title: 'Alinhe antes de descer',
        text: 'Se a pétala está em cima do centro errado, gire só a camada de cima até acertar. Aqui um U\' alinha todas de uma vez.',
        cube: { setup: 'F2 R2 B2 L2 U', alg: 'U\' F2 R2 B2 L2', view: '3D', mask: 'cross', ends: 'cross' },
      },
      {
        title: 'Sua vez',
        text: 'Embaralhe, monte a margarida e desça as quatro pétalas. Vire o cubo para conferir: a cruz branca embaixo, cada aresta combinando com o centro do lado.',
        cube: { setup: '', view: 'below', mask: 'cross' },
      },
    ],
  },
  {
    step: 1,
    parts: [
      {
        title: 'Ache um canto branco',
        text: 'Procure um canto com branco na camada de cima. As outras duas cores dele dizem o lugar: embaixo, entre os centros dessas duas cores.',
        cube: { setup: 'U\' U R U\' R\'', view: '3D', mask: 'firstLayer', from: 'cross' },
      },
      {
        title: 'Leve até em cima do lugar',
        text: 'Gire U até o canto ficar em cima do lugar dele, na frente e à direita. Os outros cantos podem esperar.',
        cube: { setup: 'R U\' R\' U\'', alg: 'U', view: '3D', mask: 'firstLayer', from: 'cross' },
      },
      {
        title: 'Repita R U R\' U\'',
        text: 'Com o canto na posição, faça R U R\' U\' até ele entrar com o branco para baixo. Às vezes basta uma vez; às vezes são três ou cinco.',
        cube: { setup: 'U R U\' R\' U R U\' R\' U R U\' R\'', alg: 'R U R\' U\' R U R\' U\' R U R\' U\'', view: '3D', mask: 'firstLayer', from: 'cross', ends: 'firstLayer' },
      },
      {
        title: 'Uma vez só',
        text: 'Quando o branco do canto olha para a direita, um R U R\' U\' já resolve.',
        cube: { setup: 'U R U\' R\'', alg: 'R U R\' U\'', view: '3D', mask: 'firstLayer', from: 'cross', ends: 'firstLayer' },
      },
      {
        title: 'Canto preso embaixo',
        text: 'Se o canto está embaixo, girado ou no lugar errado, um R U R\' U\' com ele na frente à direita traz o canto para cima. Depois é só repetir até ele entrar.',
        cube: { setup: 'R U R\' U\' R U R\' U\'', alg: 'R U R\' U\' R U R\' U\' R U R\' U\' R U R\' U\'', view: '3D', mask: 'firstLayer', from: 'cross', ends: 'firstLayer' },
      },
      {
        title: 'Sua vez',
        text: 'Faça os quatro cantos. A camada de baixo fica toda branca, e nas laterais aparece uma faixa de cada cor.',
        cube: { setup: '', view: 'below', mask: 'firstLayer' },
      },
    ],
  },
  {
    step: 2,
    parts: [
      {
        title: 'Ache uma aresta sem amarelo',
        text: 'Na camada de cima, procure uma aresta sem amarelo. Gire U até a cor da frente dela combinar com o centro da frente: forma um T de cabeça para baixo.',
        cube: { setup: 'F\' U\' F U R U R\' U\'', view: '3D', mask: 'f2l', from: 'firstLayer' },
      },
      {
        title: 'Para a direita',
        text: 'Se a outra cor da aresta combina com o centro da direita, faça U R U\' R\' U\' F\' U F.',
        cube: { setup: 'F\' U\' F U R U R\' U\'', alg: 'U R U\' R\' U\' F\' U F', view: '3D', mask: 'f2l', from: 'firstLayer', ends: 'f2l' },
      },
      {
        title: 'Para a esquerda',
        text: 'Se combina com o centro da esquerda, use o espelho: U\' L\' U L U F U\' F\'.',
        cube: { setup: 'F U F\' U\' L\' U\' L U', alg: 'U\' L\' U L U F U\' F\'', view: '3D', mask: 'f2l', from: 'firstLayer', ends: 'f2l' },
      },
      {
        title: 'Aresta presa ou invertida',
        text: 'Se uma aresta está no meio, mas no lugar errado ou virada, faça o algoritmo da direita naquele lugar para tirá-la. Ela sobe, e você a coloca como antes.',
        cube: { setup: 'F\' U\' F U R U R\' U F\' U\' F U R U R\' U\'', alg: 'U R U\' R\' U\' F\' U F U\' R U\' R\' U\' F\' U F', view: '3D', mask: 'f2l', from: 'firstLayer', ends: 'f2l' },
      },
      {
        title: 'Sua vez',
        text: 'Coloque as quatro arestas do meio. Com isso as duas primeiras camadas estão prontas.',
        cube: { setup: '', view: '3D', mask: 'f2l' },
      },
    ],
  },
  {
    step: 3,
    parts: [
      {
        title: 'Olhe só o amarelo de cima',
        text: 'Agora importa só o desenho amarelo em cima: ponto, L, linha ou cruz. Os cantos ficam para depois.',
        cube: { setup: 'F U R U\' R\' F\'', view: 'top', mask: 'eoll', from: 'f2l' },
      },
      {
        title: 'A linha',
        text: 'Com a linha deitada, da esquerda para a direita, faça F R U R\' U\' F\'.',
        cube: { setup: 'F U R U\' R\' F\'', alg: 'F R U R\' U\' F\'', view: 'top', mask: 'eoll', from: 'f2l', ends: 'yellowCross' },
      },
      {
        title: 'O L',
        text: 'Segure o L apontando para trás e para a esquerda, como os ponteiros às 9 horas e ao meio-dia. Faça o mesmo algoritmo duas vezes seguidas: a primeira vira linha, a segunda vira cruz.',
        cube: { setup: 'F U R U\' R\' F\' F U R U\' R\' F\' U', alg: 'U\' F R U R\' U\' F\' F R U R\' U\' F\'', view: 'top', mask: 'eoll', from: 'f2l', ends: 'yellowCross' },
      },
      {
        title: 'O ponto',
        text: 'Sem nenhuma aresta amarela em cima, faça o algoritmo uma vez: aparece um L. Daí siga como no passo anterior.',
        cube: { setup: 'F U R U\' R\' F\' F U R U\' R\' F\' U2\' F U R U\' R\' F\'', alg: 'F R U R\' U\' F\' U2 F R U R\' U\' F\' F R U R\' U\' F\'', view: 'top', mask: 'eoll', from: 'f2l', ends: 'yellowCross' },
      },
      {
        title: 'Sua vez',
        text: 'Faça a cruz amarela no seu cubo. Não se preocupe se os cantos estiverem bagunçados.',
        cube: { setup: '', view: 'top', mask: 'eoll' },
      },
    ],
  },
  {
    step: 4,
    parts: [
      {
        title: 'Arestas no lugar',
        text: 'Gire U até duas arestas combinarem com os centros dos lados. Se forem vizinhas, deixe uma atrás e a outra à direita e faça R U R\' U R U2 R\'. Se forem opostas, faça o algoritmo uma vez de qualquer lado e procure de novo. Depois gire U para alinhar.',
        cube: { setup: 'U\' R U2\' R\' U\' R U\' R\' U', alg: 'U\' R U R\' U R U2 R\' U', view: '3D', mask: 'll', from: 'yellowCross', ends: 'llEdges' },
      },
      {
        title: 'Cantos no lugar',
        text: 'Ache um canto que já está no lugar certo, mesmo girado. Segure-o na frente à direita e faça U R U\' L\' U R\' U\' L até os quatro estarem no lugar. Se nenhum canto estiver no lugar, faça o algoritmo uma vez e procure de novo.',
        cube: { setup: 'L\' U R U\' L U R\' U\'', alg: 'U R U\' L\' U R\' U\' L', view: '3D', mask: 'll', from: 'llEdges', ends: 'llCorners' },
      },
      {
        title: 'Gire os cantos',
        text: 'Com um canto errado na frente à direita, repita R\' D\' R D até o amarelo dele ficar para cima. Gire só U para trazer o próximo e repita. O meio parece desmontar, mas volta no fim.',
        cube: { setup: 'U D\' R\' D R D\' R\' D R U\' D\' R\' D R D\' R\' D R D\' R\' D R D\' R\' D R', alg: 'R\' D\' R D R\' D\' R D R\' D\' R D R\' D\' R D U R\' D\' R D R\' D\' R D U\'', view: '3D', mask: 'll', from: 'llCorners', ends: 'solved' },
      },
      {
        title: 'Sua vez',
        text: 'Junte tudo: cruz, cantos, meio, cruz amarela e a última camada. É o seu primeiro cubo resolvido.',
        cube: { setup: '', view: '3D' },
      },
    ],
  },
  {
    step: 5,
    parts: [
      {
        title: 'Canto e aresta juntos',
        text: 'No F2L, o canto branco e a aresta do meio que ficam lado a lado entram juntos, num movimento só. Primeiro você junta os dois em cima, depois coloca o par no lugar.',
        cube: { setup: 'R U R\' U\'', alg: 'U R U\' R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Inserção direta',
        text: 'Com o canto em cima, na frente à direita, o branco olhando para a direita, e a aresta atrás, um R U R\' junta os dois e já coloca no lugar. O espelho, do outro lado, é F\' U\' F.',
        cube: { setup: 'R U\' R\'', alg: 'R U R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Separe e junte',
        text: 'Se canto e aresta estão perto, mas virados do jeito errado, afaste um do outro, junte de novo do jeito certo e insira.',
        cube: { setup: 'R U R\' U2\' R U\' R\' U', alg: 'U\' R U R\' U2 R U\' R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Tire de onde está preso',
        text: 'Às vezes uma peça do par já está embaixo, como a aresta aqui, e o canto está em cima. Tire a aresta com R U R\' U\', junte o par em cima e insira: R U R\' U\' R U R\' U\' R U R\'.',
        cube: { setup: 'R U\' R\' U R U\' R\' U R U\' R\'', alg: 'R U R\' U\' R U R\' U\' R U R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Sua vez',
        text: 'Faça a cruz e depois os quatro pares, um de cada vez. Devagar no começo: olhe antes de girar.',
        cube: { setup: '', view: '3D', mask: 'f2l' },
      },
    ],
  },
  {
    step: 6,
    cases: 'oll2',
    parts: [
      {
        title: 'Dois olhares',
        text: 'A OLL em 2 passos deixa o topo todo amarelo: primeiro a cruz, depois os cantos. São 3 casos para a cruz e 7 para os cantos, e todos estão no treino.',
        cube: { setup: 'R U2\' R\' U\' R U\' R\'', view: 'top', mask: 'oll', from: 'f2l' },
      },
      {
        title: 'A cruz em um passo',
        text: 'A linha sai com F R U R\' U\' F\'. O L sai com f R U R\' U\' f\', segurando o L na frente e à direita; f gira as duas camadas da frente juntas. O ponto é os dois seguidos.',
        cube: { setup: 'f U R U\' R\' f\'', alg: 'f R U R\' U\' f\'', view: 'top', mask: 'oll', from: 'f2l', ends: 'yellowCross' },
      },
      {
        title: 'Sune',
        text: 'Com um canto amarelo para cima, segure-o na frente à esquerda e faça R U R\' U R U2 R\'.',
        cube: { setup: 'R U2\' R\' U\' R U\' R\'', alg: 'R U R\' U R U2 R\'', view: 'top', mask: 'oll', from: 'yellowCross', ends: 'oll' },
      },
      {
        title: 'Anti-Sune',
        text: 'Com o canto amarelo para cima atrás à direita, faça R U2 R\' U\' R U\' R\'. Os outros cinco (H, Pi, Faróis, T e Gravata) estão no treino, cada um com a figura do caso.',
        cube: { setup: 'R U R\' U R U2\' R\'', alg: 'R U2 R\' U\' R U\' R\'', view: 'top', mask: 'oll', from: 'yellowCross', ends: 'oll' },
      },
      {
        title: 'Hora de treinar',
        text: 'Decore um caso por vez no treino. Quando reconhecer de olho e fazer sem pensar, passe para o próximo.',
        cube: { setup: '', view: 'top', mask: 'oll' },
      },
    ],
  },
  {
    step: 7,
    cases: 'pll2',
    parts: [
      {
        title: 'Cantos primeiro',
        text: 'Procure faróis: dois cantos do mesmo lado com a mesma cor. Com faróis, deixe-os à esquerda e faça a T-perm. Sem faróis, a Y-perm. Se os cantos ainda não estiverem certos depois, procure os faróis de novo e repita.',
        cube: { setup: 'F R U\' R\' U R U R2\' F\' R U R U\' R\'', view: '3D', mask: 'pll', from: 'oll' },
      },
      {
        title: 'T-perm',
        text: 'R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'. Ela troca os dois cantos da direita e também duas arestas. Se depois as arestas ainda estiverem fora do lugar, elas vêm no próximo passo.',
        cube: { setup: 'F R U\' R\' U R U R2\' F\' R U R U\' R\'', alg: 'R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'', view: '3D', mask: 'pll', from: 'oll', ends: 'solved' },
      },
      {
        title: 'As arestas: Ua e Ub',
        text: 'Com uma lateral inteira pronta, deixe-a atrás. As outras três arestas giram: para um lado é a Ub (R2 U R U R\' U\' R\' U\' R\' U R\'), para o outro é a Ua. A figura do treino mostra as duas.',
        cube: { setup: 'R U\' R U R U R U\' R\' U\' R2\'', alg: 'R2 U R U R\' U\' R\' U\' R\' U R\'', view: '3D', mask: 'pll', from: 'oll', ends: 'solved' },
      },
      {
        title: 'H e Z',
        text: 'Sem nenhuma lateral pronta, as arestas trocam aos pares: em cruz é o H, lado a lado é o Z. M é a camada do meio, girando como L.',
        cube: { setup: 'M2\' U\' M2\' U2\' M2\' U\' M2\'', alg: 'M2 U M2 U2 M2 U M2', view: '3D', mask: 'pll', from: 'oll', ends: 'solved' },
      },
      {
        title: 'Hora de treinar',
        text: 'São 6 algoritmos ao todo. No treino, cada caso aparece com a figura de cima para você reconhecer.',
        cube: { setup: '', view: '3D', mask: 'pll' },
      },
    ],
  },
  {
    step: 8,
    cases: 'f2l',
    parts: [
      {
        title: 'Os 41 casos',
        text: 'Todo par de F2L cai num de 41 casos. Com os algoritmos, você para de pensar em cada um e passa a reconhecer e executar.',
        cube: { setup: 'R U\' R\' U R U2\' R\'', view: '3D', mask: 'f2l', from: 'cross' },
      },
      {
        title: 'Os dois em cima',
        text: 'O grupo maior: canto e aresta na camada de cima. São 24 casos, e muitos você já resolve de forma intuitiva.',
        cube: { setup: 'R U\' R\' U R U2\' R\'', alg: 'R U2 R\' U\' R U R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Um em cima, outro no lugar',
        text: 'O canto em cima com a aresta já no meio, ou o contrário. São 12 casos.',
        cube: { setup: 'R U\' R\' U R U\' R\' U', alg: 'U\' R U R\' U\' R U R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Os dois no lugar, errados',
        text: 'Canto e aresta já no lugar, mas pelo menos um deles girado ou invertido, como o canto aqui. São 5 casos, os mais longos.',
        cube: { setup: 'R U2\' R U R\' U R U2\' R2\'', alg: 'R2 U2 R\' U\' R U\' R\' U2 R\'', view: '3D', mask: 'f2l', from: 'cross', ends: 'f2l' },
      },
      {
        title: 'Hora de treinar',
        text: 'No treino, comece pelos casos que você ainda resolve devagar. O app traz mais vezes os que você erra.',
        cube: { setup: '', view: '3D', mask: 'f2l' },
      },
    ],
  },
]);
