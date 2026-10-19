# Klick — cópias na nuvem para contas grandes

Data: 2026-10-20. A conta está na raiz desde 19/10. O Ranielli pediu a proposta direto, sem perguntas, como no desafio. Tudo abaixo que não
veio das specs anteriores é decisão do Claude, listada na seção 8.

Referências: spec do endurecimento (`2026-10-17-klick-conta-endurecimento-design.md`, 4.2, 4.4 e 7.2), a medição
(`docs/superpowers/measurements/2026-10-17-conta-100k.md`), a revisão final do endurecimento (I5: cópias que o app não restaura só ocupam
o espaço das outras) e as sondas de 19/10 (o Durable Object no grátis aguenta 30 s de CPU; a restauração de 4.006 registros gastou 283 ms).

## 1. Por quê

Hoje uma conta com mais de 4.747 registros (uns 4 mil solves) não tem cópia na nuvem: a cópia do dia pausa com "a conta passou do tamanho
que o plano gratuito copia". O limite não vem da CPU (as sondas mostraram folga) e sim de duas coisas:

- **Restaurar regrava tudo.** A restauração de hoje grava cada registro da cópia com a data nova, uns 3 a 4 linhas por registro. Uma conta
  de 100 mil solves precisaria de 400 mil linhas, quatro vezes o dia inteiro do grátis, que é dividido entre todas as contas.
- **A cópia monta tudo de uma vez na memória.** A de 100 mil solves passa de 100 MB vivos, perto dos 128 MB do objeto.

Quem tem mais solves é justamente quem mais perde se algo der errado. A pesquisa 1 apontou a perda do histórico como a dor nº 1 de quem usa
timer.

## 2. Metas, não-metas e anti-metas

**Metas**
- Toda conta tem cópia na nuvem, até a cota de 100 mil solves.
- Restaurar um dia funciona para qualquer tamanho de conta, sem estourar o grátis.
- Nada muda para quem já cabe hoje, a não ser restaurar ficar mais barato.

**Não-metas**
- Cópia incremental (só o que mudou desde a última). Fica para depois, se o espaço apertar.
- Escolher o que restaurar (só uma sessão, só um evento).

**Anti-metas**
- Qualquer custo novo: o R2 continua dentro do teto de espaço e de operações.
- Uma restauração que derrube as gravações do dia para todas as contas.
- Restaurar sem a cópia de segurança de antes.

## 3. Restaurar só o que mudou

A restauração passa a gravar só os registros que diferem entre a conta de agora e a cópia: um conteúdo diferente, uma exclusão que mudou,
um registro que existe só num dos lados. Um registro igual nos dois lados não é regravado.

- No caso comum (desfazer uma exclusão em massa, um import errado, um dia ruim), quase tudo é igual e a restauração custa pouco.
- Isso vale para todas as contas, as pequenas inclusive: restaurar fica mais barato para todo mundo.
- A conferência do orçamento do dia (o `too-big` e o `write-budget` de hoje) passa a contar só as mudanças de verdade.

## 4. A cópia em partes

- **Partes.** A cópia de uma conta grande sai em partes de até `COPY_PART_RECORDS` registros cada (proposta: 5.000), lidas do banco em
  ordem e montadas uma de cada vez, com a memória limitada pelo tamanho da parte. Um manifesto pequeno lista as partes, o dia e as
  contagens. Uma conta pequena continua com um arquivo só, como hoje.
- **Frequência.** Acima de `RECORDS_PER_DAY` registros, a cópia sai a cada `BIG_COPY_EVERY_DAYS` dias (proposta: 7), não todo dia. Com a
  regra de 30 dias do bucket, ficam umas 4 cópias por conta grande. A spec do endurecimento (7.2) já permite menos frequência para contas
  grandes.
- **Espaço e operações.** Cada parte reserva o espaço e a operação A dela antes de gravar, como hoje. Sem espaço, a cópia pausa inteira e
  nenhuma parte fica sozinha: uma cópia é o manifesto mais todas as partes, ou nada. Uma cópia que ficou pela metade (o objeto caiu no meio)
  não aparece na lista e some pela regra de 30 dias.
- **Na lista.** As cópias em partes aparecem em "Cópias na nuvem" como as outras, com a data e o número de solves.

## 5. Restaurar uma cópia grande

- **No servidor, quando cabe.** Se as mudanças de verdade (seção 3) cabem no que sobra do orçamento do dia, a restauração acontece no objeto
  da conta, como hoje, com a cópia de segurança de antes.
- **No aparelho, quando não cabe.** Se não cabem, a restauração vira um download.
  - O aparelho baixa a cópia (o manifesto e as partes, pelo Worker, com as operações reservadas) e aplica as diferenças localmente: na tela,
    a conta volta ao dia escolhido na hora.
  - Antes, ele guarda uma cópia automática do estado de agora, como o restaurar local já faz.
  - Depois, o sync sobe as diferenças no ritmo do orçamento do dia, e o app mostra "o resto sobe amanhã", como num import grande.
  - Os outros aparelhos recebem a restauração aos poucos, pelo sync.
- **Quem decide.** O servidor responde, ao pedido de restaurar, se fez no servidor ou se o aparelho deve baixar. A pessoa não escolhe; o app
  diz o que vai acontecer antes de confirmar ("Esta conta é grande: a restauração chega a este aparelho na hora e aos outros nos próximos
  dias").

## 6. Restrições

- Valores que podem mudar ficam numa constante só ou na configuração do Worker, com teste.
- A cópia de uma conta pequena continua no formato de hoje; o app de hoje continua lendo as cópias que já existem.
- Sem conta, nada muda.
- Textos novos em português, no tom do app.

## 7. O que conferir

- A medição (`tests/perf/account-100k.perf.ts`) roda de novo: a parte de 5.000 registros e a restauração de diferenças cabem com folga na
  memória, e a restauração de um dia ruim típico cabe no orçamento.
- Um teste de ponta a ponta: uma conta grande restaura um dia pelo aparelho e o resto sobe pelo sync.

## 8. Decisões do Claude (o Ranielli pulou as perguntas)

1. Restaurar só o que mudou, para todas as contas.
2. Cópia em partes de 5.000 registros, com um manifesto.
3. Contas grandes copiam a cada 7 dias, não todo dia.
4. Restauração grande pelo aparelho, com o sync subindo o resto, em vez de uma restauração de vários dias no servidor.
5. Sem cópia incremental por enquanto.
