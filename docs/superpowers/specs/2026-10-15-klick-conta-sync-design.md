# Klick — Conta e sync

**Sub-projeto 5a: conta opcional, sync entre aparelhos, lixeira e histórico de versões**

| | |
|---|---|
| Data | 2026-10-15 |
| Status | Design aprovado em conversa (seções 1 a 6). Esta spec aguarda revisão. |
| Branch | `v2`, app em `app/` |
| Referências | Spec do sub-projeto 1 (`2026-10-08-klick-design.md`, seção do sub-projeto 5), spec do núcleo (`2026-10-09-klick-nucleo-design.md`, D3 e modelo de dados), spec do Companion (`2026-10-13-klick-companion-design.md`, temporadas), spec da Trilha (`2026-10-14-klick-trilha-design.md`, perfil e treino) e a pesquisa 4 (`docs/research/2026-10-15-sync-conta-comunidade.md`) |

---

## 1. Contexto

A spec do sub-projeto 1 reservou para o sub-projeto 5 "conta e sync com histórico de versões e lixeira" e "comunidade e o formato Head-to-Head". A pesquisa 1 apontou a perda do histórico como a dor nº 1 de quem usa timer.

A pesquisa 4 achou duas coisas que mudam o plano:
- **O banco local só está pronto para os solves.** A spec do núcleo prometia juntar vários aparelhos "sem migrar o esquema", mas isso só vale para eles. Sessões, treino, perfil, temporadas e trilha têm lacunas concretas (seção 3.2 da pesquisa).
- **A comunidade é outro problema.** Ela traz moderação e o ECA Digital, já que muitos cubers são menores. A conta e o sync são engenharia pura.

Por isso o sub-projeto 5 foi dividido em dois:
- **5a (esta spec):** conta e sync.
- **5b:** comunidade e Head-to-Head, com conversa própria, inclusive jurídica.

| # | Sub-projeto | Situação |
|---|---|---|
| 1 | Linguagem visual, telas e Centro | Validado em 09/10 |
| 2 | Núcleo do timer | Na raiz desde 10/10 |
| 3 | Companion | Na raiz desde 13/10 |
| 4 | Trilha de aprendizado | Na raiz desde 15/10 |
| 5a | **Conta e sync** | **Esta spec** |
| 5b | Comunidade e Head-to-Head | Depois |

## 2. Entendimento

- **Objetivo:** um solve feito no iPhone aparece no computador, e trocar ou perder o aparelho não perde nada.
- **Quem usa:**
  - o Ranielli, no iPhone (pelo Safari e pelo app instalado) e no Chrome do desktop;
  - quem chega novo, que pode nunca criar conta.
- **Sucesso:** semanas usando dois aparelhos, sem perder nem duplicar nada e sem resolver conflito na mão.
- **Restrições:**
  - o app continua local-first e funcionando sem rede;
  - tudo fica no Cloudflare;
  - o repositório é público, então nenhum segredo vai nele.

## 3. Decisões

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Escopo | Dividir: 5a conta e sync; 5b comunidade |
| D2 | A conta é obrigatória? | Não. O app funciona 100% sem conta, e a conta só acrescenta sync e cópia na nuvem |
| D3 | Como entrar | Código de 6 dígitos por e-mail, mais passkey oferecida depois. Sem senha e sem redirecionamento |
| D4 | O que segue a conta | O progresso fica na conta; a sensação de uso fica no aparelho (lista na seção 5.2) |
| D5 | Exclusão contra edição | A exclusão vence. Só uma restauração explícita traz o registro de volta |
| D6 | Histórico de versões | Uma cópia diária da conta na nuvem, por 30 dias, restaurável pelo app. A restauração chega a todos os aparelhos |
| D7 | Primeiro login num aparelho com dados | Junta sempre, sem duplicar, com aviso da contagem e cópia local antes |
| D8 | Sair da conta | Os dados ficam no aparelho, com a opção de apagá-los |
| D9 | Controlador para a LGPD | A empresa (CNPJ) do Ranielli |
| D10 | Dados da v1 no Supabase | Checar se há solves do Ranielli que faltam; se houver, um script único os traz. Sem tela no app |
| D11 | Arquitetura | Sync próprio no Cloudflare: "o mais recente vence" por registro, com marcas de exclusão e cursor de revisão. Um Durable Object com SQLite por conta, D1 para as contas e R2 para as cópias |
| D12 | Plano do Cloudflare | Workers Paid (US$ 5 por mês) desde o início, com alerta de gasto |
| D13 | E-mail | Resend no plano grátis, a partir de `nao-responda@klick.ranimontagna.com`, com SPF, DKIM e DMARC no DNS da Cloudflare |

## 4. Princípios

1. **Sem conta, nada muda.** Quem nunca entra usa o mesmo app de hoje, com o mesmo banco e os mesmos lembretes.
2. **O aparelho é a fonte do que a pessoa vê.** O sync roda por trás e nunca bloqueia o timer. Um solve gravado localmente nunca espera a rede.
3. **Nada some sem rastro.** Toda exclusão vira uma marca com data, e não uma remoção. Antes de qualquer operação que apague muito, o app faz uma cópia local.
4. **Convergir sempre.** Dois aparelhos que viram as mesmas mudanças terminam iguais, seja qual for a ordem em que as receberam. Por isso as regras de conflito são funções puras, testadas por simulação.
5. **Uma regra para tudo.** Solves, sessões, treino e ajustes da conta viajam no mesmo envelope e seguem as mesmas regras. A única exceção é a temporada (seção 6.4).

## 5. Banco local, versão 3

### 5.1 Stores

| Store | Muda na v3 |
|---|---|
| `solves` | Ganha `deletionStamp` |
| `sessions` | Ganha `deletionStamp`. O import passa a seguir "o mais recente vence", como os solves |
| `practice` | Ganha `updatedAt`, `deletedAt` e `deletionStamp`. Apagar uma tentativa vira marca, e corrigir o acerto atualiza `updatedAt` |
| `prefs` (nova) | Os ajustes da conta, um item por chave (seção 5.2) |
| `outbox` (nova) | A fila de saída do sync (seção 5.3) |
| `profile` | Fica só com os ajustes do aparelho |
| `meta` | Ganha o bloco `sync` (seção 5.4) |
| `backups` | Sem mudança, mas aceita o motivo novo `'pre-sync'` |

`deletionStamp` é a data da última mudança no estado de exclusão: apagar ou restaurar. Editar o conteúdo muda só `updatedAt` e nunca mexe em `deletionStamp`. Isso dá a regra D5.

### 5.2 Ajustes da conta e do aparelho

**Na conta** (store `prefs`): cada item tem `{ key, value, updatedAt }`.

| Chave | Valor |
|---|---|
| `trail.0` a `trail.8` | `boolean`: a etapa está feita |
| `lessonAt.<etapa>` | `number`, ou `null` quando a aula foi concluída e o passo some |
| `algChoice.<caseId>` | `number`: índice do algoritmo escolhido |
| `trainOff.<caseId>` | `boolean`: o caso está fora do sorteio |
| `finish` | o acabamento do Centro |
| `onboarded` | `boolean`: o tour foi feito |
| `settings.inspection` | `boolean` |
| `settings.dailyGoal` | `number` |
| `season` | `SeasonProgress`, com regra própria (seção 6.4) |

**No aparelho** (store `profile`), nunca sobem:
- tema;
- sons (klick, tique e acorde);
- armar no celular;
- tempo para armar;
- reduzir movimento;
- modo do Centro;
- modo silencioso;
- imagem do embaralhamento;
- sessão atual.

`meta.trailPromptDismissed` e `meta.installGuideDismissed` também continuam do aparelho.

O app lê o perfil como hoje: `AppState` monta o mesmo objeto `Profile` a partir das duas stores. As telas não percebem a divisão.

### 5.3 Fila de saída

Toda gravação local num registro sincronizável (solve, sessão, tentativa ou item da conta) grava também `outbox[<store>/<id>] = { store, id, queuedAt }`, na mesma transação.
- O sync lê o registro atual na hora de mandar, então várias edições do mesmo registro viram uma só.
- A entrada só sai da fila quando o servidor confirma.
- Sem conta, a fila não é preenchida. No primeiro login, tudo o que existe entra nela (seção 6.5).

### 5.4 Relógio e estado do sync

`meta.sync = { accountId, cursor, lastSyncAt, clock }`.
- **`clock`:** a última data vista. Toda data nova (`updatedAt` e `deletionStamp`) é `max(Date.now(), clock + 1)`. A cada resposta do servidor, `clock` sobe para a hora do servidor e para as datas recebidas. Um aparelho com o relógio atrasado nunca grava uma data menor que a dos dados que já viu.
- **`accountId`:** a conta dona dos dados do aparelho. Continua gravado depois de sair, para a seção 7.6.
- **`cursor`:** a última revisão do servidor já aplicada.

### 5.5 Correções que a pesquisa achou

- **Import do csTimer:** o id passa a ser derivado do solve: `cs-` mais um hash de evento, `at`, `ms` e embaralhamento. O mesmo arquivo importado em dois aparelhos gera os mesmos ids. Imports antigos ficam com os ids que têm; a deduplicação do primeiro login (seção 6.5) cobre esse caso.
- **"Sessão 1" de um aparelho novo:** a sessão padrão criada sem dados passa a ter id fixo por evento, `default-<evento>`. Dois aparelhos novos geram a mesma sessão, e o sync as junta.
- **Restaurar uma cópia:** deixa de apagar as stores e regravar.
  - Cada registro da cópia é gravado de novo, com datas novas.
  - O que existe agora e não está na cópia ganha marca de exclusão.
  - Tudo entra na fila de saída.
  - Sem conta, o resultado na tela é o mesmo de hoje.
- **Lixeira:** continua com 30 dias. Um registro só é removido de vez do aparelho depois disso e só se não estiver na fila de saída, ou seja, se o servidor já tem a marca.

### 5.6 Migração

`DB_VERSION` passa a 3. Antes de abrir a v3, o app grava uma cópia com motivo `'pre-sync'`, rotulada "antes da v3". A migração só acrescenta, e nenhum dado sai do aparelho:
1. **Solves e sessões:** `deletionStamp = deletedAt ?? createdAt`.
2. **Treino:** `updatedAt = at`, `deletedAt = null` e `deletionStamp = at`.
3. **Perfil:** os campos da conta viram itens de `prefs`, com `updatedAt` igual à hora da migração. O perfil fica só com os campos do aparelho.
4. **Stores novas:** `prefs` e `outbox` são criadas, e `meta.sync` começa vazio.

Como a v2, a v3 não tem volta: uma versão anterior do app não abre o banco de quem já migrou. Isso fica registrado no plano de entrega.

## 6. Protocolo de sync

### 6.1 Envelope e rota

Todo registro viaja como uma mudança:

```ts
interface Change {
  store: 'solves' | 'sessions' | 'practice' | 'prefs';
  id: string;            // em prefs, a chave
  data: unknown;         // o registro sem as datas; em prefs, o valor
  updatedAt: number;
  deletedAt: number | null;
  deletionStamp: number; // em prefs, sempre igual a updatedAt e deletedAt null
}
```

`POST /api/sync`:
- **Pedido:** `{ deviceId, cursor, clock, changes: Change[] }`, com até 500 mudanças por pedido.
- **Resposta:** `{ accepted, changes: Change[], cursor, more, serverTime }`. `changes` traz até 500 mudanças com revisão maior que o cursor, e `more` diz se há mais.

O servidor faz, nesta ordem:
1. Valida cada mudança: forma, tamanho e store conhecida. Uma mudança inválida volta com o motivo e não derruba o lote.
2. Aplica cada uma com as regras da seção 6.3.
3. Dá a cada registro que mudou de fato a próxima revisão da conta.

O app repete o pedido enquanto houver fila ou `more`, e cada lote avança o cursor. Um primeiro sync com 50 mil solves vai em lotes, com progresso na tela, e continua de onde parou se cair no meio.

### 6.2 Quando sincroniza

- **Momentos:**
  - ao abrir o app;
  - ao voltar a ficar online ou visível;
  - 5 segundos depois da última gravação;
  - a cada 5 minutos com o app aberto;
  - em "Sincronizar agora".
- **Nunca durante um solve ou uma inspeção:** com `app.timerBusy`, o sync espera o timer parar.
- **Uma aba só:** sincroniza a aba que pegar o lock `klick-sync` da Web Locks API. As outras recebem as mudanças pelo `BroadcastChannel` que já existe entre as abas e recarregam o estado como fazem hoje.

### 6.3 Regras de conflito

Ficam em `app/src/core/sync/merge.ts`, como funções puras sem dependência de navegador. O app e o Worker importam o mesmo arquivo. `merge(local, remoto)` devolve o registro resultante. Nas regras 1 a 4, ela é comutativa, associativa e idempotente, e os testes provam isso (seção 11). A temporada é a exceção e é decidida pelo servidor (seção 6.4).

1. **Conteúdo** (`data` e `updatedAt`): vence o lado com `updatedAt` maior. No empate, vence o `data` com o JSON canônico maior. Esse critério é arbitrário, mas é o mesmo nos dois lados, e por isso converge.
2. **Exclusão** (`deletedAt` e `deletionStamp`): vence o lado com `deletionStamp` maior, independentemente do conteúdo, com o mesmo desempate. Como editar não muda `deletionStamp`, uma edição concorrente nunca desfaz uma exclusão (D5). Restaurar da lixeira grava `deletedAt = null` com um `deletionStamp` novo, e por isso vence a exclusão anterior.
3. **Sessão apagada:** apagar uma sessão marca os solves dela com o mesmo `deletedAt` e `deletionStamp`.
   - **Depois de juntar um lote,** os dois lados aplicam a cascata (`applyCascade`): um solve ativo cuja sessão está apagada, com `deletionStamp` da sessão maior que o do solve, recebe a exclusão da sessão. Assim, uma edição feita offline num solve dessa sessão não a ressuscita.
   - **Restaurar um solve da lixeira** continua restaurando a sessão dele, como hoje, porque é uma ação explícita e grava datas novas nos dois.
4. **Itens da conta:** cada chave segue a regra 1. Desmarcar uma etapa da trilha num aparelho desmarca nos outros.

### 6.4 Temporadas

Quem decide a chave `season` é o servidor, com `mergeSeason(armazenado, recebido)`:
1. Temporadas fechadas nunca voltam: vence o lado com mais temporadas fechadas (`past.length`).
2. Com o mesmo número de fechadas e pelo menos uma, vence o lado cuja última virada (`past[last].endedAt`) aconteceu primeiro.
3. Sem nenhuma fechada, ou num empate exato, fica o armazenado: a primeira que chegou.

O aparelho não junta a temporada por conta própria. Ele adota o valor que o servidor devolve. As marcas da temporada atual continuam calculadas a partir dos solves, que já chegaram pelo sync. A virada só é anunciada (mensagem do Centro e piscada da face de cima) no aparelho que a causou; os outros apenas passam a mostrar a nova temporada.

### 6.5 Primeiro login num aparelho com dados

1. O app grava uma cópia `'pre-sync'` e conta o que vai subir. O aviso diz: "1.234 solves deste aparelho vão para a conta".
2. O app baixa a conta inteira antes de subir qualquer coisa, para poder deduplicar.
3. **Deduplicação:**
   - um solve local ativo com id diferente, mas mesmo evento, `at`, `ms`, penalidade e embaralhamento de um solve da conta é o mesmo solve: o local recebe marca de exclusão e não sobe;
   - uma sessão local vazia com o nome padrão, de um evento que já tem sessão na conta, também.
4. Tudo o que sobrou entra na fila de saída e sobe.

### 6.6 Proteção e falhas

- **Muitas exclusões de uma vez:** se um lote do servidor vai apagar 50 solves ou mais, o app grava antes uma cópia local `'pre-sync'`.
- **Sem rede:** a fila espera, e o indicador mostra "esperando rede".
- **Erro do servidor (5xx):** nova tentativa em 5 s, 30 s, 2 min e depois a cada 5 min.
- **Sessão expirada (401):** o indicador mostra erro, e Ajustes pede para entrar de novo. O app segue funcionando local, e a fila guarda tudo.
- **Mudança rejeitada por forma inválida:** sai da fila e fica no log local. Um registro que o próprio app gerou nunca deveria cair aqui; os testes de forma garantem.

## 7. Conta e login

### 7.1 Biblioteca

[Better Auth](https://better-auth.com), rodando no Worker, com as tabelas no D1. Usa dois plugins:
- **código por e-mail:** `emailOTP`, com 6 dígitos, validade de 10 minutos e 5 tentativas;
- **passkey:** baseado em SimpleWebAuthn.

### 7.2 Fluxo

Entrar e criar conta são o mesmo fluxo, sem senha:
1. Em Ajustes, "Conta e sync" e depois "Entrar ou criar conta".
2. A pessoa digita o e-mail. A tela do e-mail tem o Turnstile invisível.
3. Ela recebe o código e o digita no próprio app. O campo aceita colar e `autocomplete="one-time-code"`, então o iOS sugere o código do Mail.
4. O app oferece "Entrar com Face ID da próxima vez". Dá para pular e criar a passkey depois em Ajustes.
5. Vem o primeiro sync (seção 6.5), com progresso.

Num aparelho que já tem uma passkey, a tela de entrar oferece a passkey primeiro, com o código como alternativa.

### 7.3 Sessão

- Cookie definido pelo servidor, na mesma origem, `HttpOnly`, `Secure` e `SameSite=Lax`.
- Dura 90 dias e se renova com o uso.
- As rotas de escrita exigem `Content-Type: application/json` e a checagem de origem do Better Auth.
- Se o iPhone apagar o cookie, basta entrar de novo. Os dados locais nunca dependem da sessão.

### 7.4 E-mail

- **Envio:** pelo Resend (D13). O e-mail tem só o código, a validade e uma linha "se não foi você, ignore", em texto simples com versão HTML mínima.
- **DNS:** SPF, DKIM e DMARC configurados no DNS de `ranimontagna.com` na Cloudflare.

### 7.5 Abuso

- **Limites:**
  - 5 códigos por e-mail por hora;
  - 20 pedidos de código por IP por hora.

  Usam o binding de rate limiting do Workers.
- **Turnstile:** só na tela do e-mail.
- **Erros:** não dizem se o e-mail tem conta ou não.

### 7.6 Outra conta no mesmo aparelho

Se o aparelho tem dados de uma conta (`meta.sync.accountId`) e a pessoa entra com outra, o app mostra um diálogo com três saídas:
- juntar os dados deste aparelho à nova conta;
- apagar os dados deste aparelho antes de entrar;
- cancelar.

### 7.7 Sair e apagar a conta

- **Sair:**
  - os dados ficam no aparelho, que volta a funcionar só local;
  - a tela tem a caixa "apagar os dados deste aparelho";
  - a fila de saída que ainda não subiu fica no aparelho e sobe se a mesma conta entrar de novo.
- **Sair de todos os aparelhos:** revoga todas as sessões no D1.
- **Apagar minha conta:** tem confirmação, digitando o e-mail. Apaga na hora:
  - o Durable Object da conta (`deleteAll`);
  - as cópias no R2;
  - as linhas no D1.

  Os dados do aparelho ficam, como ao sair.

## 8. Servidor

### 8.1 Worker

O Worker de hoje só serve arquivos estáticos. Ele passa a ter um script próprio em `app/worker/index.ts`:
- **`/api/auth/*`:** o handler do Better Auth.
- **`/api/sync`, `/api/snapshots`, `/api/snapshots/:day/restore` e `/api/account`:** validam a sessão, pegam o `userId` e encaminham ao Durable Object da conta (`idFromName(userId)`).
- **`/api/health`:** sem sessão.
- **O resto:** os arquivos do app, como hoje (`env.ASSETS`). A página `/privacidade` também vem daqui.

O `wrangler.jsonc` mantém os dois ambientes (beta e produção), cada um com os próprios D1, namespace do Durable Object e bucket R2. Nada do beta toca os dados da raiz.

### 8.2 Durable Object da conta

Classe `AccountStore`, com armazenamento SQLite.

```sql
CREATE TABLE records (
  store TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
  updated_at INTEGER NOT NULL, deleted_at INTEGER, deletion_stamp INTEGER NOT NULL,
  rev INTEGER NOT NULL, PRIMARY KEY (store, id)
);
CREATE INDEX records_rev ON records (rev);
CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL); -- 'rev', 'lastSnapshotDay'
CREATE TABLE devices (device_id TEXT PRIMARY KEY, last_sync_at INTEGER NOT NULL);
```

- **Marcas de exclusão:** ficam para sempre, só com id e datas; o `data` de uma marca antiga pode ser esvaziado. Assim, um aparelho que passou meses offline não ressuscita nada.
- **Um pedido por vez:** o objeto processa um sync de cada vez, o que dá a ordem das revisões sem lock extra.

### 8.3 Cópias diárias e restauração

- **Cópia diária:** um alarme do objeto, uma vez por dia, grava em `snap/<userId>/<AAAA-MM-DD>.json.gz` no R2 uma cópia comprimida no formato do export do Klick (`transfer.ts`). Só grava se a conta mudou desde a última cópia.
- **Retenção:** uma regra de ciclo de vida do bucket apaga as cópias com mais de 30 dias.
- **`GET /api/snapshots`:** lista os dias, com o número de solves de cada um.
- **`POST /api/snapshots/:day/restore`:**
  1. o servidor grava antes uma cópia "antes de restaurar";
  2. regrava cada registro da cópia com datas novas;
  3. marca como excluído o que existe hoje e não está na cópia.

  Os aparelhos recebem tudo pelo sync normal, com a proteção da seção 6.6.

### 8.4 Ambientes, segredos e chave de liberação

- **Segredos** (`wrangler secret`, por ambiente):
  - `RESEND_API_KEY`;
  - `BETTER_AUTH_SECRET`;
  - `TURNSTILE_SECRET`.

  O repositório público tem só os nomes. A site key do Turnstile é pública e vai no `wrangler.jsonc`.
- **Chave `ACCOUNTS_ENABLED`** (variável de ambiente):
  - **Beta:** `true` assim que o login funcionar.
  - **Produção:** `false` até a política de privacidade estar no ar e o Ranielli dar o ok.
  - **Com `false`:** as rotas `/api` (menos `/api/health`) respondem 404, e o app esconde tudo de conta. O app pergunta isso em `/api/health`, que diz se a conta está ligada.

### 8.5 Logs e custo

- **Logs:** só ids, contagens, durações e erros. Nunca e-mail, código ou dados de solve.
- **Custo:** Workers Paid (US$ 5 por mês) com alerta de gasto. A pesquisa estima uns US$ 5 por mês até 5 mil contas (seção 6.3 da pesquisa).

## 9. Telas

### 9.1 Ajustes: "Conta e sync"

É uma seção nova, a primeira da coluna da direita no desktop e a primeira da lista no celular.
- **Sem conta:**
  - a frase "Guarde seus solves na nuvem e use em outros aparelhos.";
  - o botão "Entrar ou criar conta".
- **Com conta:**
  - o e-mail;
  - a situação, por exemplo "Sincronizado há 2 min" ou "4 mudanças esperando rede";
  - "Sincronizar agora";
  - "Passkeys", para criar e remover;
  - "Cópias na nuvem": os últimos 30 dias, com o número de solves de cada um, e "Restaurar este dia" com confirmação;
  - "Sair";
  - "Sair de todos os aparelhos";
  - "Apagar minha conta".

### 9.2 Diálogo de entrar

Usa a folha (`dialog.sheet`) dos outros diálogos, com quatro passos:
1. e-mail;
2. código;
3. passkey;
4. primeiro sync.

O link para a política de privacidade fica no primeiro passo.

### 9.3 Indicador na barra de cima

Só aparece com conta. É um ícone de nuvem ao lado da data, com quatro estados:
- sincronizado;
- sincronizando;
- esperando rede;
- erro.

Um toque leva a Ajustes, em "Conta e sync". O ícone não anima durante o timer, e o estado vai no rótulo acessível.

### 9.4 Convite

- O tour da primeira vez não muda.
- Com a conta ligada no ambiente, o lembrete de exportar que já existe passa a oferecer também "Proteger na nuvem".
- Quem tem conta não vê mais o lembrete de exportar.

### 9.5 Página de privacidade

`/privacidade` é uma página estática no estilo do app, em nome do CNPJ do Ranielli (D9). Ela diz:
- o que é guardado: e-mail, solves, sessões, treino e ajustes da conta;
- para quê: sync e cópia;
- onde: Cloudflare, com servidores nos EUA;
- por quanto tempo: até a conta ser apagada, e as cópias diárias por 30 dias;
- quem recebe: Cloudflare e Resend;
- os direitos do titular e como pedi-los: dentro do app, e pelo e-mail de contato.

### 9.6 Acessibilidade

- Todo o fluxo funciona pelo teclado, com foco visível e ordem lógica.
- O anúncio na região `aria-live` sai só quando o sync falha ou volta a funcionar, não a cada sync.
- Os botões do diálogo têm área de toque de 44 px no celular.

## 10. Privacidade e LGPD

- **Controlador:** a empresa do Ranielli (D9).
- **Base legal:** a execução do serviço pedido pela pessoa, que cria a conta para ter sync.
- **Direitos:**
  - acesso, pelo export que já existe no app;
  - correção, editando no app;
  - exclusão, por "Apagar minha conta";
  - informação, pela política.
- **Transferência internacional:** os dados ficam nos EUA. Antes de ligar a conta na raiz, é preciso conferir se o contrato de tratamento de dados da Cloudflare cobre as cláusulas-padrão da ANPD. A pesquisa deixou isso em aberto.
- **Menores:** a 5a não tem nada público nem entre pessoas, porque só sincroniza os dados da própria pessoa. O ECA Digital pesa na 5b.

## 11. Testes

- **Regras de conflito** (`tests/unit/sync-merge.test.ts`):
  - cada regra das seções 6.3 e 6.4;
  - propriedades: comutativa, associativa e idempotente.
- **Simulação** (`tests/unit/sync-sim.test.ts`):
  - três aparelhos falsos e um servidor falso, com o mesmo `merge`;
  - gravações, edições, exclusões, restaurações e trocas da trilha aleatórias, com semente fixa e mil rodadas;
  - sincronizam em ordens aleatórias, com aparelhos offline por várias rodadas.

  Ao fim, todos estão iguais ao servidor, e nenhum registro que não foi apagado sumiu.
- **Migração v3:** um banco v2 de teste, com solves, sessões, lixeira, treino, trilha, temporadas e escolhas de algoritmo, migra sem perder nada. A tela mostra o mesmo de antes.
- **Repositório:**
  - fila de saída;
  - relógio;
  - ids fixos do csTimer e da sessão padrão;
  - restaurar como gravação;
  - purge só depois do servidor;
  - deduplicação do primeiro login.
- **Servidor** (`@cloudflare/vitest-pool-workers`):
  - login por código, com o envio de e-mail falso, e os limites;
  - `/api/sync` com cursor, lotes e revisões;
  - uma conta não lê nem grava na outra;
  - a exclusão vence;
  - mudança inválida;
  - cópia diária e restauração;
  - apagar a conta;
  - `ACCOUNTS_ENABLED=false`.
- **Ponta a ponta** (Playwright, com o Worker local):
  - dois navegadores na mesma conta: um resolve e o outro vê;
  - um apaga offline enquanto o outro edita: a exclusão vence;
  - o primeiro login com dados junta sem duplicar.
- **No aparelho, com o Ranielli, no beta:**
  - entrar no iPhone, pelo Safari e pelo app instalado;
  - criar e usar a passkey;
  - modo avião no meio de uma sessão;
  - uma semana com a conta real nos dois aparelhos.

## 12. Entrega

Cada etapa é testável e pode ir ao beta sozinha.

1. As regras de conflito e a simulação.
2. O banco v3 e o repositório (seção 5). Pode ir à raiz sem nada de servidor, e ninguém percebe; a partir daí não tem volta.
3. O Worker com o Durable Object e o `/api/sync`, ainda sem login. Só nos testes.
4. O login: Better Auth, D1, código por e-mail, Turnstile, limites e passkey.
5. O motor de sync no app: fila, cursor, gatilhos, lock, novas tentativas e primeiro login.
6. As telas: "Conta e sync", diálogo de entrar, indicador, convite e outra conta.
7. Cópias diárias, restaurar um dia e apagar a conta.
8. A página de privacidade e `ACCOUNTS_ENABLED=true` no beta.
9. A checagem do Supabase da v1, e o script único se houver algo.

A conta só liga na raiz depois da semana de teste no beta, da conferência do contrato da Cloudflare (seção 10) e do ok do Ranielli.

## 13. O que depende do Ranielli

- **Antes da etapa 3:** passar a conta da Cloudflare para o Workers Paid. É pagamento, então o Claude não faz.
- **Antes da etapa 4:** criar a conta no Resend. O DNS o Claude configura pela Cloudflare.
- **Antes da etapa 8:** a razão social, o CNPJ e o e-mail de contato para a política.
- **Na etapa 9:** o acesso ao Supabase da v1, na hora.

## 14. Fora do escopo

- Comunidade, Head-to-Head, perfis públicos e ranking (5b).
- Login com Google ou Apple, e senha.
- Criptografia de ponta a ponta.
- Resolver conflito na mão. As regras decidem sozinhas, e a lixeira e as cópias desfazem.
- Notificações.
- Compartilhar uma sessão com outra pessoa.
- Trocar de conta rapidamente: o fluxo é sair e entrar.

## 15. Riscos

| Risco | O que segura |
|---|---|
| Perder dados num merge | Regras puras testadas por simulação, cópia `'pre-sync'` antes do primeiro login e antes de lotes com muitas exclusões, e cópias diárias na nuvem |
| A migração v3 não tem volta | Cópia "antes da v3", testes de migração e a v3 indo à raiz antes do servidor (etapa 2), para aparecer cedo qualquer problema |
| Relógio do aparelho errado | O relógio do app nunca anda para trás e sobe com a hora do servidor (seção 5.4) |
| O iPhone apaga o armazenamento do site | Com conta, o sync devolve tudo. Sem conta, valem as proteções de hoje |
| O e-mail com o código cai no spam | SPF, DKIM e DMARC, texto simples e remetente fixo. A passkey diminui a dependência do e-mail |
| Gasto fora do esperado | Alerta de gasto, limites de pedido e lotes de 500 |
| Transferência internacional (LGPD) | Conferir o contrato da Cloudflare antes de ligar na raiz |
