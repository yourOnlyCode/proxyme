-- Add detailed_interests column to profiles
alter table public.profiles add column if not exists detailed_interests jsonb default '{}'::jsonb;

-- Update Feed Algorithm to use detailed matching
-- Matching Logic:
-- +1 point for same Category (e.g. both selected "Gaming")
-- +5 points for exact Sub-Interest match (e.g. both typed "Elden Ring")

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
  interests text[],
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
    p.interests,
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
            1 + -- Category Match (+1)
            (
              -- Count Sub-Interest Matches (+5 each)
              -- We do a simple text overlap check using jsonb conversion
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

