# Klick — o histórico inteiro: todos os solves, o detalhe de cada um e os recordes da sessão

Data: 2026-10-20. Conta, sync, desafio e cópias grandes estão no ar na raiz. O Ranielli pediu a próxima frente e, como nas anteriores,
a proposta direto: tudo abaixo que não veio da pesquisa ou das specs é decisão do Claude, listada na seção 9.

Referências: pesquisa 1 (`docs/research/2026-10-07-cenario-de-timers.md`, seção 6: "migração do csTimer sem perdas" e "paridade no
núcleo"), spec do núcleo (`2026-10-09-klick-nucleo-design.md`), spec da conta (`2026-10-15-klick-conta-sync-design.md`, lixeira e sync).

## 1. Por quê

Hoje o Klick só deixa mexer no último solve (+2, DNF, nota, apagar, desfazer), e a Evolução mostra os 30 últimos do período. Quem traz
10 mil solves do csTimer (o import existe desde o núcleo) não consegue ver nem corrigir nenhum deles: um +2 esquecido ontem, um solve
que caiu na sessão errada, uma nota. No csTimer, a lista de tempos com cada solve editável é o centro do app. É a falta mais sentida por
quem vem de lá, e não custa nada no servidor: o sync já leva qualquer edição.

## 2. Metas, não-metas e anti-metas

**Metas**
- Ver todos os solves de uma sessão (ou do filtro da Evolução), do mais novo ao mais antigo, mesmo com 100 mil.
- Abrir qualquer solve e mudar o que hoje só se muda no último: penalidade, nota, apagar.
- Mover solves para outra sessão do mesmo evento, um ou vários de uma vez, e juntar duas sessões.
- Ver os recordes da sessão (single e médias de 5, 12, 50, 100 e 1000), os atuais, e quais solves formam cada um.

**Não-metas (próximas frentes, se fizer sentido)**
- Digitar tempos à mão, stackmat, timers Bluetooth e smart cube (as "entradas do timer").
- Simulação de competição (comp sim), esconder o tempo durante o solve, outros idiomas.
- Editar o tempo ou o embaralhamento de um solve (só penalidade, nota, sessão e lixeira).

**Anti-metas**
- Uma lista que trava ou demora com uma conta grande: ela tem de rolar lisa com 100 mil solves num celular médio.
- Mexer em médias, recordes ou temporadas de um jeito que surpreenda: as temporadas fechadas continuam sem regredir (regra de sempre), e
  o que muda nos recordes muda porque a pessoa corrigiu um solve.
- Qualquer custo novo no servidor.

## 3. A lista

- **Onde:** na Evolução, a tabela dos 30 últimos vira a lista inteira do filtro de hoje (evento, sessão, período), do mais novo ao mais
  antigo. Os solves continuam na memória como hoje (`app.solves`); "aos poucos" é só o desenho das linhas (a lista desenha as que
  estão na tela), sem um caminho novo de leitura do banco.
- **Cada linha:** o número do solve no filtro (o mais antigo é o 1), o tempo (com +2 e DNF como hoje), a ao5 e a ao12 que terminam nele
  (na ordem de `at`, como a coluna ao5 de hoje; com "Todas as sessões", a janela passa de uma sessão para a outra, como hoje), a data e a
  hora curtas e um sinal de nota. Os recordes ficam marcados como no gráfico.
- **Tocar numa linha** abre o detalhe (seção 4). Com teclado, as setas andam pela lista e Enter abre.
- **Selecionar:** um modo "Selecionar" põe uma caixa em cada linha; com algo marcado, aparecem "Mover para…" e "Apagar". Até 1.000 de uma
  vez. Apagar e mover em lote têm um "Desfazer" só, que desfaz o lote inteiro (apagar volta da lixeira, com a regra de hoje de reviver
  a sessão apagada; mover volta cada solve para a sessão de onde veio).

## 4. O detalhe de um solve

Uma folha, como os outros diálogos do app:
- o tempo grande, a penalidade, a data e a hora, a sessão e o evento;
- o embaralhamento, em texto e com a imagem (o ajuste de hoje que esconde a imagem vale aqui também);
- a nota, editável;
- a ao5 e a ao12 que terminam nele, e se ele é ou faz parte de um recorde;
- ações: OK / +2 / DNF, mover para outra sessão do mesmo evento, apagar (vai para a lixeira, com o "Desfazer" do toast como hoje) e
  copiar (texto com o tempo, a penalidade, o embaralhamento e a data).

## 5. Sessões: mover e juntar

- **Mover** (do detalhe ou da seleção): escolhe uma sessão do mesmo evento; os solves passam para ela, com a data de sempre.
- **Juntar** (no diálogo das sessões): "Juntar com…" leva todos os solves de uma sessão para outra do mesmo evento e manda a primeira
  para a lixeira. Uma sessão grande junta na hora no aparelho e sobe aos poucos pelo sync, como um import grande ("o resto sobe
  amanhã"). A exclusão da sessão entra na fila depois de todas as mudanças de sessão dos solves (como na fila da restauração), para
  nenhum aparelho apagar em cascata um solve que ainda não mudou de sessão. Se a sessão juntada era a atual, a de destino passa a ser a
  atual.
- Tudo o que muda passa pelo repositório como qualquer edição: entra na fila do sync, na cópia automática e na exportação.

## 6. Os recordes da sessão

- Um quadro na Evolução: melhor single e melhor ao5, ao12, ao50, ao100 e ao1000, cada um com o valor atual ao lado. Ele segue o evento
  e a sessão do filtro, mas não o período (é o histórico inteiro da sessão, como no csTimer). Uma média só aparece quando há solves para
  ela. Com 100 mil solves, as médias móveis e os recordes são calculados de um jeito incremental (a janela deslizante, não ordenar cada
  janela de novo), sem travar a tela.
- **Tocar num recorde** mostra quais solves o formam: na ao5 e na ao12, os tempos, com o melhor e o pior entre parênteses (a regra de
  sempre); nas maiores, o intervalo de datas, e "Ver na lista" leva a lista até lá.
- As médias seguem a regra de hoje (`core/stats.ts`: corte de 5%, DNF).

## 7. Restrições

- Nada muda no servidor nem no formato do sync: mover é editar a sessão do solve, que o sync já leva.
- A lista, o detalhe e os recordes funcionam sem rede e sem conta.
- O visual segue a linguagem aprovada (peças do cubo). Antes de construir as telas, uma maquete para o Ranielli aprovar.
- Acessibilidade: o axe passa nas telas novas; a lista e o detalhe funcionam com teclado e leitor de tela; "reduzir movimento" vale.
- Textos novos em português, no tom do app.

## 8. O que conferir

- Uma conta com 100 mil solves numa sessão: a lista abre em menos de 1 s e rola sem engasgar; o detalhe abre na hora; os recordes saem
  sem travar a tela.
- Mudar a penalidade de um solve antigo atualiza a lista, as médias, os recordes e o gráfico, e chega aos outros aparelhos pelo sync.
- Mover e juntar não perdem nem duplicam solves, e sobrevivem a exportar, importar, restaurar e ao sync.
- As temporadas fechadas não regridem quando um recorde antigo some por uma correção (a regra de sempre). Os marcos da temporada em
  curso continuam vindo dos solves, como hoje com o último solve: apagar ou penalizar um solve antigo pode desfazer um marco dela.

## 9. Decisões do Claude (o Ranielli pulou as perguntas)

1. A próxima frente é o histórico (lista, detalhe, mover e juntar, recordes), antes das entradas do timer (stackmat, Bluetooth, tempo
   digitado), do smart cube e da simulação de competição: é a falta mais sentida por quem vem do csTimer e não depende de hardware.
2. A lista mora na Evolução, no lugar da tabela dos 30 últimos, com os filtros de hoje.
3. No detalhe, só penalidade, nota, sessão e lixeira mudam; tempo e embaralhamento não.
4. Mover e juntar só entre sessões do mesmo evento.
5. Seleção de até 1.000 solves por vez.
6. Recordes de single, ao5, ao12, ao50, ao100 e ao1000.
7. Maquete aprovada antes das telas.
8. Os solves continuam na memória; a lista só desenha o que está na tela, e as médias móveis viram incrementais.
9. A lista numera e calcula as médias dentro do filtro, como a Evolução de hoje; o quadro de recordes ignora o período.
10. Um "Desfazer" para o lote inteiro, em apagar e em mover.
11. Juntar põe a exclusão da sessão depois das mudanças dos solves na fila; a sessão de destino vira a atual.
12. Os marcos da temporada em curso seguem os solves, como hoje; só as temporadas fechadas nunca regridem.
