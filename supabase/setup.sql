create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  edition_name text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'locked', 'archived')),
  lock_at timestamptz,
  group_exact_points integer not null default 3 check (group_exact_points >= 0),
  group_sign_points integer not null default 2 check (group_sign_points >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pool_members (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  display_name text,
  role text not null default 'player' check (role in ('admin', 'player')),
  joined_at timestamptz not null default now(),
  primary key (pool_id, email)
);

create index if not exists pool_members_user_id_idx on public.pool_members(user_id);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  code text,
  flag_emoji text,
  created_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.pool_groups (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  letter text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (pool_id, letter),
  unique (pool_id, sort_order)
);

create table if not exists public.pool_group_teams (
  group_id uuid not null references public.pool_groups(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (group_id, team_id),
  unique (group_id, sort_order)
);

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  group_id uuid references public.pool_groups(id) on delete set null,
  stage text not null,
  slot_key text not null,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  kickoff_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  home_score integer,
  away_score integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, slot_key),
  unique (pool_id, sort_order)
);

create table if not exists public.mini_questions (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  label text not null,
  field_type text not null default 'text' check (field_type in ('text', 'number', 'select')),
  points integer not null default 1 check (points >= 0),
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, sort_order)
);

create table if not exists public.knockout_slots (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  stage text not null,
  slot_key text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, slot_key),
  unique (pool_id, sort_order)
);

create table if not exists public.match_predictions (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, fixture_id)
);

create index if not exists match_predictions_pool_idx on public.match_predictions(pool_id, user_id);

create table if not exists public.mini_answers (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.mini_questions(id) on delete cascade,
  answer jsonb not null,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists mini_answers_pool_idx on public.mini_answers(pool_id, user_id);

create table if not exists public.knockout_predictions (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot_id uuid not null references public.knockout_slots(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot_id)
);

create index if not exists knockout_predictions_pool_idx on public.knockout_predictions(pool_id, user_id);

create table if not exists public.pool_submissions (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  section text not null check (section in ('groups', 'mini', 'knockout')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'locked')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (pool_id, user_id, section)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists pools_set_updated_at on public.pools;
create trigger pools_set_updated_at before update on public.pools
  for each row execute procedure public.set_updated_at();

drop trigger if exists fixtures_set_updated_at on public.fixtures;
create trigger fixtures_set_updated_at before update on public.fixtures
  for each row execute procedure public.set_updated_at();

drop trigger if exists mini_questions_set_updated_at on public.mini_questions;
create trigger mini_questions_set_updated_at before update on public.mini_questions
  for each row execute procedure public.set_updated_at();

drop trigger if exists knockout_slots_set_updated_at on public.knockout_slots;
create trigger knockout_slots_set_updated_at before update on public.knockout_slots
  for each row execute procedure public.set_updated_at();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_platform_admin = true
  );
$$;

create or replace function public.is_pool_admin(target_pool_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.pool_members
      where pool_id = target_pool_id
        and user_id = auth.uid()
        and role = 'admin'
    );
$$;

create or replace function public.is_pool_member(target_pool_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_pool_admin(target_pool_id)
    or exists (
      select 1
      from public.pool_members
      where pool_id = target_pool_id
        and user_id = auth.uid()
    );
$$;

create or replace function public.pool_is_open(target_pool_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.pools
    where id = target_pool_id
      and (lock_at is null or now() < lock_at)
      and status in ('draft', 'open')
  );
$$;

alter table public.profiles enable row level security;
alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.teams enable row level security;
alter table public.pool_groups enable row level security;
alter table public.pool_group_teams enable row level security;
alter table public.fixtures enable row level security;
alter table public.mini_questions enable row level security;
alter table public.knockout_slots enable row level security;
alter table public.match_predictions enable row level security;
alter table public.mini_answers enable row level security;
alter table public.knockout_predictions enable row level security;
alter table public.pool_submissions enable row level security;

drop policy if exists "profiles self or platform admin select" on public.profiles;
create policy "profiles self or platform admin select"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_platform_admin());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

drop policy if exists "pools members read" on public.pools;
create policy "pools members read"
  on public.pools
  for select
  to authenticated
  using (public.is_pool_member(id) or public.is_platform_admin());

drop policy if exists "pools admins write" on public.pools;
create policy "pools admins write"
  on public.pools
  for all
  to authenticated
  using (public.is_pool_admin(id) or public.is_platform_admin())
  with check (public.is_pool_admin(id) or public.is_platform_admin());

drop policy if exists "pool members readable" on public.pool_members;
create policy "pool members readable"
  on public.pool_members
  for select
  to authenticated
  using (public.is_pool_member(pool_id) or user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "pool admins manage members" on public.pool_members;
create policy "pool admins manage members"
  on public.pool_members
  for all
  to authenticated
  using (public.is_pool_admin(pool_id) or public.is_platform_admin())
  with check (public.is_pool_admin(pool_id) or public.is_platform_admin());

drop policy if exists "teams authenticated read" on public.teams;
create policy "teams authenticated read"
  on public.teams
  for select
  to authenticated
  using (true);

drop policy if exists "teams admins write" on public.teams;
create policy "teams admins write"
  on public.teams
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "groups pool members read" on public.pool_groups;
create policy "groups pool members read"
  on public.pool_groups
  for select
  to authenticated
  using (public.is_pool_member(pool_id) or public.is_platform_admin());

drop policy if exists "groups pool admins write" on public.pool_groups;
create policy "groups pool admins write"
  on public.pool_groups
  for all
  to authenticated
  using (public.is_pool_admin(pool_id) or public.is_platform_admin())
  with check (public.is_pool_admin(pool_id) or public.is_platform_admin());

drop policy if exists "group teams pool members read" on public.pool_group_teams;
create policy "group teams pool members read"
  on public.pool_group_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pool_groups g
      where g.id = group_id
        and (public.is_pool_member(g.pool_id) or public.is_platform_admin())
    )
  );

drop policy if exists "group teams pool admins write" on public.pool_group_teams;
create policy "group teams pool admins write"
  on public.pool_group_teams
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.pool_groups g
      where g.id = group_id
        and (public.is_pool_admin(g.pool_id) or public.is_platform_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.pool_groups g
      where g.id = group_id
        and (public.is_pool_admin(g.pool_id) or public.is_platform_admin())
    )
  );

drop policy if exists "fixtures pool members read" on public.fixtures;
create policy "fixtures pool members read"
  on public.fixtures
  for select
  to authenticated
  using (public.is_pool_member(pool_id) or public.is_platform_admin());

drop policy if exists "fixtures pool admins write" on public.fixtures;
create policy "fixtures pool admins write"
  on public.fixtures
  for all
  to authenticated
  using (public.is_pool_admin(pool_id) or public.is_platform_admin())
  with check (public.is_pool_admin(pool_id) or public.is_platform_admin());

drop policy if exists "mini questions pool members read" on public.mini_questions;
create policy "mini questions pool members read"
  on public.mini_questions
  for select
  to authenticated
  using (public.is_pool_member(pool_id) or public.is_platform_admin());

drop policy if exists "mini questions pool admins write" on public.mini_questions;
create policy "mini questions pool admins write"
  on public.mini_questions
  for all
  to authenticated
  using (public.is_pool_admin(pool_id) or public.is_platform_admin())
  with check (public.is_pool_admin(pool_id) or public.is_platform_admin());

drop policy if exists "knockout slots pool members read" on public.knockout_slots;
create policy "knockout slots pool members read"
  on public.knockout_slots
  for select
  to authenticated
  using (public.is_pool_member(pool_id) or public.is_platform_admin());

drop policy if exists "knockout slots pool admins write" on public.knockout_slots;
create policy "knockout slots pool admins write"
  on public.knockout_slots
  for all
  to authenticated
  using (public.is_pool_admin(pool_id) or public.is_platform_admin())
  with check (public.is_pool_admin(pool_id) or public.is_platform_admin());

drop policy if exists "match predictions own read" on public.match_predictions;
create policy "match predictions own read"
  on public.match_predictions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  );

drop policy if exists "match predictions own write when pool open" on public.match_predictions;
create policy "match predictions own write when pool open"
  on public.match_predictions
  for all
  to authenticated
  using (
    (user_id = auth.uid() and public.pool_is_open(pool_id))
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  )
  with check (
    (user_id = auth.uid() and public.pool_is_open(pool_id))
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  );

drop policy if exists "mini answers own read" on public.mini_answers;
create policy "mini answers own read"
  on public.mini_answers
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  );

drop policy if exists "mini answers own write when pool open" on public.mini_answers;
create policy "mini answers own write when pool open"
  on public.mini_answers
  for all
  to authenticated
  using (
    (user_id = auth.uid() and public.pool_is_open(pool_id))
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  )
  with check (
    (user_id = auth.uid() and public.pool_is_open(pool_id))
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  );

drop policy if exists "knockout predictions own read" on public.knockout_predictions;
create policy "knockout predictions own read"
  on public.knockout_predictions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  );

drop policy if exists "knockout predictions own write when pool open" on public.knockout_predictions;
create policy "knockout predictions own write when pool open"
  on public.knockout_predictions
  for all
  to authenticated
  using (
    (user_id = auth.uid() and public.pool_is_open(pool_id))
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  )
  with check (
    (user_id = auth.uid() and public.pool_is_open(pool_id))
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  );

drop policy if exists "submissions own read" on public.pool_submissions;
create policy "submissions own read"
  on public.pool_submissions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  );

drop policy if exists "submissions own write" on public.pool_submissions;
create policy "submissions own write"
  on public.pool_submissions
  for all
  to authenticated
  using (
    (user_id = auth.uid() and public.pool_is_open(pool_id))
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  )
  with check (
    (user_id = auth.uid() and public.pool_is_open(pool_id))
    or public.is_pool_admin(pool_id)
    or public.is_platform_admin()
  );

create table if not exists public.mini_results (
  question_id text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.as_rankings_cache (
  kind text primary key,
  payload jsonb not null,
  source text not null default 'as.com',
  updated_at timestamptz not null default now()
);

create table if not exists public.worldcup_results_cache (
  kind text primary key,
  payload jsonb not null,
  source text not null default 'openfootball',
  updated_at timestamptz not null default now()
);

create table if not exists public.as_live_match_cache (
  kind text primary key,
  payload jsonb not null,
  source text not null default 'as.com',
  updated_at timestamptz not null default now()
);

create table if not exists public.prediction_overrides (
  player_id text not null,
  scope text not null,
  entity_id text not null,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (player_id, scope, entity_id)
);

alter table public.mini_results enable row level security;
alter table public.as_rankings_cache enable row level security;
alter table public.worldcup_results_cache enable row level security;
alter table public.as_live_match_cache enable row level security;
alter table public.prediction_overrides enable row level security;

revoke all on table public.mini_results from anon, authenticated;
grant select on table public.mini_results to anon, authenticated;
grant insert, update, delete on table public.mini_results to authenticated;

revoke all on table public.as_rankings_cache from anon, authenticated;
grant select on table public.as_rankings_cache to anon, authenticated;

revoke all on table public.worldcup_results_cache from anon, authenticated;
grant select on table public.worldcup_results_cache to anon, authenticated;

revoke all on table public.as_live_match_cache from anon, authenticated;
grant select on table public.as_live_match_cache to anon, authenticated;

revoke all on table public.prediction_overrides from anon, authenticated;
grant select on table public.prediction_overrides to anon, authenticated;
grant insert, update, delete on table public.prediction_overrides to authenticated;

drop policy if exists "Mini results are public" on public.mini_results;
create policy "Mini results are public"
  on public.mini_results
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated admins can insert mini results" on public.mini_results;
create policy "Authenticated admins can insert mini results"
  on public.mini_results
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated admins can update mini results" on public.mini_results;
create policy "Authenticated admins can update mini results"
  on public.mini_results
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated admins can delete mini results" on public.mini_results;
create policy "Authenticated admins can delete mini results"
  on public.mini_results
  for delete
  to authenticated
  using (true);

drop policy if exists "AS rankings cache is public" on public.as_rankings_cache;
create policy "AS rankings cache is public"
  on public.as_rankings_cache
  for select
  to anon, authenticated
  using (true);

drop policy if exists "World Cup results cache is public" on public.worldcup_results_cache;
create policy "World Cup results cache is public"
  on public.worldcup_results_cache
  for select
  to anon, authenticated
  using (true);

drop policy if exists "AS live match cache is public" on public.as_live_match_cache;
create policy "AS live match cache is public"
  on public.as_live_match_cache
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Prediction overrides are public" on public.prediction_overrides;
create policy "Prediction overrides are public"
  on public.prediction_overrides
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated admins can insert prediction overrides" on public.prediction_overrides;
create policy "Authenticated admins can insert prediction overrides"
  on public.prediction_overrides
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated admins can update prediction overrides" on public.prediction_overrides;
create policy "Authenticated admins can update prediction overrides"
  on public.prediction_overrides
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated admins can delete prediction overrides" on public.prediction_overrides;
create policy "Authenticated admins can delete prediction overrides"
  on public.prediction_overrides
  for delete
  to authenticated
  using (true);
