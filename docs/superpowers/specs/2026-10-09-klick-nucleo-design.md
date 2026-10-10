# Klick — núcleo do timer

**Sub-projeto 2: app de verdade, com núcleo do timer, embaralhamentos oficiais e persistência que nunca perde um solve**

| | |
|---|---|
| Data | 2026-10-09 |
| Status | Design aprovado em conversa (seções 1 a 5). Esta spec aguarda revisão. |
| Branch | `v2`. O app novo fica em `app/`, ao lado do `prototype/`. |
| Referências | Spec do sub-projeto 1 (`2026-10-08-klick-design.md`), o protótipo validado em `prototype/` e as pesquisas em `docs/research/` |

---

## 1. Contexto

O sub-projeto 1 entregou a linguagem visual, as telas e o Centro, num protótipo em HTML puro. Ele foi validado em 09/10:

- o Centro não distrai e não seria desligado;
- os avisos da inspeção e o recorde funcionam;
- a largada com dois polegares fica como está, quando sai o primeiro;
- o nome "Centro" fica.

O protótipo hoje está no ar em klick.ranimontagna.com, no lugar da v1.

Este sub-projeto transforma o protótipo no Klick de verdade. O código do protótipo é descartável, mas a lógica testada dele (timer, toque, estatísticas, coach e Centro) é portada para TypeScript.

| # | Sub-projeto | Situação |
|---|---|---|
| 1 | Linguagem visual, telas e Centro | Validado em 09/10 |
| **2** | **Núcleo do timer** | **Esta spec** |
| 3 | Companion: motor de animação, coach, temporadas | Depois |
| 4 | Trilha de aprendizado | Depois |
| 5 | Sync, conta e comunidade | Depois |

## 2. Entendimento

- **Para quem:** o próprio Ranielli no dia a dia, no desktop com a barra de espaço e no celular deitado na mesa.
- **O que muda para ele:** o Klick vira o timer de todo dia. Instala, funciona offline, cobre os eventos WCA principais e não perde nada.
- **Dor central** (pesquisa 1): perder o histórico de solves. Há relatos de quem perdeu de meses a 3 anos no csTimer, no Twisty Timer e no CubeDesk. Este sub-projeto existe para que isso não aconteça no Klick.
- **Como saber se deu certo:**
  - o app substitui o protótipo na raiz do domínio sem perder nenhum comportamento validado;
  - os solves sobrevivem a recarregar, ficar offline, fechar a aba no meio da gravação e trocar de aparelho por exportação.

## 3. Decisões

| # | Decisão | Descartado |
|---|---|---|
| D1 | **PWA instalável.** Um código só para desktop e celular, com modo offline e o mesmo endereço. | App nativo agora; só site no navegador |
| D2 | **Svelte 5 + Vite + TypeScript**, sem SvelteKit, porque é um app de uma página só. | React + TS; TypeScript sem framework; Solid |
| D3 | **Persistência local em camadas** sobre IndexedDB, com o modelo pronto para o sync do sub-projeto 5. | Nuvem já neste sub-projeto; local simples com exportação manual |
| D4 | **Paridade com o protótipo.** O app nasce com Timer, Evolução, Centro, Ajustes e diálogos. | Só Timer e histórico; só o núcleo, sem tela |
| D5 | **Eventos WCA principais** (13), com uma sessão por evento. | Só 3×3; 3×3 e 2×2 |
| D6 | **Imagem 2D do embaralhamento**, opcional. | Só o texto |
| D7 | **Núcleo em TypeScript puro + Svelte fino.** A lógica não conhece a tela. | Tudo em Svelte; monorepo com pacotes |
| D8 | **Entrega em duas fases:** o app vai para `beta.klick.ranimontagna.com` e só passa para a raiz quando atingir paridade. | Trocar a raiz direto |

## 4. Princípios

Os sete princípios do sub-projeto 1 continuam valendo. Este sub-projeto acrescenta três:

1. **Nenhum solve se perde.** Toda falha de gravação aparece para a pessoa e nunca descarta um dado em silêncio.
2. **O núcleo não conhece a tela.** Timer, regras, estatísticas, embaralhamentos e dados funcionam e são testados sem Svelte e sem DOM.
3. **Offline é o normal.** Depois da primeira visita, tudo funciona sem rede, inclusive gerar embaralhamentos.

## 5. Arquitetura

### 5.1 Onde fica

```
app/
  index.html
  src/
    core/      lógica pura em TS (timer, regras, eventos, estatísticas, coach, marcos, toque)
    data/      persistência sobre IndexedDB, cópias, lixeira, importar e exportar, migração da v1
    scramble/  adaptador do cubing.js (worker e fila)
    ui/        componentes Svelte (telas, diálogos) e estado da interface
    styles/    tokens e base portados do protótipo
    strings.ts textos pt-BR
  tests/       unidade (Vitest) e ponta a ponta (Playwright)
```

O `prototype/` fica no repositório como referência e sai do deploy quando o app chegar à raiz.

### 5.2 Camadas

| Pasta | Responsabilidade | Depende de |
|---|---|---|
| `src/core/` | Máquina de estados do timer, regras de inspeção e penalidades, catálogo de eventos, estatísticas no padrão do csTimer, coach, marcos e armar com dois polegares | nada |
| `src/data/` | Repositório sobre IndexedDB, migrações com versão, cópias automáticas, lixeira, importar e exportar (Klick e csTimer), migração da v1 | `core` |
| `src/scramble/` | Gera embaralhamentos com o cubing.js num worker e mantém a fila dos próximos | `core` |
| `src/ui/` | Telas e diálogos em Svelte. Lê o núcleo e mostra; não guarda regra de negócio | tudo acima |
| `src/styles/` | Tokens (claro, noite, sistema), base e estilos compartilhados. Cada componente tem o próprio CSS escopado | — |

### 5.3 Cronômetro

- O quadro a quadro (`requestAnimationFrame`) roda fora da reatividade do Svelte e escreve direto no elemento do tempo, como no protótipo.
- O tempo final vem do `timeStamp` dos próprios eventos de tecla e de toque, e não da hora em que o código roda. Isso tira a latência do processamento da medição.
- O valor é guardado em milissegundos e exibido truncado no centésimo (`0:58.42`).

### 5.4 PWA e deploy

- O service worker (Workbox, via `vite-plugin-pwa`) guarda o app, o cubing.js e as fontes Geist e Geist Mono, que passam a ser servidas pelo próprio app (licença OFL), sem Google Fonts.
- **Nova versão:** o app avisa "nova versão, recarregar" e nunca recarrega sozinho durante a inspeção ou um solve.
- **Deploy:** um Worker de arquivos estáticos no Cloudflare (conta Rani), o mesmo mecanismo que hoje serve o protótipo. O `wrangler.jsonc` aponta para o build do app.

### 5.5 Textos

Todos os textos em pt-BR ficam em `strings.ts`, como no protótipo.

## 6. Dados e persistência

### 6.1 Modelo

Banco IndexedDB `klick`, com o wrapper `idb`:

| Coleção | Campos |
|---|---|
| `solves` | `id`, `sessionId`, `event`, `ms` (tempo bruto), `penalty` (`null`, `'+2'` ou `'DNF'`), `at`, `scramble`, `note`, `createdAt`, `updatedAt`, `deletedAt` |
| `sessions` | `id`, `name`, `event`, `order`, `createdAt`, `updatedAt`, `deletedAt` |
| `profile` | ajustes, trilha marcada, acabamento escolhido |
| `backups` | cópias automáticas do banco inteiro, compactadas |
| `meta` | versão do esquema, id do aparelho, data da última cópia, data da última exportação, solves desde a última exportação |

- **Ids** únicos e ordenados no tempo.
- **`updatedAt`** em todo registro.
- **Exclusão** é uma marca (`deletedAt`), nunca uma remoção imediata.

Com isso, o sub-projeto 5 junta dados de vários aparelhos sem migrar o esquema.

### 6.2 As camadas que garantem "nunca perde"

1. **Gravação imediata.**
   - Cada solve é gravado numa transação no instante em que o timer para, antes da reação do Centro.
   - Se a gravação falhar (cota cheia, banco bloqueado), aparece um aviso fixo: "Não consegui salvar. Exporte seus dados agora." O solve fica em memória e o app tenta de novo.
2. **Armazenamento persistente.**
   - O app pede `navigator.storage.persist()` depois dos primeiros solves e ao ser instalado. Também há um botão em Ajustes. No Firefox, isso abre um pedido de permissão.
   - Ajustes mostra se o armazenamento está protegido e quanto espaço está em uso.
   - No iPhone, um guia ensina a instalar o app na tela inicial, porque o Safari pode apagar dados de sites não instalados após 7 dias sem uso.
3. **Cópias automáticas internas.** Uma cópia a cada 50 solves novos e, nos dias de uso, mais uma na primeira abertura do dia, se houver solves novos desde a última. Guarda as 10 últimas, restauráveis em Ajustes.
4. **Lixeira.** Solves e sessões excluídos ficam 30 dias, restauráveis. Ao abrir, o app limpa o que passou desse prazo.
5. **Cópia fora do navegador.**
   - A cada 100 solves sem exportar, o app mostra um lembrete discreto, nunca durante a inspeção ou o solve.
   - No Chrome desktop, a pessoa pode escolher uma pasta uma vez (File System Access API). Daí em diante, o app salva uma cópia nela a cada 100 solves novos e na primeira abertura de cada dia com solves novos.
6. **Exportar e importar.**
   - Dois formatos:
     - **Klick:** completo, com sessões, solves, ajustes e progresso.
     - **csTimer:** ida e volta. Na exportação, cada sessão leva o tipo de embaralhamento do evento, para o csTimer reconhecer.
   - Ao importar do csTimer, cada sessão é ligada a um evento pelo tipo de embaralhamento quando dá. As que não dá, a pessoa escolhe numa tela de mapeamento.
   - Importar junta os dados sem duplicar (por id ou, no csTimer, por data e tempo).
7. **Migração da v1.**
   - A v1 guardava as sessões na chave `klick-sessions` do `localStorage`, neste mesmo domínio.
   - Se o app encontrar esses dados, oferece importar uma vez e não apaga nada da v1.
   - Os dados que a v1 sincronizou no Supabase ficam de fora, porque exigiriam login.

### 6.3 Outros detalhes

- **Duas abas abertas** ficam sincronizadas por `BroadcastChannel`.
- **Migrações de esquema** têm versão e testes.
- **Começa vazio:** o app de verdade não tem os 212 solves de exemplo; o fim do tour oferece importar (v1 ou csTimer) ou começar do zero.
- **Protótipo:** os solves de teste não são migrados.

## 7. Eventos e embaralhamentos

### 7.1 Eventos

**Entram (13):** 3×3, 2×2, 4×4, 5×5, 6×6, 7×7, 3×3 com uma mão (OH), 3×3 às cegas (3BLD), Megaminx, Pyraminx, Skewb, Square-1 e Clock.

**Ficam de fora:**
- FMC, que não é um solve cronometrado;
- Multi-BLD, que é por pontos;
- 4BLD e 5BLD, que quase ninguém usa.

O catálogo aceita esses eventos depois.

### 7.2 Regras por evento

O catálogo de eventos (`core/events.ts`) diz, para cada evento, o nome, o id no cubing.js, se tem inspeção e qual média é a oficial.

| Regra | Eventos |
|---|---|
| Inspeção de 15 s, avisos aos 8 e 12 s, +2 depois de 15 s, DNF depois de 17 s | todos, menos 3BLD |
| Sem inspeção (a memorização conta no tempo) | 3BLD |
| Média oficial **Ao5** | 3×3, 2×2, 4×4, 5×5, OH, 3BLD (regra WCA 2026: Bo5 com Ao5), Megaminx, Pyraminx, Skewb, Square-1, Clock |
| Média oficial **Mo3** | 6×6, 7×7 |

As médias seguem a convenção do csTimer, já testada no protótipo: descartam `ceil(5% de n)` de cada lado, o DNF conta como o pior tempo, e se sobrar DNF depois do descarte a média vira DNF. O Mo3 não descarta nada.

### 7.3 Sessões, médias e recordes

- **Sessões:** cada uma pertence a um evento. Trocar de evento é trocar de sessão, e a pílula continua mostrando "3×3 · Sessão 1".
- **Médias:** a média oficial do evento, mais Ao12 e Ao100, contam pela sessão atual. O mesmo vale para o chip "vs média" e para o anel bom ou lento.
- **Recordes:** são por evento e somam todas as sessões dele.
- **Constância:** o mapa e os dias seguidos contam solves de qualquer evento.

### 7.4 O que cada evento ganha

- **Todos os eventos:** estatísticas, recordes, reação do anel e coach.
- **Só o 3×3:**
  - os marcos e a trilha do Centro, desenhados para a jornada de iniciante no cubo principal;
  - os limiares dos marcos (Sub-2:00, Sub-1:00 etc.).

O sub-projeto 3 pode estender os marcos a outros eventos.

### 7.5 Embaralhamentos

- **Fonte:** o cubing.js (`randomScrambleForEvent`), com embaralhamentos oficiais da WCA:
  - random-state onde a WCA usa random-state: 3×3, 2×2, 4×4, Pyraminx, Skewb, Square-1 e Clock;
  - movimentos aleatórios nos cubos grandes e no Megaminx, como faz o TNoodle.
- **Carga:** o gerador roda num worker e carrega sob demanda. O service worker o guarda para uso offline.
- **Fila:** o app mantém os próximos 2 embaralhamentos do evento atual prontos. O primeiro do 4×4, que pode levar alguns segundos, não trava a tela.
- **Pular:** N pula para o próximo embaralhamento da fila.
- **Registro:** o embaralhamento usado fica gravado no solve.
- **Texto longo:** os embaralhamentos longos (Megaminx, 6×6, 7×7) quebram em linhas na fonte mono.
- **Imagem 2D:**
  - a vista planificada do cubing.js, pequena ao lado do embaralhamento no desktop e abaixo dele no celular;
  - liga e desliga em Ajustes; ligada por padrão.

### 7.6 Testes

- O núcleo recebe o gerador de embaralhamentos por injeção. Os testes de unidade usam embaralhamentos fixos.
- Um teste de integração gera de verdade embaralhamentos de alguns eventos (3×3, 2×2, Pyraminx, Square-1) e confere a notação.

## 8. Timer, entrada, telas e Centro

### 8.1 Timer

- **Estados:** a máquina validada no protótipo é portada para TypeScript: parado → inspeção → armando → pronto → resolvendo → resultado.
- **Casos de borda viram testes de regressão:**
  - toque cancelado pelo sistema abandona, não larga;
  - o soltar do espaço sempre pareia com o seu armar;
  - perder o foco ou esconder a página abandona o segurar;
  - o clique que para o timer é engolido, e só o ponteiro primário libera esse bloqueio;
  - auto-repeat de tecla não arma nem para;
  - `cancel()` sempre esquece o toque de inspeção pendente.
- **Inspeção:** a regra vem do catálogo de eventos. No 3BLD, o timer arma direto.

### 8.2 Entrada

- **Desktop:** espaço arma e larga, e qualquer tecla para.
- **Celular:**
  - dois polegares por padrão, largando quando sai o primeiro (validado no sub-projeto 1);
  - ou "um toque", em que a tela inteira do Timer arma, menos os controles.
- **Tela acesa:** enquanto a aba do Timer está visível, o app pede a Screen Wake Lock. Libera ao sair da aba ou esconder a página e pede de novo ao voltar.
- **Atalhos:** iguais aos do protótipo (P, D, M, ⌫, Z, N, ?, 1–4).

### 8.3 Telas

Paridade com o protótipo, com estas mudanças:

| Tela | O que muda |
|---|---|
| Timer | Imagem 2D do embaralhamento; o evento na pílula da sessão; os tiles mostram a média oficial do evento (Ao5 ou Mo3) |
| Evolução | Filtro por evento, além de sessão e período; a média oficial de cada evento |
| Centro | Igual; os marcos e a trilha valem para o 3×3 |
| Ajustes | Novo bloco "Seus dados" (ver abaixo); liga e desliga a imagem do embaralhamento |
| Primeira vez | Sem dados de exemplo. O fim do tour oferece importar (v1 ou csTimer) ou começar do zero |
| Sessões | Escolhe o evento ao criar uma sessão; a lista agrupa as sessões por evento |

O bloco "Seus dados" em Ajustes tem:
- o estado do armazenamento protegido e o espaço em uso;
- as cópias automáticas, com restauração;
- a lixeira;
- exportar e importar (Klick e csTimer);
- a pasta de cópias automáticas (Chrome desktop);
- o guia de instalação.

### 8.4 Centro e coach

- Portados como estão no protótipo: SVG, estados, reação do anel, mensagens do coach e marcos.
- O sub-projeto 3 troca o motor de animação.
- As mensagens que citam média usam a média oficial do evento ("média de 5" ou "média de 3").

### 8.5 Svelte

- Um componente por tela.
- O estado da interface fica em classes com runes (`$state`, `$derived`) que leem o núcleo.
- O tempo na tela é atualizado direto, fora da reatividade.

### 8.6 Acessibilidade

Tudo o que o protótipo garante continua, agora com testes automatizados:
- AA nos dois temas;
- `aria-live` com o tempo final e a mensagem do coach;
- foco preservado depois de redesenhar a tela;
- alvos de toque de 44 px;
- reduzir movimento.

## 9. Testes

| Camada | Ferramenta | O que cobre |
|---|---|---|
| Núcleo | Vitest | Timer com todos os casos de borda, inspeção por evento, penalidades, médias Ao5 e Mo3, coach, marcos, toque |
| Dados | Vitest + `fake-indexeddb` | Gravar e ler, migrações, cópias automáticas, lixeira, ida e volta com o csTimer (com um arquivo real de exemplo), migração da v1 (com dados reais de exemplo) |
| Embaralhamentos | Vitest | Gerador injetado nos testes de unidade; geração real de alguns eventos na integração |
| Telas | `@testing-library/svelte` | Estados do tempo, ajustes, diálogo de sessões |
| Ponta a ponta | Playwright, com relógio controlado | Solve no teclado; +2 e DNF da inspeção; dois polegares no celular emulado; recarregar e ficar offline sem perder nada; importar e exportar |
| Acessibilidade | `@axe-core/playwright` + teste de contraste dos tokens | AA nos dois temas, em cada tela |
| Tipos | `svelte-check` + TypeScript estrito | — |

## 10. Entrega e critérios de aceite

### 10.1 Duas fases

1. **Desenvolvimento.**
   - O app é publicado em `beta.klick.ranimontagna.com`, enquanto o protótipo segue na raiz.
   - A migração da v1 só pode ser testada na raiz, porque os dados da v1 estão gravados naquele endereço.
2. **Paridade.**
   - Quando os critérios abaixo passarem, a raiz passa a servir o app.
   - O service worker do app substitui o `sw.js` de limpeza que está no ar e apaga os caches antigos.

### 10.2 Critérios de aceite

1. Tudo da seção 8.5 da spec do sub-projeto 1 continua valendo no app.
2. Os 13 eventos têm embaralhamento oficial, imagem 2D, inspeção certa (3BLD sem) e média certa (Ao5 ou Mo3), conferidas com dados de resultado conhecido.
3. Fechar a aba logo depois de parar o timer não perde o solve. Recarregar e ficar offline mantém tudo.
4. Funcionam:
   - a cópia automática a cada 50 solves e a restauração de uma cópia;
   - a lixeira de 30 dias;
   - a ida e volta com o csTimer sem perda;
   - a migração da v1.
5. O app instala no Android e no iPhone e funciona offline depois da primeira visita. O aviso de nova versão nunca interrompe um solve.
6. O tempo final bate com o `timeStamp` dos eventos (teste automatizado). Gerar o primeiro embaralhamento do 4×4 não trava a tela.
7. O axe não acusa violações sérias, e a suíte inteira passa.

## 11. Fora de escopo

- Conta, sync e comunidade (sub-projeto 5).
- O motor de animação novo do Centro e as temporadas 2 em diante (sub-projeto 3).
- As aulas da trilha (sub-projeto 4).
- Smart cube e stackmat.
- FMC, Multi-BLD, 4BLD e 5BLD.
- Outros idiomas além do pt-BR.
- Splits por etapa.

## 12. Riscos e pendências

| Item | Como resolver |
|---|---|
| O cubing.js é pesado | Carrega sob demanda, num worker, e fica guardado para uso offline. Medir o peso no build. |
| O Safari pode apagar os dados | Guia de instalação na tela inicial, `storage.persist()` e lembretes de exportar. |
| A pasta de cópias automáticas só funciona em navegadores Chromium | Nos outros, ficam os lembretes de exportar. |
| O formato do csTimer varia entre versões | Testes com arquivos reais. Tela de mapeamento para sessões sem evento reconhecível. |
| Precisão do `timeStamp` entre navegadores | Teste automatizado. Se algum navegador não entregar o tempo em alta resolução, usar `performance.now()` no handler. |
| Formato exato dos dados da v1 | Ler o código da v1 (`src/shared/store/sessions-store.ts` em `main`) durante o plano e montar dados de exemplo para o teste. |
| Curva de aprendizado do Svelte 5 | Componentes pequenos e a lógica toda no núcleo em TS. |

## 13. Referências

- `docs/superpowers/specs/2026-10-08-klick-design.md`: linguagem visual, Centro, telas e critérios do sub-projeto 1.
- `prototype/`: o protótipo validado, com a lógica de referência e 91 testes.
- `docs/research/2026-10-07-cenario-de-timers.md`: a dor nº 1 (perder o histórico), o csTimer e as regras WCA de 2026–27.
- cubing.js: `randomScrambleForEvent` e a vista 2D do `cubing/twisty`.
