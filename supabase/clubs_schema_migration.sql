-- Migration script for clubs schema
-- This script updates existing clubs tables and policies
-- Run this if the tables already exist

-- Drop existing policies to avoid conflicts
drop policy if exists "Members can view other members" on public.club_members;
drop policy if exists "Admins can invite members" on public.club_members;
drop policy if exists "Admins can update members" on public.club_members;
drop policy if exists "Manage membership" on public.club_members;
drop policy if exists "Members can view messages" on public.club_messages;
drop policy if exists "Members can send messages" on public.club_messages;
drop policy if exists "Owners and Admins can update clubs" on public.clubs;

-- Drop existing functions if they exist
drop function if exists is_club_admin(uuid, uuid);
drop function if exists is_club_member(uuid, uuid);

-- Create security definer helper functions to check membership without recursion
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

-- Recreate policies for Club Members (fixed to avoid recursion)
-- Since clubs are public, allow viewing members of any club
create policy "Members can view other members"
  on public.club_members for select
  using (
    user_id = auth.uid() -- Can view own membership
    or true -- Allow viewing all members (clubs are public anyway)
  );

-- Admins/Owners can invite members (insert invites)
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

-- Recreate policies for Club Messages
create policy "Members can view messages"
  on public.club_messages for select
  using (
    is_club_member(club_id, auth.uid())
  );

create policy "Members can send messages"
  on public.club_messages for insert
  with check (
    auth.uid() = sender_id
    and is_club_member(club_id, auth.uid())
  );

-- Update the clubs update policy to also allow admins
create policy "Owners and Admins can update clubs"
  on public.clubs for update
  using (
    auth.uid() = owner_id -- Owner can always update
    or is_club_admin(id, auth.uid()) -- Admins can update
  );

