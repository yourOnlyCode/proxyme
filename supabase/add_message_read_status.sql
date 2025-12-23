-- Add read status to messages table
alter table public.messages 
add column if not exists read boolean default false;

-- Add read_at timestamp for tracking when message was read
alter table public.messages 
add column if not exists read_at timestamp with time zone;

-- Create index for faster unread queries
create index if not exists idx_messages_unread 
on public.messages(conversation_id, read) 
where read = false;

-- Create a security definer function to check if user can update message read status
create or replace function public.can_update_message_read(p_message_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid;
  v_conversation_id uuid;
  v_is_participant boolean;
begin
  -- Get message details
  select sender_id, conversation_id 
  into v_sender_id, v_conversation_id
  from public.messages
  where id = p_message_id;
  
  if v_sender_id is null or v_conversation_id is null then
    return false;
  end if;
  
  -- User cannot mark their own messages as read
  if v_sender_id = p_user_id then
    return false;
  end if;
  
  -- Check if user is part of the conversation
  select exists (
    select 1 from public.interests
    where id = v_conversation_id
    and (sender_id = p_user_id or receiver_id = p_user_id)
  ) into v_is_participant;
  
  return v_is_participant;
end;
$$;

-- Drop existing policy if it exists (to avoid conflicts)
drop policy if exists "Users can mark messages as read" on public.messages;

-- Update RLS to allow users to update read status for messages they receive
create policy "Users can mark messages as read"
  on public.messages for update
  using (
    -- Use security definer function to avoid recursion
    public.can_update_message_read(id, auth.uid())
  )
  with check (
    -- Use security definer function to avoid recursion
    public.can_update_message_read(id, auth.uid())
  );

