# Klick — Trilha de aprendizado

**Sub-projeto 4: aulas das 9 etapas e treino de algoritmos, do método de camadas ao CFOP**

| | |
|---|---|
| Data | 2026-10-14 |
| Status | Design aprovado em conversa (seções 1 a 5). Esta spec aguarda revisão. |
| Branch | `v2`, app em `app/` |
| Referências | Spec do sub-projeto 1 (`2026-10-08-klick-design.md`, seções 6 e 9), spec do Companion (`2026-10-13-klick-companion-design.md`, seção 10) e a pesquisa 1 (`docs/research/2026-10-07-cenario-de-timers.md`, seções 6 e 10) |

---

## 1. Contexto

A spec do sub-projeto 1 dividiu o produto em três camadas e reservou para a camada 2 três coisas:
- as aulas da trilha, que abrem pela lista e pela face lateral do Centro;
- o treino de algoritmos, isolado das estatísticas;
- os splits por etapa.

Hoje a trilha existe só como marcação:
- **No perfil:** `trail: boolean[9]`.
- **Na tela do Centro:** a lista das 9 etapas, cada uma com "já sei".
- **No Centro:** a face lateral acende em azul uma etapa por marcação.

A pesquisa 1 aponta a ponte do primeiro solve até o sub-20 (camadas, depois CFOP com treino de algoritmos) como um espaço onde poucos timers atuam.

| # | Sub-projeto | Situação |
|---|---|---|
| 1 | Linguagem visual, telas e Centro | Validado em 09/10 |
| 2 | Núcleo do timer | Na raiz desde 12/10 |
| 3 | Companion | Na raiz desde 13/10 |
| **4** | **Trilha de aprendizado: aulas e treino** | **Esta spec** |
| 5 | Sync, conta e comunidade | Depois |

## 2. Entendimento

- **Para quem, com o mesmo peso:**
  - quem nunca resolveu o cubo e chega ao Klick: a trilha é vitrine e funil;
  - quem já resolve e quer avançar, como o próprio Ranielli: marca o que sabe e treina os algoritmos do CFOP.
- **O que entra:** as aulas das 9 etapas e um treino de algoritmos que não suja as estatísticas. Os splits ficam para depois.
- **Como saber se deu certo:**
  - quem chega novo termina a aula 1 com a cruz feita no cubo de verdade;
  - quem já resolve marca as etapas conhecidas de uma vez e treina os casos de OLL e PLL, vendo o tempo de cada caso;
  - todo algoritmo e todo passo de aula são conferidos por teste com o cubing.js;
  - o treino sobrevive a exportar, importar e restaurar cópia.

## 3. Decisões

| # | Decisão | Descartado |
|---|---|---|
| D1 | **Aulas e treino neste sub-projeto.** As etapas 7 a 9 são conjuntos de algoritmos: sem treino, a aula vira só leitura. | Só as aulas; aulas, treino e splits |
| D2 | **Cubo animado nas aulas.** O TwistyPlayer do cubing.js já vem no app (`scripts/cubing-entry.js`), então não entra dependência nova. | Texto e figuras 2D; as duas coisas |
| D3 | **Uma etapa conta como feita pela aula ou pelo "já sei".** Terminar a aula com "Consegui no meu cubo" marca a etapa. O "já sei" continua para quem já domina. O app não tem como conferir o cubo de verdade: vale a palavra da pessoa. | Só pelo treino; só pela aula |
| D4 | **Treino com timer e repetição espaçada.** O app monta o caso com um embaralhamento curto, a pessoa executa com o timer de sempre e marca acerto ou erro. | Cartões de reconhecimento sem timer; os dois modos |
| D5 | **Conjuntos do treino: os da trilha.** OLL em 2 passos (10 casos), PLL em 2 passos (6) e F2L com algoritmos (41). | Também a OLL e a PLL completas; só a última camada |
| D6 | **Aba nova "Trilha".** Cinco abas. Aprender fica à vista para quem chega novo. | Tudo dentro do Centro; treino como modo do Timer |
| D7 | **O Centro é um guia leve.** Aparece pequeno e reage, sem falar. Os textos são da aula. | Narrador em primeira pessoa; fora das aulas |
| D8 | **O tour pergunta "Já resolve o cubo?".** "Ainda não" abre a aula 1. | Aviso no Timer vazio; só a aba |
| D9 | **Conteúdo como dados tipados e um leitor de aula genérico.** Acrescentar a OLL e a PLL completas depois é só acrescentar dados. | Markdown compilado no build; uma tela Svelte por aula |

## 4. Princípios

- **Nunca perde dados:** o treino entra na exportação, na cópia do dia e na restauração, como os solves.
- **Treino separado:** nada do treino toca nas sessões, nos recordes, nas temporadas, nos marcos nem no coach do Timer.
- **Conteúdo conferido:** nenhum algoritmo entra sem teste que prove que ele resolve o caso.
- **Offline:** as aulas e o treino funcionam sem rede depois da primeira visita.
- **Sem regressão:** quem já marcou etapas com "já sei" continua com elas.
- **Acessível:** o "reduzir movimento" e o modo estático do Centro valem também aqui.

## 5. Conteúdo

### 5.1 Modelo

Um módulo novo, `core/trail/`, sem interface:

```ts
type TrailStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // índice em profile.trail
type CaseSet = 'oll2' | 'pll2' | 'f2l';
// A segunda camada é o 'f2l' (as duas primeiras camadas inteiras) e a última camada é o 'solved'. 'llEdges', 'llCorners' e 'solved'
// aceitam um giro de cima.
type Stage = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'yellowCross' | 'llEdges' | 'llCorners' | 'oll' | 'solved';
// As peças em destaque; o resto fica apagado ou cinza. 'pair' é a figura do treino de F2L.
type MaskKind = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'eoll' | 'oll' | 'pll' | 'll' | 'pair';

interface LessonCube {
  setup: string; // movimentos que levam do resolvido (amarelo em cima, verde na frente) ao estado que o passo mostra
  alg?: string; // o que o passo toca; sem ele, o cubo só mostra o estado
  view: '3D' | 'top' | 'below'; // 3D de cima, a camada de cima chapada, ou 3D por baixo (para ver a cruz branca)
  mask?: MaskKind; // as peças que importam
  from?: Stage; // o que o setup já cumpre; os testes conferem
  ends?: Stage; // o que setup + alg cumpre, e o setup sozinho não; os testes conferem
}

interface LessonPart {
  title: string;
  text: string; // 2 ou 3 frases
  cube?: LessonCube;
  tip?: string;
}

interface Lesson {
  step: TrailStep;
  parts: LessonPart[]; // de 4 a 8; a aula 1 pode passar por causa da notação
  cases?: CaseSet; // etapas 7 a 9: o fim da aula oferece "Treinar os casos"
}

interface TrainCase {
  id: string; // 'oll2-sune', 'pll2-t', 'f2l-01'…; único em todos os conjuntos
  set: CaseSet;
  name: string;
  recog: string; // dica de reconhecimento
  algs: string[]; // de 1 a 3; o primeiro é o padrão
}
```

### 5.2 Método e cores

- **Cores:** padrão ocidental. Branco oposto ao amarelo, verde na frente, branco embaixo desde a aula 1.
- **Cruz:** pela margarida. As arestas brancas vão em volta do centro amarelo, e cada uma é virada para baixo, alinhada com o centro da sua cor. Assim a cruz já nasce embaixo, como no CFOP.
- **Método:** as etapas 1 a 5 são o método de camadas; as etapas 6 a 9 levam ao CFOP.
- **Quadro do app:** amarelo em cima, branco embaixo e verde na frente em todas as aulas e no treino. O cubing.js parte do branco em cima; o app põe `z2` na frente de todo setup.
- **Destaque:** as máscaras viram o `experimentalStickeringMaskOrbits` do TwistyPlayer (e o objeto equivalente na figura 2D), calculadas pela identidade da peça no quadro do app. Os stickerings prontos do cubing.js (`Cross`, `OLL`…) supõem o branco em cima e não servem.

### 5.3 As 9 aulas

| # | Etapa | Conteúdo |
|---|---|---|
| 1 | Cruz branca | A notação (faces, giros, apóstrofo e o 2); a margarida; cada pétala virada para baixo, alinhada com o centro da sua cor |
| 2 | Cantos brancos | Levar o canto para cima do lugar dele e repetir R U R' U' até encaixar |
| 3 | Segunda camada | Aresta para a direita (U R U' R' U' F' U F) e para a esquerda (o espelho); aresta presa ou invertida |
| 4 | Cruz amarela | F R U R' U' F' a partir do ponto, do L ou da linha |
| 5 | Orientar e permutar | Arestas no lugar (R U R' U R U2 R'), cantos no lugar (U R U' L' U R' U' L), cantos girados (R' D' R D repetido) |
| 6 | F2L intuitivo | Canto e aresta viram um par e entram juntos: inserção direta, "separar e juntar" e o uso de um espaço vazio |
| 7 | OLL em 2 passos | Os 3 casos da cruz amarela e os 7 dos cantos (Sune, Anti-Sune, H, Pi, Faróis, T e Gravata) |
| 8 | PLL em 2 passos | Cantos (T-perm com faróis, Y-perm sem) e arestas (Ua, Ub, H e Z) |
| 9 | F2L com algoritmos | Como ler um caso pelos grupos dos 41; termina mandando para o treino |

O texto é escrito em pt-BR, num tom direto, e revisado pelo Ranielli num cubo de verdade antes de ir para a raiz.

### 5.4 Conjuntos do treino

- **`oll2`:** 10 casos (3 de cruz amarela e 7 de cantos).
- **`pll2`:** 6 casos (2 de cantos e 4 de arestas).
- **`f2l`:** os 41 casos, com a numeração do app por grupos (o par é sempre o da frente-direita): 1 a 24 com canto e aresta em cima, 25 a 30 com o canto em cima e a aresta no lugar, 31 a 36 com o canto no lugar e a aresta em cima, 37 a 41 com os dois no lugar.

Cada caso tem de 1 a 3 algoritmos. A pessoa escolhe qual usa, e a escolha fica em `profile.algChoice`.

### 5.5 Embaralhamento do treino

- **Base:** o inverso do algoritmo escolhido.
- **Variação:** um giro aleatório da camada de cima (nenhum, U, U' ou U2) antes e outro depois, para o caso não aparecer sempre na mesma posição.
- **Partida:** sempre do cubo resolvido, com branco embaixo e verde na frente.
- **Gerador:** recebe o sorteio por fora, para os testes serem fixos.
- **Texto:** giros seguidos da mesma camada se juntam (`U U'` some, `U U` vira `U2`), e o 2 sai sem apóstrofo.

### 5.6 Conferência

Os testes rodam no Vitest, sem rede, importando o cubing do `node_modules`. Eles conferem:
- **Algoritmos:** cada algoritmo de cada caso resolve o estado montado pelo inverso do algoritmo padrão, permitindo um giro final da camada de cima.
- **Embaralhamento:** monta o caso, ou seja, um dos algoritmos o resolve, permitindo o giro final.
- **Passos de aula:** todo passo com `from` já cumpre essa etapa no `setup`; todo passo com `ends` chega lá depois do `alg`, e o `setup` sozinho não chega.
- **Verificadores de etapa** sobre o estado do cubo (`Stage`): margarida, cruz, primeira camada, F2L (a segunda camada), cruz amarela, arestas de cima no lugar, cantos de cima no lugar, OLL feita e cubo resolvido (a última camada).
- **Integridade:** todos os ids únicos, os conjuntos completos (10, 6 e 41), toda aula com 4 passos ou mais e todo algoritmo escrito em notação que o cubing.js entende, com o inverso do app igual ao do `Alg.invert`. No F2L, os 41 casos são exatamente as 41 classes (onde estão o canto e a aresta do par, com qualquer giro de cima), e cada um mexe só no par da frente-direita.

## 6. Aulas

### 6.1 Leitor

O leitor é uma tela dentro da aba Trilha. De cima para baixo:
1. O Centro pequeno, o nome da etapa e os pontos do progresso ("passo 3 de 6").
2. O cubo animado, com só as peças que importam em destaque. O TwistyPlayer é carregado ao abrir a aula e desmontado ao sair, e existe no máximo um.
3. O algoritmo escrito, com o movimento atual destacado.
4. Os controles: tocar/pausar, ← movimento, → movimento e recomeçar.
5. O texto e a dica do passo.
6. Os botões "Voltar" e "Próximo".

**Teclado:** ← e → andam um movimento, e o espaço toca ou pausa. A tela não tem timer, então não há conflito.

### 6.2 Conclusão e retomada

- **Último passo:** tem o botão "Consegui no meu cubo". Ele marca `trail[step]`, a face lateral pisca em azul (seção 8.4) e o Centro fica feliz. Depois aparece "Próxima etapa" ou, nas etapas 7 a 9, "Treinar os casos".
- **Etapa já marcada:** abre a aula normalmente, sem desmarcar nada. O botão final passa a ser "Concluir".
- **Retomada:** sair no meio guarda o passo em `profile.lessonAt[step]`, e a aula volta de onde parou. Concluir zera.

### 6.3 Movimento

- **Normal:** o cubo toca o algoritmo ao abrir o passo, uma vez.
- **"Reduzir movimento" ligado ou Centro estático:** nada toca sozinho. O cubo mostra o estado inicial e anda só pelos controles. O Centro segue o modo dele.

### 6.4 Falha do cubo 3D

Sem WebGL, ou com o TwistyPlayer sem carregar, a aula usa uma figura 2D do estado (o `ExperimentalSVGAnimator`, que o app já usa no embaralhamento) e o algoritmo escrito. Os controles de movimento somem, e a aula continua utilizável até o fim.

## 7. Treino

### 7.1 Entrada

- Na aba Trilha, o treino mostra os 3 conjuntos com o progresso ("4 de 10 firmes"; firme conta os casos de nível 2 para cima).
- Todos ficam abertos, sem trava pela trilha.
- Dentro de um conjunto, a pessoa pode tirar casos do sorteio (`profile.trainOff`). Todos começam incluídos. Um conjunto com todos os casos fora não começa e pede para incluir ao menos um.

### 7.2 Rodada

1. **Montar:** aparece o embaralhamento do caso (seção 5.5) e uma figura 2D: a camada de cima na OLL e na PLL (nos 3 casos da cruz amarela, só as arestas), ou o canto e a aresta do par no F2L. A pessoa monta o caso no cubo de verdade e confere pela figura.
2. **Executar:** com o timer de sempre, o mesmo espaço e os mesmos dois polegares, sem inspeção. O núcleo do timer é reaproveitado, mas o resultado não vira solve.
3. **Marcar:** ao parar, aparecem "Acertei" (o padrão, por Enter ou toque) e "Errei".
4. **Ver o resultado:** o nome do caso, o algoritmo escolhido, o tempo e a média do caso.
5. **Seguir:** o próximo caso vem em seguida.

**Ajuda:** "Ver o algoritmo" fica disponível antes de começar. Usar marca a tentativa como "com ajuda", e ela não sobe o nível.

**Correção:** só a última tentativa pode ser corrigida, trocando acerto e erro ou apagando. Isso vale até a próxima rodada começar.

### 7.3 Níveis e sorteio

O nível de um caso vai de 0 a 4 e é calculado pelo histórico das tentativas, sem estado guardado:
- acertar sem ajuda sobe 1;
- errar ou usar ajuda volta a 0.

| Nível | Nome |
|---|---|
| — (nunca tentado) | novo |
| 0 a 1 | aprendendo |
| 2 a 3 | firme |
| 4 | dominado |

**Sorteio do próximo caso:**
1. Os casos nunca tentados vêm primeiro, na ordem da aula.
2. Depois, o peso de cada caso é 16 ÷ 2^nível. O peso dobra se a média das últimas 5 tentativas certas do caso passar de 1,25 vez a média do conjunto. Para o tempo, conta a tentativa certa e sem ajuda; a média do conjunto é a média das médias de 5 dos casos que têm uma. Ela conta todos os casos do conjunto, também os que saíram do sorteio: tirar um caso não muda a velocidade da pessoa nesse conjunto (decidido em 14/10).
3. O mesmo caso nunca sai duas vezes seguidas (num conjunto de um caso só, ele repete).
4. O sorteio recebe o gerador de aleatórios por fora.

### 7.4 Por caso

Uma lista do caso mais fraco ao mais firme, com:
- nível;
- tentativas;
- % de acerto;
- média das últimas 5 certas.

A % de acerto conta como acerto a tentativa certa feita com ajuda: a ajuda já volta o nível a 0, e o acerto continua sendo acerto (decidido em 14/10). A média do conjunto que o sorteio usa (seção 7.3) conta todos os casos, também os fora do sorteio.

Tocar num caso mostra os algoritmos dele e deixa trocar a escolha.

### 7.5 Centro no treino

- **Erro:** olho entreaberto.
- **Melhor tempo do caso:** feliz, sem salto, quando a tentativa certa e sem ajuda bate o melhor tempo anterior do caso (a primeira tentativa não conta).
- **Texto:** nenhum.

## 8. Navegação e telas

### 8.1 Abas

| Ordem | Aba | Atalho |
|---|---|---|
| 1 | Timer | 1 |
| 2 | Evolução | 2 |
| 3 | **Trilha** (nova) | 3 |
| 4 | Centro | 4 |
| 5 | Ajustes | 5 |

- **Código:** o `Tab` ganha `'trilha'`.
- **Ícone:** um caminho com degraus.
- **Atalhos:** Centro e Ajustes mudam de número. A tela de atalhos acompanha.

### 8.2 Aba Trilha

- **Topo:** o Centro pequeno e "3 de 9 etapas".
- **Próxima etapa:** um cartão em destaque, com "Começar a aula" ou "Continuar do passo 3". Com as 9 feitas, o cartão dá lugar ao treino.
- **As 9 etapas:** cada uma aparece como feita, atual ou à frente. Tocar abre a aula. O "já sei" / "desfazer" fica ao lado.
- **Treino:** os 3 conjuntos (seção 7.1).
- **Para quem já resolve:** enquanto nenhuma etapa estiver marcada e o aviso não tiver sido dispensado, o topo mostra "Já resolve? Marque o que já sabe". O aviso abre uma lista para marcar várias etapas de uma vez. Ele some quando a pessoa marca ou dispensa, e a dispensa fica em `meta`, porque é coisa do aparelho.

### 8.3 Aba Centro

- A lista das etapas sai.
- No lugar entra uma linha de resumo, "Trilha: 3 de 9 · próxima: Segunda camada", que leva à aba Trilha.
- A face lateral não vira botão: o alvo seria pequeno demais.

### 8.4 Face lateral

- **O que dispara:** concluir uma etapa, pela aula ou pelo "já sei".
- **Efeito:** o `behavior.ts` ganha o gatilho `trailStep`, uma piscada azul na face lateral parecida com a dourada da face de cima, só que mais curta.
- **Sem movimento:** no modo estático ou com "reduzir movimento", a etapa só acende, sem piscar.
- **Desfazer:** apaga a etapa sem efeito.

### 8.5 Tour

- **A pergunta:** a apresentação (`dialogs/OnboardingDialog`) ganha um último passo, "Já resolve o cubo?", com "Ainda não" e, abaixo de "Já resolvo", as opções de sempre no mesmo passo. "Pular apresentação" leva a ele.
- **"Ainda não":** fecha o tour e abre a aba Trilha direto na aula 1.
- **"Já resolvo":** segue como hoje (começar do zero ou importar). A aba Trilha mostra o aviso de marcar o que já sabe.
- **Quem já usa o app:** não vê o tour de novo e encontra o mesmo aviso na Trilha.

### 8.6 Coach do Timer

Não muda: a trilha não ganha falas no Timer neste sub-projeto.

## 9. Dados

### 9.1 Banco

O `DB_VERSION` vai a 2, e a migração cria o armazenamento `practice`:

```ts
interface Practice {
  id: string; // newId()
  caseId: string;
  ms: number; // o tempo do timer
  ok: boolean;
  helped: boolean;
  at: number;
}
```

- **Índices:** por `caseId` e por `at`.
- **Migração:** solves, sessões, perfil, meta e cópias passam intactos. O caminho que já libera as outras abas antes de uma migração vale aqui.
- **Repositório:** ganha `addPractice`, `listPractice`, `updatePractice` e `deletePractice`. A interface só usa as duas últimas na correção da última tentativa. Cada escrita avisa as outras abas (`'practice'`).

### 9.2 Perfil e meta

```ts
interface Profile {
  // … o que já existe
  lessonAt: Partial<Record<TrailStep, number>>; // passo em que cada aula parou
  algChoice: Record<string, number>; // id do caso → índice em algs
  trainOff: string[]; // ids dos casos fora do sorteio
}
```

- **Perfil antigo:** sem esses campos, vira `{}`, `{}` e `[]`.
- **Meta:** ganha `trailPromptDismissed: boolean`.

### 9.3 Exportar, importar e restaurar

- **Arquivo do Klick:** ganha `practice: Practice[]`.
- **Importar:** junta o treino pelo id, sem duplicar. No perfil, a escolha de algoritmo e o passo das aulas juntam caso a caso (vale o do arquivo), e os casos fora do sorteio são os do arquivo.
- **Restaurar uma cópia:** troca o treino junto com o resto. Uma cópia de antes do treino (sem `practice`) não apaga o treino daqui, e um perfil sem os campos do treino mantém a escolha de algoritmos, os casos fora do sorteio e o passo das aulas daqui.
- **Arquivo antigo, sem `practice`:** entra normalmente.
- **Validação:**
  - uma tentativa com caso desconhecido, tempo inválido ou campos faltando é deixada de fora;
  - no perfil, um `algChoice` fora do intervalo vira o padrão, e ids desconhecidos em `trainOff` são ignorados.
- **Cópia do dia:** inclui o treino. Um dia só de treino também ganha a cópia: a primeira tentativa depois de uma cópia conta como mudança.

### 9.4 Falhas

- **Tentativa que não grava:** o aviso `changeFailed` de sempre, com o resultado ainda na tela.
- **Perfil que não grava** (passo da aula, "já sei" ou escolha de algoritmo): o mesmo aviso, e a tela volta ao estado gravado.
- **Cubo 3D que não carrega:** seção 6.4.

### 9.5 Offline

- **O que vai em cache:** o conteúdo das aulas vai no código da aba Trilha, que carrega só quando ela abre. O TwistyPlayer vem dos arquivos do cubing.js em `public/vendor/cubing`, que o service worker já guarda (`globPatterns` inclui `**/*.js`).
- **Conferido:** o maior arquivo de `public/vendor/cubing` (uns 670 KB) cabe no limite do cache (6 MiB); um teste de unidade guarda isso.

## 10. Testes

| Camada | O que cobre |
|---|---|
| `core/trail` (conteúdo) | Seção 5.6: algoritmos, embaralhamentos, passos de aula, verificadores de etapa e integridade |
| `core/trail` (treino) | Níveis pelo histórico; pesos; os novos primeiro, na ordem; nunca o mesmo caso seguido; conjunto com um caso; ajuda não sobe nível; gerador fixo |
| Repositório | Migração de 1 para 2 com solves intactos; tentativas do treino; exportar e importar vai e volta igual; arquivo antigo sem treino entra; tentativa inválida fica de fora |
| Telas (`@testing-library/svelte`) | Trilha: lista, "já sei" e o aviso de marcar em lote. Aula: andar, retomar, concluir marcando a etapa, sem tocar sozinho com "reduzir movimento" e figura 2D na falha (o TwistyPlayer é simulado). Treino: rodada pelo teclado, acerto, erro, ajuda, corrigir a última, tirar casos e trocar o algoritmo. Também o resumo no Centro, a pergunta do tour e as cinco abas com os atalhos |
| `behavior` | O gatilho `trailStep`: a piscada da face lateral e nenhum efeito no estático |
| Ponta a ponta (Playwright) | Quem chega novo: tour, "Ainda não", aula 1 até o fim e a face lateral acesa. Uma rodada de treino pelo teclado. Axe na Trilha, na aula e no treino, nos dois temas |
| Manual | O Ranielli confere as 9 aulas num cubo de verdade e o 3D num celular |

## 11. Fora do escopo

- Splits por etapa.
- OLL e PLL completas, e outros conjuntos de treino.
- Smart cube, vídeo e reconhecimento por câmera.
- Falas da trilha no coach do Timer.
- Outros idiomas além do pt-BR.

## 12. Entrega e critérios de aceite

1. **Quem chega novo:** o tour pergunta, "Ainda não" abre a aula 1, e a aula leva até a cruz com o cubo animado. "Consegui no meu cubo" acende a etapa 1 na face lateral.
2. **Quem já resolve:** marca as etapas conhecidas de uma vez pela aba Trilha, e a face lateral acompanha.
3. **Treino:**
   - uma rodada de OLL em 2 passos monta o caso, mede o tempo, marca acerto ou erro e traz mais vezes os casos fracos;
   - o tempo por caso aparece na lista;
   - nada disso aparece nas estatísticas, nos recordes ou nas temporadas.
4. **Conteúdo:** todo algoritmo e todo passo de aula passam na conferência com o cubing.js.
5. **Dados:** o treino sobrevive a exportar, importar e restaurar; um arquivo antigo continua entrando; a migração não perde solves.
6. **Offline e acessibilidade:** aulas e treino abrem sem rede depois da primeira visita; o axe passa nas telas novas; "reduzir movimento" é respeitado.
7. **Entrega:** publicado no beta. A raiz vem depois da revisão das aulas num cubo de verdade.
