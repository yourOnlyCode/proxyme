-- Efficient inbox query:
-- Returns accepted conversations with partner profile, last message, and unread count
-- in a single roundtrip (scales much better than fetching all messages client-side).

create or replace function public.get_my_inbox_conversations()
returns table (
  id uuid,
  connection_created_at timestamptz,
  partner_id uuid,
  partner_username text,
  partner_avatar_url text,
  last_message_content text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid,
  unread_count int
)
language sql
security definer
set search_path = public
as $$
  with conv as (
    select
      i.id,
      i.created_at as connection_created_at,
      case
        when i.sender_id = auth.uid() then i.receiver_id
        else i.sender_id
      end as partner_id
    from public.interests i
    where
      (i.sender_id = auth.uid() or i.receiver_id = auth.uid())
      and i.status = 'accepted'
  )
  select
    c.id,
    c.connection_created_at,
    p.id as partner_id,
    p.username as partner_username,
    p.avatar_url as partner_avatar_url,
    lm.content as last_message_content,
    lm.created_at as last_message_created_at,
    lm.sender_id as last_message_sender_id,
    coalesce(uc.unread_count, 0) as unread_count
  from conv c
  join public.profiles p on p.id = c.partner_id
  left join lateral (
    select m.content, m.created_at, m.sender_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::int as unread_count
    from public.messages m
    where
      m.conversation_id = c.id
      and m.receiver_id = auth.uid()
      and m.read = false
  ) uc on true
  order by coalesce(lm.created_at, c.connection_created_at) desc;
$$;

revoke all on function public.get_my_inbox_conversations() from public;
grant execute on function public.get_my_inbox_conversations() to authenticated;

