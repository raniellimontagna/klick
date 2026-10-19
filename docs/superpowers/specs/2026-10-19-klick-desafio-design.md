# Klick — desafio por link (sub-projeto 5b, primeira parte)

Data: 2026-10-19. A conta e o sync (5a) e o endurecimento estão no ar na raiz desde 19/10. O Ranielli pediu para pular as perguntas e
receber a proposta direto: tudo abaixo que não veio da pesquisa ou das specs é decisão do Claude, marcada como tal na seção 9.

Referências: spec do sub-projeto 1 (`2026-10-08-klick-design.md`, "comunidade e o formato Head-to-Head"), spec da 5a
(`2026-10-15-klick-conta-sync-design.md`, seções 1 e 15: a 5b fica com a comunidade e a conversa jurídica), pesquisa 4
(`docs/research/2026-10-15-sync-conta-comunidade.md`, seções 7 e 8.5).

## 1. Por quê

A spec do sub-projeto 1 reservou a comunidade e o formato Head-to-Head. A pesquisa 4 mostrou o caminho mais barato e mais seguro: um
desafio assíncrono por link, entre amigos, no formato Head-to-Head da WCA. Ele não precisa de servidor, não tem moderação (só joga quem
recebeu o link), não tem nada público e não põe desconhecidos em contato: o ECA Digital pesa na comunidade aberta, não aqui. E dá ao
Klick o que os outros timers sociais não têm: o Centro reagindo ponto a ponto.

## 2. Metas, não-metas e anti-metas

**Metas**
- A pessoa A desafia B com um link: os mesmos embaralhamentos, os tempos de A, e B joga ponto a ponto contra eles.
- B joga sem conta e sem instalar nada; a resposta volta para A por outro link, com o placar inteiro.
- O Centro reage a cada ponto e ao resultado.
- Os desafios ficam guardados como o resto do histórico: no aparelho, na cópia, na exportação e, com conta, no sync.

**Não-metas (ficam para depois, se houver gente pedindo, e depois de ouvir um advogado)**
- Ranking (global ou entre amigos), semanal do Klick, duelo ao vivo, perfis, lista de amigos, notificações.

**Anti-metas (falharia mesmo funcionando)**
- Qualquer custo novo: nenhuma rota nova no servidor, nada guardado pelo Klick fora da conta da própria pessoa.
- Chat, texto livre público ou qualquer jeito de achar ou contatar desconhecidos pelo app.
- Mudar as médias e os recordes das sessões: os solves do desafio não entram nas estatísticas.
- Mudar algo para quem nunca usa desafio.

## 3. O formato (Head-to-Head da WCA, adaptado ao assíncrono)

- **Sete embaralhamentos** do evento escolhido (qualquer evento do Klick; o padrão é o 3×3), gerados pelo gerador de sempre.
- **A resolve os sete**, com a inspeção e as penalidades de sempre (+2, DNF), e só então manda o link. Assim B sempre tem com o que
  comparar até o fim.
- **B resolve um por vez.** Depois de cada solve (e da penalidade, se houver), aparece o tempo de A naquele embaralhamento e o ponto.
  B nunca vê o tempo de A antes de resolver o embaralhamento.
- **Ponto:** o mais rápido leva; DNF é sempre o pior; dois DNF ou empate no centésimo, ninguém pontua.
- **Vitória:** quem chegar a 3 pontos primeiro; a partida acaba ali (B não resolve o resto). Se ninguém chegar a 3 nos sete, vence quem
  tiver mais pontos; empate em pontos, decide o melhor single entre os embaralhamentos jogados; depois disso, empate.
- **Sem refazer:** um desafio aceito neste aparelho segue até o fim; fechar e abrir de novo volta ao ponto em que parou.

## 4. O link

- **Tudo no link, nada no servidor.** O desafio viaja no fragmento da URL (`https://klick.ranimontagna.com/#desafio=…`), que o
  navegador não manda ao servidor: o Klick nunca vê quem desafia quem.
- **Conteúdo:** versão do formato, um id aleatório, o evento, os sete embaralhamentos, os tempos de A (com as penalidades) e, opcional,
  o nome que A escolheu mostrar. Na resposta, os mesmos campos mais os tempos de B e o nome de B.
- **Compacto:** JSON comprimido (`CompressionStream`, deflate-raw) em base64url. O link de um 3×3 deve caber numa mensagem de WhatsApp.
- **Validado ao abrir:** um link torto ou de outra versão mostra "Este desafio não abre nesta versão do Klick" e não muda nada.
- **Sem garantia contra trapaça:** é um desafio entre amigos; o tempo não é verificável (pesquisa 4, 7.3). Nada no app diz o
  contrário.
- **Compartilhar:** pela folha do sistema (Web Share com texto e URL); sem ela, copiar o link. QR code fica para depois.

## 5. O nome

- Opcional, até 20 caracteres, texto simples, guardado nos ajustes da pessoa (e no sync, com os ajustes).
- Só aparece para quem recebe o link que a própria pessoa mandou. Nada público, nada no servidor.
- Sem nome, o app mostra "Alguém te desafiou" e, na resposta, "Seu oponente".

## 6. Onde fica no app

- **Começar:** um "Desafiar" no Timer (perto do evento e da sessão) abre o modo desafio: escolha do evento, os sete embaralhamentos,
  o placar de solves e, no fim, "Mandar o desafio".
- **Receber:** abrir um link de desafio mostra a tela "X te desafiou: 3×3, sete embaralhamentos" com "Aceitar"; durante o jogo, o
  placar (pontos de cada um), o tempo de A revelado a cada solve e o Centro reagindo; no fim, o resultado e "Mandar a resposta".
- **Resposta:** abrir a resposta mostra a partida inteira, ponto a ponto, e o Centro reage ao resultado de quem desafiou.
- **Histórico:** "Desafios" em Evolução: a lista (evento, oponente, placar, data) e cada partida aberta ponto a ponto. Cada desafio
  vai para a lixeira como os solves, com a mesma regra de 30 dias.
- **O visual segue a linguagem aprovada** (sub-projeto 1, peças do cubo, sem cara infantil). Antes de construir as telas, uma maquete
  para o Ranielli aprovar (o checkpoint visual de sempre).

## 7. Dados

- **Uma store nova, `duels`**, no IndexedDB (mais uma versão do banco, só criando a store: nenhum dado existente muda), com um registro
  por desafio: o conteúdo do link, os tempos deste aparelho, quem desafiou quem, o estado (jogando, esperando resposta, terminado) e as
  datas de sempre (`updatedAt`, `deletedAt`).
- **Fora das estatísticas:** os solves do desafio ficam só no registro do desafio, não em `solves`; médias, recordes, constância e
  meta do dia não mudam. O Centro conta os desafios para os marcos dele, se fizer sentido (decisão de quem constrói).
- **Na cópia automática, na exportação e na importação do Klick:** o arquivo ganha `duels` (opcional; um arquivo sem ele continua
  valendo).
- **No sync:** `duels` vira uma store sincronizada, com limite próprio por conta (folgado para uso real, apertado para lixo, como os
  outros) e as mesmas regras de cota, orçamento e cópia do endurecimento. Um aparelho com o app antigo nunca quebra nem perde dado
  quando outro aparelho sobe desafios: se precisar, o protocolo do sync sobe e o antigo vê "Atualize o Klick", como já acontece.

## 8. Privacidade e lei

- O Klick não guarda nada de quem recebe um link, a menos que essa pessoa tenha conta e o desafio suba no sync dela.
- A política de privacidade ganha um parágrafo: o link carrega os tempos e o nome que a própria pessoa escolheu mandar, e o Klick não o
  vê nem o guarda.
- Nada público e nenhum contato entre desconhecidos pelo app: o desafio fica no risco baixo da 5a (pesquisa 4, 8.5). Ranking, perfis e
  qualquer coisa aberta continuam esperando a conversa com um advogado.

## 9. Decisões do Claude (o Ranielli pulou as perguntas)

1. Começar pelo desafio assíncrono por link (recomendação da pesquisa 4), e não por ranking ou duelo ao vivo.
2. Sete embaralhamentos, A resolve todos; B joga ponto a ponto e para quando alguém chega a 3.
3. O link leva tudo no fragmento; nenhuma rota nova, nenhum custo novo.
4. Nome opcional de até 20 caracteres, só para quem recebe.
5. Solves do desafio fora das estatísticas das sessões.
6. Desafios sincronizados como mais uma store, com limite próprio.
7. Maquete aprovada antes das telas.

## 10. Deixado para quem constrói

- O limite de desafios por conta e o tamanho máximo do link.
- Os textos novos, no tom do app, e as reações do Centro.
- Onde exatamente ficam "Desafiar" e "Desafios" nas telas, dentro da maquete aprovada.
- Se o protocolo do sync precisa subir.
