-- Add type to interests
alter table public.interests add column if not exists type text default 'standard' check (type in ('standard', 'penpal'));

-- RPC to find and message a random penpal
create or replace function send_penpal_message(content text)
returns jsonb
language plpgsql
security definer
as $$
declare
  me_id uuid;
  me_city text;
  me_verified boolean;
  target_id uuid;
  my_penpal_count int;
  new_connection_id uuid;
begin
  me_id := auth.uid();
  select city, is_verified into me_city, me_verified from public.profiles where id = me_id;

  -- 1. Check my limit
  select count(*) into my_penpal_count from public.interests 
  where (sender_id = me_id or receiver_id = me_id) 
  and type = 'penpal' and status = 'accepted';

  if my_penpal_count >= 1 and me_verified = false then
    return jsonb_build_object('success', false, 'error', 'limit_reached');
  end if;

  -- 2. Find random target
  -- Candidates must:
  -- - Not be me
  -- - Be in different city
  -- - Not already connected/blocked
  -- - Have space for a penpal (0 if not verified, unlimited if verified)
  
  with candidates as (
      select p.id, p.is_verified
      from public.profiles p
      where p.id != me_id
      and (p.city is distinct from me_city)
      and not exists (
          select 1 from public.interests i 
          where (i.sender_id = me_id and i.receiver_id = p.id)
             or (i.sender_id = p.id and i.receiver_id = me_id)
      )
      and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = me_id and b.blocked_id = p.id)
             or (b.blocker_id = p.id and b.blocked_id = me_id)
      )
  ),
  qualified_candidates as (
      select c.id
      from candidates c
      left join public.interests i on (i.sender_id = c.id or i.receiver_id = c.id) and i.type = 'penpal' and i.status = 'accepted'
      group by c.id, c.is_verified
      having (c.is_verified = true or count(i.id) < 1)
  )
  select id into target_id from qualified_candidates order by random() limit 1;

  if target_id is null then
     return jsonb_build_object('success', false, 'error', 'no_users_found');
  end if;

  -- 3. Create Connection
  insert into public.interests (sender_id, receiver_id, status, type)
  values (me_id, target_id, 'accepted', 'penpal')
  returning id into new_connection_id;

  -- 4. Send Message
  insert into public.messages (connection_id, sender_id, content, type)
  values (new_connection_id, me_id, content, 'text');

  return jsonb_build_object('success', true, 'connection_id', new_connection_id);
end;
$$;

