-- Allow users to delete their own account safely
-- This function deletes their profile data. 
-- Supabase Auth user deletion usually requires a Service Role key or Edge Function.
-- For this MVP, we will delete the 'public.profiles' row which cascades to other data.
-- Then the client signs out.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
as $$
begin
  -- Delete from public.profiles
  -- Cascade delete will handle: profile_photos, interests, messages, reports, blocks
  delete from public.profiles where id = auth.uid();
end;
$$;

