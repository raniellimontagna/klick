# Klick — o resto da comunidade (sub-projeto 5b)

Data: 2026-11-06. **Proposta para revisão do Ranielli e conversa com o advogado.** Nenhuma decisão nova deste documento está aprovada
para construção. O pedido é desenhar ranking, semanal e duelo ao vivo, incluindo os perfis e os amigos de que eles precisariam.

Referências: [desafio por link](2026-10-19-klick-desafio-design.md), especialmente as não-metas e a seção 8;
[conta e sync](2026-10-15-klick-conta-sync-design.md), seções 1 e 15;
[pesquisa 4](../../research/2026-10-15-sync-conta-comunidade.md), seções 6 a 8.5;
[README do app](../../../app/README.md), os portões de publicação.

## 1. Contexto e o que já está no ar

O desafio por link entregou a primeira parte do 5b. O restante não precisa virar uma rede social inteira. A recomendação é começar por
**um semanal com embaralhamentos do Klick e resultados só no aparelho**, depois comparar resultados que amigos trocaram por link. Um
ranking hospedado, relações entre contas e partidas ao vivo são etapas distintas, condicionadas à demanda, ao orçamento e à revisão
jurídica. Ranking global e perfis públicos ficam por último.

### 1.1 A base existente

O README e a spec do desafio registram conta, sync e desafio na raiz desde 19/10/2026. O código foi conferido na base `d4cc9d3` da `v2`;
esta tarefa não fez uma nova sonda de produção nem consultou o consumo do painel.

| O que existe | O que reaproveitar | O que isso não entrega |
|---|---|---|
| IndexedDB v4, store `duels`; cópia local, exportação, importação, lixeira e sync | Repositório, recuperação e apresentação do histórico de partidas | Uma tabela compartilhada de resultados ou uma lista de amigos |
| `DuelLink.v: 1`, fragmento `#desafio=`; JSON com deflate-raw e base64url | Compartilhamento pelo sistema, copiar/colar, validação e limite de descompressão | Autenticidade do autor, assinatura dos tempos ou revogação de um link enviado |
| Sete embaralhamentos; três pontos para vencer; comparação no centésimo, +2, DNF e desempate pelo single | `core/duel/score.ts` para partidas com essas mesmas regras; Centro e placar | O formato ao5 do semanal ou arbitragem de uma partida ao vivo |
| `duelName`, opcional, até 20 caracteres; ajuste privado que acompanha a conta | Um nome escolhido para compartilhar, após prévia | Perfil público, nome único ou identidade verificada |
| Better Auth no D1, código por e-mail e passkey; `AccountStore` SQLite por conta | Sessão, proteção de origem, limites, confirmação da conta esperada (`x-klick-account`) | Permissão para ler dados de outra conta |
| Protocolo de sync **3**, com `duels`, cotas e orçamento | Exclusão vence edição; fila local preservada; 426 e “Atualize o Klick” quando o protocolo muda | Aceitar uma store nova ou um novo formato de `Duel` sem mudar os validadores |

Fontes no checkout: `app/src/core/types.ts`, `core/duel/{link,validate,score}.ts`, `core/sync/{types,limits,prefs}.ts`,
`data/{db,repository,transfer}.ts`, `ui/state/duel.svelte.ts`, `ui/timer/TimerScreen.svelte` e `app/worker/{router,auth,budget,limits}.ts`.
O payload atual aceita até 12.000 caracteres e a descompressão até 64 KiB. O nome tem proteção contra controles e direção de texto;
isso protege a apresentação, **não é filtro de ofensas**. O modo Digitar fica desativado durante o desafio. Um tempo vindo de link ou
sync continua sendo declarado pelo cliente; o validador aceita inclusive zero, dentro do intervalo de 0 a 24 horas.

Os tempos do desafio ficam em `duels`, fora de `solves`, das médias e dos recordes das sessões. Isso continua valendo. Não se abre o
objeto privado de uma pessoa para calcular um ranking: a publicação de qualquer resultado precisa ser uma ação separada e mínima.

### 1.2 O orçamento real

A spec inicial da conta falava em Workers Paid. O README, a configuração e o endurecimento posteriores adotaram **Workers Free**.
Os limites consultados em 06/11/2026 são estes; não representam espaço disponível medido na conta:

| Recurso | Franquia do provedor | Teto atual do Klick: raiz / beta |
|---|---|---|
| [Workers dinâmicos][workers] | 100 mil pedidos/dia; 10 ms de CPU por pedido HTTP. Pedidos de assets estáticos são gratuitos e ilimitados [C1][assets] | Limites de rajada; não há neste desenho um novo orçamento de pedidos já implementado |
| [Durable Objects SQLite][do] | 100 mil pedidos/dia; 13 mil GB-s/dia; 5 milhões de linhas lidas/dia; 100 mil gravadas/dia; 5 GB totais | Linhas gravadas: 60 mil / 10 mil por dia; lidas: 3,5 milhões / 1 milhão por dia |
| [D1][d1] | 5 milhões de linhas lidas/dia; 100 mil gravadas/dia; 5 GB totais | Login e contadores usam D1; os tetos `ROWS_*` acima reservam o consumo dos **objetos**, não limitam todas as consultas D1 |
| [R2 Standard][r2] | 10 GB-mês; 1 milhão de operações A/mês; 10 milhões B/mês | Espaço: 1.000.000.000 / 256.000.000 bytes; A: 500 mil / 50 mil; B: 5 milhões / 500 mil |
| [Resend][mail] | 100 e-mails/dia e 3 mil/mês | 80 / 10 por dia; 2.500 / 250 por mês |

As cotas do provedor são compartilhadas pelos projetos e ambientes da mesma conta, **dentro de cada produto**. D1 e DO têm medidores
distintos, embora os números de linhas sejam iguais. Um banco, bucket ou namespace novo não ganha outra franquia. No DO, os tetos
configurados do Klick somam 70 mil gravações e 4,5 milhões de leituras por dia; a diferença até a franquia não é uma reserva da
comunidade. Alarmes, manutenção e outros projetos também consomem. Índices, exclusões e contadores entram na conta; linhas devolvidas
por uma consulta não são necessariamente todas as linhas lidas. [C2][d1] [C3][do]

As estimativas da seção 2 são **incrementais, de projeto, não medições**. Usam um piloto de 14 dias com 100 participantes, até 20 por
grupo, três consultas por pessoa/dia e, no ao vivo, 20 salas/dia. O pico é todo mundo enviando no mesmo dia; não se divide por sete para
esconder o domingo. Servem para escolher o recorte, não para prometer custo zero em qualquer escala.

### 1.3 Como ler a parte jurídica

O texto legal e as orientações oficiais consultados sustentam os cuidados da seção 4. A classificação do Klick, as bases legais por
finalidade e a suficiência das medidas ficam **a confirmar com o advogado**. “Privado”, “por link”, “grátis” e “sem chat” diminuem
exposição; não são declaração de dispensa legal.

A pesquisa de 15/10 e a spec do desafio tratavam o sync privado como risco baixo e a comunidade aberta como o ponto do ECA Digital.
Este documento mantém a diferença de risco, mas não assume que só uma comunidade aberta esteja sujeita à lei. O alcance depende do
produto concreto e do acesso provável por menores. Há um [guia da ANPD publicado em 28/10/2026][guia], posterior à pesquisa, com
avaliação dos critérios de acesso provável e proporcionalidade das obrigações. A análise dele para cada etapa é parte da consulta.

Fontes primárias consultadas em 06/11/2026:

- [Lei 15.211/2025, texto atualizado na Câmara][eca]: arts. 1 a 8, 9 a 17, 21, 24 e 27 a 31. O Planalto bloqueou a leitura automatizada;
  foi usada a versão da Câmara.
- [LGPD, texto atualizado na Câmara][lgpd]: arts. 5 a 9, 14, 16, 18, 19, 33 e 46.
- [Enunciado CD/ANPD 1/2023][bases]: bases legais de crianças e adolescentes e prevalência do melhor interesse.
- [Guia de fornecedores da ANPD, outubro de 2026][guia], acompanhado do [anúncio oficial de 28/10][anuncio-guia].
- [Página da ANPD sobre o ECA Digital][anpd] e [orientações e cronograma anunciados em 20/03/2026][idade]. Orientação preliminar ou
  previsão de fiscalização não equivale a suspensão de obrigação; a versão aplicável à implementação será reconferida com o advogado.
- Documentação de custos: [Workers][workers], [assets][assets], [DO][do], [D1][d1], [R2][r2] e [Resend][mail].

## 2. As seis peças

Os fluxos abaixo são propostas. “Depois” descreve o que precisaria existir para aquela peça ser viável; não autoriza construí-la.

### 2.1 Ranking entre amigos

**O que é.** Comparar a mesma rodada semanal com pessoas que já se conhecem. Não misturar recordes pessoais de sessões, eventos,
semanas ou formatos diferentes; um ao5 treinado em casa e um single escolhido no histórico não são a mesma disputa.

**Para quem usa, primeiro recorte.** Depois dos próprios cinco solves, a pessoa pode compartilhar **só o próprio resultado**. Um link
novo, por exemplo `#semanal=`, leva versão, semana, revisão do manifesto, evento, id aleatório do resultado, cinco tempos/penalidades,
origem da entrada e nome opcional. Não leva e-mail, id da conta, histórico ou resultados de terceiros. Quem recebe vê uma prévia,
confirma “Comparar aqui” e acrescenta o resultado a uma tabela local de até 20 entradas naquela semana. O envelope também leva a
revisão do resultado; correção mantém o id e sobe a revisão. Não há descoberta, envio de convite pelo Klick, nem atualização automática.
Empate em ao5 mantém a mesma posição; a ordem visual não cria um vencedor extra. Ao5 DNF fica no fim, sem posição; tentativa
incompleta não entra na classificação. Essas regras também valem para o ranking global futuro.

Antes de terminar a própria rodada, a prévia mostra só semana, evento e nome; os tempos recebidos e a tabela ficam escondidos. Isso é
uma regra de apresentação, não sigilo contra quem decodifica o link. Outra resposta do mesmo id e revisão maior pede substituir a
anterior, não cria uma segunda posição; repetida é ignorada e revisão anterior não sobrescreve. Um id novo pode ser a mesma pessoa:
o app deixa remover duplicatas, sem prometer reconhecer identidades. Toda a tabela diz “Resultados declarados, não verificados”. O destinatário
pode retirar uma entrada; um link já enviado não pode ser recolhido pelo Klick.

**Servidor.** Nenhum novo no primeiro recorte. Reusar o codec e os limites do link, com envelope e validador próprios; `#desafio=`
continua significando o desafio atual. A tabela fica em dados locais do semanal, não em `duels` e não em uma agenda global. Os nomes
recebidos são texto isolado, nunca HTML ou links clicáveis.

**Se houver demanda por atualização automática.** Um grupo fechado de até 20 contas, entrada por convite de uso único, confirmação
de quem convida e de quem entra, saída e bloqueio. Worker autenticado; D1 com grupos, membros e resultados explicitamente enviados.
Toda leitura verifica a associação ao grupo. O link local não prova autoria e não vira uma inscrição automaticamente: o resultado
precisa ser confirmado na sessão da própria conta. Não há lista pública de grupos nem convite por e-mail. Essa variante espera as
salvaguardas da seção 4 e uma spec de implementação própria.

**Custo estimado.** Local: US$ 0 incremental de backend; zero D1, DO, R2 e e-mails novos. Hospedado: no pico de 100 envios e 300
consultas de até 20 resultados, reservar aproximadamente **1.000 linhas gravadas e 10 mil lidas/dia no D1**, até 1.000 pedidos Worker,
com índices, verificações de acesso, contadores e limpeza; armazenamento da ordem de poucos MB. Nenhum DO novo e nenhum R2 de
resultados. São 1% das gravações e 0,2% das leituras da franquia D1, antes do uso existente. Não inclui login: se 100 pessoas pedirem
código no mesmo dia, já passam dos 80 e-mails/dia da raiz.

**Risco jurídico.** Menor no local, mas o link contém dados pessoais e pode ser encaminhado. Hospedado acrescenta relação social,
acesso entre contas, retenção e conteúdo de terceiros. Convite não prova amizade nem idade. Base legal, participação de menores e
eventual enquadramento como interação de jogo/rede social: **a confirmar com o advogado**. [J1][eca] [J2][lgpd]

### 2.2 Ranking global

**O que é.** Uma classificação visível a qualquer visitante. É uma finalidade nova: quem criou conta para guardar solves não entrou
automaticamente nela. Mesmo uma página sem chat expõe nome escolhido, desempenho e participação a desconhecidos.

**Para quem usa, se for aprovado depois.** A pessoa escolhe publicar uma rodada específica, vê exatamente os campos que aparecerão e
pode retirar a publicação sem apagar a conta. Mostrar só apelido ou identificador público separado, evento, semana, ao5 e posição.
Sem e-mail, link para contato, idade, localização, horário exato de atividade ou relação de amigos. Nada de “oficial”, “verificado”,
prêmio ou recorde WCA. Começar, no máximo, com o semanal 3×3; sem ranking de todo o histórico. Empates dividem posição.

**Servidor.** D1 separado logicamente das tabelas privadas, com um envio por conta/semana/evento, versão, origem e estado de
moderação. Worker calcula a média a partir dos cinco tempos; não aceita uma posição enviada pelo cliente. Índice por semana/evento/
resultado; top 50 com cache de até 60 segundos, sem exportação completa, busca por nome, perfil navegável ou cálculo de posição por
varredura a cada visita. Retirada e correção precisam invalidar o cache. Identificador público opaco não é o id interno do login. Operação requer
fila de denúncias, recurso, responsável humano e remoção de conteúdo. Não ler todos os `AccountStore` para montar a tabela.

**Custo estimado.** Com 100 participantes e 300 leituras de uma página de 50, cerca de **1.000 gravações e 20 mil leituras D1/dia**,
até 1.000 pedidos dinâmicos; 1% e 0,4% das franquias D1 respectivas. Cache só reduz essa projeção. A 1.000 participantes, 3.000 consultas
sem acerto de cache já leem **150 mil linhas/dia só da página**; envios, índices e manutenção podem chegar a 10 mil gravações.
Ainda parece abaixo da franquia D1, mas
ultrapassa o orçamento inicial de comunidade proposto na seção 3 e soma-se ao login. DO/R2/e-mail social: zero; login e trabalho
humano são custos à parte. Não há aprovação de escala ou de plano pago implícita nessa conta.

**Risco jurídico.** Alto em relação às outras peças: exposição de menores, apelidos ofensivos ou com contato, pressão competitiva,
coleta por terceiros, retirada de publicação e contestação. Consentimento de publicação é uma hipótese de desenho, não uma base legal
validada para qualquer idade. Escopo de público e possibilidade de publicar resultados de menores: **a confirmar com o advogado**.

### 2.3 Semanal do Klick

**O que é.** Cinco embaralhamentos fixos de 3×3 para a semana, iguais para todos. “Do Klick” identifica quem preparou a rodada; não é
competição oficial nem resultado homologado. O primeiro lançamento não tem classificação pública nem envio ao Klick.

**Para quem usa.** “Semanal” abre a rodada vigente e explica o formato antes de começar. Segunda-feira, 00:00 de Brasília, até a
segunda seguinte, intervalo fechado no início e aberto no fim. O manifesto traz início/fim também em UTC, para todos os aparelhos
usarem o mesmo intervalo. A pessoa resolve cinco vezes, com inspeção, +2 e DNF, e vê o ao5: descarta o melhor e o pior, faz a média dos
três restantes; um DNF é descartado como o pior, dois ou mais dão ao5 DNF. A média arredonda ao centésimo mais próximo, meio centésimo
para cima, como `trimmedMean` em `app/src/core/stats.ts`; empate é no centésimo dessa média.

A primeira rodada completa é a comparável. Fechar o app conserva a sequência; a virada da semana não troca os embaralhamentos no
meio de uma tentativa. Uma rodada terminada depois do prazo fica no histórico como “fora da semana”, sem posição. Repetições são
treino e ficam marcadas; um ao5 só existe com os cinco resultados. Corrigir +2/DNF antes de concluir é permitido; depois de compartilhar,
uma correção gera revisão identificada e exige reenviar. Mudar o relógio, limpar o banco ou usar outro aparelho permite contornar a
regra de primeira tentativa; o app não chama isso de fiscalização.

**Servidor e dados.** Arquivos estáticos versionados com id da semana, intervalo, revisão, evento e as cinco strings de
embaralhamento. Preparar e validar 12 semanas por publicação, usando o gerador já adotado, e guardar as rodadas antigas. Distribuir os
embaralhamentos prontos, não só uma semente cujo resultado dependa da versão da biblioteca. O manifesto é público; **os resultados
das pessoas não são**. Após a primeira carga da rodada, funciona offline. Sem manifesto novo, mostrar “A próxima rodada ainda não
está disponível”; não inventar uma semana a partir de embaralhamentos locais. Um erro de manifesto exige nova revisão explícita;
resultados de revisões diferentes não se misturam.

Uma store local nova, proposta como `weeklies`, guarda tentativa, revisão, tempos e comparação recebida. Entrará em cópia local,
exportação, importação e lixeira, com limites e validação. **Não cabe no `Duel` atual**, que exige sete embaralhamentos e dois lados.
O timer, as penalidades, os componentes e o Centro são reaproveitados, sem gravar estes solves nas sessões. No primeiro recorte, não
há sync dos semanais: a tela diz “Só neste aparelho”. Uma futura store sincronizada precisa entrar no catálogo, nas cotas, nas cópias
e nos validadores, com evolução explícita de protocolo a partir do 3. Não se esconde conteúdo novo em uma chave arbitrária de `prefs`.

**Custo estimado.** Zero pedidos dinâmicos novos, linhas D1/DO, R2 ou e-mails. Um manifesto de poucos KB/semana vai pelos assets; há o
trabalho de preparar as próximas semanas. Se o sync for acrescentado, como ordem de grandeza: 100 tentativas com seis salvamentos
(começo e cinco solves), a quatro linhas por mudança, dão **2.400 gravações DO no pico**, 2,4% da franquia diária, antes de manutenção;
cada aparelho que baixa lê sua parte. Cópias repetem os dados pelos 30 dias da retenção e contam no R2. Esse gasto futuro não está
incluído no “zero” inicial.

**Risco jurídico.** É o recorte de menor exposição: conteúdo editorial, sem resultado público ou conta obrigatória. Não afasta por si
só obrigações de produto com acesso provável por menores. Conferir enquadramento, linguagem, proteção por padrão e medidas
proporcionais, incluindo o modo sem conta: **a confirmar com o advogado**. O Centro comemora a participação, sem punir ausência,
pressionar pela posição ou criar obrigação de voltar diariamente. [J3][guia]

### 2.4 Duelo ao vivo

**O que é.** A mesma partida curta do desafio, com duas pessoas presentes. Só por convite privado; não há fila aleatória, sala
listada, espectador, chat, áudio, vídeo ou indicador de quem está online fora daquela sala.

**Para quem usa, depois.** Uma conta cria a sala e envia o convite por fora. A outra entra com conta; quem criou confirma a entrada.
Os dois aceitam os nomes exibidos e as regras. Cada ponto exige os dois prontos, o mesmo embaralhamento e os dois resultados antes
da revelação. Cada timer mede seu próprio solve; latência de rede não soma nem subtrai tempo. Reusar as regras de sete embaralhamentos,
três pontos, penalidades e desempate do desafio. O servidor confirma o placar, mas não vê o cubo e não verifica a execução.

O convite expira em 10 minutos ou ao ser usado; a sala inteira dura no máximo 30 minutos desde a criação. Ao desconectar, avisar o
outro, congelar o avanço e permitir 60 segundos para voltar ao mesmo lugar. Mensagem repetida não duplica solve nem ponto. Sem volta,
ou ao expirar a sala, a partida fica **interrompida, sem vitória por queda**; os pontos jogados ficam visíveis, sem afetar ranking.
No iPhone, pôr o app em segundo plano pode derrubar a conexão; reconectar e recuperar o estado é requisito, não exceção. Sair ou
bloquear encerra a interação; não manda aviso fora do app nem revela ao outro a razão do bloqueio.

**Servidor.** Uma classe DO SQLite própria por sala, WebSocket com Hibernation API, estado e sequência autoritativos, deduplicação de
mensagens, prazos e alarme de limpeza. A sessão é conferida no upgrade, a origem é restrita e a conta esperada deve conferir, como
nas rotas atuais. O convite não é credencial de participante depois de aceito: trocar por autorização curta, presa à conta e ao lado.
Tokens aleatórios de pelo menos 128 bits; fragmento retirado da barra depois de lido; nunca em logs. Índice privado por conta no D1
permite revogar a participação e localizar salas ao apagar a conta. Nenhuma rota lê o objeto privado do oponente.

Persistir só transições de rodada, resultados e versão; não gravar o relógio em cada frame nem manter intervalo que impeça hibernação.
Heartbeats de transporte/auto-resposta não atualizam o banco. Estado operacional sai em até 24 horas; no fim, cada pessoa pode guardar
um histórico local de partida ao vivo, só uma vez, com cópia e exportação. O placar e a apresentação são reaproveitáveis, mas o registro
exige formato próprio: no ao vivo **ambos podem parar antes de sete**, enquanto o link assíncrono exige os sete tempos de A. Não
fabricar tempos nem salvar em `duels` fingindo que é o mesmo modo. Uma futura store sincronizada de partidas ao vivo precisa de
validador, cota e evolução do protocolo a partir do 3; não está incluída automaticamente no sync existente. Recuperação de envio final
pode usar estado privado por até 24 horas. Sem prova criptográfica de resultado; não se muda `#desafio=` para servir de convite de sala.

**Custo estimado.** Piloto de **20 salas/dia**, até duas simultâneas, no máximo 80 mensagens recebidas e 100 linhas gravadas por sala
(incluindo estado, alarmes e limpeza): até **2 mil gravações DO e 10 mil leituras/dia**. Se o sync do histórico próprio for aprovado,
somar até 160 gravações estimadas para guardar 40 históricos finais. As 2 mil gravações são 2% da franquia DO; as 10 mil leituras, 0,2%.
Até 2 mil pedidos DO equivalentes/dia é uma reserva conservadora; a tarifa documentada aplica 20:1 às mensagens WebSocket recebidas,
e há também upgrades, chamadas HTTP e alarmes. Prever até 500 pedidos Worker e 1.000 gravações / 5 mil
leituras D1/dia para acesso, revogação e orçamento. Zero e-mails sociais; eventual histórico sincronizado usa as cópias R2 existentes,
com impacto a medir pela cópia inteira acionada, não apenas pelo tamanho da partida nova.

A duração também importa: sem hibernação efetiva, `20 × 1.800 s × 0,128 GB = 4.608 GB-s/dia`, **35,4% dos 13 mil**, só para essas
salas. Cem salas nesse pior caso dão 23.040 GB-s e não cabem no grátis. O piloto não abre sem medir hibernação, duração, CPU e total da
conta. São projeções, não garantia de que uma sala custe só mensagens. [C4][do]

**Risco jurídico.** Maior que o desafio assíncrono: presença, relação entre contas e contato simultâneo, inclusive convite encaminhado
por um adulto a um menor. Mesmo sem chat, existe troca de conteúdo. Enquadramento de jogo eletrônico, salvaguardas do art. 21,
participação de menores, supervisão e moderação: **a confirmar com o advogado** antes do piloto. [J4][eca]

### 2.5 Perfis e apelido

**O que é.** Três coisas diferentes: o nome que vai num link, uma identidade reconhecível dentro de um grupo e uma página aberta.
Só a primeira já existe. Não transformar o perfil interno de preferências do app em perfil social.

**Para quem usa.** No recorte local, reusar `duelName` opcional, até 20 caracteres, com prévia e confirmação antes de enviar; campo
vazio gera um rótulo neutro, sem extrair nome do e-mail. No grupo futuro, identidade opaca estável dentro daquele grupo e apelido
opcional. A pessoa sabe quem pode vê-lo, pode mudá-lo e bloquear participantes. Página pública, avatar enviado, biografia, links,
busca por apelido e selo WCA ficam adiados. Um apelido não precisa ser único e não prova quem é a pessoa.

**Servidor.** Nada novo para o nome local. Para grupos, uma projeção mínima autorizada no D1, com vínculo privado à conta e sem
retornar e-mail ou id do login. Validar e limitar nomes no servidor; bloquear URLs, telefone, e-mail e conteúdo ofensivo exige regras,
denúncia e revisão humana, além da proteção de texto já existente. Alterar o nome não reescreve links antigos. Um resultado global
futuro só reutiliza um nome após consentimento específico de publicação; nunca publica o ajuste privado só porque existe.

**Custo estimado.** Local: zero backend novo além do sync de `duelName` já existente. Para 100 criações/edições no pico do grupo:
**até 500 gravações e 2 mil leituras D1/dia**, 0,5% e 0,04% das franquias D1 respectivas, aproximadamente 500 pedidos Worker e menos de
1 MB para o piloto. Sem arquivo de avatar, R2 e e-mails sociais ficam em zero. Uma alteração privada de `duelName` continua dentro do
orçamento atual do sync; não é custo público.

**Risco jurídico.** Apelido ligado a conta, resultado ou relação social é dado pessoal pseudonimizado, não anonimização automática.
Nome pode revelar nome real, escola ou contato de menor. A política precisa distinguir o que é privado, visível aos membros ou aberto;
base legal e limites por idade: **a confirmar com o advogado**. [J5][lgpd]

### 2.6 Lista de amigos

**O que é.** Uma relação persistente entre duas contas. Não é necessária para jogar o semanal nem para comparar links. Uma tabela
local de resultados recebidos não cria amizade no servidor.

**Para quem usa, depois.** “Adicionar por convite”, confirmação dos dois lados; sem buscar e-mail, importar contatos ou sugerir
desconhecidos. Até 20 amigos por conta no piloto, cinco convites novos/dia, pendência por sete dias. Quem recebe pode recusar sem
avisar o motivo. Remover corta o acesso futuro; bloquear também impede novo convite e entrada em sala/grupo com aquela conta.
Relação e bloqueio não ficam públicos; não há contagem de amigos, “amigos de amigos”, presença ou mensagens. Um id diferente pode
contornar bloqueio: não prometer proteção absoluta contra novas contas.

**Servidor.** D1 com pares, estado, autorizações e bloqueios; confirmação transacional e idempotente, vínculo com a sessão e consulta
de bloqueio antes de cada acesso social. Convites de uso único, aleatórios, guardados em hash e sem e-mail no link. Índice por cada
participante permite exportar e apagar as relações. Amizade, grupo e publicação são permissões separadas: ser amigo não dá acesso a
solves, backups ou participação em outro grupo. Nenhuma sincronização do grafo dentro de `duels`.

**Custo estimado.** Para 50 relações criadas/aceitas/removidas no dia de pico, com índices, expiração e contadores, reservar **1.000
gravações e 5 mil leituras D1/dia**, 1% e 0,1% das franquias D1 respectivas, até 1.000 pedidos Worker e poucos MB. Zero DO/R2/e-mails novos
para a lista. Bloqueios e denúncias precisam de cota própria que não desapareça ao atingir o limite de amizades. E-mails de login
seguem compartilhando os tetos atuais.

**Risco jurídico.** O grafo revela relações, facilita insistência e pode ligar adulto a menor. Dupla confirmação e link privado
reduzem descoberta, mas não comprovam segurança do vínculo. Participação por idade, eventual vínculo ao responsável, base legal e
retenção de bloqueios: **a confirmar com o advogado**. É uma das últimas peças, não pré-requisito do primeiro recorte.

## 3. Recorte recomendado e ordem

### 3.1 As alternativas

| Caminho | Ganho | Custo e compromisso | Recomendação |
|---|---|---|---|
| Semanal local e, depois, comparação por links | Dá um motivo comum para treinar e reaproveita compartilhamento | Preparar rodadas; dados só no aparelho; resultado declarado e reenviado à mão | **Começar aqui** |
| Grupos fechados hospedados | Tabela atualizada entre contas conhecidas | Banco compartilhado, permissões, menores, moderação, login e exclusão entre contas | Só com procura real e revisão jurídica |
| Comunidade pública e ao vivo de uma vez | Maior exposição e interação | Mais superfície de abuso, operação e consumo; exige gente simultaneamente | Não recomendado |

### 3.2 Etapas e portões

1. **Semanal privado:** uma rodada 3×3 por semana, manifesto estático, resultados locais, histórico e exportação. Antes de construir,
   Ranielli confirma o formato e a maquete; a consulta jurídica verifica os cuidados do modo sem conta. Não inclui ranking ou amigos.
2. **Comparação por links:** prévia explícita, só o próprio resultado, até 20 entradas locais, sem agenda social ou sincronização da
   tabela. Libera apenas após conferir o link recebido, duplicação, correção, dados compartilhados e o tratamento de menores.
3. **Um grupo fechado, se houver demanda:** Ranielli registra quem pediu e qual problema o link não resolveu. Antes do piloto, as
   respostas jurídicas aplicáveis viram requisitos, há responsável por denúncias, política atualizada, exclusão/exportação completas e
   orçamento medido. Não criar lista de amigos para viabilizar um grupo; associação ao grupo basta.
4. **Duelo ao vivo por convite:** só se houver duas pessoas querendo jogar juntas e aceitando testar reconexão. Piloto de 20 salas/dia
   e duas simultâneas, com chave própria para desligar. Pode ocorrer antes da lista persistente de amigos; precisa do mesmo cuidado
   jurídico com relações e bloqueios, e de medição de duração dos objetos.
5. **Lista persistente de amigos e identidade de grupo:** só se convites repetidos justificarem guardar o vínculo. Não abre perfil
   público, contato ou presença.
6. **Ranking global e qualquer perfil público:** decisão nova, depois de o uso privado mostrar valor e a operação ter capacidade.
   Não ficam pré-ligados no código de uma etapa anterior.

O advogado não precisa aprovar uma rede social inteira para avaliar o semanal. Levar os recortes em separado, incluindo o que já
existe; não tratar a consulta como mera autorização para publicar tudo. A seção 6 deixa as escolhas de produto abertas.

### 3.3 Custo zero tem portão, não promessa

Nenhum custo novo de backend nas etapas 1 e 2 **na configuração recomendada, sem sync dos semanais**. Para qualquer etapa hospedada,
conferir primeiro o consumo real dos outros projetos e do beta. Não subir plano nem aumentar os tetos atuais como efeito colateral.

Proposta inicial de orçamento **novo**, somado entre beta e raiz, sem reservar a sobra inteira da franquia:

| Medidor da comunidade | Teto proposto | O que acontece ao chegar |
|---|---|---|
| D1 | 10 mil linhas gravadas e 100 mil lidas/dia; 50 MB | Recusar novas operações sociais; não varrer tabelas inteiras ou contornar com outro banco |
| DO, se entrar o ao vivo | 5 mil linhas gravadas e 100 mil lidas/dia; 50 MB | Parar novas salas antes do limite; reservar também finalização e limpeza |
| Worker / DO | 10 mil pedidos novos/dia de cada produto | Suspender novas entradas; conexões e mensagens têm limites por sala e conta |
| Duração DO | 5 mil GB-s/dia projetados para comunidade | Limitar salas e tempo de vida antes de abrir; confirmar uso no painel |
| R2 | Nenhum bucket público; admitir o piloto só com projeção de até 100 MB adicionais nas cópias, contando a retenção inteira | Sync de novos tipos espera medição; cópias continuam nos tetos atuais |
| E-mails sociais | Zero | Compartilhar pelo sistema; nenhum convite, lembrete semanal ou “seu amigo entrou” por e-mail |

São requisitos para implementação futura, **não contadores já presentes**. Os contadores atuais em `budget.ts` reservam operações
de conta; não abrangem automaticamente D1 comunitário ou objetos de sala. Novos contadores precisam reservar antes, contar índices,
exclusões, expiração e o próprio custo de contabilizar; falha de reserva recusa a operação social. A duração exige limites de admissão
e tempo de vida, além de observação: não há aqui um medidor exato implementado que corte GB-s em tempo real.

Como exemplo, grupo + perfis + amigos + 20 salas, pelos limites estimados da seção 2, somariam aproximadamente **3.500 gravações e
22 mil leituras D1/dia**, 2 mil gravações e 10 mil leituras DO/dia, antes da manutenção geral; com sync futuro dos históricos ao vivo,
as gravações DO iriam a 2.160. O pior caso de duração das salas usa 4.608 dos 5 mil GB-s propostos. Isso cabe no orçamento proposto
isoladamente; **não prova que caiba no total da conta**. Ranking global e sync de semanais não entram juntos nessa soma. Como referência
de bytes, 20 salas/dia por 14 dias, dois históricos de 2 KB por
sala, dão cerca de 1,12 MB de dados novos; em 30 cópias, até 33,6 MB só desses dados. Mas uma partida pode tornar a conta alterada e
acionar a cópia de **todo o histórico privado**, não apenas desses 2 KB. O orçamento R2 depende dessa amplificação, das cópias em partes,
das operações A/B e dos dados que já existem. Não há estimativa fechada sem essa medição. As estimativas de CPU, tamanho real, linhas e
picos precisam de sonda no beta, sem encher artificialmente o grátis; renovar o piloto de 14 dias exige rever consumo e retenção.

As proteções de custo da comunidade devem falhar antes de impedir login, sync, cópia ou apagamento de conta. Um D1 comunitário na
mesma conta ainda divide a franquia D1 do login; separar tabelas não basta. Não iniciar a etapa hospedada se não houver margem para
manutenção, direitos dos titulares e tráfego recusado. Reservar limpeza e exclusão no orçamento; esgotar o teto de admissão não pode
bloquear essas saídas. Se faltar margem, pausar a comunidade e manter o timer e o histórico local.

Na implementação, seguir os portões do `app/README.md`: migrações necessárias nos dois ambientes antes do código que depende delas,
build validado, beta, sondas e só então decisão de publicação. Compatibilidade com links antigos, protocolo 3, fila offline e dados de
quem nunca usa comunidade são condições de aceite. Este documento não executa nenhuma dessas etapas.

## 4. Riscos e salvaguardas

### 4.1 Menores, ECA Digital e a revisão das premissas antigas

- Os arts. 1 a 8 do ECA Digital tratam de alcance, melhor interesse, prevenção e configuração mais protetiva. A avaliação deve olhar
  o Klick concreto, inclusive o timer privado, e não somente perguntar se há um feed. O guia de outubro trata de proporcionalidade;
  porte pequeno não é dispensa presumida. **Enquadramento e medidas por recorte: a confirmar com o advogado.** [J6][eca] [J7][guia]
- Não coletar data de nascimento completa, documento ou biometria por precaução. Definir antes qual sinal de faixa etária é necessário,
  quem o fornece, a finalidade, o prazo e como atender quem não o tem. “Tenho 18 anos” não é prova de idade. A vedação expressa à
  autodeclaração do art. 9º refere-se ao acesso impróprio/inadequado/proibido; não converter isso numa regra técnica universal sem
  analisar os arts. 10 a 15 e a orientação vigente. O mecanismo adequado para um PWA é **a confirmar com o advogado**.
- A LGPD, art. 14, exige melhor interesse e contém regra de consentimento específico e destacado do responsável para crianças. O
  Enunciado 1/2023 admite as hipóteses dos arts. 7º e 11 com melhor interesse prevalecente no caso concreto. Portanto, nem “sempre basta
  o consentimento” nem “a execução do serviço resolve qualquer dado de menor”. Não implementar um consentimento parental fictício
  por e-mail sem verificar a relação e a autorização. [J8][bases]
- O art. 24, no capítulo de redes sociais, prevê vínculo de usuários/contas de crianças e adolescentes de até 16 anos ao responsável;
  o alcance disso para cada combinação de ranking, grupo e lista do Klick é **a confirmar com o advogado**, inclusive à luz do guia.
  O art. 21 também importa se a função for jogo com troca de conteúdo síncrona ou assíncrona. Ausência de chat não encerra a análise.
- Até essa definição, nenhuma exposição pública ou relação hospedada de menor é presumida autorizada. Tampouco se promete um produto
  “só para adultos” baseado apenas numa caixa marcada. O semanal privado continua sendo o recorte a avaliar primeiro. Avisos e
  controles precisam servir à criança, ao adolescente e ao responsável, com acesso claro e linguagem adequada. Supervisão parental,
  classificação e relatório de impacto entram na consulta, não ficam atribuídos genericamente aos pais.

### 4.2 Dados, público e base legal

| Finalidade | Mínimo necessário proposto | Quem vê | Hipótese a validar com o advogado |
|---|---|---|---|
| Semanal local | Semana/revisão, tempos, penalidades, estado da tentativa | A pessoa no aparelho | Obrigações do fornecedor e informação no modo local |
| Link de resultado | Os cinco tempos, semana, origem e nome opcional | Quem recebeu ou recebeu um encaminhamento | Compartilhamento pedido pela pessoa; cuidado adicional com menores |
| Grupo fechado | Id interno do membro, permissão, resultado enviado e rótulo | Membros autorizados; operador com acesso restrito | Execução da função solicitada e demais bases adequadas à idade |
| Publicação global | Identificador público, apelido opcional, semana/evento e ao5 | Qualquer visitante, inclusive coletor externo | Consentimento específico e revogável é a proposta, sujeita à análise por idade |
| Segurança/moderação | Ids necessários, ação, motivo, hora e evidência estritamente necessária | Operador autorizado | Obrigação legal e/ou interesse legítimo conforme finalidade; não adotar uma base genérica |
| Conta/login | E-mail, sessão, passkey e os dados privados já previstos | A própria conta e operadores contratados | Revalidar a política atual quando o serviço mudar |

**E-mail nunca vira apelido, chave pública, hash público ou rota de busca.** Hash de e-mail também permite correlação e tentativa por
dicionário. Não expor notas de solve, sessão, treino, backups ou grafo de relações em respostas sociais. Nome real e documento não
são requisito de ranking casual. Não há publicidade por perfil, recomendação de oponente ou inferência de faixa etária pelo desempenho.

A escolha de publicar não pode vir marcada no cadastro ou ser condição para sync. Uma tela mostra campos, destinatários e como
retirar antes da confirmação, guardando a versão do aviso e a ação pertinente quando necessário. Compressão e fragmento de URL não
são criptografia: quem recebeu o link tem seus dados. A validade dessa manifestação e
da autorização do responsável é **a confirmar com o advogado**; não se promove esta tabela a parecer de base legal. [J9][lgpd]

### 4.3 Apagar, retirar, restaurar e exportar

Hoje `DELETE /api/account` apaga o objeto da conta, as cópias R2 e os registros de autenticação. Ele não conhece grupos, publicações,
amizades ou salas. Antes de qualquer etapa hospedada, estender o fluxo para localizar e remover essas projeções, revogar convites e
credenciais de sala, cortar conexões e invalidar cache. O pedido de apagar é idempotente e retomável após falha, com estado privado de
“excluindo” que impede acesso enquanto faltam etapas; só anunciar conclusão depois de concluir as remoções necessárias.

- “Retirar do ranking” não exige apagar o histórico pessoal. E apagar um `duels` privado não retira sozinho uma publicação separada:
  a interface precisa explicar e oferecer a retirada. Para grupo, sair também remove o acesso e o resultado daquele grupo.
- Exportar inclui os dados comunitários próprios e as relações pertinentes, sem abrir e-mails, denúncia de outra pessoa ou conteúdo
  privado do oponente. Validar o recorte de direitos de terceiros com o advogado.
- Proposta de retenção operacional: salas e convites de sala até 24 horas, convite de amizade por sete dias, resultados hospedados por
  12 semanas; depois excluir o identificável. Bloqueio dura enquanto a conta que bloqueou existir, sem virar lista pública. Evidência
  de denúncia tem retenção própria, definida juridicamente antes de coletar; os 30 dias das cópias privadas não são prazo legal geral.
- Backups restaurados não podem republicar resultado retirado, refazer amizade ou reativar bloqueado. Estado social hospedado tem
  autoridade e revogação próprias; não se restaura pelo merge dos dados privados. Um envio posterior exige ação nova e autorização.
- Links e exportações que outra pessoa já recebeu, capturas e dados locais de aparelhos offline não são apagados remotamente pelo
  Klick. Avisar esse limite antes do envio. A política não pode prometer recolher todas as cópias da internet.

Direitos, conservação obrigatória e prazos de atendimento precisam ser mapeados por finalidade. O prazo de 15 dias do art. 19 é para
resposta completa de confirmação/acesso; não é prazo universal de exclusão ou de denúncia. Contratos de Cloudflare, Resend e eventual
fornecedor de sinal de idade, transferências internacionais e adequação às regras da ANPD ficam **a confirmar com o advogado**; o
fato de a conta atual estar no ar não prova revisão contratual concluída. [J10][lgpd]

### 4.4 Denúncia, moderação e contato entre desconhecidos

Sem superfície pública, não há feed a moderar; isso não elimina a necessidade de um canal para direitos e relatos de abuso. Antes do
grupo ou ao vivo, Ranielli precisa nomear quem recebe, revisa e responde, com substituto e procedimento para urgência. Sem essa pessoa,
a etapa hospedada não abre. Filtro de apelido e rate limit ajudam, mas não substituem a operação.

Cada resultado/perfil de grupo e sala oferece “Bloquear” e “Denunciar”. Bloquear corta a interação imediatamente, independentemente
da análise; a denúncia guarda o id da superfície e categoria, com contato privado no canal adequado, sem mostrar o denunciante ao
denunciado. Não receber anexos abertos no piloto nem copiar material ilícito para logs ou backups gerais. Uma fila privada registra
encaminhamento, decisão, motivo e contestação. Uma suspeita de tempo falso não vira acusação pública automática.

Os arts. 27 a 30 do ECA Digital tratam de comunicação às autoridades, notificação, retirada e contestação. Distinguir um relato comum
do procedimento formal do art. 29, que tem requisitos de identificação; não anunciar denúncia anônima como se atendesse a todos os
ritos. Prazos, identificação mínima, preservação de evidência, deveres de comunicação e canal formal ficam **a confirmar com o
advogado** antes da coleta. O art. 31 tem limiar próprio para relatório semestral; não usar esse limiar para dispensar os demais
deveres. [J11][eca]

Não haverá busca de pessoa, e-mail, localização, link de WhatsApp no apelido, mensagem direta, convite não solicitado pelo sistema ou
presença fora da sala. Link pode vazar: expiração, uso único, confirmação do anfitrião, bloqueio e revogação são necessários no modo
hospedado. Grupo fechado também pode conter desconhecidos; a interface não o chama de “seguro para menores” só por ser privado.

### 4.5 Trapaça, tempo impossível e digitação

Nenhuma destas peças verifica o cubo. O servidor pode validar estrutura, ordem, duplicação e permissões; não prova que o solve ocorreu
ou que só houve uma tentativa. O mesmo vale para hardware sem arbitragem: ele não dá, sozinho, garantia de execução correta.

- Reusar validação numérica, tamanho, evento, penalidade e ordem. No novo fluxo, zero com resultado válido e números negativos,
  não finitos ou acima do teto são inválidos; zero com DNF pode ser representação sem tempo. Não endurecer retroativamente os links
  antigos neste subprojeto. Teto de 24 horas é limite de formato, não regra de plausibilidade esportiva.
- “Tempo impossível” não terá um número universal inventado: por evento, um limiar de suspeita deve ser definido e revisado antes de
  ranking hospedado. Sinaliza ou retira preventivamente da exibição para análise, sem banir sozinho, expor acusação ou exigir vídeo de
  menor. No local, avisar que o resultado é declarado e permitir remover da comparação.
- **Recomendação:** comparação usa timer; Digitar/importar continua possível no histórico normal, sem entrar na disputa. Um semanal
  de treino digitado, se vier a ser oferecido, leva rótulo e não participa dessa classificação. Origem gravada e bloqueio no cliente
  não impedem cliente modificado; o servidor também valida a política, sem prometer detectar fraude de origem.
- Penalidade e correção têm estado e revisão. Um resultado hospedado é único por conta/semana/evento, com idempotência; edições não
  criam novas inscrições. No ao vivo, o servidor calcula pontos após os dois confirmarem, nunca pelo placar declarado pelo vencedor.
- Sem prêmio, pagamento, selo de verificação ou peso nos recordes/estatísticas pessoais. Não coletar vídeo, microfone, câmera, IP
  permanente ou “impressão digital” do aparelho para tentar resolver a confiança de uma brincadeira entre amigos.

### 4.6 O que provar antes de construir ou liberar

Na etapa local: calendário e revisão iguais em dois fusos; offline e virada de semana; interrupção; ao5 com DNF/+2; repetição marcada;
exportar/restaurar; link torto, grande, duplicado e corrigido; nomes bidi/ofensivos; nenhum pedido novo com resultado pessoal. Antes
de telas, maquete para o Ranielli, mantendo a linguagem do cubo, teclado, leitor de tela e menos movimento.

Na etapa hospedada: uma conta não lê outro grupo; link encaminhado não toma o lugar de participante; revogação e bloqueio valem em
reconexão; apagar conta elimina projeções e cache; backup não republica; quotas param a comunidade antes do núcleo. No ao vivo, incluir
Safari/iPhone real, segundo plano, reconexão, mensagens repetidas/fora de ordem, troca de conta, expiração e hibernação medida. Uma
simulação ou teste de localhost não substitui esses resultados. A revisão jurídica e as escolhas de produto viram critérios
verificáveis antes do plano de implementação, sem mudar código nesta entrega.

## 5. Perguntas para o advogado

Levar os seis recortes, as telas/projeções de dados e as fontes acima. Pedir resposta por etapa; onde houver interpretação, registrar
o fundamento e o requisito concreto que muda no produto.

1. Como o ECA Digital e o guia da ANPD de outubro se aplicam ao timer atual, ao semanal local, à comparação de links e a cada etapa
   hospedada, considerando acesso provável por menores e o porte do fornecedor?
2. Quais funções podem caracterizar rede social ou jogo eletrônico com troca de conteúdo? Em quais recortes incidem o art. 21 e o
   vínculo ao responsável do art. 24, com quais faixas etárias?
3. Qual aferição de faixa etária é necessária e proporcional para este PWA, com e sem conta? Como agir sem sinal do sistema operacional,
   e quais dados podemos guardar sem documento/biometria? O que autodeclaração pode e não pode cumprir aqui?
4. Quais bases legais usar para conta, resultado privado, compartilhamento com grupo, publicação global, grafo de amigos e segurança,
   distinguindo crianças e adolescentes e o Enunciado 1/2023?
5. Quando houver consentimento ou autorização do responsável, como verificar a relação, demonstrar a manifestação, permitir revogação
   e resolver divergência entre responsável e adolescente sem publicar a idade ou identidade?
6. Que supervisão parental, avisos, classificação indicativa, avaliação de riscos e relatório de impacto são exigidos em cada etapa?
   O modo sem conta precisa de quais medidas próprias?
7. Podemos publicar apelido e desempenho de menores? Se sim, quais campos, público, confirmação e retirada são admissíveis? Limitar a
   adultos seria suficiente com qual aferição, e sem excluir quem só quer usar o timer privado?
8. Como apagar dados sociais sem violar direitos do oponente e tratar links, exportações e aparelhos offline de terceiros? Que
   prazos e registros mínimos usar para resultados, relações, bloqueios, denúncias, caches e backups?
9. Quais canais, identificação mínima, procedimentos e prazos atendem aos arts. 27 a 30? Como separar relato comum, notificação formal,
   emergência, retirada, recurso e comunicação a autoridades, preservando a identidade de quem relata?
10. Que registros de acesso e evidências precisam ser conservados por obrigação legal, inclusive pelo Marco Civil e ECA Digital, e
    como isso se concilia com logs minimizados, remoção de conta e a retenção proposta?
11. Quais deveres não dependem de escala e quais têm limiar específico, como o relatório do art. 31? Há regime proporcional aplicável,
    sem pressupor isenção por gratuidade ou pequeno porte?
12. O CNPJ/controlador e os contratos atuais de Cloudflare e Resend cobrem as novas finalidades e as transferências internacionais?
    Quais documentos e adequações ANPD faltam, inclusive se entrar um fornecedor de sinal de idade?
13. Que alterações exatas precisam entrar na política de privacidade, termos e informação acessível a menores e responsáveis antes de
    cada etapa? Quais registros e canal de atendimento precisam existir de fato?
14. Como redigir regras e contestação de resultados declarados, suspeita de fraude e suspensão de conta, sem chamar competição de
    oficial nem coletar prova excessiva, principalmente de menores?
15. Há restrições adicionais para convites entre adultos e menores, apelidos com contato e grupos administrados por usuários, mesmo
    sem chat? Dupla confirmação, bloqueio e ausência de descoberta são suficientes em quais condições?
16. Quais requisitos jurídicos impedem hoje cada etapa, inclusive a local, e quais poderiam ser satisfeitos por medidas proporcionais?
    Pedir uma lista de condições de liberação, sem tratar o parecer como autorização geral para toda a comunidade.

## 6. Decisões para o Ranielli

Estas são **escolhas em aberto**, não decisões herdadas do desafio nem aprovação de implementação. Se a resposta jurídica inviabilizar
uma opção, ela sai da escolha; a preferência de produto não a substitui.

| # | Escolha e opções | Recomendação |
|---|---|---|
| D1 | Por onde começar: semanal privado; grupo hospedado; comunidade pública | **Semanal privado**, depois comparação por link, pelo menor custo e exposição |
| D2 | Primeiro formato: 3×3 ao5 de cinco solves; sete solves H2H; vários eventos | **3×3 ao5**, separado do desafio de sete; expandir só com procura |
| D3 | Virada da semana: Brasília; UTC; fuso do aparelho | **Brasília**, com intervalo UTC no manifesto e data clara na tela |
| D4 | Tentativas: primeira completa; melhor de várias; só treino sem classificação | **Primeira completa comparável**; repetição marcada como treino, sem promessa contra reset |
| D5 | Entrada na comparação: timer; timer e digitação com rótulos; hardware obrigatório | **Timer**, todos os resultados ainda declarados; não exigir hardware ou prova em vídeo |
| D6 | Nome: rótulo neutro; `duelName` opcional; perfil e apelido único | **Nome opcional existente**, com prévia e rótulo neutro quando vazio; sem perfil público |
| D7 | Comparação: até 20 resultados locais por link; grupo de contas; ranking global | **Links locais primeiro**; confirmar se atualização automática justifica banco compartilhado |
| D8 | Histórico do semanal: só aparelho com exportação; sync já na primeira etapa; não guardar | **Só aparelho inicialmente**, com aviso, cópia e exportação; sync vira decisão separada com medição |
| D9 | Relações entre contas: convite por ocasião; lista persistente; descoberta automática | **Convite por ocasião**, lista só depois de demanda; sem descoberta automática |
| D10 | Público e menores: recortes privados com salvaguardas; público restrito por idade; adiar interação hospedada | **Adiar a interação hospedada até validar as condições por idade**; avaliar o semanal privado primeiro com o advogado |
| D11 | Ao vivo: piloto privado de 20 salas/dia e duas simultâneas; matchmaking aberto; adiar tudo | **Piloto privado só com procura e teste de reconexão**; ainda não é a próxima entrega |
| D12 | Sustentação: grátis com cotas e operador nomeado; plano pago/equipe; manter apenas funções locais | **Grátis com cotas e responsável/substituto antes de hospedar**; sem capacidade de moderação ou margem, manter o local e adiar o global |

Ao aprovar um recorte, registrar também quem prepara os manifestos seguintes e, se houver servidor social, quem atende denúncias e
direitos dos titulares. A proposta de retenção de 12 semanas e as cotas da seção 3 vão para essa aprovação junto com o parecer;
não são configuração automática nem permissão para elevar gasto.

## 7. Fora de escopo

- Código, migração, plano de implementação, mudança em specs anteriores, deploy, push ou merge nesta entrega.
- Declarar conformidade jurídica, substituir a conversa com o advogado ou certificar que a implementação atual atende a todas as
  obrigações. Este documento registra fontes e perguntas, não conclui essa auditoria.
- Chat, mensagem direta, áudio, vídeo, espectador, feed, busca de pessoas, sincronização de contatos, presença e convite por e-mail.
- Matchmaking entre desconhecidos, grupos públicos, sugestão de amigos e divulgação automática de resultados ou perfis.
- Avatar enviado, biografia, escola, cidade, idade pública, nome real obrigatório e vínculo automático a cadastro WCA.
- Competição oficial, prêmio, cobrança, apostas, classificação homologada, verificação por vídeo ou promessa de impedir trapaça.
- Alterar médias, recordes, metas, temporadas ou histórico das sessões por causa de uma rodada comunitária; estatísticas privadas
  continuam sendo da pessoa.
- Usar `duels` de sete embaralhamentos para armazenar ao5, reaproveitar `#desafio=` como sala ou publicar o histórico privado via sync.
- Fazer toda a comunidade num único lançamento, contratar plano pago ou consumir a folga de outros projetos sem decisão específica.

[workers]: https://developers.cloudflare.com/workers/platform/limits/
[assets]: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
[do]: https://developers.cloudflare.com/durable-objects/platform/pricing/
[d1]: https://developers.cloudflare.com/d1/platform/pricing/
[r2]: https://developers.cloudflare.com/r2/pricing/
[mail]: https://resend.com/docs/knowledge-base/account-quotas-and-limits
[eca]: https://www2.camara.leg.br/legin/fed/lei/2025/lei-15211-17-setembro-2025-797997-normaatualizada-pl.html
[lgpd]: https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html
[bases]: https://bibliotecadigital.mj.gov.br/bitstream/1/10215/2/Enunciado_ANPD_2023_1.html
[guia]: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-fornecedores-de-produtos-ou-servicos-de-tecnologia-da-informacao.pdf/@@display-file/file
[anuncio-guia]: https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-que-esclarece-quem-deve-cumprir-e-quais-sao-as-responsabilidades-das-plataformas-na-protecao-de-criancas-e-adolescentes
[anpd]: https://www.gov.br/anpd/pt-br/assuntos/eca-digital
[idade]: https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-orientacoes-preliminares-e-cronograma-para-afericao-de-idade-no-ambiente-digital
