# Portão C: os segredos da conta

O Portão C é o que falta para a conta funcionar de verdade: os segredos do Worker e a chave pública do Turnstile. O repositório é público,
então nada disso mora num arquivo: os segredos entram direto no Cloudflare, pelo terminal.

## Onde estamos

- `BETTER_AUTH_SECRET`: **já está colocado** nos dois Workers (`klick-app-beta` e `klick-app`). Não precisa fazer nada.
- Turnstile: **já está feito** (17/10/2026). O widget `Klick` (invisível, beta e raiz) existe, o `TURNSTILE_SECRET` está nos dois
  Workers e a site key está no `wrangler.jsonc`. O passo 2 abaixo fica só para trocar o widget um dia.
- **Resend: é o único que falta, e só você consegue** (conta, domínio e a chave de envio). Comece por aqui.

Regra de ouro: **nunca cole um segredo numa conversa, num e-mail ou num arquivo.** Só no terminal, quando o script pedir (a digitação não
aparece na tela), ou direto no painel do serviço. A site key do Turnstile é pública e pode ser colada em qualquer lugar.

## 1. Resend (o e-mail do código de acesso)

1. Crie a conta em <https://resend.com>.
2. Em **Domains**, o domínio é `ranimontagna.com` (verificado em 17/10/2026; o remetente é `Klick <nao-responda@ranimontagna.com>`). O plano grátis aceita um domínio só.
3. O Resend mostra os registros de DNS (SPF, DKIM e o MX do retorno de e-mails devolvidos, mais uma sugestão de DMARC). Mande esses
   registros para o Claude: ele cria pelo MCP de DNS da Cloudflare. Ou crie você mesmo, no painel da Cloudflare, na zona `ranimontagna.com`.
4. Espere o domínio aparecer como **Verified** no Resend (de alguns minutos a algumas horas).
5. Em **API Keys**, crie uma chave com **Sending access** restrita ao domínio `ranimontagna.com`. Ela começa com `re_`. Deixe a
   chave copiada na área de transferência para o passo 3. Não cole em conversa.

## 2. Turnstile (a verificação antes de pedir o código)

1. Painel da Cloudflare, **Turnstile**, **Add widget**.
2. Nome: `Klick`. Hostnames: `beta.klick.ranimontagna.com` e `klick.ranimontagna.com`. Modo do widget: **Invisible**.
3. Anote a **site key** (pública) e a **secret key**. **Um widget só serve aos dois ambientes.** Como distinguir as duas, que começam
   igual (`0x4AAAA...`): a **site key** é a mais **curta** (24 caracteres) e aparece no painel como **Site Key**; a **secret key** é a
   mais **comprida** (35 caracteres) e aparece como **Secret Key**. A site key é pública; a secret key **nunca** deve ser colada em
   lugar nenhum, nem para o Claude, nem num arquivo.
4. Caminho recomendado: mande a **site key** (a mais curta, rotulada **Site Key**) para o Claude e mais nada; confira duas vezes que não é a secret. Ele grava a site key no `wrangler.jsonc` e coloca a secret key
   nos dois Workers, e você não precisa digitar a secret key em lugar nenhum.
5. Caminho alternativo (você mesmo): o script do passo 3 pede a site key e a secret key, e faz as duas coisas. A site key é digitada à
   vista: o script recusa um valor comprido demais (parece a secret key) e, antes de gravar, mostra o valor e pergunta
   `Esta é a SITE KEY pública? [s/N]` (`N` cancela sem tocar no arquivo). A secret key é pedida depois, sem aparecer na tela.

## 3. Rodar o script (o jeito mais fácil de colocar as chaves)

No terminal, dentro da pasta `app/` e já logado (`npx wrangler login`, uma vez):

```bash
cd app
bash scripts/portao-c.sh beta --only resend          # a chave do Resend no beta
bash scripts/portao-c.sh production --only resend   # a mesma chave na raiz, quando for a hora
```

O script mostra qual Worker vai mexer e pergunta `Continuar? [s/N]`. Depois pede o valor (a digitação dos segredos não aparece; a site key, que é pública, aparece), confere o formato
(`re_` no Resend, `0x` na site key; chaves de teste `1x...` e valores vazios são recusados) e manda direto para o Cloudflare. Nenhum
segredo vai para a tela, para um arquivo ou para a linha de comando.

Outros jeitos de rodar:

| Comando | O que faz |
| --- | --- |
| `bash scripts/portao-c.sh beta --only resend` | só `RESEND_API_KEY` |
| `bash scripts/portao-c.sh beta --only turnstile` | a site key (no `wrangler.jsonc`, só do ambiente escolhido) e `TURNSTILE_SECRET` |
| `bash scripts/portao-c.sh beta --only auth` | troca o `BETTER_AUTH_SECRET` (sorteado pelo script; pergunta antes de sobrescrever) |
| `bash scripts/portao-c.sh beta` | os três, na ordem Resend, Turnstile, auth |
| `bash scripts/portao-c.sh production ...` | o mesmo, para a raiz (`klick-app`, com `--env production`) |
| `... --dry-run` | ensaio: mostra o que faria, sem falar com o Cloudflare e sem pedir segredo |

Se um segredo já existe, o script avisa e pergunta `Trocar? [s/N]`. No fim, ele lista os **nomes** dos segredos do Worker (nunca os valores).

## 4. Commitar a site key

A única mudança em arquivo é a site key pública em `wrangler.jsonc`. Commite você, ou peça ao Claude (quando ele grava a site key, esse
commit já vem junto).

## Notas

- `wrangler secret put` cria uma versão nova do Worker **que já está no ar**, com o segredo novo. Ele não envia o código local. Enquanto
  `ACCOUNTS_ENABLED` for `"false"` (a raiz hoje), os segredos ficam parados e nada muda para quem usa o app.
- Cada ambiente tem o próprio `BETTER_AUTH_SECRET` (o script sorteia um diferente por ambiente). Trocar esse segredo derruba as sessões
  abertas daquele ambiente.
- O Worker recusa a chave de teste do Turnstile num domínio de verdade. Por isso a site key real precisa entrar no `wrangler.jsonc` e o
  Worker precisa ser publicado de novo, para valer. Dentro de `app/`: `pnpm run deploy:beta` (beta) e `pnpm run deploy:production` (a
  raiz), que fazem o build antes de publicar (neste computador, se o pnpm reclamar de `ERR_PNPM_IGNORED_BUILDS`, use
  `pnpm --config.verify-deps-before-run=false run deploy:beta`). Sem um build de verdade em `dist/`, o deploy é recusado.
- Na zona `ranimontagna.com`, a opção **Pseudo IPv4: Overwrite headers** deve ficar **desligada** (ela troca o IP real de quem
  acessa por um falso e quebraria o limite de pedidos de código por IP).
- Para trocar um segredo (rotação), rode o script de novo: ele pergunta antes de sobrescrever.
- Para conferir o que está colocado (só os nomes): `npx wrangler secret list` e `npx wrangler secret list --env production`.
- Variáveis de teste: `KLICK_WRANGLER_CONFIG` aponta o script para outro `wrangler.jsonc`. Só os testes usam isso; não precisa dela.
