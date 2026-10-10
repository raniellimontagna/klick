# Klick — design do produto

**Sub-projeto 1: linguagem visual, Centro (companion) e telas**

| | |
|---|---|
| Data | 2026-10-08 |
| Status | Design aprovado em conversa (seções 1, 2 e 3). Esta spec aguarda revisão. |
| Branch | `v2`, órfã e começada do zero. A versão anterior continua em `main` e na tag `v1.4.0`. |
| Referências | `docs/research/` (3 pesquisas) e `docs/design/brainstorm/` (telas aprovadas) |

---

## 1. Contexto

O Klick é um timer e scrambler de cubo mágico para web e celular, no ar em klick.ranimontagna.com. A v2 é uma reconstrução do zero: nada do código da v1 é reaproveitado.

O produto cresce em três camadas:

1. **O timer diário do Ranielli, com UI de vitrine.** É o foco agora.
2. **A trilha de aprendizado**, do método de camadas ao CFOP, guiada pelo companion.
3. **Sync, conta e comunidade.**

O trabalho foi dividido em sub-projetos. Cada um tem a própria spec, o próprio plano e a própria implementação:

| # | Sub-projeto | Entrega |
|---|---|---|
| **1** | **Linguagem visual, telas e design do companion** | **Esta spec + protótipo interativo em HTML** |
| 2 | Núcleo do timer | Inspeção, penalidades, scrambles reais, histórico, persistência que nunca perde dados |
| 3 | Companion | Motor de animação, lógica do coach, evolução |
| 4 | Trilha de aprendizado | Aulas de camadas → CFOP |
| 5 | Sync, conta e comunidade | — |

## 2. Entendimento

- **Para quem:** primeiro para o próprio Ranielli. Ele é iniciante, resolve pelo método de camadas e leva mais de 1 minuto por solve. Cronometra no desktop, com a barra de espaço, e no celular deitado na mesa.
- **Gosto:** jogo aconchegante somado a esporte e dados. As primeiras versões foram rejeitadas por parecerem infantis: fonte arredondada, contorno grosso, emoji, cor de doce.
- **Companion:** um coach que reage e comenta os marcos, e que evolui visualmente com o progresso. Nunca atrapalha o solve.
- **Como saber se deu certo:** dá vontade de abrir o Klick todo dia, e quem vê a tela pergunta "o que é isso?".
- **Mercado** (pesquisa 1):
  - O csTimer domina pela profundidade, mas tem UI poluída e guarda os dados presos no navegador.
  - O r/Cubers está saturado de timers genéricos "feitos por IA". Por isso, identidade visual própria e um diferencial que dê para demonstrar são obrigatórios.
  - A dor nº 1 da comunidade é perder o histórico de solves. Isso vira princípio do sub-projeto 2.

## 3. Decisões

| # | Decisão | Descartado |
|---|---|---|
| D1 | **Linguagem "Clube".** Aconchego adulto com dados de esporte, em dois temas do mesmo sistema: claro (D1) e noite (D2). | Brinquedo, Arena, Diorama, Clube Fit infantil, Contra-relógio, Argila, Fliperama, Vitrine 3D e o tom editorial (D3) |
| D2 | **Companion "Centro".** Um cubo 3×3 visto em 3/4. O adesivo central da frente é o rosto, e o anel de 8 adesivos em volta funciona como display. | Cubinho com rosto (genérico), cubo 3D do scramble, face só de pontos |
| D3 | **Evolução C + A.** O corpo do Centro guarda a jornada: a face de cima mostra 9 marcos e a face lateral mostra a trilha. Cada temporada completa libera um acabamento. | Só acabamentos; cubo que cresce de 3×3 para 5×5 e 7×7 |
| D4 | **Protótipo** em HTML, CSS e JS puros, sem build, na pasta `/prototype`, publicado como link privado para testar no celular. | Vite + React desde já; protótipo só local |
| D5 | **Repositório:** `raniellimontagna/klick`, na branch órfã `v2`. | Repositório novo; só local |
| D6 | **Documentação:** spec e pesquisas no repo (que é público, então as pesquisas foram revisadas para não vazar nada privado), mais uma nota no vault pessoal. | Só no vault |

## 4. Princípios

1. **Identidade própria, não template.** Cada tela precisa ter algo que só o Klick tem: o Centro, os marcos, a luz do stackmat.
2. **Aconchego adulto.** O calor vem dos neutros quentes, dos materiais e da voz, não de fofura.
3. **Cor é significado.** Cor forte só aparece quando quer dizer algo.
4. **O solve é sagrado.** Durante o solve nada se mexe e ninguém fala.
5. **Informação antes de enfeite.** O anel do Centro é um display, não decoração.
6. **Progresso sem punição.** Nada se perde, nada culpa o usuário.
7. **Desktop e celular de primeira classe.** Barra de espaço no desktop, dois polegares no celular.

## 5. Linguagem visual

### 5.1 Cor

Os tokens são semânticos. Os componentes nunca usam hex direto.

| Token | Claro | Noite | Uso |
|---|---|---|---|
| `bg` | `#F3F0E9` | `#121110` | fundo |
| `surface` | `#FBFAF7` | `#1A1917` | cartões, tiles |
| `surface-2` | `#E8E3D9` | `#23211E` | chips, segmentado |
| `line` | `#E2DCD0` | `#2A2724` | bordas, divisórias |
| `ink` | `#17171A` | `#F3F1EC` | texto principal, número |
| `ink-2` | `#3A3832` | `#D6D2C9` | texto secundário |
| `muted` | `#8A857B` | `#8E8A82` | rótulos, metadados |
| `dec` | `#A9A397` | `#66625B` | casas decimais do tempo |
| `arm` (também a cor da marca) | `#D93D42` | `#FF5A5F` | armando; centro aceso do logo |
| `go` | `#23915A` | `#3DD68C` | pronto para soltar |
| `insp-8` | `#E39B12` | `#FFB224` | inspeção a partir dos 8 s |
| `insp-12` | `#E06A1B` | `#FF8A3D` | inspeção a partir dos 12 s |
| `pb` | `#B8860B` | `#F0B84C` | recorde (texto, losango) |
| `pb-bg` / `pb-ink` | `#F4E7C3` / `#7A5A06` | `#3A2E14` / `#F0C46A` | chip e etiqueta de recorde |
| `heat-0…3` | `#E9E4DA` `#CFE7D7` `#94CDA9` `#2F9E5F` | `#22201D` `#1E4A33` `#2B7A50` `#3DD68C` | mapa de constância |

**Paleta do Centro**, usada só no companion:

| Chave | Claro | Noite |
|---|---|---|
| corpo / adesivo apagado (`off`) | `#1B1B1E` / `#2E2E33` | `#0A0A0B` / `#232326` |
| adesivo do rosto / olhos | `#F4F1EA` / `#1B1B1E` | `#EDEAE3` / `#0A0A0B` |
| U · R · F · D · L · B | `#F4F1EA` `#E5484D` `#30A46C` `#F5C842` `#F07A2B` `#3E63DD` | `#EDEAE3` `#FF5A5F` `#3DD68C` `#FFD54A` `#FF8A3D` `#4C6FE8` |
| ocioso · sono | `#8A857B` · `#5B7BE0` | `#6F6B64` · `#6E8BFF` |
| marco conquistado (`gold`) · etapa da trilha (`trail`) | `#D9A21B` · `#3E63DD` | `#F0B84C` · `#4C6FE8` |
| brilho do adesivo aceso | nenhum (no máximo 1,2 px) | `drop-shadow` de 2,2 px na própria cor |

**Regras de cor:**
- As cores do cubo aparecem **só como luz do Centro**, nunca para dizer "bom" ou "ruim".
- Desempenho se mostra com seta (▼ ▲) e texto neutro. O recorde usa dourado.
- Estado **nunca** é comunicado só por cor: sempre vem acompanhado de rótulo, seta ou forma do anel.

### 5.2 Tipografia

- **Fontes:** Geist (pesos 400, 500, 600 e 700) e Geist Mono (400 e 500), ambas com licença OFL. No protótipo vêm do Google Fonts; em produção, ficam hospedadas junto com o app (PWA offline).
- **Números** sempre com `font-variant-numeric: tabular-nums`.

| Estilo | Especificação |
|---|---|
| Tempo | Geist 600, tracking −0,05em. No desktop, `clamp(96px, 15vw, 220px)`; no celular, 21vw. As casas decimais ficam em 60% do tamanho e na cor `dec`. |
| Título | 26 px / 600 / −0,03em |
| Texto | 15 px / 500 |
| Rótulo | 11 px / 600 / caixa alta / +0,14em / `muted` |
| Mono (scramble) | Geist Mono 14 px / 400 / `ink-2` |

### 5.3 Forma e espaço

- **Espaçamento** em base 4: 4, 8, 12, 16, 24, 32, 48 e 64.
- **Raios:** 6 (tecla), 10 (botão), 14 (tile), 16 (cartão) e pílula.
- **Bordas:** 1 px em `line`. No tema claro não há sombra. No noite, os cartões ganham um brilho interno: `inset 0 1px 0 rgba(255,255,255,.035)`.

### 5.4 Componentes base

| Componente | Descrição |
|---|---|
| Navegação | Abas de texto; a ativa fica em `ink` com um ponto embaixo. |
| Chip | Neutro, ou de recorde (`pb-bg` / `pb-ink`). |
| Botões e teclas | Botão primário (fundo `ink`, texto `bg`), botão secundário (`surface` com borda) e tecla `kbd` em Geist Mono com borda inferior de 2 px. |
| Tile de métrica | Rótulo, valor tabular e um mini-gráfico opcional. |
| Mapa de constância | O mês em uma grade de 2×16, com níveis 0–3. Dia de recorde em `pb`; o dia de hoje ganha contorno. |
| Card do coach | O Centro, o rótulo "Coach" e uma frase. |
| Outros | Seletor segmentado, tabela de histórico, toggle. |

### 5.5 Movimento

- **Durações:** 120 ms para microinterações, 200 ms para troca de estado, e uma mola de 450 ms só em celebrações.
- **Curva padrão:** `cubic-bezier(.2,.8,.2,1)`.
- **Foco no solve:** todo o resto apaga para 8% de opacidade em 200 ms. Ficam visíveis só o tempo e o Centro, imóvel. Ao parar, a interface volta em 200 ms.
- **Reduzir movimento:** sem órbita, sem olhar em volta, sem salto; toda troca é instantânea. As cores e as expressões continuam funcionando.

### 5.6 Som

- **Assinatura:** um "klick" mecânico quando fica pronto e outro quando para.
- **Inspeção:** um tique suave aos 8 s e outro aos 12 s.
- **Recorde:** um acorde curto.
- **Controles:** cada grupo de som liga e desliga separadamente.
- Som e visual funcionam cada um por conta própria. Não dependemos de vibração, que é instável no iOS.

### 5.7 Voz

- **Tom:** calmo, curto, com número. Trata por "você".
- **Proibido:** emoji, exclamação e culpa.
- **Exemplos:**
  - "0.84 s abaixo da sua média de 5. Ritmo bom."
  - "Faz parte — o próximo conta."
  - "Que bom te ver."

### 5.8 Acessibilidade

- Contraste AA nos dois temas.
- Estado nunca indicado só por cor.
- O tempo final e as mensagens do coach são anunciados com `aria-live="polite"`.
- Foco sempre visível e teclado completo.
- Alvos de toque com pelo menos 44 px.
- Respeita `prefers-reduced-motion`.

### 5.9 Ícones

Família Lucide, traço de 1,5 px. Nada de ícone 3D ou emoji na interface.

## 6. Centro (companion)

### 6.1 Anatomia

```
        face de cima = 9 marcos da temporada (dourado quando conquistado)
      ┌───────────┐
      │ 0  1  2   │╲  face lateral = 9 etapas da trilha (azul quando concluída)
      │ 3 (◉◉) 5  │ │
      │ 6  7  8   │ │  frente: o adesivo central é o rosto;
      └───────────┘╱   os outros 8 formam o anel (o display)
```

- **Ordem do anel:** sentido horário a partir do canto superior esquerdo, ou seja, adesivos `0, 1, 2, 5, 8, 7, 6, 3`. No anel, essas são as posições k = 0…7. Os cantos são as posições pares (0, 2, 4, 6).
- **Evolução em todo lugar:** as faces de cima e lateral **sempre** mostram o estado real da evolução, em todas as telas. Adesivo não conquistado aparece em `off`.

### 6.2 Expressões

- **Parâmetros de cada olho:** abertura (0–1), largura, deslocamento x/y (para olhar), curvatura (sorriso) e altura da pálpebra superior.
- **Expressões de base:**
  - aberto
  - semicerrado (abertura 0,5)
  - foco (linha horizontal)
  - feliz (arco para cima)
  - dormindo (arco para baixo)
- **Transição:** interpolada em cerca de 200 ms.
- **Piscar:** a cada ~5,5 s.
- **Olhar em volta:** só no estado parado, com deslocamento de ±1,6 unidades.

### 6.3 Estados

| Estado | Gatilho | Anel | Olhos | Som |
|---|---|---|---|---|
| Parado | Sem atividade | Um adesivo em "ocioso" dá a volta (um passo a cada 0,95 s) | Aberto; pisca e olha em volta | — |
| Inspeção | Inspeção iniciada | Os 8 em U se apagam um a um, a cada 1,875 s | Aberto | — |
| Inspeção 8 s | Chegou aos 8 s | Os restantes ficam em âmbar | Aberto | Tique |
| Inspeção 12 s | Chegou aos 12 s | Os restantes ficam em laranja | Aberto | Tique |
| Armando | Segurando | Enche de vermelho no sentido horário durante o "tempo para armar" | Semicerrado (é a pose de foco se completando) | — |
| Pronto | Segurou pelo tempo para armar | Os 8 verdes | Foco | "klick" |
| Resolvendo | Soltou | Apagado | Foco, imóvel | — |
| Abaixo da média de 5 | Parou | 6 verdes | Aberto | "klick" |
| Acima da média de 5 | Parou | 3 em âmbar | Aberto | "klick" |
| +2 | Penalidade | Posições 0–1 em âmbar | Semicerrado | — |
| DNF | Penalidade | Cantos em vermelho, formando um X | Semicerrado | — |
| Recorde | Parou abaixo do recorde | U R F D L B R F (a face "se resolve") | Feliz, com um pequeno salto | Acorde |
| Dormindo | 5 min sem nenhum input | Cantos em azul "sono", respirando (ciclo de 4 s) | Dormindo | — |

Sobre a inspeção: parar entre 15 e 17 s aplica +2 automaticamente, e passar de 17 s vira DNF. Isso segue as regras WCA.

### 6.4 Regras de comportamento

- **Nunca no solve.** A pose de foco se completa enquanto o usuário segura. Quando o solve começa, nenhuma animação do Centro roda: o loop para.
- **Uma reação por solve.** A reação começa entre 0,4 e 0,6 s depois que o tempo aparece e dura no máximo 2,5 s. Segurar de novo cancela tudo na hora.
- **Fala pouco.** No máximo uma mensagem de coach por solve. Ela some depois de 6 s ou no próximo segurar. A maioria dos solves não tem texto nenhum.
- **Sem culpa.** Nunca dizer "você perdeu a sequência", e o Centro nunca fica triste por ausência.
- **Modo silencioso.** Desliga só o texto. O anel e os olhos continuam, porque são informação.

### 6.5 Coach

Gatilhos em ordem de prioridade. Por solve, fala só o gatilho de maior prioridade.

| # | Gatilho | Definição | Exemplo |
|---|---|---|---|
| 1 | Recorde (single) | Tempo menor que o recorde da categoria | "Novo recorde — 0.84 s mais rápido. Vale lembrar o que funcionou." |
| 2 | Recorde de média | A média de 5 ou de 12 atual é a menor já registrada | "Sua média de 5 caiu para 1:01.20. Isso é consistência, não sorte." |
| 3 | Marco | Conquistou um marco da temporada | "Primeiro solve abaixo de 1 minuto. Marco 6 de 9." |
| 4 | Meta do dia | Completou a meta de solves do dia (padrão: 20) | "Meta de 20 solves feita. O resto é bônus." |
| 5 | Sequência estável | 5 solves seguidos com variação de até 3 s entre o melhor e o pior | "Cinco solves dentro de 3 segundos. Ritmo estável." |
| 6 | Cansaço | Já tem pelo menos 30 solves na sessão e a média de 5 atual está mais de 8% acima da média dos 12 primeiros solves da sessão | "Seus últimos estão subindo. Uma pausa de 5 minutos costuma ajudar." |
| 7 | Primeiro DNF | O primeiro DNF da sessão | "DNF acontece. Respira e segue." |
| 8 | Volta | O último solve foi há 3 dias ou mais | "Que bom te ver. Começa leve — o primeiro não conta pra nada." |

### 6.6 Evolução (C + A)

- **Face de cima: os marcos da temporada.**
  - O número de adesivos dourados é igual ao número de marcos conquistados.
  - Eles acendem em ordem de leitura (0 → 8), independentemente de qual marco foi conquistado.
  - Temporada 1, para iniciantes:
    1. primeiro solve
    2. sub-2:00
    3. 100 solves
    4. sub-1:30
    5. média de 5 abaixo de 1:30
    6. sub-1:00
    7. 7 dias seguidos
    8. média de 12 abaixo de 1:00
    9. 1.000 solves
  - As temporadas seguintes serão definidas no sub-projeto 3.
- **Face lateral: a trilha.**
  - As 9 etapas:
    1. cruz branca
    2. cantos brancos
    3. segunda camada
    4. cruz amarela
    5. orientar e permutar
    6. F2L intuitivo
    7. OLL em 2 passos
    8. PLL em 2 passos
    9. F2L com algoritmos
  - Cada etapa concluída acende em azul.
  - Na camada 1, o próprio usuário marca a etapa como "já sei". Na camada 2, isso vem das aulas.
- **Fim de temporada.** Ao conquistar os 9 marcos:
  - a face de cima pisca em dourado uma vez e se assenta;
  - um acabamento é liberado e a temporada seguinte começa com a face de cima vazia;
  - o histórico das temporadas fica guardado na tela Companion.
- **Acabamentos:**
  - Fosco é o padrão.
  - Os outros saem ao completar uma temporada: Brilho na T1, Gelo na T2, Carbono na T3.
  - O usuário escolhe qual usar na tela Companion. Nada se perde nunca.

### 6.7 Renderização

- **No protótipo:** SVG no DOM. O estado vem por atributos, e as trocas usam transições de CSS. A geometria usa uma projeção cabinet: a frente é um quadrado de 100 unidades e as faces de cima e lateral têm 30 unidades de profundidade.
- **Em produção:** avaliar no sub-projeto 3 um Canvas 2D com projeção própria, renderizado sob demanda e com a máquina de estados separada da renderização (recomendação da pesquisa 3).
- **Legibilidade:** testar a 48, 64, 96 e 300 px.

## 7. Telas

### 7.1 Mapa

- **Áreas principais:** Timer (a home), Evolução, Companion e Ajustes. A aba do Companion leva o nome do personagem ("Centro") tanto no desktop quanto no celular; se o nome mudar, o rótulo muda junto.
- **Telas sobrepostas:**
  - Sessões: um seletor na pílula do topo, para trocar, criar e renomear.
  - Detalhe do solve.
  - Primeira vez (onboarding).
  - Atalhos (abre com `?`).

### 7.2 Timer no desktop

**Layout**

- **Topo:** logo (uma grade 3×3 com o centro em `arm`), abas, pílula de sessão e data.
- **Coluna principal:**
  - rótulo "Embaralhamento" e o scramble em mono;
  - o tempo;
  - chips de diferença ("▼ 3.89 s vs média de 5", "▲ 4.32 s do recorde", "solve #212");
  - as ações pós-resultado.
- **Coluna lateral:** o card do coach (com o Centro) e o mapa de constância do mês.
- **Rodapé:** tiles de média de 5, média de 12, recorde e "hoje" (com a meta), mais a linha de atalhos.

**Fluxo com inspeção ligada**

1. Apertar e soltar espaço inicia a inspeção de 15 s.
2. Segurar espaço durante a inspeção arma o timer.
3. Soltar no verde inicia o solve.

Com a inspeção desligada, segurar espaço já arma direto.

**Estados**

- **Parado.**
- **Armando:** o tempo fica em `arm` e mostra 0:00.00.
- **Pronto:** o tempo fica em `go`.
- **Resolvendo:** entra o foco descrito em 5.5.
- **Resultado:**
  - Aparecem as ações **+2 (P) · DNF (D) · Nota (M) · Excluir (⌫)**.
  - +2 e DNF funcionam como liga/desliga: apertar de novo desfaz a penalidade.
  - Nota abre um campo curto de texto.
  - Excluir mostra um aviso "Solve excluído · Desfazer (Z)" por 6 s.
  - Os chips são recalculados.
  - O dia de hoje no mapa de constância atualiza.
- **Recorde:**
  - o tempo fica em `pb`;
  - o chip vira "◆ x s abaixo do recorde";
  - a etiqueta "Novo recorde" entra junto ao scramble.

### 7.3 Timer no celular (na mesa)

- **Layout, de cima para baixo:** logo e sessão; scramble em duas linhas; o Centro (30% da largura); o tempo; as zonas de toque; a barra de abas (Timer, Evolução, Centro, Ajustes).
- **Dois polegares (padrão):**
  - A metade inferior da tela vira duas zonas, esquerda e direita. Isso segue o timer oficial que a WCA adota em 2027, que exige as duas mãos.
  - Arma só com as duas zonas pressionadas pelo tempo para armar.
  - A largada acontece quando o primeiro polegar sai. Essa regra será validada no teste real (seção 10).
  - Qualquer toque para o timer.
  - Com inspeção ligada, o fluxo é o mesmo do desktop (7.2): um toque inicia a inspeção, e depois os dois polegares armam.
- **Um toque (opcional):** a tela inteira vira uma zona só.
- **Resultado:** chips, ações (+2, DNF, Nota, Excluir) e a frase do coach.

### 7.4 Evolução

- **Filtros:** período (7 dias, 30 dias ou tudo) e sessão.
- **Indicadores:** recorde (em `pb`), média de 5, média de 12, média de 100 e desvio, cada um com a variação no período.
- **Gráficos:**
  - Todos os solves como pontos, a linha da média de 5 e os recordes como losangos em `pb`.
  - Um histograma de distribuição, com a faixa atual destacada.
- **Histórico:** tabela com número, tempo, média de 5, scramble truncado e quando. Tags marcam +2, DNF e recorde.
- **Convenção das médias** (a mesma do csTimer):
  - Descarta 5% de cada lado, arredondando para cima: ao5 e ao12 descartam 1 de cada lado, ao50 descarta 3 e ao100 descarta 5.
  - DNF conta como o pior tempo. Se o número de DNFs passar do total descartado, a média inteira vira DNF.
- **Treino separado:** o treino de algoritmos (camada 2) nunca entra nesses números.

### 7.5 Companion

- **Palco:**
  - o Centro grande;
  - nome, temporada ("Temporada 1 · 6 de 9 marcos") e acabamento atual;
  - a seleção de acabamento, com os bloqueados indicando de qual temporada saem.
- **Marcos:** lista com estado (conquistado, próximo, bloqueado) e progresso, por exemplo "212/1000".
- **Trilha:** lista com a próxima etapa destacada. Na camada 1 dá para marcar "já sei"; na camada 2, a etapa abre a aula.
- **Coach:** o toggle do modo silencioso.

### 7.6 Primeira vez

1. "Esse é o Centro." Explica que ele acompanha os solves e guarda a jornada.
2. "Segure até ficar verde." Passo interativo: o usuário segura espaço ou os dois polegares.
3. "Seu primeiro marco." O primeiro solve real acende o marco 1.

### 7.7 Ajustes

- **Timer:**
  - inspeção de 15 s (ligada por padrão);
  - tempo para armar: 0, **0,3** (padrão), 0,55 ou 1 s;
  - armar no celular: **dois polegares** (padrão) ou um toque.
- **Aparência e som:**
  - tema: **sistema** (padrão), claro ou noite;
  - sons: klick, inspeção e recorde, cada um ligado ou desligado.
- **Coach e dados:**
  - modo silencioso;
  - exportar e importar no formato do csTimer (o import fica para o sub-projeto 2).
- **Geral:**
  - idioma (só pt-BR no protótipo);
  - reduzir movimento (padrão: segue o sistema).

### 7.8 Atalhos

| Tecla | Ação |
|---|---|
| espaço | Armar (segurar) e largar (soltar) |
| qualquer tecla | Parar |
| P | +2 no último solve |
| D | DNF no último solve |
| M | Nota |
| ⌫ | Excluir o último |
| Z | Desfazer a exclusão (enquanto o aviso estiver na tela) |
| N | Novo embaralhamento |
| ? | Mostrar atalhos |
| 1–4 | Trocar de aba |

### 7.9 Responsivo

| Largura | Layout |
|---|---|
| ≥ 1024 px | Desktop em duas colunas |
| 640–1023 px | Uma coluna; a coluna lateral vira uma faixa abaixo do tempo |
| < 640 px | Layout de celular (7.3) |

## 8. Protótipo (entregável deste sub-projeto)

### 8.1 Objetivo

Validar, em uso real no desktop e no celular, três coisas antes de escrever código de produção:

- a sensação de armar, largar e parar;
- a linguagem visual;
- o Centro.

### 8.2 Escopo

- **Timer com relógio real:**
  - inspeção opcional, com avisos e +2/DNF automáticos;
  - tempo para armar configurável;
  - ações de resultado: +2, DNF, nota, e excluir com desfazer;
  - detecção de recorde.
- **Dados:**
  - Ficam em memória, salvos em `localStorage` só por conveniência.
  - O protótipo já vem com uma base fictícia de cerca de 200 solves, montada para que o recorde inicial seja 0:54.10 e os marcos 1 a 6 já estejam conquistados.
  - Médias e desvio são calculados de verdade a partir desses dados (convenção de 7.4).
- **Centro completo:**
  - todos os estados de 6.3;
  - os gatilhos de coach de 6.5, avaliados sobre os dados;
  - evolução: marcos calculados a partir dos dados, trilha marcável à mão e acabamentos selecionáveis.
- **Telas:**
  - Timer, Evolução e Companion;
  - Ajustes funcionando: inspeção, tempo para armar, modo de armar no celular, tema, sons, modo silencioso e reduzir movimento;
  - Primeira vez e Atalhos.
- **Temas:** claro e noite, seguindo o sistema por padrão.
- **Celular:** os modos dois polegares e um toque.
- **Sons:** sintetizados com Web Audio, sem arquivos externos.
- **Embaralhamentos:** uma lista fixa embutida de scrambles 3×3 válidos, gerados em random-state. O gerador real (cubing.js) fica para o sub-projeto 2.

### 8.3 Fora do escopo

- Persistência confiável, sync e conta.
- Outros eventos além do 3×3.
- Smart cube e stackmat.
- As aulas da trilha e os splits.
- i18n além do pt-BR. Mesmo assim, os textos ficam centralizados num arquivo só, para facilitar a tradução depois.
- PWA e uso offline.

### 8.4 Estrutura

```
prototype/
  index.html
  styles/   tokens.css · base.css · components.css · screens.css
  scripts/  app.js        (navegação, telas)
            timer.js      (máquina de estados: parado → inspeção → armando → pronto → resolvendo → resultado)
            centro.js     (SVG, expressões, anel)
            coach.js      (gatilhos e prioridade)
            stats.js      (médias, desvio, recordes, marcos)
            data.js       (base fictícia, scrambles)
            sound.js      (Web Audio)
            strings.js    (textos pt-BR)
```

- São ES modules sem build. Para rodar localmente, basta um servidor estático (por exemplo `python3 -m http.server`).
- A publicação é um link privado no claude.ai (artifact com vários arquivos), atualizado a cada iteração.

### 8.5 Critérios de aceite

- [ ] Segurar espaço faz o anel encher de vermelho em 0,3 s e depois ficar verde. Soltar inicia o timer, e qualquer tecla para.
- [ ] Soltar antes do verde não inicia: o timer volta ao estado parado e mostra de novo o tempo anterior.
- [ ] Durante o solve, a interface fica a 8% (menos o tempo e o Centro), e nenhum loop de animação do Centro roda.
- [ ] Na inspeção, o anel se esvazia em 15 s. Fica âmbar aos 8 s e laranja aos 12 s, com um tique em cada. Parar entre 15 e 17 s dá +2; depois de 17 s, DNF.
- [ ] A reação do Centro começa entre 0,4 e 0,6 s depois do tempo e acaba em até 2,5 s. Segurar de novo cancela.
- [ ] Cada solve tem no máximo uma mensagem de coach, respeitando a prioridade de 6.5.
- [ ] No recorde:
  - o tempo fica dourado e aparecem o chip e a etiqueta;
  - o anel acende nas 6 cores e toca o acorde;
  - se valer marco, o marco acende na face de cima.
- [ ] Os indicadores da Evolução batem com a convenção de médias. Isso é verificado com um conjunto de dados de resultado conhecido.
- [ ] Em iPhone e Android reais:
  - os dois polegares só armam com as duas zonas pressionadas, e o modo um toque funciona;
  - não acontece zoom nem seleção de texto sem querer;
  - os alvos de toque têm pelo menos 44 px.
- [ ] Os dois temas passam no contraste AA, conferido com ferramenta.
- [ ] Com reduzir movimento ligado, nada se desloca, e os estados continuam legíveis.
- [ ] Todos os atalhos de 7.8 funcionam, e o foco fica sempre visível.
- [ ] O leitor de tela anuncia o tempo final e a mensagem do coach.

### 8.6 Validação

O Ranielli usa o protótipo por 3 dias, com pelo menos 50 solves, no desktop e no celular. Depois responde:

- O Centro distraiu?
- Deu para perceber os avisos da inspeção?
- O recorde pareceu especial?
- Você desligaria o Centro?
- O que faltou?

As respostas orientam os ajustes antes dos sub-projetos 2 e 3.

**Resultado (09/10):**
- o Centro não distraiu e não seria desligado;
- os avisos da inspeção são percebidos;
- o recorde ficou bom;
- não faltou nada: o caminho está certo.

## 9. Fora de escopo, com espaço já reservado no design

- **Camada 2:**
  - As aulas da trilha, que abrem pela lista da trilha e pela face lateral.
  - O treino de algoritmos, isolado das estatísticas.
  - Splits por etapa, no estilo LiveSplit, dentro do detalhe do solve.
- **Camada 3:**
  - Conta e sync com histórico de versões e lixeira. Isso responde à dor nº 1 da pesquisa 1.
  - Comunidade e o formato Head-to-Head.
  - As regras WCA de 2026–27 (3BLD em Bo5, FTO oficial).
- **Smart cube:** o Web Bluetooth só funciona em Chrome, Edge e Android; não funciona no iOS.

## 10. Riscos e pendências

| Item | Como resolver |
|---|---|
| A Geist pode não ter números tabulares (`tnum`) | Verificar no protótipo. Se faltar, usar os números da Geist Mono só no tempo. |
| Âmbar e laranja da inspeção podem ficar sem contraste sobre o papel claro | Resolvido no protótipo: tons ajustados e cobertos pelo teste de contraste. |
| Regra de largada com dois polegares (sair o primeiro ou os dois) | Decidido em 09/10: larga quando sai o primeiro polegar. |
| O rosto do Centro pode ficar ilegível em 48 px | Validado em 09/10: legível no celular. |
| Nome do companion | Confirmado em 09/10: "Centro". |
| Ajustes da temporada 2 em diante | Ficam para o sub-projeto 3. |

## 11. Referências

- `docs/research/2026-10-07-cenario-de-timers.md`: concorrentes, dores da comunidade e regras WCA.
- `docs/research/2026-10-07-inspiracao-visual.md`: direções visuais, tipografia e ritual do stackmat.
- `docs/research/2026-10-07-companion.md`: casos de referência, o conceito Centro e a tecnologia.
- `docs/design/brainstorm/`: as telas aprovadas no brainstorm. Elas abrem direto no navegador.
