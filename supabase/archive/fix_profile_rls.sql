-- Ensure robust RLS for profiles
-- Drop existing policies to avoid conflicts/duplicates
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can update own profile." on public.profiles;

-- Create comprehensive policies
create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on public.profiles for update
  using ( auth.uid() = id );

-- Important: Grant permissions if they were somehow revoked
grant all on table public.profiles to authenticated;

