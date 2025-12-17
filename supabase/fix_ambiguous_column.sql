-- Fix Ambiguous Column Error in get_feed_users
-- The error occurs because the output parameter 'detailed_interests' has the same name 
-- as the table column, confusing the PL/pgSQL parser in the SELECT INTO statement.

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
  -- Fix: Qualify the table column with an alias 'p' to distinguish from the output parameter
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

