-- Optional cleanup: normalize existing notifications.type values so the CHECK constraint can be VALIDATED.
--
-- When to run:
-- - AFTER running `supabase/master_schema.sql` (which adds the CHECK as NOT VALID so it won't fail on legacy rows).
--
-- What it does:
-- 1) Shows invalid types
-- 2) Remaps invalid types into the allowed set (best-effort) and preserves the original in `data.legacy_type`
-- 3) Validates the constraint

-- 0) Quick visibility: what types exist?
select type, count(*) as cnt
from public.notifications
group by type
order by cnt desc;

-- 1) Find types that are NOT in the allowed list.
-- Keep this list in sync with the constraint in master_schema.sql.
with allowed as (
  select unnest(array[
    'forum_reply',
    'club_event',
    'club_member',
    'club_invite',
    'club_join_request',
    'club_join_accepted',
    'connection_request',
    'connection_accepted',
    'message',
    'event_rsvp',
    'event_update',
    'event_organizer_update',
    'event_reminder',
    'event_cancelled',
    'event_rsvp_update',
    'event_comment'
  ]::text[]) as t
)
select n.type, count(*) as cnt
from public.notifications n
left join allowed a on a.t = n.type
where a.t is null
group by n.type
order by cnt desc;

-- 2) Normalize invalid legacy types into allowed values.
-- IMPORTANT: This is best-effort mapping. We keep the original under data.legacy_type for auditability.
update public.notifications n
set
  data = jsonb_set(coalesce(n.data, '{}'::jsonb), '{legacy_type}', to_jsonb(n.type), true),
  type = case
    when n.type is null or btrim(n.type) = '' then 'event_update'

    -- Common legacy variants
    when lower(n.type) in ('dm', 'chat', 'message_received') then 'message'
    when lower(n.type) in ('conn_request', 'connection', 'connection_pending') then 'connection_request'
    when lower(n.type) in ('conn_accepted', 'connection_connected') then 'connection_accepted'

    -- Club-related legacy
    when lower(n.type) like 'club_%' and lower(n.type) like '%invite%' then 'club_invite'
    when lower(n.type) like 'club_%' and lower(n.type) like '%join%' and lower(n.type) like '%request%' then 'club_join_request'
    when lower(n.type) like 'club_%' and lower(n.type) like '%join%' and lower(n.type) like '%accept%' then 'club_join_accepted'
    when lower(n.type) like 'club_%' and lower(n.type) like '%member%' then 'club_member'
    when lower(n.type) like 'club_%' and lower(n.type) like '%event%' then 'club_event'

    -- Event-related legacy
    when lower(n.type) like 'event_%' and lower(n.type) like '%rsvp%' then 'event_rsvp_update'
    when lower(n.type) like 'event_%' and lower(n.type) like '%remind%' then 'event_reminder'
    when lower(n.type) like 'event_%' and lower(n.type) like '%cancel%' then 'event_cancelled'
    when lower(n.type) like 'event_%' and lower(n.type) like '%comment%' then 'event_comment'
    when lower(n.type) like 'event_%' and lower(n.type) like '%organizer%' then 'event_organizer_update'
    when lower(n.type) like 'event_%' then 'event_update'

    -- Fallback: treat as a generic event_update
    else 'event_update'
  end
where n.type is distinct from all(array[
  'forum_reply',
  'club_event',
  'club_member',
  'club_invite',
  'club_join_request',
  'club_join_accepted',
  'connection_request',
  'connection_accepted',
  'message',
  'event_rsvp',
  'event_update',
  'event_organizer_update',
  'event_reminder',
  'event_cancelled',
  'event_rsvp_update',
  'event_comment'
]::text[]);

-- 3) Validate the constraint (will error if any invalid remain).
alter table public.notifications validate constraint notifications_type_check;

