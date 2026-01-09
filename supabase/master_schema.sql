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
  detailed_interests jsonb,
  is_verified boolean DEFAULT false,
  city text,
  state text,
  status_text text,
  status_image_url text,
  status_created_at timestamptz,

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
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'detailed_interests') then
        alter table public.profiles add column detailed_interests jsonb;
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
          
          -- Unlock verification automatically at 3 referrals
          if current_count >= 3 then
              update public.profiles set is_verified = true where id = referrer_id;
          end if;
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

  -- Unlock verification automatically at 3 referrals
  if current_count >= 3 then
    update public.profiles set is_verified = true where id = referrer_id;
  end if;

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
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.clubs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    city TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    max_member_count INTEGER CHECK (max_member_count IS NULL OR max_member_count > 0)
);

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
    WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners can update their clubs"
    ON public.clubs FOR UPDATE
    USING ((SELECT auth.uid()) = owner_id);

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
    WITH CHECK ((SELECT auth.uid()) = user_id OR 
               EXISTS (SELECT 1 FROM public.clubs WHERE id = club_id AND owner_id = (SELECT auth.uid())));

CREATE POLICY "Users can leave clubs"
    ON public.club_members FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Admins/Owners can update member status"
    ON public.club_members FOR UPDATE
    USING (
        (SELECT auth.uid()) = user_id OR -- Accept invite
        EXISTS (SELECT 1 FROM public.club_members WHERE club_id = club_members.club_id AND user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin'))
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rsvp_count_going INTEGER DEFAULT 0,
    rsvp_count_maybe INTEGER DEFAULT 0,
    rsvp_count_cant INTEGER DEFAULT 0
);

ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;

drop policy if exists "Events viewable by club members" on public.club_events;
drop policy if exists "Admins/Owners can create events" on public.club_events;

CREATE POLICY "Events viewable by club members"
    ON public.club_events FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.club_members WHERE club_id = club_events.club_id AND user_id = (SELECT auth.uid()) AND status = 'accepted'));

CREATE POLICY "Admins/Owners can create events"
    ON public.club_events FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.club_members WHERE club_id = club_events.club_id AND user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin') AND status = 'accepted')
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

CREATE POLICY "Members can view event RSVPs"
    ON public.club_event_rsvps FOR SELECT
    USING (true);

CREATE POLICY "Members can manage their own RSVPs"
    ON public.club_event_rsvps FOR ALL
    USING (user_id = (SELECT auth.uid()));


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
    USING (EXISTS (SELECT 1 FROM public.club_members WHERE club_id = club_forum_topics.club_id AND user_id = (SELECT auth.uid()) AND status = 'accepted'));

CREATE POLICY "Members can create topics"
    ON public.club_forum_topics FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.club_members WHERE club_id = club_forum_topics.club_id AND user_id = (SELECT auth.uid()) AND status = 'accepted'));

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
    WITH CHECK ((SELECT auth.uid()) = created_by);

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
begin
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
  detailed_interests jsonb,
  photos jsonb,
  dist_meters float,
  shared_interests_count int,
  city text,
  state text,
  is_verified boolean,
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
begin
  select p.detailed_interests into my_details 
  from public.profiles p 
  where p.id = auth.uid();

  return query
  select
    p.id,
    p.username,
    p.full_name,
    p.bio,
    p.avatar_url,
    p.relationship_goals,
    p.detailed_interests,
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
              from jsonb_array_elements_text(p.detailed_interests -> key) val1
              join jsonb_array_elements_text(my_details -> key) val2 on lower(trim(val1)) = lower(trim(val2))
            )
          else 0
        end
      ), 0)::int
      from jsonb_object_keys(p.detailed_interests) as key
    ) as shared_interests_count,
    p.city,
    p.state,
    p.is_verified,
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
        where s.user_id = p.id and s.expires_at > now()
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
    and not exists (
        select 1 from public.blocked_users b 
        where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and st_dwithin(
      p.location,
      st_point(long, lat)::geography,
      range_meters
    )
  order by
    shared_interests_count desc,
    dist_meters asc;
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
  shared_interests_count int
)
language plpgsql
security definer
as $$
begin
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
    0 as shared_interests_count -- Placeholder logic
  from
    public.profiles p
  where
    p.is_proxy_active = true
    and p.id <> auth.uid()
    and st_dwithin(
      p.location,
      st_point(long, lat)::geography,
      range_meters
    )
  order by
    dist_meters asc;
end;
$$;

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
