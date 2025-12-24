-- Safety Features: Blocking & Reporting

-- 1. Create Blocks Table
create table if not exists public.blocks (
  id uuid default gen_random_uuid() primary key,
  blocker_id uuid references auth.users(id) not null,
  blocked_id uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  unique(blocker_id, blocked_id)
);

-- RLS for Blocks
alter table public.blocks enable row level security;

create policy "Users can insert their own blocks"
  on public.blocks for insert
  with check (auth.uid() = blocker_id);

create policy "Users can see who they blocked"
  on public.blocks for select
  using (auth.uid() = blocker_id);

create policy "Users can delete their own blocks"
  on public.blocks for delete
  using (auth.uid() = blocker_id);


-- 2. Create Reports Table
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references auth.users(id) not null,
  reported_id uuid references auth.users(id) not null,
  reason text not null,
  status text default 'pending', -- pending, reviewed, dismissed
  created_at timestamptz default now()
);

-- RLS for Reports
alter table public.reports enable row level security;

create policy "Users can insert reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- Only admins/moderators can view reports (handled via Supabase Dashboard or Admin API)
-- For now, no public select policy.


-- 3. Update Feed Query to Exclude Blocked Users
-- We need to modify get_feed_users to filter out:
-- a) Users I have blocked
-- b) Users who have blocked me

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
  relationship_goals text[],
  detailed_interests jsonb,
  photos jsonb,
  dist_meters float,
  shared_interests_count int
)
language plpgsql
security definer
as $$
declare
  my_details jsonb;
begin
  -- Get current user's detailed interests
  select detailed_interests into my_details from public.profiles where id = auth.uid();

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
      -- Calculate match score
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
    ) as shared_interests_count
  from
    public.profiles p
  where
    p.is_proxy_active = true
    and p.id <> auth.uid()
    -- BLOCKING LOGIC START
    and not exists (
        select 1 from public.blocks b 
        where (b.blocker_id = auth.uid() and b.blocked_id = p.id) -- I blocked them
           or (b.blocker_id = p.id and b.blocked_id = auth.uid()) -- They blocked me
    )
    -- BLOCKING LOGIC END
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

