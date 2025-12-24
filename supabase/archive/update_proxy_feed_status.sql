drop function if exists public.get_feed_users(double precision, double precision, integer);

create or replace function public.get_feed_users(
  lat float,
  long float,
  range_meters int default 92
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
  has_sent_interest boolean,
  has_received_interest boolean,
  status_text text,
  status_image_url text,
  status_created_at timestamptz,
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
    exists (
        select 1 from public.interests i 
        where i.sender_id = auth.uid() and i.receiver_id = p.id
    ) as has_sent_interest,
    exists (
        select 1 from public.interests i 
        where i.sender_id = p.id and i.receiver_id = auth.uid()
    ) as has_received_interest,
    -- Fetch latest active status (text or image caption)
    (
        select s.content from public.statuses s 
        where s.user_id = p.id and s.type = 'text' and s.expires_at > now() 
        order by s.created_at desc limit 1
    ) as status_text,
    -- Fetch latest active image
    (
        select s.content from public.statuses s 
        where s.user_id = p.id and s.type = 'image' and s.expires_at > now() 
        order by s.created_at desc limit 1
    ) as status_image_url,
    -- Fetch latest status time
    (
        select s.created_at from public.statuses s 
        where s.user_id = p.id and s.expires_at > now() 
        order by s.created_at desc limit 1
    ) as status_created_at,
    (
      select i.id from public.interests i 
      where ((i.sender_id = auth.uid() and i.receiver_id = p.id) or (i.sender_id = p.id and i.receiver_id = auth.uid()))
      and i.status = 'accepted'
      limit 1
    ) as connection_id
  from
    public.profiles p
  where
    p.is_proxy_active = true
    and p.id <> auth.uid()
    and (p.last_seen > now() - interval '1 hour')
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
  order by
    shared_interests_count desc,
    dist_meters asc;
end;
$$;

