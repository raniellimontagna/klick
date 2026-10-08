# Klick — Pesquisa 2: direção visual e craft de interação

**Data:** 07/10/2026
**Escopo:** visual e interação do app. O companion é pesquisado em paralelo; aqui ele só aparece como "onde ele mora".
**Método:** pesquisa pública (buscas na web, páginas oficiais, código aberto do csTimer, LiveSplit e Monkeytype). Sem login, sem formulários, sem downloads.
**Convenções:** *(terceiro)* indica fonte secundária ou interpretativa. *[inferência]* indica conclusão minha a partir das fontes. *[proposta]* indica sugestão de design minha, não um achado.

---

## 0. Resumo executivo

- **Recomendação:** usar **"Instrumento de Bolso"** como alma: hardware gráfico no espírito de Teenage Engineering + Braun + LCD de segmentos. A execução segue a **disciplina da "Precisão Silenciosa"** (Linear, Raycast) no chrome e nas estatísticas. A **camada de "Placar"** (LiveSplit) só aparece depois que o tempo para, e as **doses de "Brinquedo Premium"** (Family, Apple Fitness) ficam reservadas ao recorde. O companion **mora dentro do display**, como os bonecos de LCD dos Pocket Operators.
- **O momento-assinatura já existe na cultura:** é o ritual do stackmat (segura, vermelho, verde, solta). O csTimer codifica isso literalmente: vermelho `#f00`, verde `#0d0`, amarelo `#dd0` na inspeção, e limiar de 0 / 0,3 / 0,55 / 1 s.
- **O território está livre:** quase não há conceitos memoráveis de cube timer no Dribbble ou no Behance. Os apps "modernos" (CubeDesk, CubeTime) resolvem a função, mas não criam identidade.
- **Cor:** as 6 cores do cubo funcionam como **luz e informação**, nunca como decoração. Elas devem ser harmonizadas em OKLCH e separadas das cores de desempenho.
- **PWA:** o haptic no iOS é instável (o truque do switch pode ter sido fechado no iOS 26.5). Som e visual precisam carregar o feedback sozinhos.

---

## 1. Achados transversais

1. **A frequência decide o motion.** Ações diárias quase não têm animação, e ações raras ganham cerimônia. Isso aparece em Rauno Freiberg (frequência × novidade), em Emil Kowalski (não animar o que é funcional), no Family (deleite maior em funções raras) e no Raycast (confete só em conquista). Num timer, o solve é a ação mais frequente que existe, então o loop principal precisa ser **instantâneo**. O recorde é raro e merece um momento.
2. **Cor como função vence cor como enfeite.** Exemplos: Braun ET66 (amarelo só no "="), OP-1 (a cor do knob é a cor do parâmetro na tela), Slack (de 11 para 4 cores), Linear (menos croma azul no chrome).
3. **Todo hardware tem um palco: o display.** O EP-133 tem um display "super segment" híbrido, os Pocket Operators têm bonecos animados no estilo Game & Watch e o Nothing Glyph Matrix faz pixel art em micro-LEDs. Um display limita a escala do personagem, o que é ideal para o companion.
4. **Comparar com o próprio histórico motiva mais que ranking.** LiveSplit compara com o PB, o Strava dá medalhas de PR pessoais, o Gentler Streak foca no próprio histórico (ADA 2024) e o Monkeytype tem um pace caret no ritmo do seu PB.
5. **A precisão percebida nasce de tipografia estável:** dígitos de largura fixa, decimais menores e nada pulando na tela. O csTimer tem opção de fonte menor depois do ponto decimal, e LiveSplit e Monkeytype usam números mono ou tabulares.
6. **Foco é recurso de produto, não só estética.** O csTimer tem a opção de esconder todos os elementos ao cronometrar, o focus mode do Monkeytype oculta header e footer, e o CubeDesk tem focus mode.
7. **A regra vai mudar o gesto.** A WCA vai exigir o StackMat G5 em modo 4-pad a partir de 02/01/2027, e as regras de início e parada estão em revisão. *[inferência]* No toque, "armar com dois polegares" conversa com essa mudança e reduz partidas acidentais.

---

## 2. Direções visuais candidatas

### Direção A — "Instrumento de Bolso"

**Clima.** Um cronômetro de competição que a Teenage Engineering desenharia para a Braun. É um objeto **gráfico**, não fotorrealista: chassi neutro, display escuro com segmentos, rótulos curtos em caixa-alta espaçada e um único acento de "sinal". É preciso, tátil, com humor contido.

**Referências (e o que tirar de cada uma)**
- **Teenage Engineering EP-133 K.O. II.** O display é vendido como "super segment hybrid", com ícones retroiluminados e uma matriz. A Yanko Design lê a paleta como LCARS. A ideia é combinar dígitos de segmento (o tempo) com uma pequena matriz (companion e avisos). [New Atlas](https://newatlas.com/music/teenage-engineering-ep-133-ko-ii) · [Sound On Sound](https://www.soundonsound.com/reviews/teenage-engineering-ep-133-ko-ii)
- **Pocket Operators.** LCD no estilo Game & Watch: cada modelo tem sua animação, e os bonecos se movem com a música. Aqui o companion vira um sprite de LCD sincronizado ao estado do timer. [Desirability Lab](https://desirabilitylab.com/backfill/backfill-2024-04-teenage-engineering-pocket-operator) · [FACT](https://factmag.com/2015/01/23/teenage-engineering-unveil-an-affordable-synthesizer-that-fits-in-your-pocket)
- **OP-1 / OP-1 field.** Os 4 knobs correspondem às cores dos gráficos na tela: azul, verde, branco e laranja no original; azul, ocre, cinza e laranja no field. Cor = mapeamento. [Guia oficial TE](https://teenage.engineering/guides/op-1/original/layout)
- **TP-7.** O rolo motorizado gira enquanto grava, e pousar o dedo nele pausa. É um feedback que também é controle: no Klick, o anel de "armar" seria o próprio botão. [Core77](https://www.core77.com/posts/123387) · [Design Milk](https://design-milk.com/teenage-engineering-tp-7-offers-the-reel-sensation-of-tactile-controls/)
- **Braun ET66 (Rams & Lubs, 1987).** Teclas redondas convexas, código de cor por função e amarelo reservado ao "=". No **Braun BC02**, a assinatura é o ponteiro de segundos amarelo. Lição: um acento só, na coisa que importa. [V&A](https://collections.vam.ac.uk/item/O1360553) · [Museum Angewandte Kunst](https://sammlung-digital.museumangewandtekunst.de/detailpage/collection/8aaba9e5-2b9b-47ac-b304-11074467d180) · [Braun Audio](https://www.braun-audio.com/en-ES/stories/design/braun-colour-choices/) · [BC02](https://www.illuminee.com/products/bc02-travel-alarm-clock)
- **Casio F-91W e LCDs de segmento.** Os segmentos são nomeados de A a G, e as restrições de caracteres viram linguagem. No Klick, os rótulos caberiam em 7 ou 14 segmentos: `AO5`, `AO12`, `PB`, `DNF`, `+2`. [Sensor Watch](https://sensorwatch.net/docs/wig/display) · [Wikipedia](https://en.wikipedia.org/wiki/Casio_F-91W)
- **Nothing Glyph Matrix (Phone 3).** Uma matriz programável de micro-LEDs funciona como tela de recados lúdica. A fonte Ndot **não tem licença pública**, então o caminho é usar Doto ou Geist Pixel Circle. [Design Milk](https://design-milk.com/the-nothing-phone-3s-glyph-matrix-turns-notifications-into-pixel-art/) · [Dezeen (Adam Bates)](https://www.dezeen.com/2024/02/20/nothing-tech-smartphone-design-adam-bates-interview/) · [Nothing Community](https://nothing.community/d/104-ndot57-the-nothing-typeface)
- **Elektron Digitakt.** OLED de 128×64, oito encoders cujo papel acompanha a seção da tela e páginas organizadas por função. No desktop, isso vira teclas mapeadas a zonas fixas do display. [MusicRadar](https://www.musicradar.com/reviews/elektron-digitakt) · [Sound On Sound](https://www.soundonsound.com/reviews/elektron-digitakt)
- **Cronômetro do Apple Watch.** A volta mais rápida aparece em verde e a mais lenta em vermelho. [Apple Support](https://support.apple.com/guide/watch/apd0d5883fca)

**Paleta [proposta]**
- Chassi claro "alumínio quente" ≈ `#E6E4DF`; chassi escuro "grafite" ≈ `#1B1B1A`.
- Display noturno: fundo ≈ `#0C0D0B`, segmento aceso ≈ `#EDEDE6` e **segmento fantasma** com cerca de 7% de opacidade. Variante retrô "LCD refletivo": fundo ≈ `#B9C1AB`, segmento ≈ `#1D2219`.
- Acento único de sinal: laranja ≈ `oklch(0.70 0.19 45)`, para marca e estado ativo. Vermelho e verde ficam reservados ao ritual de armar.
- As 6 cores do cubo aparecem como **LEDs pequenos** (seletor de evento) e no **preview do scramble**, nunca em áreas grandes.

**Tipografia.** O tempo vai em **DSEG7** com segmentos fantasma, ou em **Geist Pixel Square/Grid** se o DSEG soar como relógio barato. Rótulos em **Geist Mono** ou **JetBrains Mono**, em caixa-alta com tracking aberto. Avisos e companion em **Doto** ou **Geist Pixel Circle** (matriz de pontos).

**Interação-assinatura: "armar como hardware".**
1. Segurar o espaço (ou dois polegares, no toque).
2. Acende um LED vermelho, e um anel de segmentos se ilumina em sequência durante o limiar (0,3 a 0,55 s).
3. O LED fica verde e soa um "klick".
4. Soltar dispara o timer: o chassi esmaece e sobra só o display.
5. No stop, os dígitos travam com uma única piscada do separador, o delta aparece na linha de baixo em 14 segmentos e o companion reage na matriz.

**Onde mora o companion.** Numa janela de matriz de pontos dentro do display, de algo como 24×24 ou 32×16. A escala fica limitada por construção, então o personagem nunca disputa com o tempo e pode "dormir" durante o solve. A referência cultural óbvia é o Tamagotchi.

**Riscos**
- Virar um pastiche reconhecível da Teenage Engineering.
- O skeuomorfismo pesado envelhece e pesa: manter um "hardware gráfico" vetorial, com profundidade sutil.
- Segmentos de 7 são ruins para texto e para leitor de tela; o tempo precisa existir também como texto real.
- No desktop, o "objeto" pode ficar pequeno: o display cresce e o chassi vira moldura.

---

### Direção B — "Precisão Silenciosa"

**Clima.** Uma ferramenta profissional calma, com quase nada na tela além do necessário. O craft está nos detalhes invisíveis: alinhamento, tempo de resposta, atalhos e transições que você não percebe.

**Referências**
- **Linear.** Os temas são calculados em LCH a partir de **3 entradas (base, acento, contraste)**, em vez de 98 variáveis. O chrome tem menos croma azul, e os títulos usam Inter Display. [Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)
- **Raycast** *(terceiro)*. Meta de resposta em torno de 50 ms, painel de ações ⌘K com atalhos visíveis, toasts que somem sozinhos e confete só em conquistas (existe até o deeplink `raycast://confetti`). [Guia](https://blakecrosley.com/guides/design/raycast) · [Unsung](https://unsung.aresluna.org/raycasts-confetti-cannon/)
- **Vercel Geist.** Sans, Mono e, desde fevereiro de 2026, **Pixel** compartilham métricas. Dá para trocar de voz sem quebrar o alinhamento. [vercel.com/font](https://vercel.com/font) · [Geist Pixel](https://vercel.com/blog/introducing-geist-pixel)
- **Things 3.** O Magic Plus deixa você arrastar o "+" até o ponto exato da lista onde o item deve nascer. [Cultured Code](https://www.culturedcode.com/things/support/articles/2803582) · [MacStories](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)
- **Arc.** Gradiente e cor por Space, como identidade escolhida pelo usuário. O projeto está em manutenção desde 2025. [Guia (terceiro)](https://blakecrosley.com/guides/design/arc) · [The Register](https://www.theregister.com/2025/05/27/arc_browser_development_ends/)
- **Rauno Freiberg.** Interruptibilidade, resposta imediata ao gesto, frequência × novidade e "fidgetability". [Ensaio](https://rauno.me/craft/interaction-design)
- **Emil Kowalski.** Ease-out como padrão, ease-in-out para o que já está na tela, transform-origin no gatilho e nenhuma animação em elementos funcionais. [Good vs Great Animations](https://emilkowal.ski/ui/good-vs-great-animations)
- **Paco Coursey.** O cmdk (MIT) é um command menu acessível e sem estilo próprio. [cmdk](https://github.com/pacocoursey/cmdk)

**Paleta [proposta].** Base escura ≈ `oklch(0.16 0.005 260)` (≈ `#0E0F11`), superfícies em passos de +0,03 de L, texto com L 0,95 e texto secundário com L 0,65. O acento é **uma** das 6 cores do cubo, por evento ou por escolha do usuário, sempre harmonizada em OKLCH. O tema claro usa base com L 0,985.

**Tipografia.** Geist Sans + Geist Mono, com o tempo em Mono Medium e decimais menores. Alternativa: Inter + Inter Display com `tnum` e zero barrado.

**Interação-assinatura: "tudo a um atalho".** O espaço controla o timer, e o ⌘K troca evento ou sessão, repete o scramble, aplica +2/DNF e exporta. Os atalhos ficam impressos ao lado de cada ação, e as ações frequentes não têm animação. O tempo final "assenta" em até 150 ms, e o delta aparece discreto.

**Onde mora o companion.** Pequeno, num canto ou numa barra de status. *[inferência]* É a direção em que ele mais destoa.

**Riscos.** Virar "mais um SaaS escuro", ter baixa memorabilidade, parecer clone do Linear e ficar frio demais para um app com personagem.

---

### Direção C — "Brinquedo Premium"

**Clima.** Alegria com acabamento: formas macias, cor viva mas organizada, tudo responde ao toque, celebrações merecidas e companion como protagonista.

**Referências**
- **Duolingo.** Os personagens são dirigidos por state machine no Rive. As bocas são sincronizadas por timestamps do áudio, e a Lily combina 8 cabeças e 8 corpos para mais de 64 variações de idle. A marca tem uma cor-herói (Feather Green `#58CC02`; na dúvida, verde). O botão "pressionável" tem borda inferior escura e afunda ao toque *(especificação de terceiros)*. [Blog Duolingo](https://blog.duolingo.com/world-character-visemes) · [Rive](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life) · [Cores Duolingo](https://design.duolingo.com/identity/color) · [Spec (terceiro)](https://open-design.ai/plugins/design-system-duolingo/)
- **Family (Benji Taylor).** A escada é simplicidade, depois fluidez, depois encanto. Os trays crescem do botão, com uma ação por tray e alturas diferentes entre passos. "Continue" vira "Confirm" reaproveitando letras, e as vírgulas deslizam ao digitar. O deleite é maior em funções raras, e há confete ao concluir o backup. [Family Values](https://benji.org/family-values)
- **Flighty.** Estados contextuais (o guia de terceiros fala em 15), linguagem de painel de aeroporto e ADA 2023 em Interação. [Guia PT-BR (terceiro)](https://blakecrosley.com/pt-BR/guides/design/flighty) · [Wikipedia](https://en.wikipedia.org/wiki/Flighty)
- **Apple Fitness/Watch.** As conquistas são renderizadas em 3D em tempo real, giram com o dedo e trazem o nome gravado. [Benjamin Mayo](https://bzamayo.com/apple-watch-3d-trophies)
- **Airbnb (verão de 2025).** Ícones 3D "dimensionais" e interface animada, a chamada "era da textura". [TechBuzz](https://techbuzzireland.com/2025/05/14/redesigned-airbnb-app-now-available/) · [HospitalityNet](https://www.hospitalitynet.org/opinion/4127228.html)
- **Gentler Streak.** Tom gentil, foco no próprio histórico e descanso como parte do caminho (ADA 2024, Impacto Social). [Apple Design Awards](https://developer.apple.com/design/awards/2024) · [9to5Mac](https://9to5mac.com/2022/06/30/go-gentler-streak-apple-watch-update/)

**Paleta [proposta].** Fundo "papel" quente ≈ `#FAF7F2` ou grafite quente ≈ `#1E1C1A`. As 6 cores do cubo vão num "doce profundo" (OKLCH com C entre 0,14 e 0,17), com borda inferior em ΔL −0,12 e sombras coloridas curtas.

**Tipografia.** Space Grotesk (o Google Fonts indica figuras tabulares) em títulos e números. Em aparelhos Apple, `ui-rounded` (o SF Pro Rounded do sistema, sem embarcar) dá um toque extra.

**Interação-assinatura: "botão esmagável + recorde que vira objeto".** No mobile, um botão grande afunda 4 px ao toque. O PB vira uma medalha ou um cubo 3D girável, com tempo e data gravados, e o companion grande reage com expressões.

**Onde mora o companion.** No centro da cena. É ótimo para engajamento e ruim para foco, porque precisa sumir durante o solve.

**Riscos**
- Infantilizar, que é o maior risco das 6 cores.
- Gamificação manipuladora, como streak punitivo.
- Peso de Rive e 3D num PWA.
- Distração no momento do solve.
- Afastar o público competitivo.

---

### Direção D — "Placar de Treino"

**Clima.** Cada solve é uma corrida contra você mesmo: números densos, deltas coloridos, gráficos de evolução e linguagem de cronometragem esportiva.

**Referências**
- **LiveSplit.** Cores semânticas padrão, tiradas do código do livesplit-core:
  - À frente e ganhando: `hsla(136,100%,40%)` ≈ `#00CC36`.
  - À frente e perdendo: `hsla(136,55%,60%)` ≈ `#61D17F`.
  - Atrás e ganhando: `hsla(0,55%,60%)` ≈ `#D16161`.
  - Atrás e perdendo: `hsla(0,100%,40%)` ≈ `#CC0000`.
  - Melhor segmento (ouro): `hsla(50,100%,50%)` ≈ `#FFD500`.
  - Novo PB: `hsla(203,100%,54%)` ≈ `#14A5FF`.
  - Fundo: L 6% ≈ `#0F0F0F`.

  [general_settings.rs](https://github.com/LiveSplit/livesplit-core/blob/master/src/layout/general_settings.rs) · [semantic_color.rs](https://github.com/LiveSplit/livesplit-core/blob/master/src/settings/semantic_color.rs) · [Componentes](https://livesplit.org/components/)
- **Monkeytype.** O focus mode oculta header e footer. A tela de resultado mostra WPM, precisão, raw, consistência, caracteres e um gráfico. O **pace caret** corre no ritmo do seu PB, da sua média, do último teste ou de um valor custom. Os temas seguem um contrato de 10 cores. [Repo](https://github.com/monkeytypegame/monkeytype) · [themes.ts](https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/constants/themes.ts) · [Docs (terceiro)](https://mintlify.wiki/monkeytypegame/monkeytype/features)
- **Strava.** Medalhas para seus 3 melhores esforços num segmento, coroa para o recorde do segmento, troféu para o top 10 e medalhas por distância. [Strava Support](https://support.strava.com/hc/en-us/articles/216917137-Achievement-Awards-Glossary)
- **Whoop.** A recuperação tem 3 bandas: verde de 67 a 100, amarelo de 34 a 66 e vermelho de 0 a 33. O strain vai de 0 a 21, em escala logarítmica, com 4 zonas. [Whoop Developer](https://developer.whoop.com/docs/whoop-101) · [Strain 101](https://www.whoop.com/au/en/thelocker/how-does-whoop-strain-work-101)
- **Oura (redesign de outubro de 2025).** Três camadas de visualização: leitura rápida, padrões de curto prazo e exploração de semanas a anos. Readiness de 85 ou mais é ótimo, de 70 a 84 é bom. [Instrument](https://www.instrument.com/work/oura-app) · [9to5Google](https://9to5google.com/2025/10/20/oura-app-redesign/) · [Oura](https://ouraring.com/blog/readiness-score/)
- **Transmissões de natação.** A linha vermelha do recorde virtual sobre a piscina (Omega; conceito da Orad desde Sydney 2000). [Naftemporiki](https://www.naftemporiki.gr/deltia-typou/714530/pool-precision/) · [Next TV](https://www.nexttv.com/news/nbc-considers-virtual-swimming-74371)

**Paleta.** Neutro escuro com as semânticas no estilo LiveSplit. Ouro e azul são os positivos, e as cores do cubo servem só como identificador de evento.

**Tipografia.** Geist Mono ou JetBrains Mono nos números. Martian Mono, com largura de 75 a 112,5, nas colunas densas.

**Interação-assinatura: "corrida contra o fantasma".** Antes do solve, o alvo fica visível (PB ou ao5). Durante, aparece opcionalmente uma linha de recorde. No stop, entram o delta colorido e os splits por fase com ouro, além de um heatmap de consistência.

**Onde mora o companion.** Como técnico ou torcedor, no pós-solve.

**Riscos.** Virar o dashboard genérico que o projeto quer evitar, gerar ansiedade de desempenho e depender de volume de dados. Além disso, o vermelho e o verde semânticos colidem com o vermelho e o verde do cubo.

---

### Comparativo rápido

| | A — Instrumento | B — Silenciosa | C — Brinquedo | D — Placar |
|---|---|---|---|---|
| Memorabilidade | Alta | Média-baixa | Alta | Média |
| Foco durante o solve | Alto | Alto | Médio | Médio |
| Encaixe com o companion | Alto (mora no display) | Baixo | Altíssimo (protagonista) | Médio |
| Clichê a evitar | Clone de TE | Clone de Linear | Duolingo/infantil | Dashboard |
| Custo de execução | Médio-alto (display, ilustração) | Baixo | Alto (Rive/3D) | Médio |

---

## 3. Recomendação

**A como alma, B como disciplina, D só no pós-solve e C só no recorde.**

Por quê:
1. **A metáfora é coerente.** Speedcubing já é uma cultura de hardware: stackmat, cubos magnéticos e smart, timers. Tratar o app como instrumento conversa com isso, e o ritual vermelho/verde vira linguagem nativa em vez de enfeite.
2. **É memorável sem infantilizar.** A identidade vem da **forma** (display, segmentos, rótulos, um acento), não de cor saturada em todo lugar.
3. **O companion ganha um palco natural.** O display dá escala controlada, como no Pocket Operator, no Game & Watch e no Glyph Matrix. O personagem existe sem disputar com o tempo.
4. **B impede o kitsch.** Chrome mínimo, atalhos, motion econômica e nada animado no que se repete.
5. **D só aparece onde informa.** Deltas, splits e ouro surgem depois do stop, nunca durante.
6. **C vira recompensa rara.** PB e marcos ganham um momento (objeto girável, confete, companion), sempre com uma versão para movimento reduzido.

### Estados do timer na direção recomendada [proposta]

| Estado | Visual | Motion | Som | Haptic (onde houver) | Gancho para o companion |
|---|---|---|---|---|---|
| Ocioso | Scramble em mono; display com ao5/ao12/PB; chassi completo | Idle sutil | — | — | Idle, olhando em volta |
| Segurando (antes do limiar) | LED vermelho; anel de segmentos enchendo | Progresso linear no limiar | — | Leve, no início | "Atento" |
| Pronto | LED verde | Troca seca, sem easing | "Klick" curto | Tap | "Preparado" |
| Inspeção | Amarelo; contagem de 15 a 0; alertas aos 8 e 12 s | Pulso nos alertas | Bip aos 8 e 12 s | Tap nos alertas | "Estudando o cubo" |
| Resolvendo | Chrome some; só os dígitos, com precisão reduzida | Nenhum | — | — | Dorme, quieto |
| Parado | Precisão total; delta abaixo | "Assentar" em 120–180 ms, interrompível | Tick | Tap | Reage ao delta |
| PB | Ouro + momento | Spring + partículas (só sem movimento reduzido) | Chime | Padrão "sucesso" | Celebra |
| +2 / DNF | Marcação no tempo e na lista | Troca seca | Tom grave curto | — | "Ops", gentil |

### Regras de ouro [proposta]
1. O tempo é o herói, o display é o palco e o companion mora no display.
2. Nada pode atrasar o próximo solve: toda animação depois do stop é interrompível pelo próximo "armar".
3. A medição usa `performance.now()` e o timestamp do evento (keyup/pointerup), nunca o relógio da animação.
4. Um acento por tela. As 6 cores juntas só aparecem no scramble e no PB.
5. Rótulos curtos, que caberiam num LCD.
6. Toda informação passada por cor também é passada por forma, sinal ou texto.
7. Som e haptic são reforço, nunca o único canal.
8. Identidade sonora: o nome pede um **"klick"**, um clique mecânico curto (botão de cronômetro, giro de cubo) usado só ao armar e ao parar.

---

## 4. Tipografia para numerais gigantes

**Requisitos:**
- Dígitos de largura fixa (mono ou `tnum`), com um "1" que não encolhe.
- Separadores estáveis.
- Boa leitura entre 15 e 30 vw, com peso que aguente fundo escuro.
- Licença que permita self-host num PWA.

| Fonte | Estilo | Licença | Onde obter | Recursos numéricos | Uso no Klick |
|---|---|---|---|---|---|
| **Geist Mono** | Mono neo-grotesca | OFL 1.1 | [vercel.com/font](https://vercel.com/font), npm `geist` | Mono, dígitos fixos. O Google Fonts **não** suporta `font-feature-settings`: usar npm ou zip | Tempo (B), rótulos (A) |
| **Geist Pixel** (Square/Grid/Circle/Triangle/Line) | Pixel com métricas da Geist | OFL (família Geist) | npm `geist` (`geist/font/pixel`); eixo `ELSH` no Google Fonts | 480 glifos, 7 sets; usar a partir de 32 px | Tempo gigante (A); a Circle funciona como matriz de pontos |
| **JetBrains Mono** | Mono | OFL 1.1 | [jetbrains.com/lp/mono](https://www.jetbrains.com/lp/mono/) | Variável; existe build com zero barrado | Alternativa à Geist Mono |
| **Berkeley Mono** | Mono técnica/retrô | **Paga**: Developer US$ 75 (não comercial), Indie US$ 225, Standard Business US$ 845; uso comercial restrito a UI | [usgraphics.com](https://usgraphics.com/products/berkeley-mono) · [catálogo](https://usgraphics.com/catalog) | — | Só com orçamento e depois de ler os termos |
| **Departure Mono** | Pixel mono | OFL | [departuremono.com](https://departuremono.com/) · [GitHub](https://github.com/rektdeckard/departure-mono) | Nítida em múltiplos de 11 px | Rótulos e HUD retrô |
| **Doto** | Dot-matrix mono (grade 6×10) | OFL 1.1 | [Google Fonts](https://fonts.google.com/specimen/Doto) · [GitHub](https://github.com/oliverlalan/Doto) | Eixos `ROND` (arredondamento) e `wght` | Substituta legal da Ndot; avisos e companion |
| **Space Grotesk** | Grotesca derivada da Space Mono | OFL | [Google Fonts](https://fonts.google.com/specimen/Space+Grotesk/about) | Figuras tabulares e zero barrado | Títulos e números (C) |
| **Inter / Inter Display (v4)** | Neo-grotesca; a Display vem pelo eixo `opsz` | OFL | [rsms.me/inter](https://rsms.me/inter/) · [releases](https://github.com/rsms/inter/releases) | `tnum`, `zero`, `ss01` (dígitos abertos), `cv11` | UI e tempo com `tnum` (B) |
| **DSEG7 / DSEG14** | 7 e 14 segmentos (Classic/Modern, 3 pesos + itálico, Mini) | OFL 1.1 (o nome "DSEG" é reservado) | [keshikan.net](https://www.keshikan.net/fonts-e.html), [Fontsource](https://fontsource.org/fonts/dseg7-classic/about), npm | "8" acende tudo e "!" apaga tudo; ":" tem a largura do espaço; "." tem largura zero | Tempo (A); rótulos em 14 segmentos |
| **VT323** | Terminal bitmap | OFL | [Google Fonts](https://fonts.google.com/specimen/VT323) | Mono | Easter egg ou tema retrô |
| **Sixtyfour / Convergence** | Pixel no estilo C64/CRT | OFL | [Google Fonts](https://fonts.google.com/specimen/Sixtyfour) · [eixo SCAN](https://fonts.google.com/knowledge/glossary/scan_axis) | Eixos `BLED` e `SCAN`; a Convergence tem desalinhamento RGB (COLRv1) | Tema "CRT" opcional |
| **Handjet** | Matriz de elementos | OFL 1.1 | [Rosetta](https://rosettatype.com/Handjet) | `ELSH` (23 formas), `ELGR`, `wght`; há avisos de renderização no macOS | Experimentos de matriz |
| **Martian Mono** | Mono variável | OFL 1.1 | [GitHub](https://github.com/evilmartians/mono), Google Fonts | Largura de 75 a 112,5; peso de 100 a 800 | Colunas densas de stats (D) |
| **Commit Mono** | Mono neutra | OFL 1.1 | [commitmono.com](https://commitmono.com/) | Mono | Alternativa neutra |
| **IBM Plex Mono** | Mono | OFL | [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Mono) | Mono | Alternativa sóbria |
| **Ndot 55/57 (Nothing)** | Dot-matrix | Proprietária, sem licença pública | — | — | **Não usar** |
| **SF Pro / SF Mono / SF Rounded** | Fontes de sistema da Apple | Restrita a mockups e apps Apple; não pode ser webfont | [developer.apple.com/fonts](https://developer.apple.com/fonts/) · [fórum](https://developer.apple.com/forums/thread/127350) | — | Só via `system-ui`, `ui-monospace` ou `ui-rounded`, sem embarcar |

**Recomendação tipográfica**
- **Para a direção recomendada:**
  - Tempo em **DSEG7 Classic** com camada de segmentos fantasma, ou em **Geist Pixel Square** se o DSEG soar como relógio barato nos testes.
  - Rótulos em **Geist Mono**, caixa-alta.
  - Companion e avisos em **Doto** ou **Geist Pixel Circle**.
  - UI de texto (configurações, listas) em **Geist Sans**.
  - Tudo é OFL e tudo pode ser self-hosted.
- **Plano B sóbrio:** Geist Mono no tempo, com decimais em torno de 60% do tamanho.

**Notas técnicas**
- Use `font-variant-numeric: tabular-nums` em qualquer fonte proporcional, com um container de largura fixa em `ch`, para que o tempo nunca empurre o layout. [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)
- Decimais menores, como na opção "fonte pequena após o ponto decimal" do csTimer, alinhados pela linha de base.
- Pré-carregar a fonte do display: o tempo não pode trocar de fonte no meio de um solve. *[proposta]*
- Acessibilidade: o tempo final precisa existir como texto anunciado, por exemplo com `aria-live="polite"` só no stop, nunca durante o solve. *[proposta]*

---

## 5. Craft de interação

### 5.1 Segurar para iniciar (o ritual do stackmat)
- **O que o csTimer faz**, segundo o código-fonte: com o espaço pressionado, o display fica vermelho (`#f00`); passado o limiar `preTime`, fica verde (`#0d0`). Soltar no verde inicia o timer, e soltar antes cancela. O limiar padrão é **0,3 s**, com opções de 0 / 0,3 / 0,55 / 1 s. [timer.js](https://github.com/cs0x7f/cstimer/blob/master/src/js/timer.js)
- **Stackmat:** segundo a wiki comunitária, a luz verde acende cerca de 0,55 s depois que as duas mãos tocam os sensores. O G5 bloqueia os controles por 0,5 s depois de cada parada, para evitar reset acidental. [EverybodyWiki](https://en.everybodywiki.com/StackMat_timer) · [SpeedSolving Wiki](https://www.speedsolving.com/wiki/index.php/StackMat)
- **WCA:** o G5 em modo 4-pad passa a ser obrigatório em 02/01/2027, e as regras de início e parada estão em revisão. [WCA](https://www.worldcubeassociation.org/posts/adoption-of-4-pad-timing-august-2026)
- **Para o Klick [proposta]:**
  - Feedback **contínuo** durante o limiar (anel ou segmentos enchendo), em vez de só trocar de cor.
  - Um modo "stackmat" (0,55 s) e um modo "rápido" (0,3 s).
  - No toque, exigir **dois pontos de contato**.
  - Um cooldown de cerca de 0,5 s depois do stop antes de aceitar um novo armar.
  - Suprimir o callout e a seleção de texto do iOS na zona de toque (`-webkit-touch-callout: none`, `user-select: none`). [MDN](https://developer.mozilla.org/docs/Web/CSS/-webkit-touch-callout)

### 5.2 Inspeção
- Na WCA, a inspeção dura 15 s; passar disso até 17 s vale +2, e acima de 17 s é DNF. Essa regra está codificada, por exemplo, no `use-keyboard-timer`. No csTimer, há alertas de voz aos 8 e 12 s e a cor amarela (`#dd0`) ao segurar durante a inspeção. [npm use-keyboard-timer](https://npmjs.com/package/use-keyboard-timer)
- **No Klick:** contagem regressiva em 14 segmentos, pulso visual e sonoro nos alertas e penalidade automática com uma explicação curta.

### 5.3 Modo foco (a UI some)
- O csTimer tem a opção "esconder todos os elementos ao cronometrar", o focus mode do Monkeytype oculta header e footer, e o CubeDesk tem focus mode. [Strings do csTimer](https://github.com/cs0x7f/cstimer/blob/master/src/lang/en-us.js) · [Docs Monkeytype (terceiro)](https://mintlify.wiki/monkeytypegame/monkeytype/features) · [CubeDesk](https://www.cubedesk.io/about)
- **No Klick:** fade de opacidade em até 120 ms, sem deslocamento, para que nada se mova no campo de visão. A precisão exibida também cai durante o solve; o csTimer oferece tempo real, 0,1 s, segundos, só inspeção ou nada.

### 5.4 Transição do tempo final
- Com dígitos de largura fixa, os decimais "acendem" com a precisão total no stop. O delta contra o PB ou a ao5 entra uns 100 a 150 ms depois, nas cores do LiveSplit. A ao5 e a ao12 rolam com direção semântica, como no NumberFlow (`trend`: sobe para cima, desce para baixo). [NumberFlow](https://number-flow.barvian.me) · [npm](https://npmjs.com/package/@number-flow/react)
- A transição é interruptível (Rauno): apertar de novo pula tudo e arma o próximo solve.
- Labels fazem morph reaproveitando letras, como no Family. [Family Values](https://benji.org/family-values)

### 5.5 Celebração de recorde
- **Proporcional à raridade:** Family (encanto maior no que é raro), Raycast (confete só em conquista), Rauno (frequência × novidade).
- **Um objeto para "brincar":** as conquistas do Apple Watch são renderizadas em 3D, giram com o dedo e trazem o nome gravado. [Benjamin Mayo](https://bzamayo.com/apple-watch-3d-trophies)
- **Cores de recorde já convencionadas:** ouro para o melhor segmento e azul para novo PB (LiveSplit).
- **No Klick [proposta]:**
  - PB de single e PB de média são diferentes, e o de média merece mais cerimônia.
  - O companion lidera a celebração.
  - Um "cubo-medalha" na matriz que gira por arrasto.
  - Com movimento reduzido: troca de cor e texto, sem partículas.

### 5.6 Motion com spring
- **Apple (WWDC23):** springs definidas por **duração e bounce**, com presets smooth, snappy e bouncy. Bounce 0 continua sendo spring. [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10158/)
- **Motion:** `visualDuration` e `bounce` (padrão 0,25). [motion.dev](https://motion.dev/dom/spring)
- **CSS puro:** `linear()` aproxima springs (Chrome e Edge 113, Firefox 112, Safari 17.2), com o gerador de Jake Archibald e Adam Argyle. [Chrome for Developers](https://developer.chrome.com/docs/css-ui/css-linear-easing-function) · [Gerador](https://linear-easing-generator.netlify.app)
- **No Klick [proposta]:** bounce 0 no loop principal, bounce entre 0,15 e 0,25 só nos trays e no PB, e ease-out como padrão (Emil).

### 5.7 Haptics (PWA)
- **Android:** `navigator.vibrate()`. Não tem efeito sem motor de vibração e, em geral, exige gesto do usuário. [MDN](https://developer.mozilla.org/docs/Web/API/Vibration_API)
- **iOS:** não há Vibration API. As bibliotecas **web-haptics** (Lochie Axon) e **ios-haptics** usam um `<input type="checkbox" switch>` escondido. O WebKit passou a exigir ativação do usuário (bug 285120), e há relatos de que o truque parou de funcionar no iOS 26.5. [web-haptics](https://github.com/lochie/web-haptics) · [ios-haptics](https://npmjs.com/package/ios-haptics) · [WebKit 285120](https://bugs.webkit.org/show_bug.cgi?id=285120)
- **No Klick:** haptic é bônus, e nada depende dele.

### 5.8 Sound design
- O use-sound, de Josh Comeau (sobre o Howler.js), parte da ideia de que som usado com gosto dá fisicalidade à interface. [Artigo](https://joshwcomeau.com/react/announcing-use-sound-react-hook/)
- **Regras práticas** *(terceiro)*:
  - Duração proporcional à ação e volume padrão baixo (em torno de 0,3).
  - Tocar em confirmações e erros, nunca em hover, rolagem ou navegação.
  - Ter um controle explícito para desligar, e todo som precisa de um equivalente visual.
  - Pré-carregar os arquivos e zerar `currentTime` antes de repetir.

  [Sounds on the web](https://www.ui-skills.com/skills/raphaelsalaja/sounds-on-the-web) · [WCAG G60](https://www.w3.org/WAI/WCAG22/Techniques/general/G60)
- **No Klick [proposta]:** uma paleta mínima de 4 sons (klick de armar, tick de parada, bips de inspeção, chime de PB), com Web Audio para baixa latência. Fica em aberto se o app começa mudo no primeiro uso.

### 5.9 Movimento reduzido
- Trocar deslocamento, escala e rotação por opacidade e cor, mantendo o feedback e removendo os decorativos (confete, partículas). [Pleo](https://telescope.pleo.io/foundations/motion/motion.accessibility) · [Rive](https://rive.app/docs/editor/accessibility/reduced-motion) · [Val Head](https://valhead.com/?p=3500) · [Motion](https://www.mintlify.com/motiondivision/motion/api/use-reduced-motion)
- Fades de até 200 ms. Para "desligar" uma animação, use 0,01 ms em vez de 0, para não quebrar os eventos de fim de transição *(terceiro)*. [UI Skills](https://www.ui-skills.com/skills/iart-ai/accessible-animation/)

### 5.10 Plataforma (PWA)
- **Wake Lock:** manter a tela acesa durante a sessão. Funciona no Safari do iOS 16.4 em diante; no app instalado, segundo a Progressier, só a partir do iOS 18.4. [Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock) · [Progressier](https://progressier.com/pwa-capabilities/screen-wake-lock)
- **Callout do iOS:** suprimir durante o hold. Há relato de regressão no iOS 26.1, então é preciso testar em aparelho. [Apple Forums](https://developer.apple.com/forums/thread/808606)
- **Scramble visual:** o `<twisty-player>` do cubing.js (MPL-2.0 ou GPL-3.0+) e a função `randomScrambleForEvent` geram scrambles de estado aleatório para todos os eventos WCA. Eles não substituem o TNoodle em competição oficial. [cubing.js twisty](https://js.cubing.net/cubing/twisty) · [scramble](https://js.cubing.net/cubing/scramble)

---

## 6. Cor: as 6 cores do cubo sem ficar infantil

### 6.1 Princípios
1. **O neutro domina e a cor é evento.** A Teenage Engineering trabalha com paleta restrita, a Slack caiu de 11 para 4 cores para ganhar reprodutibilidade e o Linear limitou o croma azul do chrome. [Design Week](https://www.designweek.co.uk/pentagrams-michael-bierut-gives-slack-its-first-ever-rebrand/) · [It's Nice That](https://itsnicethat.com/news/michael-bierut-pentagram-slack-rebrand-graphic-design-170119)
2. **Cor é função e mapeamento**, como no ET66 e no OP-1.
3. **Cor como luz.** Cor saturada em pontos pequenos sobre fundo escuro (LED, segmento, glyph) lê como instrumento; blocos chapados sobre branco leem como brinquedo. *[inferência a partir de TE, Nothing e LCDs]*
4. **Uma de cada vez.** O acento é único, escolhido pelo usuário ou pelo evento: o Arc faz isso por Space, o Monkeytype tem uma cor "main" por tema e o Linear tem uma entrada de acento.
5. **As seis juntas só onde a cor é informação:** no preview do scramble e na celebração de PB.
6. **Harmonizar em OKLCH.** Com os mesmos L e C, o brilho percebido fica parecido entre matizes, o que não acontece no HSL. Atenção: verdes e azuis saem do gamut sRGB antes, e o amarelo só continua amarelo com L alto. [Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl) · [Stefan Judis](https://www.stefanjudis.com/blog/oklch-perceived-lightness) · [oklch.com](https://oklch.com)
7. **Usar a estrutura do próprio cubo.** Os opostos são fixos: branco e amarelo, azul e verde, vermelho e laranja. Eles formam bons pares para as variantes clara e escura de um acento ou para eventos irmãos. [WOWCube](https://wowcube.com/blog/what-colors-are-on-a-rubik-s-cube)
8. **Redundância para daltonismo.** Vermelho, laranja e verde se confundem. No scramble a posição já ajuda, mas vale oferecer letras de face (U/R/F/D/L/B) opcionais nos stickers. *[proposta]*

### 6.2 Proposta inicial em OKLCH [proposta — ajustar em oklch.com]

| Face | Escuro (LED/display) | Claro (papel) |
|---|---|---|
| Branco | `oklch(0.95 0.01 95)` | Contorno `oklch(0.80 0.01 95)` sobre o papel |
| Amarelo | `oklch(0.90 0.16 98)` | `oklch(0.82 0.14 88)` (ocre, com contorno) |
| Laranja | `oklch(0.75 0.17 55)` | `oklch(0.68 0.15 50)` |
| Vermelho | `oklch(0.64 0.20 27)` | `oklch(0.56 0.17 27)` |
| Verde | `oklch(0.74 0.17 150)` | `oklch(0.60 0.13 150)` |
| Azul | `oklch(0.66 0.15 255)` | `oklch(0.55 0.13 255)` |

Validar o contraste contra o fundo de cada tema e testar com simuladores de daltonismo.

### 6.3 Separar a cor de face da cor de desempenho

| Papel | Cor |
|---|---|
| Ritual de armar | Vermelho, depois verde (convenção do stackmat e do csTimer); amarelo na inspeção |
| Desempenho positivo | Ouro (melhor) e azul (PB), como no LiveSplit; não colidem com a leitura de "face" |
| Desempenho negativo | Cinza ou vermelho dessaturado, com sinal "+" (informa sem punir) |
| Modo "placar" (opcional) | Os 4 tons do LiveSplit |
| Identidade de evento | Uma face por evento |
| Scramble | As 6, completas |
| Celebração | As 6 em sequência, num momento raro |

### 6.4 Quem faz isso bem
- **Slack (Pentagram, 2019):** de 11 para 4 cores, mantendo o berinjela como acento.
- **Braun ET66:** cor por função, com um amarelo só.
- **Teenage Engineering:** knobs coloridos sobre alumínio; cor é mapeamento.
- **Linear:** LCH, com o croma do chrome contido.
- **Duolingo:** uma cor-herói ("na dúvida, verde"), com o resto subordinado.
- **Whoop:** cor como banda de estado. As diretrizes de marca parecem vetar recolorir os scores. [Whoop Brand PDF](https://developer.whoop.com/assets/files/WHOOP%20-%20Brand%20%26%20Design%20Guidelines-bdea3554e94b4ea09e68695b1e8dc8e7.pdf)
- **Monkeytype:** contrato de 10 tokens por tema (bg, main, caret, sub, subAlt, text, error, errorExtra, colorfulError, colorfulErrorExtra). O tema oficial serika_dark usa `#323437`, `#e2b714` e `#d1d0c5`.

---

## 7. 15 micropadrões para roubar

1. **Armar em 3 estados com limiar configurável.**
   - Origem: csTimer (`preTime` de 0/0,3/0,55/1 s; vermelho ao segurar, verde quando pronto, soltar antes cancela) e stackmat (cerca de 0,55 s).
   - No Klick: um anel que enche durante o limiar.
2. **Inspeção amarela com alertas e penalidade automática.**
   - Origem: csTimer (alertas aos 8 e 12 s, amarelo `#dd0`) e regra WCA (15 s; até 17 s vale +2; depois disso, DNF).
3. **Esconder tudo ao cronometrar.**
   - Origem: csTimer, focus mode do Monkeytype e CubeDesk.
   - No Klick: fade em até 120 ms, sem deslocamento.
4. **Precisão reduzida durante o solve, completa no fim.**
   - Origem: opção "timer update" do csTimer (tempo real, 0,1 s, segundos, inspeção ou nenhum).
5. **Decimais menores que os segundos.**
   - Origem: opção "fonte pequena após o ponto decimal" do csTimer, junto com `tabular-nums`.
6. **Segmentos fantasma e separador que pisca sem pular.**
   - Origem: DSEG ("8" acende tudo, "!" apaga tudo, ":" tem a largura do espaço).
7. **Delta em 4 tons, mais ouro e azul.**
   - Origem: cores padrão do LiveSplit (livesplit-core).
   - No Klick: delta contra o PB ou a ao5 no stop.
8. **Melhor e pior marcados na lista.**
   - Origem: cronômetro do Apple Watch (volta mais rápida em verde, mais lenta em vermelho) e ao5 da WCA (descarta o melhor e o pior).
   - No Klick: na ao5, os descartados entre parênteses, com ícone e cor.
9. **Fantasma do recorde.**
   - Origem: linha de recorde virtual da natação (Omega/Orad) e pace caret do Monkeytype (PB, média, último ou custom).
   - No Klick: opcional e desligado por padrão.
10. **Splits por fase com ouro por fase.**
    - Origem: modo multi-phase do csTimer (de 1 a 10 fases) e best segment do LiveSplit.
    - No Klick: Cross, F2L, OLL e PLL.
11. **Cor do controle igual à cor na tela.**
    - Origem: OP-1 (knobs ↔ gráficos) e Elektron (encoders ↔ seções da tela).
    - No Klick: cada evento tem uma cor fixa no seletor, no gráfico e na tecla de atalho.
12. **Um acento só, na ação que importa.**
    - Origem: Braun ET66 (amarelo só no "=") e BC02 (ponteiro de segundos amarelo).
13. **Números que rolam com direção; palavras que fazem morph.**
    - Origem: NumberFlow (`trend`) e Family ("Continue" vira "Confirm"; vírgulas que deslizam).
14. **Celebração proporcional à raridade, com um troféu para brincar.**
    - Origem: Family, Raycast, Rauno (frequência × novidade) e as conquistas 3D giráveis do Apple Watch.
15. **Tray que nasce do elemento tocado.**
    - Origem: Family (uma ação por tray, alturas distintas entre passos).
    - No Klick: tocar no tempo abre OK / +2 / DNF / nota.

**Bônus de plataforma:**
- Armar com dois polegares (a mentalidade do 4-pad).
- Cooldown de 0,5 s depois do stop, como no G5.
- Wake Lock durante a sessão.
- Supressão do callout no iOS.
- Tema gerado por 3 entradas (Linear), com o contrato de 10 tokens do Monkeytype.
- ⌘K com atalhos inline (Raycast, cmdk).
- Som curto e desligável, sempre com equivalente visual.

---

## 8. Panorama dos cube timers (para posicionamento)
- **csTimer:** a referência funcional da comunidade, com visual utilitário. Já tem quase todos os comportamentos certos: limiar, inspeção, multi-phase, foco, opções "timer size" e "small font after decimal point" e fontes digitais. [cstimer.net](https://cstimer.net/) · [GitHub](https://github.com/cs0x7f/cstimer)
- **CubeDesk:** o "refresh moderno". Tem focus mode, suporte a StackMat, até 3 casas decimais, trainer, 1v1 e é open source. O site cita cerca de 40 mil cubers e 25 milhões de solves. [cubedesk.io](https://cubedesk.io/) · [Sobre](https://www.cubedesk.io/about)
- **CubeTime (iOS):** GPLv3, feito em SwiftUI, com os modos Multiphase, Playground e Comp Sim. [r/Cubers](https://www.reddit.com/r/Cubers/comments/s9ya3y/we_made_a_new_timer_for_ios/) · [App Store](https://apps.apple.com/us/app/cubetime/id1600392245)
- **ccTimer (iPad):** inicia pela câmera. **Cuby (iPhone):** gráfico de stats e gestos. [ccTimer](https://apps.apple.com/us/app/-/id6587557740) · [Cuby](https://apps.apple.com/app/id1583455340)
- **Dribbble e Behance:** poucos conceitos. Um exemplo é o timer claro/escuro de Nathan Wilcox, que evita de propósito a fonte "Rubik"; outro é um logo de timer de Alec Rios. [Claro](https://dribbble.com/shots/20913019-Rubik-s-Cube-Timer-Light-Mode) · [Escuro](https://dribbble.com/shots/20913052-Rubik-s-Cube-Timer-Dark-Mode) · [Logo](https://dribbble.com/shots/15158607-Speedcube-Logo)
- **Leitura:** ninguém ocupou o espaço "objeto memorável + personagem". *[inferência]*

## 9. Próximos passos sugeridos [proposta]
1. Prototipar só o loop (ocioso, armar, pronto, resolvendo, parado, PB) nas direções A e B, lado a lado, e testar com 3 a 5 cubers.
2. Comparar DSEG7 com Geist Pixel Square no tamanho real, em celular e em desktop.
3. Testar num iPhone com o PWA instalado: callout, Wake Lock, latência do toque e haptic.
4. Fechar com quem pesquisa o companion o tamanho da matriz e a lista de estados (a tabela da seção 3 serve de contrato).
5. Calibrar a paleta OKLCH com testes de contraste e de daltonismo.

## 10. Lacunas e cuidados
- O **Mobbin** não foi consultado, porque exige login.
- Várias fontes são de terceiros (blakecrosley.com, open-design.ai, mintlify.wiki) e estão marcadas como tal.
- O "0,55 s" do stackmat vem de wiki comunitária; é coerente com a opção de 0,55 s do csTimer.
- O status das haptics no iOS depois da versão 26.5 é incerto.
- A contagem de temas do Monkeytype diverge: são 187 no arquivo oficial `themes.ts`, e docs de terceiros falam em mais de 400.
- As especificações do botão do Duolingo vêm de terceiros e divergem entre si.
- O rascunho das novas regras WCA de início e parada (setembro de 2026) não foi lido.
- Do Paco Coursey, só o cmdk foi confirmado; o Arc está em modo de manutenção.
- **Marca:** "Rubik's" é marca registrada; evitar o nome, o logo e o trade dress. Um post de fórum, não verificado, cita uma disputa sobre esquema de cores entre a Seven Towns e a Dayan. [SpeedSolving](https://www.speedsolving.com/goto/post?id=698554)

---

## 11. Fontes

**Hardware e instrumentos**
- https://newatlas.com/music/teenage-engineering-ep-133-ko-ii
- https://www.soundonsound.com/reviews/teenage-engineering-ep-133-ko-ii
- https://www.yankodesign.com/?p=463836
- https://teenage.engineering/guides/op-1/original/layout
- https://read.cv/jdsimcoe/inside-design-at-teenage-engineering
- https://www.sfmoma.org/read/stay-curious-stay-naive-an-interview-with-teenage-engineering-jesper-kouthoofd/
- https://blakecrosley.com/guides/design/teenage-engineering (terceiro)
- https://www.core77.com/posts/123387
- https://design-milk.com/teenage-engineering-tp-7-offers-the-reel-sensation-of-tactile-controls/
- https://desirabilitylab.com/backfill/backfill-2024-04-teenage-engineering-pocket-operator
- https://factmag.com/2015/01/23/teenage-engineering-unveil-an-affordable-synthesizer-that-fits-in-your-pocket
- https://collections.vam.ac.uk/item/O1360553
- https://sammlung-digital.museumangewandtekunst.de/detailpage/collection/8aaba9e5-2b9b-47ac-b304-11074467d180
- https://www.braun-audio.com/en-ES/stories/design/braun-colour-choices/
- https://www.illuminee.com/products/bc02-travel-alarm-clock
- https://nothing.community/d/104-ndot57-the-nothing-typeface
- https://design-milk.com/the-nothing-phone-3s-glyph-matrix-turns-notifications-into-pixel-art/
- https://www.dezeen.com/2024/02/20/nothing-tech-smartphone-design-adam-bates-interview/
- https://en.wikipedia.org/wiki/Casio_F-91W
- https://sensorwatch.net/docs/wig/display
- https://www.musicradar.com/reviews/elektron-digitakt
- https://www.soundonsound.com/reviews/elektron-digitakt
- https://www.elektronauts.com/t/unified-ui-on-elektron-machines/161613
- https://support.apple.com/guide/watch/apd0d5883fca
- https://www.naftemporiki.gr/deltia-typou/714530/pool-precision/
- https://www.nexttv.com/news/nbc-considers-virtual-swimming-74371

**Software silencioso e preciso**
- https://linear.app/now/how-we-redesigned-the-linear-ui
- https://blakecrosley.com/guides/design/raycast (terceiro)
- https://unsung.aresluna.org/raycasts-confetti-cannon/
- https://www.culturedcode.com/things/support/articles/2803582
- https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/
- https://blakecrosley.com/guides/design/arc (terceiro)
- https://www.theregister.com/2025/05/27/arc_browser_development_ends/
- https://vercel.com/font
- https://vercel.com/blog/introducing-geist-pixel
- https://rauno.me/craft/interaction-design
- https://emilkowal.ski/ui/good-vs-great-animations
- https://github.com/pacocoursey/cmdk

**Lúdico-premium**
- https://blog.duolingo.com/world-character-visemes
- https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life
- https://design.duolingo.com/identity/color
- https://open-design.ai/plugins/design-system-duolingo/ (terceiro)
- https://benji.org/family-values
- https://blakecrosley.com/pt-BR/guides/design/flighty (terceiro)
- https://en.wikipedia.org/wiki/Flighty
- https://bzamayo.com/apple-watch-3d-trophies
- https://discussions.apple.com/thread/252009834
- https://techbuzzireland.com/2025/05/14/redesigned-airbnb-app-now-available/
- https://www.hospitalitynet.org/opinion/4127228.html
- https://developer.apple.com/design/awards/2024
- https://9to5mac.com/2022/06/30/go-gentler-streak-apple-watch-update/

**Data-forward**
- https://support.strava.com/hc/en-us/articles/216917137-Achievement-Awards-Glossary
- https://developer.whoop.com/docs/whoop-101
- https://www.whoop.com/au/en/thelocker/how-does-whoop-strain-work-101
- https://ouraring.com/blog/readiness-score/
- https://www.instrument.com/work/oura-app
- https://9to5google.com/2025/10/20/oura-app-redesign/
- https://apps.apple.com/app/id6456176249 (Bevel)

**Monkeytype e LiveSplit**
- https://github.com/monkeytypegame/monkeytype
- https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/constants/themes.ts
- https://mintlify.wiki/monkeytypegame/monkeytype/features (terceiro)
- https://mintlify.wiki/monkeytypegame/monkeytype/guides/customization (terceiro)
- https://github.com/LiveSplit/livesplit-core/blob/master/src/layout/general_settings.rs
- https://github.com/LiveSplit/livesplit-core/blob/master/src/settings/semantic_color.rs
- https://livesplit.org/components/
- https://github.com/3snowp7im/urn

**Cube timers e regras**
- https://cstimer.net/
- https://github.com/cs0x7f/cstimer/blob/master/src/js/timer.js
- https://github.com/cs0x7f/cstimer/blob/master/src/lang/en-us.js
- https://cubedesk.io/ · https://www.cubedesk.io/about
- https://www.reddit.com/r/Cubers/comments/s9ya3y/we_made_a_new_timer_for_ios/
- https://apps.apple.com/us/app/cubetime/id1600392245
- https://apps.apple.com/us/app/-/id6587557740
- https://apps.apple.com/app/id1583455340
- https://dribbble.com/shots/20913019-Rubik-s-Cube-Timer-Light-Mode
- https://dribbble.com/shots/20913052-Rubik-s-Cube-Timer-Dark-Mode
- https://dribbble.com/shots/15158607-Speedcube-Logo
- https://js.cubing.net/cubing/twisty · https://js.cubing.net/cubing/scramble
- https://www.worldcubeassociation.org/posts/adoption-of-4-pad-timing-august-2026
- https://www.worldcubeassociation.org/regulations
- https://en.everybodywiki.com/StackMat_timer
- https://www.speedsolving.com/wiki/index.php/StackMat
- https://npmjs.com/package/use-keyboard-timer

**Tipografia**
- https://vercel.com/font · https://github.com/vercel/geist-font
- https://www.jetbrains.com/lp/mono/ · https://github.com/JetBrains/JetBrainsMono
- https://usgraphics.com/products/berkeley-mono · https://usgraphics.com/catalog
- https://departuremono.com/ · https://github.com/rektdeckard/departure-mono
- https://fonts.google.com/specimen/Doto · https://github.com/oliverlalan/Doto
- https://fonts.google.com/specimen/Space+Grotesk/about
- https://rsms.me/inter/ · https://github.com/rsms/inter/releases
- https://www.keshikan.net/fonts-e.html · https://fontsource.org/fonts/dseg7-classic/about
- https://fonts.google.com/specimen/VT323
- https://fonts.google.com/specimen/Sixtyfour · https://fonts.google.com/knowledge/glossary/scan_axis
- https://rosettatype.com/Handjet · https://github.com/rosettatype/handjet
- https://github.com/evilmartians/mono
- https://commitmono.com/
- https://fonts.google.com/specimen/IBM+Plex+Mono
- https://developer.apple.com/fonts/ · https://developer.apple.com/forums/thread/127350
- https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric

**Interação, motion, som, haptics, acessibilidade, PWA**
- https://developer.apple.com/videos/play/wwdc2023/10158/
- https://motion.dev/dom/spring
- https://developer.chrome.com/docs/css-ui/css-linear-easing-function · https://linear-easing-generator.netlify.app
- https://number-flow.barvian.me · https://npmjs.com/package/@number-flow/react
- https://joshwcomeau.com/react/announcing-use-sound-react-hook/
- https://www.ui-skills.com/skills/raphaelsalaja/sounds-on-the-web (terceiro)
- https://www.w3.org/WAI/WCAG22/Techniques/general/G60
- https://github.com/lochie/web-haptics · https://npmjs.com/package/ios-haptics · https://bugs.webkit.org/show_bug.cgi?id=285120
- https://developer.mozilla.org/docs/Web/API/Vibration_API
- https://telescope.pleo.io/foundations/motion/motion.accessibility
- https://valhead.com/?p=3500
- https://rive.app/docs/editor/accessibility/reduced-motion
- https://www.mintlify.com/motiondivision/motion/api/use-reduced-motion
- https://www.ui-skills.com/skills/iart-ai/accessible-animation/ (terceiro)
- https://developer.chrome.com/docs/capabilities/web-apis/wake-lock · https://progressier.com/pwa-capabilities/screen-wake-lock
- https://developer.mozilla.org/docs/Web/CSS/-webkit-touch-callout · https://developer.apple.com/forums/thread/808606

**Cor**
- https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl · https://oklch.com
- https://www.stefanjudis.com/blog/oklch-perceived-lightness
- https://www.designweek.co.uk/pentagrams-michael-bierut-gives-slack-its-first-ever-rebrand/
- https://itsnicethat.com/news/michael-bierut-pentagram-slack-rebrand-graphic-design-170119
- https://wowcube.com/blog/what-colors-are-on-a-rubik-s-cube
- https://developer.whoop.com/assets/files/WHOOP%20-%20Brand%20%26%20Design%20Guidelines-bdea3554e94b4ea09e68695b1e8dc8e7.pdf
- https://www.speedsolving.com/goto/post?id=698554 (fórum, não verificado)
