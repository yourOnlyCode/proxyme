-- Create clubs table
create table public.clubs (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  image_url text,
  city text not null, -- Hub for the city
  owner_id uuid references public.profiles(id) not null
);

-- Create club_members table
create table public.club_members (
  id uuid default uuid_generate_v4() primary key,
  club_id uuid references public.clubs(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'invited')), -- 'invited' means owner invited user, 'pending' could mean user requested join (if we allow that later)
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(club_id, user_id)
);

-- Create club_messages table
create table public.club_messages (
  id uuid default uuid_generate_v4() primary key,
  club_id uuid references public.clubs(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_messages enable row level security;

-- Policies for Clubs
-- Everyone can view clubs (Discovery)
create policy "Clubs are viewable by everyone"
  on public.clubs for select
  using (true);

-- Authenticated users can create clubs (limit check will be in application logic or trigger, but basic RLS here)
create policy "Users can create clubs"
  on public.clubs for insert
  with check (auth.uid() = owner_id);

-- Owners and Admins can update clubs
-- Note: This policy will be updated after the helper functions are created
-- For now, owners can always update
create policy "Owners and Admins can update clubs"
  on public.clubs for update
  using (auth.uid() = owner_id);

-- Owner can delete club
create policy "Owner can delete club"
  on public.clubs for delete
  using (auth.uid() = owner_id);

-- Policies for Club Members
-- Since clubs are public, allow viewing members of any club
-- Users can always view their own membership
create policy "Members can view other members"
  on public.club_members for select
  using (
    user_id = auth.uid() -- Can view own membership
    or true -- Allow viewing all members (clubs are public anyway)
  );

-- Admins/Owners can invite members (insert invites)
-- Use security definer functions to check membership without recursion
create or replace function is_club_admin(p_club_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from public.club_members
    where club_id = p_club_id
    and user_id = p_user_id
    and role in ('owner', 'admin')
    and status = 'accepted'
  );
end;
$$;

create or replace function is_club_member(p_club_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from public.club_members
    where club_id = p_club_id
    and user_id = p_user_id
    and status = 'accepted'
  );
end;
$$;

create policy "Admins can invite members"
  on public.club_members for insert
  with check (
    is_club_admin(club_id, auth.uid())
    or auth.uid() = user_id -- Users can request to join (insert themselves with status 'pending')
  );

-- Admins/Owners can update members (promote, accept requests if any)
create policy "Admins can update members"
  on public.club_members for update
  using (
    is_club_admin(club_id, auth.uid())
    or user_id = auth.uid() -- Users can update their own status (e.g., accept invite)
  );

-- Users can delete their own membership (leave), Owners/Admins can remove others
create policy "Manage membership"
  on public.club_members for delete
  using (
    user_id = auth.uid() -- Leave
    or is_club_admin(club_id, auth.uid()) -- Admins can remove others
  );

-- Policies for Club Messages
-- Members can view messages
create policy "Members can view messages"
  on public.club_messages for select
  using (
    is_club_member(club_id, auth.uid())
  );

-- Members can send messages
create policy "Members can send messages"
  on public.club_messages for insert
  with check (
    auth.uid() = sender_id
    and is_club_member(club_id, auth.uid())
  );

-- Update the clubs update policy to also allow admins (after functions are defined)
drop policy if exists "Owners and Admins can update clubs" on public.clubs;
create policy "Owners and Admins can update clubs"
  on public.clubs for update
  using (
    auth.uid() = owner_id -- Owner can always update
    or is_club_admin(id, auth.uid()) -- Admins can update
  );

-- Helper function to check club creation limits
create or replace function check_club_creation_limit()
returns trigger as $$
declare
  is_verified boolean;
  club_count int;
begin
  select p.is_verified into is_verified from public.profiles p where p.id = auth.uid();
  select count(*) into club_count from public.clubs where owner_id = auth.uid();
  
  if is_verified = false and club_count >= 1 then
    raise exception 'Unverified users can only create 1 club.';
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Trigger for creation limit
-- Note: triggers on 'before insert' usually need to handle the new row.
-- Since RLS handles the 'auth.uid() = owner_id' check, we can trust auth.uid() here or use NEW.owner_id
-- We'll attach it to the table.
create trigger check_club_limit
before insert on public.clubs
for each row
execute function check_club_creation_limit();

-- Function to check join limit (Max 3 clubs)
create or replace function check_club_join_limit()
returns trigger as $$
declare
  joined_count int;
begin
  -- Only check if status is becoming 'accepted'
  if NEW.status = 'accepted' and (OLD.status is null or OLD.status != 'accepted') then
      select count(*) into joined_count 
      from public.club_members 
      where user_id = NEW.user_id 
      and status = 'accepted';
      
      if joined_count >= 3 then
         -- Allow if verified? Prompt implies strict limit of 3 for joining.
         -- "Users can join a max of three clubs" - unqualified.
         -- "and create a max of one unless they are verified" - qualified creation.
         -- I will assume the 3 limit is strict for now.
         raise exception 'You can only join up to 3 clubs.';
      end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger check_join_limit
before insert or update on public.club_members
for each row
execute function check_club_join_limit();

-- Realtime for messages
alter publication supabase_realtime add table public.club_messages;
