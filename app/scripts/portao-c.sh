#!/usr/bin/env bash
# Portão C: coloca no Worker os segredos que faltam (Resend, Turnstile, BETTER_AUTH_SECRET) e a site key do Turnstile no wrangler.jsonc.
# Roda no terminal do dono, de dentro de app/. O guia está em ../docs/portao-c.md.
#
#   bash scripts/portao-c.sh beta|production [--only resend|turnstile|auth] [--dry-run]
#
# Nenhum segredo aparece na tela, no argv de nenhum comando ou num arquivo: cada valor vai pelo stdin de `wrangler secret put`.
# KLICK_WRANGLER_CONFIG: caminho do wrangler.jsonc a editar (padrão: ./wrangler.jsonc). Existe só para os testes.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
uso: bash scripts/portao-c.sh <beta|production> [--only <resend|turnstile|auth>] [--dry-run]

  beta | production   o ambiente (beta: klick-app-beta; production: klick-app, a raiz)
  --only resend       só a chave de envio de e-mail (RESEND_API_KEY)
  --only turnstile    só o Turnstile (site key no wrangler.jsonc e TURNSTILE_SECRET)
  --only auth         só o BETTER_AUTH_SECRET (já está colocado; use para trocar)
  --dry-run           ensaio: mostra o que faria, sem chamar o Cloudflare nem pedir segredo
EOF
}

TARGET=""
ONLY=""
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    beta | production)
      [ -z "$TARGET" ] || { usage; exit 2; }
      TARGET="$1"
      ;;
    --only)
      [ $# -ge 2 ] || { usage; exit 2; }
      ONLY="$2"
      shift
      case "$ONLY" in resend | turnstile | auth) ;; *) usage; exit 2 ;; esac
      ;;
    --dry-run) DRY=1 ;;
    *) usage; exit 2 ;;
  esac
  shift
done
[ -n "$TARGET" ] || { usage; exit 2; }

CONFIG="${KLICK_WRANGLER_CONFIG:-wrangler.jsonc}"
if [ ! -f "$CONFIG" ]; then
  echo "Não achei o $CONFIG aqui. Rode de dentro da pasta app/: cd app && bash scripts/portao-c.sh $TARGET" >&2
  exit 1
fi

if [ "$TARGET" = production ]; then
  FLAG=(--env production)
  WORKER="klick-app"
  HOST="klick.ranimontagna.com"
else
  FLAG=()
  WORKER="klick-app-beta"
  HOST="beta.klick.ranimontagna.com"
fi
# O ${FLAG[@]+...} evita o erro de array vazio do bash 3.2 (macOS) com `set -u`.
flag_text() { if [ "${#FLAG[@]}" -gt 0 ]; then printf ' %s' "${FLAG[@]}"; fi; }

step_on() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }

ask_yes() {
  local answer=""
  printf '%s [s/N] ' "$1"
  read -r answer || answer=""
  case "$answer" in s | S | sim | Sim | SIM) return 0 ;; *) return 1 ;; esac
}

read_line() { # $1 = texto da pergunta; devolve em REPLY_VALUE (público: a site key)
  printf '%s ' "$1"
  IFS= read -r REPLY_VALUE || { echo >&2; echo "Entrada encerrada; nada foi feito neste passo." >&2; exit 1; }
}

# --- a site key, no wrangler.jsonc ---------------------------------------------------------------------------------------------------
# O wrangler.jsonc tem comentários; por isso a troca é textual. Procura exatamente uma ocorrência de "TURNSTILE_SITE_KEY" no bloco do
# ambiente (antes de "env": o beta; depois dele: a produção) e falha em voz alta se não achar uma só. Nunca toca o outro ambiente.
site_key_tool() { # $1 = get|set, $2 = arquivo, $3 = ambiente, $4 = chave nova (set)
  node -e '
    const fs = require("node:fs");
    const [mode, file, target, value] = process.argv.slice(1);
    const text = fs.readFileSync(file, "utf8");
    const env = text.match(/^ {2}"env"\s*:/m);
    if (!env) { console.error("Não achei o bloco \"env\" no wrangler.jsonc."); process.exit(3); }
    const start = target === "production" ? env.index : 0;
    const end = target === "production" ? text.length : env.index;
    const region = text.slice(start, end);
    const vars = region.search(/"vars"\s*:\s*\{/);
    const re = /"TURNSTILE_SITE_KEY"\s*:\s*"([^"]*)"/g;
    const found = vars < 0 ? [] : [...region.slice(vars).matchAll(re)];
    if (found.length !== 1) { console.error("Esperava exatamente um TURNSTILE_SITE_KEY nas vars de " + target + " e achei " + found.length + "."); process.exit(3); }
    if (mode === "get") { console.log(found[0][1]); process.exit(0); }
    const at = start + vars + found[0].index;
    const line = found[0][0].replace(/"[^"]*"$/, JSON.stringify(value));
    fs.writeFileSync(file, text.slice(0, at) + line + text.slice(at + found[0][0].length));
    console.log("  " + line);
  ' "$@"
}

valid_site_key() { [[ "$1" =~ ^0x[0-9A-Za-z_-]+$ ]]; }
# A site key do Turnstile tem 24 caracteres; a secret key, 35, e as duas começam com 0x4AAAA. Mais de 30 é, quase certo, a SECRET.
looks_like_secret() { [ "${#1}" -gt 30 ]; }

# --- o resumo e a confirmação ----------------------------------------------------------------------------------------------------------
echo "Portão C: ${TARGET} (Worker ${WORKER}, ${HOST})"
[ -z "$ONLY" ] || echo "Só o passo: ${ONLY}"
[ "$DRY" -eq 0 ] || echo "ENSAIO (--dry-run): nada é enviado ao Cloudflare e nenhum segredo é pedido."
if step_on auth && [ "$DRY" -eq 0 ] && ! command -v openssl >/dev/null 2>&1; then
  echo "Não achei o openssl, que sorteia o BETTER_AUTH_SECRET. Instale-o (no macOS ele já vem; confira o PATH) e rode de novo." >&2
  exit 1
fi
ask_yes "Continuar?" || { echo "Cancelado."; exit 1; }

EXISTING=""
if [ "$DRY" -eq 0 ]; then
  WHOAMI="$(npx wrangler whoami </dev/null 2>&1)" || { echo "O wrangler não está logado: rode  npx wrangler login  e tente de novo." >&2; exit 1; }
  if printf '%s' "$WHOAMI" | grep -qi "not authenticated"; then
    echo "O wrangler não está logado: rode  npx wrangler login  e tente de novo." >&2
    exit 1
  fi
  LIST="$(npx wrangler secret list ${FLAG[@]+"${FLAG[@]}"} </dev/null)" || { echo "Não consegui listar os segredos de ${WORKER}." >&2; exit 1; }
  EXISTING="$(printf '%s' "$LIST" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const a = s.indexOf("["), b = s.lastIndexOf("]");
      try { for (const x of JSON.parse(s.slice(a, b + 1))) console.log(x.name); } catch { process.exit(1); }
    });')" || { echo "Não entendi a lista de segredos de ${WORKER}." >&2; exit 1; }
fi

already_set() { printf '%s\n' "$EXISTING" | grep -qx "$1"; }

# Pergunta antes de trocar um segredo que já existe; devolve 1 se não é para mexer.
should_set() {
  if already_set "$1"; then ask_yes "$1 já existe em ${WORKER}. Trocar?" || { echo "  $1: mantido."; return 1; }; fi
  return 0
}

# Lê um segredo sem eco, recusa vazio (e, se $2 for um prefixo, o que não começa com ele) e o manda pelo stdin do wrangler.
put_typed_secret() { # $1 = nome, $2 = prefixo exigido (ou vazio), $3 = onde achar o valor (texto da pergunta)
  local name="$1" prefix="$2" prompt="$3" value=""
  if [ "$DRY" -eq 1 ]; then
    echo "  <segredo> | npx wrangler secret put ${name}$(flag_text)"
    return 0
  fi
  should_set "$name" || return 0
  while true; do
    printf '%s ' "$prompt"
    IFS= read -rs value || { echo >&2; echo "Entrada encerrada; ${name} não foi colocado." >&2; unset value; exit 1; }
    echo
    if [ -z "$value" ]; then echo "  Vazio não vale. Cole o valor de novo." >&2; continue; fi
    if [ -n "$prefix" ] && [ "${value#"$prefix"}" = "$value" ]; then
      echo "  ${name} deveria começar com ${prefix}. Confira a chave e cole de novo." >&2
      continue
    fi
    break
  done
  printf '%s' "$value" | npx wrangler secret put "$name" ${FLAG[@]+"${FLAG[@]}"} >/dev/null
  unset value
  echo "  ${name}: colocado."
}

# --- 1. Resend -------------------------------------------------------------------------------------------------------------------------
if step_on resend; then
  echo
  echo "Resend: a chave de envio (Sending access, só para klick.ranimontagna.com)."
  put_typed_secret RESEND_API_KEY "re_" "Cole a RESEND_API_KEY (não aparece na tela):"
fi

# --- 2. Turnstile ----------------------------------------------------------------------------------------------------------------------
if step_on turnstile; then
  echo
  echo "Turnstile: a site key (pública) e a secret key do widget."
  WORKING_CONFIG="$CONFIG"
  if [ "$DRY" -eq 1 ]; then
    WORKING_CONFIG="$(mktemp)"
    trap 'rm -f "$WORKING_CONFIG"' EXIT
    cp "$CONFIG" "$WORKING_CONFIG"
  fi
  CURRENT="$(site_key_tool get "$WORKING_CONFIG" "$TARGET")"
  CHANGE_KEY=1
  if valid_site_key "$CURRENT"; then
    echo "  A site key de ${TARGET} já é ${CURRENT}."
    ask_yes "  Trocar?" || CHANGE_KEY=0
  fi
  if [ "$CHANGE_KEY" -eq 1 ]; then
    while true; do
      read_line "Cole a SITE KEY do widget (a pública, começa com 0x):"
      if valid_site_key "$REPLY_VALUE"; then
        if looks_like_secret "$REPLY_VALUE"; then
          echo "  Esse valor é comprido demais: isso parece a SECRET key — cole a site key, a mais curta. (Não repita a secret em lugar nenhum.)" >&2
        elif ask_yes "  Vai para o wrangler.jsonc, que vai ao git público: ${REPLY_VALUE}. Esta é a SITE KEY pública?"; then
          break
        else
          echo "Cancelado: o ${CONFIG} não foi tocado." >&2
          exit 1
        fi
      else
        echo "  Isso não parece uma site key do Turnstile (ela começa com 0x; as chaves de teste 1x... não valem). Tente de novo." >&2
      fi
    done
    if [ "$DRY" -eq 1 ]; then echo "  Ensaio: numa cópia, só a site key de ${TARGET} mudaria assim:"; else echo "  Gravando em ${CONFIG} (só ${TARGET}):"; fi
    site_key_tool set "$WORKING_CONFIG" "$TARGET" "$REPLY_VALUE"
    if [ "$DRY" -eq 1 ]; then
      echo "  Diferença que ficaria no wrangler.jsonc:"
      diff -u "$CONFIG" "$WORKING_CONFIG" | sed 's/^/    /' || true
    fi
  fi
  put_typed_secret TURNSTILE_SECRET "" "Cole a TURNSTILE_SECRET (a secret key do widget; não aparece na tela):"
fi

# --- 3. BETTER_AUTH_SECRET (já colocado; aqui só para trocar) --------------------------------------------------------------------------
if step_on auth; then
  echo
  echo "BETTER_AUTH_SECRET: sorteado aqui, nunca digitado nem mostrado (já está colocado; use só para trocar)."
  if [ "$DRY" -eq 1 ]; then
    echo "  openssl rand -base64 32 | tr -d '\\n' | npx wrangler secret put BETTER_AUTH_SECRET$(flag_text)"
  elif should_set BETTER_AUTH_SECRET; then
    openssl rand -base64 32 | tr -d '\n' | npx wrangler secret put BETTER_AUTH_SECRET ${FLAG[@]+"${FLAG[@]}"} >/dev/null
    echo "  BETTER_AUTH_SECRET: colocado. Trocar o segredo derruba as sessões abertas deste ambiente."
  fi
fi

# --- o fim -----------------------------------------------------------------------------------------------------------------------------
echo
if [ "$DRY" -eq 1 ]; then
  echo "Ensaio terminado: nada foi enviado e o ${CONFIG} não mudou."
  exit 0
fi
echo "Segredos de ${WORKER} agora (só os nomes):"
if FINAL="$(npx wrangler secret list ${FLAG[@]+"${FLAG[@]}"} </dev/null)"; then
  printf '%s' "$FINAL" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const a = s.indexOf("["), b = s.lastIndexOf("]");
      try { for (const x of JSON.parse(s.slice(a, b + 1))) console.log("  - " + x.name); } catch { console.log("  (não consegui ler a lista)"); }
    });'
else
  echo "  (não consegui listar agora; confira com: npx wrangler secret list$(flag_text))"
fi
if step_on turnstile; then
  echo
  echo "Falta commitar o wrangler.jsonc: a site key é pública, pode ir para o git."
fi
