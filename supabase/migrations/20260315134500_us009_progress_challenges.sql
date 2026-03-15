-- US-009: Progression engine and daily challenges

begin;

create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  timezone text not null,
  challenge_type text not null check (challenge_type in ('solve_count', 'clean_streak', 'ao5_target')),
  target_value integer not null check (target_value > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, challenge_date, challenge_type)
);

create table if not exists public.challenge_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  challenge_type text not null check (challenge_type in ('solve_count', 'clean_streak', 'ao5_target')),
  progress_value integer not null default 0 check (progress_value >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, challenge_date, challenge_type)
);

create index if not exists idx_daily_challenges_user_date
  on public.daily_challenges(user_id, challenge_date desc);

create index if not exists idx_daily_challenges_user_updated
  on public.daily_challenges(user_id, updated_at desc);

create index if not exists idx_challenge_completions_user_date
  on public.challenge_completions(user_id, challenge_date desc);

create index if not exists idx_challenge_completions_user_updated
  on public.challenge_completions(user_id, updated_at desc);

drop trigger if exists set_daily_challenges_updated_at on public.daily_challenges;
create trigger set_daily_challenges_updated_at
before update on public.daily_challenges
for each row
execute function public.set_updated_at();

drop trigger if exists set_challenge_completions_updated_at on public.challenge_completions;
create trigger set_challenge_completions_updated_at
before update on public.challenge_completions
for each row
execute function public.set_updated_at();

alter table public.daily_challenges enable row level security;
alter table public.challenge_completions enable row level security;

drop policy if exists daily_challenges_select_own on public.daily_challenges;
create policy daily_challenges_select_own
  on public.daily_challenges
  for select
  using (auth.uid() = user_id);

drop policy if exists daily_challenges_insert_own on public.daily_challenges;
create policy daily_challenges_insert_own
  on public.daily_challenges
  for insert
  with check (auth.uid() = user_id);

drop policy if exists daily_challenges_update_own on public.daily_challenges;
create policy daily_challenges_update_own
  on public.daily_challenges
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists daily_challenges_delete_own on public.daily_challenges;
create policy daily_challenges_delete_own
  on public.daily_challenges
  for delete
  using (auth.uid() = user_id);

drop policy if exists challenge_completions_select_own on public.challenge_completions;
create policy challenge_completions_select_own
  on public.challenge_completions
  for select
  using (auth.uid() = user_id);

drop policy if exists challenge_completions_insert_own on public.challenge_completions;
create policy challenge_completions_insert_own
  on public.challenge_completions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists challenge_completions_update_own on public.challenge_completions;
create policy challenge_completions_update_own
  on public.challenge_completions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists challenge_completions_delete_own on public.challenge_completions;
create policy challenge_completions_delete_own
  on public.challenge_completions
  for delete
  using (auth.uid() = user_id);

commit;
