# Supabase Migrations Guide

Este projeto deve controlar qualquer alteração de banco via migrations versionadas.

## Regras obrigatórias

- Nunca alterar schema apenas pelo dashboard do Supabase.
- Toda mudança estrutural deve gerar SQL em `supabase/migrations`.
- Commits de backend devem incluir a migration correspondente.
- RLS deve ser aplicado junto da criação/alteração de tabelas relevantes.

## Estrutura esperada

```text
supabase/
  migrations/
    20260313170000_init_schema.sql
```

## Comandos úteis (Supabase CLI)

Pré-requisito: Supabase CLI instalado e projeto vinculado.

```bash
# iniciar stack local
pnpm supabase:start

# status da stack local
pnpm supabase:status

# criar nova migration
pnpm supabase:migration:new -- add_friends_and_leaderboards

# aplicar migrations locais no banco local
pnpm supabase:db:push

# resetar banco local e reaplicar migrations
pnpm supabase:db:reset

# puxar mudanças remotas (quando necessário)
pnpm supabase:db:pull

# parar stack local
pnpm supabase:stop
```

## Convenções para migrations

- Nomear migrations com intenção clara (`add_daily_challenges_table`).
- Manter SQL idempotente quando possível.
- Criar políticas RLS na mesma migration da tabela.
- Em PRs, descrever impacto de dados e estratégia de rollout.
