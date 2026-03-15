-- US-014: Friends invitations and leaderboard social layer with privacy controls

begin;

alter table public.share_preferences
  add column if not exists ranking_visibility text not null default 'friends';

alter table public.share_preferences
  drop constraint if exists share_preferences_profile_visibility_check;

alter table public.share_preferences
  add constraint share_preferences_profile_visibility_check
  check (profile_visibility in ('private', 'friends', 'public'));

alter table public.share_preferences
  drop constraint if exists share_preferences_ranking_visibility_check;

alter table public.share_preferences
  add constraint share_preferences_ranking_visibility_check
  check (ranking_visibility in ('private', 'friends', 'public'));

create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (sender_id <> receiver_id)
);

create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (user_id <> friend_id),
  check (user_id < friend_id),
  unique(user_id, friend_id)
);

create table if not exists public.leaderboards (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(period_type, period_key)
);

create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  leaderboard_id uuid not null references public.leaderboards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  best_single_ms integer check (best_single_ms is null or best_single_ms >= 0),
  best_ao5_ms double precision check (best_ao5_ms is null or best_ao5_ms >= 0),
  best_ao12_ms double precision check (best_ao12_ms is null or best_ao12_ms >= 0),
  consistency_score double precision check (consistency_score is null or consistency_score >= 0),
  solve_count integer not null default 0 check (solve_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(leaderboard_id, user_id)
);

create index if not exists idx_friend_invites_receiver_status
  on public.friend_invites(receiver_id, status, updated_at desc);

create index if not exists idx_friend_invites_sender_status
  on public.friend_invites(sender_id, status, updated_at desc);

create unique index if not exists idx_friend_invites_pending_pair
  on public.friend_invites(least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';

create index if not exists idx_friends_user_id on public.friends(user_id);
create index if not exists idx_friends_friend_id on public.friends(friend_id);

create index if not exists idx_leaderboard_entries_leaderboard_rank
  on public.leaderboard_entries(leaderboard_id, best_single_ms, best_ao5_ms, best_ao12_ms, consistency_score);

create index if not exists idx_leaderboard_entries_user_id
  on public.leaderboard_entries(user_id, updated_at desc);

drop trigger if exists set_friend_invites_updated_at on public.friend_invites;
create trigger set_friend_invites_updated_at
before update on public.friend_invites
for each row
execute function public.set_updated_at();

drop trigger if exists set_friends_updated_at on public.friends;
create trigger set_friends_updated_at
before update on public.friends
for each row
execute function public.set_updated_at();

drop trigger if exists set_leaderboards_updated_at on public.leaderboards;
create trigger set_leaderboards_updated_at
before update on public.leaderboards
for each row
execute function public.set_updated_at();

drop trigger if exists set_leaderboard_entries_updated_at on public.leaderboard_entries;
create trigger set_leaderboard_entries_updated_at
before update on public.leaderboard_entries
for each row
execute function public.set_updated_at();

alter table public.friend_invites enable row level security;
alter table public.friends enable row level security;
alter table public.leaderboards enable row level security;
alter table public.leaderboard_entries enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_with_visibility on public.profiles;
create policy profiles_select_with_visibility
  on public.profiles
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.share_preferences prefs
      where prefs.user_id = profiles.user_id
        and prefs.sharing_enabled = true
        and (
          prefs.profile_visibility = 'public'
          or (
            prefs.profile_visibility = 'friends'
            and exists (
              select 1
              from public.friends friendship
              where (
                friendship.user_id = auth.uid()
                and friendship.friend_id = profiles.user_id
              )
              or (
                friendship.friend_id = auth.uid()
                and friendship.user_id = profiles.user_id
              )
            )
          )
        )
    )
  );

drop policy if exists friend_invites_select_participants on public.friend_invites;
create policy friend_invites_select_participants
  on public.friend_invites
  for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists friend_invites_insert_sender on public.friend_invites;
create policy friend_invites_insert_sender
  on public.friend_invites
  for insert
  with check (auth.uid() = sender_id and sender_id <> receiver_id);

drop policy if exists friend_invites_update_participants on public.friend_invites;
create policy friend_invites_update_participants
  on public.friend_invites
  for update
  using (auth.uid() = sender_id or auth.uid() = receiver_id)
  with check (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists friend_invites_delete_participants on public.friend_invites;
create policy friend_invites_delete_participants
  on public.friend_invites
  for delete
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists friends_select_participants on public.friends;
create policy friends_select_participants
  on public.friends
  for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists friends_insert_participants on public.friends;
create policy friends_insert_participants
  on public.friends
  for insert
  with check ((auth.uid() = user_id or auth.uid() = friend_id) and user_id < friend_id);

drop policy if exists friends_update_participants on public.friends;
create policy friends_update_participants
  on public.friends
  for update
  using (auth.uid() = user_id or auth.uid() = friend_id)
  with check ((auth.uid() = user_id or auth.uid() = friend_id) and user_id < friend_id);

drop policy if exists friends_delete_participants on public.friends;
create policy friends_delete_participants
  on public.friends
  for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists leaderboards_select_authenticated on public.leaderboards;
create policy leaderboards_select_authenticated
  on public.leaderboards
  for select
  using (auth.uid() is not null);

drop policy if exists leaderboards_insert_authenticated on public.leaderboards;
create policy leaderboards_insert_authenticated
  on public.leaderboards
  for insert
  with check (auth.uid() is not null);

drop policy if exists leaderboards_update_authenticated on public.leaderboards;
create policy leaderboards_update_authenticated
  on public.leaderboards
  for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists leaderboards_delete_authenticated on public.leaderboards;
create policy leaderboards_delete_authenticated
  on public.leaderboards
  for delete
  using (auth.uid() is not null);

drop policy if exists leaderboard_entries_select_visibility on public.leaderboard_entries;
create policy leaderboard_entries_select_visibility
  on public.leaderboard_entries
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.share_preferences prefs
      where prefs.user_id = leaderboard_entries.user_id
        and prefs.sharing_enabled = true
        and (
          prefs.ranking_visibility = 'public'
          or (
            prefs.ranking_visibility = 'friends'
            and exists (
              select 1
              from public.friends friendship
              where (
                friendship.user_id = auth.uid()
                and friendship.friend_id = leaderboard_entries.user_id
              )
              or (
                friendship.friend_id = auth.uid()
                and friendship.user_id = leaderboard_entries.user_id
              )
            )
          )
        )
    )
  );

drop policy if exists leaderboard_entries_insert_own on public.leaderboard_entries;
create policy leaderboard_entries_insert_own
  on public.leaderboard_entries
  for insert
  with check (auth.uid() = user_id);

drop policy if exists leaderboard_entries_update_own on public.leaderboard_entries;
create policy leaderboard_entries_update_own
  on public.leaderboard_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists leaderboard_entries_delete_own on public.leaderboard_entries;
create policy leaderboard_entries_delete_own
  on public.leaderboard_entries
  for delete
  using (auth.uid() = user_id);

commit;
