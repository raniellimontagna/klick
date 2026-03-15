-- US-010: Basic social sharing with privacy controls

begin;

create table if not exists public.share_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sharing_enabled boolean not null default false,
  profile_visibility text not null default 'private' check (profile_visibility in ('private', 'public')),
  share_single boolean not null default true,
  share_averages boolean not null default true,
  share_progress boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null,
  visibility text not null default 'public' check (visibility in ('private', 'public')),
  payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_share_links_user_updated_at
  on public.share_links(user_id, updated_at desc);

create index if not exists idx_share_links_slug_active
  on public.share_links(slug, is_active);

drop trigger if exists set_share_preferences_updated_at on public.share_preferences;
create trigger set_share_preferences_updated_at
before update on public.share_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists set_share_links_updated_at on public.share_links;
create trigger set_share_links_updated_at
before update on public.share_links
for each row
execute function public.set_updated_at();

alter table public.share_preferences enable row level security;
alter table public.share_links enable row level security;

drop policy if exists share_preferences_select_own on public.share_preferences;
create policy share_preferences_select_own
  on public.share_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists share_preferences_insert_own on public.share_preferences;
create policy share_preferences_insert_own
  on public.share_preferences
  for insert
  with check (auth.uid() = user_id);

drop policy if exists share_preferences_update_own on public.share_preferences;
create policy share_preferences_update_own
  on public.share_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists share_preferences_delete_own on public.share_preferences;
create policy share_preferences_delete_own
  on public.share_preferences
  for delete
  using (auth.uid() = user_id);

drop policy if exists share_links_select_public_or_owner on public.share_links;
create policy share_links_select_public_or_owner
  on public.share_links
  for select
  using (
    auth.uid() = user_id
    or (is_active = true and visibility = 'public')
  );

drop policy if exists share_links_insert_own on public.share_links;
create policy share_links_insert_own
  on public.share_links
  for insert
  with check (auth.uid() = user_id);

drop policy if exists share_links_update_own on public.share_links;
create policy share_links_update_own
  on public.share_links
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists share_links_delete_own on public.share_links;
create policy share_links_delete_own
  on public.share_links
  for delete
  using (auth.uid() = user_id);

commit;
