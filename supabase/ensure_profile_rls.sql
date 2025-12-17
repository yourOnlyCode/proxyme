-- Ensure users can update their own profile
create policy "Users can update their own profile."
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );

-- Ensure users can insert their own profile (if not exists)
create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = id );

