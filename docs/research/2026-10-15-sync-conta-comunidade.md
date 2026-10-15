# Pesquisa 4: sync, conta e comunidade (preparação do sub-projeto 5)

Para: a conversa de design do sub-projeto 5 do Klick v2. Fontes acessadas em 15/10/2026. Idioma: pt-BR.

Base: o código da branch `v2` (camada `app/src/data/`), as specs dos sub-projetos 1 a 4 e a pesquisa 1. Preços e limites valem para a data de acesso. Quando escrevo "Leitura:", é interpretação minha, não fato da fonte. Este documento não fecha o design: ele junta o que é preciso saber antes da conversa.

---

## 1. Resumo

1. **Dá para decidir já:** a conta é opcional e o app continua 100% local sem ela; o backend fica no Cloudflare, na mesma origem do app (`/api`); o Workers Paid (US$ 5/mês) entra desde o primeiro dia.
2. **Dá para decidir já:** o sync é próprio, "último a gravar vence" por registro, com marcas de exclusão guardadas no servidor e um cursor de versão. Nenhum motor pronto encaixa: o Zero não aceita escrita offline, PowerSync e Electric exigem Postgres, o Replicache está em manutenção e o Dexie Cloud cobra por usuário.
3. **Dá para decidir já:** o login não pode depender de redirecionamento. No iPhone, o PWA instalado e o Safari não dividem armazenamento, e link mágico e OAuth tendem a cair no Safari. Código por email (mais passkey) resolve.
4. **Achado principal:** a promessa da spec do núcleo, "junta dados de vários aparelhos sem migrar o esquema", só vale para solves. Sessões, treino, perfil e temporada têm lacunas concretas (seção 3.2), e o banco local precisa de uma versão 3.
5. **Precisa da conversa:** dividir o sub-projeto ou não; o que do perfil é da conta e o que é do aparelho; as regras de conflito (temporada, trilha, exclusão contra edição); o que é "histórico de versões"; o formato da comunidade e do Head-to-Head; o tratamento de menores (ECA Digital); quem é o controlador para a LGPD.
6. **Custo estimado:** cerca de US$ 5/mês até 5.000 contas e de US$ 40 a 70/mês com 50.000 (seção 6.3).

---

## 2. O que as specs já prometem para o sub-projeto 5

- **Camada 3 do produto:** "Sync, conta e comunidade" (`docs/superpowers/specs/2026-10-08-klick-design.md:22`, tabela na linha 32).
- **A dor nº 1 vira princípio:** perder o histórico (`2026-10-08-klick-design.md:43`).
- **Espaço reservado:** "Conta e sync com histórico de versões e lixeira. Isso responde à dor nº 1" e "Comunidade e o formato Head-to-Head" (`2026-10-08-klick-design.md:529-530`). Também as regras WCA de 2026–27, na linha 531.
- **Decisão D3 do núcleo:** persistência local em camadas sobre IndexedDB, "com o modelo pronto para o sync do sub-projeto 5" (`docs/superpowers/specs/2026-10-09-klick-nucleo-design.md:50`).
- **O modelo que promete isso** (`2026-10-09-klick-nucleo-design.md:112-128`):
  - ids únicos e ordenados no tempo (linha 124);
  - `updatedAt` em todo registro (125);
  - exclusão como marca `deletedAt`, nunca remoção imediata (126);
  - "Com isso, o sub-projeto 5 junta dados de vários aparelhos sem migrar o esquema" (128).
- **Lixeira de 30 dias,** limpa ao abrir (`2026-10-09-klick-nucleo-design.md:140`).
- **Dados da v1 no Supabase ficaram de fora** porque exigiriam login (`2026-10-09-klick-nucleo-design.md:159`).
- **Progresso nunca regride:** importar, restaurar ou apagar não tira temporada nem acabamento (`docs/superpowers/specs/2026-10-13-klick-companion-design.md:71`, detalhado em 226-235).
- **Treino:** importar junta o treino pelo id, e no perfil "vale o do arquivo" caso a caso (`docs/superpowers/specs/2026-10-14-klick-trilha-design.md:343`).
- **Da pesquisa 1** (`docs/research/2026-10-07-cenario-de-timers.md`):
  - garantia de nunca perder um solve, com sync, histórico de versões, lixeira e status de backup visível (linha 371);
  - um "log de eventos só de acréscimo" como ideia (700);
  - o anti-padrão "merge de sync que apaga dados", visto no Nexus (735);
  - o anti-padrão "login obrigatório para salvar" (729);
  - o modelo do Monkeytype: "a conta só acrescenta sync" (635).

**Antecedente:** a v1 (branch `main`) já teve tudo isso no Supabase:
- sync "último a gravar vence" por `updated_at` (`docs/supabase-migrations.md` na `main`);
- login por link mágico e Google (`src/shared/store/auth-store.ts`);
- links de compartilhamento, amigos e leaderboards (migrações `us010` e `us014`);
- rotas de política de privacidade e termos (commit `ce81d54`).

Leitura: o sub-projeto 5 não parte do zero em ideias, mas parte do zero em código, como toda a v2.

---

## 3. Inventário do modelo local e prontidão para sync

Banco IndexedDB `klick`, versão 2 (`app/src/data/db.ts:6`). Toda escrita passa por `write()`, uma transação com `durability: 'strict'` (`app/src/data/repository.ts:329-351`).

### 3.1 Por store

| Store | O que guarda | Id | Carimbos de tempo | Exclusão e lixeira | Como o import junta hoje | Sincroniza? |
|---|---|---|---|---|---|---|
| `solves` | Um solve: `sessionId`, `event`, `ms`, `penalty`, `at`, `scramble`, `note` (`app/src/core/types.ts:8-20`) | `newId()`, 17 caracteres em base 36: tempo, contador e 6 aleatórios (`app/src/data/ids.ts:1-4, 40-43`). O da v1 é mantido (`app/src/data/transfer.ts:383-385`), e o do csTimer é novo a cada importação (`transfer.ts:282-288`) | `createdAt`, `updatedAt` (relógio do aparelho) e `at` | Marca `deletedAt`, também em cascata com a sessão (`repository.ts:434-438`). O purge apaga de vez depois de 30 dias (`repository.ts:559-574`; `app/src/data/safety.ts:16`; chamado ao abrir em `app/src/ui/state/app.svelte.ts:407`) | Por id: entra o novo, e o de `updatedAt` estritamente maior substitui; no empate fica o daqui (`repository.ts:703-718`) | **Sim** |
| `sessions` | Nome, evento, `order` (`types.ts:22-30`) | `newId()` | `createdAt`, `updatedAt` | Marca `deletedAt` mais o purge de 30 dias | **Só entram as novas.** A que já existe fica como está, então renomear, excluir ou restaurar no outro aparelho não chega (`repository.ts:692-701`). Uma sessão na lixeira volta se chegar solve ativo dela (`repository.ts:720-726`) | **Sim** |
| `practice` | Tentativa do treino: `caseId`, `ms`, `ok`, `helped`, `at` (`types.ts:34-41`) | `newId()` | **Só `at`.** Sem `updatedAt` | **Remoção de verdade** (`repository.ts:841-846`). `updatePractice` muda `ok` sem carimbo (`repository.ts:828-839`) | Só entra o que não existe; o resto fica (`repository.ts:765-768`) | **Sim**, depois de ganhar carimbo e marca |
| `profile` | Um registro só, chave `'current'` (`db.ts:25`): ajustes, `trail[9]`, `finish`, `onboarded`, `currentSessionId`, `season`, `lessonAt`, `algChoice`, `trainOff` (`types.ts:99-110`) | Chave fixa | **Nenhum** | n/a | Campo a campo, "vale o do arquivo" (`repository.ts:728-763`): ajustes e acabamento do arquivo; trilha soma (OU); `onboarded` OU; sessão atual do arquivo só se a daqui está vazia; temporada a mais adiantada; `algChoice` e `lessonAt` juntam por chave; `trainOff` vem inteiro do arquivo | **Em partes** (a decidir) |
| `meta` `'current'` | `deviceId`, contadores e datas de cópia e exportação, avisos já vistos (`types.ts:113-128`) | Chave fixa | Datas próprias | n/a | Não vai no export | **Não.** É do aparelho; o `deviceId` serve ao sync |
| `meta` `'folderHandle'` | Handle da pasta de cópias (Chrome) | Chave fixa | n/a | n/a | n/a | **Não** |
| `backups` | Até 10 cópias completas, gzip em base64 (`db.ts:9-16`; `safety.ts:147-167`) | `newId()` | `createdAt` | Poda remove de vez | n/a | **Não** (pesado; o servidor pode ter as próprias cópias) |

### 3.2 Lacunas concretas

1. **Nada registra o que mudou desde o último sync.**
   - Os índices são só `bySession`, `byEvent` e, no treino, `byCase` e `byAt` (`db.ts:56-74`).
   - Achar o que mudou exige ler todos os solves (`getAll`), e com dezenas de milhares no iPhone isso pesa.
   - Precisa de uma fila de pendentes, gravada na mesma transação de `write()`, ou de um índice por `updatedAt`. As duas pedem `DB_VERSION` 3.
   - **Cuidado:** depois da versão 3 não dá para voltar o deploy para a 2 (VersionError), como já registrado na spec da trilha (`2026-10-14-klick-trilha-design.md:324`).
2. **O carimbo é o relógio do aparelho e o empate não converge.**
   - `updatedAt` vem de `now()`. Com um relógio errado, o registro errado vence.
   - No empate, cada lado fica com o seu (`repository.ts:710`, `>` estrito), e dois aparelhos com o mesmo carimbo e conteúdo diferente nunca se acertam.
   - O `deviceId` existe (`types.ts:115`, criado em `repository.ts:180`) mas não está em nenhum registro.
   - Precisa de um desempate determinístico (o aparelho, ou um relógio híbrido).
3. **Sessões não seguem "último vence"** (`repository.ts:692-701`). No sync, renomear e excluir precisam viajar como os solves.
4. **A exclusão em cascata depende de marcas iguais.**
   - `restoreSession` só traz de volta os solves com o mesmo `deletedAt` da sessão (`repository.ts:455`).
   - Isso sobrevive ao sync se os registros viajarem intactos.
   - Mas uma edição concorrente (nota ou penalidade num solve da sessão excluída, feita em outro aparelho) vence a exclusão e, pelo invariante "solve ativo ⇒ sessão ativa" (`repository.ts:7-10, 212-218`), **ressuscita a sessão**. A conversa precisa decidir se exclusão vence edição.
5. **Remoções de verdade ressuscitam registros.**
   - O purge da lixeira (`repository.ts:559-574`) e `deletePractice` (`repository.ts:843`) apagam sem deixar marca.
   - Um aparelho que ficou offline com a versão antiga empurra o registro de volta.
   - O servidor precisa guardar a marca de exclusão (só id e datas) por bem mais que 30 dias, ou para sempre.
6. **O treino não tem carimbo nem marca de exclusão** (`types.ts:34-41`). A correção da última tentativa (`ok`) e a exclusão dela (`app/src/ui/trilha/TrainRound.svelte:150`) não se propagam.
7. **O perfil é um registro único, sem carimbo, que mistura conta e aparelho** (`db.ts:25`; `types.ts:99-110`).
   - `currentSessionId` é claramente do aparelho.
   - Parte dos ajustes também é: `mobileArm`, `holdMs`, sons e talvez tema e Centro.
   - A regra "vale o do arquivo" não é comutativa: com dois aparelhos sincronizando, cada um impõe o seu ao outro, e o resultado depende da ordem.
   - Três casos quebram com as regras de hoje:
     - **Trilha:** a soma por OU (`repository.ts:749`) impede que desmarcar uma etapa se propague, e a tela permite desmarcar (`app.svelte.ts:1079`).
     - **`lessonAt`:** concluir uma aula apaga a chave (`app.svelte.ts:1094-1095`), e a junção `{...base, ...theirs}` (`repository.ts:755`) a traz de volta.
     - **`trainOff`:** é trocado inteiro (`repository.ts:756`), então uma mudança concorrente se perde.
8. **A temporada pode divergir para sempre.**
   - Cada aparelho fecha a temporada sozinho (`repository.ts:591-602`), com `startedAt`, metas e `basis` calculados sobre os solves que ele tinha naquele momento.
   - `moreAdvanced` escolhe por `past.length` e, no empate, fica com a daqui (`app/src/core/season.ts:131-133`).
   - Dois aparelhos na mesma T2 com metas diferentes não convergem.
   - Precisa de regra determinística, por exemplo: vence a virada de `endedAt` mais antigo, ou a que chegar primeiro ao servidor.
9. **Aparelho novo cria uma "Sessão 1" antes do primeiro sync** (`app.svelte.ts:1382-1387`). Depois do sync, a pessoa fica com uma sessão de 3×3 vazia e duplicada.
10. **Importar o mesmo arquivo do csTimer em dois aparelhos duplica tudo.**
    - Os ids são novos a cada importação (`transfer.ts:282-288`).
    - A deduplicação por "mesmo ms no mesmo segundo" só olha os solves locais (`transfer.ts:249-251, 262`).
11. **Restaurar uma cópia apaga as stores e regrava** (`repository.ts:777-809`, `clear()` na 791).
    - Com sync, o que sumiu localmente não deixa marca: ou o servidor devolve tudo, ou o aparelho diverge em silêncio.
    - A restauração precisa virar escrita com carimbos novos (marcas de exclusão e atualizações), que se propaga e pode ser desfeita.
12. **O banco local não pertence a uma conta.** Entrar com outra conta no mesmo aparelho misturaria os dados. Falta um `accountId` no `meta`, ou um banco por conta.
13. **Várias abas sincronizariam juntas.** Hoje elas conversam por `BroadcastChannel` (`repository.ts:110-124`). O sync precisa rodar numa aba só (Web Locks, no Safari desde a 15.4, segundo a [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)).
14. **Versões de formato:**
    - `Meta.schemaVersion` está parado em 1 e não é usado (`repository.ts:134`), enquanto o banco já está na 2.
    - O export só aceita a `version: 1` (`repository.ts:48-56`; `safety.ts:117-121`).
    - O protocolo de sync precisa da própria versão.

### 3.3 O que já está pronto e ajuda

- **Ids:** globalmente únicos na prática. Eles são gerados por quem grava, então a repetição não duplica (`repository.ts:482-498`).
- **Exclusão:** é marca em solves e sessões.
- **Campos desconhecidos:** passam intactos pela importação (`transfer.ts:58-59`). Um app antigo, ainda em cache, não destrói campo novo.
- **Ponto de partida do merge:** o `importAll` já é um merge testado com as regras de invariante. Generalizar é melhor que reescrever.
- **Avisos às abas:** o repositório já avisa as outras abas com os ids dos solves que mudaram (`repository.ts:300-305`). O sincronizador pode usar o mesmo aviso.

---

## 4. Opções de sync

### A. Cofre na nuvem: cópia inteira por conta

- **Como:** o app sobe o `KlickExport` comprimido (o mesmo das cópias automáticas, `safety.ts:109-114`) para o R2 ou para uma linha por conta. O outro aparelho baixa e roda o `importAll`.
- **Prós:**
  - Pouco código.
  - Reaproveita o export, o import e a compressão.
  - Ataca a dor nº 1, perder tudo, já na primeira versão.
  - Muito barato.
- **Contras:**
  - Herda todas as lacunas do `importAll` (seção 3.2): sessões não atualizam, perfil não comutativo, treino sem exclusão.
  - Cada sync sobe e baixa o histórico inteiro: centenas de KB a alguns MB no celular.
  - Duas gravações concorrentes da cópia exigem trava (condicional por ETag ou versão).
- **Custo:** centavos (seção 6.3).
- **Esforço:** pequeno, de 1 a 2 semanas.

### B. "Último a gravar vence" por registro, com cursor do servidor (recomendada)

- **Como:**
  - Cada registro tem carimbo (`updatedAt` mais um desempate pelo aparelho, ou um [relógio híbrido](https://cse.buffalo.edu/tech-reports/2014-04.pdf)) e marca de exclusão.
  - O cliente empurra os pendentes. O servidor aceita o que tiver carimbo maior, numera cada aceite com uma versão crescente da conta e guarda as marcas de exclusão.
  - O cliente puxa "tudo desde a versão N".
  - É o modelo que a v1 usava, e o que o RxDB descreve no [protocolo de replicação HTTP](https://rxdb.info/articles/alternatives/replicache-alternative.html).
- **Prós:**
  - Encaixa no modelo atual: solves e sessões já têm carimbo e marca.
  - Sync incremental e offline primeiro.
  - Zero dependência de fornecedor.
  - Roda inteiro no Cloudflare.
  - O merge é o `importAll` generalizado.
- **Contras:**
  - Exige corrigir as lacunas 1 a 12 da seção 3.2.
  - Exige testes fortes. O merge precisa ser comutativo, associativo e idempotente, para que a ordem dos aparelhos não mude o resultado, e "nenhum solve ativo some" precisa virar teste de propriedade.
  - O perfil pede regras por campo, não "último vence".
- **Custo:** US$ 5 a 45/mês conforme a escala (seção 6.3).
- **Esforço:** médio, de 3 a 5 semanas com testes.

### C. Log de operações (event sourcing)

- **Como:** cada mudança vira um evento (`solveAdded`, `penaltySet`, `solveDeleted`…), o servidor ordena, e os aparelhos reaplicam.
- **Pronto para Cloudflare:** o [LiveStore](https://cdn.jsdelivr.net/npm/@livestore/sync-cf@0.4.0/README.md) faz isso, com sync sobre Durable Objects e D1 (pacote `@livestore/sync-cf`, versão 0.4).
- **Prós:**
  - O histórico de versões sai de graça.
  - Desfazer e auditar ficam naturais.
- **Contras:**
  - Reescreve a camada de dados, que hoje garante o "nunca perde" com testes. O LiveStore troca o IndexedDB por SQLite no navegador.
  - Exige compactação e versionamento dos eventos.
  - Reaplicar milhares de eventos num iPhone lento é lento.
  - A biblioteca ainda está em 0.x.
- **Custo:** parecido com B.
- **Esforço:** alto, de 6 a 10 semanas, e com risco para o que já funciona.

### D. CRDT de documento (Automerge, Yjs)

- **Como:** um documento por conta, que cada aparelho edita e funde.
- **Prós:**
  - Fusão automática e matematicamente correta.
  - Há servidores para Durable Objects.
- **Contras:**
  - Feito para texto e estruturas colaborativas, não para 20 mil registros que só crescem.
  - O Automerge mantém o documento inteiro na memória; a [versão 3](https://automerge.org/blog/automerge-3/) cortou a memória em mais de 10 vezes, mas o modelo é esse.
  - O histórico cresce sem parar.
  - O Yjs replica o estado inteiro para cada aparelho ([docs](https://docs.yjs.dev/getting-started/allowing-offline-editing)).
- **Leitura:** serve, no máximo, para o perfil, e mesmo ali regras por campo são mais simples.
- **Esforço:** alto, com encaixe ruim.

### E. Motor de sync pronto

| Motor | Situação (out/2026) | Encaixe no Klick |
|---|---|---|
| [Replicache](https://replicache.dev/) | Em manutenção, grátis e aberto; a equipe recomenda migrar para o Zero | Bom no protocolo, mas troca o IndexedDB pelo armazenamento dele, e sem evolução |
| [Zero](https://zero.rocicorp.dev/docs/offline) | Apache-2, 1.0 simbólico; exige Postgres e o servidor `zero-cache` ([self-host](https://zero.rocicorp.dev/docs/self-host)) | **Não serve:** rejeita escrita offline, e o timer precisa funcionar offline |
| [PowerSync](https://powersync.com/pricing) | Postgres (ou outros) mais o serviço deles, com SQLite no cliente. Free: 2 GB sincronizados por mês e 50 conexões, desativado após 7 dias sem uso; Pro a partir de US$ 49/mês | Fora do Cloudflare; troca a camada local |
| [ElectricSQL](https://electric-sql.com/blog/2026/04/02/electric-cloud-pricing) | Só o caminho de leitura do Postgres; a escrita é sua. Cloud a US$ 1 por milhão de escritas (abr/2026) | Não resolve a escrita offline; exige Postgres |
| [InstantDB](https://toolradar.com/tools/instantdb/pricing) | Banco hospedado com offline; tem plano grátis (os números variam entre agregadores) | Dados no servidor deles; amarra o app |
| [Triplit](https://supabase.com/blog/triplit-joins-supabase) | O fundador foi para o Supabase em 08/10/2025, e o Supabase não vai integrar o produto | Futuro incerto |
| [RxDB](https://rxdb.info/rx-server.html) | Núcleo Apache-2; replicação HTTP grátis com backend próprio; plugins premium pagos | Troca a camada local; o protocolo é boa referência para B |
| [Dexie Cloud](https://dexie.org/pricing) | US$ 0,12 por usuário por mês; o grátis vale para 3 usuários de produção | Caro em escala: 50 mil contas dariam US$ 6 mil/mês; troca `idb` por Dexie |

**Recomendação: B.**
- O modelo já está 70% lá, e o que falta (seção 3.2) teria de ser corrigido em qualquer opção que não reescreva a camada.
- A pode ser o primeiro passo, se a conversa quiser entregar "backup na nuvem" antes do sync entre aparelhos. Só que A herda as lacunas do `importAll`, e B as corrige.

**Esboço de B, para a conversa e não para fechar:**
- **No cliente:**
  - Uma store `outbox` (`DB_VERSION` 3) recebe `[store, id]` na mesma transação de cada `write()`.
  - Um sincronizador, numa aba só (Web Locks), empurra e puxa em lotes: ao abrir, ao voltar ao app (`visibilitychange`), alguns segundos depois de gravar e por um botão.
  - O Safari não tem Background Sync (conhecimento geral): o sync só roda com o app aberto.
- **No servidor:**
  - Por conta, `solves`, `sessions` e `practice` guardam `{id, dados em JSON, carimbo, apagado, versão}`, e o perfil é uma tabela de campos com carimbo próprio.
  - Os dados vão em JSON para preservar campos desconhecidos.
  - As marcas de exclusão nunca saem: só o conteúdo é limpo.
- **No merge:** as mesmas invariantes do repositório (`repository.ts:7-10`), e cada sync grande ganha antes uma cópia local com o motivo novo `'pre-sync'`.

---

## 5. Conta e login

### 5.1 O que o iPhone muda

- **Safari e PWA instalado são dois aparelhos.**
  - O app da tela inicial não divide cookies, `localStorage` nem IndexedDB com o Safari (relatos da [Netguru](https://www.netguru.com/blog/how-to-share-session-cookie-or-state-between-pwa-in-standalone-mode-and-safari-on-ios) e da [Progressier](https://progressier.com/pwa-capabilities/cookies-demo); a Apple não documenta isso com clareza).
  - Hoje, quem usou no Safari e depois instalou tem dois históricos separados no mesmo iPhone.
  - Leitura: o sync resolve isso de brinde, mas o login precisa funcionar dentro do PWA.
- **A regra dos 7 dias.**
  - O app da tela inicial tem o próprio contador de dias de uso, e a WebKit "não espera" que os dados dele sejam apagados ([WebKit, mar/2020](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
  - No Safari comum, o armazenamento de um site sem uso pode ser removido.
  - O `persist()` é concedido por heurística, por exemplo a de estar instalado na tela inicial ([WebKit, ago/2023](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- **Redirecionamentos saem do app.**
  - Há relatos de longa data de OAuth no PWA do iOS que volta para o Safari e não para o app, ou que trava na volta ([fórum da Apple](https://developer.apple.com/forums/thread/649699), [Auth0](https://community.auth0.com/t/login-to-pwa-on-ios-using-social-identity-provider/18109)).
  - São relatos antigos: testar no aparelho antes de decidir.
  - O link mágico tem o mesmo problema por outro caminho: o link do email abre no Safari, e a sessão fica lá.
- **Código por email é cômodo no iPhone.** Desde o iOS 17, o teclado sugere o código que chegou no app Mail ([Macworld](https://www.macworld.com/article/1944553/ios-17-beta-feature-clean-up-verification-codes-automatically.html)). Há relato de que nem todo email dispara a sugestão: testar com o email real.
- **Cookie de sessão** definido pelo servidor, na mesma origem e `HttpOnly`, não sofre o limite de 7 dias dos cookies criados por script (conhecimento geral; conferir).
  - Por isso a API deve morar em `klick.ranimontagna.com/api`.
  - O Worker de arquivos estáticos aceita `run_worker_first: ["/api/*"]` ([docs](https://developers.cloudflare.com/workers/static-assets/binding/), Wrangler 4.20 ou mais novo).

### 5.2 Métodos

| Método | Safari no iPhone | PWA instalado no iPhone | Chrome no desktop | Custo | Observação |
|---|---|---|---|---|---|
| **Código por email** (6 dígitos) | Funciona; o iOS 17+ sugere o código do Mail | Funciona: tudo acontece dentro do app | Funciona | Envio de email | Entrega: precisa domínio com SPF e DKIM; cair no spam é o risco |
| Link mágico | Funciona | **Ruim:** o link abre no Safari | Funciona | Envio de email | Dá para mandar link e código no mesmo email |
| **Passkey** | Funciona (Face ID, Chaves do iCloud) | Conhecimento geral: o WebAuthn funciona em app da tela inicial; **testar** | Funciona (gerenciador do Google, ou o iPhone por QR) | Zero | Precisa de recuperação (email); o `rpID` `klick.ranimontagna.com` cobre também o `beta.` |
| Google | Funciona (redirecionamento) | Risco de sair do app (seção 5.1) | Funciona | Grátis | Mais um terceiro na política de privacidade |
| Apple | Funciona | Mesmo risco | Funciona | US$ 99/ano no Apple Developer Program ([guia](https://techdocs.akamai.com/identity-cloud/docs/the-sign-in-with-apple-social-login-configuration-guide)) | "Ocultar meu email" gera endereço de repasse |
| Sem email (código de pareamento) | Funciona | Funciona | Funciona | Zero | A conta nasce anônima e o 2º aparelho entra por código ou QR. Perder o código é perder a conta da nuvem (os dados locais ficam). Mínimo de dado pessoal |

### 5.3 Bibliotecas e serviços

| Opção | Situação | Encaixe |
|---|---|---|
| [Better Auth](https://better-auth.com/blog/1-5) | Aberto. D1 nativo desde a 1.5; plugins de [código por email](https://better-auth.com/docs/plugins/email-otp), [passkey](https://www.better-auth.com/docs/plugins/passkey) (SimpleWebAuthn, com autopreenchimento e cadastro sem sessão), link mágico e [anônimo](https://better-auth.com/docs/plugins/anonymous) (com vínculo posterior). Pede `nodejs_compat` no Worker. Mantém o Auth.js desde 22/09/2025 ([post](https://www.better-auth.com/blog/authjs-joins-better-auth)) e entrou na Vercel em 07/07/2026, prometendo seguir aberto e agnóstico de plataforma ([post](https://better-auth.com/blog/better-auth-joins-vercel)) | **Recomendado** |
| Implementação própria | O Lucia virou material de estudo em 2025 ([npm](https://www.npmjs.com/package/lucia-auth)); o guia mais SimpleWebAuthn dão o caminho | Controle total, mais código e mais superfície de erro |
| Auth.js | Em manutenção pela equipe do Better Auth, que indica o Better Auth para projetos novos | Não |
| [Clerk](https://clerk.com/pricing) | Hospedado; grátis até 50 mil usuários retidos por mês; **passkey só no plano Pro** | Terceiro com os dados; amarra o app |
| Supabase Auth | 50 mil usuários ativos por mês grátis; no plano grátis o projeto pausa depois de 7 dias sem uso ([guia de 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)); a v1 usava | Fora do Cloudflare |
| Cloudflare Access | Feito para equipes (Zero Trust), não para o público de um app | Não |

**Envio de email:**
- O [Email Service do Cloudflare](https://developers.cloudflare.com/email-service/platform/pricing/) exige o Workers Paid: 3.000 envios/mês incluídos, depois US$ 0,35 por mil.
- O [Resend](https://resend.com/pricing) dá 3.000/mês grátis (100 por dia); o Pro custa US$ 20 por 50 mil.

**Recomendação:**
- Código por email como base, mais passkey como atalho oferecido depois do primeiro login, com Better Auth no Worker e D1.
- Google e Apple ficam para depois, se pedirem.
- A conta sem email (pareamento) é a alternativa se a conversa priorizar privacidade e público menor de idade.

---

## 6. Backend no Cloudflare e custo

### 6.1 Peças e limites

| Peça | Grátis | Pago (Workers Paid, US$ 5/mês por conta) | Limites que importam |
|---|---|---|---|
| [Workers](https://developers.cloudflare.com/workers/platform/pricing/) | 100 mil pedidos/dia; 10 ms de CPU por pedido | 10 milhões de pedidos e 30 milhões de ms de CPU por mês; depois US$ 0,30 por milhão de pedidos | Arquivos estáticos são grátis e ilimitados; sem teto de gasto, então configurar alertas |
| [D1](https://developers.cloudflare.com/d1/platform/pricing/) | 5 milhões de linhas lidas e 100 mil escritas por dia; 5 GB | 25 bilhões de linhas lidas e 50 milhões escritas por mês; depois US$ 1 por milhão escritas e US$ 0,75/GB-mês | **10 GB por banco** e 50 mil bancos por conta; um banco processa uma consulta por vez; 100 parâmetros por consulta ([limites](https://developers.cloudflare.com/d1/platform/limits/)); cada índice soma uma linha escrita ([docs](https://developers.cloudflare.com/d1/best-practices/use-indexes/)); **não roda na América do Sul** ([local](https://developers.cloudflare.com/d1/configuration/data-location/)); restauração ao minuto por 30 dias ([Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)) |
| [Durable Objects (SQLite)](https://developers.cloudflare.com/durable-objects/platform/pricing/) | 100 mil pedidos/dia; 5 milhões de linhas lidas e 100 mil escritas por dia; 5 GB | 1 milhão de pedidos e 400 mil GB-s por mês; depois US$ 0,15 por milhão de pedidos; linhas como o D1; **US$ 0,20/GB-mês** | 10 GB por objeto e objetos ilimitados ([limites](https://developers.cloudflare.com/durable-objects/platform/limits/)); WebSocket hibernável não cobra o tempo parado; a dica `sam` nasce no leste dos EUA ([local](https://developers.cloudflare.com/durable-objects/reference/data-location/)); restauração ao minuto por 30 dias, **por objeto** ([PITR](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)) |
| [R2](https://developers.cloudflare.com/r2/pricing/) | 10 GB; 1 milhão de escritas e 10 milhões de leituras por mês | US$ 0,015/GB-mês; US$ 4,50 por milhão de escritas | Sem custo de saída |
| KV | 1.000 escritas/dia | US$ 5 por milhão de escritas | Consistência eventual: ruim para sync |

### 6.2 Arquiteturas

1. **Worker + D1 único.**
   - É o mais simples.
   - Dá SQL para olhar tudo, e cruzar contas (comunidade) é trivial.
   - Mas toda consulta precisa de `WHERE user_id`: um esquecimento vaza dados.
   - Bate no teto de 10 GB por volta de 10 mil contas pesadas, e daí exige dividir o banco por conta.
2. **Worker + um Durable Object (SQLite) por conta, mais D1 para contas e comunidade (recomendada).**
   - O isolamento por conta é natural: o objeto é a conta.
   - Escala sem dividir banco, e o armazenamento é quase 4 vezes mais barato.
   - Apagar a conta é apagar o objeto.
   - A restauração ao minuto por conta vira suporte de "histórico de versões".
   - O D1 fica pequeno: usuários, sessões de login, passkeys e o que for público.
   - Custo: duas peças para conhecer, e a migração de esquema roda dentro de cada objeto, na primeira vez que ele acorda.
3. **Worker + R2 com cópias (opção A da seção 4).** O mais barato e o mais simples no servidor, mas o merge fica todo no cliente e o tráfego é grande.
4. **Supabase ou outro hospedado (como a v1).** Postgres, autenticação e regras de acesso prontos. Fica fora do Cloudflare, o plano grátis pausa, e o Pro custa US$ 25/mês.

### 6.3 Custo estimado em 3 cenários

**Premissas** (ordens de grandeza, não medição):
- Conta média com 3.000 solves, a cerca de 300 bytes por solve com índices: uns 1 MB por conta. Uma conta pesada, com 20 mil solves, ocupa uns 6 MB.
- 30% das contas ativas no mês. Uma conta ativa grava uns 600 solves/mês, cerca de 3 linhas por solve, e com edições, treino e perfil chega a umas 2.000 linhas escritas por mês.
- 10% de contas novas por mês, cada uma subindo o histórico uma vez: umas 9.000 linhas.
- Uns 150 pedidos de sync por conta ativa por mês.
- 1 email por conta nova, mais 0,2 por conta ativa por mês.

| | 100 contas | 5.000 contas | 50.000 contas |
|---|---|---|---|
| Armazenamento | 0,1 GB | 5 GB | 50 GB |
| Linhas escritas por mês | 150 mil | 7,5 milhões | 75 milhões |
| Pedidos de sync por mês | 4,5 mil | 225 mil | 2,25 milhões |
| Emails por mês | ~16 | ~800 | ~8.000 |
| **D1 único** | US$ 0 no grátis*, ou US$ 5 | ~US$ 5 | ~US$ 65 (armazenamento US$ 34, escritas US$ 25), **e precisa de 5 ou mais bancos** |
| **DO por conta + D1 de contas** | US$ 0 no grátis*, ou US$ 5 | ~US$ 5 | ~US$ 40 (armazenamento US$ 9, escritas US$ 25, pedidos US$ 0,20) |
| **R2 com cópias** | US$ 0 a 5 | ~US$ 5 | ~US$ 15 (mais escritas no R2; o tráfego vai para o celular) |
| Email | Grátis (Resend) | Grátis (Resend ou Cloudflare) | US$ 2 (Cloudflare) ou US$ 20 (Resend Pro) |

\* **O grátis não é seguro nem com 100 contas.**
- 100 mil linhas escritas por dia acabam com uma única importação grande: 50 mil solves dão umas 150 mil linhas.
- Passando do limite, a operação falha.
- O limite de 10 ms de CPU por pedido aperta no merge de lotes.

Leitura:
- **Escritas na entrada de contas dominam a conta.** Guardar no servidor só o índice que o sync usa (versão) e subir em lotes corta isso pela metade.
- **50 mil contas é otimista.** O CubeDesk alega 40 mil cubers no total (pesquisa 1, linha 108).

---

## 7. Comunidade e Head-to-Head

### 7.1 O que existe

| Produto | Social e competição |
|---|---|
| csTimer | Ferramentas de "batalha" e "competição online" (pesquisa 1); a [wiki do r/Cubers](https://lr.in.psf.lt/r/Cubers/wiki/online_competitions) o lista entre as competições semanais |
| [CubeDesk](https://www.cubedesk.io/about) | 1v1, modo eliminação, leaderboards, perfis, amigos e vínculo com a conta WCA. Saiu do desktop para a web para ter multiplayer |
| Nexus Timer | Perfis públicos com comparação, multiplayer, salas privadas e chat (pesquisa 1) |
| acubemy, GAN CubeStation | Torneios; ranking e corridas (pesquisa 1) |
| [SpeedSolving](https://www.speedsolving.com/competition/) | Competição semanal no fórum, com regras WCA, ranking, recordes pessoais e sorteio de vale-presente |
| Twisty, Cubic, CubeTime | Nada social |
| Klick v1 | Links de compartilhamento, amigos e leaderboards (Supabase) |

**Head-to-Head na WCA** ([Regulamento, versão de 01/04/2026](https://www.worldcubeassociation.org/regulations/), Artigo I e 9b7):
- **Partida:** vence quem ganhar X sets (X de 1 a 3).
- **Set:** vence quem chegar a 3 pontos.
- **Ponto:** cada ponto é um solve de cada competidor com o mesmo embaralhamento. O mais rápido leva o ponto, e DNF ou DNS é sempre o pior.
- **Set longo:** depois de 7 pontos sem ninguém chegar a 3, vence quem tiver mais. No empate, decide o melhor single do set, depois o da partida.
- **Onde vale:** só nas finais de 3×3, 4×4, 3BLD e OH. Os singles contam para ranking; a média, não (9i4).
- Leitura: o formato é ótimo para um app porque é curto, cabe em 5 a 7 solves e não exige média.

### 7.2 Mínimo viável, do mais barato ao mais caro

1. **Desafio assíncrono por link.**
   - A pessoa A gera os embaralhamentos de uma semente, resolve e manda o link. B resolve os mesmos, e o placar sai no formato H2H.
   - Pode até funcionar sem servidor, com o resultado de A no próprio link, ou com um registro curto no D1.
   - A moderação é quase nula: só joga quem recebeu o link.
2. **Semanal do Klick.**
   - Embaralhamentos fixos da semana e ranking entre amigos.
   - Abrir para todos exige lidar com trapaça e com apelidos.
3. **Duelo ao vivo.**
   - Uma sala por partida num Durable Object com WebSocket hibernável.
   - Problemas: a partida a frio (precisa de dois online ao mesmo tempo, e com pouca gente a sala fica vazia), a reconexão, e o iPhone que derruba o WebSocket em segundo plano.
4. **Perfis públicos, amigos, feed e ranking global.** É o pacote do "meio lotado" do mercado (pesquisa 1, linha 47) e o de maior custo de moderação.

### 7.3 Riscos de moderação e abuso

- **Tempo não é verificável.**
  - Sem stackmat nem smart cube, qualquer ranking global aceita tempo falso.
  - Leitura: o ranking só faz sentido entre amigos, ou marcado como "não verificado".
- **Apelidos e qualquer texto livre público** pedem filtro, denúncia, bloqueio e alguém para revisar.
- **Público jovem.** Cubo tem muito menor de idade, o que puxa o ECA Digital (seção 8.5). Chat e contato entre desconhecidos são o ponto mais caro.
- **Spam e contas falsas.** Exige limite de pedidos por conta e por IP. O Workers tem limitador de taxa nativo (conferir o plano).
- **Percepção.** O r/Cubers está saturado de "timers sociais feitos por IA" (pesquisa 1, linha 13). A comunidade precisa de algo que só o Klick tem, como o Centro reagindo ao duelo.

**Recomendação:**
- Começar pelo desafio assíncrono por link, no formato H2H, entre amigos.
- Sem chat e sem texto livre público. O apelido é opcional e passa por filtro.
- Ranking global e duelo ao vivo só se houver gente pedindo.

---

## 8. Privacidade e LGPD: o mínimo

### 8.1 Aplica-se

A [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) não se aplica a quem trata dados "para fins exclusivamente particulares e não econômicos" (art. 4º, I). Um app aberto ao público que guarda email e dados de terceiros não cabe nessa exceção.

### 8.2 Controlador e porte

- **Quem é o controlador:** quem publica o app, pessoa física ou empresa. Isso decide o regime.
- **Regime de pequeno porte** ([Resolução CD/ANPD nº 2/2022](https://www.felsberg.com.br/no-dia-internacional-da-protecao-de-dados-anpd-publica-nova-resolucao-que-regulamenta-a-aplicacao-da-lgpd-para-agentes-de-tratamento-de-pequeno-porte/)):
  - vale para ME, EPP, MEI e startups;
  - dispensa o encarregado, mas exige um canal de contato com o titular;
  - simplifica o registro das operações;
  - conta os prazos em dobro.
- Não encontrei a regra clara para pessoa física com finalidade não comercial. Fica para a conversa, ou para um advogado.

### 8.3 Bases legais e dados

- **Bases legais (art. 7º):**
  - execução de contrato para conta e sync (inciso V);
  - legítimo interesse para logs de segurança, curtos;
  - consentimento para o que for público (apelido, ranking, perfil).
- **Dados mínimos:**
  - email, ou nada, na conta por pareamento;
  - solves, sessões, treino e progresso;
  - chave pública da passkey;
  - IP e navegador em logs, com retenção curta.
- **Notas livres:** as notas dos solves são texto livre e podem conter dado pessoal. Tratar como conteúdo da pessoa, nunca público.

### 8.4 Obrigações e transferência

- **Direitos (art. 18):** acesso, correção, exclusão e portabilidade. Resposta completa em até 15 dias (art. 19, II).
  - A exportação já existe e precisa incluir o que está no servidor.
  - Falta o **apagar conta**, que remove o objeto da conta, as linhas no D1, as cópias no R2 e a sessão. A conversa decide o que acontece com os dados locais dos aparelhos.
- **Política de privacidade (art. 9º):**
  - finalidade;
  - forma e duração do tratamento;
  - identidade e contato do controlador;
  - com quem compartilha (Cloudflare, provedor de email e, se houver, Google ou Apple);
  - direitos do titular.
  - A v1 tinha uma página de política e termos (commit `ce81d54` na `main`), que serve de ponto de partida.
- **Transferência internacional (art. 33):**
  - O D1 não roda na América do Sul, e um Durable Object pedido para `sam` nasce no leste dos EUA. Os dados ficam fora do Brasil.
  - A [Resolução CD/ANPD nº 19/2024](https://www.mattosfilho.com.br/unico/clausulas-padrao-anpd/) exige as cláusulas-padrão da ANPD nos contratos, com prazo de adequação encerrado em 23/08/2025.
  - Não encontrei, nas buscas, se o acordo de tratamento de dados da Cloudflare (e do provedor de email) traz essas cláusulas. **Conferir antes de abrir contas.**
- **Segurança e incidentes:**
  - medidas de segurança (art. 46);
  - comunicação à ANPD e aos titulares em 3 dias úteis, 6 para pequeno porte ([Resolução nº 15/2024](https://www.mattosfilho.com.br/unico/regulamento-incidente-seguranca/));
  - registro de incidentes guardado por 5 anos.

### 8.5 Crianças e adolescentes

- **LGPD, art. 14:** dados de menor de 12 anos exigem consentimento específico de um dos pais.
- **O ECA Digital** ([Lei 15.211/2025](https://www.demarest.com.br/eca-digital-entrada-em-vigor-em-17-de-marco-de-2026/), em vigor desde 17/03/2026) vale para serviços "direcionados a" menores ou "de acesso provável" por eles. Ele pede ([Canaltech](https://canaltech.com.br/internet/pontos-para-entender-o-eca-digital-que-entra-em-vigor-nesta-terca-17/)):
  - proteção máxima por padrão;
  - ferramentas de supervisão parental;
  - nada de perfilamento para publicidade;
  - verificação de idade confiável (comentários jurídicos dizem que a autodeclaração não basta).
- **Fiscalização:** cabe à ANPD, com multas de até R$ 50 milhões por infração. A abordagem inicial anunciada é "responsiva", focada em adaptação.
- **Leitura:**
  - O sync privado, sem interação entre pessoas, tem risco baixo.
  - A comunidade aberta puxa o ECA Digital inteiro.
  - **Ouvir um advogado antes da parte de comunidade.**

### 8.6 Retenção

Definir quanto tempo uma conta inativa fica guardada e o que acontece depois.

---

## 9. Riscos e armadilhas

| Risco | Como acontece | Como evitar |
|---|---|---|
| **Perder dados num merge** | Uma regra de junção apaga ou sobrescreve; aconteceu no Nexus (pesquisa 1, linha 123) | Nunca remover de verdade no merge; cópia local `'pre-sync'` antes de sync grande; testes de propriedade (comutativo, idempotente, "nenhum solve ativo some"); relatório do que mudou |
| **Ressurreição** | O purge local ou a exclusão do treino não deixam marca, e o aparelho atrasado devolve o registro (seção 3.2, item 5) | O servidor guarda as marcas para sempre; o purge local só depois de o servidor confirmar a exclusão |
| **Relógio errado** | `updatedAt` vem do aparelho; um iPhone com data manual vence tudo | Relógio híbrido, ou o servidor recusa carimbo no futuro (mais de alguns minutos) e reescreve; desempate pelo aparelho |
| **iOS apagando o armazenamento** | Safari sem uso, falta de espaço; o que não subiu se perde | Sync logo depois de gravar; "último sync há X" visível; o guia de instalação continua |
| **Safari e PWA no mesmo iPhone** | Dois bancos separados; a pessoa acha que perdeu tudo ao instalar | O sync junta os dois; explicar na tela de login |
| **Migração do banco local** | `DB_VERSION` 3 (fila de pendentes ou índice); sem volta para a 2 | Migração com testes, como na versão 2; deploy só para a frente |
| **Várias abas** | Duas abas empurram o mesmo lote | Web Locks: um sincronizador por origem |
| **Aparelho compartilhado ou troca de conta** | Entrar com outra conta junta os dados das duas | `accountId` no `meta`, ou um banco por conta; ao entrar com outra conta, perguntar |
| **Primeiro login num aparelho com dados** | Os solves de outra pessoa (família) vão para a conta; "Sessão 1" duplicada | Mostrar "vou juntar N solves a esta conta"; não criar sessão padrão antes do primeiro sync |
| **Importar o mesmo csTimer em dois aparelhos** | Ids novos a cada importação (seção 3.2, item 10) | Deduplicar também no merge por (evento, ms, segundo do `at`, embaralhamento), ou só na importação depois de sincronizar |
| **Temporada divergente** | Viradas independentes, com empate que fica o local (seção 3.2, item 8) | Regra determinística; talvez a virada só valha depois de confirmada pelo servidor |
| **Restaurar cópia com sync ligado** | O `replaceAll` limpa as stores sem deixar marca | Restaurar vira escrita com carimbos novos |
| **App antigo em cache falando com servidor novo** | O service worker mantém uma versão velha | Versão de protocolo em todo pedido; o servidor recusa as antigas com "atualize"; campos desconhecidos preservados |
| **Subida inicial grande no iPhone** | 20 mil solves de uma vez, com a aba indo para segundo plano | Lotes pequenos e retomáveis pelo cursor; progresso visível |
| **Custo sem teto** | O Workers Paid não tem limite de gasto | Alertas de faturamento; limite de pedidos por conta |
| **Beta mexendo em dado real** | O `beta.` e a raiz usando o mesmo backend | Backends separados por ambiente, ou o beta só leitura |
| **Email no spam** | O código não chega e a pessoa desiste | Domínio próprio com SPF, DKIM e DMARC; o passkey como segundo caminho |

---

## 10. Perguntas para a conversa de design

Uma de cada vez, na ordem. A recomendada vem marcada.

**P1. Escopo: dividir o sub-projeto 5?**
- A) Um só: conta, sync e comunidade juntos.
- **B) Dois: 5a conta e sync (com lixeira e histórico de versões); 5b comunidade e Head-to-Head. (recomendada)**
- C) Três: 5a cofre na nuvem (cópia inteira), 5b sync entre aparelhos, 5c comunidade.
- Por quê: 5a ataca a dor nº 1 e não depende de moderação nem do ECA Digital. A 5b precisa de outra conversa, jurídica inclusive.

**P2. A conta é opcional?**
- **A) Sim: o app funciona 100% sem conta, e a conta só acrescenta sync. (recomendada; já é o princípio da pesquisa 1)**
- B) A conta é pedida no primeiro uso, e dá para pular.
- C) Obrigatória para o histórico.

**P3. Como entrar?**
- **A) Código por email, mais passkey oferecido depois. (recomendada)**
- B) Só passkey, com email de recuperação.
- C) Google e Apple, mais código por email.
- D) Sem email: conta anônima, e o segundo aparelho entra por código ou QR.

**P4. Modelo de sync?**
- A) Cofre: cópia inteira por conta, juntada pelo `importAll`.
- **B) "Último vence" por registro, com marcas de exclusão e cursor do servidor. (recomendada)**
- C) Log de operações (event sourcing).
- D) Motor pronto (PowerSync, InstantDB, Dexie Cloud…).

**P5. Onde guardar?**
- A) Worker + D1 único.
- **B) Worker + um Durable Object por conta + D1 para contas e comunidade. (recomendada)**
- C) Worker + R2 com cópias.
- D) Supabase, como na v1.

**P6. O que do perfil é da conta e o que é do aparelho?**
- **A) Da conta: trilha, temporadas, treino (`lessonAt`, `algChoice`, `trainOff`), acabamento e tour feito. Do aparelho: armar no celular, tempo para armar, sons, sessão atual. Tema, Centro e meta diária a decidir. (recomendada)**
- B) Tudo é da conta.
- C) Só solves, sessões e treino sincronizam; o perfil fica no aparelho.

**P7. Conflito: exclusão contra edição concorrente?**
- **A) A exclusão vence: um solve apagado num aparelho não volta porque o outro mudou a nota. (recomendada; muda a ressurreição de sessão descrita no item 4 da seção 3.2)**
- B) Vence o carimbo mais novo, seja qual for.
- C) A edição vence e restaura.

**P8. Conflito na trilha: desmarcar se propaga?**
- **A) Sim: a trilha passa a ser "último vence" por etapa, com carimbo. (recomendada)**
- B) Não: marcar sempre vence (a soma de hoje).

**P9. Temporadas divergentes?**
- **A) Vence a virada de `endedAt` mais antigo; o aparelho perdedor adota a da conta. (recomendada)**
- B) O servidor calcula e decide as viradas.
- C) Vence a temporada com mais fechadas, e no empate a do servidor.

**P10. O que é "histórico de versões"?**
- **A) Uma cópia diária da conta no servidor (R2 ou no próprio objeto), por 30 dias, restaurável como escrita nova que se propaga. (recomendada)**
- B) Só a restauração ao minuto do Durable Object, usada como ferramenta de suporte.
- C) Só as 10 cópias locais de hoje.

**P11. Lixeira com sync?**
- **A) Os 30 dias continuam. O servidor guarda as marcas de exclusão para sempre (só id e datas), e o purge local acontece só depois da confirmação. (recomendada)**
- B) O servidor também apaga depois de 30 dias, e o aparelho que ficar mais tempo offline faz sync completo.

**P12. Primeiro login num aparelho que já tem dados?**
- **A) Junta sempre, com aviso de quantos solves entram e cópia `'pre-sync'` antes. (recomendada)**
- B) Pergunta: juntar à conta ou trocar pelos da conta.
- C) Só junta se o aparelho estiver vazio.

**P13. Sair da conta?**
- **A) Os dados ficam no aparelho, com a opção "apagar deste aparelho". (recomendada)**
- B) Sair apaga os dados locais.

**P14. Comunidade: por onde começar (5b)?**
- **A) Desafio Head-to-Head assíncrono por link, entre amigos. (recomendada)**
- B) Semanal do Klick com ranking.
- C) Duelo ao vivo em sala.
- D) Perfis públicos, amigos e ranking global.

**P15. Menores de idade e comunidade?**
- **A) Tudo privado por padrão: sem chat, sem texto livre público, apelido opcional e filtrado; ouvir advogado sobre o ECA Digital antes da 5b. (recomendada)**
- B) Comunidade só para maiores de 18, com verificação.
- C) Sem comunidade por enquanto.

**P16. Controlador para a LGPD?**
- A) Pessoa física.
- B) Uma empresa (cabe no regime de pequeno porte, mais claro).
- Sem recomendação: depende da situação dele. Leitura: B simplifica, e o contrato com a Cloudflare sai no nome certo.

**P17. Plano do Cloudflare?**
- **A) Workers Paid (US$ 5/mês) desde o início, com alertas de gasto. (recomendada: o grátis falha com uma importação grande e limita a CPU a 10 ms)**
- B) Começar no grátis e subir depois.

**P18. Os dados da v1 no Supabase?**
- A) Ignorar (a migração por `localStorage` já existe).
- **B) Um script único para trazer os dados do próprio Ranielli, sem tela no app. (recomendada, se houver algo lá que não esteja no aparelho)**
- C) Uma tela de importação "entrar com a conta da v1".

---

## 11. Fontes

**Código e specs do Klick** (branch `v2`, lidas em 15/10/2026)
- `app/src/core/types.ts`, `app/src/data/db.ts`, `app/src/data/ids.ts`, `app/src/data/repository.ts`, `app/src/data/transfer.ts`, `app/src/data/safety.ts`, `app/src/core/season.ts` e `app/src/ui/state/app.svelte.ts`.
- `docs/superpowers/specs/2026-10-08-klick-design.md`, `2026-10-09-klick-nucleo-design.md`, `2026-10-13-klick-companion-design.md` e `2026-10-14-klick-trilha-design.md`.
- `docs/research/2026-10-07-cenario-de-timers.md`.
- Branch `main` (v1): `docs/supabase-migrations.md`, `supabase/migrations/*` e `src/shared/store/auth-store.ts`.

**Cloudflare**
- Preços do Workers e do KV: https://developers.cloudflare.com/workers/platform/pricing/
- Preços do D1: https://developers.cloudflare.com/d1/platform/pricing/ (atualizado em 21/04/2026)
- Limites do D1: https://developers.cloudflare.com/d1/platform/limits/
- Índices do D1: https://developers.cloudflare.com/d1/best-practices/use-indexes/
- Local dos dados no D1: https://developers.cloudflare.com/d1/configuration/data-location/
- Time Travel do D1: https://developers.cloudflare.com/d1/reference/time-travel/
- Preços dos Durable Objects: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Limites dos Durable Objects: https://developers.cloudflare.com/durable-objects/platform/limits/
- Local dos dados nos Durable Objects: https://developers.cloudflare.com/durable-objects/reference/data-location/
- Armazenamento SQLite e PITR dos Durable Objects: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Preços do R2: https://developers.cloudflare.com/r2/pricing/
- Preços do Email Service: https://developers.cloudflare.com/email-service/platform/pricing/
- Arquivos estáticos e `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/binding/

**Sync**
- Local-first software (Kleppmann e outros, 2019): https://www.inkandswitch.com/essay/local-first/
- Relógio híbrido (Kulkarni e outros, 2014): https://cse.buffalo.edu/tech-reports/2014-04.pdf
- Replicache: https://replicache.dev/
- Zero, offline: https://zero.rocicorp.dev/docs/offline
- Zero, self-host: https://zero.rocicorp.dev/docs/self-host
- PowerSync: https://powersync.com/pricing
- ElectricSQL: https://electric-sql.com/blog/2026/04/02/electric-cloud-pricing
- Triplit no Supabase: https://supabase.com/blog/triplit-joins-supabase
- LiveStore `sync-cf`: https://cdn.jsdelivr.net/npm/@livestore/sync-cf@0.4.0/README.md
- RxDB: https://rxdb.info/rx-server.html
- Dexie Cloud: https://dexie.org/pricing
- InstantDB (agregador): https://toolradar.com/tools/instantdb/pricing
- Automerge 3: https://automerge.org/blog/automerge-3/
- Yjs offline: https://docs.yjs.dev/getting-started/allowing-offline-editing
- Web Locks: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API

**Conta e iPhone**
- Better Auth:
  - 1.5 e D1: https://better-auth.com/blog/1-5
  - código por email: https://better-auth.com/docs/plugins/email-otp
  - passkey: https://www.better-auth.com/docs/plugins/passkey
  - anônimo: https://better-auth.com/docs/plugins/anonymous
  - Auth.js: https://www.better-auth.com/blog/authjs-joins-better-auth
  - Vercel: https://better-auth.com/blog/better-auth-joins-vercel
- Lucia: https://www.npmjs.com/package/lucia-auth
- Clerk: https://clerk.com/pricing
- Supabase (guia de preços de 2026): https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/
- Resend: https://resend.com/pricing
- Sign in with Apple: https://techdocs.akamai.com/identity-cloud/docs/the-sign-in-with-apple-social-login-configuration-guide
- WebKit, cookies e 7 dias (mar/2020): https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- WebKit, política de armazenamento (ago/2023): https://webkit.org/blog/14403/updates-to-storage-policy/
- Netguru, Safari e PWA: https://www.netguru.com/blog/how-to-share-session-cookie-or-state-between-pwa-in-standalone-mode-and-safari-on-ios
- Progressier, cookies no PWA: https://progressier.com/pwa-capabilities/cookies-demo
- OAuth no PWA do iOS, fórum da Apple: https://developer.apple.com/forums/thread/649699
- OAuth no PWA do iOS, Auth0: https://community.auth0.com/t/login-to-pwa-on-ios-using-social-identity-provider/18109
- Códigos do Mail no iOS 17: https://www.macworld.com/article/1944553/ios-17-beta-feature-clean-up-verification-codes-automatically.html

**Comunidade**
- Regulamento WCA (01/04/2026), Artigo I e 9b7: https://www.worldcubeassociation.org/regulations/
- CubeDesk: https://www.cubedesk.io/about
- Competição semanal do SpeedSolving: https://www.speedsolving.com/competition/
- Competições online do r/Cubers: https://lr.in.psf.lt/r/Cubers/wiki/online_competitions

**LGPD e ECA Digital**
- LGPD: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Resolução CD/ANPD nº 2/2022 (Felsberg): https://www.felsberg.com.br/no-dia-internacional-da-protecao-de-dados-anpd-publica-nova-resolucao-que-regulamenta-a-aplicacao-da-lgpd-para-agentes-de-tratamento-de-pequeno-porte/
- Resolução nº 15/2024, incidentes (Mattos Filho): https://www.mattosfilho.com.br/unico/regulamento-incidente-seguranca/
- Resolução nº 19/2024, cláusulas-padrão (Mattos Filho): https://www.mattosfilho.com.br/unico/clausulas-padrao-anpd/
- ECA Digital (Demarest): https://www.demarest.com.br/eca-digital-entrada-em-vigor-em-17-de-marco-de-2026/
- ECA Digital (Canaltech): https://canaltech.com.br/internet/pontos-para-entender-o-eca-digital-que-entra-em-vigor-nesta-terca-17/
