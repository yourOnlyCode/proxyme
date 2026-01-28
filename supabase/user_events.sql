-- User-owned events (outside clubs)
-- This extends `public.club_events` to support events that are not attached to a club.
-- Safe to re-run.

-- 1) Make club_id optional so events can be user-owned.
ALTER TABLE public.club_events
  ALTER COLUMN club_id DROP NOT NULL;

-- 2) Add city field so City tab can filter events without a club.
ALTER TABLE public.club_events
  ADD COLUMN IF NOT EXISTS city TEXT;

-- Backfill city for existing club events.
UPDATE public.club_events e
SET city = c.city
FROM public.clubs c
WHERE e.club_id = c.id
  AND e.city IS NULL;

-- Backfill city for user-owned events (if any already exist).
UPDATE public.club_events e
SET city = p.city
FROM public.profiles p
WHERE e.club_id IS NULL
  AND e.created_by = p.id
  AND e.city IS NULL;

-- 3) Keep city populated automatically.
CREATE OR REPLACE FUNCTION public.set_event_city()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.city IS NULL OR NEW.city = '' THEN
    IF NEW.club_id IS NOT NULL THEN
      SELECT c.city INTO NEW.city
      FROM public.clubs c
      WHERE c.id = NEW.club_id;
    ELSE
      SELECT p.city INTO NEW.city
      FROM public.profiles p
      WHERE p.id = NEW.created_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_event_city ON public.club_events;
CREATE TRIGGER trg_set_event_city
  BEFORE INSERT OR UPDATE OF club_id, created_by, city ON public.club_events
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_event_city();

-- 4) RLS: allow verified users to create user-owned events; allow creators to update/delete their own events.
-- NOTE: existing policies cover SELECT for public events and club-member events. We add creator visibility too.

ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creators can view own events" ON public.club_events;
CREATE POLICY "Creators can view own events"
  ON public.club_events FOR SELECT
  USING (created_by = auth.uid());

-- Connections-only user events: visible only to creator and their accepted connections.
DROP POLICY IF EXISTS "Connections can view creator connections-only user events" ON public.club_events;
CREATE POLICY "Connections can view creator connections-only user events"
  ON public.club_events FOR SELECT
  USING (
    club_id IS NULL
    AND coalesce(is_public, false) = false
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.interests i
      WHERE i.status = 'accepted'
        AND (
          (i.sender_id = club_events.created_by AND i.receiver_id = auth.uid())
          OR (i.sender_id = auth.uid() AND i.receiver_id = club_events.created_by)
        )
    )
  );

DROP POLICY IF EXISTS "Users can create user events" ON public.club_events;
CREATE POLICY "Users can create user events"
  ON public.club_events FOR INSERT
  WITH CHECK (
    club_id IS NULL
    AND created_by = auth.uid()
    AND (
      -- Connections-only events are allowed for any signed-in user.
      coalesce(is_public, false) = false
      OR
      -- Public events require verification.
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_verified = true
      )
    )
  );

DROP POLICY IF EXISTS "Creators and club admins can update events" ON public.club_events;
CREATE POLICY "Creators and club admins can update events"
  ON public.club_events FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (
      club_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.club_members cm
        WHERE cm.club_id = club_events.club_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner', 'admin')
          AND cm.status = 'accepted'
      )
    )
  );

DROP POLICY IF EXISTS "Creators and club admins can delete events" ON public.club_events;
CREATE POLICY "Creators and club admins can delete events"
  ON public.club_events FOR DELETE
  USING (
    created_by = auth.uid()
    OR (
      club_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.club_members cm
        WHERE cm.club_id = club_events.club_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner', 'admin')
          AND cm.status = 'accepted'
      )
    )
  );

-- Helpful index for City tab filtering.
CREATE INDEX IF NOT EXISTS idx_club_events_city_event_date
  ON public.club_events(city, event_date);

