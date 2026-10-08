# Pesquisa 3: companion animado para o Klick

> Pesquisa pública feita em 07/10/2026 para orientar o companion do Klick, um timer e scrambler de speedcubing web/PWA offline-first. Não houve login, formulário, download nem execução de código de terceiros. Os tamanhos de bibliotecas mudam a cada versão; trate-os como ordem de grandeza. As referências entre colchetes, como [12], apontam para a seção 7.

---

## 0. Resumo executivo

- **Conceito recomendado: "Centro".** O companion é um cubinho 3×3 visto em 3/4, e a face da frente é o rosto.
  - O **adesivo central** é a cabeça: dois olhos com pálpebras, num modelo paramétrico de expressões (uma linha por expressão numa tabela, interpolada a cada quadro).
  - Os **8 adesivos ao redor** formam um anel no estilo dot-matrix, que mostra estado e dado: a cor indica o estado (com a paleta do próprio cubo) e a quantidade de adesivos acesos indica o dado.
  - O anel cobre os avisos de 8 s e 12 s da inspeção, o progresso de consistência e da meta do dia e a "face resolvida" multicolorida no recorde.
  - Uma camada opcional de progressão desbloqueia acabamentos de adesivo por marcos reais (sub-X, número de solves) e nunca tira nada do usuário.
- **Por que esse conceito.** Ele reúne o que os casos de referência mais bem-sucedidos mostram:
  - os olhos fazem quase todo o trabalho emocional (Cozmo, Notion AI) [8][9][35];
  - informação discreta em grade de pontos é legível (micro:bit, Glyph Matrix) [55][56];
  - progresso sem punição funciona (Finch) [17].

  A metáfora também é fiel ao cubo: o centro nunca sai do lugar e as peças em volta é que mudam. Com movimento reduzido o companion continua útil, porque troca de cor não conta como "movimento" na WCAG 2.3.3 [79].
- **Tecnologia recomendada.** Canvas 2D com projeção 3D própria, escrita do zero, sem dependências e com renderização sob demanda.
  - É a mesma arquitetura do rosto procedural do Cozmo, que interpola 43 parâmetros entre expressões [10].
  - O cubing.js (`<twisty-player>`) entra só sob demanda, para a prévia do scramble [70][72].
  - O Rive é a alternativa se entrar um animador, mas custa de 222 a 648 KB de WASM (brotli) e exige plano pago para exportar desde 20/10/2025 [57][60].
- **Regra dura do solve.**
  - A pose de concentração se completa enquanto o usuário segura a tecla; quando o solve começa, nada se mexe e o loop de animação para.
  - A reação só começa cerca de 0,5 s depois que o tempo aparece.
  - Voltar a segurar cancela qualquer reação no mesmo quadro.

---

## 1. Casos de referência

### 1.1 Tabela-resumo

| Caso | O que funciona | O que evitar | Lição para o Klick |
|---|---|---|---|
| Duolingo (Duo, personagens do mundo, Lily) | Rive com máquina de estados em camadas paralelas (pose + boca); idle variado; reação a acerto/erro; celebração especial só nos marcos | Culpa e ansiedade de streak | Copiar a modularidade e a raridade da celebração; não copiar a culpa |
| Cozmo / Vector / EMO | Olhos simples carregam o humor; um "motor de emoções" reage a eventos; imperfeição proposital; o tédio vira brincadeira | Carência que pede atenção | Olhos primeiro; reagir a eventos reais |
| Finch | O pet cresce com o autocuidado; faltar um dia não pune | Pressão sutil do "pet esperando" | Progresso sem perda |
| Forest / Focus Friend | O companion "trabalha" junto enquanto você foca | A árvore morre (aversão à perda) | Ficar quieto durante o foco; nada de perda |
| Tamagotchi | Apego construído por cuidado e consequência | Culpa, morte, obrigação de visitar | O oposto do que o Klick quer |
| Clippy | Nada | Interrompia, travava a tarefa, era condescendente, chamava atenção quando você estava parado | Nunca iniciar, nunca bloquear; parado, ele dorme |
| Microsoft Copilot 2025 (Appearance → Mico) | Forma abstrata e legível; a cor muda com a conversa; dá para desligar | Rostos humanos (Portraits) soaram estranhos | Estilizado vale mais que realista; sempre desligável |
| Notion AI | Só olhos, sobrancelhas e nariz; estados da interface viram expressão; feito em Rive | — | Mínimo de traços; "pensando" e "erro" como expressões |
| Habitica | Coleção de pets e montarias | Perda de HP, "morte", perda de ouro e equipamento | Coleção sim, punição não |
| oneko / Bongo Cat / Desktop Goose | Reage ao input do usuário; dorme quando você para | O ganso é irritante de propósito e só funciona como pegadinha opt-in | Reagir encanta; dormir no ócio é o comportamento mais querido |
| Chrome Dino | Aparece no momento de frustração e o transforma em brincadeira | Até o Dino precisou de botão de desligar em empresas e escolas | Personalidade nos momentos ruins (DNF), com moderação |
| Companion Cube (Portal) / Qbby (BoxBoy) | Um cubo pode ser personagem; a forma vem da mecânica; a alma vem do timing | — | Cubo com rosto funciona; invista no timing |

### 1.2 Detalhes e evidências

**Duolingo.**
- **Personagens do mundo (2022).** A equipe deu fala aos 10 personagens do mundo [1]:
  - cada um tem mais de 20 formatos de boca (visemas) desenhados de acordo com a personalidade;
  - na máquina de estados do Rive, os estados de boca rodam em paralelo aos de pose e se misturam;
  - no idle há acenos de cabeça, piscadas e sobrancelhas, e no fim de cada exercício o personagem reage ao acerto ou ao erro;
  - tudo sai num único arquivo para os engenheiros, e o app conduz a animação com dados de tempo em vez de vídeo.
- **Lily (videochamada com IA, 2025).** A lógica virou um "ator modular" [2]:
  - olhos, sobrancelhas e boca são peças reutilizáveis combinadas em tempo real;
  - 8 animações de cabeça e 8 de corpo geram mais de 64 variações de idle, o que evita loop repetitivo;
  - quando a IA demora, ela inclina a cabeça como quem pensa, e o atraso parece intencional;
  - o arquivo fica abaixo de 1 MB;
  - abrir demais os olhos dela a deixava alegre demais e quebrava a personalidade sarcástica, então a equipe conteve a expressividade.
- **Marco de streak.** A transformação do Duo (o "power-up" de fênix) só acontece nos dias de marco, e a equipe tratou ritmo e timing como parte do design [3].
- **Linguagem visual.** Poucas formas arredondadas, silhueta clara e espaço negativo para não competir com a lição [4].
- **Lado ruim.** As notificações que culpam o usuário e a ansiedade de manter o streak são criticadas por um estudo brasileiro de 2025, por uma pesquisa qualitativa e por guias para pais [5][6][7].

**Cozmo, Vector e EMO.**
- **Olhos.** Os olhos gráficos simples, herdados da EVE de WALL-E, transmitem humor e intenção com poucos pixels [9]. A Anki tirou as pupilas do Cozmo porque o deixavam humano demais, e o fez olhar para a pessoa quando está animado, como um cachorro ou uma criança pequena faria [8].
- **Motor de emoções.** Ele altera traços como confiança e coragem conforme os eventos: perder uma partida, encontrar a beirada da mesa, empilhar os cubos [8][12].
- **Imperfeição proposital.** O CEO defendia que falhar dá palco para a emoção [12]. Quando ninguém interage, os olhos viram uma partida de Pong [11].
- **O rosto procedural** foi documentado por engenharia reversa da comunidade [10]:
  - são 43 números: 5 para o rosto inteiro e 19 por olho;
  - os parâmetros de cada olho incluem centro, escala, ângulo, raios de cada canto e duas pálpebras com altura, ângulo e curvatura;
  - as transições são interpolação linear entre essas listas.

  Na prática, é a mesma arquitetura proposta para o Klick (uma linha por expressão, interpolada a cada quadro), o que valida bem a abordagem.
- **Vector e EMO** seguem a fórmula: tela sempre ligada com olhos expressivos, olhos de coração ao receber carinho, olhos caídos quando triste. Parte das alegações sobre o EMO vem de marketing ou de concorrentes [13][14].

**Finch.**
- O pássaro cresce quando você cuida de si.
- Faltar um dia não machuca nem entristece o pet: ele espera, sem julgar.
- O progresso visível vira um marcador de quanto você já avançou [17][18][19].
- É o contraponto direto aos rastreadores de streak que pintam o dia perdido de vermelho [17].

**Forest e Focus Friend.**
- **Forest:** uma árvore cresce enquanto você não mexe no celular e morre se você sair do app. As árvores mortas ficam na coleção, o que é aversão à perda pura [20][21].
- **Focus Friend (Hank Green, 2025):** troca a ameaça por ternura.
  - Um feijãozinho tricota enquanto você foca e derruba as agulhas se você pegar o celular.
  - As meias tricotadas viram decoração.
  - O app chegou ao 1º lugar da App Store em agosto de 2025 [22][23].
- **Para o Klick:** a parte útil é a do companheiro que se concentra junto. Só que no cubo o foco é físico, com mãos e olhos no cubo, então o companion deve ficar quieto em vez de "trabalhar" na tela.

**Tamagotchi.**
- O apego vinha de necessidades em tempo real, que não pausavam, e de consequências duras: na versão japonesa original, o bichinho morto virava fantasma com túmulo [24][25].
- Escolas proibiram o brinquedo, e pais se preocuparam com culpa e apego [25].
- É o modelo de cuidado obrigatório que o Klick deve evitar.

**Clippy.** As análises convergem nestes pontos [28][29][30]:
- interrompia na pior hora e travava a tarefa;
- a ajuda era pensada para o primeiro uso e irritava a maioria experiente;
- detectava o contexto de forma ingênua (o famoso "parece que você está escrevendo uma carta");
- tinha animações para chamar atenção quando você ficava parado;
- acabou desligado por padrão (as fontes divergem entre o Office 2000 e o XP).

**Microsoft Copilot em 2025.** Foram três tentativas em sequência:
- **Copilot Appearance** (Copilot Labs, julho): um blob com rosto que sorri, acena e franze a testa em tempo real durante a conversa por voz [31].
- **Copilot Portraits** (setembro): rostos humanos que parte da imprensa achou inquietantes [32].
- **Mico** (23/10) [33]:
  - forma fluida que muda de cor;
  - vem ligado por padrão no modo voz, mas pode ser desligado;
  - tem um easter egg que o transforma no Clippy;
  - o chefe de IA da Microsoft disse que não estão buscando engajamento nem tempo de tela.

O estúdio Psyop, que desenhou o Mico, resume o aprendizado: a solução mais eficaz foi a mais legível, não a mais complexa, e o personagem segue o usuário em vez de interrompê-lo [34].

**Notion AI** [35][36].
- O rosto tem só olhos, sobrancelhas e nariz, no traço do diretor de arte Roman Muradov.
- A BUCK o animou em Rive com máquina de estados, para misturar expressões em tempo real com arquivos pequenos.
- Ao "pensar", as sobrancelhas tremulam; no erro, o rosto se desmonta por um instante.
- A meta explícita era parecer vivo sem desviar a atenção da tarefa.

**Habitica.**
- A coleção de pets e montarias motiva muita gente: ovo + poção choca o pet, e alimentá-lo o transforma em montaria.
- Por outro lado, tarefas diárias não cumpridas tiram HP, e "morrer" custa nível, ouro e equipamento. Existe uma "Pousada" para pausar as punições [26][27].
- A coleção é a parte boa; a punição é o que torna o app estressante.

**oneko, Bongo Cat e Desktop Goose.**
- **Neko** (1989–1990, Mac e X11): um gato que cochila em cima do cursor parado e acorda correndo quando você mexe o mouse [37]. A versão web, oneko.js, mantém o comportamento [38].
- **Bongo Cat** (Steam, 2025): só bate as patinhas quando você digita ou clica, e solta chapéus colecionáveis. Chegou a cerca de 194 mil jogadores simultâneos e 96% de avaliações positivas, com a ressalva de que muitos eram bots juntando itens [39][40].
- **Desktop Goose** é o contraexemplo divertido: um ganso que rouba o cursor e espalha bilhetes pela tela. É irritante de propósito e só é tolerado porque é uma pegadinha opt-in, com controles para reduzir o caos [41].

**Chrome Dino** [42].
- Aparece só quando algo deu errado (sem internet) e transforma a frustração em brincadeira.
- O movimento rígido, de videogame antigo, foi uma restrição autoimposta.
- Chegou a cerca de 270 milhões de partidas por mês em 2018, e administradores de empresas e escolas pediram um jeito de desligá-lo.

**Companion Cube e Qbby.**
- **Companion Cube (Portal):** os testadores abandonavam a caixa no meio da fase. A Valve pôs corações nela, fez a GLaDOS falar dela e aumentou a dependência até que os jogadores se apegassem a um cubo inanimado [43].
- **Qbby (BoxBoy):** a forma quadrada veio da mecânica (criar caixas), e quase toda a personalidade vem da animação: sustos, dancinhas de vitória [44][45].
- Os dois provam que um cubo pode ser um personagem querido, desde que a forma tenha razão de existir e o timing seja caprichado.

**Timers de cubo hoje.**
- Não encontrei timer de speedcubing com mascote. Os mais lúdicos se limitam a confete no PB ou a fundos que reagem [54].
- O espaço está livre, mas a comunidade anda saturada de timers genéricos e "vibe-coded" (ver Pesquisa 1, seção 5.2). Um companion só agrega se parecer feito à mão, se for opcional e se não atrapalhar o treino sério.

---

## 2. Princípios: o que faz um companion ser amado em vez de irritante

### 2.1 Fazer

1. **Reagir, nunca iniciar.** Todo comportamento responde a algo que o usuário fez ou a um dado do solve. O Clippy fazia o contrário; o Mico e o Bongo Cat acertam [28][34][39].
2. **Reagir a fatos verificáveis:** PB, média, +2, DNF, tempo parado. Nada de adivinhar intenção, porque a detecção ingênua de contexto foi parte do fracasso do Clippy [29].
3. **Olhos primeiro.** Pálpebras e direção do olhar carregam quase toda a emoção; o Cozmo e o Notion AI nem têm boca [9][35]. A boca paramétrica fica opcional.
4. **Poucas formas, silhueta clara.** Legibilidade vence detalhe (Duolingo, Psyop, Qbby) [4][34][44].
5. **Variar sem perder a personalidade.**
   - Sorteie entre variações e, sobretudo, sorteie o intervalo entre elas: piscadas em intervalos aleatórios, as 64 variações de idle da Lily. Loop repetido denuncia a máquina [2][49][50].
   - Contenha a amplitude, porque expressão exagerada quebra o personagem [2].
   - Movimentos de idle devem ser lentos e suaves: respiração, olhadas ocasionais, piscadas aleatórias. Movimento brusco chama atenção demais [16].
6. **Antecipação e reação.** Mostrar intenção antes de agir e reagir ao resultado deixa o comportamento legível; um estudo com 273 participantes testou isso em robôs [15]. Exemplos: olhar para o scramble quando ele aparece, "respirar fundo" ao segurar a tecla.
7. **Raridade dá valor.** Celebração grande só nos marcos; o dia a dia recebe um aceno [3].
8. **Progresso sem perda.** O companion pode ganhar coisas, nunca perder (Finch) [17].
9. **Desligável, com "modo sério".** Opções animado, estático e oculto, lembradas entre sessões. O Mico é desligável, o Clippy virou opt-in e até o Dino ganhou botão de desligar [33][30][42].
10. **Estilizado, não realista.** Rostos realistas caem no estranho (Copilot Portraits), e a Anki tirou as pupilas do Cozmo para ele não parecer humano demais [32][8]. Também não é preciso exagerar a emoção para criar vínculo: as pessoas já tratam software como gente, e a NN/g descreve quatro graus desse antropomorfismo [48].
11. **Fofura na dose certa.** Olhos grandes e formas arredondadas ativam o "esquema de bebê" e geram simpatia [46]. Para quem treina performance, porém, fofo demais vira infantil.
12. **Sono como estado de ócio.** É o comportamento mais querido dos pets de tela (Neko) e o mais respeitoso: em vez de chamar o usuário, o companion cochila [37].

### 2.2 Não fazer

1. Interromper, abrir balão, pedir clique ou atrasar o próximo solve [28].
2. Animar para chamar atenção quando o usuário está parado, como o Clippy fazia [30].
3. Culpa, tristeza prolongada, ameaças ou notificações push [5][6][7].
4. Morte, perda de progresso ou streak que zera (Tamagotchi, Habitica, Forest). O DNF já é perda suficiente [24][26][20].
5. Qualquer movimento durante o solve: o início de um movimento captura a atenção automaticamente [47].
6. Elogiar todo solve, o que inflaciona o elogio, ou destacar o pior tempo da sessão.
7. Ser condescendente com quem já é rápido [29].
8. Informar só por cor, ou piscar mais de 3 vezes por segundo [80][81].
9. Depender de internet ou de CDN para funcionar, já que o app é offline-first.

---

## 3. Estados para o Klick

### 3.1 Contexto do domínio

- **Inspeção WCA** [52]:
  - o competidor tem menos de 15 s para inspecionar e começar (A3a1);
  - o juiz avisa aos 8 s e aos 12 s (A3b3, A3b4);
  - começar com 15 s até menos de 17 s dá +2 (A4d1);
  - 17 s ou mais dá DNF (A4d2).
- **Penalidade ao parar:** +2 se faltar um movimento para resolver (desalinhamento), DNF se faltar mais de um (10e3, 10e4) [52].
- **Timers web:** segura-se a barra de espaço (ou o dedo na tela) até o timer ficar verde, e soltar inicia o solve. O csTimer tem inspeção WCA com alertas de voz aos 8 e 12 s [53].
- **Métricas disponíveis para o companion:** single, mo3, ao5, ao12, ao100, PB por evento e número de solves na sessão e no dia.

### 3.2 Do mascote de referência para o Klick

| Estado de um assistente típico | Equivalente no Klick |
|---|---|
| parado | ocioso (entre solves) |
| ouvindo | segurando / pronto (verde) |
| pensando | inspeção |
| respondendo | resultado (reação ao tempo) |
| sucesso | PB ou marco |
| precisa de você | algo fora do ciclo pede ação (backup, armazenamento, atualização) |
| erro | +2 / DNF (e erro técnico) |

### 3.3 Tabela de estados proposta

Na tabela, "olhos" é o adesivo central e "anel" são os 8 adesivos ao redor. A paleta usa as cores do cubo:

| Cor | Significado |
|---|---|
| Branco | Neutro |
| Verde | Pronto (a convenção dos timers) |
| Amarelo | Aviso de 8 s ou "ops" |
| Laranja | Aviso de 12 s |
| Vermelho | Zona de penalidade, DNF ou erro |
| Azul | Sono ou "precisa de você" |
| As seis juntas | Face resolvida (PB ou marco) |

**Ciclo do solve**

| # | Estado | Gatilho | Olhos (centro) | Anel | Duração | Movimento reduzido |
|---|---|---|---|---|---|---|
| 1 | Ocioso | Nenhum solve em andamento | Neutros; piscadas em intervalos aleatórios de 2 a 7 s; olhadinhas raras; "respiração" de no máximo 2% | Branco, brilho baixo | Contínuo (pausável) | Pose fixa, sem piscar |
| 2 | Scramble novo | Um scramble foi gerado | Olhadinha rápida para o texto do scramble e volta (em 1 ou 2 quadros) | — | 0,4 s | Nada |
| 3 | Aquecimento | 1º solve da sessão, ou após 30 min parado | "Espreguiça" uma vez | — | 1 s | Nada |
| 4 | Segurando | Tecla ou dedo pressionado, timer ainda não verde | Pálpebras descem para "foco" e o olhar desce, como quem olha o cubo | Cai para 4 adesivos | Até ficar verde | Troca instantânea |
| 5 | Pronto | Timer verde | Pose de foco completa e congelada | Verde fixo | Até soltar | Igual |
| 6 | Inspeção | Inspeção ativa, de 0 a 8 s | Atento, imóvel, olhar baixo | Branco cheio (contagem opcional: apaga 1 adesivo a cada ~1,9 s) | Até 15 s | Igual (troca de cor não é movimento) |
| 7 | Inspeção 8 s | Chegou aos 8 s | Pálpebra superior sobe um pouco (alerta), troca instantânea | Amarelo | — | Igual |
| 8 | Inspeção 12 s | Chegou aos 12 s | Olhos mais abertos | Laranja | — | Igual |
| 9 | Inspeção 15 s+ | Entre 15 e 17 s (zona de +2) | Careta contida | Vermelho | — | Igual |
| 10 | Resolvendo | Timer correndo | **Congelado** na pose de foco (olhos quase fechados), sem renderizar | Apagado | Todo o solve | Igual (já é estático) |

**Reações** (começam 0,4 a 0,6 s depois que o tempo aparece; uma por solve, a de maior prioridade)

| # | Estado | Gatilho | Olhos (centro) | Anel | Duração | Movimento reduzido |
|---|---|---|---|---|---|---|
| 11 | Resultado normal | Tempo dentro da faixa habitual | Piscada dupla ("ok") | — | 0,6 s | Nada |
| 12 | Resultado bom | Abaixo da ao12 atual; no máximo 1 a cada 3 solves | Olhos sorrindo (pálpebra inferior sobe) | 3 adesivos verdes | 1 s | Troca sem interpolar |
| 13 | PB de single | Melhor single válido do evento | "^ ^" e um pulinho (squash & stretch) | Face resolvida: os adesivos acendem em sequência nas 6 cores, no máximo 3 trocas por segundo | 2 a 2,5 s | Expressão feliz e anel multicolor estático por 2 s |
| 14 | PB de média | Recorde de ao5, ao12 ou ao100 | Como o 13, mais longo nas médias longas | Como o 13, mais um giro da camada U (opcional) | 2,5 s | Como o 13 |
| 15 | Marco | Primeiro sub-60/30/20/10, 100º ou 1.000º solve | Celebração única; mostra o desbloqueio, se houver | Como o 13 | 2,5 s | Como o 13 |
| 16 | +2 | Penalidade de +2 | "Ops": olhar de lado, careta curta | 1 adesivo amarelo | 0,8 s | Troca instantânea |
| 17 | DNF | Solve marcado como DNF | "x x" ou pálpebras caídas, depois volta ao neutro; sem lágrimas | 2 adesivos vermelhos | 1 s | Troca instantânea |
| 18 | Consistência | Solve dentro de ±5% da ao12 (configurável) | Sem reação própria; só o anel muda | Acende 1 adesivo a mais por solve consistente seguido; ao completar 8, uma "dancinha" | 1,5 s (ao completar) | Anel cheio, estático |
| 19 | Meta diária | Atingiu a meta do dia (por exemplo, 50 solves) | Contente | Anel cheio, branco brilhante | 1,5 s, uma vez por dia | Estático |

**Fora do ciclo**

| # | Estado | Gatilho | Olhos (centro) | Anel | Duração | Movimento reduzido |
|---|---|---|---|---|---|---|
| 20 | Sonolento | 3 min sem interação | Piscadas lentas, pálpebras a meio mastro | 2 adesivos fracos | Contínuo | Pose sonolenta fixa |
| 21 | Dormindo | 10 min sem interação | Olhos fechados, respiração lenta; o anel se "embaralha" devagar, como o Pong do Cozmo [11] | Azul, brilho mínimo | Contínuo (pausável) | Olhos fechados, estático |
| 22 | Boas-vindas | Volta depois do sono, ou depois de dias sem abrir o app | Abre os olhos com um "oi" alegre, nunca um "sumiu, hein?" | O anel "se resolve" | 1 s | Troca instantânea |
| 23 | Precisa de você | Backup antigo, armazenamento quase cheio, atualização pronta | Olha para o elemento da interface em questão | 1 adesivo azul fixo | Até resolver ou dispensar | Igual |
| 24 | Erro técnico | Falha ao salvar ou importar | O rosto se "desmonta" por um instante, como no Notion AI, e volta [35] | Vermelho | 0,8 s | Troca instantânea |

### 3.4 Regras de arbitragem

1. **Interrupção total.** Começar a segurar cancela qualquer reação no mesmo quadro e leva direto ao estado "segurando". É o equivalente ao reinício instantâneo do Monkeytype (ver Pesquisa 1).
2. **Uma reação por solve**, nesta ordem de prioridade: marco, PB de média, PB de single, DNF, +2, consistência completa, meta, resultado bom, resultado normal. As demais só atualizam o anel em silêncio.
3. **O número vem primeiro.** A reação começa 400 a 600 ms depois que o tempo aparece.
4. **Teto de duração de 2,5 s** para qualquer reação, abaixo dos 5 s da WCAG 2.2.2 [78].
5. **Contra a inflação de elogio:** "resultado bom" no máximo 1 vez a cada 3 solves, e nenhuma reação ao pior tempo da sessão.
6. **Estados fora do ciclo** (23 e 24) nunca aparecem durante segurar, inspeção ou solve; esperam o ócio.
7. **Modo sério ou de competição:** companion estático ou oculto, sem reações.
8. **Tudo é calculado localmente**, com os mesmos números que o usuário vê na tela.

### 3.5 Regra dura: o solve

- A pose de foco se completa durante "segurando/pronto". Quando o solve começa, só o anel apaga (troca instantânea); depois disso o loop de animação é cancelado e nada mais se move.
- Durante o solve não há som, vibração, toast nem mudança de layout.
- **Desempenho:** o companion não pode disputar a thread principal com o timer.
  - Vale medir o tempo com o `event.timeStamp` dos eventos de tecla e toque, que marca quando o evento foi criado, na mesma origem do `performance.now()`. Isso reduz o efeito de qualquer atraso de processamento [82].
  - O arredondamento de precisão varia por navegador, de 0,1 ms a 1 ms [82].
- Ao parar, o tempo aparece na hora e a reação vem depois.
- O companion também pausa quando a aba fica oculta.

### 3.6 Personalidade proposta

- **Arquétipo:** um "torcedor calmo", como um colega de treino que é nerd de cubo. É tranquilo sob pressão, curioso (olha os scrambles), comemora junto e nunca debocha.
- **Sem fala por padrão**, como o Cozmo, que quase não fala [8]. Se houver texto, no máximo 4 palavras, em português e sem culpa.
- **Nomes provisórios:**
  - "Miolo", que é o núcleo que segura as peças do cubo e também o "cérebro" na gíria;
  - "Centrinho";
  - "Kubi".

---

## 4. Conceitos com tema de cubo

### 4.1 (a) "Quina": um cubie com rosto

- **Como é:**
  - uma peça de canto, com os cantos arredondados dos speedcubes atuais;
  - os olhos ficam no adesivo da frente, e os outros dois adesivos visíveis mostram a cor do estado;
  - gira 90° para "trocar de humor", dá pulinhos (squash & stretch) e se inclina para olhar o scramble.
- **Prós:**
  - é o mais barato e o mais legível: funciona a 48 px;
  - usa o mesmo motor de expressões do Centro, bastando trocar a geometria;
  - tem a expressividade completa das pálpebras;
  - é fácil de testar.
- **Contras:**
  - é a ideia mais óbvia: "cubo com cara" já existe aos montes (Qbby, Companion Cube) [43][44];
  - não carrega informação sobre o cubo nem sobre o treino;
  - corre risco de ficar fofo demais.
- **Tecnologia:** Canvas 2D com a projeção que já existe, ou até CSS 3D (são só 6 faces).
- **Veredito:** ótimo plano B, ou "modo mínimo".

### 4.2 (b) "Espelho": um mini-cubo com o scramble real que se resolve sozinho

- **Como é:** um cubo 3D pequeno mostra o estado exato depois do scramble atual. Quando o solve termina, ele se resolve em 1 a 2 s; no PB, resolve e dá uma pirueta.
- **Implementação:** o cubing.js já faz quase tudo.
  - O `<twisty-player>` aceita `experimentalSetupAlg` e `experimentalSetupAnchor`. Com a âncora em "end", a sequência termina no estado resolvido, então basta usar o inverso do scramble como alg.
  - Também aceita `tempoScale`, `play()` e `jumpToEnd()`, oferece as visualizações 2D, Cube3D e PG3D e cobre todos os eventos WCA [70][71][74].
  - O código 3D é carregado sob demanda e depende de three.js [72][73].
  - Alternativa leve: um renderizador próprio de 3×3 em Canvas 2D, com 54 adesivos, aplicando os movimentos do scramble.
- **Prós:**
  - tem utilidade real, porque permite conferir se o scramble foi aplicado certo (muitos timers mostram uma imagem do scramble);
  - é 100% cubo;
  - ver o cubo se resolver sozinho é satisfatório.
- **Contras:**
  - não é um personagem: sem olhos, o leque emocional é pobre;
  - a solução animada é o inverso do scramble, não a do usuário, e cubers podem achar isso falso;
  - repetida depois de todo solve, vira ruído;
  - puxa WebGL e three.js (por volta de 120 a 150 KB gzip) só para isso [67];
  - a licença do cubing.js é MPL, com o código original em dupla licença GPL/MPL: usar como biblioteca não obriga a publicar o app, mas modificações na biblioteca precisam ser publicadas [73];
  - durante a inspeção, convida o usuário a olhar a tela em vez do cubo.
- **Veredito:** excelente como painel de prévia do scramble, carregado sob demanda; fraco como companion.

### 4.3 (c) "Painel": um rosto dot-matrix feito de adesivos

- **Como é:** a face do cubo vira uma matriz de pontos, e os adesivos acendem e apagam para formar expressões. Referências:
  - os rostos prontos do micro:bit, numa grade 5×5: feliz, triste, bravo, dormindo, surpreso, confuso [55];
  - a Glyph Matrix do Nothing Phone (3), com 489 LEDs [56];
  - o LCD do Tamagotchi.
- **Resolução:**
  - um 3×3 dá 9 "pixels", o suficiente só para emoticons muito icônicos (olhos nos cantos de cima, boca na linha de baixo);
  - um 5×5 já comporta o vocabulário do micro:bit, mas deixa de ser o 3×3 icônico.
- **Prós:**
  - original e muito "cubo";
  - trocar adesivos é mudança de cor e opacidade, que a WCAG 2.3.3 não considera movimento, então continua expressivo com movimento reduzido [79];
  - é barato (dá para fazer até em SVG ou CSS grid) e tem uma estética pixel charmosa.
- **Contras:**
  - a expressão fica digital e "em degraus", sem a suavidade das pálpebras interpoladas;
  - num 3×3 a nuance é mínima;
  - pode parecer um display de emoji em vez de uma criatura.
- **Veredito:** ótimo como linguagem secundária, que é exatamente o papel do anel no conceito Centro.

### 4.4 (d) "Coleção": um companion que evolui com a prática

- **Como é:** uma camada de progressão que vale para qualquer conceito.
  - **O que desbloqueia:** acabamentos de adesivo (fosco, brilhante, carbono, stickerless, half-bright), esquemas de cor, mods visuais (cubo espelho, ghost) e pequenos acessórios.
  - **Como desbloqueia:** marcos reais, já celebrados na cultura do cubo: primeiros sub-60/30/20/10 por evento; 100, 1.000 e 10.000 solves; primeira ao100; PB de média.
- **Referências:**
  - Finch, que cresce com o autocuidado e não pune [17];
  - Bongo Cat, com chapéus aleatórios [39];
  - Focus Friend, cujas meias viram decoração [22];
  - Habitica, com a coleção de pets [26].
- **Regras contra a ansiedade:** nada expira, nada se perde, não há item por tempo limitado, nem streak que zera, nem moeda paga.
- **Prós:**
  - motivação de longo prazo;
  - registra a jornada do cuber.
- **Contras:**
  - custo de arte;
  - risco de premiar volume em vez de prática deliberada;
  - o escopo cresce fácil.
- **Veredito:** fase 2, em versão mínima (6 a 10 marcos), depois que o companion básico provar que agrada.

### 4.5 (e) "Centro": olhos no centro e anel de 8 adesivos (recomendado)

- **Forma:** um cubinho 3×3 em vista 3/4, desenhado com a projeção própria e com cantos arredondados. A face da frente é o rosto.
- **O centro é a cabeça.** No cubo real, o centro nunca sai do lugar e define a cor da face: é a identidade dela. Ali ficam os dois olhos com pálpebras, no modelo paramétrico do Cozmo [10]. A boca paramétrica pode existir, mas fica em segundo plano.
- **O anel é o estado.**
  - Os 8 adesivos ao redor (4 meios e 4 quinas) formam um anel dot-matrix.
  - A cor diz o estado, com a paleta do próprio cubo.
  - A quantidade e a posição dos adesivos acesos dizem o dado. A informação nunca depende só da cor [81].
- **Gestos de cubo:**
  - no PB de média, a camada de cima dá um giro (U) e volta;
  - dormindo, o anel se embaralha devagar, como o Pong do Cozmo [11];
  - ao acordar, o anel "se resolve".
- **Prós:**
  - metáfora forte e verdadeira: o centro é a âncora e o anel são as peças que mudam;
  - junta a expressão contínua dos olhos com a informação discreta do anel;
  - com movimento reduzido continua útil: olhos estáticos e anel mudando só de cor;
  - é legível em tamanho pequeno;
  - reaproveita o motor existente;
  - não encontrei timer com nada parecido.
- **Contras:**
  - são duas linguagens visuais para equilibrar;
  - o anel precisa de uma gramática clara para não virar "luzinha piscando";
  - exige teste de legibilidade entre 48 e 80 px.
- **Tamanho e posição:**
  - no celular, 56 a 72 px no topo, perto do scramble;
  - no desktop, 96 a 128 px;
  - nunca por cima dos dígitos do timer.

### 4.6 Variações avaliadas rapidamente

- **"Rolador" (inspirado no oneko):** o cubie rola pela borda da tela entre solves e dorme num canto [37]. É fofo, mas é um movimento lateral grande, que distrai e briga com o layout do celular. No máximo, um easter egg.
- **"Torre de solves" (inspirada no Forest):** cada solve vira um cubie empilhado, o PB vira um cubie dourado e a sessão vira uma escultura para compartilhar [20]. Não é um personagem, mas é uma boa visualização para a tela de estatísticas.
- **Dígitos com olhos:** rejeitado. O número do tempo é sagrado.
- **Cubo com corações (homenagem ao Companion Cube):** easter egg [43].

### 4.7 Matriz comparativa

Notas de 1 a 5, sendo 5 o melhor. Em "baixa distração" e "baixo custo", 5 significa menos distração e menos custo. As notas são o meu julgamento, não uma medição.

| Critério | Quina | Espelho | Painel | **Centro** | Rolador | Torre |
|---|---|---|---|---|---|---|
| Originalidade | 2 | 3 | 4 | **5** | 2 | 3 |
| Legibilidade (48–80 px) | 5 | 3 | 3 | **4** | 4 | 2 |
| Expressividade | 4 | 1 | 2 | **4** | 3 | 1 |
| Utilidade informativa | 1 | 4 | 3 | **4** | 1 | 4 |
| Baixa distração | 4 | 2 | 4 | **4** | 1 | 5 |
| Baixo custo técnico | 5 | 2 | 5 | **4** | 4 | 3 |
| Encaixe no motor existente | 5 | 2 | 3 | **5** | 4 | 2 |
| Funciona com movimento reduzido | 3 | 2 | 5 | **5** | 1 | 4 |
| **Total (de 40)** | 29 | 19 | 29 | **35** | 20 | 24 |

A "Coleção" (d) não entra na nota porque é uma camada que se aplica a qualquer conceito.

---

## 5. Tecnologia

### 5.1 Requisitos

- **Offline-first.** Tudo precisa caber no cache do service worker, sem CDN em tempo de execução. Três armadilhas:
  - o Rive busca o WASM no unpkg por padrão [59];
  - o dotLottie busca o seu num CDN [64];
  - o Spline só oferece exportação self-hosted no plano Enterprise [69].
- **Celular.** Fluidez num aparelho médio e pouco consumo de bateria.
- **Controle por estado.** Parâmetros contínuos (pálpebras, olhar), transições e misturas entre expressões.
- **Acessibilidade.** Respeitar o movimento reduzido, oferecer pausar e ocultar e repetir a informação em texto.
- **Não interferir no timer.** Render leve, congelado durante o solve.

### 5.2 Comparação

| Opção | Peso aproximado | Celular | Offline | Controle por estados e parâmetros | Acessibilidade / movimento reduzido | Custo e licença | Veredito |
|---|---|---|---|---|---|---|---|
| **CSS 3D transforms** | ~0 KB (nativo) | Bom com poucos elementos, como um cubie de 6 faces. Há relatos antigos (2012, 2016) de flicker e ordem de profundidade errada com muitos elementos ou faces encostadas [75][76] | Nativo | Você implementa (variáveis CSS + TypeScript) | `prefers-reduced-motion` direto no CSS; fica no DOM | Grátis | Bom para o Quina e o Painel; ruim para girar camadas |
| **Canvas 2D + projeção própria** | Poucos KB (só o seu código) | Ótimo com dezenas de polígonos por quadro; pode ir para um worker com OffscreenCanvas [83] | Nativo | Controle total: tabela de expressões + interpolação, como no Cozmo [10] | Você controla; o canvas é imagem, então leva `aria-hidden` e a informação vai em texto | Grátis | **Recomendado** |
| **three.js / React Three Fiber** | three: cerca de 118 a 150 KB gzip (uma cena pequena no r180/r181 ficou em 118–125 KB); R3F: mais ~50 KB gzip [67][68] | Bom, mas WebGL gasta mais bateria e há limite de contextos por página | Bundle local resolve | Você implementa | Você controla | MIT | Exagero para um mascote |
| **Rive** | WASM de 222 KB (canvas-lite), 567 KB (canvas) ou 648 KB (webgl2), em brotli [57] | Muito bom; usado por Duolingo e Notion [1][35]. O canvas-lite deixa de fora texto, layout, áudio e scripting; o webgl2 tem a maior fidelidade, mas está sujeito ao limite de contextos WebGL [58] | Por padrão busca o WASM no unpkg; é preciso hospedá-lo com o app e manter a versão alinhada [59] | Excelente: estados, blend 1D e aditivo, camadas, data binding [62][63] | Movimento reduzido via propriedade do arquivo; mesma estratégia de texto | Editor grátis; exportar .riv para produção exige plano pago desde 20/10/2025 (Cadet: US$ 9/mês no anual ou US$ 17 no mensal); runtimes MIT [60][61] | A melhor opção se houver animador |
| **Lottie (lottie-web)** | ~75 KB gzip (v5.13) [66] | Ok | Ok | Fraco: trabalha com clipes e segmentos, e parâmetros contínuos ou misturas exigem pré-animar cada transição | Manual | MIT | Só para uma ou duas celebrações pré-renderizadas |
| **dotLottie** | WASM de ~500 KB comprimido, um binário por renderizador [64] | Bom | CDN por padrão; é preciso self-host | Tem máquina de estados com inputs e guards [65] | Manual | MIT | Pesado para o que entrega aqui |
| **Spline** | Não encontrei tamanho oficial publicado | Variável | Self-hosted (offline) só no plano Enterprise [69] | Eventos no editor | Difícil | Pago | Descartado |
| **cubing.js `<twisty-player>`** | 3D carregado sob demanda; depende de three.js [72][73] | Ok | Bundle local; precisa ser servido por http(s) ou localhost [74] | `play`, `pause`, `jumpToEnd`, `tempoScale`, setup [71] | Tem visualização 2D [70] | MPL (original em dupla licença GPL/MPL) [73] | Ótimo para a prévia do scramble, sob demanda |

Se quiser um motor de interpolação pronto, o GSAP é gratuito, plugins incluídos, desde abril de 2025 [84]. Para meia dúzia de parâmetros, porém, umas dez linhas de amortecimento exponencial resolvem.

### 5.3 Recomendação e arquitetura

**Canvas 2D com projeção própria, sem dependências.** Os motivos:
- o motor já existe e foi validado;
- é a mesma arquitetura de rosto procedural do Cozmo [10];
- tem custo de bundle quase zero e funciona offline sem esforço;
- dá controle fino sobre o congelamento durante o solve.

Mantenha a **lógica separada da renderização**: uma máquina de estados pura, testável com testes unitários, alimenta um "view" de Canvas. Assim, se um dia entrar um animador, o view pode ser trocado por Rive sem tocar nas regras.

Esboço (TypeScript):

```ts
// Uma linha por expressão, como no rosto procedural do Cozmo.
interface Face {
  open: number;   // 0 = fechado … 1 = aberto
  tilt: number;   // inclinação da pálpebra superior (-1 bravo … 1 preocupado)
  smile: number;  // pálpebra inferior subindo (1 = olhos "^ ^")
  lookX: number;  // -1 … 1
  lookY: number;  // -1 … 1 (positivo = olhando para baixo, para o cubo)
  squash: number; // 0.9 … 1.1 (corpo)
}

const FACES = {
  neutro:     { open: .85, tilt: 0,   smile: 0,  lookX: 0,  lookY: 0,   squash: 1 },
  foco:       { open: .35, tilt: .15, smile: 0,  lookX: 0,  lookY: .35, squash: .98 },
  atento:     { open: .95, tilt: 0,   smile: 0,  lookX: 0,  lookY: .3,  squash: 1 },
  contente:   { open: .7,  tilt: 0,   smile: .6, lookX: 0,  lookY: 0,   squash: 1.02 },
  euforico:   { open: .6,  tilt: 0,   smile: 1,  lookX: 0,  lookY: -.2, squash: 1.06 },
  ops:        { open: .8,  tilt: .3,  smile: 0,  lookX: .5, lookY: 0,   squash: 1 },
  desanimado: { open: .5,  tilt: .5,  smile: 0,  lookX: 0,  lookY: .5,  squash: .97 },
  sonolento:  { open: .3,  tilt: .2,  smile: 0,  lookX: 0,  lookY: .2,  squash: 1 },
  dormindo:   { open: 0,   tilt: 0,   smile: 0,  lookX: 0,  lookY: .2,  squash: 1 },
} satisfies Record<string, Face>;

// Interpolação independente da taxa de quadros (amortecimento exponencial).
function approach(cur: Face, target: Face, dt: number, k = 12): Face {
  const a = 1 - Math.exp(-k * dt);
  const out = { ...cur };
  for (const key of Object.keys(cur) as (keyof Face)[]) {
    out[key] = cur[key] + (target[key] - cur[key]) * a;
  }
  return out;
}

// Integração com o timer: o companion só reage.
timer.on('hold-start', () => companion.cancelReaction().set('foco'));  // tudo é interrompível
timer.on('solve-start', () => companion.freeze());                     // desenha 1 quadro e cancela o rAF
timer.on('solve-stop', (r) => {
  setTimeout(() => companion.react(classify(r)), 500);                 // o número aparece primeiro
});
```

Detalhes que fazem diferença:
- **Piscada:**
  - intervalo sorteado entre 2 e 7 s; cerca de 10% das vezes, uma piscada dupla desenhada à mão;
  - duração por volta de 150 a 300 ms, fechando mais rápido do que abre, com a pálpebra superior fazendo quase todo o movimento [49][50][51].
- **Olhadinhas (eye darts):** saltam em 1 ou 2 quadros, sem deslizar [50][51].
- **Movimento reduzido:** troca instantânea para a expressão-alvo, sem piscar e sem idle.
- **Renderização sob demanda:** fora das reações, não rode `requestAnimationFrame` sem parar. Agende a próxima piscada com `setTimeout` e só anime durante a transição.

### 5.4 Checklist de acessibilidade

- O canvas leva `aria-hidden="true"`. Toda informação que ele carrega (PB, +2, DNF, avisos de 8/12 s) já precisa existir em texto ou som no próprio timer.
- Nada informado só por cor: o anel também muda de padrão (quantos adesivos acendem e onde) [81].
- Nenhum flash acima de 3 vezes por segundo, nem na celebração [80].
- Um idle contínuo que roda ao lado de outro conteúdo por mais de 5 s exige um controle para pausar, parar ou ocultar [78]. Isso pede um ajuste de "Companion: animado / estático / oculto", que fica salvo.
- Com `prefers-reduced-motion: reduce`, o companion fica estático e só faz trocas instantâneas de cor e expressão. A WCAG 2.3.3 trata movimento como algo que dá ilusão de deslocamento; mudança de cor ou opacidade não conta [77][79].
- Contraste dos olhos sobre o adesivo de pelo menos 3:1 (componentes gráficos) [85], conferido também no modo escuro.

### 5.5 Desempenho e bateria

- Renderize só quando algo mudar; no idle, nada de loop contínuo.
- Pause quando `document.hidden` for verdadeiro, durante o solve e quando o companion sair da tela (IntersectionObserver).
- Limite a resolução do canvas a 2× a densidade de pixels. Evite blur e sombra calculados a cada quadro; pré-renderize gradientes.
- Mantenha a cena em menos de ~60 polígonos. Num cubo 3×3 em vista 3/4, isso significa desenhar só as faces visíveis, em ordem de profundidade.

---

## 6. Próximos passos e perguntas em aberto

### 6.1 Próximos passos

1. **Protótipo do Centro (1 a 2 dias):**
   - 9 expressões e o anel;
   - a máquina de estados pura, com testes de transição e de prioridade.
2. **Teste visual:** a 48, 64 e 96 px, nos temas claro e escuro, e com movimento reduzido ligado.
3. **Teste com 3 a 5 cubers numa sessão de 50 solves.** Perguntas:
   - Distraiu?
   - Percebeu os avisos de 8 e 12 s?
   - O PB pareceu especial?
   - Você desligaria?

   E medir, localmente, quantos ocultam o companion.
4. **Ajustar** atrasos e durações a partir do teste.
5. **Próximas fases:**
   - fase 2: a Coleção, em versão mínima;
   - fase 3: a prévia de scramble com cubing.js, carregado sob demanda e num painel separado.

### 6.2 Perguntas em aberto

- **Tom:** fofo, na linha do Finch, ou "nerd competitivo"?
- **Som:** nenhum (sugestão) ou só no PB, desligado por padrão?
- **Inspeção:** o anel faz contagem contínua ou muda só aos 8, 12 e 15 s?
- **Modo competição:** o companion fica oculto por padrão?
- **Nome:** "Miolo", "Centrinho", "Kubi" ou outro?

### 6.3 Método e limites

- Só fontes públicas.
- Parte do material sobre Cozmo, EMO, Finch e Forest vem de imprensa, críticas e marketing.
- Os tamanhos de bundle variam com a versão e com o método (gzip ou brotli).
- Nada foi medido em aparelho.
- As notas da matriz são julgamento meu.

---

## 7. Fontes

**Duolingo**
1. Duolingo Blog — Art meets technology: the next step in bringing our characters to life (10/11/2022). https://blog.duolingo.com/world-character-visemes
2. Rive Blog — Duolingo's AI-powered Video Call brings Lily to life (20/03/2025). https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life
3. Duolingo Blog — You're on fire! Or, how we brought the streak milestone to life (21/01/2022). https://blog.duolingo.com/streak-milestone-design-animation
4. Duolingo Blog — Shape language: Duolingo's art style (02/07/2020). https://blog.duolingo.com/shape-language-duolingos-art-style/
5. SBC/IHC 2025 — Teaching or Manipulating? On the Adoption of Bright and Deceptive Patterns by Duolingo. https://sol.sbc.org.br/index.php/ihc/article/view/37677
6. arXiv 2203.16175 — When Gamification Spoils Your Learning (2022). https://arxiv.org/abs/2203.16175
7. Screenwise — Managing Duolingo streaks when gamification becomes stressful. https://screenwiseapp.com/guides/managing-duolingo-streaks-when-gamification-becomes-stressful

**Robôs e expressão**

8. The Robot Report — Cozmo AI robot brings Wall-E to life (27/06/2016). https://www.therobotreport.com/cozmo-ai-robot-brings-wall-e-to-life/
9. Core77 — What's the one design element that can make a robot lovable. https://www.core77.com/posts/54328/Whats-the-One-Design-Element-That-Can-Make-a-Robot-Lovable
10. pycozmo — procedural_face.py (43 parâmetros, interpolação linear). https://github.com/zayfod/pycozmo/blob/master/pycozmo/procedural_face.py
11. designboom — Anki Cozmo (07/07/2016). https://www.designboom.com/technology/anki-cozmo-07-07-2016/
12. Wikipedia — Cozmo. https://en.wikipedia.org/wiki/Cozmo
13. Design News — From Cozmo to Vector: how Anki designs robots with emotional intelligence. https://www.designnews.com/testing-measurement/from-cozmo-to-vector-how-anki-designs-robots-with-emotional-intelligence
14. Keyi Robot — EMO cute robot pet review (blog de um concorrente; ler com ressalva). https://keyirobot.com/blogs/buying-guide/emo-cute-robot-pet-review-is-livingais-emotional-robot-worth-it
15. Takayama, Dooley e Ju — Expressing Thought: Improving Robot Readability with Animation Principles (HRI 2011). https://www.wendyju.com/publications/151r-takayama.pdf
16. Fraunhofer IAO — Padrão "Lively" (vivacidade em robôs). https://pattern-wiki.iao.fraunhofer.de/pattern-infos/lively/

**Hábitos, foco e pets virtuais**

17. Screenwise — Finch: the anti-productivity productivity app. https://screenwiseapp.com/media/finch-app
18. Pratt IxD — Design critique: Finch (09/2025). https://ixd.prattsi.org/2025/09/design-critique-finch-ios-app-2/
19. WhistleOut — Finch self-care app review. https://www.whistleout.com/CellPhones/Apps/finch-self-care-app-review
20. Yu-kai Chou — Mini case study of Forest. https://yukaichou.com/gamification-examples/mini-case-study-of-forest/
21. Boxes and Arrows — How to use gamification in mobile apps: a case study. https://boxesandarrows.com/how-to-use-gamification-in-mobile-apps-a-case-study
22. NBC News — Hank Green's Focus Friend app. https://www.nbcnews.com/tech/tech-news/hank-green-focus-friend-app-rcna225967
23. App Store — Focus Friend, by Hank Green. https://apps.apple.com/US/app/id6742278016
24. Wikipedia — Tamagotchi effect. https://en.wikipedia.org/wiki/Tamagotchi_effect
25. Vice — Why we were addicted to our Tamagotchis. https://vice.com/en/article/in-praise-of-tamagotchi-683
26. Habitica Wiki — Death. https://habitica.fandom.com/wiki/Death
27. Habitica Wiki — Rest in the Inn. https://habitica.fandom.com/wiki/Rest_in_the_Inn

**Assistentes e personagens de software**

28. The New Stack — Humanity vs. Clippy: lessons from Microsoft's failed virtual assistant. https://thenewstack.io/humanity-vs-clippy-lessons-from-microsofts-failed-virtual-assistant/
29. SAS Blogs — What can we learn from Clippy about AI? (29/05/2019). https://blogs.sas.com/content/sgf/2019/05/29/what-can-we-learn-from-clippy-about-ai/
30. CIO NZ — What went wrong with Clippy. https://www2.cio.co.nz/article/662045/what-went-wrong-clippy-virtual-assistant-pioneer-people-loved-hate/
31. AlternativeTo — Microsoft introduces its first Copilot Appearance avatar (07/2025). https://alternativeto.net/news/2025/7/microsoft-introduces-its-first-copilot-appearance-avatar-with-real-time-animated-reactions
32. The Register — Microsoft Copilot avatars (30/09/2025). https://www.theregister.com/2025/09/30/microsoft_copilot_avatars/
33. TechCrunch — Microsoft's Mico is a "Clippy" for the AI era (23/10/2025). https://techcrunch.com/2025/10/23/microsofts-mico-is-a-clippy-for-the-ai-era
34. Psyop — Microsoft AI: Mico. https://psyop.com/work/microsoft-ai-mico
35. BUCK — Notion AI Assistant. https://buck.co/work/notion-ai
36. Notion — The design thinking behind Notion AI. https://www.notion.com/blog/the-design-thinking-behind-notion-ai

**Pets de tela e jogos**

37. Wikipedia — Neko (software). https://en.wikipedia.org/wiki/Neko_(software)
38. oneko.js (adryd325). https://github.com/adryd325/oneko.js
39. SteamPulse — Bongo Cat. https://www.steampulse.org/game/3419430
40. Automaton — Bongo Cat (27/06/2025). https://automaton-media.com/articles/newsjp/bongo-cat-20250627-346431/
41. itch.io — Desktop Goose. https://samperson.itch.io/desktop-goose
42. Google Blog — As the Chrome dino runs, we caught up with the Googlers who built it (2018). https://blog.google/products/chrome/chrome-dino/
43. Wikipedia — Weighted Companion Cube. https://en.wikipedia.org/wiki/Weighted_Companion_Cube
44. Engadget — The Nintendo studio behind Kirby talks its new game BoxBoy! (05/05/2015). https://www.engadget.com/2015-05-05-hal-laboratory-boxboy-interview.html
45. GoNintendo — HAL shares the entire design process behind the original BoxBoy. https://gonintendo.com/stories/334287-hal-shares-the-entire-design-process-behind-the-original-boxboy

**Percepção, animação e UX**

46. Glocker et al. (2009) — Baby schema in infant faces induces cuteness perception and motivation for caretaking in adults (Ethology). https://pmc.ncbi.nlm.nih.gov/articles/PMC3260535/
47. Abrams e Christ (2003) — Motion onset captures attention (Psychological Science). https://pubmed.ncbi.nlm.nih.gov/12930472/
48. UX Magazine / NN/g — The 4 degrees of anthropomorphism of generative AI (2023). https://uxmag.com/articles/the-4-degrees-of-anthropomorphism-of-generative-ai
49. Animation Mentor — Tutorial: animate blinks and eye movement. https://www.animationmentor.com/blog/tutorial-animate-blinks-eye-movement/
50. AnimSchool — Breathing life into idle animations (14/06/2024). https://blog.animschool.edu/2024/06/14/breathing-life-into-idle-animations
51. Bloop Animation — How to animate blinks and eye movement. https://www.bloopanimation.com/blinking-animation/

**Cubo e displays de pontos**

52. WCA — Regulations (inspeção A3/A4; penalidades 10e). https://www.worldcubeassociation.org/regulations/
53. csTimer. https://cstimer.net/
54. App Store — SubX Timer (confete no PB). https://apps.apple.com/lk/app/subx-timer/id6479374382
55. BBC micro:bit MicroPython — Images (rostos 5×5). https://bbcmicrobitmicropython.readthedocs.io/en/stable/tutorials/images.html
56. GSMArena — Nothing Phone (3) brings Glyph Matrix (07/2025). https://www.gsmarena.com/nothing_phone_3_brings_glyph_matrix_snapdragon_8s_gen_4_and_5150mah_battery-news-68450.php

**Tecnologia**

57. Rive — Runtime sizes. https://rive.app/docs/runtimes/runtime-sizes
58. Rive — Canvas vs WebGL. https://rive.app/docs/runtimes/web/canvas-vs-webgl
59. Rive — Preloading WASM (self-hosting). https://rive.app/docs/runtimes/web/preloading-wasm
60. Rive — Rive's new $9/mo plan (20/10/2025). https://rive.app/blog/rive-s-new-9-mo-plan
61. Rive — Pricing. https://rive.app/docs/account-admin/pricing
62. Rive — State machine states (blend 1D e aditivo). https://rive.app/docs/editor/state-machine/states
63. Rive — Data binding migration guide. https://rive.app/docs/editor/data-binding/migration-guide
64. LottieFiles — How the web player works (WASM de ~500 KB). https://docs.lottiefiles.com/en/runtimes/distributions/js/v0.x/core-concepts
65. LottieFiles — dotLottie state machines. https://docs.lottiefiles.com/en/format/dotlottie/interactivity/state-machines
66. DepScope — lottie-web. https://depscope.dev/pkg/npm/lottie-web
67. three.js forum — 8kb gzipped size increase in 0.181.0. https://discourse.threejs.org/t/8kb-gzipped-size-increase-in-0-181-0-recommendation-on-tooling-to-analyze-package-size/87880
68. DepScope — @react-three/fiber. https://mcp.depscope.dev/pkg/npm/@react-three/fiber
69. Spline — Exporting as self-hosted project (Enterprise). https://docs.spline.design/exporting-your-scene/web/exporting-as-self-hosted-project
70. cubing.js — twisty. https://js.cubing.net/cubing/twisty
71. cubing.js — TwistyPlayer.ts (atributos e métodos). https://github.com/cubing/cubing.js/blob/main/src/cubing/twisty/views/TwistyPlayer.ts
72. cubing.js — heavy-code-imports/3d.ts (3D carregado sob demanda). https://github.com/cubing/cubing.js/blob/main/src/cubing/twisty/heavy-code-imports/3d.ts
73. cubing.js — README (licença, dependências, ES2022). https://unpkg.com/cubing@0.56.0/README.md
74. cubing.js — scramble. https://js.cubing.net/cubing/scramble
75. Keith Clark — The state of CSS 3D transforms (2012). https://keithclark.co.uk/articles/the-state-of-css-3d-transforms/
76. Independent Software — Firefox 3D CSS limitations (2016). https://www.independent-software.com/firefox-3d-css-limitations-maximum-element-count-and-close-positioning.html
77. MDN — prefers-reduced-motion. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
78. W3C — Understanding SC 2.2.2 Pause, Stop, Hide. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
79. W3C — Understanding SC 2.3.3 Animation from Interactions. https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
80. W3C — Understanding SC 2.3.1 Three Flashes or Below Threshold. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
81. W3C — Understanding SC 1.4.1 Use of Color. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
82. MDN — Event.timeStamp. https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
83. MDN — OffscreenCanvas. https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
84. Webflow — Webflow makes GSAP 100% free (30/04/2025). https://webflow.com/blog/gsap-becomes-free
85. W3C — Understanding SC 1.4.11 Non-text Contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
