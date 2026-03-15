# PRD: Redesign Mobile-First do Klick

Data: 2026-03-15  
Status: Proposta  
Escopo: Redesign visual e de experiencia do usuario em todas as telas do produto  
Referencia visual: [Notion](https://www.notion.com/) e [Linear](https://linear.app/)

## 1. Resumo Executivo

O Klick evoluiu bem em funcionalidade, mas a experiencia atual ainda parece fragmentada: existem muitos tratamentos visuais competindo entre si, a hierarquia mobile nao prioriza o loop principal do timer e varias telas secundarias seguem padroes diferentes de densidade, navegacao e feedback.

Este PRD define um redesign completo, mobile-first, inspirado na clareza estrutural do Notion e na precisao visual do Linear. O objetivo nao e copiar interfaces, e sim traduzir os principios mais fortes dessas referencias para um produto de speedcubing:

- Notion: estrutura calma, blocos claros, boa legibilidade, foco em conteudo e baixa friccao.
- Linear: densidade controlada, hierarquia objetiva, estados refinados, motion sutil e sensacao de produto premium.

Inferencia: os principios acima foram derivados das homepages publicas de Notion e Linear consultadas em 2026-03-15.

## 2. Contexto e Diagnostico

### Problemas observados na interface atual

- A linguagem visual esta inconsistente entre telas. O produto mistura glassmorphism, gradientes fortes, glow, cards muito parecidos e layouts com densidade diferente.
- A home, que deveria ser o fluxo mais importante, ainda abre com um bloco mais promocional do que operacional. Em mobile, isso empurra o timer e as acoes principais para baixo.
- A navegacao mobile depende de drawer com muitos itens e pouca priorizacao. Para um app de uso recorrente, isso aumenta esforco e reduz velocidade.
- Tabelas, listas e graficos ainda nao seguem uma estrategia mobile-first unica. Em algumas telas a leitura fica correta, em outras a densidade e a escaneabilidade nao acompanham.
- Estados vazios, loading, erro e sucesso existem, mas nao seguem um sistema consistente de feedback visual e textual.
- Telas especiais como `cube-3d`, `share` e `auth/callback` parecem pertencer a subprodutos diferentes, o que enfraquece a percepcao de qualidade do app como um sistema unico.

### Oportunidade

Criar uma experiencia mais madura, coerente e memoravel, onde:

- o timer vira o centro absoluto da experiencia;
- a navegacao mobile fica mais rapida e previsivel;
- as telas de analise, treino e social compartilham o mesmo sistema visual;
- o produto transmite precisao, calma e velocidade ao mesmo tempo.

## 3. Objetivo do Produto

Redesenhar o Klick para entregar uma experiencia visualmente premium, mais clara e mais rapida de usar, com prioridade total para mobile-first, sem perder profundidade funcional em desktop.

## 4. Objetivos e Nao Objetivos

### Objetivos

- Reestruturar todas as telas para um fluxo mobile-first real, e nao apenas responsivo.
- Unificar o design system do app com tokens, componentes e padroes reutilizaveis.
- Reorganizar a hierarquia da home para favorecer o loop inspeção -> solve -> revisar -> repetir.
- Melhorar navegacao, legibilidade, feedback e percepcao de qualidade.
- Reduzir ruido visual e elevar consistencia entre recursos core, analiticos, educativos e sociais.

### Nao objetivos

- Nao redesenhar a logica de negocio do timer, calculo de medias, sync, treino ou tutorial.
- Nao introduzir novas features grandes que mudem o escopo do produto.
- Nao transformar o produto em clone visual de Notion ou Linear.

## 5. Usuarios e Jobs To Be Done

### Segmentos principais

- Iniciante: quer entender o timer, acompanhar progresso e aprender sem intimidacao.
- Intermediario: quer registrar solves rapidamente, revisar medias e organizar sessoes.
- Usuario engajado: quer treino, historico, leaderboard, sharing e sync com baixo atrito.

### JTBD

- "Quero abrir o app e começar a cronometrar em segundos, sem pensar na interface."
- "Quero revisar meu desempenho sem sentir que estou entrando em uma area tecnica demais."
- "Quero treinar e aprender com uma interface que pareca guiada e clara."
- "Quero compartilhar meus resultados e competir com amigos em uma experiencia confiavel."

## 6. Principios de UX

- Core loop first: o solve precisa dominar a primeira dobra da home em mobile.
- Calm precision: menos efeitos decorativos, mais hierarquia, espacamento e contraste.
- One-hand mobile: acoes principais ao alcance do polegar, targets de toque grandes, navegacao previsivel.
- Progressive disclosure: mostrar o necessario primeiro; detalhes e profundidade entram depois.
- System over screen: o redesign deve nascer de fundamentos compartilhados, nao de telas isoladas.
- Data with warmth: estatisticas devem parecer acessiveis, nao frias ou intimidantes.
- Fast by feel: microinteracoes devem comunicar velocidade e confianca, sem excesso de animacao.

## 7. Traducao das Referencias Visuais

### O que absorver de Notion

- superficies limpas e sem ruido;
- blocos claramente agrupados;
- espacamento generoso;
- legibilidade superior a decoracao;
- sensacao de produto editorial e organizado.

### O que absorver de Linear

- nitidez nos estados ativos, hover e foco;
- layout enxuto com densidade controlada;
- motion curta, precisa e funcional;
- contraste forte entre informacao primaria e secundaria;
- sensacao de ferramenta premium e rapida.

### O que evitar

- excesso de glow, blur e gradientes em todos os containers;
- competicao entre varios acentos cromaticos ao mesmo tempo;
- headers grandes demais repetidos em todas as telas;
- muitos estilos de card para funcoes equivalentes;
- transicoes chamativas sem ganho funcional.

## 8. Direcao Visual Proposta

### Personalidade

- Serio, rapido e moderno.
- Mais "ferramenta premium" do que "landing page gamer".
- Visual frio e tecnico, mas nao esteril.

### Paleta base

Direcao recomendada:

- tema dark default com base graphite/slate;
- tema light com base paper/stone;
- um acento principal frio e controlado, preferencialmente indigo ou blue-violet;
- verde, amarelo e vermelho reservados para feedback sem competir com o acento principal.

Regra:

- reduzir o neon atual e usar gradientes apenas em momentos de destaque;
- priorizar hairline borders, sombras suaves e elevacao por camadas.

### Tipografia

- UI: familia sans moderna, com boa leitura em tamanhos pequenos e medio peso em labels.
- Dados: familia mono para tempos, algoritmos, atalho e metricas.
- Escala tipografica mais disciplinada:
  - display para timer e metricas principais;
  - title para paginas e secoes;
  - body para explicacoes;
  - caption para metadata e suporte.

### Superficies

- 3 niveis maximos de elevacao.
- Cards com bordas sutis e sombras discretas.
- Modais e sheets com fundo mais solido e menos transparencia.
- Containers especiais apenas quando houver motivo claro.

### Motion

- transicoes entre 120ms e 220ms na maioria das interacoes;
- spring apenas para drawer, bottom sheet e mudancas de estado importantes;
- stagger leve em listas e cards na entrada;
- reduced motion respeitado em todo o sistema.

## 9. Inventario de Escopo

O redesign deve cobrir:

- Shell global: sidebar, topbar, mobile navigation, page headers, toasts, dialogs, menus, empty states.
- Home: timer, scramble, visualizacao 2D/3D, atalhos, controles, stats, progresso, feed de solves.
- History: summary cards, charts, tabela/lista, detalhes do solve.
- Stats: visualizacao analitica e filtros.
- Training: trilhas, catalogo, drill panel, progresso.
- Tutorial: metodo, estagios, lições, cubo guiado, checklist, CTA de proximo passo.
- Cube 3D: visualizador, playback, historico de movimentos, barra de acao.
- Friends: convite, listas, estados de login/configuracao.
- Leaderboard: filtro semanal/mensal, tabela, destaque do usuario.
- Settings: preferencias, sync, sharing, export/import.
- Share page: visualizacao publica de metricas e progresso.
- Auth callback: estados de processamento e erro.
- Onboarding e modais auxiliares: session manager, scramble guide, onboarding spotlight, confirm dialogs, PWA prompt.

## 10. Arquitetura de Informacao Proposta

### Navegacao mobile

Decisao proposta:

- substituir o menu hamburger como mecanismo principal por uma bottom navigation fixa para os fluxos de maior recorrencia;
- mover rotas secundarias e administrativas para um item `Mais` com bottom sheet.

Tabs principais sugeridas:

- Timer
- Historico
- Stats
- Aprender
- Mais

Conteudo dentro de `Mais`:

- Training
- Friends
- Leaderboard
- Cube 3D
- Settings

Observacao:

- Tutorial pode viver dentro de `Aprender` junto de Training, desde que a navegação interna fique clara.

### Navegacao desktop

- manter sidebar, mas com agrupamento por categoria e menos repeticao visual;
- destacar a rota ativa com feedback mais linear e menos glow;
- transformar a topbar em barra utilitaria enxuta, nao em outro bloco visual dominante.

## 11. Requisitos Mobile-First Obrigatorios

Todos os fluxos e telas devem nascer em viewport mobile antes de qualquer adaptacao desktop.

### Breakpoints de referencia

- base: 360x800
- target premium: 390x844
- large mobile: 430x932
- tablet: 768+
- desktop: 1024+

### Regras obrigatorias

- targets de toque minimos de 44x44 px;
- safe area respeitada em navegacao, bottom bar, sheets e CTAs fixos;
- primeira dobra da home deve permitir entender status, scramble e iniciar solve sem scroll;
- tabelas precisam ter uma representacao em cards ou rows compactas no mobile;
- modais complexos devem virar bottom sheet em mobile;
- acoes primarias devem ficar proximas ao polegar sempre que possivel;
- filtros e segment controls precisam ser operaveis com uma mao;
- graficos precisam ter versao mobile com menos ruido e maior legibilidade;
- nenhum header pode consumir altura excessiva em telas pequenas.

## 12. Sistema de Design a Ser Entregue

### Fundacoes

- color tokens
- typography tokens
- spacing scale
- radius scale
- shadow/elevation scale
- motion tokens
- icon sizing rules
- grid e container widths
- semantic tokens para success, warning, danger e info

### Componentes base

- button
- icon button
- segmented control
- tab bar
- card
- list row
- data card
- input
- select/dropdown
- modal
- bottom sheet
- drawer
- toast
- banner/inline feedback
- skeleton
- empty state
- chart container
- table/list responsive pattern

### Estados obrigatorios por componente

- default
- hover
- active
- focus-visible
- disabled
- loading
- success/error quando aplicavel

## 13. Requisitos por Tela

### 13.1 Home (`/`)

Objetivo:

- maximizar velocidade de uso, entendimento instantaneo e repeticao do loop de solves.

Problemas atuais:

- hero introdutorio compete com o timer;
- existem blocos demais antes de o usuario sentir o app como "cronometro";
- acoes e dados estao corretos, mas a narrativa visual ainda e dispersa.

Diretrizes:

- remover a ideia de hero promocional e transformar o topo em dashboard operacional;
- timer ocupa o protagonismo absoluto da primeira dobra;
- scramble fica visivel sem parecer um bloco secundario;
- acoes de `novo scramble`, `+2`, `DNF` e `desfazer` ficam em uma faixa compacta e facil de tocar;
- stats principais aparecem como faixa resumida;
- progresso, desafios e feed entram depois do loop principal;
- modo 2D/3D deve ter alternancia mais clara e menos peso visual.

Mobile-first:

- timer, scramble e CTA principal devem caber acima da dobra;
- stats em carrossel horizontal ou grade 2xN;
- feed em lista compacta com detalhes secundarios recolhidos;
- atalhos de teclado podem aparecer em sheet informativo, nao ocupar espaco nobre.

Aceite:

- usuario consegue iniciar solve em menos de 2 interacoes apos abrir a home;
- primeira dobra comunica status, scramble, timer e acao principal sem scroll.

### 13.2 History (`/history`)

Objetivo:

- revisar resultados recentes e entender evolucao sem friccao.

Diretrizes:

- summary cards mais objetivas e menos decorativas;
- graficos com menos ruido e legenda mais clara;
- tabela desktop vira lista/card stack no mobile;
- detalhes do solve abrem em bottom sheet no mobile e modal no desktop;
- filtros e ordenacao ficam fixos no topo do conteudo.

Aceite:

- leitura de um solve individual deve ser clara em ate 5 segundos;
- nenhuma coluna essencial pode truncar sem alternativa visivel no mobile.

### 13.3 Stats (`/stats`)

Objetivo:

- tornar analise avancada legivel e premium, sem parecer ferramenta tecnica demais.

Diretrizes:

- dividir a tela por modulos de insight, nao por graficos soltos;
- usar cards analiticos com legenda embutida;
- reduzir dependencia de explicacoes longas;
- organizar filtros por periodo e tipo de metrica em segment controls.

Mobile-first:

- um insight principal por bloco;
- graficos com menos series simultaneas;
- tooltips e detalhes em sheet, nao em overlays pequenos.

### 13.4 Training (`/training`)

Objetivo:

- transformar treino em jornada clara de progresso.

Diretrizes:

- separar descoberta de trilhas, drill atual e progresso acumulado;
- enfatizar estado atual e proximo passo;
- reduzir sensacao de painel complexo;
- usar componentizacao semelhante a apps de produtividade.

Mobile-first:

- lista de trilhas em horizontal scroll ou stack;
- painel do drill ativo priorizado antes do catalogo completo;
- controles de replay e confiança proximos do conteudo principal.

### 13.5 Tutorial (`/tutorial`)

Objetivo:

- fazer o fluxo de aprendizado parecer guiado, calmo e incremental.

Diretrizes:

- estrutura por metodo > etapa > lição deve ficar mais obvia;
- navegação da lição precisa parecer progressao, nao painel administrativo;
- cubo guiado deve conversar com checklist e algoritmo;
- CTA de proximo passo precisa ter forte destaque.

Mobile-first:

- painel lateral atual vira estrutura vertical;
- checklist, reconhecimento e algoritmo entram em pilha;
- progresso da jornada fica sticky ou colapsavel no topo.

### 13.6 Cube 3D (`/cube-3d`)

Objetivo:

- integrar o visualizador 3D ao sistema visual principal do produto.

Problemas atuais:

- a tela parece mais cenica do que sistemica;
- a linguagem visual se afasta bastante das demais rotas.

Diretrizes:

- manter o 3D como destaque, mas com HUD mais disciplinado;
- reorganizar overlays para diminuir ruido;
- playback controls e history seguem padrao de componentes do app;
- reduzir aspecto "demo scene" e aumentar aspecto "ferramenta".

Mobile-first:

- controles fixados na base;
- historico de movimentos recolhivel;
- titulo e scramble mais compactos.

### 13.7 Friends (`/friends`)

Objetivo:

- tornar a camada social confiavel, simples e acolhedora.

Diretrizes:

- separar claramente estados de configuracao, login e uso ativo;
- formularios e listas com visual mais utilitario;
- status de convites e amizade precisam ser rapidamente compreensiveis;
- feedbacks de sucesso/erro devem seguir um unico padrao global.

### 13.8 Leaderboard (`/leaderboard`)

Objetivo:

- reforcar competicao amigavel com leitura rapida de ranking.

Diretrizes:

- destaque claro para a posicao do usuario;
- filtro semanal/mensal mais compacto;
- tabela desktop vira rows comparativas no mobile;
- consistencia, solve count e melhores tempos devem ter hierarquia clara.

Mobile-first:

- top 3 pode virar cards de destaque;
- restantes em lista compacta;
- snapshot do usuario sempre visivel perto do topo.

### 13.9 Settings (`/settings`)

Objetivo:

- reduzir complexidade percebida e agrupar preferencias por contexto.

Diretrizes:

- reorganizar em secoes: experiencia, dados, conta e compartilhamento;
- converter listas longas em grupos semanticos;
- export/import e sync devem transmitir confianca e seguranca;
- tema, idioma e preferencias principais merecem acesso rapido.

Mobile-first:

- cada secao em stack vertical clara;
- acoes sensiveis com espaco e contraste adequados;
- feedback de import/export persistente o suficiente para nao parecer falho.

### 13.10 Share (`/share/:slug`)

Objetivo:

- fazer o compartilhamento parecer publico, confiavel e apresentavel.

Diretrizes:

- hero enxuto com contexto do share;
- metricas com hierarquia editorial;
- progresso pessoal com visual mais showcase;
- CTA para abrir o produto principal pode ser considerado.

### 13.11 Auth Callback (`/auth/callback`)

Objetivo:

- transformar um estado tecnico em experiencia tranquila.

Diretrizes:

- loading com copy curta e confiante;
- erro com explicacao clara e proximo passo;
- layout mais alinhado ao restante do app.

### 13.12 Shell Global

Inclui:

- sidebar
- topbar
- mobile navigation
- session switcher
- puzzle selector
- page headers
- toasts
- dialogs
- onboarding
- PWA prompt

Diretrizes:

- page headers menores e mais funcionais;
- topbar como camada de utilidade, nao de protagonismo;
- session switcher e puzzle selector com o mesmo padrao de densidade;
- onboarding menos intrusivo e mais contextual;
- toasts e banners com hierarquia visual consistente.

## 14. Conteudo e Microcopy

O redesign deve revisar a forma como o produto fala com o usuario.

Regras:

- frases curtas;
- verbos de acao diretos;
- menos texto decorativo e mais texto funcional;
- linguagem amigavel sem infantilizar;
- consistencia entre pt-BR, en-US e es-ES desde o inicio do redesign.

## 15. Acessibilidade e Inclusao

- contraste AA minimo em todo o app;
- navegacao por teclado preservada mesmo com foco mobile-first;
- indicadores claros de foco, pressed e selected;
- reduced motion respeitado;
- labels ARIA e feedback de status consistentes;
- tamanho minimo de texto funcional adequado para mobile;
- nao depender apenas de cor para comunicar status.

## 16. Performance e Qualidade Percebida

- evitar excesso de blur e layers pesadas;
- motion deve ser barata e previsivel;
- skeletons devem substituir flashes visuais bruscos;
- manter lazy loading das rotas;
- proteger LCP da home e interacoes do timer.

Meta:

- o redesign nao pode piorar perceptivelmente a responsividade do timer ou da navegacao.

## 17. Metricas de Sucesso

### Metricas de produto

- reducao do tempo ate primeiro solve em mobile;
- aumento na taxa de usuarios que completam mais de 3 solves por sessao;
- aumento na navegacao para stats, training e share sem queda no uso da home;
- aumento na taxa de retorno em 7 dias para usuarios que passam pelo onboarding redesenhado.

### Metricas de UX

- task success rate maior em testes moderados para:
  - iniciar solve;
  - revisar ultimo solve;
  - alternar sessao;
  - mudar preferencia;
  - encontrar tutorial ou treino;
- menor tempo para encontrar funcoes secundarias em mobile;
- melhor avaliacao subjetiva de clareza visual e confianca.

### Metricas tecnicas

- nenhum regressao visivel no timer loop;
- sem degradacao relevante no tempo de interacao da home;
- sem crescimento descontrolado do bundle por causa do redesign.

## 18. Roadmap de Entrega

### Fase 0. Auditoria e Benchmark

Objetivo:

- fechar diagnostico visual, inventario de componentes e baseline de UX.

Entregaveis:

- auditoria de telas atuais;
- inventario de componentes e estados;
- benchmark visual e estrutural com Notion e Linear;
- mapa de problemas mobile-first.

Critério de saida:

- backlog priorizado por impacto e complexidade.

### Fase 1. Fundacoes do Design System

Objetivo:

- definir o sistema visual que sustentara todo o redesign.

Entregaveis:

- tokens de cor, tipo, espacamento, radius, elevacao e motion;
- especificacao de dark e light theme;
- biblioteca base de componentes;
- guideline de comportamento mobile-first.

Critério de saida:

- componentes base suficientes para montar shell, home e listas.

### Fase 2. App Shell e Navegacao

Objetivo:

- refazer a estrutura global de navegacao e enquadramento das paginas.

Entregaveis:

- nova bottom navigation mobile;
- nova sidebar desktop;
- topbar utilitaria;
- page headers simplificados;
- padrao de drawer, bottom sheet e toast.

Critério de saida:

- todas as rotas acessiveis com navegacao consistente em mobile e desktop.

### Fase 3. Home e Core Loop do Timer

Objetivo:

- transformar a home na melhor tela do produto.

Entregaveis:

- novo layout da primeira dobra;
- reorganizacao de timer, scramble, acoes e stats;
- padrao de feed mobile;
- regras de hierarquia para estados de inspeção, corrida, parada e penalidade.

Critério de saida:

- solve loop principal validado em mobile sem scroll obrigatorio.

### Fase 4. Historico e Analytics

Objetivo:

- unificar leitura de dados em history e stats.

Entregaveis:

- summary cards redesenhados;
- listas/tabelas responsivas;
- charts containers padronizados;
- solve details com comportamento mobile adequado.

Critério de saida:

- leitura analitica clara em telas pequenas e grandes.

### Fase 5. Aprendizado e Treino

Objetivo:

- elevar training, tutorial e cube 3D para o mesmo nivel de qualidade do core.

Entregaveis:

- nova hierarquia de training;
- tutorial com narrativa progressiva;
- cube 3D integrado ao sistema visual;
- componentes reutilizados entre aprender e praticar.

Critério de saida:

- usuario entende progresso e proximo passo sem friccao.

### Fase 6. Social, Settings e Sharing

Objetivo:

- consolidar as superficies de suporte, social e configuracao.

Entregaveis:

- friends e leaderboard redesenhados;
- settings reorganizado por contexto;
- share page com visual mais apresentavel;
- auth callback e estados auxiliares padronizados.

Critério de saida:

- nenhum fluxo de suporte parece "tela de excecao".

### Fase 7. QA, Acessibilidade e Rollout

Objetivo:

- garantir consistencia final e prontidao de lancamento.

Entregaveis:

- QA responsivo por breakpoint;
- QA de acessibilidade;
- polimento de motion;
- regressao visual e funcional;
- checklist de release.

Critério de saida:

- aceite global concluido sem bloqueadores.

## 19. Dependencias

- definicao de direcao visual final antes da implementacao em escala;
- revisao de microcopy em 3 idiomas;
- possivel ajuste de componentes compartilhados e tokens globais;
- estrategia de analytics ou telemetria para medir impacto do redesign.

## 20. Riscos

- redesenhar por tela, sem fundacoes, geraria inconsistencia novamente;
- manter hamburger como navegação primaria em mobile preservaria um gargalo central;
- excesso de inspiracao em Linear pode deixar o app frio demais para iniciantes;
- excesso de inspiracao em Notion pode tirar velocidade e contraste de uma ferramenta de timing;
- elevar qualidade visual sem disciplina de performance pode afetar a sensacao de rapidez.

## 21. Perguntas em Aberto

- Tutorial e Training devem seguir como rotas separadas ou convergir em um hub `Aprender`?
- Leaderboard e Friends devem permanecer de primeiro nivel no desktop ou tambem migrar para agrupamento?
- O produto deve manter tema light com mesma profundidade do dark no primeiro rollout ou priorizar dark primeiro?
- O feed de solves da home deve continuar completo ou virar resumo com CTA para `History`?

## 22. Criterios Globais de Aceite

- Todas as telas principais foram redesenhadas com a mesma linguagem visual.
- Todos os fluxos core e secundarios possuem comportamento mobile-first documentado e implementavel.
- Home passou a priorizar o loop principal do timer acima de qualquer bloco introdutorio.
- Navegacao mobile ficou mais rapida, previsivel e escalavel.
- O design system cobre componentes, estados e variacoes necessarias para o produto inteiro.
- O redesign melhora a percepcao de qualidade sem regredir acessibilidade, performance ou clareza.

## 23. Ordem Recomendada de Implementacao

1. Fundacoes e tokens.
2. Navegacao e shell global.
3. Home.
4. History e Stats.
5. Training, Tutorial e Cube 3D.
6. Friends, Leaderboard e Share.
7. Settings, Auth callback, modais e refinamentos finais.

