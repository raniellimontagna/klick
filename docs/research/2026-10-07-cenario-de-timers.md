# Pesquisa 1: timers de speedcubing, cenário competitivo e o que cubers querem

Para: reconstrução do Klick (klick.ranimontagna.com). Fontes acessadas em 07/10/2026. Idioma: pt-BR.

Convenção de evidência: [S#] produto ou página oficial; [C#] comunidade (Reddit, SpeedSolving); [Y#] YouTube; [W#] WCA; [H#] hardware e bibliotecas; [A#] análogos fora do cubo. A lista completa com URLs está na seção 11. Quando escrevo "Leitura:", é interpretação minha, não fato da fonte.

---

## 0. Resumo executivo

1. **O csTimer continua sendo o padrão de fato.** Numa enquete do SpeedSolving (dez/2025) ele levou 28 de 31 votos contra o CubeDesk [C1], e o guia do CubeHead sobre ele passa de meio milhão de views [Y1]. Vence por profundidade (cerca de 230 tipos de scramble, solvers, stackmat, Bluetooth, offline, grátis e GPL) [S1][S31]. Perde por UI poluída, curva de aprendizado, dados presos ao navegador e anúncios [C1][C5][S25].
2. **A dor nº 1 é perder o histórico.** Há uma sequência de threads de quem perdeu de meses a 3 anos de solves: no csTimer (limpeza de dados do navegador), no Twisty Timer (celular quebrado) e no app da GAN (após update) [C7][C8][C9][C10][S33]. O pedido mais repetido é sync e backup automáticos [C11].
3. **Ser bonito já não basta: a comunidade está saturada de timers genéricos.** Em 2026 o r/Cubers discute banir ou restringir a um megathread os apps "vibe-coded" (proposta com cerca de 275 upvotes), e lançamentos de timers recebem respostas hostis [C16][C17][C18][C19]. Até o timer oficial do SpeedSolving foi chamado de "vibecoded" no lançamento [S32].
4. **Os desafiantes modernos convergem para o mesmo pacote:** conta com sync, perfis, 1v1 e salas, smart cube com splits CFOP/Roux e treino de algoritmos (CubeDesk, Nexus Timer, acubemy, SpeedSolving Timer) [S7][S26][S29][S31]. O CubeDesk encerrou o plano Pro em 2026 e ficou todo grátis [S8].
5. **Smart cube virou o principal vetor de "coach":** splits por fase, reconhecimento contra execução, TPS, reconstrução 3D e treino de algoritmos com repetição espaçada [S10][S29]. Os apps oficiais, porém, são mal avaliados (CubeStation com nota 2,8/5) [S33], e no navegador há atrito com MAC address, modelos não suportados e falta de Web Bluetooth no iOS [C27][H7].
6. **O mobile segue mal servido.** O Twisty Timer não recebe update desde jun/2023 (o sucessor é o Cubic Timer), o ChaoTimer saiu da App Store, e o csTimer no celular é menos fluido e mostra anúncio que pode cobrir o timer [S13][S14][C5][C36].
7. **As regras WCA mudaram em 2026–2027, e não encontrei timer que já reflita isso de forma explícita.** O 3BLD virou Best of 5 (com Ao5 reconhecida), surgiu o formato Head-to-Head, o FTO vira evento oficial em 02/01/2027, o Clock deixa de ser oficial após 18/07/2027, e a cronometragem 4-pad (Speed Stacks G5) passa a ser obrigatória em 02/01/2027 [W1][W3][W4].
8. **O hardware ficou acessível e as bibliotecas amadureceram.** Há smart cubes de entrada por cerca de €23–26 [S34]. Bibliotecas MIT (gan-web-bluetooth, smartcube-web-bluetooth) e o cubing.js resolvem a conexão Bluetooth e os scrambles random-state em worker [H1][H2][H4][H5].
9. **Nova fronteira: câmera.** Entre jun e set/2026 surgiram um timer por webcam, que detecta as mãos e simula o stackmat, e um app que reconstrói os movimentos só pela câmera [S35][S36].
10. **Os análogos mostram o caminho de UX.** O Monkeytype ensina foco, reinício instantâneo, temas, PB por configuração e XP/streaks. O LiveSplit ensina splits comparados ao PB e aos melhores segmentos, o "gold" e o "possible time save" [A1][A2][A3][A4].

---

## 1. Escopo, método e limitações

- Só fontes públicas, sem login, sem formulários e sem downloads. Usei busca na web, leitura de páginas oficiais, GitHub, lojas de apps, fórum SpeedSolving e o texto das Regulations da WCA (versão de 01/04/2026).
- **Reddit:** o acesso direto às threads foi bloqueado. Usei títulos e trechos indexados por buscadores, então as evidências do Reddit refletem o trecho visível, não a discussão inteira. O SpeedSolving foi lido diretamente.
- Notas e contagens de lojas valem para o momento do acesso. Números de usuários e frases como "suporta todos os cubos" são alegações do fornecedor e estão marcados assim.
- **Correções ao briefing:**
  - O Block Keeper é um app desktop (Electron para Windows, macOS e Linux), não iOS. Não achei versão iOS.
  - O Prisma Puzzle Timer é Java desktop, feito por um brasileiro (Walter Souza, de São Paulo), não Android.
  - "Chaotimer" é o ChaoTimer, app iOS que saiu da App Store.

---

## 2. Mapa do mercado (out/2026)

| Segmento | Players | Situação |
|---|---|---|
| Incumbente web "canivete suíço" | csTimer, mais a extensão csTimer+ | Dominante e ativo (versão 2025.08.18) [S1] |
| Web moderno e social | CubeDesk, Nexus Timer, SpeedSolving Timer (ago/2026), dezenas de clones | Disputam visual, conta/sync e recursos sociais |
| Smart cube primeiro | Cubeast, acubemy, apps oficiais (GAN CubeStation, QiYi Smart Player Pro, MoYu WCU Cube), Last Cube X | Disputam análise; os apps oficiais são mal avaliados |
| Mobile nativo | Cubic Timer (fork do Twisty), Twisty Timer (parado), CubeTime (iOS), novos iOS (Vertex, Last Cube X, Cube Rivals) | Fragmentado; o iOS não tem favorito claro desde o ChaoTimer |
| Legado desktop e web | Prisma, Block Keeper, qqTimer, cubetimer.com, ZYX Timer | Parados; servem de referência histórica |
| Fronteira (câmera/visão) | swiftcuber (webcam), Cube-Vision, ccTimer | Experimental |

Leitura: o "meio" do mercado (web bonito, com conta e 1v1) está lotado e desacreditado. As pontas estão menos disputadas: confiabilidade de dados, profundidade WCA, análise de smart cube bem-feita e mobile de verdade.

---

## 3. Concorrentes

### 3.1 Principais

Visão rápida (os perfis completos vêm logo abaixo):

| Produto | Plataforma e modelo | Destaque | A comunidade ama | A comunidade odeia | Status (out/2026) |
|---|---|---|---|---|---|
| csTimer | Web/PWA; grátis, GPL-3, anúncio opcional | Profundidade total: cerca de 230 tipos de scramble, solvers, stackmat, Bluetooth | Profundidade, offline, grátis | UI poluída, dados frágeis no navegador, sync manual, anúncios | Dominante e ativo |
| csTimer+ | Extensão de navegador; grátis | Vozes, temas, scrambles parciais sobre o csTimer | Extras sem trocar de timer | Updates esparsos | Ativo, lento |
| CubeDesk | Web; grátis desde 2026; GPL-3 | Visual moderno, 1v1, 750+ treinadores de algoritmos | Estética, 1v1, conta | Scrambles "fáceis", faltam imagens e puzzles | Ativo |
| Nexus Timer | Web e Android; GPL-3 | Plataforma completa: perfis, salas, smart cube com splits | UI limpa, nuvem automática | Bugs de onboarding, merge que apagou solves | Muito ativo |
| Cubeast | Web; freemium | Análise de smart cube (reconhecimento contra execução) | Melhor opção para análise, segundo usuários | MAC address, suporte lento a cubos novos | Ativo |
| acubemy | Web, iOS e Android; freemium, fechado | Coach de smart cube, replay 3D, torneios | Faz o smart cube valer a pena (vídeo) | Prompts de premium, código fechado | Ativo (dez/2025) |
| Twisty / Cubic Timer | Android; grátis, GPL-3 | Nativo, limpo; o Cubic lê stackmat e timers GAN | Simples e completo | Twisty parado; dados presos ao aparelho | Twisty parado; Cubic ativo |
| CubeTime | iOS; grátis, open source | Comp sim, multiphase, export no formato do csTimer | Melhor opção iOS para muitos | Crashes, gráfico sem zoom | Última versão em mar/2024 |
| SpeedSolving Timer | Web, dentro do fórum | Import do csTimer, insights, heatmap | Conveniência | Visual lido como feito por IA | Novo (ago/2026) |

**csTimer** [S1][S2][S3][C5]
- **Plataforma e modelo:** web/PWA em qualquer navegador; funciona offline depois do 1º acesso. Grátis, GPL-3. Tem anúncios AdSense, que dá para desligar nas opções.
- **Features-chave:**
  - Cerca de 230 tipos de scramble: todos os eventos WCA, mais subconjuntos de treino (CFOP, Roux, Mehta, ZZ, ZBLL…).
  - Inspeção WCA com voz aos 8 e 12 s e +2/DNF automáticos; multiphase.
  - Entradas: stackmat por áudio; smart cubes (GAN, Giiker, GoCube, MoYu, QiYi); timers Bluetooth (GAN, QiYi); cubo virtual.
  - Ferramentas: solvers (cross, EOLine, Roux…), BLD helper, metrônomo, estatísticas diárias, reconstrução, batalha e competição online.
  - Auto-export a cada 100 solves.
- **Destaques de UX:** quase tudo é configurável; o tempo de "segurar para armar" tem opções de 0, 0,3, 0,55 e 1 s; há opção de esconder elementos durante o solve.
- **A comunidade ama:** profundidade, gratuidade, confiabilidade, solvers instantâneos e uso offline [C1][C14][C22].
- **A comunidade odeia:**
  - Visual poluído e datado, com curva de aprendizado [C1][S25].
  - Dados ficam no navegador, e muita gente perdeu tudo [C7][C8][C9].
  - Sync manual, e a conta é vista como pouco confiável [C1][C12].
  - Anúncio sobre o timer no celular [C36]; menos fluido no mobile [S25].
- **Status (out/2026):** ativo. Descrito no fórum como o timer de cubo mais popular do mundo [C6]. 781 estrelas no GitHub.

**csTimer+** [S6]
- **Plataforma e modelo:** extensão para Chrome e Safari; grátis; cerca de 20 mil usuários; nota 4,6/5 (77 avaliações).
- **Features-chave:** scrambles parciais, imagem de vários puzzles, vozes de inspeção de cubers famosos, temas sazonais.
- **Destaques de UX:** funciona como "skin" de power user sobre o csTimer.
- **A comunidade ama:** ganhar recursos extras sem trocar de timer [C12][C1].
- **A comunidade odeia:** depende do csTimer; updates esparsos (v1.4.1 em dez/2024).
- **Status:** ativo, com updates lentos.

**CubeDesk** [S7][S8][S9]
- **Plataforma e modelo:** web; começou como app desktop em 2020. Grátis desde 2026, quando o Pro foi descontinuado. Open source, GPL-3.
- **Features-chave:**
  - Timer com modo foco, stackmat, entrada manual, inspeção e atalhos.
  - Mais de 750 treinadores de algoritmos, além dos customizados.
  - Analytics; 1v1 e modo eliminação; leaderboards, perfis e amigos.
  - Import do csTimer; Bluetooth; vínculo com conta WCA.
- **Destaques de UX:** visual moderno e organizado; gráfico de tendência agradável.
- **A comunidade ama:** estética, 1v1 e conta que sincroniza [C1][C3]. Há reviews em vídeo que o comparam ao csTimer [Y2][Y3].
- **A comunidade odeia:**
  - Scrambles por movimentos aleatórios, "mais fáceis" (relatos de 2023, incluindo Pyraminx com 4 a 5 movimentos) [C2][C3].
  - Faltam imagens de scramble e alguns puzzles e subconjuntos.
  - Confusão entre sessão e evento; dark mode como padrão.
  - Vários usuários voltaram ao csTimer [C1][C3][C4].
- **Status:** ativo. Alegações do fornecedor: 40 mil cubers e 25 milhões de solves.

**Nexus Timer** [S26][S27][S28]
- **Plataforma e modelo:** web (Next.js) e Android; GPL-3.
- **Features-chave:**
  - Estatísticas por cubo físico; perfis públicos com comparação.
  - Multiplayer, salas privadas e chat.
  - Stackmat; inspeção com voz.
  - Smart cube (GAN, MoYu, QiYi) com análise CFOP/Roux e splits de cross, pares de F2L, OLL e PLL (jul/2026).
  - Conjuntos de algoritmos; backup em nuvem.
- **Destaques de UX:** feito para "parecer app nativo"; tooltips; efeitos sonoros.
- **A comunidade ama:** UI limpa (há quem o use para tudo) e o salvamento na nuvem a cada 20 solves [C15].
- **A comunidade odeia:**
  - Onboarding confuso no início (era preciso criar uma sessão antes de cronometrar).
  - Toque acidental iniciava o timer.
  - Um "merge" apagou solves; houve relato de tela preta.
  - App de cerca de 100 MB; site bloqueado em escolas [S28].
- **Status:** muito ativo (7,4 mil commits).

**Cubeast** [S10][S11]
- **Plataforma e modelo:** web app (app.cubeast.com). Freemium; a "Academy" é paga (cerca de US$5/mês, segundo usuários).
- **Features-chave:**
  - Feito para smart cube: grava e analisa todos os solves.
  - Reconhecimento contra execução por fase; tempos de inspeção, pegada e soltura.
  - TPS por modelo de cubo; frequência de XCross; tempo de reconhecimento de PLL; forças e fraquezas.
  - Link compartilhável do solve; exercícios; stackmat.
- **Destaques de UX:** painel analítico denso.
- **A comunidade ama:** melhor opção para análise, ainda que imperfeita; com uns 100 solves, as médias de splits ficam confiáveis [C26][C37].
- **A comunidade odeia:**
  - Exige MAC address em alguns cubos [C27].
  - Demora para suportar modelos novos [S11].
  - Relato de falha com Stackmat G5 [S11].
  - Relato de limite de memória em solves com mais de 50 movimentos [S30].
- **Status:** ativo; usa biblioteca Bluetooth própria.

**acubemy** [S29][S30]
- **Plataforma e modelo:** web, iOS e Android. Freemium; código fechado.
- **Features-chave:**
  - "Todas as marcas" de smart cube (alegação).
  - Reconstrução com orientação pelo giroscópio e replay 3D; analisador de Roux.
  - Coach de algoritmos com repetição espaçada.
  - 1v1, torneios (um deles patrocinado pela GAN) e ranking do scramble diário.
  - Benchmarks baseados em mais de 3 milhões de solves.
- **Destaques de UX:** insights do tipo "onde você perdeu tempo".
- **A comunidade ama:** um vídeo diz que o app faz o smart cube valer a pena; ajudou usuários a aprender OLL/PLL [Y5][C27].
- **A comunidade odeia:** prompts de premium insistentes; não é open source; erros com alguns modelos [S30].
- **Status:** ativo; lançado em dez/2025.

**Twisty Timer e seu fork Cubic Timer** [S12][S13][S14][S15]
- **Plataforma e modelo:** Android nativo; grátis, sem anúncios, GPL-3.
- **Features-chave:**
  - Scrambles random-state via TNoodle, com imagem.
  - Categorias, gráficos, dicas ótimas de cross e x-cross, referência de OLL/PLL.
  - O Cubic Timer acrescenta stackmat via adaptador RS232C-USB e timers Bluetooth da GAN.
- **Destaques de UX:** Material Design limpo.
- **A comunidade ama:** simples e completo no celular [Y4]. O Twisty tem nota 4,8/5, 10,2 mil avaliações e mais de 1 milhão de downloads.
- **A comunidade odeia:** Twisty sem update desde 23/06/2023; dados ficam só no aparelho [C10]; import/export trabalhoso.
- **Status:** Twisty parado. Cubic ativo (update em 10/05/2026, nota 4,6/5).

**CubeTime** [S21][S41]
- **Plataforma e modelo:** iOS e iPadOS (SwiftUI); grátis; open source; não coleta dados.
- **Features-chave:**
  - Scrambler oficial (TNoodle); multiphase; "comp sim" (simulação de competição).
  - Gráfico interativo.
  - Export em CSV, JSON no formato do csTimer e planilha.
  - Zen mode; voz na inspeção; sync de configurações.
- **Destaques de UX:** visual moderno; posiciona-se como substituto do ChaoTimer.
- **A comunidade ama:** melhor opção iOS para muitos [C5]; o comp sim calcula quanto você precisa no último solve [C39].
- **A comunidade odeia:** crashes em alguns aparelhos; gráfico sem zoom; falta ao25.
- **Status:** última versão 3.0.0, de 29/03/2024; nota 4,7/5 (317 avaliações).

**SpeedSolving Puzzle Timer** [S31][S32]
- **Plataforma e modelo:** web, integrado ao fórum (ago/2026).
- **Features-chave:**
  - Dados locais por padrão, com perfil sincronizado ao fazer login.
  - Import do csTimer preservando datas, scrambles, comentários, +2 e DNF.
  - Fases; PBs de ao5 até ao100; gráfico; insights automáticos.
  - Heatmap de prática; histograma; controles de privacidade; fila offline; export JSON/CSV.
- **Destaques de UX:** fica dentro da maior comunidade de fórum.
- **A comunidade ama:** conveniência e o import.
- **A comunidade odeia:** visual lido como vibecoded (feito por IA); atrito no import [S32].
- **Status:** novo.

### 3.2 Legado, nicho e novos

| Produto | Plataforma | O que é / destaques | Ama / odeia | Status |
|---|---|---|---|---|
| **Prisma Puzzle Timer** [S16][S25] | Java desktop (.jar), MIT. Autor: Walter Souza (SP, Brasil) | Scramblers random-state, visualização 3D do scramble, stackmat "sem configuração", banco H2, histograma, dicas de cross ótima e BLD | Ama: aguenta sessões de 10 mil+ solves; simples. Odeia: sem ao50/ao100; pouco customizável | Legado (2010–2016) |
| **Block Keeper** [S18][S19] | Desktop Electron (Win/macOS/Linux), GPL-3 | Sessões por evento, temas, TNoodle, inspeção por voz, adaptações para BLD e OH, stackmat, gráficos, grava vídeo do último solve, offline | Ama: elegante, roda no Linux. Odeia: sem imagem de scramble; parado | Parado (49 estrelas) |
| **ChaoTimer** [S20][C30] | iOS | Interface por gestos, sem botões na aba do timer; drop-to-stop; muitas sessões; scrambles ZBLL/2GLL/TCLL | Ama: segue citado com saudade como o timer mobile favorito [C5]. Odeia: sumiu; até surgiu ferramenta de terceiro só para exportar os dados (lock-in) | Fora da App Store |
| **cubetimer.com** [S22] | Web, desde 2007 | Timer por espaço; inspeção de 0/3/5/10/15 s; médias 5, 10 e "10 de 12"; dados em cookie | Simples e utilitário, mas datado | Parado |
| **qqTimer** [S23][S42] | Web (JS), por Michael Gottlieb, 2009 | Leve; entrada manual; +2/DNF/comentário; modo BLD (separa memorização); night mode; cores customizáveis | Ama: confiável e leve; ainda é usado como reserva (por exemplo, quando a escola bloqueia outro timer [S28]). Odeia: poucas sessões, sem stackmat [S25] | Legado. O csTimer nasceu de experimentos sobre ele |
| **ZYX Timer** [S24][S25] | iOS (2015) | Aba de treino (scrambles rápidos, OLL, PLL, LL), drop-to-stop, som ao parar, cores, algoritmos "globais" | Ama: treino integrado. Odeia: glitches (não atualizava melhores médias), só iOS, sem imagem de scramble | Dormente |
| **GAN CubeStation NEW** [S33][C23][C24][C25] | iOS/Android, app oficial GAN | Timer, estatísticas, aulas, ranking, corridas | Nota 2,8/5 (313 avaliações). Queixas: lento, login frequente, sync "errado", funções removidas, dados perdidos no update v5, UI poluída, compras dentro do app | Ativo e mal avaliado |
| **QiYi Smart Player Pro / MoYu WCU Cube** [S34][C26] | Apps oficiais | Timer, estatísticas, aulas, ranking, jogos; só funcionam com a própria marca | O app da QiYi é elogiado pelos breakdowns, mas visto como inacabado | Ativos |
| **Last Cube X** [S37] | iOS/Android | Smart cubes, timers GAN, sync no servidor, treino de algoritmos | Nota 4,8/5 (177). Assinatura de US$1,99 a 3,99/mês ou US$19,99 a 39,99/ano | Ativo |
| **Vertex** [S38] | iOS/iPad/macOS, pago (US$3,99) | Se vende como timer moderno que treina todos os aspectos do solve | Pouca evidência pública | Novo (2025–26) |
| **swiftcuber** [S35] | Web (webcam) | Detecta as mãos pela câmera: palmas para baixo arma, pegar o cubo inicia, palmas para baixo para. Inspeção WCA com voz, +2 e DNF. Processamento local. Depois ganhou galeria de gravações, ghost race contra o PB e scramble diário | Elogiado pelo rastreamento de mãos; pedidos de versão mobile e de mais eventos | Novo (jun–ago/2026) |
| **Cube-Vision** [S36] | iOS (Android em teste) | Reconstrói os movimentos por visão com qualquer cubo, sem Bluetooth; gera estatísticas por fase CFOP; precisa enxergar o topo e a frente | Curiosidade alta; sem números de acurácia | Novo (set/2026) |

### 3.3 Matriz rápida de capacidades

Legenda: S = sim; P = parcial; N = não; ? = não verificado.

| Capacidade | csTimer | CubeDesk | Nexus | Cubeast | acubemy | Cubic/Twisty | CubeTime | SS Timer | **Klick hoje** |
|---|---|---|---|---|---|---|---|---|---|
| Todos os eventos WCA | S | S | ? | N (3x3) | N (3x3) | S | S | S | **N (só 3x3)** |
| Random-state nos puzzles pequenos | S | P (relatos de random-move) | ? | n/a | n/a | S | S | ? | ? |
| Imagem do scramble | S | P | ? | n/a | n/a | S | S | ? | ? |
| Inspeção WCA com avisos 8/12 s | S | P (inspeção; avisos ?) | S | ? | ? | S | S | P (15 s; avisos ?) | P |
| Stackmat | S | S | S | S | ? | S (Cubic) | ? | N | **N** |
| Timers Bluetooth (GAN/QiYi) | S | ? | ? | ? | ? | S (Cubic) | N | N | **N** |
| Smart cube | S | P/? | S | S | S | N | N | N | **N** |
| Splits / multiphase | S | ? | S | S | S | N | S | S | **N** |
| ao50 / ao100 / ao1000 | S | ? | P (até ao100) | ? | ? | ? | ? | P (até ao100) | **N** |
| Sync automático entre dispositivos | P (manual) | S | S | S | S | N | P (só configurações) | S | **S (Supabase)** |
| Import do csTimer | n/a | S | ? | ? | ? | N | P (exporta no formato) | S | **N** |
| Treino de algoritmos | P | S | S | S (pago) | S | P | N | N | P (tutorial LBL) |
| 1v1 / salas | P | S | S | N | S | N | N | N | N |
| Offline / PWA | S | ? | ? | N | ? | nativo | nativo | P | **S** |
| Open source | S | S | S | N | N | S | S | ? | ? |
| Sem anúncios nem paywall no básico | P | S | ? | P | P | S | S | S | **S** |

---

## 4. Matriz de features: essencial, diferencial e cauda longa

### 4.1 Essencial (o mínimo para ser levado a sério)

| # | Feature | Quem já faz | Recomendação para o Klick |
|---|---|---|---|
| 1 | Timer por espaço ou toque, com "segurar para armar" | csTimer: 0 / 0,3 / 0,55 / 1 s, padrão 0,3 s [S3] | Padrão de 0,3 s; preset de 0,55 s imitando o stackmat. No toque, área grande e proteção contra início acidental [S28]. Aceitar as duas teclas Ctrl, como o csTimer |
| 2 | Inspeção de 15 s com avisos aos 8 e 12 s e +2/DNF automáticos | csTimer, CubeTime [W1] | Som, voz e vibração. Configurável por evento (BLD sem inspeção). Guardar o tempo de inspeção junto com o solve |
| 3 | Scrambles random-state para os 17 eventos (mais FTO em 2027), com imagem | csTimer; cubing.js pronto [H4] | Gerar em worker com prefetch; celular é lento para cubos grandes [C29] |
| 4 | +2, DNF, comentário, editar e excluir | Todos | Toda ação destrutiva com "desfazer" |
| 5 | Sessões | Todos | Sessão 3x3 pronta no 1º acesso; criar, renomear, mesclar e dividir |
| 6 | Estatísticas: single, mo3, ao5, ao12, ao25, ao50, ao100, ao1000 | csTimer [S4] | Sempre mostrar o valor atual e o melhor; média, desvio-padrão e contagem. Regras de corte na seção 7.5 |
| 7 | Gráfico de tendência e histograma | csTimer, CubeTime | Com zoom e foco em intervalo; falta de zoom é queixa no CubeTime [S21] |
| 8 | Entrada manual de tempos | csTimer, qqTimer, CubeDesk | Serve a quem usa stackmat sem cabo |
| 9 | Offline/PWA com armazenamento robusto | csTimer | IndexedDB com pedido de armazenamento persistente |
| 10 | Import e export | CubeDesk, SpeedSolving Timer, CubeTime | JSON do csTimer nos dois sentidos, sem perda; CSV. Sem lock-in |
| 11 | Atalhos, temas claro e escuro, i18n, mobile | Todos | Mobile de primeira, não adaptado |
| 12 | Fluxos de BLD, FMC e MBLD | csTimer, qqTimer | BLD em Bo5 com Ao5 e split de memorização/execução; FMC com número de movimentos; MBLD com acertos/tentativas e tempo |

### 4.2 Diferencial (onde dá para ganhar)

| # | Feature | Quem já faz | Recomendação para o Klick |
|---|---|---|---|
| 13 | Sync automático com histórico de versões, lixeira e resolução de conflitos | Nexus, CubeDesk; SpeedSolving Timer em parte | O Klick já tem Supabase: transformar em "garantia de dados" visível (seção 10) |
| 14 | Stackmat por áudio (Gen3/4/5) e timers Bluetooth (GAN Smart/Halo, QiYi) | csTimer, Cubic Timer | Para competidores é condição de adoção [S39] |
| 15 | Smart cubes via Web Bluetooth | Cubeast, acubemy, Nexus, csTimer | Reconstrução, splits CFOP/Roux, reconhecimento contra execução, TPS, replay 3D |
| 16 | Multiphase manual e split de memorização/execução no BLD | csTimer, CubeTime, SpeedSolving Timer | Dá splits a quem não tem smart cube |
| 17 | Splits comparados no estilo LiveSplit | Nenhum timer de cubo faz bem; referência é o LiveSplit [A3] | Delta contra PB e melhor fase, fase "gold", potencial de ganho por fase |
| 18 | Insights automáticos | SpeedSolving Timer, acubemy | Qual fase come seu tempo, linha do tempo de PBs, consistência, metas "sou sub-X?", heatmap de prática |
| 19 | Comp sim | CubeTime | Ao5 com cutoff e limite de tempo, Head-to-Head, "quanto preciso no último solve" |
| 20 | Modo foco | CubeDesk, csTimer, Monkeytype | Tela some durante o solve; opção de esconder o tempo [C33]; 2 casas decimais enquanto corre [S39] |
| 21 | Temas por design tokens, temas da comunidade, sons e vozes | Monkeytype, csTimer+ | Personalização profunda, mas fora do caminho |
| 22 | Paleta de comandos (Ctrl/Cmd+K) | Monkeytype [A2] | Acesso a tudo sem poluir a tela |
| 23 | Treino isolado das estatísticas principais | acubemy, CubeDesk, csTimer | Treino de algoritmos com repetição espaçada e scrambles de subconjunto fora dos PBs; pedido explícito [C32] |
| 24 | Social opcional | CubeDesk, Nexus, acubemy, Cubeast | 1v1 e salas, scramble do dia com ranking, cartão compartilhável de PB/Ao5, link de reconstrução |
| 25 | Login WCA (OAuth) | CubeDesk; csTimer usa para backup | PBs oficiais lado a lado com os de treino |
| 26 | Acessibilidade de verdade | Ninguém destaca | Leitor de tela, alto contraste, paletas para daltonismo, movimento reduzido |

### 4.3 Cauda longa

| # | Feature | Quem já faz | Observação |
|---|---|---|---|
| 27 | Solvers e dicas (cross ótima, XCross, EOLine, primeiro bloco do Roux) | csTimer, Twisty | Os solvers do csTimer são elogiados [C14] |
| 28 | Timer por câmera e reconstrução por visão | swiftcuber, Cube-Vision | Efeito "wow" e alternativa para quem não tem stackmat |
| 29 | Gravar vídeo do último solve | Block Keeper, swiftcuber | |
| 30 | Puzzles fora da WCA, relays, scramble digitado pelo usuário | csTimer | Útil para competições semanais |
| 31 | Scrambles em lote e impressão | csTimer, CubeTime | |
| 32 | Metrônomo | csTimer | |
| 33 | Coleção de cubos com estatísticas por cubo | Nexus, CubeIndex | |
| 34 | Gamificação: XP, streaks, conquistas | Monkeytype | |
| 35 | Modo stream/overlay para OBS | Padrão do LiveSplit | |
| 36 | Kinch, Sum of Ranks, "estou classificado?" | cubingapp | |
| 37 | API e exports avançados | | |

---

## 5. Voz da comunidade

### 5.1 Top 10 dores

Ordenei por frequência e intensidade percebidas nas fontes. A ordem é minha leitura.

1. **Perda de histórico.**
   - No csTimer, solves "sumiram" depois de limpar dados do navegador ou sem motivo aparente: 91 horas de prática, 3 anos de solves, 2 anos de sessões [C7][C8][C9]; ainda aparece em 2026 [C6].
   - No Twisty, celular quebrado significou perder tudo [C10].
   - O CubeStation apagou recordes num update forçado [C25][S33]; no Nexus, um merge apagou solves [S28].
   - Implicação: no Klick, confiabilidade é feature de produto, não detalhe técnico.
2. **Sync inexistente ou manual.**
   - No csTimer o fluxo é exportar e importar via Google ou conta WCA no início e no fim de cada sessão, o que usuários chamam de tedioso [C12][C35].
   - Um pedido explícito diz que só falta sync e backup ao vivo de solves e configurações [C11].
   - Há quem queira "o csTimer como app" com conta [C13][C15], e o Nexus é elogiado por salvar na nuvem a cada 20 solves [C15].
3. **UI datada, poluída e com curva de aprendizado.**
   - O csTimer é tido como poluído [C1] e com curva íngreme [S25].
   - O CubeStation é confuso, poluído e cheio de cliques [C23][C24].
   - Um pai relata o filho frustrado com a aparência e a falta de análises do timer web principal [C16].
4. **Mobile ruim.**
   - csTimer menos fluido [S25], anúncio cobrindo o timer [C36], cubo virtual dando DNF aleatório no Android/Firefox [C6].
   - No iPhone, muitos usam o csTimer adicionado à tela inicial e convivem com anúncios grandes [C21].
   - Toques acidentais iniciando o timer [S28]; cubo interativo cobrindo o timer [S39].
   - Geração lenta de scrambles no celular [C29].
   - O iOS ficou órfão depois do ChaoTimer [C5][C30].
5. **Abandono e instabilidade dos projetos.**
   - ChaoTimer removido; Twisty parado desde 2023 [S13]; Prisma e Block Keeper parados.
   - cubingapp anunciou encerramento em 2024 e depois sofreu com certificado expirado [S40].
   - CubeDesk mudou de modelo em 2026 [S8].
   - Resultado: medo de lock-in, a ponto de surgir ferramenta de terceiro só para exportar os dados do ChaoTimer [S20].
6. **Scrambles ruins ou faltando.**
   - CubeDesk com movimentos aleatórios, scrambles "mais sortudos", Pyraminx com 4 a 5 movimentos [C2][C3].
   - Faltam imagens de scramble, subconjuntos, FTO e visual de Square-1 [C2][C3].
   - Megaminx curto num timer novo [S39]; 2x2 fácil demais no csTimer, em relato antigo [S25].
7. **Hardware frágil.**
   - Stackmat: cabo, entrada de microfone, exigência de HTTPS; o G4 às vezes para em 0,00x no PC [S25][C31].
   - Stackmat G5 sem conectar no Cubeast [S11].
   - Timer GAN pedindo código e sem parear com o csTimer, segundo reviews [H9].
   - Smart cube: MAC address [C27], modelo não suportado [S11], iOS sem Web Bluetooth [H7].
   - Mesmo assim, para muitos competidores stackmat é inegociável [S39].
8. **Apps oficiais de smart cube ruins e rastreamento impreciso.**
   - CubeStation com nota 2,8/5: lento, login frequente, sync errado, funções removidas [S33][C24].
   - O wiki do r/Cubers diz que a contagem de movimentos nos apps de fábrica não é confiável [C28]; há thread sobre "gyro drift" [S40].
9. **Estatísticas confusas, poluídas ou rasas.**
   - Solves de treino de OLL/PLL e solves casuais "na frente da TV" contaminam os PBs [C32].
   - Confusão entre média atual e melhor média [S28]; falta ao25 e zoom nos gráficos [S21]; falta ao50/ao100 [S25].
   - Edição de data e export difíceis no Twisty [S13].
   - Demanda por análises "de verdade" [C16].
10. **Monetização intrusiva.**
    - Anúncios no csTimer [C5][C36].
    - Paywall de modo escuro e estatísticas em timers iOS, segundo um agregador de reviews [S43].
    - Prompts de premium no acubemy [S30]; Academy paga no Cubeast [C37]; compras dentro do app no CubeStation [S33]; assinaturas no Last Cube X [S37].

### 5.2 O sinal de 2026: fadiga de "AI slop"

- **O que aparece:**
  - Proposta de banir ou restringir apps "vibe-coded" a um megathread, com cerca de 275 upvotes e 49 comentários [C17].
  - Thread perguntando por que o sub está cheio de "AI slop", com reclamações de que todo timer novo tem a mesma UI [C18].
  - Respostas típicas a lançamentos: surge um timer genérico por dia e ainda bem que existe o csTimer; não precisamos de outro timer [C16][C19].
- **Leitura:**
  - O visual "padrão de template" (dark, cards, gradientes) passou a ser lido como sinal de baixo esforço.
  - Para o Klick, UI incrível precisa ser visivelmente autoral: identidade própria, microinterações cuidadas, performance e coerência com o domínio do cubo.
  - Precisa vir junto com um diferencial demonstrável. Lançar no r/Cubers como "mais um timer" é arriscado; lançar mostrando algo que ninguém tem (por exemplo, garantia de dados com migração do csTimer em 1 clique, ou splits estilo LiveSplit) tem mais chance.

### 5.3 Pedidos explícitos recorrentes

- Sync e backup automáticos [C11][C15].
- App mobile com conta que sincroniza [C13][C15].
- Bluetooth com timers QiYi e GAN [C20][C38]; breakdown de fases CFOP, Roux e Petrus via Bluetooth [C38].
- Separar treino e solves casuais dos "sérios" [C32].
- Esconder o tempo durante o solve e mostrar menos casas decimais [C33][S39].
- Mais eventos e scrambles corretos (FTO, subconjuntos, visual de Square-1) [C2][C3].
- Desfazer exclusão; nada de início por toque acidental; sessão padrão pronta [S28].
- Metas: digitar a média-alvo e ver quanto falta (elogio ao CubeTime) [C39].
- Ideias periféricas: Apple Watch [C39]; parar o timer pela vibração ao pousar o cubo (roadmap do Cube Rivals) [C40].

---

## 6. Top 10 coisas que fariam um cuber trocar o csTimer

Ordem por impacto estimado (leitura minha, baseada nas dores acima).

1. **Garantia de que nunca vai perder um solve.** Armazenamento local primeiro, sync automático, histórico de versões, lixeira e status de backup visível. Ataca a dor nº 1 [C7][C8][C9][C10].
2. **Migração do csTimer em 1 clique e sem perdas, com saída de volta.** Importar sessões, scrambles, +2/DNF, comentários, multiphase e datas, e exportar no formato do csTimer. As pessoas já alternam entre timers via export/import [C1][C3], e o SpeedSolving Timer e o CubeDesk fazem disso argumento central [S31][S7].
3. **Paridade no núcleo competitivo.** Scrambles random-state de todos os eventos com imagem, inspeção com voz, stackmat, timers Bluetooth, ao5 a ao1000 e multiphase. Sem isso, usuários dizem que o csTimer vence nas opções e que sem entrada de stackmat nem consideram trocar [S39].
4. **Mobile de primeira.** PWA instalável sem anúncios, toque confiável, vibração, modo paisagem, offline e scrambles rápidos [C36][C29][S28].
5. **Estatísticas que ensinam.** Qual fase come seu tempo, progresso por semana, consistência, metas sub-X, heatmap. É a direção do SpeedSolving Timer e do acubemy [S31][S29] e uma lacuna citada por usuários [C16].
6. **Smart cube no mesmo app que os solves normais.** Splits CFOP/Roux automáticos, reconstrução e TPS, sem o drama do MAC address quando possível, e com estatísticas unificadas [C27][Y5].
7. **Treino que não suja o histórico oficial.** Sessões de treino, treino de algoritmos com repetição espaçada, comp sim e Head-to-Head [C32][S21].
8. **Foco e personalização no estilo Monkeytype.** Modo zen, esconder o tempo, temas, atalhos e paleta de comandos: o poder do csTimer sem a poluição [A2][C33].
9. **Social leve e opcional.** Corrida 1v1, scramble do dia, perfil com PBs e vínculo WCA, cartões para compartilhar. O csTimer tem batalha online, mas datada [S1][S7][S26].
10. **Confiança e longevidade.** Open source, sem anúncios, privacidade, export aberto, roadmap público e regras WCA de 2026–27 em dia. É o antídoto para o "AI slop" e para o medo de abandono [C17][C18][S20].

---

## 7. Regras e conceitos WCA para o timer respeitar

Base: Regulations da WCA, versão de 01/04/2026 [W1], salvo indicação.

### 7.1 Inspeção (A3 e A4)

- **Limite:** estritamente menos de 15 s para inspecionar e iniciar (A3a1).
  - O juiz começa a contar ao descobrir o puzzle (A3b2) e para quando o competidor tira as mãos do timer (A3b5).
- **Avisos:** o juiz anuncia "8 segundos" e "12 segundos" (A3b3 e A3b4).
- **Penalidades por tempo de inspeção:**
  - Iniciar com 15,00 s ou mais, e menos de 17,00 s: +2. O 15,00 exato já é +2 (A4d1).
  - Iniciar com 17,00 s ou mais: DNF. O 17,00 exato já é DNF (A4d2).
- **Puzzle sobre o timer** ao fim da inspeção: +2 (A3d).
- **Clock:** pode mexer nos pinos durante a inspeção (A3c1+).
- **BLD:** não há inspeção; a tentativa começa com o solve, então a memorização conta no tempo (B1a).
- **No software:** a contagem começa no 1º toque ou tecla (equivale a descobrir o cubo); sinais aos 8 e 12 s; +2 ou DNF aplicados automaticamente; guardar o tempo de inspeção com o solve.

### 7.2 Iniciar e parar (stackmat) e como simular em software

- **Início:**
  - Dedos nos sensores, palmas viradas para baixo, do lado do competidor (A4b; senão +2).
  - Sem contato com o puzzle (A4b1; senão +2).
  - Mãos no timer até ele ficar "pronto"; o tempo começa quando as mãos saem (A4d).
- **Parada:**
  - Soltar o puzzle antes (A6a); não soltar totalmente gera +2 (A6c).
  - Parar com as duas mãos espalmadas nos sensores (A6d; senão +2).
  - Depois de parar: mexer no puzzle é DNF; só tocar é +2 (A6e1 e A6e2).
  - Zerar o timer antes de assinar a súmula pode dar DNF, a critério do juiz (A6f).
- **Parada prematura:** abaixo de 0,06 s, a tentativa é repetida; com 0,06 s ou mais, é DNF (A6b1 e A6b2).
- **2027:** a WCA exige a Speed Stacks G5 em modo 4-pad a partir de 02/01/2027. O texto novo das regras de início e parada iria a rascunho em set/2026 [W4]. Manter a lógica de início e parada configurável.
- **No software:**
  - "Segurar para armar" emula o "pronto" do stackmat (vermelho, depois verde). O csTimer oferece 0, 0,3, 0,55 e 1 s, com padrão de 0,3 s [S3].
  - Soltar inicia; qualquer tecla ou toque para.
  - Tratar paradas abaixo de uns 60 ms como falso início, por analogia ao A6b1.
  - Oferecer "modo estrito" que exige duas mãos (duas teclas Ctrl ou duas áreas de toque).

### 7.3 Penalidades mais comuns

| Situação | Penalidade | Regra |
|---|---|---|
| Inspeção de 15,00 a 16,99 s | +2 | A4d1 |
| Inspeção a partir de 17,00 s | DNF | A4d2 |
| Mãos mal posicionadas ao iniciar ou tocar o cubo ao iniciar | +2 | A4b, A4b1 |
| Não soltar o cubo ou parar sem as mãos espalmadas | +2 | A6c, A6d |
| Mexer no cubo depois de parar | DNF | A6e1 |
| Cubo a 1 movimento de resolvido (cada desalinhamento acima do limite conta 1 movimento) | +2 | 10e1, 10e3 |
| Cubo a mais de 1 movimento de resolvido | DNF | 10e4 |
| Limites de desalinhamento: NxN até 45°, Megaminx até 36°, Pyraminx e Skewb até 60°, Square-1 até 45° (U/D) ou 90° (/) | referência | 10f1 a 10f4 |

### 7.4 Formatos oficiais e médias (Artigo 9)

- **Ao5:** 5 tentativas; descarta a melhor e a pior; média aritmética das 3 restantes (9f8).
  - Um DNF ou DNS conta como o pior resultado e é descartado; dois ou mais tornam a média DNF (9f9).
- **Mo3:** média das 3 tentativas; qualquer DNF ou DNS torna a média DNF (9f10 e 9f11).
- **Best of X:** vale o melhor resultado; DNF é o pior possível (9f6 e 9f7).
- **Desempate** em Ao5 e Mo3: o melhor single (9f14).
- **Formato por evento (9b):**
  - Ao5: 3x3, 2x2, 4x4, 5x5, 3x3 OH, Clock, Megaminx, Pyraminx, Skewb, Square-1. Cutoff em Bo2.
  - Mo3: 6x6 e 7x7. Cutoff em Bo1.
  - 3x3 BLD: Bo5, com Ao5 reconhecida para rankings e recordes.
  - 3x3 FMC: Bo1, Bo2 ou Mo3.
  - Multi-BLD: Bo1 a Bo3.
  - 4x4 e 5x5 BLD: Bo3, com Mo3 reconhecida.
- **Head-to-Head (Artigo I):** só em finais de 3x3, 4x4, 3x3 BLD e 3x3 OH (9b7).

### 7.5 Médias não oficiais (ao12, ao50, ao100…) e DNF

- **Não há regra WCA.** O padrão de fato é o do csTimer: corta 5% de cada lado, arredondando para cima [S4].

  | Média | Descarta (melhores + piores) | Contam |
  |---|---|---|
  | ao5 | 1 + 1 | 3 |
  | ao12 | 1 + 1 | 10 |
  | ao25 | 2 + 2 | 21 |
  | ao50 | 3 + 3 | 44 |
  | ao100 | 5 + 5 | 90 |
  | ao1000 | 50 + 50 | 900 |

- **DNF:** entra como o pior tempo. A média vira DNF quando os DNFs passam do número de piores descartados: um ao12 com 2 DNFs é DNF; um ao100 aguenta até 5.
- **mo3 rolante:** média simples dos 3 últimos solves, sem descarte; qualquer DNF torna a média DNF.
- **+2:** soma 2 s ao tempo em todas as estatísticas. Guardar tempo bruto e penalidade separados.
- **UX:** mostrar sempre a média atual e a melhor (o Nexus teve confusão justamente aí [S28]) e deixar o corte configurável, como no csTimer.

### 7.6 Precisão e arredondamento

- **Abaixo de 10 min:** singles são truncados nos centésimos; médias e Mo3 são arredondados para o centésimo mais próximo (9f1).
- **10 min ou mais:** singles truncados para segundos; médias acima de 10 min arredondadas para o segundo. Tempos de MBLD são sempre em segundos (9f2).
- **Limite de tempo:** padrão de 10 min por tentativa; pode haver limite acumulado na rodada (A1a1 e A1a2).
- **Sugestão:** guardar milissegundos inteiros (o csTimer mede internamente em ms [S1]). Um "modo WCA" mostraria 2 casas, truncaria os singles e calcularia as médias a partir dos singles já truncados.

### 7.7 Eventos: lista vigente e mudanças

- **17 eventos oficiais em 2026:** 3x3, 2x2, 4x4, 5x5, 6x6, 7x7, 3x3 OH, 3x3 BLD, 4x4 BLD, 5x5 BLD, Multi-BLD, FMC, Clock, Megaminx, Pyraminx, Skewb e Square-1 (9b).
  - Códigos usados pela WCA e pelo cubing.js: 333, 222, 444, 555, 666, 777, 333oh, 333bf, 444bf, 555bf, 333mbf, 333fm, clock, minx, pyram, skewb, sq1.
- **Mudanças recentes e anunciadas:**
  - 3BLD passou a Bo5 com Ao5 reconhecida. Uma compilação aponta vigência em 01/01/2026 [W5]; o texto está nas Regulations atuais [W1].
  - Novo formato Head-to-Head (Artigo I).
  - FTO será oficial a partir de 02/01/2027, em Ao5 [W3].
  - Clock fica disponível só até 18/07/2027; o Mundial de 2027 é a despedida [W3].
  - Cronometragem 4-pad obrigatória a partir de 02/01/2027 [W4].
  - A WCA cita 6x6/7x7 e 4BLD/5BLD como candidatos a mudanças futuras [W3].
- **Implicação:** modelar eventos como dados (formato, inspeção, tipo de scramble, corte das médias, datas de vigência), nunca em código fixo.

### 7.8 Scrambles: random-state contra random-move

- **Uso oficial:** só o programa oficial vigente da WCA (4b). Hoje é o TNoodle-WCA-1.2.3, de 17/12/2025 [W2].
- **Especificação (4b3):**
  - Estado aleatório com probabilidade uniforme entre os estados que exigem pelo menos 2 movimentos para resolver.
  - BLD também orienta o puzzle aleatoriamente.
  - Mínimos: 2x2 com 4 ou mais movimentos; Pyraminx com 6; Skewb com 7; Square-1 com 11, e precisa permitir um "/" imediato.
  - 5x5, 6x6, 7x7 e Megaminx usam movimentos aleatórios suficientes.
- **Random-state:** sorteia um estado do puzzle e gera a sequência que leva até ele. Todo estado tem a mesma chance, então não há scrambles "sortudos".
- **Random-move:** aplica N movimentos aleatórios. A distribuição não é uniforme, e em puzzles pequenos isso produz estados fáceis. Foi a crítica feita ao CubeDesk [C2][C3].
- **Para o Klick:**
  - Usar o cubing.js: `randomScrambleForEvent`, random-state onde a regra exige, geração em worker com prefetch.
  - O próprio projeto diz que é só para uso não oficial, o que basta para treino [H4].
  - O FMC começa e termina com R' U' F, como no TNoodle. O 2x2 pode usar D, B e L, ao contrário do TNoodle, mas continua dentro da regra [H4].
  - Celular é lento para cubos grandes: worker mais prefetch [C29].

### 7.9 FMC e Multi-BLD

- **FMC:**
  - 60 min para escrever a solução (E2b).
  - O resultado é o número de movimentos contado em OBTM, a métrica em que rotações valem 0 (E2d e 12a5).
  - Mais de 80 movimentos em ETM, que inclui rotações, é DNF (E2d1).
- **Multi-BLD:**
  - Pontuação = resolvidos menos não resolvidos. Precisa ser pelo menos 0, com mais de 1 cubo resolvido (9f12c).
  - Empate se resolve pelo menor tempo.
  - Limite de 10 min por cubo, até 60 min (H1b).

### 7.10 Checklist WCA para o Klick

- [ ] Inspeção de 15 s com sinais aos 8/12 s, +2 de 15,00 a 16,99 s e DNF a partir de 17,00 s; sem inspeção nos eventos BLD.
- [ ] "Segurar para armar" configurável, falso início abaixo de cerca de 60 ms, modo de duas mãos.
- [ ] Ao5 com descarte de 1+1 e regra de DNF; Mo3; Bo3/Bo5; ao12 até ao1000 com corte de 5% arredondado para cima.
- [ ] Modo WCA: singles truncados e médias arredondadas ao centésimo.
- [ ] Eventos e formatos como dados; 3BLD em Bo5/Ao5; FTO a partir de 2027; Clock marcado como fora após 2027.
- [ ] Scrambles random-state onde exigido, com imagem.
- [ ] FMC com contagem de movimentos (OBTM) e MBLD com pontos e tempo.
- [ ] Comp sim com cutoff, limite de tempo e Head-to-Head.

---

## 8. Hardware e integrações

### 8.1 Smart cubes: modelos e preços de referência

Preços na loja finlandesa Cuboss, em euros com IVA [S34].

| Cubo | Preço | Observação |
|---|---|---|
| QiYi Smart Cube 3x3 | €22,99 | Entrada |
| GAN 356 i Carry E | €25,99 | Entrada da GAN |
| GAN i4 3x3 | €54,99–69,99 | Linha atual da GAN |
| MoYu WeiLong V10 AI | €57,99 | Protocolo MoYu "WRM/MY32" |
| X-Man Tornado V4 AI | €79,99 | Ecossistema QiYi/XMD |

Os apps oficiais só funcionam com a própria marca. O acubemy é o app de terceiros que a loja destaca como multimarca [S34].

### 8.2 Bibliotecas abertas

- **gan-web-bluetooth** (MIT, cerca de 100 estrelas) [H1]
  - Cubos GAN das gerações 2, 3 e 4 (inclui o MoYu AI 2023, que usa o protocolo Gen2).
  - GAN Smart Timer e GAN Halo.
  - Eventos de movimento com timestamp, estado das faces e correção de deriva do relógio do cubo (`cubeTimestampLinearFit`).
- **smartcube-web-bluetooth** (MIT, fork da anterior) [H2]
  - API genérica `connectSmartCube()` que detecta a marca.
  - Cubos: GAN Gen1 a Gen4, Giiker/Mi/Hi-, GoCube/Rubik's Connected, MoYu AI 2023, MHC e WRM, QiYi/XMD Tornado V4.
  - Eventos: movimentos, estado das faces, giroscópio (quaternion), bateria; também lê os timers da GAN.
- **cubing.js/bluetooth** [H5]
  - GiiKER/Xiaomi, GoCube, Rubik's Connected, GAN, HEYKUBE e QiYi; MoYu sem fluxo de movimentos.
  - Orientação no GoCube e no GAN, conforme o modelo.
  - Alerta do próprio projeto: os protocolos são proprietários, mudam sem aviso e há versões GAN incompatíveis.
- **Módulos do csTimer** (GPL-3) [S2]
  - GAN, Giiker, GoCube, dois protocolos da MoYu, QiYi, timers GAN e QiYi, e stackmat.
  - Por serem GPL, copiar código daqui tem implicações de licença.
- **Cubeast:** biblioteca própria; o mantenedor recomenda a lib aberta da GAN [S11].

### 8.3 Web Bluetooth: onde funciona

- **Funciona:** Chrome 56+, Edge 79+, Opera 43+, Chrome no Android e Samsung Internet.
- **Não funciona:** Firefox e Safari, incluindo todo navegador no iOS, que usa WebKit. Cobertura global de cerca de 76,5% [H7].
- **Exige** contexto seguro (HTTPS) e gesto do usuário para parear [H6]. É marcada como experimental.
- **iPhone:** o caminho prático é o navegador Bluefy, com a opção de anúncios BLE ligada; o csTimer documenta isso [S1].
- **MAC address:**
  - Alguns protocolos cifram os dados com chave derivada do MAC do cubo, e o Web Bluetooth não expõe o MAC.
  - O usuário precisa digitá-lo, ou ativar uma flag experimental do Chrome para leitura automática [S1][C27].
  - Desenhar esse fluxo com cuidado: guia visual de onde achar o MAC e lembrar o valor por dispositivo.

### 8.4 O que dá para fazer com um smart cube

- **Reconstrução completa:** lista de movimentos com timestamps, replay 3D e link compartilhável (Cubeast, acubemy, csTimer) [S10][S29].
- **Splits por fase:**
  - CFOP: cross, cada par de F2L, OLL, PLL e AUF.
  - Roux: primeiro bloco, segundo bloco, CMLL, LSE. ZZ: EOLine/EOCross.
  - Já fazem: Nexus, csTimer (segmentação CFOP automática), acubemy (analisador Roux) [S26][S1][S30].
- **Reconhecimento contra execução:** a pausa antes de cada algoritmo e o TPS durante ele (Cubeast) [S10].
- **Métricas:** TPS geral e por fase, contagem de movimentos (HTM/STM/ETM), eficiência do F2L, pausas de lookahead, cor do cross, frequência de XCross, casos de OLL/PLL mais lentos [S10].
- **Treino verificado:** o app confere se você executou o algoritmo certo e mede o tempo por caso, com repetição espaçada (acubemy) [S29].
- **Início e parada automáticos:** começa no 1º giro e para quando o cubo resolve. Para treino fiel à WCA, combinar com stackmat ou com o fluxo de inspeção.
- **Ghost race e corrida contra o PB:** replay sincronizado.
- **Problemas conhecidos:** perda de sincronia (reset necessário), contagem de movimentos imprecisa nos apps de fábrica [C28], deriva do giroscópio [S40], movimentos de camada do meio mal reconhecidos [S33], suporte que demora a chegar a modelos novos [S11].

### 8.5 Smart timers Bluetooth

- **GAN Smart Timer** [H9]: trava os botões por 1 s depois do solve, calcula Ao5 próprio, tem saída auxiliar de 2,5 mm e sincroniza com o CubeStation.
  - Reviews: às vezes não registra as mãos, pareamento com o csTimer inconsistente, compatível só com tapetes GAN.
- **GAN Halo:** suportado pelas bibliotecas GAN e pelo Cubic Timer [H1][S14].
- **QiYi Smart Timer:** Bluetooth; só funciona com tapetes XMD ou QiYi M Pro [H11]; o csTimer lê [S2].
- Há comparativos em vídeo dos timers físicos (Speed Stacks G4, GAN Halo, MoYu, QiYi) [Y6].
- **Leitura:** suportar timers Bluetooth elimina o cabo, que é a parte mais frágil da integração com stackmat.

### 8.6 Stackmat via entrada de áudio

- **Montagem:** cabo de 2,5 mm para 3,5 mm do timer até a entrada de microfone. Sem entrada de microfone, um adaptador USB resolve.
- **Sinal:** serial de baixa taxa (relatos de cerca de 1200 baud, 8N1), com pacotes de estado e dígitos, cerca de 5 vezes por segundo.
- **Bibliotecas:** decodificação via Web Audio, como o stackmat.js [H8]. O csTimer, o Cubeast, o Block Keeper e o Prisma suportam.
- **Requisitos:** permissão de microfone, que exige HTTPS.
- **Problemas conhecidos:**
  - G4 que para em 0,00x quando ligado ao computador; zumbido em alguns PCs (wiki do r/Cubers [C31] e reviews de lojas).
  - G5 que não conectou no Cubeast [S11].
- **2027:** com o G5 em modo 4-pad obrigatório, testar especificamente o protocolo do G5 [W4].

### 8.7 Câmera

- **swiftcuber:** webcam no navegador, detecção de mãos e fluxo WCA completo. Tudo roda localmente; o criador anuncia que nenhum dado sai do aparelho [S35].
- **Cube-Vision:** reconstrução por visão no próprio aparelho; precisa enxergar o topo e a frente do cubo [S36].
- **Leitura:**
  - Uma implementação web com um modelo de detecção de mãos daria ao Klick um "stackmat virtual" para quem não tem stackmat.
  - Riscos: latência, iluminação e privacidade, que precisa ser explícita.
  - É aposta de cauda longa, não fundação.

### 8.8 Riscos e recomendações de integração

- Isolar cada fonte de entrada (teclado, toque, stackmat, timer Bluetooth, smart cube, câmera) atrás de uma interface única de eventos: `arm`, `start`, `split`, `stop` e `move`.
- **Degradar com elegância:**
  - Firefox e Safari: esconder a opção de smart cube e explicar alternativas (Chrome, Bluefy).
  - Falha de conexão: diagnóstico visível, nunca silencioso.
- Corrigir a deriva do relógio do cubo com regressão linear [H1][H2].
- Usar timestamps de evento (`event.timeStamp` e `performance.now()`), não intervalos, para a precisão do timer.
- Matriz de testes por modelo de cubo; aceitar que protocolos quebram (alerta do cubing.js [H5]).

---

## 9. Análogos fora do cubo: Monkeytype e LiveSplit

### 9.1 Monkeytype

Teste de digitação open source (GPL-3, cerca de 20,8 mil estrelas) [A1][A2]. Padrões e como traduzi-los para o Klick:

- **Fricção zero.**
  - Lá: você digita sem conta; o histórico fica local, e a conta só acrescenta sync.
  - Klick: abrir e cronometrar em menos de 1 s; conta opcional, com dados locais desde o 1º solve.
- **Modo foco.**
  - Lá: cabeçalho e rodapé somem durante o teste.
  - Klick: durante o solve, só o número, ou nada se o tempo estiver oculto.
- **Reinício instantâneo.**
  - Lá: Tab, Esc ou Enter reiniciam.
  - Klick: uma tecla para descartar ou pular o scramble; Esc cancela a inspeção.
- **Tela de resultado rica.**
  - Lá: WPM, raw, acurácia, consistência e gráfico.
  - Klick: painel pós-solve com delta contra Ao5, Ao12 e PB, fase mais lenta, consistência (desvio-padrão ou coeficiente de variação) e uma "nota do solve".
- **PB por combinação de configurações.**
  - Lá: cada combinação de modo e opções tem seu próprio PB.
  - Klick: PB por evento e por método de entrada (teclado, stackmat, smart cube), por OH, com ou sem inspeção. Evita comparar laranjas com maçãs.
- **Personalização escondida, mas profunda.**
  - Lá: mais de 400 temas, sons e estilos de cursor.
  - Klick: tokens de design, temas da comunidade, pacotes de sons e vozes.
- **Paleta de comandos.**
  - Lá: abre configurações e ações de qualquer lugar.
  - Klick: Ctrl/Cmd+K para trocar evento, sessão, tema ou rodar um export.
- **Gamificação.**
  - Lá: XP, streaks e leaderboards diários e semanais.
  - Klick: streak de prática, metas semanais, ranking do scramble do dia. Cuidado com trapaça: o dev do Nexus recusou leaderboards por isso [S28].

### 9.2 LiveSplit

Timer de speedrun (MIT) [A3][A4][A5]. Padrões e como traduzi-los para o Klick:

- **Splits com comparações.**
  - Lá: compara contra o PB, os melhores segmentos, a média e a soma dos melhores.
  - Klick: fases do CFOP, do Roux e do BLD (memorização e execução) comparadas ao PB, às melhores fases e à média das últimas N.
- **Cores de delta.**
  - Lá: à frente ou atrás, combinado com ganhando ou perdendo tempo; "gold" quando o segmento é o melhor da história.
  - Klick: barra de fases colorida no pós-solve; dourado para o melhor cross, F2L, OLL ou PLL de todos os tempos.
- **Possible Time Save.**
  - Lá: mostra o quanto cada segmento poderia render.
  - Klick: "potencial por fase", algo como "seu F2L tem 1,8 s de folga contra o seu melhor".
- **Sum of Best.**
  - Lá: o tempo teórico somando os melhores segmentos.
  - Klick: "solve teórico" com as melhores fases somadas, uma meta motivadora.
- **Layouts por componentes.**
  - Lá: cada parte da tela é um componente reorganizável.
  - Klick: widgets reorganizáveis (scramble, imagem, estatísticas, gráfico, splits) com presets Minimal, Coach e Stream.
- **Precisão como valor.**
  - Lá: sincroniza com relógio atômico para corrigir deriva.
  - Klick: timestamps de evento; deriva do smart cube corrigida por regressão; comunicar a precisão de forma explícita.
- **Corridas e compartilhamento.**
  - Lá: integração com racetime.gg e upload de runs.
  - Klick: salas 1v1, links e imagens de resultado, overlay para streaming.

---

## 10. Implicações para o Klick

### 10.1 Klick hoje contra a barra do mercado

O que já tem: timer com inspeção de 15 s, scrambles 3x3, single/ao5/ao12, sessões, gráficos, PWA, i18n, export JSON, tutorial LBL, sons e sync no Supabase.

| Já é ponto forte | Falta para o essencial | Falta para diferenciar |
|---|---|---|
| PWA offline; sync no Supabase (raro entre timers web); i18n; tutorial LBL (ponte para iniciantes); sons | Outros 16 eventos com random-state e imagem; mo3 e ao25 a ao1000 (atual e melhor); +2/DNF com desfazer; entrada manual; import e export no formato do csTimer; fluxos de BLD, FMC e MBLD; atalhos | Garantia de dados (versões, lixeira, conflitos); stackmat e timers Bluetooth; smart cube; multiphase e splits estilo LiveSplit; insights; comp sim e Head-to-Head; modo foco e paleta de comandos; treino isolado |

### 10.2 As 5 maiores oportunidades

1. **Dados à prova de perda como feature de produto.**
   - Local primeiro (IndexedDB com armazenamento persistente) mais o sync do Supabase que o Klick já tem, num log de eventos só de acréscimo (a exclusão vira marcação).
   - Histórico de versões e lixeira; indicador de "backup em dia".
   - Import e export do csTimer sem perda, nos dois sentidos.
   - Ataca a dor nº 1 e o medo de lock-in [C7][C8][C9][C10][S20].
   - Conhecimento geral, a verificar: no iOS, sites fora da tela inicial podem perder o armazenamento após dias sem uso. Orientar a instalação como PWA.
2. **A profundidade do csTimer com a experiência do Monkeytype.**
   - Paridade no essencial: 17 eventos via cubing.js, imagens, ao5 a ao1000, inspeção com voz, stackmat e timers Bluetooth.
   - Embrulhado num modo foco, paleta de comandos, temas por tokens e mobile de primeira, sem anúncios.
   - É exatamente a lacuna entre o "poderoso mas poluído" e o "bonito mas raso" [C1][S39][A2].
3. **Splits e coach no estilo LiveSplit.**
   - Multiphase manual para todos, e automático com smart cube (CFOP/Roux).
   - Deltas contra o PB, fases "gold", potencial de ganho, soma das melhores fases, reconhecimento contra execução e TPS.
   - Nenhum timer de cubo traduz bem esse padrão. Transforma o timer em treinador [S10][S29][A3].
   - Web Bluetooth no Chromium e no Android; orientação clara para iOS (Bluefy).
4. **Modos fiéis à WCA e treino que não polui.**
   - Comp sim com cutoff, limite de tempo e Head-to-Head.
   - Modo WCA estrito: inspeção, truncamento e penalidades.
   - Regras de 2026–27 em dia: 3BLD em Bo5/Ao5, FTO, 4-pad.
   - Sessões de treino com repetição espaçada e scrambles de subconjunto fora dos PBs.
   - Responde a pedidos explícitos e posiciona o Klick como o timer "sério" [C32][W1][W3][W4].
5. **Confiança e artesanato contra a fadiga de "AI slop", mais uma trilha do iniciante ao competidor.**
   - Identidade visual autoral; performance e acessibilidade como marca.
   - Código aberto, ou ao menos dados abertos; sem anúncios.
   - Lançar com uma demonstração de algo único, não "mais um timer" [C17][C18].
   - O tutorial LBL e o i18n em pt-BR viram funil: do primeiro solve ao sub-20 (LBL, depois CFOP com treino de algoritmos). Poucos atuam nesse espaço; o CubeHead, por exemplo, divulga o Cube Academy v2, que une educação e timer [C34].

### 10.3 Anti-padrões a evitar

1. Visual de template genérico.
2. Login obrigatório para salvar.
3. Onboarding que exige criar sessão antes do 1º solve [S28].
4. Início por toque acidental [S28].
5. Comemoração de PB no 1º solve [S28].
6. Anúncios, ou paywall no básico.
7. Random-move em puzzles pequenos [C2].
8. Merge de sync que apaga dados [S28].
9. App pesado: o Nexus foi criticado pelos cerca de 100 MB [S28].
10. Três casas decimais piscando durante o solve [S39].
11. Funções escondidas sem descoberta (o problema do csTimer).
12. Falha silenciosa no Bluetooth.

### 10.4 Perguntas em aberto e próximos passos

- Validar com 5 a 10 cubers brasileiros, de iniciante a competidor, o ranking das dores. O que faria cada um trocar?
- Decidir a licença: open source total ou núcleo aberto. O argumento de confiança pesa no r/Cubers e no SpeedSolving.
- Medir quantos usuários atuais do Klick estão em iOS. Isso define a prioridade de smart cube contra stackmat e contra câmera.
- Acompanhar o rascunho das regras de início e parada em 4-pad, prometido para set/2026 [W4], e a regulamentação do FTO, prevista para jan/2027 [W3].

---

## 11. Fontes (acessadas em 07/10/2026)

### Produtos e páginas oficiais
- [S1] csTimer: https://cstimer.net/
- [S2] csTimer, código-fonte: https://github.com/cs0x7f/cstimer
- [S3] csTimer, opção de tempo para armar (`preTime`): https://github.com/cs0x7f/cstimer/blob/master/src/js/timer.js
- [S4] csTimer, regra de corte das médias (`trim` p5): https://github.com/cs0x7f/cstimer/blob/master/src/js/stats/timestat.js
- [S6] csTimer+ (Chrome Web Store): https://chromewebstore.google.com/detail/bfafldbloncllehfiaflmmjhohiobfmo
- [S7] CubeDesk: https://cubedesk.io/
- [S8] CubeDesk, página About: https://www.cubedesk.io/about
- [S9] CubeDesk, GitHub: https://github.com/kash/cubedesk
- [S10] Cubeast: https://www.cubeast.com/
- [S11] Cubeast, thread no SpeedSolving: https://www.speedsolving.com/threads/cubeast-a-speedcubing-timer-for-bluetooth-cubes-with-support-for-all-bluetooth-cubes-all-timers-and-all-major-solving-methods.77406/
- [S12] Twisty Timer, GitHub: https://github.com/aricneto/TwistyTimer
- [S13] Twisty Timer, Google Play: https://play.google.com/store/apps/details?id=com.aricneto.twistytimer
- [S14] Cubic Timer, Google Play: https://play.google.com/store/apps/details?id=com.hatopigeon.cubictimer
- [S15] Cubic Timer, GitHub: https://github.com/hato-ya/CubicTimer
- [S16] Prisma Puzzle Timer, thread no SpeedSolving: https://www.speedsolving.com/threads/prisma-puzzle-timer.25790/
- [S18] Block Keeper, GitHub: https://github.com/DallasMcNeil/Block-Keeper
- [S19] Block Keeper, thread no SpeedSolving: https://www.speedsolving.com/threads/block-keeper-cross-platform-desktop-timer.63611/
- [S20] ChaoTimer Exporter (ferramenta de terceiros): https://github.com/riyasy/ChaoTimerExporterForWindows
- [S21] CubeTime, App Store: https://apps.apple.com/us/app/cubetime/id1600392245
- [S22] cubetimer.com: https://cubetimer.com/
- [S23] qqTimer: http://www.qqtimer.net/
- [S24] ZYX Timer: https://zyx-timer.appstor.io/ e https://www.reddit.com/r/Cubers/comments/2sr8rv/i_spent_a_month_developing_the_best_puzzle_timer/
- [S25] Cyotheking, "Best timers": https://www.cyotheking.com/best-timers
- [S26] Nexus Timer: https://nexustimer.com/
- [S27] Nexus Timer, GitHub: https://github.com/bryanlundberg/NexusTimer
- [S28] Nexus Timer, thread no SpeedSolving: https://www.speedsolving.com/threads/nexus-timer-all-in-one-cubing-platform.92975/ (e /latest)
- [S29] acubemy: https://acubemy.com/
- [S30] acubemy, thread no SpeedSolving: https://www.speedsolving.com/threads/acubemy-one-smart-cube-app-to-rule-them-all.96004/
- [S31] SpeedSolving Puzzle Timer: https://www.speedsolving.com/pages/timer/
- [S32] Anúncio do SpeedSolving Timer: https://www.speedsolving.com/threads/new-speedsolving-timer.97451/
- [S33] GAN CubeStation NEW, App Store (avaliações): https://apps.apple.com/us/app/cubestation-new/id6473158674
- [S34] Cuboss, comparação de smart cubes: https://cuboss.com/which-smart-cube-to-buy-comparison/
- [S35] Timer por webcam (swiftcuber): https://www.speedsolving.com/threads/i-built-a-webcam-timer-so-you-dont-need-a-stackmat.97119/
- [S36] Cube-Vision: https://www.speedsolving.com/threads/a-timer-which-tracks-your-moves-using-only-the-camera-feedback-wanted.97625/
- [S37] Last Cube X, App Store: https://apps.apple.com/us/app/last-cube-x-cube-timer/id1661241296
- [S38] Vertex, App Store: https://apps.apple.com/us/app/vertex-cube-trainer/id6754180019
- [S39] Feedback ao yotimer (SpeedSolving): https://www.speedsolving.com/threads/update-on-the-rubiks-cube-timer-site.93594/
- [S40] SpeedSolving, Software Area (índice de threads 2024–2026): https://www.speedsolving.com/forums/software-area.31/
- [S41] CubeTime, GitHub: https://github.com/CubeLabsNZ/CubeTime
- [S42] qqTimer, espelho com autoria: https://github.com/cubing/qqTimer e https://www.speedsolving.com/wiki/index.php?title=QqTimer
- [S43] Agregador de reviews de timers iOS (appshunter): https://appshunter.io/ios/app/simple-cubing-timer/id1553850708/similar

### Comunidade
- [C1] SpeedSolving, "cstimer or cubedesk?" (enquete, dez/2025): https://www.speedsolving.com/threads/cstimer-or-cubedesk.95934/
- [C2] SpeedSolving, "Cubing Timer better than CsTimer?": https://www.speedsolving.com/threads/cubing-timer-better-than-cstimer.90449/
- [C3] SpeedSolving, "CubeDesk.io Vs. Cstimer": https://www.speedsolving.com/threads/cubedesk-io-vs-cstimer.89313/
- [C4] SpeedSolving, "Has anyone just switched from Cubedesk to Cstimer?": https://www.speedsolving.com/threads/has-anyone-just-switched-from-cubedesk-to-cstimer.97597/
- [C5] SpeedSolving, "What cubing timer should I get for my phone?": https://www.speedsolving.com/threads/what-cubing-timer-should-i-get-for-my-phone.91072/ ; anúncios no csTimer: https://www.reddit.com/r/cubing/comments/13o4c2h/cs_timer_has_ads_what_the_heck/
- [C6] SpeedSolving, "csTimer released" (posts de 2026): https://www.speedsolving.com/threads/cstimer-released.36236/
- [C7] Reddit, "i lost all my times on cstimer": https://www.reddit.com/r/Cubers/comments/1g4wuiu/i_lost_all_my_times_on_cstimer/
- [C8] Reddit, "I LOST EVERYTHING. CsTimer reset all of my solves": https://www.reddit.com/r/Cubers/comments/1kxxh32/i_lost_everything_cstimer_reset_all_of_my_solves/
- [C9] Reddit, "cstimer deleted 3 years worth of solves": https://www.reddit.com/r/Cubers/comments/1lxurce/cstimer_deleted_3_years_worth_of_solves/ e "What Happened to my csTimer?": https://www.reddit.com/r/Cubers/comments/1htdduh/what_happened_to_my_cstimer/
- [C10] Reddit, "RIP my 1000+ solves on Twisty Timer": https://www.reddit.com/r/Cubers/comments/5y893w/rip_my_1000_solves_on_twisty_timer_my_phone_broke/
- [C11] Reddit, "Some Features that would be really cool on Cs Timer": https://www.reddit.com/r/Cubers/comments/slyqdx/some_features_that_would_be_really_cool_on_cs/
- [C12] Reddit, "Which Timer you use and why?": https://www.reddit.com/r/Cubers/comments/1p5jjk9/which_timer_you_use_and_why/
- [C13] Reddit, "Suggestions to improve online cube timers?": https://www.reddit.com/r/Cubers/comments/10dwhei/suggestions_to_improve_online_cube_timers/
- [C14] Reddit, "What makes CS timer better than Cubedesk?": https://www.reddit.com/r/Cubers/comments/1hqwfpn/what_makes_cs_timer_better_than_cubedesk/
- [C15] Reddit, "I wish we had a Speedcubedb app, CStimer app and CubeDB app": https://www.reddit.com/r/Cubers/comments/1wu2zr3/i_wish_we_had_a_speedcubedb_app_cstimer_app_and/
- [C16] Reddit, "New Speed cubing timer, alternative to the rest out there.": https://www.reddit.com/r/Cubers/comments/1trscgf/new_speed_cubing_timer_alternative_to_the_rest/
- [C17] Reddit, proposta de banir apps "vibe-coded": https://www.reddit.com/r/Cubers/comments/1wmuzl7/proposal_ban_or_restrict_to_a_megathread_ai/
- [C18] Reddit, "Why is this sub filled with AI slop?": https://www.reddit.com/r/Cubers/comments/1uw9sad/why_is_this_sub_filled_with_ai_slop/
- [C19] Reddit, "What would you want in a cubing timer?": https://www.reddit.com/r/Cubers/comments/1wonlss/what_would_you_want_in_a_cubing_timer/
- [C20] Reddit, "What are some complaints you have about your speedcubing timer?": https://www.reddit.com/r/Cubers/comments/1ct3u3j/what_are_some_complaints_you_have_about_your/
- [C21] Reddit, "Best iOS cube timer?": https://www.reddit.com/r/Cubers/comments/1lrhmuw/best_ios_cube_timer/
- [C22] Reddit, "What is the best cubing app?": https://www.reddit.com/r/Cubers/comments/1oawrrh/what_is_the_best_cubing_app/
- [C23] Reddit, "How safe is the CubeStation app": https://www.reddit.com/r/Cubers/comments/1lsb2os/how_safe_is_the_cubestation_app/
- [C24] Reddit, "CubeStation App Update - July 2024": https://www.reddit.com/r/Cubers/comments/1dvrsmq/cubestation_app_update_july_2024/
- [C25] Reddit, "Gan's cube station software out of date": https://www.reddit.com/r/Cubers/comments/1dsesut/gans_cube_station_software_out_of_date/
- [C26] Reddit, "Is cubestation good?": https://www.reddit.com/r/Cubers/comments/1r75tvh/is_cubestation_good/
- [C27] Reddit, "App for smart cubes to improve and practice": https://www.reddit.com/r/Cubers/comments/1v68zpo/app_for_smart_cubes_to_improve_and_practice/
- [C28] Reddit, wiki de smart cubes: https://www.reddit.com/r/Cubers/wiki/smart_cubes/
- [C29] Reddit, demora para gerar scrambles no Cubic/Twisty: https://www.reddit.com/r/Cubers/comments/1kikbm2/why_does_cubic_timertwisty_timer_takes_a_little/
- [C30] Reddit, "Chao timer": https://www.reddit.com/r/Cubers/comments/11xu0nt/chao_timer/
- [C31] Reddit, wiki de timers: https://www.reddit.com/r/Cubers/wiki/timing_programs/
- [C32] Lemmy/feddit, treino poluindo estatísticas: https://feddit.it/post/3058493/3546873
- [C33] SpeedSolving, "Hiding the timer sped up my solves": https://www.speedsolving.com/threads/hiding-the-timer-sped-up-my-solves.77465/
- [C34] Reddit, "Cubehead is promoing a new online timer": https://www.reddit.com/r/Cubers/comments/1pxsezj/cubehead_is_promoing_a_new_online_timer/ (Cube Academy v2: https://www.cube.academy/future)
- [C35] Reddit, "Can I synchronize CSTimer on different devices?": https://www.reddit.com/r/Cubers/comments/1qb0tdx/can_i_synchronize_cstimer_on_diffrent_devices/
- [C36] Reddit, anúncio cobrindo o timer: https://www.reddit.com/r/Cubers/comments/1j4b3mo/cstimer_display_glitch_does_anyone_know_how_to/
- [C37] Reddit, opinião geral sobre smart cubes e Academy do Cubeast: https://www.reddit.com/r/Cubers/comments/10yeg2f/whats_the_general_opinion_on_smart_cubes/ e https://www.reddit.com/r/Cubers/comments/17aoyrh/smart_cubes_and_tools/
- [C38] Reddit, "A new CSTimer" (pedidos de Bluetooth com timer QiYi, splits via BT, import/export): https://www.reddit.com/r/Cubers/comments/1jummf5/a_new_cstimer/
- [C39] Reddit, "We made a new timer for iOS!" (lançamento do CubeTime; metas e Apple Watch): https://www.reddit.com/r/Cubers/comments/s9ya3y/we_made_a_new_timer_for_ios/
- [C40] Reddit, "New mobile speedcubing timer" (Cube Rivals; roadmap e comparação com Twisty): https://www.reddit.com/r/Cubers/comments/1czp8n0/new_mobile_speedcubing_timer/

### YouTube
- [Y1] CubeHead, "csTimer: The MUST HAVE Cube Timer!": https://www.youtube.com/watch?v=gWFlvHNrnGk
- [Y2] "Is CubeDesk better than csTimer?? | In-Depth Review": https://www.youtube.com/watch?v=JHME-5r2swg
- [Y3] "THIS WEBSITE IS BETTER THAN CSTIMER?! | app.cubedesk.io": https://www.youtube.com/watch?v=qlrk8pkEvPc
- [Y4] "TWISTY TIMER in-depth review!": https://www.youtube.com/watch?v=elqn-QZXtj0
- [Y5] "This App Makes Smart Cubes Worth It" (acubemy): https://www.youtube.com/watch?v=AMtBD3im6ac
- [Y6] "The Best Timers in 2024 - Ultimate Comparison!": https://www.youtube.com/watch?v=pQl5MwVPhB8

### WCA
- [W1] WCA Regulations (versão de 01/04/2026): https://www.worldcubeassociation.org/regulations/
- [W2] Programa oficial de scrambles (TNoodle-WCA-1.2.3): https://www.worldcubeassociation.org/regulations/scrambles/
- [W3] "Changes to the WCA's List of Official Events (June 2026)": https://www.worldcubeassociation.org/posts/changes-to-the-wca-s-list-of-official-events-june-2026
- [W4] "Adoption of 4-Pad Timing (August 2026)": https://www.worldcubeassociation.org/posts/adoption-of-4-pad-timing-august-2026
- [W5] cuberoot.me (compilação não oficial das mudanças): https://cuberoot.me/regulation/news e https://cuberoot.me/regulation/events

### Hardware e bibliotecas
- [H1] gan-web-bluetooth: https://github.com/afedotov/gan-web-bluetooth
- [H2] smartcube-web-bluetooth: https://github.com/poliva/smartcube-web-bluetooth
- [H4] cubing.js, módulo de scrambles: https://js.cubing.net/cubing/scramble/ (visão geral: https://js.cubing.net/cubing/)
- [H5] cubing.js, módulo Bluetooth: https://js.cubing.net/cubing/bluetooth/
- [H6] MDN, Web Bluetooth API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- [H7] caniuse, Web Bluetooth: https://caniuse.com/web-bluetooth
- [H8] stackmat.js: https://github.com/stilesdev/stackmat
- [H9] GAN Smart Timer: https://www.gancube.com/products/gan-smart-timer e https://speedcubeshop.com/products/gan-smart-timer-bluetooth
- [H11] QiYi Smart Timer: https://cuboss.com/shop/qiyi-smart-timer/?clang=en

### Análogos
- [A1] Monkeytype, GitHub: https://github.com/monkeytypegame/monkeytype
- [A2] Monkeytype, visão geral de features (documentação de terceiros): https://www.mintlify.com/monkeytypegame/monkeytype/features
- [A3] LiveSplit: https://livesplit.org/
- [A4] LiveSplit, GitHub: https://github.com/LiveSplit/LiveSplit
- [A5] LiveSplit, componentes: https://livesplit.org/components/
