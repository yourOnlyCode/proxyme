-- Drop the old 'posts' concept if we aren't using it, or just ignore it.
-- Let's create a dedicated table for profile photos

create table public.profile_photos (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  image_url text not null,
  display_order int check (display_order >= 0 and display_order < 5), -- Max 5 photos
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS for profile_photos
alter table public.profile_photos enable row level security;

create policy "Photos are viewable by everyone."
  on public.profile_photos for select
  using ( true );

create policy "Users can manage their own photos."
  on public.profile_photos for all
  using ( auth.uid() = user_id );

-- Add interests column to profiles
alter table public.profiles add column if not exists interests text[] default '{}';

-- Update the nearby users function to include interests and photos
drop function if exists get_feed_users;

create or replace function public.get_feed_users(
  lat float,
  long float,
  range_meters int default 20000 -- 20km default for "City"
)
returns table (
  id uuid,
  username text,
  full_name text,
  bio text,
  avatar_url text,
  interests text[],
  photos jsonb,
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
    ) as dist_meters
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

