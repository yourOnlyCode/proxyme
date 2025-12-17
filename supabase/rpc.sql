-- Database function to find nearby users
-- Drop existing function if it exists to avoid conflicts
drop function if exists get_nearby_users;

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

