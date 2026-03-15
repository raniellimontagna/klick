# Supabase Migrations (Klick)

Guia operacional para mudanças de schema/auth/sync do Supabase no projeto.

## Pré-requisitos

- Supabase CLI instalado (`npm i -g supabase` ou via pacote local).
- Projeto vinculado (`supabase link --project-ref <project-ref>`).
- Variáveis locais definidas (`SUPABASE_ACCESS_TOKEN`, quando necessário).

## Estrutura

- Migrations SQL: `supabase/migrations/`
- Migration base da US-008: `supabase/migrations/20260315123000_us008_auth_sync.sql`

## Fluxo recomendado

1. Criar migration:
```bash
supabase migration new <nome_da_migration>
```

2. Editar o SQL gerado em `supabase/migrations/*.sql`.

3. Aplicar localmente (stack local):
```bash
supabase db reset
```

4. Validar políticas e tabelas:
```bash
supabase db lint
```

5. Publicar no projeto remoto:
```bash
supabase db push
```

## Regras obrigatórias

- Toda mudança estrutural deve virar migration versionada.
- Nunca alterar schema apenas via dashboard.
- Tabelas com dados de usuário devem usar RLS com escopo `auth.uid()`.
- Estratégia de conflito da sincronização: **last-write-wins** por `updated_at`.

## Checklist rápido para stories de backend/sync

- [ ] Migration criada/atualizada em `supabase/migrations`
- [ ] RLS habilitado nas novas tabelas
- [ ] Policies de `SELECT/INSERT/UPDATE/DELETE` por dono (`auth.uid()`)
- [ ] `supabase db reset` e `supabase db push` executados
- [ ] Fluxo documentado no `scripts/ralph/progress.txt`
