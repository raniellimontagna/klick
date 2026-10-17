# Klick — endurecimento da conta antes da raiz

Data: 2026-10-17. Sub-projeto 5a (conta e sync) no ar no beta; antes de ligar a conta na raiz (`ACCOUNTS_ENABLED=true` em produção).

## 1. Por quê

O Ranielli quer abrir a conta para **gente desconhecida chegando pelo site**, e o que mais o incomodaria é **custo**: "não quero pagar". O Klick roda no plano grátis da Cloudflare (Workers, Durable Objects, D1, R2) com o Resend grátis. Junto, a revisão final do 5a deixou uma lista de correções marcadas "antes de ligar na raiz".

## 2. Metas, não-metas e anti-metas

**Metas**
- Custo zero garantido pelo próprio Klick: nada que ele faça pode gerar fatura, mesmo com estranhos ou com abuso.
- Quando um limite grátis estourar, o app falha com uma mensagem honesta e os dados ficam no aparelho.
- As correções da lista da revisão (seção 5).

**Não-metas**
- Workers Paid ou qualquer plano pago.
- Mudar o fluxo de entrar, as regras do sync ou o visual aprovado.
- Painel de administração, métricas, cobrança.

**Anti-metas** (falharia mesmo funcionando)
- Qualquer caminho que leve a uma fatura na conta "Rani" da Cloudflare ou no Resend.
- Um limite que apague ou perca dados de alguém.
- Mudar algo para quem não tem conta.

## 3. Onde a conta poderia virar fatura (o quadro aprovado)

- **Não cobram nunca no plano grátis** (o pedido falha ao estourar): Workers (100 mil pedidos/dia, 10 ms de CPU por pedido), Durable Objects (100 mil pedidos/dia, 5 GB), D1, Turnstile, Resend (100 e-mails/dia, 3 mil/mês).
- **O único caminho para fatura é o R2** (as cópias diárias): não tem teto de gasto; passou de 10 GB/mês, 1 milhão de gravações ou 10 milhões de leituras, cobra. Os 10 GB são **da conta "Rani" inteira**, divididos com `argus-backups` e `ranimontagna-blog-images`.

## 4. Custo zero (decidido com o Ranielli)

1. **Cota por conta: 100 mil solves.** O servidor recusa solves **novos** de uma conta que já tem 100 mil ativos (editar e apagar continuam). O app avisa, em Ajustes e na linha do sync: "A conta chegou ao limite de 100 mil solves. Os novos ficam só neste aparelho." Nada se perde: os solves recusados ficam no aparelho; eles saem da fila de saída (sem tentar de novo a cada sync) e a contagem aparece em Ajustes. Limites proporcionais para o resto do que uma conta guarda (sessões, treino, ajustes) — valores ao critério de quem constrói, folgados para uso real e apertados para lixo.
2. **Teto das cópias na nuvem: 1 GB no total do Klick**, num valor da configuração do Worker (`wrangler.jsonc`), para subir para 2 GB sem mudar código. Antes de gravar uma cópia, o Worker confere o uso; perto do teto, não grava (as antigas continuam vencendo em 30 dias pela regra do bucket), e Ajustes mostra "Cópias na nuvem pausadas: o espaço gratuito encheu." (texto ao critério de quem constrói, no tom do app). O uso precisa refletir as cópias que a regra de 30 dias apagou (por exemplo, recontar uma vez por dia no Cron que já existe, listando o prefixo `snap/`).
3. **Teto de e-mails por dia** *(decisão do Claude)*: o Worker conta os códigos enviados no dia (e no mês) e, perto dos limites grátis do Resend (100/dia, 3 mil/mês), recusa o pedido com uma mensagem própria ("Muitos pedidos de código hoje. Tente de novo amanhã."), em vez de deixar o Resend recusar sem explicação.
4. **Caber no plano grátis** *(decisão do Claude)*: medir CPU e memória da cópia diária, da restauração e do primeiro sync com uma conta de 100 mil solves (o limite do grátis é 10 ms de CPU por pedido e 128 MB por objeto). O que passar disso é dividido em pedaços (por exemplo, a cópia em partes ao longo de mais de um alarme). Se dividir não couber, contas muito grandes recebem cópia com menos frequência — nunca se paga.

## 5. Correções da revisão final do 5a

1. **A "Sessão 1" apagada volta num aparelho novo.** Depois do primeiro login, a troca da sessão atual (`app/src/data/repository.ts`, ~linha 1260, `emptied.has(current) || !record`) ignora uma `default-*` que já está na lixeira; incluir `record.deletedAt !== null`.
2. **O upgrade da v3 que falha não tem saída.** Hoje o app só diz "Não consegui atualizar seus dados… Libere espaço e recarregue" (`T.data.upgradeFailed`, `App.svelte:314`). Passa a oferecer "Exportar meus dados" (lê o banco da versão anterior sem mexer nele e baixa um arquivo do Klick) e "Tentar de novo".
3. **Apagar a conta mostra "Confira a conexão" quando não é conexão.** 400 do servidor (o e-mail não confere) vira o aviso de e-mail que não confere; 401 (conta já apagada em outro aparelho, ou sessão vencida) vira "Entre de novo" — e, se a conta já não existe, o aparelho sai dela como no apagar bem-sucedido.
4. **Clique duplo confirma "Restaurar este dia" e "Sair de todos os aparelhos".** O segundo clique só confirma depois de ~400 ms do primeiro.
5. **Outra aba sincroniza no meio de um solve.** A aba líder não roda uma rodada enquanto qualquer aba aberta estiver ocupada (timer, inspeção ou treino); cada aba avisa as outras pelo canal `klick-sync` quando fica ocupada ou livre.
6. **O "Pronto" do primeiro sync volta atrás.** Depois de chegar a "Pronto", o diálogo de entrar fica em "Pronto" até fechar, mesmo que outra rodada comece ou que outra aba pare o sync.
7. **Fechar o diálogo enquanto o código é conferido.** A entrada não continua com o diálogo fechado: a rodada do diálogo é guardada antes de esperar a conferência; se o diálogo fechou, no caminho de outra conta a sessão nova sai (como no fechar do passo da outra conta).

## 6. Restrições

- Valores que podem mudar ficam na configuração do Worker ou numa constante só, com teste.
- Os textos novos em português, no tom do app; os do Worker não importam `src/strings.ts`.
- O servidor e o app concordam sobre a cota (o núcleo `src/core/sync/` é dos dois).
- Nada do que já passa nos testes muda de comportamento fora destes itens.
- Sem conta, nada muda.

## 7. Decisões do Claude (para o Ranielli conferir)

Tomadas depois da leitura de um revisor. A ordem de prioridade que decide os conflitos: **nunca pagar > nunca perder dados > manter o serviço de pé para todos > a cota de 100 mil > a frequência das cópias.**

1. **As operações do R2 também têm teto, não só o espaço.** O Worker conta por mês as gravações e listagens (classe A) e as leituras (classe B) do R2 e para bem antes do grátis (por exemplo, 500 mil e 5 milhões); por conta, no máximo umas poucas restaurações por dia, e a lista de cópias não relista o bucket a cada abertura do diálogo (guarda o resultado por alguns minutos). Passou do teto, a função recusa com mensagem honesta.
2. **Se a medição mostrar que 100 mil solves não cabem nos 10 ms de CPU**, o que cede é a cópia e a restauração, nunca o pagamento nem os dados: contas grandes passam a ter cópia com menos frequência, ou nenhuma acima de um tamanho, e a restauração de uma conta grande que não couber é recusada com aviso. A cota de 100 mil só baixa se nem o sync couber.
3. **Sem espaço para a cópia "antes de restaurar", a restauração é recusada** ("Não há espaço para guardar o estado de agora antes de restaurar"): nunca se restaura sem rede de proteção.
4. **Solves recusados pela cota:** saem da fila, ficam no aparelho e contam como "só neste aparelho" (o apagar os dados do aparelho continua recusando enquanto eles existirem, como na decisão 32 do 5a). Ajustes mostra quantos são e um botão "Enviar de novo", que os põe na fila outra vez (o servidor recusa de novo se a conta continuar cheia). Sem reenvio automático.
5. **O que conta para os 100 mil:** os solves ativos. Restaurar da lixeira com a conta cheia conta como novo. Para o objeto da conta não crescer sem fim com criar-e-apagar, o servidor guarda de um solve apagado há mais de 30 dias só a marca de exclusão (id e data), sem o conteúdo — o mesmo prazo da lixeira do aparelho.
6. **Os limites diários do grátis que valem para todos** (linhas gravadas no objeto da conta: 100 mil por dia somadas entre todos): cada conta tem um orçamento diário de gravações (por exemplo, 20 mil mudanças por dia). Um primeiro sync muito grande (um import enorme do csTimer) sobe em partes ao longo de alguns dias, e o app mostra "o resto sobe amanhã" em vez de derrubar o serviço para os outros.
7. **E-mails:** o teto do Klick fica abaixo do grátis do Resend com folga (por exemplo, 80 por dia e 2.500 por mês, na configuração), porque a conta do Resend pode vir a servir outro projeto. Não há reserva para quem já tem conta: o servidor não pode revelar se um e-mail tem conta; quem tem passkey entra sem e-mail.
8. **O teto das cópias vale por ambiente:** 1 GB na raiz e 256 MB no beta, cada um na própria configuração. Hoje os outros projetos da conta ocupam ~1,9 GB (`argus-backups` 1,87 GB), então a conta fica em ~3,1 GB de 10 GB. O crescimento do `argus-backups` está fora do Klick e deve ser vigiado à parte.

## 8. Deixado para quem constrói

- Os limites exatos de sessões, treino e ajustes por conta; a margem antes do teto de 1 GB e dos e-mails.
- Como contar o uso do R2 (contador no D1, recontagem no Cron, ou os dois).
- Como dividir a cópia diária e a restauração se a medição pedir.
- Onde exatamente o aviso da cota e o das cópias pausadas aparecem em Ajustes.
