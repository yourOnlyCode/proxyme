-- Remove a connection between the current user and a partner
-- This marks the accepted interest record as declined.
--
-- Run this SQL in your Supabase SQL Editor.

create or replace function public.remove_connection(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.interests
  set status = 'declined'
  where status = 'accepted'
    and (
      (sender_id = auth.uid() and receiver_id = p_partner_id)
      or
      (sender_id = p_partner_id and receiver_id = auth.uid())
    );
end;
$$;

revoke all on function public.remove_connection(uuid) from public;
grant execute on function public.remove_connection(uuid) to authenticated;

