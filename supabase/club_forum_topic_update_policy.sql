-- Allow topic creators and club owners/admins to update and delete forum topics.
-- Required for editing topics and pinning/unpinning. Safe to re-run.

drop policy if exists "Topic creators and admins can update topics" on public.club_forum_topics;
create policy "Topic creators and admins can update topics"
  on public.club_forum_topics for update
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.club_members cm
      where cm.club_id = club_forum_topics.club_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
        and cm.status = 'accepted'
    )
  );

drop policy if exists "Topic creators and admins can delete topics" on public.club_forum_topics;
create policy "Topic creators and admins can delete topics"
  on public.club_forum_topics for delete
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.club_members cm
      where cm.club_id = club_forum_topics.club_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
        and cm.status = 'accepted'
    )
  );
