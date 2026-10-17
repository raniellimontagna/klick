# Klick — o visual da conta: o e-mail do código e o "cubo vivo"

Data: 2026-10-17. Sub-projeto 5a (conta e sync) já no ar no beta. Esta spec muda só a aparência; o fluxo, os textos de erro e a lógica ficam como estão.

## 1. Por quê

O Ranielli testou o fluxo inteiro no beta (código por e-mail, entrar, primeiro sync) e funcionou. O que incomodou foi o visual: "achei feio o e-mail" e "faltou um feedback visual bonito, animado". Hoje o e-mail é quase texto puro e os momentos do fluxo (código enviado, conferindo, subindo, pronto) só trocam uma linha de texto. A meta é que essas horas pareçam o Klick: o mesmo cubo do logo, as mesmas cores, um movimento curto que diz o que está acontecendo.

## 2. Metas, não-metas e anti-metas

**Metas**
- Um e-mail do código bonito, com a cara do Klick (escolhido: "peças do cubo").
- O "cubo vivo": o quadradinho do logo (3×3, centro vermelho) conta cada momento da conta, no diálogo de entrar, no ícone da barra de cima e no botão "Sincronizar agora".
- O campo do código com as mesmas peças do e-mail, e um retorno claro de certo e errado.

**Não-metas**
- Mudar o fluxo, os passos, os textos já existentes ou qualquer regra do sync.
- Animar restaurar cópia, sair ou apagar a conta (ficam como estão).
- Som, vibração, confete.
- Animar o e-mail (Gmail e Outlook cortam animação).

**Anti-metas** (falharia mesmo funcionando)
- Qualquer custo no caminho de quem nunca entra numa conta: nada novo carregado, desenhado ou rodando para essa pessoa.
- Qualquer coisa que anime ou pese com o timer rodando.
- Quebrar o preenchimento automático do código no iPhone (`autocomplete="one-time-code"`), o colar ou o teclado numérico.
- Animação que repete sem parar fora de um estado de espera.
- O e-mail e o app com caras diferentes.

## 3. A identidade visual (já existe; usar a mesma)

- Cores (tema claro, `src/styles/tokens.css`): papel `#f3f0e9` (`--bg`), superfície `#fbfaf7`, linha `#e2dcd0`, tinta `#17171a` (`--ink`), atenuado `#6f6a60`, vermelho do centro `#d93d42` (`--arm`), verde `#23915a` (`--go`). O tema escuro tem os próprios tokens; o app usa sempre os tokens, nunca a cor crua.
- O logo: grade 3×3 de quadradinhos de canto arredondado, todos na tinta, o do centro vermelho (`public/icon.svg`, `.glyph` em `components.css`).
- Movimento: `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)`, `--t-micro: 120ms`, `--t-state: 200ms`.
- Menos movimento: o app já respeita `prefers-reduced-motion` e o ajuste próprio (`:root[data-reduced-motion='true']`, `base.css:113`).

## 4. O e-mail do código (escolhido: B, "peças do cubo")

Hoje: `worker/mail.ts`, `codeEmail(code)` → `{ subject, text, html }`, enviado pelo Resend de `Klick <nao-responda@ranimontagna.com>`.

**O HTML novo**, de cima para baixo, centralizado, sobre fundo papel:
1. O cubo do logo, grande (cada peça ~14 px, cantos ~4 px, vão ~3 px), centro vermelho.
2. "Seu código do Klick" (título, ~20 px, negrito, tinta).
3. "Vale por 10 minutos." (~13 px, atenuado).
4. O código em seis peças escuras (fundo tinta, dígito no papel, fonte monoespaçada em negrito, ~40×48 px cada, cantos ~10 px), em dois grupos de três com um vão maior entre eles. A quinta peça (a do meio do segundo grupo) é vermelha, como o centro do cubo.
5. Uma linha pequena com o código inteiro, para copiar: "Código: 482913" (texto selecionável, monoespaçado).
6. "Se não foi você, ignore este e-mail." e "Klick · timer de cubo mágico" (~11 px, atenuado).

**Regras do e-mail**
- O assunto continua `Seu código do Klick: <código>` e a parte em texto puro continua igual: os dois são o que o iPhone e os clientes usam para sugerir o código.
- HTML de e-mail de verdade: layout em tabelas e estilos inline (Outlook), sem fonte da web (pilha do sistema), sem imagem (o cubo e as peças são células de tabela coloridas), sem script, sem link externo além do domínio do app.
- Um texto de pré-visualização escondido: "Vale por 10 minutos."
- Legível no modo escuro dos clientes que invertem cores (peças escuras com dígito claro já resistem; conferir no Gmail e no Apple Mail do iPhone no beta).
- Largura máxima ~480 px; no celular, as seis peças cabem numa linha.
- O código só aparece no corpo e no assunto; nada de código ou e-mail em log (regra que já vale).

## 5. O cubo vivo no diálogo de entrar (escolhido: A)

Um componente só, o **cubo vivo**: a grade 3×3 do logo, desenhada pelo app, com estes estados:

| Estado | O que faz | Quando |
|---|---|---|
| parado | o logo, centro vermelho | padrão |
| onda | as peças sobem e descem em onda, da primeira à última (uma vez, ~600 ms) | o código acabou de sair |
| girando | gira uma camada (90°), pausa, gira de novo — em loop **só enquanto espera** | conferindo o código; sincronizando |
| enchendo | as peças ficam verdes uma a uma conforme o progresso (0 a 9 peças) | o primeiro sync subindo/descendo, quando o total é conhecido; sem total, "girando" |
| resolvido | um pulinho (escala ~1,1 e volta) e as peças voltam à cor do logo (uma vez) | "Pronto" |
| erro | peças paradas, o centro vermelho em destaque | erro, falta de rede, cancelado |

**No diálogo de entrar** (`src/ui/dialogs/SignInDialog.svelte`):
- Passo do e-mail → "Enviar código": ao receber `'sent'`, o passo do código abre com o cubo em "onda" e "Mandamos para <e-mail>".
- Passo do código: o campo vira **seis peças** iguais às do e-mail. Por baixo continua **um único campo de texto real** (o mesmo `input` com `inputmode="numeric"` e `autocomplete="one-time-code"`, que aceita colar), e as peças só mostram os dígitos digitados. Enquanto confere: cubo "girando".
  - Código certo: as peças viram verdes uma a uma, como uma camada do cubo virando (~300 ms no total), e o fluxo segue.
  - Código errado: o campo treme de leve e as peças ficam vermelhas por ~600 ms; a mensagem de erro de hoje continua aparecendo.
- Passo da passkey: sem mudança visual além do cubo parado.
- Passo do primeiro sync: cubo "enchendo" com a contagem que já existe ("812 de 1.234 solves"); no fim, "resolvido" e "Pronto. Seus solves estão na conta."; cancelado ou erro: cubo em "erro".

## 6. A nuvem da barra de cima (escolhido: C, "cubinho como selo")

Hoje: `src/ui/SyncIndicator.svelte` (nuvem de traço com símbolos dentro).
- A nuvem fica **só o contorno** (traço ~1,8, redondo), sem nada dentro.
- No canto de baixo à direita, um **selo**: um cubinho 3×3 pequeno sobre um quadrado arredondado recortado na cor do fundo da barra (no tema escuro, o fundo escuro).
- Estados (os mesmos quatro de hoje, de `syncIcon`):
  - sincronizando: o cubinho gira uma camada em loop;
  - sincronizado: peças verdes; ao chegar nesse estado vindo de "sincronizando", um pulinho uma vez;
  - esperando rede: contorno da nuvem tracejado e peças cinza;
  - erro: peças na tinta com o centro vermelho (a nuvem continua no contorno normal).
- Continua: tocar leva a "Conta e sync"; o rótulo acessível diz o estado; com o timer rodando nada se mexe (`data-quiet`); o ícone **não** vira região de anúncio.

## 7. "Sincronizar agora" em Ajustes

Hoje: `src/ui/ajustes/AccountSection.svelte`, o botão e a linha `syncLine`.
- O cubinho fica dentro do botão, à esquerda do texto.
- Ao tocar: o cubinho "girando" enquanto a fase é `syncing` (o botão já fica desabilitado nesse tempo).
- Ao terminar bem: a linha de situação mostra "Sincronizado agora" com um toque de verde que some em ~1,2 s; o cubinho faz a "onda" uma vez.
- Erro: o cubinho em "erro"; a linha mostra o erro de hoje.

## 8. Regras que valem para tudo

- **Menos movimento:** com `prefers-reduced-motion` ou o ajuste do app, nada se move: só as cores e os estados mudam.
- **Uma vez:** onda, resolvido, pulinho e o verde do "Sincronizado agora" tocam uma vez por evento; só "girando" repete, e só enquanto a espera dura.
- **Leitor de tela:** nada novo é anunciado. O cubo e as peças são decorativos (`aria-hidden`); o campo do código continua um campo com rótulo; os anúncios continuam só quando o sync falha ou volta (spec 9.6).
- **Sem conta, nada muda:** o cubo vivo só existe nas telas da conta; nada novo entra no caminho do timer; sem biblioteca de animação nova (CSS e o que o Svelte já tem).
- **Tema escuro:** tudo pelos tokens; conferir os dois temas.
- **Textos:** os que já existem ficam; os novos seguem o tom do app e vão para `T.conta`: "Mandamos para {e-mail}", "Sincronizado agora", "Código: {código}" (no e-mail), "Klick · timer de cubo mágico" (no e-mail).

## 9. O que muda na spec da conta (2026-10-15)

- 7.4 (e-mail): deixa de ser "em texto"; passa a ser HTML com as peças, mais a parte em texto puro de sempre.
- 9.2, 9.3, 9.6: o cubo vivo no diálogo, a nuvem com o selo, e a regra de menos movimento/uma vez.

## 10. Deixado para quem constrói

- Os tempos exatos dentro das faixas acima, e a curva de cada animação (partindo de `--ease`).
- Onde o componente mora e como recebe o estado; como o campo de seis peças fica por cima do campo real.
- Os detalhes de tabela do HTML para o Outlook.
- Os testes: o HTML do e-mail (código nas peças e na linha de copiar, texto puro intacto, sem imagem/script/fonte externa), os estados do cubo vivo, o diálogo, a nuvem e o botão em cada estado, menos movimento, e os seletores que os testes de hoje usam (`data-code`, `data-sync`, `data-quiet`, `data-sync-line`) continuando a funcionar.

## 11. Decisões do Claude (para o Ranielli conferir)

Tomadas depois da leitura de um revisor; nenhuma muda o que foi escolhido nas maquetes.

1. **"Sem custo para quem não tem conta"** quer dizer: nada novo é desenhado, carregado depois do início ou roda para essa pessoa. Os poucos bytes do componente no pacote principal (onde a interface da conta já mora) são aceitos; não se cria um pedaço separado só para ele. O CSS do cubo vivo fica no próprio componente, não no CSS global.
2. **Menos movimento:** o cubo fica no estado "parado" e o texto ao lado diz o que acontece ("Conferindo o código…", a contagem do sync). O "enchendo" continua pintando as peças de verde (é cor, não movimento). O código errado perde só o tremor: as peças ficam vermelhas pelo mesmo tempo.
3. **O verde do código certo:** a troca de passo espera a cascata terminar (~300 ms); com menos movimento, não espera. Os testes que esperam a troca imediata se ajustam a isso.
4. **Os ~600 ms do código errado:** o campo continua editável e o que foi digitado continua lá (como hoje); se a pessoa digitar nesse meio tempo, as peças voltam ao normal na hora. O vermelho segue o estado de erro, não um relógio próprio.
5. **"Enchendo":** só quando o total é conhecido (a fase de enviar); na fase de receber, "girando". O salto de girando para enchendo no meio é esperado. O primeiro sync de quem volta para a mesma conta segue a mesma regra.
6. **O selo da nuvem** é recortado da nuvem com uma máscara no próprio desenho, não com uma cor de fundo pintada: assim ele funciona em qualquer fundo, tema e estado do botão (passar o mouse, tocar).
7. **Tamanho:** o desenho da nuvem pode crescer até 22–24 px dentro do botão de 32 px que já existe (a área de toque não muda), para o cubinho do selo continuar legível (peças de ~1,5 px na grade de 24).
8. **E-mail no modo escuro:** o e-mail é declarado só claro (`color-scheme: light`), para ter a mesma cara em todo lugar; as peças escuras com dígito claro continuam legíveis se um cliente inverter as cores. Confere-se no Gmail e no Apple Mail no beta.
9. **"Sincronizado agora" verde:** só depois de um toque da pessoa em "Sincronizar agora" que terminou bem; os syncs automáticos com Ajustes aberto não piscam.

Decididas pelo controlador durante a execução:

10. **Textos que já existiam:** o app reusa `T.conta.codeIntro` no passo do código (não há texto novo "Mandamos para <e-mail>") e o "Sincronizado agora" da `syncLine` na linha de Ajustes.
11. **"Conferindo o código…"** foi acrescentado: aparece ao lado do cubo girando enquanto o código é conferido, num lugar guardado (não empurra o campo), sem ser anunciado.
12. **O e-mail não tem link nenhum:** nem botão, nem "abrir o Klick". O código se digita ou se cola.
13. **As peças do campo do código são todas na tinta:** sem a quinta peça vermelha e sem o espaço entre grupos; isso é só do e-mail. No campo do app, o vermelho (e o tremor) existe apenas para o código errado.

## Referência

As maquetes aprovadas estão em `.superpowers/brainstorm/51969-1792243626/content/` (fora do git): `email-direcoes.html` (B), `feedback-movimento.html` (A, e o campo do código), `nuvem-v2.html` (C), `indicador.html` (o botão).
