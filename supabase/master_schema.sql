-- Master Schema
-- Combined schema for Freedom App
-- Includes Profiles, Posts, Interests, Safety, Stories, Penpals, Clubs, Events, and Forum

-- Enable PostGIS
create extension if not exists postgis;

-- ==========================================
-- 1. Core Profile & Social Graph (from schema.sql)
-- ==========================================

-- Create profiles table
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  updated_at timestamp with time zone,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  is_proxy_active boolean default false,
  location geography(Point, 4326),
  last_seen timestamp with time zone default timezone('utc'::text, now()),
  
  -- Additional columns from migrations
  hide_connections boolean DEFAULT false,
  relationship_goals text[],
  -- Age & romance preferences
  birthdate date,
  age_group text,
  gender text,
  romance_preference text,
  romance_min_age integer default 18,
  romance_max_age integer default 99,
  professional_title text,
  detailed_interests jsonb,
  currently_into text,
  is_verified boolean DEFAULT false,
  city text,
  state text,
  status_text text,
  status_image_url text,
  status_created_at timestamptz,
  -- Social status counters (not verification)
  share_count int DEFAULT 0,

  constraint username_length check (char_length(username) >= 3)
);

-- Ensure columns exist (idempotent updates)
do $$ 
begin
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'hide_connections') then
        alter table public.profiles add column hide_connections boolean DEFAULT false;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'relationship_goals') then
        alter table public.profiles add column relationship_goals text[];
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'birthdate') then
        alter table public.profiles add column birthdate date;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'age_group') then
        alter table public.profiles add column age_group text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'gender') then
        alter table public.profiles add column gender text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'romance_preference') then
        alter table public.profiles add column romance_preference text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'romance_min_age') then
        alter table public.profiles add column romance_min_age integer default 18;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'romance_max_age') then
        alter table public.profiles add column romance_max_age integer default 99;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'professional_title') then
        alter table public.profiles add column professional_title text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'detailed_interests') then
        alter table public.profiles add column detailed_interests jsonb;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'currently_into') then
        alter table public.profiles add column currently_into text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'is_verified') then
        alter table public.profiles add column is_verified boolean DEFAULT false;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'city') then
        alter table public.profiles add column city text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'state') then
        alter table public.profiles add column state text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'status_text') then
        alter table public.profiles add column status_text text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'status_image_url') then
        alter table public.profiles add column status_image_url text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'status_created_at') then
        alter table public.profiles add column status_created_at timestamptz;
    end if;
    -- Referral system columns
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'friend_code') then
        alter table public.profiles add column friend_code text UNIQUE;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'referral_count') then
        alter table public.profiles add column referral_count int DEFAULT 0;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'share_count') then
        alter table public.profiles add column share_count int DEFAULT 0;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'referred_by') then
        alter table public.profiles add column referred_by uuid REFERENCES public.profiles(id);
    end if;
    -- Onboarding and social links columns
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'is_onboarded') then
        alter table public.profiles add column is_onboarded boolean DEFAULT false;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'social_links') then
        alter table public.profiles add column social_links jsonb;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'save_crossed_paths') then
        alter table public.profiles add column save_crossed_paths boolean not null default true;
    end if;
end $$;

-- Age enforcement (13+ required; minors have no intent; romance age prefs never below 18)
create or replace function public.enforce_profile_age_rules()
returns trigger
language plpgsql
security definer
as $$
declare
  age_years integer;
begin
  if new.birthdate is null then
    -- Don't hard-break legacy users; but keep fields consistent if set later.
    return new;
  end if;

  age_years := date_part('year', age(new.birthdate))::int;

  if age_years < 13 then
    raise exception 'Users must be at least 13 years old.';
  end if;

  if age_years < 18 then
    new.age_group := 'minor';
    -- Minors are friendship-only (no romance/professional).
    new.relationship_goals := array['Friendship']::text[];
    -- Romance prefs are irrelevant for minors; keep safe defaults.
    new.romance_min_age := 18;
    new.romance_max_age := 99;
  else
    new.age_group := 'adult';
    if new.romance_min_age is null or new.romance_min_age < 18 then
      new.romance_min_age := 18;
    end if;
    if new.romance_max_age is null or new.romance_max_age < new.romance_min_age then
      new.romance_max_age := greatest(new.romance_min_age, coalesce(new.romance_max_age, 99));
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_enforce_age_rules') then
    create trigger profiles_enforce_age_rules
    before insert or update of birthdate, relationship_goals, romance_min_age, romance_max_age
    on public.profiles
    for each row
    execute function public.enforce_profile_age_rules();
  end if;
end $$;

-- RLS for profiles
alter table public.profiles enable row level security;

-- Drop existing policies to allow re-creation
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can update own profile." on public.profiles;

create policy "Public profiles are viewable by everyone."
  on public.profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( (SELECT auth.uid()) = id );

create policy "Users can update own profile."
  on public.profiles for update
  using ( (SELECT auth.uid()) = id );

-- Prevent direct reads of sensitive fields (exact coordinates + DOB).
-- These are still available to SECURITY DEFINER RPCs (e.g., discovery ranking/distance),
-- but not selectable by client roles via `.from('profiles').select(...)`.
revoke select (location, birthdate) on table public.profiles from anon, authenticated;

-- Account deletion (fallback path; full deletion uses Edge Function `delete-account`).
-- Deletes the profile row which cascades to related app data via FK deletes.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.profiles where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- Create posts table
create table if not exists public.posts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  image_url text not null,
  caption text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS for posts
alter table public.posts enable row level security;

drop policy if exists "Posts are viewable by everyone." on public.posts;
drop policy if exists "Users can create posts." on public.posts;

create policy "Posts are viewable by everyone."
  on public.posts for select
  using ( true );

create policy "Users can create posts."
  on public.posts for insert
  with check ( (SELECT auth.uid()) = user_id );

-- Create interests table
create table if not exists public.interests (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references public.profiles(id) not null,
  receiver_id uuid references public.profiles(id) not null,
  status text check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS for interests
alter table public.interests enable row level security;

drop policy if exists "Sender can view own sent interests" on public.interests;
drop policy if exists "Receiver can view own received interests" on public.interests;
drop policy if exists "Users can send interest" on public.interests;
drop policy if exists "Receiver can update status" on public.interests;

-- Sender can see their sent interests
create policy "Sender can view own sent interests"
  on public.interests for select
  using ( (SELECT auth.uid()) = sender_id );

-- Receiver can see their received interests
create policy "Receiver can view own received interests"
  on public.interests for select
  using ( (SELECT auth.uid()) = receiver_id );

-- Users can send interest
create policy "Users can send interest"
  on public.interests for insert
  with check ( (SELECT auth.uid()) = sender_id );

-- Users can update status (accept/decline) if they are receiver
create policy "Receiver can update status"
  on public.interests for update
  using ( (SELECT auth.uid()) = receiver_id );

-- Messages (DM chat). Enforce: only participants can read, only accepted connections can message,
-- and blocking prevents both viewing and sending messages between the two users.
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.interests(id) not null,
  sender_id uuid references public.profiles(id) not null,
  receiver_id uuid references public.profiles(id),
  content text not null,
  read boolean default false,
  read_at timestamptz,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.messages enable row level security;

drop policy if exists "Users can view messages in their conversations" on public.messages;
drop policy if exists "Users can send messages to their conversations" on public.messages;

create policy "Users can view messages in their conversations"
  on public.messages for select
  using (
    exists (
      select 1
      from public.interests i
      where i.id = messages.conversation_id
        and i.status = 'accepted'
        and (i.sender_id = auth.uid() or i.receiver_id = auth.uid())
        and not exists (
          select 1
          from public.blocked_users b
          where (b.blocker_id = i.sender_id and b.blocked_id = i.receiver_id)
             or (b.blocker_id = i.receiver_id and b.blocked_id = i.sender_id)
        )
    )
  );

create policy "Users can send messages to their conversations"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.interests i
      where i.id = conversation_id
        and i.status = 'accepted'
        and (i.sender_id = auth.uid() or i.receiver_id = auth.uid())
        and not exists (
          select 1
          from public.blocked_users b
          where (b.blocker_id = i.sender_id and b.blocked_id = i.receiver_id)
             or (b.blocker_id = i.receiver_id and b.blocked_id = i.sender_id)
        )
    )
  );

-- =========================================================
-- Connections edge cases: auto-connect + cleanup + notify
--
-- Problem:
-- - If A->B is pending and B->A is pending, accepting one can leave the other pending,
--   causing a stale request in the receiver's inbox even though they're connected.
--
-- Solution:
-- - BEFORE INSERT: if a reciprocal pending/accepted exists, auto-connect (accept the existing row)
--   and skip inserting the new row (keeps a single canonical row per pair).
-- - AFTER UPDATE to accepted: delete any reciprocal pending rows and create "connection_accepted"
--   notifications for both sides with an icebreaker prompt.
-- =========================================================

create or replace function public.interests_before_insert_autoconnect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  existing_status text;
begin
  -- Prevent duplicate "same direction" pending rows
  select i.id, i.status
  into existing_id, existing_status
  from public.interests i
  where i.sender_id = new.sender_id
    and i.receiver_id = new.receiver_id
    and i.status in ('pending', 'accepted')
  order by i.created_at desc
  limit 1;

  if existing_id is not null then
    -- Already have a pending/accepted request in this direction; skip creating another row.
    return null;
  end if;

  -- If the other user already sent a pending request, auto-connect by accepting the existing row
  -- and skip inserting this new row (avoids double-counting accepted connections).
  select i.id, i.status
  into existing_id, existing_status
  from public.interests i
  where i.sender_id = new.receiver_id
    and i.receiver_id = new.sender_id
    and i.status in ('pending', 'accepted')
  order by i.created_at desc
  limit 1;

  if existing_id is not null then
    if existing_status = 'pending' then
      update public.interests
      set status = 'accepted'
      where id = existing_id;
    end if;

    -- Skip insert; connection will be represented by the existing row.
    return null;
  end if;

  return new;
end;
$$;

-- Throttle interest requests (prevents spam). Applies to both proxy/city connection requests.
create or replace function public.enforce_interest_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  -- Max 50 outgoing interests per 24h per sender.
  select count(*) into cnt
  from public.interests i
  where i.sender_id = new.sender_id
    and i.created_at >= now() - interval '24 hours';

  if coalesce(cnt, 0) >= 50 then
    raise exception 'Too many connection requests. Please try again later.';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'interests_rate_limit') then
    create trigger interests_rate_limit
    before insert on public.interests
    for each row
    execute function public.enforce_interest_rate_limit();
  end if;
end $$;

drop trigger if exists trigger_interests_before_insert_autoconnect on public.interests;
create trigger trigger_interests_before_insert_autoconnect
before insert on public.interests
for each row
execute function public.interests_before_insert_autoconnect();


create or replace function public.interests_after_update_on_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  b_id uuid;
  a_username text;
  b_username text;
  questions text[];
  pick text;
begin
  -- Only act when transitioning into accepted
  if new.status <> 'accepted' or old.status = 'accepted' then
    return new;
  end if;

  a_id := new.sender_id;
  b_id := new.receiver_id;

  -- Cleanup: remove any reciprocal pending request row (prevents stale "request" in inbox)
  delete from public.interests i
  where i.sender_id = b_id
    and i.receiver_id = a_id
    and i.status = 'pending';

  -- Optional cleanup: if there are multiple pending duplicates in the same direction, remove extras.
  delete from public.interests i
  where i.sender_id = a_id
    and i.receiver_id = b_id
    and i.status = 'pending'
    and i.id <> new.id;

  -- Notifications table is created by supabase/club_notifications.sql; only attempt if present.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notifications'
  ) then
    select username into a_username from public.profiles where id = a_id;
    select username into b_username from public.profiles where id = b_id;

    questions := array[
      'What''s your go-to coffee order?',
      'What are you excited about this week?',
      'What''s a hobby you''re into lately?',
      'If you could teleport anywhere right now, where would you go?',
      'What''s your perfect weekend look like?'
    ];
    pick := questions[1 + floor(random() * array_length(questions, 1))::int];

    insert into public.notifications (user_id, type, title, body, data)
    values
      (a_id, 'connection_accepted', 'New Connection',
        'You connected with ' || coalesce(b_username, 'someone') || '. Break the ice: ' || pick,
        jsonb_build_object('partner_id', b_id, 'conversation_id', new.id, 'icebreaker', pick)
      ),
      (b_id, 'connection_accepted', 'New Connection',
        'You connected with ' || coalesce(a_username, 'someone') || '. Break the ice: ' || pick,
        jsonb_build_object('partner_id', a_id, 'conversation_id', new.id, 'icebreaker', pick)
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_interests_after_update_on_accept on public.interests;
create trigger trigger_interests_after_update_on_accept
after update of status on public.interests
for each row
when (new.status = 'accepted' and (old.status is distinct from new.status))
execute function public.interests_after_update_on_accept();

-- Allow either side to disconnect via SECURITY DEFINER function
create or replace function public.remove_connection(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.interests
  set status = 'declined'
  where status = 'accepted'
    and (
      (sender_id = auth.uid() and receiver_id = p_partner_id)
      or
      (sender_id = p_partner_id and receiver_id = auth.uid())
    );
end;
$$;

revoke all on function public.remove_connection(uuid) from public;
grant execute on function public.remove_connection(uuid) to authenticated;

-- Function to generate unique 6-digit friend code
create or replace function public.generate_friend_code()
returns text
language plpgsql
as $$
declare
    new_code text;
    exists_code boolean;
begin
    loop
        -- Generate 6 digit random number
        new_code := lpad(floor(random() * 1000000)::text, 6, '0');
        
        -- Check if exists
        select exists (select 1 from public.profiles where friend_code = new_code) into exists_code;
        
        exit when not exists_code;
    end loop;
    return new_code;
end;
$$;

-- Function to handle new user signup with referral processing
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  ref_code text;
  referrer_id uuid;
  current_count int;
begin
  -- Get friend code from metadata (safely)
  begin
    ref_code := new.raw_user_meta_data->>'friend_code';
  exception when others then
    ref_code := null;
  end;
  
  -- Insert profile with generated friend code
  insert into public.profiles (id, username, full_name, avatar_url, friend_code)
  values (
    new.id, 
    new.raw_user_meta_data->>'username', 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    public.generate_friend_code()
  );

  -- Process referral if friend code exists
  if ref_code is not null and ref_code <> '' then
      select id into referrer_id from public.profiles where friend_code = ref_code;
      
      if referrer_id is not null then
          -- Link user
          update public.profiles set referred_by = referrer_id where id = new.id;
          
          -- Recalculate referral_count based on actual referred_by relationships
          -- This ensures accuracy even if the count was previously incorrect
          update public.profiles 
          set referral_count = (
            select count(*) 
            from public.profiles ref 
            where ref.referred_by = referrer_id
          )
          where id = referrer_id
          returning referral_count into current_count;
          
          -- NOTE: referrals no longer grant verification; they are used for Trendsetter status.
      end if;
  end if;

  return new;
end;
$$;

-- Apply a friend code AFTER signup (onboarding flow).
-- This lets us keep sign-up minimal while still incrementing the referrer's referral_count safely.
create or replace function public.apply_friend_code(p_friend_code text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid;
  referrer_id uuid;
  current_count int;
  code text;
begin
  me := auth.uid();
  if me is null then
    raise exception 'Not authenticated';
  end if;

  code := trim(coalesce(p_friend_code, ''));
  if code = '' then
    raise exception 'Friend code is required';
  end if;

  -- Disallow applying more than once.
  if exists (select 1 from public.profiles p where p.id = me and p.referred_by is not null) then
    raise exception 'Friend code already applied';
  end if;

  select p.id into referrer_id
  from public.profiles p
  where p.friend_code = code;

  if referrer_id is null then
    raise exception 'Invalid friend code';
  end if;

  if referrer_id = me then
    raise exception 'You cannot use your own friend code';
  end if;

  -- Link user to referrer.
  update public.profiles
  set referred_by = referrer_id
  where id = me;

  -- Recalculate referrer's count from truth source (referred_by links) for correctness.
  update public.profiles
  set referral_count = (
    select count(*)
    from public.profiles ref
    where ref.referred_by = referrer_id
  )
  where id = referrer_id
  returning referral_count into current_count;

  -- NOTE: referrals no longer grant verification; they are used for Trendsetter status.

  return json_build_object(
    'referrer_id', referrer_id,
    'referral_count', current_count
  );
end;
$$;

revoke all on function public.apply_friend_code(text) from public;
grant execute on function public.apply_friend_code(text) to authenticated;

-- Trigger to ensure friend_code is set on profile insert
create or replace function public.ensure_friend_code()
returns trigger
language plpgsql
as $$
begin
    if new.friend_code is null then
        new.friend_code := public.generate_friend_code();
    end if;
    return new;
end;
$$;

drop trigger if exists ensure_friend_code_trigger on public.profiles;
create trigger ensure_friend_code_trigger
    before insert on public.profiles
    for each row
    execute function public.ensure_friend_code();

-- Backfill existing users with friend codes
update public.profiles set friend_code = public.generate_friend_code() where friend_code is null;

-- Trigger the function every time a user is created
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Index for spatial queries
create index if not exists profiles_geo_index on public.profiles using GIST (location);


-- ==========================================
-- 2. Safety Features (from safety_schema.sql)
-- ==========================================

-- Blocked Users Table
CREATE TABLE IF NOT EXISTS public.blocked_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

drop policy if exists "Users can view who they blocked" on public.blocked_users;
drop policy if exists "Users can block others" on public.blocked_users;
drop policy if exists "Users can unblock" on public.blocked_users;

CREATE POLICY "Users can view who they blocked"
    ON public.blocked_users FOR SELECT
    USING ((SELECT auth.uid()) = blocker_id);

CREATE POLICY "Users can block others"
    ON public.blocked_users FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = blocker_id);

CREATE POLICY "Users can unblock"
    ON public.blocked_users FOR DELETE
    USING ((SELECT auth.uid()) = blocker_id);

-- Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('user', 'post', 'message', 'story')),
    content_id UUID, 
    reason_code TEXT,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Basic abuse throttles (server-side)
create or replace function public.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  -- Max 10 reports per 24h per reporter.
  select count(*) into cnt
  from public.reports r
  where r.reporter_id = new.reporter_id
    and r.created_at >= now() - interval '24 hours';

  if coalesce(cnt, 0) >= 10 then
    raise exception 'Too many reports. Please try again later.';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'reports_rate_limit') then
    create trigger reports_rate_limit
    before insert on public.reports
    for each row
    execute function public.enforce_report_rate_limit();
  end if;
end $$;

-- Ensure reports columns exist (idempotent)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'reports' and column_name = 'reason_code') then
    alter table public.reports add column reason_code text;
  end if;
end $$;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

drop policy if exists "Users can create reports" on public.reports;

CREATE POLICY "Users can create reports"
    ON public.reports FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = reporter_id);

-- ==========================================
-- 3. Stories (from stories_schema.sql)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.stories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT CHECK (media_type IN ('image', 'video')) DEFAULT 'image',
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

drop policy if exists "Stories are viewable by everyone" on public.stories;
drop policy if exists "Users can create stories" on public.stories;
drop policy if exists "Users can delete own stories" on public.stories;

CREATE POLICY "Stories are viewable by everyone"
    ON public.stories FOR SELECT
    USING (expires_at > NOW());

CREATE POLICY "Users can create stories"
    ON public.stories FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own stories"
    ON public.stories FOR DELETE
    USING ((SELECT auth.uid()) = user_id);


-- ==========================================
-- 4. Clubs & Members (from clubs_schema.sql)
-- ==========================================

-- Notifications: join request + join accepted
-- This is optional and only activates if public.notifications exists.
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    -- Expand notifications type constraint to include join-request types (idempotent)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_type_check') THEN
      ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
    END IF;

    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (
        type IN (
          'forum_reply',
          'club_event',
          'club_member',
          'club_invite',
          'club_join_request',
          'club_join_accepted',
          'connection_request',
          'connection_accepted',
          'message',
          'event_rsvp',
          'event_update',
          'event_reminder',
          'event_cancelled',
          'event_rsvp_update',
          'city_milestone'
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_club_join_request()
RETURNS TRIGGER AS $$
DECLARE
  club_name text;
  requester_username text;
  owner_id uuid;
BEGIN
  -- Only for join requests
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- Only when the club allows requests
  IF EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = NEW.club_id AND c.join_policy = 'invite_only') THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.notifications') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.name, c.owner_id INTO club_name, owner_id
  FROM public.clubs c
  WHERE c.id = NEW.club_id;

  SELECT p.username INTO requester_username
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  EXECUTE $q$
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES ($1, 'club_join_request', 'Join Request',
      $2,
      jsonb_build_object('club_id', $3, 'requester_id', $4)
    )
  $q$
  USING owner_id,
        coalesce(requester_username, 'Someone') || ' requested to join ' || coalesce(club_name, 'your club'),
        NEW.club_id,
        NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_club_join_request ON public.club_members;
CREATE TRIGGER trigger_notify_club_join_request
  AFTER INSERT ON public.club_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_club_join_request();

CREATE OR REPLACE FUNCTION public.notify_club_join_accepted()
RETURNS TRIGGER AS $$
DECLARE
  club_name text;
  owner_username text;
BEGIN
  -- Only when pending -> accepted
  IF NEW.status <> 'accepted' OR OLD.status = 'accepted' OR OLD.status IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.notifications') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.name, p.username INTO club_name, owner_username
  FROM public.clubs c
  JOIN public.profiles p ON p.id = c.owner_id
  WHERE c.id = NEW.club_id;

  EXECUTE $q$
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES ($1, 'club_join_accepted', 'You''re In!',
      $2,
      jsonb_build_object('club_id', $3)
    )
  $q$
  USING NEW.user_id,
        coalesce(owner_username, 'A club owner') || ' accepted your request for ' || coalesce(club_name, 'the club') ||
        '. Say hi in the forum and check out upcoming events!',
        NEW.club_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_club_join_accepted ON public.club_members;
CREATE TRIGGER trigger_notify_club_join_accepted
  AFTER UPDATE OF status ON public.club_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_club_join_accepted();

CREATE TABLE IF NOT EXISTS public.clubs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    detailed_interests JSONB,
    city TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    join_policy TEXT NOT NULL DEFAULT 'request_to_join' CHECK (join_policy IN ('invite_only', 'request_to_join')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    max_member_count INTEGER CHECK (max_member_count IS NULL OR max_member_count > 0)
);

-- If the table already existed (older schema), ensure detailed_interests exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clubs' AND column_name = 'detailed_interests'
  ) THEN
    ALTER TABLE public.clubs
      ADD COLUMN detailed_interests JSONB;
  END IF;
END $$;

-- If the table already existed (older schema), ensure join_policy exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clubs' AND column_name = 'join_policy'
  ) THEN
    ALTER TABLE public.clubs
      ADD COLUMN join_policy TEXT NOT NULL DEFAULT 'request_to_join'
      CHECK (join_policy IN ('invite_only', 'request_to_join'));
  END IF;
END $$;

-- One club per owner (DB enforcement)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_owner_one_club
  ON public.clubs(owner_id);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

drop policy if exists "Clubs are viewable by everyone" on public.clubs;
drop policy if exists "Users can create clubs" on public.clubs;
drop policy if exists "Owners can update their clubs" on public.clubs;
drop policy if exists "Owners can delete their clubs" on public.clubs;

CREATE POLICY "Clubs are viewable by everyone"
    ON public.clubs FOR SELECT
    USING (true);

CREATE POLICY "Users can create clubs"
    ON public.clubs FOR INSERT
    WITH CHECK (
      (SELECT auth.uid()) = owner_id
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_verified = true
      )
    );

CREATE POLICY "Owners can update their clubs"
    ON public.clubs FOR UPDATE
    USING (
      (SELECT auth.uid()) = owner_id
      OR EXISTS (
        SELECT 1
        FROM public.club_members cm
        WHERE cm.club_id = clubs.id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.status = 'accepted'
          AND cm.role IN ('owner', 'admin')
      )
    );

CREATE POLICY "Owners can delete their clubs"
    ON public.clubs FOR DELETE
    USING ((SELECT auth.uid()) = owner_id);

-- Club Members
CREATE TABLE IF NOT EXISTS public.club_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
    status TEXT CHECK (status IN ('pending', 'accepted', 'invited')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(club_id, user_id)
);

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

drop policy if exists "Members can view other members" on public.club_members;
drop policy if exists "Users can join/leave clubs" on public.club_members;
drop policy if exists "Users can leave clubs" on public.club_members;
drop policy if exists "Admins/Owners can update member status" on public.club_members;

CREATE POLICY "Members can view other members"
    ON public.club_members FOR SELECT
    USING (true);

CREATE POLICY "Users can join/leave clubs"
    ON public.club_members FOR INSERT
    WITH CHECK (
      (
        (SELECT auth.uid()) = user_id
        AND status = 'pending'
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.is_verified = true
        )
        AND EXISTS (
          SELECT 1 FROM public.clubs c
          WHERE c.id = club_id
            AND c.join_policy = 'request_to_join'
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.clubs c
        WHERE c.id = club_id
          AND c.owner_id = (SELECT auth.uid())
      )
    );

CREATE POLICY "Users can leave clubs"
    ON public.club_members FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- Allow owners/admins to remove members or decline join requests
DROP POLICY IF EXISTS "Admins/Owners can remove members" ON public.club_members;
CREATE POLICY "Admins/Owners can remove members"
    ON public.club_members FOR DELETE
    USING (
      EXISTS (
        SELECT 1
        FROM public.club_members cm
        WHERE cm.club_id = club_members.club_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.role IN ('owner', 'admin')
          AND cm.status = 'accepted'
      )
      AND club_members.user_id <> (SELECT auth.uid())
    );

CREATE POLICY "Admins/Owners can update member status"
    ON public.club_members FOR UPDATE
    USING (
        (SELECT auth.uid()) = user_id OR -- Accept invite
        EXISTS (
          SELECT 1
          FROM public.club_members cm
          WHERE cm.club_id = club_members.club_id
            AND cm.user_id = (SELECT auth.uid())
            AND cm.role IN ('owner', 'admin')
        )
    );


-- ==========================================
-- 5. Club Events (from club_events_schema.sql & club_events_rsvp_schema.sql)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.club_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    location TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_public BOOLEAN NOT NULL DEFAULT false,
    detailed_interests jsonb,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rsvp_count_going INTEGER DEFAULT 0,
    rsvp_count_maybe INTEGER DEFAULT 0,
    rsvp_count_cant INTEGER DEFAULT 0
);

-- If the table already existed (older schema), ensure is_public exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_events' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE public.club_events
      ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- If the table already existed (older schema), ensure image_url exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_events' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.club_events
      ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- If the table already existed (older schema), ensure cancellation columns exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_events' AND column_name = 'is_cancelled'
  ) THEN
    ALTER TABLE public.club_events
      ADD COLUMN is_cancelled BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_events' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.club_events
      ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;
END $$;

-- If the table already existed (older schema), ensure detailed_interests exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_events' AND column_name = 'detailed_interests'
  ) THEN
    ALTER TABLE public.club_events
      ADD COLUMN detailed_interests jsonb;
  END IF;
END $$;

ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;

drop policy if exists "Events viewable by club members" on public.club_events;
drop policy if exists "Public events are viewable by everyone" on public.club_events;
drop policy if exists "Admins/Owners can create events" on public.club_events;

CREATE POLICY "Events viewable by club members"
    ON public.club_events FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.club_members cm
        WHERE cm.club_id = club_events.club_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.status = 'accepted'
      )
    );

-- Public events are visible to all users (for City tab discovery)
CREATE POLICY "Public events are viewable by everyone"
    ON public.club_events FOR SELECT
    USING (club_events.is_public = true and club_events.event_date > now());

CREATE POLICY "Admins/Owners can create events"
    ON public.club_events FOR INSERT
    WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.club_members cm
          WHERE cm.club_id = club_events.club_id
            AND cm.user_id = (SELECT auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'accepted'
        )
    );

-- Event RSVPs
CREATE TABLE IF NOT EXISTS public.club_event_rsvps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'cant')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

ALTER TABLE public.club_event_rsvps ENABLE ROW LEVEL SECURITY;

drop policy if exists "Members can view event RSVPs" on public.club_event_rsvps;
drop policy if exists "Members can manage their own RSVPs" on public.club_event_rsvps;
drop policy if exists "Verified users can RSVP" on public.club_event_rsvps;
drop policy if exists "Verified users can update their RSVP" on public.club_event_rsvps;
drop policy if exists "Users can remove their RSVP" on public.club_event_rsvps;

CREATE POLICY "Members can view event RSVPs"
    ON public.club_event_rsvps FOR SELECT
    USING (true);

-- Only verified users may RSVP (insert/update). This is enforced at the DB level.
CREATE POLICY "Verified users can RSVP"
    ON public.club_event_rsvps FOR INSERT
    WITH CHECK (
      user_id = auth.uid()
      and (
        -- Verified users can RSVP...
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.is_verified = true
        )
        -- ...and event creators can always RSVP to their own event.
        or exists (
          select 1 from public.club_events e
          where e.id = club_event_rsvps.event_id
            and e.created_by = auth.uid()
        )
      )
    );

CREATE POLICY "Verified users can update their RSVP"
    ON public.club_event_rsvps FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (
      user_id = auth.uid()
      and (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.is_verified = true
        )
        or exists (
          select 1 from public.club_events e
          where e.id = club_event_rsvps.event_id
            and e.created_by = auth.uid()
        )
      )
    );

CREATE POLICY "Users can remove their RSVP"
    ON public.club_event_rsvps FOR DELETE
    USING (user_id = auth.uid());

-- Notify club owners/admins when someone RSVPs (profile submission)
CREATE OR REPLACE FUNCTION public.notify_event_rsvp_to_club_admins()
RETURNS TRIGGER AS $$
DECLARE
  v_club_id uuid;
  event_title text;
  rsvp_username text;
  admin_record record;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.club_id, e.title INTO v_club_id, event_title
  FROM public.club_events e
  WHERE e.id = NEW.event_id;

  SELECT p.username INTO rsvp_username
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  FOR admin_record IN
    SELECT cm.user_id
    FROM public.club_members cm
    WHERE cm.club_id = v_club_id
      AND cm.status = 'accepted'
      AND cm.role IN ('owner', 'admin')
  LOOP
    -- Don't notify the RSVPer about their own RSVP (esp. for auto-RSVP on event creation).
    IF admin_record.user_id = NEW.user_id THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      admin_record.user_id,
      'event_rsvp',
      'New Event RSVP',
      COALESCE(rsvp_username, 'Someone') || ' RSVP''d "' || COALESCE(event_title, 'your event') || '". Their profile was submitted to your club.',
      jsonb_build_object('club_id', v_club_id, 'event_id', NEW.event_id, 'rsvp_user_id', NEW.user_id, 'rsvp_status', NEW.status)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_event_rsvp_to_admins ON public.club_event_rsvps;
CREATE TRIGGER trigger_notify_event_rsvp_to_admins
  AFTER INSERT ON public.club_event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_rsvp_to_club_admins();

-- Auto-RSVP: when an event is created, mark the creator as "going" so it shows in Upcoming Events.
CREATE OR REPLACE FUNCTION public.auto_rsvp_event_creator()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.club_event_rsvps (event_id, user_id, status)
  VALUES (NEW.id, NEW.created_by, 'going')
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET status = EXCLUDED.status, updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_rsvp_event_creator ON public.club_events;
CREATE TRIGGER trigger_auto_rsvp_event_creator
  AFTER INSERT ON public.club_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_rsvp_event_creator();


-- ==========================================
-- 5b. Public Event Interests + Comments
-- ==========================================

-- Users can mark public events as Interested / Not Interested.
CREATE TABLE IF NOT EXISTS public.event_interests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('interested', 'not_interested')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.event_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own event interests" ON public.event_interests;
DROP POLICY IF EXISTS "Users can add own event interests" ON public.event_interests;
DROP POLICY IF EXISTS "Users can update own event interests" ON public.event_interests;
DROP POLICY IF EXISTS "Users can remove own event interests" ON public.event_interests;

CREATE POLICY "Users can view own event interests"
  ON public.event_interests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can add own event interests"
  ON public.event_interests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own event interests"
  ON public.event_interests FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove own event interests"
  ON public.event_interests FOR DELETE
  USING (user_id = auth.uid());


-- Public event comments (discussion thread).
CREATE TABLE IF NOT EXISTS public.event_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view event comments" ON public.event_comments;
DROP POLICY IF EXISTS "Users can add event comments" ON public.event_comments;
DROP POLICY IF EXISTS "Users can update own event comments" ON public.event_comments;
DROP POLICY IF EXISTS "Users can delete own event comments" ON public.event_comments;

-- View comments if:
-- - The event is public; OR
-- - The viewer is an accepted club member (for non-public / club-only events).
CREATE POLICY "Users can view event comments"
  ON public.event_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.club_events e
      WHERE e.id = event_comments.event_id
        AND (
          e.is_public = true
          OR EXISTS (
            SELECT 1
            FROM public.club_members cm
            WHERE cm.club_id = e.club_id
              AND cm.user_id = auth.uid()
              AND cm.status = 'accepted'
          )
        )
    )
  );

-- Only allow commenting if the user is following the event (RSVP'd or Interested).
CREATE POLICY "Users can add event comments"
  ON public.event_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.club_events e
      WHERE e.id = event_comments.event_id
        AND e.is_public = true
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.club_event_rsvps r
        WHERE r.event_id = event_comments.event_id
          AND r.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.event_interests i
        WHERE i.event_id = event_comments.event_id
          AND i.user_id = auth.uid()
          AND i.status = 'interested'
      )
    )
  );

CREATE POLICY "Users can update own event comments"
  ON public.event_comments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own event comments"
  ON public.event_comments FOR DELETE
  USING (user_id = auth.uid());


-- Ensure notifications type constraint includes event_comment (idempotent).
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_type_check') THEN
      ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
    END IF;

    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (
        type IN (
          'forum_reply',
          'club_event',
          'club_member',
          'club_invite',
          'club_join_request',
          'club_join_accepted',
          'connection_request',
          'connection_accepted',
          'message',
          'event_rsvp',
          'event_update',
          'event_organizer_update',
          'event_reminder',
          'event_cancelled',
          'event_rsvp_update',
          'event_comment',
          'city_milestone'
        )
      ) NOT VALID;
  END IF;
END $$;


-- Notify followers when an event is updated.
CREATE OR REPLACE FUNCTION public.notify_event_update_to_followers()
RETURNS TRIGGER AS $$
DECLARE
  event_title text;
  v_club_id uuid;
  follower_id uuid;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only public events, and only when meaningful fields change.
  IF NEW.is_public <> true THEN
    RETURN NEW;
  END IF;

  IF (NEW.title IS NOT DISTINCT FROM OLD.title)
     AND (NEW.description IS NOT DISTINCT FROM OLD.description)
     AND (NEW.event_date IS NOT DISTINCT FROM OLD.event_date)
     AND (NEW.location IS NOT DISTINCT FROM OLD.location)
     AND (NEW.image_url IS NOT DISTINCT FROM OLD.image_url)
     AND (NEW.is_public IS NOT DISTINCT FROM OLD.is_public)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.event_date <= now() THEN
    RETURN NEW;
  END IF;

  event_title := COALESCE(NEW.title, 'an event');
  v_club_id := NEW.club_id;

  FOR follower_id IN
    (
      SELECT DISTINCT x.user_id
      FROM (
        SELECT r.user_id FROM public.club_event_rsvps r WHERE r.event_id = NEW.id
        UNION
        SELECT i.user_id FROM public.event_interests i WHERE i.event_id = NEW.id AND i.status = 'interested'
      ) x
    )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      follower_id,
      'event_update',
      'Event updated',
      '"' || event_title || '" was updated.',
      jsonb_build_object('event_id', NEW.id, 'club_id', v_club_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_event_update_to_followers ON public.club_events;
CREATE TRIGGER trigger_notify_event_update_to_followers
  AFTER UPDATE ON public.club_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_update_to_followers();

-- Notify followers when an event is cancelled.
CREATE OR REPLACE FUNCTION public.notify_event_cancelled_to_followers()
RETURNS TRIGGER AS $$
DECLARE
  event_title text;
  v_club_id uuid;
  follower_id uuid;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_cancelled IS DISTINCT FROM true OR (OLD.is_cancelled IS NOT DISTINCT FROM true) THEN
    RETURN NEW;
  END IF;

  event_title := COALESCE(NEW.title, 'an event');
  v_club_id := NEW.club_id;

  FOR follower_id IN
    (
      SELECT DISTINCT x.user_id
      FROM (
        SELECT r.user_id FROM public.club_event_rsvps r WHERE r.event_id = NEW.id
        UNION
        SELECT i.user_id FROM public.event_interests i WHERE i.event_id = NEW.id AND i.status = 'interested'
      ) x
    )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      follower_id,
      'event_cancelled',
      'Event cancelled',
      '"' || event_title || '" was cancelled.',
      jsonb_build_object('event_id', NEW.id, 'club_id', v_club_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_event_cancelled_to_followers ON public.club_events;
CREATE TRIGGER trigger_notify_event_cancelled_to_followers
  AFTER UPDATE ON public.club_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_cancelled_to_followers();


-- Notify followers when someone comments on an event.
CREATE OR REPLACE FUNCTION public.notify_event_comment_to_followers()
RETURNS TRIGGER AS $$
DECLARE
  event_title text;
  v_club_id uuid;
  commenter_username text;
  follower_id uuid;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.title, e.club_id INTO event_title, v_club_id
  FROM public.club_events e
  WHERE e.id = NEW.event_id;

  SELECT p.username INTO commenter_username
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  FOR follower_id IN
    (
      SELECT DISTINCT x.user_id
      FROM (
        SELECT r.user_id FROM public.club_event_rsvps r WHERE r.event_id = NEW.event_id
        UNION
        SELECT i.user_id FROM public.event_interests i WHERE i.event_id = NEW.event_id AND i.status = 'interested'
      ) x
      WHERE x.user_id <> NEW.user_id
    )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      follower_id,
      'event_comment',
      'New event comment',
      COALESCE(commenter_username, 'Someone') || ' commented on "' || COALESCE(event_title, 'an event') || '".',
      jsonb_build_object('event_id', NEW.event_id, 'club_id', v_club_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_event_comment_to_followers ON public.event_comments;
CREATE TRIGGER trigger_notify_event_comment_to_followers
  AFTER INSERT ON public.event_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_comment_to_followers();


-- ==========================================
-- 5c. Organizer Updates (highlighted note on event page)
-- ==========================================

-- A single highlighted organizer note per event (overwrites over time).
CREATE TABLE IF NOT EXISTS public.event_updates (
  event_id UUID PRIMARY KEY REFERENCES public.club_events(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.event_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organizer updates" ON public.event_updates;
DROP POLICY IF EXISTS "Organizer can create update" ON public.event_updates;
DROP POLICY IF EXISTS "Organizer can update update" ON public.event_updates;
DROP POLICY IF EXISTS "Organizer can delete update" ON public.event_updates;

-- View organizer update if:
-- - The event is public, OR
-- - The viewer is an accepted club member (for non-public / club-only events).
CREATE POLICY "Users can view organizer updates"
  ON public.event_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.club_events e
      WHERE e.id = event_updates.event_id
        AND (
          e.is_public = true
          OR EXISTS (
            SELECT 1
            FROM public.club_members cm
            WHERE cm.club_id = e.club_id
              AND cm.user_id = auth.uid()
              AND cm.status = 'accepted'
          )
        )
    )
  );

-- Only the event creator may create/update/delete the organizer update.
CREATE POLICY "Organizer can create update"
  ON public.event_updates FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.club_events e
      WHERE e.id = event_updates.event_id
        AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "Organizer can update update"
  ON public.event_updates FOR UPDATE
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.club_events e
      WHERE e.id = event_updates.event_id
        AND e.created_by = auth.uid()
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.club_events e
      WHERE e.id = event_updates.event_id
        AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "Organizer can delete update"
  ON public.event_updates FOR DELETE
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.club_events e
      WHERE e.id = event_updates.event_id
        AND e.created_by = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.set_event_updates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_event_updates_updated_at ON public.event_updates;
CREATE TRIGGER trigger_set_event_updates_updated_at
  BEFORE UPDATE ON public.event_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_event_updates_updated_at();

-- Notify all RSVP'd (going/maybe) + Interested users when organizer posts/edits an update.
CREATE OR REPLACE FUNCTION public.notify_event_organizer_update_to_followers()
RETURNS TRIGGER AS $$
DECLARE
  event_title text;
  club_id uuid;
  follower_id uuid;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.title, e.club_id INTO event_title, club_id
  FROM public.club_events e
  WHERE e.id = NEW.event_id;

  FOR follower_id IN
    (
      SELECT DISTINCT x.user_id
      FROM (
        SELECT r.user_id
        FROM public.club_event_rsvps r
        WHERE r.event_id = NEW.event_id
          AND r.status IN ('going', 'maybe')
        UNION
        SELECT i.user_id
        FROM public.event_interests i
        WHERE i.event_id = NEW.event_id
          AND i.status = 'interested'
      ) x
      WHERE x.user_id <> NEW.created_by
    )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      follower_id,
      'event_organizer_update',
      'Organizer update',
      'New update for "' || COALESCE(event_title, 'an event') || '".',
      jsonb_build_object('event_id', NEW.event_id, 'club_id', club_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_event_organizer_update_to_followers ON public.event_updates;
CREATE TRIGGER trigger_notify_event_organizer_update_to_followers
  AFTER INSERT OR UPDATE ON public.event_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_organizer_update_to_followers();


-- ==========================================
-- 6. Club Forum (from club_forum_schema.sql & enhancements)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.club_forum_topics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    reply_count INTEGER DEFAULT 0,
    last_reply_at TIMESTAMPTZ,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMPTZ
);

ALTER TABLE public.club_forum_topics ENABLE ROW LEVEL SECURITY;

drop policy if exists "Members can view topics" on public.club_forum_topics;
drop policy if exists "Members can create topics" on public.club_forum_topics;

CREATE POLICY "Members can view topics"
    ON public.club_forum_topics FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.club_members cm
        WHERE cm.club_id = club_forum_topics.club_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.status = 'accepted'
      )
    );

CREATE POLICY "Members can create topics"
    ON public.club_forum_topics FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.club_members cm
        WHERE cm.club_id = club_forum_topics.club_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.status = 'accepted'
      )
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_verified = true
      )
    );

-- Forum Replies
CREATE TABLE IF NOT EXISTS public.club_forum_replies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    topic_id UUID NOT NULL REFERENCES public.club_forum_topics(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_reply_id UUID REFERENCES public.club_forum_replies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMPTZ
);

ALTER TABLE public.club_forum_replies ENABLE ROW LEVEL SECURITY;

drop policy if exists "Members can view replies" on public.club_forum_replies;
drop policy if exists "Members can create replies" on public.club_forum_replies;

CREATE POLICY "Members can view replies"
    ON public.club_forum_replies FOR SELECT
    USING (true);

CREATE POLICY "Members can create replies"
    ON public.club_forum_replies FOR INSERT
    WITH CHECK (
      (SELECT auth.uid()) = created_by
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_verified = true
      )
    );

-- Forum Reactions (Support/Oppose)
CREATE TABLE IF NOT EXISTS public.club_forum_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.club_forum_topics(id) ON DELETE CASCADE,
    reply_id UUID REFERENCES public.club_forum_replies(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('support', 'oppose')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, topic_id, reply_id),
    CHECK ((topic_id IS NOT NULL AND reply_id IS NULL) OR (topic_id IS NULL AND reply_id IS NOT NULL))
);

ALTER TABLE public.club_forum_reactions ENABLE ROW LEVEL SECURITY;

drop policy if exists "Members can view reactions" on public.club_forum_reactions;
drop policy if exists "Members can react" on public.club_forum_reactions;
drop policy if exists "Members can remove reaction" on public.club_forum_reactions;

CREATE POLICY "Members can view reactions"
    ON public.club_forum_reactions FOR SELECT
    USING (true);

CREATE POLICY "Members can react"
    ON public.club_forum_reactions FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Members can remove reaction"
    ON public.club_forum_reactions FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- ==========================================
-- 7. Realtime Enablers
-- ==========================================
-- Add tables to realtime publication (idempotent)
do $$
begin
    -- Add club_forum_topics if not already in publication
    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' 
        and tablename = 'club_forum_topics' 
        and schemaname = 'public'
    ) then
        alter publication supabase_realtime add table public.club_forum_topics;
    end if;
    
    -- Add club_forum_replies if not already in publication
    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' 
        and tablename = 'club_forum_replies' 
        and schemaname = 'public'
    ) then
        alter publication supabase_realtime add table public.club_forum_replies;
    end if;
    
    -- Add club_event_rsvps if not already in publication
    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' 
        and tablename = 'club_event_rsvps' 
        and schemaname = 'public'
    ) then
        alter publication supabase_realtime add table public.club_event_rsvps;
    end if;
    
    -- Add club_forum_reactions if not already in publication
    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' 
        and tablename = 'club_forum_reactions' 
        and schemaname = 'public'
    ) then
        alter publication supabase_realtime add table public.club_forum_reactions;
    end if;
end $$;

-- ==========================================
-- Statuses (24h updates)
-- ==========================================

create table if not exists public.statuses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text, -- Text content or Storage path for images
  type text check (type in ('text', 'image')),
  caption text,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours')
);

alter table public.statuses enable row level security;

drop policy if exists "Users can insert their own statuses" on public.statuses;
drop policy if exists "Users can update their own statuses" on public.statuses;
drop policy if exists "Users can delete their own statuses" on public.statuses;
drop policy if exists "Anyone can view active statuses" on public.statuses;

-- Trust-based system:
-- - Only verified users may post *image* statuses
-- - Anyone may post *text* statuses
create policy "Users can insert their own statuses"
on public.statuses for insert
with check (
  auth.uid() = user_id
  and (
    type <> 'image'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_verified = true
    )
  )
);

create policy "Users can update their own statuses"
on public.statuses for update
using (auth.uid() = user_id);

create policy "Users can delete their own statuses"
on public.statuses for delete
using (auth.uid() = user_id);

-- Trust-based system: active statuses are viewable to everyone (until expiry).
create policy "Anyone can view active statuses"
on public.statuses for select
using (expires_at > now());

drop function if exists public.get_my_statuses();
create or replace function public.get_my_statuses()
returns setof public.statuses
language sql
security definer
as $$
  select *
  from public.statuses
  where user_id = auth.uid()
    and expires_at > now()
  order by created_at desc;
$$;

-- ==========================================
-- 8. Functions & RPCs
-- ==========================================

-- Get Nearby Users (Discovery)
-- Drop existing function if it exists to allow return type changes
drop function if exists public.get_nearby_users(float, float, int);

create or replace function public.get_nearby_users(
  lat float,
  long float,
  range_meters int default 5000
)
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  dist_meters float
)
language plpgsql
security definer
as $$
declare
  my_age_group text;
begin
  select coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end)
  into my_age_group
  from public.profiles p
  where p.id = auth.uid();

  return query
  select
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    st_distance(
      p.location,
      st_point(long, lat)::geography
    ) as dist_meters
  from
    public.profiles p
  where
    p.is_proxy_active = true
    and p.id <> auth.uid() -- exclude self
    and coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end) = coalesce(my_age_group, 'adult')
    and st_dwithin(
      p.location,
      st_point(long, lat)::geography,
      range_meters
    )
  order by
    dist_meters asc;
end;
$$;

-- Get City Users (Detailed Discovery)
-- Drop existing function if it exists to allow return type changes
drop function if exists public.get_city_users(float, float, int);

-- Helpers for City feed ranking (intent match, interest overlap %, currently-into match)
create or replace function public.flatten_interest_tags(details jsonb)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(distinct t), '{}'::text[])
  from (
    select lower(trim(val)) as t
    from jsonb_each(coalesce(details, '{}'::jsonb)) e(key, value)
    cross join lateral jsonb_array_elements_text(coalesce(e.value, '[]'::jsonb)) val
    where length(trim(val)) > 0
  ) s;
$$;

create or replace function public.interest_overlap_count(a jsonb, b jsonb)
returns int
language sql
stable
as $$
  select coalesce(count(*), 0)::int
  from unnest(public.flatten_interest_tags(a)) x
  join unnest(public.flatten_interest_tags(b)) y
    on x = y;
$$;

create or replace function public.interest_match_percent(a jsonb, b jsonb)
returns float
language sql
stable
as $$
  with
    aa as (select public.flatten_interest_tags(a) as arr),
    bb as (select public.flatten_interest_tags(b) as arr),
    overlap as (
      select coalesce(count(*), 0)::float as n
      from unnest((select arr from aa)) x
      join unnest((select arr from bb)) y on x = y
    ),
    denom as (
      select greatest(coalesce(array_length((select arr from aa), 1), 0), coalesce(array_length((select arr from bb), 1), 0))::float as d
    )
  select case
    when (select d from denom) <= 0 then 0
    else round(((((select n from overlap) / (select d from denom)) * 100.0))::numeric, 2)::float
  end;
$$;

create or replace function public.currently_into_matches(a text, b text)
returns boolean
language plpgsql
stable
as $$
declare
  na text;
  nb text;
begin
  na := lower(trim(coalesce(a, '')));
  nb := lower(trim(coalesce(b, '')));

  if na = '' or nb = '' then
    return false;
  end if;

  -- Exact match first
  if na = nb then
    return true;
  end if;

  -- Soft contains match (avoid tiny strings)
  if length(na) >= 4 and nb like '%' || na || '%' then
    return true;
  end if;
  if length(nb) >= 4 and na like '%' || nb || '%' then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.get_city_users(
  lat float,
  long float,
  range_meters int default 50000
)
returns table (
  id uuid,
  username text,
  full_name text,
  bio text,
  avatar_url text,
  relationship_goals text[],
  primary_goal text,
  detailed_interests jsonb,
  currently_into text,
  photos jsonb,
  dist_meters float,
  shared_interests_count int,
  interest_overlap_count int,
  interest_match_percent float,
  intent_match boolean,
  currently_into_match boolean,
  city text,
  state text,
  is_verified boolean,
  referral_count int,
  share_count int,
  has_sent_interest boolean,
  has_received_interest boolean,
  statuses jsonb,
  connection_id uuid
)
language plpgsql
security definer
as $$
declare
  my_details jsonb;
  my_age_group text;
  my_primary_goal text;
  my_romance_min int;
  my_romance_max int;
  my_currently_into text;
  my_primary_goal_norm text;
  my_gender text;
  my_romance_pref text;
begin
  select p.detailed_interests into my_details 
  from public.profiles p 
  where p.id = auth.uid();

  select
    coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end),
    p.relationship_goals[1],
    coalesce(p.romance_min_age, 18),
    coalesce(p.romance_max_age, 99),
    p.currently_into,
    p.gender,
    p.romance_preference
  into my_age_group, my_primary_goal, my_romance_min, my_romance_max, my_currently_into, my_gender, my_romance_pref
  from public.profiles p
  where p.id = auth.uid();

  my_primary_goal_norm := coalesce(my_primary_goal, case when coalesce(my_age_group, 'adult') = 'minor' then 'Friendship' else null end);

  return query
  select
    p.id,
    p.username,
    p.full_name,
    p.bio,
    p.avatar_url,
    p.relationship_goals,
    coalesce(p.relationship_goals[1], case when coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end) = 'minor' then 'Friendship' else null end) as primary_goal,
    p.detailed_interests,
    p.currently_into,
    (
        select jsonb_agg(jsonb_build_object('url', pp.image_url, 'order', pp.display_order) order by pp.display_order)
        from public.profile_photos pp
        where pp.user_id = p.id
    ) as photos,
    st_distance(
      p.location,
      st_point(long, lat)::geography
    ) as dist_meters,
    (
      select coalesce(sum(
        case 
          when (my_details ? key) then 
            1 + 
            (
              select count(*) * 5
              from jsonb_array_elements_text(coalesce(p.detailed_interests -> key, '[]'::jsonb)) val1
              join jsonb_array_elements_text(coalesce(my_details -> key, '[]'::jsonb)) val2 on lower(trim(val1)) = lower(trim(val2))
            )
          else 0
        end
      ), 0)::int
      from jsonb_object_keys(coalesce(p.detailed_interests, '{}'::jsonb)) as key
    ) as shared_interests_count,
    public.interest_overlap_count(my_details, p.detailed_interests) as interest_overlap_count,
    public.interest_match_percent(my_details, p.detailed_interests) as interest_match_percent,
    (
      my_primary_goal_norm is not null
      and coalesce(p.relationship_goals[1], case when coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end) = 'minor' then 'Friendship' else null end) = my_primary_goal_norm
    ) as intent_match,
    public.currently_into_matches(my_currently_into, p.currently_into) as currently_into_match,
    p.city,
    p.state,
    p.is_verified,
    p.referral_count,
    p.share_count,
    -- Check if I have sent an interest to them
    exists (
        select 1 from public.interests i 
        where i.sender_id = auth.uid() and i.receiver_id = p.id
    ) as has_sent_interest,
    -- Check if they have sent an interest to me
    exists (
        select 1 from public.interests i 
        where i.sender_id = p.id and i.receiver_id = auth.uid()
    ) as has_received_interest,
    -- Fetch active statuses
    (
        select jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'content', s.content,
                'type', s.type,
                'caption', s.caption,
                'created_at', s.created_at,
                'expires_at', s.expires_at
            ) order by s.created_at asc
        )
        from public.statuses s
        where s.user_id = p.id
          and s.expires_at > now()
    ) as statuses,
    (
        select i.id 
        from public.interests i
        where ((i.sender_id = auth.uid() and i.receiver_id = p.id) 
           or (i.sender_id = p.id and i.receiver_id = auth.uid()))
           and i.status = 'accepted'
        limit 1
    ) as connection_id
  from
    public.profiles p
  where
    p.id <> auth.uid()
    and coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end) = coalesce(my_age_group, 'adult')
    and not exists (
        select 1 from public.blocked_users b 
        where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and (
      coalesce(my_primary_goal, '') <> 'Romance'
      or (
        p.birthdate is not null
        and date_part('year', age(p.birthdate))::int between greatest(18, my_romance_min) and greatest(greatest(18, my_romance_min), my_romance_max)
      )
    )
    and st_dwithin(
      p.location,
      st_point(long, lat)::geography,
      range_meters
    )
  order by
    intent_match desc,
    (
      case
        when my_primary_goal_norm = 'Romance'
         and coalesce(p.relationship_goals[1], case when coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end) = 'minor' then 'Friendship' else null end) = 'Romance'
         and my_gender is not null and my_romance_pref is not null
         and p.gender is not null and p.romance_preference is not null
         and (
           (my_romance_pref = 'both' and p.gender in ('male','female'))
           or (my_romance_pref = p.gender)
           or (my_romance_pref = 'other' and p.gender = 'other')
         )
         and (
           (p.romance_preference = 'both' and my_gender in ('male','female'))
           or (p.romance_preference = my_gender)
           or (p.romance_preference = 'other' and my_gender = 'other')
         )
        then 1 else 0
      end
    ) desc,
    interest_match_percent desc,
    currently_into_match desc,
    dist_meters asc,
    shared_interests_count desc;
end;
$$;

-- Get Feed Users
-- Drop existing function if it exists to allow return type changes
drop function if exists public.get_feed_users(float, float, int);

create or replace function public.get_feed_users(
  lat float,
  long float,
  range_meters int default 20000
)
returns table (
  id uuid,
  username text,
  full_name text,
  bio text,
  avatar_url text,
  interests text[], -- Note: using text[] for simple interests if detailed_interests not used here
  photos jsonb,
  dist_meters float,
  shared_interests_count int,
  referral_count int,
  share_count int
)
language plpgsql
security definer
as $$
declare
  my_age_group text;
begin
  select coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end)
  into my_age_group
  from public.profiles p
  where p.id = auth.uid();

  return query
  select
    p.id,
    p.username,
    p.full_name,
    p.bio,
    p.avatar_url,
    NULL::text[] as interests, -- Placeholder
    NULL::jsonb as photos,
    st_distance(
      p.location,
      st_point(long, lat)::geography
    ) as dist_meters,
    0 as shared_interests_count, -- Placeholder logic
    p.referral_count,
    p.share_count
  from
    public.profiles p
  where
    p.is_proxy_active = true
    and p.id <> auth.uid()
    and coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end) = coalesce(my_age_group, 'adult')
    and st_dwithin(
      p.location,
      st_point(long, lat)::geography,
      range_meters
    )
  order by
    dist_meters asc;
end;
$$;

-- Prevent cross-age connections (no minor-adult interactions via interests)
create or replace function public.enforce_interest_age_segmentation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_group text;
  receiver_group text;
begin
  select coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end)
  into sender_group
  from public.profiles p
  where p.id = new.sender_id;

  select coalesce(p.age_group, case when p.birthdate is not null and date_part('year', age(p.birthdate))::int < 18 then 'minor' else 'adult' end)
  into receiver_group
  from public.profiles p
  where p.id = new.receiver_id;

  if coalesce(sender_group, 'adult') <> coalesce(receiver_group, 'adult') then
    raise exception 'Age-restricted: users must be in the same age group.';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'a_interests_enforce_age_segmentation') then
    create trigger a_interests_enforce_age_segmentation
    before insert or update of sender_id, receiver_id
    on public.interests
    for each row
    execute function public.enforce_interest_age_segmentation();
  end if;
end $$;

-- Get city user count (for referral popup eligibility)
-- Drop existing function if it exists to allow return type changes
drop function if exists public.get_city_user_count(text);

CREATE OR REPLACE FUNCTION get_city_user_count(check_city text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_count int;
BEGIN
    -- Count users where city matches
    SELECT count(*) INTO user_count 
    FROM public.profiles 
    WHERE city IS NOT NULL AND city = check_city;
    RETURN user_count;
END;
$$;

-- Get User Connection Stats
-- Drop existing function if it exists to allow return type changes
drop function if exists public.get_user_connection_stats(uuid);

CREATE OR REPLACE FUNCTION get_user_connection_stats(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total int;
  romance int;
  friendship int;
  business int;
  is_hidden boolean;
BEGIN
  -- Check privacy setting
  SELECT hide_connections INTO is_hidden FROM public.profiles WHERE id = target_user_id;

  -- Count total unique accepted connections
  SELECT count(*) INTO total 
  FROM public.interests 
  WHERE (sender_id = target_user_id OR receiver_id = target_user_id) 
  AND status = 'accepted';

  -- Count by Partner's Current Intent (Live from profiles table)
  WITH partners AS (
    SELECT 
      CASE 
        WHEN sender_id = target_user_id THEN receiver_id 
        ELSE sender_id 
      END as partner_id
    FROM public.interests
    WHERE (sender_id = target_user_id OR receiver_id = target_user_id)
    AND status = 'accepted'
  )
  SELECT 
    count(*) FILTER (WHERE p.relationship_goals @> '{"Romance"}'),
    count(*) FILTER (WHERE p.relationship_goals @> '{"Friendship"}'),
    count(*) FILTER (WHERE p.relationship_goals @> '{"Business"}')
  INTO romance, friendship, business
  FROM partners
  JOIN public.profiles p ON p.id = partners.partner_id;

  RETURN jsonb_build_object(
    'total', total,
    'romance', coalesce(romance, 0),
    'friendship', coalesce(friendship, 0),
    'business', coalesce(business, 0),
    'hidden', coalesce(is_hidden, false)
  );
END;
$$;

-- Get User Connections List (for Club Invites etc)
-- Drop existing function if it exists to allow return type changes
drop function if exists public.get_user_connections_list(uuid, text);

CREATE OR REPLACE FUNCTION get_user_connections_list(
  target_user_id uuid, 
  filter_intent text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  relationship_goals text[],
  bio text,
  is_verified boolean
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  is_hidden boolean;
BEGIN
  -- Check privacy
  -- NOTE: qualify `profiles.id` because `id` is also an output column variable in RETURNS TABLE.
  SELECT p.hide_connections INTO is_hidden
  FROM public.profiles p
  WHERE p.id = target_user_id;
  
  -- If hidden and viewer is NOT the target user, return nothing
  IF is_hidden AND auth.uid() <> target_user_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH partners AS (
    SELECT 
      CASE 
        WHEN sender_id = target_user_id THEN receiver_id 
        ELSE sender_id 
      END as partner_id
    FROM public.interests
    WHERE (sender_id = target_user_id OR receiver_id = target_user_id)
    AND status = 'accepted'
  )
  SELECT 
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.relationship_goals,
    p.bio,
    p.is_verified
  FROM partners
  JOIN public.profiles p ON p.id = partners.partner_id
  WHERE (filter_intent IS NULL OR p.relationship_goals @> ARRAY[filter_intent]::text[]);
END;
$$;
