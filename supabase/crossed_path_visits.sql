-- Crossed Paths v2: scalable backend using "visits" + on-demand queries.
-- Store minimal visit records (user_id + place_key_hash + timestamp) and compute crossed paths on read.
-- Retention: 7 days (app queries last 7 days; add scheduled cleanup/partitioning later if desired).

create table if not exists public.crossed_path_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_key text not null,                 -- hashed place fingerprint (no raw lat/long stored)
  day_key date not null,
  seen_at timestamptz not null default now(),
  address_label text                      -- optional redacted label (venue name or "Street (100 block)")
);

-- One row per user per place per day (keeps writes cheap; update seen_at when revisiting)
create unique index if not exists crossed_path_visits_unique
  on public.crossed_path_visits (user_id, day_key, place_key);

-- Fast lookup by place/day
create index if not exists crossed_path_visits_place_day
  on public.crossed_path_visits (day_key, place_key, seen_at desc, user_id);

alter table public.crossed_path_visits enable row level security;

drop policy if exists "Crossed path visits are viewable by owner" on public.crossed_path_visits;
create policy "Crossed path visits are viewable by owner"
  on public.crossed_path_visits for select
  using (auth.uid() = user_id);

drop policy if exists "Users can upsert their own crossed path visits" on public.crossed_path_visits;
create policy "Users can upsert their own crossed path visits"
  on public.crossed_path_visits for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own crossed path visits" on public.crossed_path_visits;
create policy "Users can update their own crossed path visits"
  on public.crossed_path_visits for update
  using (auth.uid() = user_id);

-- Helper: compute "common interest token count" mirroring app logic (max 4).
-- my_interests and their_interests are jsonb of { category: [tags...] }.
create or replace function public.cp_match_count(my_interests jsonb, their_interests jsonb)
returns integer
language plpgsql
stable
as $$
declare
  cat text;
  tokens integer := 0;
  my_tags text[];
  their_tags text[];
  overlap_count integer;
begin
  if my_interests is null or their_interests is null then
    return 0;
  end if;

  for cat in
    select key from jsonb_object_keys(my_interests) as key
  loop
    if their_interests ? cat then
      select coalesce(array_agg(trim(lower(value))), array[]::text[])
        into my_tags
      from jsonb_array_elements_text(coalesce(my_interests->cat, '[]'::jsonb)) as value;

      select coalesce(array_agg(trim(lower(value))), array[]::text[])
        into their_tags
      from jsonb_array_elements_text(coalesce(their_interests->cat, '[]'::jsonb)) as value;

      select coalesce(count(*), 0)
        into overlap_count
      from unnest(their_tags) t
      where t = any(my_tags);

      if overlap_count > 0 then
        tokens := tokens + least(2, overlap_count);
      else
        tokens := tokens + 1;
      end if;
    end if;
    if tokens >= 4 then
      return 4;
    end if;
  end loop;

  return least(tokens, 4);
end $$;

create or replace function public.cp_match_percent(my_interests jsonb, their_interests jsonb)
returns integer
language sql
stable
as $$
  select case public.cp_match_count(my_interests, their_interests)
    when 4 then 98
    when 3 then 95
    when 2 then 80
    when 1 then 60
    else 0
  end;
$$;

-- List groups (place/day) for current user for last 7 days.
create or replace function public.get_my_crossed_paths_groups(p_since timestamptz default (now() - interval '7 days'))
returns table (
  day_key date,
  place_key text,
  address_label text,
  last_seen timestamptz
)
language sql
security definer
set search_path = public
as $$
  -- Respect user settings:
  -- - only when proxy is on
  -- - only when crossed paths saving is enabled
  with me as (
    select id,
           coalesce(save_crossed_paths, true) as save_crossed_paths,
           coalesce(is_proxy_active, false) as is_proxy_active
    from public.profiles
    where id = auth.uid()
  )
  select v.day_key,
         v.place_key,
         max(v.address_label) as address_label,
         max(v.seen_at) as last_seen
  from public.crossed_path_visits v
  join me on me.id = v.user_id
  where me.save_crossed_paths = true
    and me.is_proxy_active = true
    and v.seen_at >= p_since
  group by v.day_key, v.place_key
  order by v.day_key desc, max(v.seen_at) desc;
$$;

-- Paginated people for a specific place/day, ranked by:
-- 1) same primary intent (relationship_goals[1])
-- 2) match_percent (based on detailed_interests)
-- 3) most recent seen_at in that place/day
-- Cursor pagination follows the same ordering.
create or replace function public.get_crossed_paths_people(
  p_day date,
  p_place_key text,
  p_limit integer default 30,
  p_cursor_intent integer default null,
  p_cursor_match integer default null,
  p_cursor_seen_at timestamptz default null,
  p_cursor_user_id uuid default null
)
returns table (
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  is_verified boolean,
  relationship_goals text[],
  match_percent integer,
  same_intent boolean,
  last_seen timestamptz,
  cursor_intent integer,
  cursor_match integer,
  cursor_seen_at timestamptz,
  cursor_user_id uuid
)
language sql
security definer
set search_path = public
as $$
  with me as (
    select id,
           coalesce(save_crossed_paths, true) as save_crossed_paths,
           coalesce(is_proxy_active, false) as is_proxy_active,
           relationship_goals,
           detailed_interests
    from public.profiles
    where id = auth.uid()
  ),
  candidates as (
    select other.user_id as user_id,
           max(other.seen_at) as last_seen
    from public.crossed_path_visits mine
    join public.crossed_path_visits other
      on other.day_key = mine.day_key
     and other.place_key = mine.place_key
     and other.user_id <> mine.user_id
    join me on me.id = mine.user_id
    where me.save_crossed_paths = true
      and me.is_proxy_active = true
      and mine.day_key = p_day
      and mine.place_key = p_place_key
    group by other.user_id
  ),
  enriched as (
    select p.id as user_id,
           p.username,
           p.full_name,
           p.avatar_url,
           coalesce(p.is_verified, false) as is_verified,
           p.relationship_goals,
           public.cp_match_percent((select detailed_interests from me), p.detailed_interests) as match_percent,
           (case
              when (select relationship_goals from me) is null then false
              when p.relationship_goals is null then false
              when (select relationship_goals from me)[1] is null then false
              when p.relationship_goals[1] is null then false
              else (p.relationship_goals[1] = (select relationship_goals from me)[1])
            end) as same_intent,
           c.last_seen
    from candidates c
    join public.profiles p on p.id = c.user_id
  ),
  ordered as (
    select *,
           (case when same_intent then 1 else 0 end) as intent_rank
    from enriched
  )
  select
    user_id,
    username,
    full_name,
    avatar_url,
    is_verified,
    relationship_goals,
    match_percent,
    same_intent,
    last_seen,
    (case when same_intent then 1 else 0 end) as cursor_intent,
    match_percent as cursor_match,
    last_seen as cursor_seen_at,
    user_id as cursor_user_id
  from ordered
  where
    (
      p_cursor_user_id is null
      or
      ( (case when same_intent then 1 else 0 end), match_percent, last_seen, user_id )
        <
      ( p_cursor_intent, p_cursor_match, p_cursor_seen_at, p_cursor_user_id )
    )
  order by
    (case when same_intent then 1 else 0 end) desc,
    match_percent desc,
    last_seen desc,
    user_id desc
  limit greatest(1, least(p_limit, 100));
$$;

-- Badge count for Proxy tab: distinct people in last 7 days that are "high value":
-- - same primary intent (relationship_goals[1]) OR
-- - any interest overlap (match_percent > 0).
create or replace function public.get_my_crossed_paths_badge_count(p_since timestamptz default (now() - interval '7 days'))
returns integer
language sql
security definer
set search_path = public
as $$
  with me as (
    select id,
           coalesce(save_crossed_paths, true) as save_crossed_paths,
           coalesce(is_proxy_active, false) as is_proxy_active,
           relationship_goals,
           detailed_interests
    from public.profiles
    where id = auth.uid()
  ),
  pairs as (
    select other.user_id as other_user_id,
           max(other.seen_at) as last_seen
    from public.crossed_path_visits mine
    join public.crossed_path_visits other
      on other.day_key = mine.day_key
     and other.place_key = mine.place_key
     and other.user_id <> mine.user_id
    join me on me.id = mine.user_id
    where me.save_crossed_paths = true
      and me.is_proxy_active = true
      and mine.seen_at >= p_since
    group by other.user_id
  ),
  scored as (
    select p.id,
           public.cp_match_percent((select detailed_interests from me), p.detailed_interests) as match_percent,
           (case
              when (select relationship_goals from me) is null then false
              when p.relationship_goals is null then false
              when (select relationship_goals from me)[1] is null then false
              when p.relationship_goals[1] is null then false
              else (p.relationship_goals[1] = (select relationship_goals from me)[1])
            end) as same_intent
    from pairs
    join public.profiles p on p.id = pairs.other_user_id
  )
  select coalesce(count(*), 0)::integer
  from scored
  where same_intent = true or match_percent > 0;
$$;
