-- Enable PostGIS
create extension if not exists postgis;

-- Create profiles table
create table public.profiles (
  id uuid references auth.users not null primary key,
  updated_at timestamp with time zone,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  is_proxy_active boolean default false,
  location geography(Point, 4326),
  last_seen timestamp with time zone default timezone('utc'::text, now()),

  constraint username_length check (char_length(username) >= 3)
);

-- RLS for profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on public.profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on public.profiles for update
  using ( auth.uid() = id );

-- Create posts table
create table public.posts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  image_url text not null,
  caption text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS for posts
alter table public.posts enable row level security;

create policy "Posts are viewable by everyone."
  on public.posts for select
  using ( true );

create policy "Users can create posts."
  on public.posts for insert
  with check ( auth.uid() = user_id );

-- Create interests table
create table public.interests (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references public.profiles(id) not null,
  receiver_id uuid references public.profiles(id) not null,
  status text check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS for interests
alter table public.interests enable row level security;

-- Sender can see their sent interests
create policy "Sender can view own sent interests"
  on public.interests for select
  using ( auth.uid() = sender_id );

-- Receiver can see their received interests
create policy "Receiver can view own received interests"
  on public.interests for select
  using ( auth.uid() = receiver_id );

-- Users can send interest
create policy "Users can send interest"
  on public.interests for insert
  with check ( auth.uid() = sender_id );

-- Users can update status (accept/decline) if they are receiver
create policy "Receiver can update status"
  on public.interests for update
  using ( auth.uid() = receiver_id );

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

-- Trigger the function every time a user is created
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Index for spatial queries
create index profiles_geo_index on public.profiles using GIST (location);

