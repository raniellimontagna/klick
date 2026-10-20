# Klick — o timer completo, sem hardware: digitar o tempo, fases no toque, esconder o tempo e voz na inspeção

Data: 2026-10-20. Histórico inteiro no ar na raiz. O Ranielli escolheu esta frente ("o timer completo") depois de saber que smart cube
e timers Bluetooth ficam para quando houver o aparelho para testar; o resto é decisão do Claude, listada na seção 8.

Referências: pesquisa 1 (`docs/research/2026-10-07-cenario-de-timers.md`, seção 6: itens 3 "paridade no núcleo competitivo", 5
"estatísticas que ensinam" e 8 "foco"; seção 7.1, a inspeção e os avisos de 8 e 12 s), spec do núcleo (`2026-10-09-klick-nucleo-design.md`).

## 1. Por quê

Quem treina com um timer físico (o stackmat das competições, ou um timer Bluetooth) hoje não tem como usar o Klick: o csTimer deixa
digitar cada tempo, e é assim que essas pessoas o usam. Quem quer saber qual fase come o tempo precisa de um smart cube; marcar as fases
com um toque dá a mesma resposta sem aparelho nenhum. E dois pedidos de competição e de foco: o aviso falado de 8 e 12 s, como o juiz faz,
e não ver o cronômetro correndo durante o solve.

## 2. Metas, não-metas e anti-metas

**Metas**
- Digitar o tempo de cada solve em vez de cronometrar, com +2 e DNF.
- Marcar o fim de cada fase com um toque durante o solve e ver, no fim, quanto cada fase levou e qual pesa mais.
- Escolher como o tempo aparece durante o solve: inteiro, só os segundos ou escondido.
- Ouvir "oito" e "doze" na inspeção, em voz, no lugar do bipe.

**Não-metas (próximas frentes)**
- Ler o stackmat pelo microfone, timers Bluetooth e smart cube (dependem do aparelho para testar).
- Fases e tempo digitado no desafio e no treino da Trilha (os dois continuam com o cronômetro de hoje).
- Editar as fases de um solve depois de gravado; ajustes diferentes por sessão; voz em outras línguas.

**Anti-metas**
- Mudar médias, recordes ou temporadas: as fases não mudam o tempo do solve, e um tempo digitado vale como qualquer outro.
- Mudar alguma coisa para quem não liga nenhuma das opções.
- Qualquer custo novo no servidor, ou uma mudança no sync que quebre um aparelho com o app antigo.

## 3. Digitar o tempo

- **Onde se liga:** Ajustes › Timer, "Como você marca o tempo": "Cronômetro" (o de hoje, padrão) ou "Digitar".
- **No Timer:** no lugar do cronômetro, um campo para o tempo, com o embaralhamento de sempre acima. Enter (ou o botão "Salvar")
  grava o solve e traz o próximo embaralhamento.
- **O que se aceita:** só dígitos no estilo do csTimer ("1234" vira 12.34; "10234" vira 1:02.34), ou com separadores ("12.34",
  "12,34", "1:02.34"); um "+" no fim é +2 ("12.34+"); "DNF" (qualquer caixa) é DNF. Um tempo torto mostra o erro no próprio campo e não
  grava nada. Limite: menos de uma hora.
- **DNF digitado** grava o tempo bruto 0 (não há tempo); nesse solve, OK e +2 ficam indisponíveis (no último solve e no detalhe),
  porque não há tempo para mostrar.
- **A inspeção** não roda nesse modo (o timer físico tem a dele); a penalidade vem do que se digita.
- Depois de gravar, o resultado aparece como hoje, com as ações do último solve (+2, DNF, nota, excluir, desfazer).

## 4. Fases no toque

- **Onde se liga:** Ajustes › Timer, "Fases": "Desligado" (padrão), 2, 3 ou 4. Com 4, a dica "por exemplo: cruz, F2L, OLL e PLL".
- **No solve:** com N fases, são N toques: o mesmo gesto que para o cronômetro (tocar a tela, espaço ou qualquer tecla) marca o fim de
  cada fase, e o N-ésimo para o solve. Uma marquinha discreta aparece a cada fase marcada. Um toque a menos de 300 ms do anterior não
  conta (um toque duplo não cria uma fase de 40 ms). Não há parada antes da hora: quem esqueceu de marcar toca as que faltam no fim.
- **Vale para todos os eventos**, como a pessoa ligar; no modo "Digitar", não há fases.
- **O que se guarda:** a duração de cada fase, em ms, no próprio solve (`phases`, sempre com as N fases), somando o tempo bruto (`ms`). O
  +2 e o DNF valem para o solve inteiro, como hoje.
- **Onde aparece:** no resultado logo depois do solve (as fases embaixo do tempo); no detalhe do solve (folha do histórico); e na
  Evolução, um quadro "Fases", no filtro de evento e sessão da Evolução: a média de cada fase nos últimos 12 solves com o mesmo número
  de fases do mais recente (quem mudou de 3 para 4 vê as de 4), a parte de cada uma no total, e a que mais pesa marcada.
- **Exportar e importar:** o arquivo do Klick leva as fases, na mesma versão do formato (um app de antes lê o arquivo e ignora o campo;
  conferir com um teste). Reimportar um solve que já existe continua sendo pulado, como hoje (as fases não se juntam ao que já está aqui).
  No arquivo do csTimer, elas vão no formato dele (o multiphase), se o formato for confirmado no código aberto do csTimer; se não, ficam
  fora do arquivo do csTimer.

## 5. Como o tempo aparece durante o solve

- Ajustes › Timer, "Tempo durante o solve": "Inteiro" (o de hoje, padrão), "Só os segundos" ou "Escondido" (aparece "Resolvendo").
- A contagem da inspeção aparece sempre. O tempo final aparece inteiro no fim, em todos os modos.

## 6. Voz na inspeção

- Ajustes › Aparência e som (onde os sons já ficam), o aviso da inspeção: "Bipe" (o de hoje), "Voz" ou desligado (o liga e desliga de hoje). O liga e desliga continua o
  mesmo campo de hoje; "Voz" é um campo novo do aparelho, para um app de antes nunca ler um valor que não conhece.
- Com "Voz", o Klick fala "oito" aos 8 s e "doze" aos 12 s, em português, pela voz do sistema (Web Speech). Sem uma voz em português no
  aparelho, volta ao bipe. A voz segue o mesmo liga e desliga do aviso (o modo silencioso de hoje só cala os textos do Centro, não os
  sons, e continua assim).

## 7. Restrições

- Nada muda no servidor nem no protocolo do sync: `phases` é um campo a mais no solve, que o sync já leva intacto e que o app antigo
  guarda e devolve sem perder. Conferir com testes: um solve com fases passa por um aparelho com o código de antes sem perder as fases, e
  continua com elas depois que esse aparelho muda a penalidade ou a nota dele (o repositório regrava o registro inteiro).
- Os quatro ajustes novos são do aparelho (como `holdMs`), não da conta: nenhuma chave nova no catálogo de ajustes da conta, nada novo
  para o servidor aceitar.
- Funciona sem rede e sem conta. axe passa nas telas novas (claro e Noite); teclado e leitor de tela no campo de digitar.
- O visual segue a linguagem aprovada. Antes de construir as telas, uma maquete para o Ranielli aprovar.
- Textos novos em português, no tom do app.

## 8. Decisões do Claude (o Ranielli escolheu a frente e pulou as perguntas)

1. "Digitar" é um ajuste do aparelho para o Timer inteiro, não por sessão; o desafio e o treino continuam com o cronômetro.
2. Formatos aceitos como os do csTimer, mais vírgula e "+" no fim; limite de uma hora.
3. Fases de 2 a 4, numeradas, com a dica do CFOP no 4; um toque a menos para o solve sem fases.
4. As fases são durações (somam o tempo bruto) num campo `phases` do solve.
5. Quadro "Fases" na Evolução com a média das últimas 12 com fases.
6. Três modos de mostrar o tempo; a inspeção sempre visível.
7. Voz em português, "oito" e "doze", com o bipe de reserva.
8. Maquete aprovada antes das telas.
9. Os quatro ajustes novos são do aparelho; "Voz" é um campo novo, sem mudar o tipo do de hoje.
10. Com N fases, N toques; toque a menos de 300 ms do anterior não conta; sem parada antes da hora.
11. DNF digitado grava 0 e não deixa virar OK ou +2.
12. O quadro "Fases" segue o filtro da Evolução e usa só os solves com o mesmo número de fases do mais recente.
