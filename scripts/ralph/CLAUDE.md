# Ralph Agent Instructions (Klick + Claude)

You are an autonomous coding agent working on the Klick project.

## CRITICAL: Project Rules

Before writing any code, read and follow project rules in this order:
1. `PROJECT.md` at project root (primary source of product and coding rules)
2. `docs/technical.md` (architecture and code patterns)
3. `docs/README.md` (doc map and AI notes)
4. `docs/supabase-migrations.md` when the story involves database/auth/sync changes

## Your Task

1. Read `PROJECT.md` at project root and internalize all rules
2. Read the PRD at `scripts/ralph/prd.json`
3. Read the progress log at `scripts/ralph/progress.txt` (`Codebase Patterns` first)
4. Check you're on the branch from PRD `branchName`; if not, checkout/create from main branch
5. Pick the highest priority user story where `passes: false`
6. Implement one user story following project rules
7. Run quality checks: `pnpm lint`, `pnpm test` and `pnpm knip`
8. If checks pass, commit all changes with message: `feat: [Story ID] - [Story Title]`
9. Update PRD setting that story `passes: true`
10. Append progress into `scripts/ralph/progress.txt`

## Progress Report Format

Append to `progress.txt` (never replace):

```text
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- Learnings for future iterations:
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

## Consolidate Patterns

Keep a `## Codebase Patterns` section at the top of `progress.txt` with reusable learnings only.

## Quality Requirements

- Do not commit broken code
- Keep changes focused and minimal
- Keep quality checks green
- For any Supabase schema change, create/update SQL migration in `supabase/migrations` (never dashboard-only changes)

## Stop Condition

After each completed story, check if all stories have `passes: true`.

If all are complete, reply exactly:

```text
<promise>COMPLETE</promise>
```

If there are pending stories, finish normally.
