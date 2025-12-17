-- Advanced Feed Algorithm
-- 1. Filters by range
-- 2. Calculates shared interests
-- 3. Ranks by Shared Interest Count (DESC) then Distance (ASC)

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
  photos jsonb,
  dist_meters float,
  shared_interests_count int
)
language plpgsql
security definer
as $$
declare
  my_interests text[];
begin
  -- Get current user's interests
  select interests into my_interests from public.profiles where id = auth.uid();

  return query
  select
    p.id,
    p.username,
    p.full_name,
    p.bio,
    p.avatar_url,
    p.interests,
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
      select count(*)
      from unnest(p.interests) i
      where i = any(my_interests)
    )::int as shared_interests_count
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

