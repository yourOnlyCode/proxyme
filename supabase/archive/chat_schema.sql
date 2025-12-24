-- Create messages table
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.interests(id) not null, -- Reuse interest ID as conversation ID
  sender_id uuid references public.profiles(id) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS for messages
alter table public.messages enable row level security;

-- Users can view messages in conversations they are part of
create policy "Users can view messages in their conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.interests
      where id = messages.conversation_id
      and (sender_id = auth.uid() or receiver_id = auth.uid())
    )
  );

-- Users can insert messages into conversations they are part of
create policy "Users can send messages to their conversations"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.interests
      where id = conversation_id
      and (sender_id = auth.uid() or receiver_id = auth.uid())
      and status = 'accepted' -- Only allow chatting if accepted
    )
  );

-- Realtime
alter publication supabase_realtime add table public.messages;

