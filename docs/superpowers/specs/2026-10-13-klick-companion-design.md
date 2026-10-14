# Klick — Companion

**Sub-projeto 3: temporadas que duram, um Centro mais vivo e um coach mais útil**

| | |
|---|---|
| Data | 2026-10-13 |
| Status | Design aprovado em conversa (seções 1 a 5). Esta spec aguarda revisão. |
| Branch | `v2`, app em `app/` |
| Referências | Spec do sub-projeto 1 (`2026-10-08-klick-design.md`, seção 6), spec do núcleo (`2026-10-09-klick-nucleo-design.md`, seção 8.4) e a pesquisa 3 (`docs/research/2026-10-07-companion.md`) |

---

## 1. Contexto

O sub-projeto 2 portou o Centro do protótipo como estava:
- **Desenho:** SVG com 5 desenhos fixos de olhos, trocados por opacidade.
- **Animação:** piscar, olhar, salto e respiração feitos com `@keyframes` de CSS em loop.
- **Evolução:** só a temporada 1, com marcos calculados sobre todo o histórico de 3×3.
- **Acabamentos:** o Brilho é liberado com os 9 marcos. Gelo e Carbono não têm como ser liberados.
- **Coach:** os 8 gatilhos da spec 6.5.

A spec do sub-projeto 1 deixou três coisas para este:
- definir as temporadas seguintes;
- montar a tela do Companion com o histórico e a escolha de acabamento;
- avaliar a troca do motor de animação.

| # | Sub-projeto | Situação |
|---|---|---|
| 1 | Linguagem visual, telas e Centro | Validado em 09/10 |
| 2 | Núcleo do timer | Na raiz desde 12/10 |
| **3** | **Companion: temporadas, motor de animação, coach** | **Esta spec** |
| 4 | Trilha de aprendizado | Depois |
| 5 | Sync, conta e comunidade | Depois |

## 2. Entendimento

- **Para quem:** o próprio Ranielli, que já passou da temporada 1. Ela é de iniciante: quem tem centenas de solves abaixo de 1 minuto completa os 9 marcos no primeiro dia.
- **O que muda para ele:**
  - o Centro passa a acompanhar o nível real dele, temporada após temporada;
  - o Centro parece vivo sem atrapalhar;
  - o coach passa a dizer coisas úteis para o treino.
- **As três partes têm o mesmo peso:** progressão, Centro e coach.
- **Como saber se deu certo:**
  - quem faz média de 19 s recebe uma T2 com metas que dá para alcançar e que não saem de graça;
  - durante o solve não roda nada; parado, o Centro não fica desenhando sem parar, e as reações ficam fluidas num Android médio;
  - temporadas e acabamentos sobrevivem a exportar, importar e restaurar cópia;
  - a máquina de estados do Centro, a escada e o coach têm testes no Vitest.

## 3. Decisões

| # | Decisão | Descartado |
|---|---|---|
| D1 | **Escada adaptada.** Da T2 em diante, cada temporada parte do nível da pessoa quando ela começa. Os marcos de velocidade são os próximos degraus redondos abaixo das marcas dela. Volume e constância contam só os solves da temporada. | Metas fixas para todos (quem já passou completa na hora); só hábito, sem velocidade |
| D2 | **Temporadas sem fim.** Depois da T3 elas continuam e entram no histórico. Os acabamentos param nos quatro que existem. | Recompensa nova por temporada; parar na T3 |
| D3 | **Quatro gatilhos novos no coach:** quase lá, semana melhor, fora da curva e fim de temporada. | — |
| D4 | **SVG paramétrico com máquina de estados pura.** O rosto vira parâmetros contínuos interpolados, desenhados no SVG que já existe. A avaliação do Canvas 2D pedida na spec 6.7 fica respondida: para uma cena de uns 30 elementos, o Canvas não compensa refazer geometria, acabamentos e testes. | Canvas 2D (pesquisa 3); só ampliar o CSS |
| D5 | **A T1 é uma temporada como as outras.** Começa em 0 (todo o histórico) e tem as metas de hoje. Um avaliador só serve todas as temporadas. | Manter a T1 como caso especial |
| D6 | **Ajuste "Centro: animado / estático / oculto".** Atende à WCAG 2.2.2, que exige poder pausar uma animação contínua. | Só o movimento reduzido do sistema |

## 4. Princípios

Os princípios dos sub-projetos 1 e 2 continuam valendo, e as regras do Centro da spec 6.4 também:
- nunca anima no solve;
- uma reação por solve;
- fala pouco;
- sem culpa.

Este sub-projeto acrescenta três:

1. **Progresso nunca regride.** Uma temporada fechada fica fechada. Importar, restaurar uma cópia ou apagar um solve não tira uma temporada nem um acabamento de ninguém.
2. **As metas são justas na largada.** São fixadas quando a temporada começa, a partir das marcas daquele momento, e não mudam depois.
3. **A lógica não conhece o desenho.** Estados, expressões e comportamentos são funções puras. O desenho no SVG pode ser trocado (por Canvas ou Rive) sem mexer nas regras.

## 5. Temporadas

### 5.1 Modelo

O perfil ganha o campo `season`:

```ts
type MarkKind = 'count' | 'single' | 'ao5' | 'ao12' | 'streak' | 'steady';

interface SeasonMark {
  kind: MarkKind;
  target: number; // count: solves; single, ao5 e ao12: ms (vale estritamente abaixo); streak: dias; steady: folga em ms
}

interface SeasonState {
  n: number; // 1, 2, 3…
  startedAt: number; // ms desde 1970; contam os solves com at > startedAt (a T1 começa em 0)
  marks: SeasonMark[]; // sempre 9, na ordem da lista
  basis: { single: number | null; ao5: number | null; ao12: number | null }; // as marcas que geraram as metas (nulas na T1)
}

interface SeasonRecord {
  n: number;
  startedAt: number;
  endedAt: number; // o momento do solve que fechou a temporada
  solves: number; // solves de 3×3 da temporada
  startAo12: number | null; // basis.ao12 (nula na T1)
  endAo12: number | null; // a melhor média de 12 dentro da temporada
}

interface Profile {
  // …campos de hoje
  season: { current: SeasonState; past: SeasonRecord[] };
}
```

- **Acabamentos:** saem da contagem de `past`, sem campo novo.

  | Temporadas fechadas | Liberado |
  |---|---|
  | — | Fosco (padrão) |
  | 1 ou mais | Brilho |
  | 2 ou mais | Gelo |
  | 3 ou mais | Carbono |

- **Padrão:** a T1, com `startedAt` 0, as metas da seção 5.3, `basis` nula e `past` vazio.
- **Banco:** a versão não muda. Campo ausente vira o padrão no `mergeProfile`, como os outros campos do perfil.

### 5.2 Escada de degraus redondos

O próximo degrau abaixo de `x` é o maior múltiplo do passo da faixa de `x` que fica estritamente abaixo de `x`:

| Faixa de `x` | Passo |
|---|---|
| acima de 60 s | 5 s |
| acima de 30 s, até 60 s | 2 s |
| acima de 10 s, até 30 s | 1 s |
| até 10 s | 0,5 s |

Exemplos:

| `x` | Próximo degrau |
|---|---|
| 1:31 | 1:30 |
| 1:00 | 58 s |
| 30,5 s | 30 s |
| 30 s | 29 s |
| 18,77 s | 18 s |
| 10 s | 9,5 s |

O 2º degrau é o próximo abaixo do 1º. Nenhuma meta fica abaixo de 1 s.

### 5.3 Os 9 marcos

**T1** (a de hoje, com as mesmas metas e os mesmos rótulos):

| # | Marco | Tipo | Meta |
|---|---|---|---|
| 1 | primeiro solve | count | 1 |
| 2 | single abaixo de 2:00 | single | 2:00 |
| 3 | 100 solves | count | 100 |
| 4 | single abaixo de 1:30 | single | 1:30 |
| 5 | média de 5 abaixo de 1:30 | ao5 | 1:30 |
| 6 | single abaixo de 1:00 | single | 1:00 |
| 7 | 7 dias seguidos | streak | 7 |
| 8 | média de 12 abaixo de 1:00 | ao12 | 1:00 |
| 9 | 1.000 solves | count | 1.000 |

**T2 em diante.** As metas são fixadas no início, a partir das marcas de todo o histórico de 3×3 naquele momento:
- `S` é o recorde de single;
- `A5` e `A12` são as melhores médias de 5 e de 12.

| # | Marco | Tipo | Meta |
|---|---|---|---|
| 1 | 50 solves na temporada | count | 50 |
| 2 | single abaixo do 1º degrau | single | 1º degrau abaixo de S |
| 3 | média de 5 abaixo do 1º degrau | ao5 | 1º degrau abaixo de A5 |
| 4 | 7 dias seguidos | streak | 7 |
| 5 | média de 12 abaixo do 1º degrau | ao12 | 1º degrau abaixo de A12 |
| 6 | 300 solves na temporada | count | 300 |
| 7 | média de 5 abaixo do 2º degrau | ao5 | 2º degrau abaixo de A5 |
| 8 | 5 seguidos sem DNF dentro da folga | steady | máx(1 s, 10% de A5 arredondado ao décimo) |
| 9 | média de 12 abaixo do 2º degrau | ao12 | 2º degrau abaixo de A12 |

- **Exemplo:** quem tem A5 de 18,77 recebe a meta de média de 5 abaixo de 18 s no marco 3 e abaixo de 17 s no marco 7. A folga do marco 8 é de 1,9 s.
- **Falta de marca:** se faltar `A12`, ela cai para `A5`; se faltar `A5`, cai para `S`. Na prática isso não acontece, porque quem chega à T2 tem pelo menos 1.000 solves.

### 5.4 Avaliação

- **O que conta:** só solves de 3×3, fora da lixeira, com `at > startedAt`. Isso também vale para solves importados: os antigos não contam e os recentes contam.
- **Como cada tipo é avaliado:**

  | Tipo | Feito quando |
  |---|---|
  | count | a temporada tem pelo menos `target` solves, contando os DNF |
  | single | algum single fica abaixo da meta |
  | ao5 e ao12 | alguma janela de 5 ou 12 solves da temporada tem média abaixo da meta, pelas regras WCA de hoje |
  | streak | há `target` dias locais seguidos com pelo menos um solve da temporada |
  | steady | há 5 solves seguidos sem DNF, contando o +2, em que o pior menos o melhor fica dentro da folga |

- **Cálculo na hora:** os marcos são calculados na hora, como a T1 é hoje. Apagar o solve que deu um marco apaga o marco.
- **Incremental:** o `createMilestoneTracker` passa a aceitar uma lista de marcos com meta. Uma lista que só ganhou solves no fim continua a conta.
- **Na tela:** a face de cima mostra, em todas as telas, quantos marcos da temporada atual estão feitos. Os adesivos acendem em ordem de leitura, como hoje.

### 5.5 Virada

- **Quando fecha:** quando os 9 marcos estão feitos.
- **O que acontece:** a temporada vira um `SeasonRecord` em `past`, e a próxima começa com `startedAt` igual ao `endedAt` e metas novas.
- **Definitiva:** apagar ou mudar a penalidade de um solve depois não desfaz a virada.
- **Por penalidade no Timer:** tirar ou pôr +2 ou DNF no resultado também pode fechar a temporada. Na tela, aparece como depois de um solve: o fim de temporada no coach, a face de cima cheia e a piscada. O Centro reage de novo, mas sem o salto do recorde (decidido em 14/10).
- **Fechada ao vivo** (um solve fechou):
  - `endedAt` é o `at` desse solve;
  - `basis` da próxima sai de todo o histórico de 3×3, incluindo esse solve.
- **T1 fechada no passado** (quem já tinha os 9 marcos antes da atualização):
  - `startedAt` é o `at` do primeiro solve de 3×3;
  - `endedAt` é o `at` do solve que deu o 9º marco;
  - `solves` conta os solves de 3×3 até ali;
  - `endAo12` é a melhor média de 12 até ali;
  - a T2 começa no momento da conferência.
- **Sem mensagem no fechamento passado:** a T1 fechada no passado não gera mensagem do coach, porque nenhum solve a fechou. Ela aparece na tela do Centro.
- **Sem cascata:** uma temporada nova tem metas abaixo das marcas atuais e nenhum solve, então nunca fecha na hora.
- **Quando conferir:**
  - ao abrir o app, depois da última leitura do banco;
  - depois de gravar um solve de 3×3;
  - depois de editar, excluir ou restaurar um solve, e de excluir ou restaurar uma sessão;
  - depois de importar ou restaurar uma cópia.
- **Gravação:** o repositório ganha `advanceSeason(fromN, record, next)`. Ele lê e grava o perfil na mesma transação e só avança se `season.current.n` ainda for `fromN`. Se não for, não grava nada e devolve o perfil salvo.
  - Duas abas que tentam ao mesmo tempo fazem uma virada só.
  - As outras abas recebem a mudança pelo aviso de perfil que já existe.
- **Falha na gravação:** aparece o aviso `changeFailed`. Os 9 marcos continuam feitos, então a próxima conferência tenta de novo.

### 5.6 Nunca regride

- **Importar um arquivo do Klick e restaurar uma cópia:** fica com a temporada que tiver mais itens em `past`. No empate, fica a daqui.
  - Isso muda o `replaceAll`, que hoje troca o perfil inteiro pelo da cópia.
  - O resto do perfil segue a regra de hoje.
- **Validação:** o `profileOf` da importação confere a forma da temporada:
  - `n` inteiro de 1 para cima;
  - 9 marcos de tipos conhecidos, com metas finitas e positivas;
  - `past` com registros bem formados e números que não se repetem.

  Uma temporada inválida é ignorada e a daqui fica.

## 6. Centro: motor novo

### 6.1 Unidades

| Unidade | O que faz | Depende de |
|---|---|---|
| `ui/centro/face.ts` (puro) | Parâmetros do rosto, tabela de expressões, `eyePath(face, lado)` e `approach(atual, alvo, dt)` | nada |
| `ui/centro/behavior.ts` (puro, com relógio e sorteio injetados) | Piscar, olhadinhas, salto, piscada da face de cima, órbita e respiração. Dado o estado e o instante, diz o que acontece agora e quando é o próximo evento | `face.ts` |
| `ui/centro/animator.ts` | Um por SVG. Aproxima o rosto do alvo, escreve no SVG e agenda o próximo quadro ou evento | os dois acima |
| `ui/centro.ts` | Monta o SVG. Os olhos viram dois `<path class="eye">` e o corpo ganha um grupo com `transform`. `ringFor(view)` e `eyesFor(view)` dão o anel e a expressão de cada estado | `face.ts` |

O `TimerScreen.svelte` já passa de 750 linhas. A ligação do Centro com o timer (estado, reação, órbita, sono) sai dele para um controlador próprio, e a tela só repassa os eventos.

### 6.2 Rosto

```ts
interface Face {
  open: number; // 0 … 1: distância entre as bordas do olho (o mínimo mantém a espessura da linha de hoje)
  curve: number; // -1 … 1: arco das duas bordas (-1 dormindo, para baixo; +1 feliz, para cima)
  lookX: number; // -1.6 … 1.6 unidades
  lookY: number; // -1.6 … 1.6 unidades
  squash: number; // 0.94 … 1.06: escala vertical do corpo, pela base
}
```

| Expressão (spec 6.2) | `open` | `curve` |
|---|---|---|
| aberto | 1 | 0 |
| semicerrado | 0,55 | 0 |
| foco | mínimo | 0 |
| feliz | mínimo | +1 |
| dormindo | mínimo | −1 |

- `open` 1 equivale às 12 unidades de altura do olho de hoje.
- O mínimo, cerca de 0,22, equivale às 2,6 unidades de espessura do traço de hoje. Assim, foco, feliz e dormindo ficam com a cara que têm agora.

- **Formato do olho:** cada olho é o contorno de um traço de pontas redondas: um miolo (um segmento ou uma faixa curva) engordado por um raio. O caminho é uma polilinha com um número fixo de pontos, gerada dos parâmetros a cada quadro. A curva aparece aos poucos conforme o olho achata, sem salto. Como todas as expressões usam a mesma sequência de pontos, dá para interpolar entre qualquer par.
- **Transição:** amortecimento exponencial que chega ao alvo em cerca de 200 ms, independente da taxa de quadros.
- **Atributos:** o `data-eyes` do SVG guarda o nome da expressão-alvo, para os testes e para quem lê o DOM.

### 6.3 Comportamentos

| Comportamento | Quando | Como |
|---|---|---|
| Piscar | Parado e inspeção | A cada 2 a 7 s, sorteado; 10% das vezes, piscada dupla. Fecha em 60 ms e abre em 120 ms |
| Olhadinha | Só parado | Salta em até ±1,6 sem deslizar; volta depois de 0,6 a 1,5 s |
| Órbita | Parado | Um adesivo "ocioso" dá a volta, um passo a cada 0,95 s (como hoje) |
| Respiração | Dormindo | Os cantos "sono" em ciclo de 4 s (como hoje) |
| Salto | Reação de recorde | Sobe 4 unidades e volta, com `squash` na aterrissagem, em cerca de 400 ms |
| Piscada da face de cima | Fim de temporada | A face de cima pisca dourado uma vez (≤ 3 flashes por segundo) e esvazia |

Ficam como na spec 6.3 e 6.4:
- os estados e o anel;
- os atrasos da reação: começa entre 0,4 e 0,6 s depois do tempo e dura no máximo 2,5 s;
- segurar cancela tudo.

As cores do anel continuam com transição de CSS, porque troca de cor não é movimento.

### 6.4 Quando desenha

- **Sob demanda:** o `requestAnimationFrame` só roda enquanto há transição, piscada, olhadinha ou salto. Assentado, o próximo evento é agendado com `setTimeout`.
- **Pausa:** com `document.hidden` e com o SVG fora da tela (`IntersectionObserver`).
- **No solve, `freeze()`:** encaixa o foco, desenha um quadro e cancela o laço e todos os temporizadores. O `body.solving` continua como segunda trava no CSS.
- **Saem do CSS** os `@keyframes` de piscar, olhar, salto e respiração.

### 6.5 Ajuste "Centro"

O ajuste fica em `settings.centro` (`'animado' | 'estatico' | 'oculto'`, padrão `'animado'`):

| Valor | Timer | Tela do Centro e tour |
|---|---|---|
| animado | tudo da seção 6.3 | animado |
| estático | sem piscar, olhadinha, órbita, respiração ou salto; expressões e anel trocam na hora | estático |
| oculto | o Centro some; os avisos continuam no número e no som | estático |

- **Movimento reduzido** (do sistema ou do ajuste "reduzir movimento" que já existe): vale como estático.
- **Acessibilidade:** o SVG continua com `role="img"` e rótulo.

## 7. Coach

### 7.1 Prioridade

O coach continua puro e sem estado guardado: tudo sai do histórico. Fala no máximo uma mensagem por solve, a de maior prioridade. O modo silencioso desliga só o texto.

Cada gatilho novo dispara ao entrar na condição, ou uma vez por sessão e por dia, nunca a cada solve. "Uma vez por sessão e por dia" quer dizer que este é o primeiro solve da sessão, no dia local de hoje, em que a condição vale. Isso se calcula pelos solves anteriores da sessão, sem memória. O dia entra porque sessões duram semanas: só "uma vez por sessão" viraria quase uma vez por temporada (decidido em 14/10).

| # | Gatilho | Situação |
|---|---|---|
| 1 | **Fim de temporada** | Novo |
| 2 | Recorde (single) | Como hoje |
| 3 | Recorde de média | Como hoje |
| 4 | Marco | Vale para os marcos de qualquer temporada |
| 5 | **Quase lá** | Novo |
| 6 | Meta do dia | Como hoje |
| 7 | **Semana melhor** | Novo |
| 8 | Sequência estável | Como hoje |
| 9 | Cansaço | Como hoje |
| 10 | **Fora da curva** | Novo |
| 11 | Primeiro DNF | Como hoje |
| 12 | Volta | Como hoje |

### 7.2 Gatilhos novos

**Fim de temporada:** o solve fechou a temporada (seção 5.5).
- Exemplo: "Temporada 2 completa: 412 solves, melhor média de 12 de 18.61 para 17.84. Gelo liberado."
- Na T1, sem a média: "Temporada 1 completa: 1.204 solves. Brilho liberado."
- Da T4 em diante, sem a frase do acabamento.

**Quase lá:** o primeiro solve da sessão, no dia, em que um marco pendente fica perto. Uma vez por marco por sessão e por dia; se houver mais de um, vale o primeiro da lista.

| Tipo do marco | Perto quando | Exemplo |
|---|---|---|
| ao5 e ao12 | a média atual, dos últimos 5 ou 12 da temporada, fica acima da meta em até 3% | "Faltam 0.4 s para a média de 5 abaixo de 18 s." |
| single | o solve fica acima da meta em até 3% | "Esse ficou a 0.21 s do single abaixo de 15 s." |
| count | faltam de 1 a 10 solves | "Faltam 10 solves para os 300 da temporada." |
| streak | este solve fez a sequência chegar a 6 dias | "Seis dias seguidos. Mais um fecha o marco." |

**Semana melhor**
- Vale no primeiro solve do dia em cada evento.
- Compara a média, sem os DNF, dos solves do evento nos 7 dias locais anteriores a hoje com a dos 7 dias antes deles. Cada janela precisa de pelo menos 12 solves.
- Fala só se a semana recente for pelo menos 1% mais rápida.
- Exemplo: "Sua semana no 3×3 foi 0.62 s mais rápida que a anterior."

**Fora da curva**
- Vale para um solve sem DNF, numa sessão com pelo menos 12 solves antes dele.
- Dispara quando o solve passa de 1,25 vez a média de 12 desses 12 anteriores, e a média de 12 com ele continua válida. Só o primeiro da sessão no dia; a média de 12 olha a sessão inteira, também os dias anteriores.
- Exemplo: "Esse escapou. A média de 12 segue em 18.40." A frase é verdadeira porque a média de 12 descarta o pior tempo.

### 7.3 Entrada

- **Avaliação:** um módulo `core/season.ts` calcula os marcos da temporada (metas, valores atuais, feitos e perto) e se o solve fechou a temporada. O coach recebe isso pronto.
- **Textos:** os textos dos marcos são gerados do tipo e da meta ("Média de 12 abaixo de 1:00"). Os rótulos da T1 continuam iguais aos de hoje.

## 8. Tela do Centro

Mantém a estrutura de hoje: o palco no alto e os cartões embaixo.

**Palco**
- O Centro grande, que segue o ajuste: animado ou estático. Nesta tela, "oculto" vale como estático.
- A linha de status: "Temporada 2 · 3 de 9 marcos · Fosco".
- **Acabamentos:** os 4 botões.
  - Os bloqueados dizem de onde saem ("Gelo · sai na T2").
  - Tocar num bloqueado mostra a prévia por 3 s, como hoje.

**Cartões**
1. **Face de cima: Temporada N, desde 13/10.**
   - Os 9 marcos com o progresso ("melhor 18.42", "37 de 50", "4 de 7 dias").
   - O próximo marco fica destacado e os feitos levam ✓.
2. **Face lateral: a trilha.** Igual a hoje.
3. **Temporadas (novo).** O histórico, da mais nova para a mais antiga.
   - Cada linha: "T1 · 08/10/2025 a 13/10/2026 · 1.204 solves · média de 12 em 1:02.31 · Brilho".
   - Sem nenhuma fechada: "A primeira temporada ainda está em andamento."
4. **Centro.**
   - O controle de três opções: animado, estático ou oculto.
   - O modo silencioso, que sai do cartão próprio e vem para cá.
   - O "reduzir movimento" continua em Ajustes, porque vale para o app inteiro.

**Na virada da temporada (no Timer):**
- a mensagem do coach;
- a face de cima piscando e esvaziando;
- o salto, se o mesmo solve também for recorde.

Sem diálogo e sem confete.

Todos os textos ficam em `strings.ts`, na voz da spec 5.7: calma, sem emoji e sem culpa.

## 9. Testes

| Camada | O que cobre |
|---|---|
| `core/season.ts` | Degraus nas fronteiras (60, 30 e 10 s) e o piso de 1 s; "abaixo" estrito; a folga mínima de 1 s; as quedas na falta de média; só conta solve de 3×3, fora da lixeira e depois do início; a T1 equivale aos marcos de hoje (os testes de `stats` seguem passando); o fechamento no passado da T1; nenhuma cascata; a avaliação incremental bate com a completa |
| `core/coach.ts` | Cada gatilho novo, a prioridade dos 12, as regras de uma vez por sessão e por dia ou por marco, a média de 12 inválida no fora da curva, o modo silencioso |
| `face`, `behavior`, `animator` | Intervalos do piscar entre 2 e 7 s e taxa de duplas perto de 10%, com sorteio fixo; olhadinha só no parado; `approach` converge em cerca de 200 ms; o `freeze` cancela laço e temporizadores; o laço para quando o rosto assenta; o estático não agenda nada; a página escondida pausa |
| Repositório | `advanceSeason` condicional, com duas chamadas concorrentes; importar e restaurar não regridem; a validação do `profileOf`; perfil antigo sem `season` vira o padrão |
| Telas (`@testing-library/svelte`) | Cartão da temporada com progresso, histórico, liberação de acabamento por `past`, controle animado/estático/oculto, Timer sem o Centro quando oculto, `data-eyes` nos estados |
| Ponta a ponta (Playwright) | Importar 1.000 solves de 3×3 fecha a T1, libera o Brilho e abre a T2 com metas; um solve que fecha a temporada mostra a mensagem e o histórico; axe na tela do Centro nos dois temas |
| Manual | Legibilidade do rosto a 48, 64, 96 e 300 px (spec 6.7); fluidez das reações num Android médio |

## 10. Fora do escopo

- Aulas e a trilha vinda das aulas (sub-projeto 4).
- Sync e conta (sub-projeto 5).
- Recompensas depois da T3.
- Sons novos.
- Temporadas para outros eventos além do 3×3.

## 11. Entrega e critérios de aceite

Primeiro no beta. A raiz recebe só com o ok do Ranielli, como sempre.

1. **T1:** quem já tem os 9 marcos da T1 vê, na primeira abertura, a T1 no histórico, o Brilho liberado e a T2 com as metas da escada.
2. **Escada:** as metas seguem a seção 5.2 e a 5.3, conferidas com testes de fronteira.
3. **Fim de temporada:** fechar uma temporada mostra a mensagem, pisca a face de cima, entra no histórico e libera o acabamento certo. Acontece uma vez só, mesmo com duas abas, e nunca regride ao importar ou restaurar.
4. **Comportamentos do Centro:** o Centro pisca, olha em volta e salta como na seção 6.3. Testes automatizados confirmam que nada fica agendado depois que o solve começa e que nada roda com o Centro parado e assentado.
5. **Ajuste animado/estático/oculto:** funciona, e movimento reduzido vale como estático.
6. **Coach:** segue a ordem da seção 7.1, com os quatro gatilhos novos testados.
7. **Suíte e checagens:** a suíte inteira, o `svelte-check` e o axe passam.
