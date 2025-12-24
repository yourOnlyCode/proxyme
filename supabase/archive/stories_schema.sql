-- Create statuses table for stacked updates (Status)
create table if not exists public.statuses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text, -- Text content or Image URL
  type text check (type in ('text', 'image')),
  caption text, -- Optional caption for images
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours')
);

-- RLS
alter table public.statuses enable row level security;

create policy "Users can insert their own statuses"
on public.statuses for insert
with check (auth.uid() = user_id);

create policy "Users can update their own statuses"
on public.statuses for update
using (auth.uid() = user_id);

create policy "Users can delete their own statuses"
on public.statuses for delete
using (auth.uid() = user_id);

create policy "Anyone can view active statuses"
on public.statuses for select
using (expires_at > now());

-- RPC to get current user's active statuses (for My Status manager)
create or replace function get_my_statuses()
returns setof public.statuses
language sql
security definer
as $$
  select * from public.statuses
  where user_id = auth.uid()
  and expires_at > now()
  order by created_at desc;
$$;

-- Update get_city_users to return stacked statuses
drop function if exists public.get_city_users(double precision, double precision, integer);

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
  statuses jsonb, -- New column for stacked statuses
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
    -- Keep existing photos just in case, but they might not be used in Feed anymore
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
    exists (
        select 1 from public.interests i 
        where i.sender_id = auth.uid() and i.receiver_id = p.id
    ) as has_sent_interest,
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
        select 1 from public.blocks b 
        where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and st_dwithin(
      p.location,
      st_point(long, lat)::geography,
      range_meters
    )
    -- Filter out users who have NO active statuses (since feed is status-based now)
    and exists (
        select 1 from public.statuses s
        where s.user_id = p.id and s.expires_at > now()
    )
  order by
    shared_interests_count desc,
    dist_meters asc;
end;
$$;

