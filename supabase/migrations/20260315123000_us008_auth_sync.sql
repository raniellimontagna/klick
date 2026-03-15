-- US-008: Account + cloud synchronization foundation

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  puzzle_type text not null check (puzzle_type in ('2x2', '3x3', '4x4', '5x5', 'pyraminx', 'megaminx', 'skewb', 'square1')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.solves (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  time_ms integer not null check (time_ms >= 0),
  penalty text not null check (penalty in ('NONE', '+2', 'DNF')),
  effective_ms double precision,
  scramble text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  inspection_duration integer not null default 15 check (inspection_duration between 5 and 30),
  sounds_enabled boolean not null default false,
  auto_inspection_penalty boolean not null default true,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  language text not null default 'pt-BR' check (language in ('pt-BR', 'en-US', 'es-ES')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_sessions_user_updated_at
  on public.sessions(user_id, updated_at desc);

create index if not exists idx_solves_user_updated_at
  on public.solves(user_id, updated_at desc);

create index if not exists idx_solves_session_updated_at
  on public.solves(session_id, updated_at desc);

-- Triggers for last-write-wins sync strategy based on updated_at

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_sessions_updated_at on public.sessions;
create trigger set_sessions_updated_at
before update on public.sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_solves_updated_at on public.solves;
create trigger set_solves_updated_at
before update on public.solves
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.solves enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
  on public.profiles
  for delete
  using (auth.uid() = user_id);

drop policy if exists sessions_select_own on public.sessions;
create policy sessions_select_own
  on public.sessions
  for select
  using (auth.uid() = user_id);

drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own
  on public.sessions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own
  on public.sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own
  on public.sessions
  for delete
  using (auth.uid() = user_id);

drop policy if exists solves_select_own on public.solves;
create policy solves_select_own
  on public.solves
  for select
  using (auth.uid() = user_id);

drop policy if exists solves_insert_own on public.solves;
create policy solves_insert_own
  on public.solves
  for insert
  with check (auth.uid() = user_id);

drop policy if exists solves_update_own on public.solves;
create policy solves_update_own
  on public.solves
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists solves_delete_own on public.solves;
create policy solves_delete_own
  on public.solves
  for delete
  using (auth.uid() = user_id);

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own
  on public.user_settings
  for select
  using (auth.uid() = user_id);

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own
  on public.user_settings
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own
  on public.user_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_settings_delete_own on public.user_settings;
create policy user_settings_delete_own
  on public.user_settings
  for delete
  using (auth.uid() = user_id);

commit;
