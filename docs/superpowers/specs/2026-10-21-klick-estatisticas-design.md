# Klick — estatísticas que ensinam: a semana, o ano, metas suas e a meta do dia

Data: 2026-10-21. O timer completo está no ar na raiz. O Ranielli pediu a próxima frente e, como nas anteriores, a proposta direto: tudo
abaixo que não veio da pesquisa ou das specs é decisão do Claude, listada na seção 8.

Referências: pesquisa 1 (`docs/research/2026-10-07-cenario-de-timers.md`, seção 6, item 5: "estatísticas que ensinam: qual fase come seu
tempo, progresso por semana, consistência, metas sub-X, heatmap"), a spec do histórico (`2026-10-20-klick-historico-design.md`) e a do
timer completo (`2026-10-20-klick-timer-completo-design.md`, o quadro "Fases").

## 1. Por quê

O Klick já mostra o recorde, as médias, o gráfico, a distribuição, os recordes de ao5 a ao1000 e as fases. Falta o que responde "estou
melhorando?" e "o que eu quero alcançar?": a evolução semana a semana, o ano de treino de relance, e uma meta que a pessoa escolhe
("ao12 sub-15") com o quanto falta. E a meta do dia existe (20 solves) mas não dá para mudar: não há ajuste para ela.

## 2. Metas, não-metas e anti-metas

**Metas**
- Ver as últimas semanas: quantos solves, a média, o melhor tempo e se melhorou em relação à semana anterior.
- Ver o ano de treino num calendário, com a sequência de dias atual e a maior.
- Criar metas próprias (single, ao5 ou ao12 abaixo de um tempo, por evento), ver o quanto falta e quando foi alcançada.
- Escolher a meta do dia.

**Não-metas (ficam para depois)**
- Comparar com outras pessoas, rankings, compartilhar imagens dos gráficos.
- Lembretes e notificações.
- Metas de quantidade (solves por semana) e metas com prazo.
- Um índice de "consistência" além do desvio-padrão de hoje.

**Anti-metas**
- Deixar a Evolução lenta: com 100 mil solves, os quadros novos entram no mesmo cálculo compartilhado de hoje (uma conta por mudança).
- Mexer nas temporadas e nos marcos do Centro: as metas próprias são da pessoa, não substituem os marcos.
- Qualquer custo novo no servidor além de aceitar as chaves novas dos ajustes da conta.

## 3. A semana

- Um quadro "Semanas" na Evolução, no filtro de evento e sessão (como os quadros de recordes e de fases, sem o período): as últimas 12
  semanas (segunda a domingo, no fuso de Brasília), da mais nova à mais antiga.
- A primeira linha é a semana em curso ("Esta semana"), mesmo incompleta.
- Cada semana: o número de solves, a média dela, o melhor single, e a mudança da média em relação à semana anterior (mais rápida, mais
  lenta ou igual no centésimo; "—" quando falta uma das duas).
- A média da semana: os solves sem DNF, com o corte de 5% de cada lado (a regra das médias de hoje); com menos de 5 solves sem DNF, "—".
  Os DNF contam no número de solves e aparecem à parte ("2 DNF").
- Uma linha de resumo no topo compara os últimos 28 dias com os 28 anteriores, pela mesma média: "Nos últimos 28 dias, sua média caiu
  0,42 s" (ou subiu, ou ficou igual; sem dados suficientes, a linha não aparece). O aviso de semana do Centro, que já existe, não muda.
- Semanas sem solves aparecem vazias, para o ritmo ficar visível.

## 4. O ano

- Um calendário do ano na Evolução (como o do GitHub): as últimas 53 semanas, um quadradinho por dia, com a cor pela quantidade de solves
  do dia (os mesmos tons do calendário do mês que o Timer já mostra).
- Abaixo: a sequência atual de dias com solve, a maior sequência e o total de dias treinados no ano.
- Segue só o evento do filtro? Não: o calendário conta todos os eventos e sessões (é o hábito de treinar), e diz isso no título.
- Tocar num dia mostra a data e quantos solves (dica, sem tela nova).

## 5. Metas suas

- Um quadro "Metas" na Evolução e uma folha para criar e editar: tipo (single, ao5 ou ao12), evento e o tempo alvo ("sub-15" = abaixo de
  15,00 s).
- Até 6 metas ao mesmo tempo (o app não deixa criar a sétima; se o sync trouxer mais, todas aparecem e só não dá para criar outra). Vale
  para qualquer evento. A ao5 e a ao12 são sempre as médias com corte de 5% (como a coluna da lista), mesmo nos eventos cuja média
  oficial é a Mo3; o +2 conta e o DNF nunca alcança.
- Cada uma mostra o melhor de agora para aquele tipo e evento (do histórico inteiro, todas as sessões do evento), o quanto falta e uma
  barra de progresso.
- **Alcançada:** a data fica guardada na própria meta e não volta atrás (nem se o solve que a alcançou for excluído depois).
  - Ao criar uma meta que o histórico já alcança, ela nasce alcançada, com a data do primeiro solve (ou da primeira média) que a
    alcançou, sem comemoração.
  - Quando um solve novo deste aparelho a alcança, a data é a desse solve, e o Centro comemora uma vez, antes da mensagem de recorde (a
    meta costuma ser também um recorde). Um alcance que chega pelo sync não comemora (o aparelho que fez o solve já comemorou).
- **Guardadas na conta:** cada meta é uma chave própria do catálogo de ajustes da conta (`goal.<id>`, com um id aleatório), e excluir é
  voltar a chave ao padrão (vazio); duas metas editadas em aparelhos diferentes não se sobrescrevem. Sobem pelo sync como os outros
  ajustes da conta e aparecem em todos os aparelhos. Sem conta, ficam no aparelho.
- Excluir uma meta pede o segundo toque, como as outras exclusões.

## 6. A meta do dia

- Ajustes › Timer, "Meta do dia": 10, 20, 30, 50 ou 100 solves (o ajuste `dailyGoal`, que já existe e já é da conta). Um valor de antes
  fora dessas cinco (de um arquivo importado, por exemplo) aparece como uma sexta opção, marcada, até a pessoa escolher outra.

## 7. Restrições

- Os quadros novos usam o cálculo compartilhado da Evolução (`pool-stats`); o calendário do ano, por contar todos os eventos, tem o próprio
  cálculo, guardado entre mudanças como o outro.
- As metas viram chaves novas no catálogo de ajustes da conta (`src/core/sync/prefs.ts`, `goal.<id>`), com validação estrita; o Worker
  aceita as chaves ao ser publicado (sem migração de D1). Como o Worker e o app de cada ambiente sobem juntos, um app novo nunca fala com
  um Worker de antes. Um aparelho com o app de antes ignora as chaves sem perder.
- O fuso das semanas e dos dias é o do aparelho, como o resto das estatísticas do app hoje (o calendário do mês, a sequência, a meta do
  dia); assim a sequência nova e a do Timer sempre batem.
- Funciona sem rede e sem conta. axe passa nas telas novas (claro e Noite); o calendário tem texto para leitor de tela (o mês e os
  totais), não um quadradinho por vez.
- O visual segue a linguagem aprovada. Antes de construir as telas, uma maquete para o Ranielli aprovar.
- Textos novos em português, no tom do app.

## 8. Decisões do Claude (o Ranielli pulou as perguntas)

1. A frente é "estatísticas que ensinam", antes da simulação de competição.
2. Semanas de segunda a domingo, 12 semanas, a média aparada de 5% com mínimo de 5 solves.
3. O calendário cobre 53 semanas e todos os eventos.
4. Metas de single, ao5 e ao12 por evento, até 6, sincronizadas com a conta.
5. O Centro comemora uma meta alcançada uma vez.
6. Meta do dia com cinco opções fixas.
7. Maquete aprovada antes das telas.
8. O fuso é o do aparelho (como as estatísticas de hoje), não o de Brasília.
9. Uma chave por meta (`goal.<id>`); o limite de 6 só no app.
10. A data de alcance fica guardada e não volta; meta já alcançada ao nascer não comemora; só o aparelho do solve comemora.
11. A média da semana tira os DNF antes do corte; o resumo compara 28 dias com os 28 anteriores.
12. Meta do dia de antes, fora das cinco opções, vira uma sexta opção marcada.
