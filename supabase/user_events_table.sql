-- User-owned events stored separately from club events.
-- Run this in Supabase SQL Editor once. Safe to re-run.
-- This creates:
-- - public.user_events (no club_id)
-- - user_event_rsvps, user_event_interests, user_event_comments, user_event_updates
-- - RPC public.create_user_event(...) used by the app

-- =========================
-- 1) Core table: user_events
-- =========================
CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  location TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  image_url TEXT,
  city TEXT,
  -- Stored end time (kept in sync via trigger below).
  -- NOTE: Some Postgres setups reject generated columns with timestamptz arithmetic (42P17).
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_events_city_event_date
  ON public.user_events(city, event_date);

-- Ensure duration_minutes exists (for older schemas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_events' AND column_name = 'duration_minutes'
  ) THEN
    ALTER TABLE public.user_events
      ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 120;
  END IF;
END $$;

-- Ensure ends_at exists (for older schemas)
-- Note: Can't add GENERATED column to existing table with data, so we add as regular column
-- and use a trigger to keep it updated. For new tables, it's created as GENERATED in the CREATE TABLE above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_events' AND column_name = 'ends_at'
  ) THEN
    -- Add as regular column first
    ALTER TABLE public.user_events
      ADD COLUMN ends_at TIMESTAMPTZ;
    
    -- Populate existing rows
    UPDATE public.user_events
    SET ends_at = event_date + (coalesce(duration_minutes, 120) * INTERVAL '1 minute')
    WHERE ends_at IS NULL;
  END IF;
END $$;

-- Ensure is_cancelled exists (for older schemas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_events' AND column_name = 'is_cancelled'
  ) THEN
    ALTER TABLE public.user_events
      ADD COLUMN is_cancelled BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Trigger to keep ends_at updated (skip if ends_at is a GENERATED column)
DO $$
DECLARE
  v_is_generated text;
BEGIN
  SELECT c.is_generated
  INTO v_is_generated
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'user_events'
    AND c.column_name = 'ends_at';

  IF coalesce(v_is_generated, 'NEVER') <> 'ALWAYS' THEN
    CREATE OR REPLACE FUNCTION public.update_user_event_ends_at()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.ends_at := NEW.event_date + (coalesce(NEW.duration_minutes, 120) * INTERVAL '1 minute');
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_update_user_event_ends_at ON public.user_events;
    CREATE TRIGGER trigger_update_user_event_ends_at
      BEFORE INSERT OR UPDATE OF event_date, duration_minutes ON public.user_events
      FOR EACH ROW
      EXECUTE FUNCTION public.update_user_event_ends_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_events_ends_at
  ON public.user_events(ends_at);

CREATE INDEX IF NOT EXISTS idx_user_events_created_by_event_date
  ON public.user_events(created_by, event_date);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- ==========================================================
-- RLS helper: avoid policy recursion (user_events <-> rsvps)
-- ==========================================================
-- NOTE: Some policies need to consult RSVP/Interest tables. Those tables also consult
-- user_events. Doing that directly in RLS policies can trigger:
--   "infinite recursion detected in policy for relation user_events"
-- We avoid that by doing the checks inside a SECURITY DEFINER function with
-- row security disabled.
CREATE OR REPLACE FUNCTION public.can_view_user_event(p_event_id uuid, p_viewer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_created_by uuid;
  v_is_public boolean;
  v_ends_at timestamptz;
  v_is_cancelled boolean;
BEGIN
  -- If unauthenticated, no access (app uses authenticated clients anyway).
  IF p_viewer_id IS NULL THEN
    RETURN false;
  END IF;

  -- RLS is disabled for this function via ALTER FUNCTION (set below)
  -- This prevents recursion when the function is called from RLS policies
  SELECT e.created_by, e.is_public, e.ends_at, coalesce(e.is_cancelled, false)
    INTO v_created_by, v_is_public, v_ends_at, v_is_cancelled
  FROM public.user_events e
  WHERE e.id = p_event_id;

  IF v_created_by IS NULL THEN
    RETURN false;
  END IF;

  -- Organizer can always view
  IF v_created_by = p_viewer_id THEN
    RETURN true;
  END IF;

  -- Public events: only while active + not cancelled
  IF v_is_public = true AND v_is_cancelled = false AND v_ends_at > now() THEN
    RETURN true;
  END IF;

  -- Connections-only: accepted connection to organizer
  IF coalesce(v_is_public, false) = false AND EXISTS (
    SELECT 1
    FROM public.interests i
    WHERE i.status = 'accepted'
      AND (
        (i.sender_id = v_created_by AND i.receiver_id = p_viewer_id)
        OR (i.sender_id = p_viewer_id AND i.receiver_id = v_created_by)
      )
  ) THEN
    RETURN true;
  END IF;

  -- Attendees/Interested can view even after it ends (supports Past Events + direct links)
  IF EXISTS (
    SELECT 1 FROM public.user_event_rsvps r
    WHERE r.event_id = p_event_id AND r.user_id = p_viewer_id
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_event_interests ui
    WHERE ui.event_id = p_event_id AND ui.user_id = p_viewer_id AND ui.status = 'interested'
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_user_event(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_user_event(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_user_event(uuid, uuid) TO service_role;

-- View rules:
-- - Creator can always view
-- - Public user events are viewable by everyone (future only)
-- - Connections-only user events: creator + accepted connections
-- Drop ALL existing policies (avoids old/renamed policies causing recursion)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_events'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_events', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "User events viewable by eligible viewers"
  ON public.user_events FOR SELECT
  USING (public.can_view_user_event(user_events.id, auth.uid()));

-- =========================
-- Auto-RSVP the user event creator as "going"
-- =========================
CREATE OR REPLACE FUNCTION public.auto_rsvp_user_event_creator()
RETURNS TRIGGER AS $$
BEGIN
  IF to_regclass('public.user_event_rsvps') IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_event_rsvps (event_id, user_id, status)
  VALUES (NEW.id, NEW.created_by, 'going')
  ON CONFLICT (event_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_rsvp_user_event_creator ON public.user_events;
CREATE TRIGGER trigger_auto_rsvp_user_event_creator
  AFTER INSERT ON public.user_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_rsvp_user_event_creator();

-- (view policies consolidated above to avoid recursion)

-- Create/update/delete rules:
-- - Any signed-in user can create connections-only user events
-- - Public user events require verification
DROP POLICY IF EXISTS "Users can create user events" ON public.user_events;
CREATE POLICY "Users can create user events"
  ON public.user_events FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      coalesce(is_public, false) = false
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_verified = true)
    )
  );

DROP POLICY IF EXISTS "Creators can update user events" ON public.user_events;
CREATE POLICY "Creators can update user events"
  ON public.user_events FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Creators can delete user events" ON public.user_events;
CREATE POLICY "Creators can delete user events"
  ON public.user_events FOR DELETE
  USING (created_by = auth.uid());


-- =========================
-- 2) Interested / Not interested
-- =========================
CREATE TABLE IF NOT EXISTS public.user_event_interests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.user_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('interested', 'not_interested')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.user_event_interests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own user event interests" ON public.user_event_interests;
DROP POLICY IF EXISTS "Users can add own user event interests" ON public.user_event_interests;
DROP POLICY IF EXISTS "Users can update own user event interests" ON public.user_event_interests;
DROP POLICY IF EXISTS "Users can remove own user event interests" ON public.user_event_interests;

CREATE POLICY "Users can view own user event interests"
  ON public.user_event_interests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can add own user event interests"
  ON public.user_event_interests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own user event interests"
  ON public.user_event_interests FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove own user event interests"
  ON public.user_event_interests FOR DELETE
  USING (user_id = auth.uid());


-- =========================
-- 3) RSVPs
-- =========================
CREATE TABLE IF NOT EXISTS public.user_event_rsvps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.user_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'cant')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.user_event_rsvps ENABLE ROW LEVEL SECURITY;
-- Drop ALL existing policies (avoids old/renamed policies causing recursion)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_event_rsvps'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_event_rsvps', pol.policyname);
  END LOOP;
END $$;

-- View RSVPs if viewer can see the event (public OR creator OR accepted connection)
CREATE POLICY "Users can view user event RSVPs"
  ON public.user_event_rsvps FOR SELECT
  USING (public.can_view_user_event(user_event_rsvps.event_id, auth.uid()));

-- Verified users can RSVP; creators can always RSVP their own event.
CREATE POLICY "Verified users can RSVP to user events"
  ON public.user_event_rsvps FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_verified = true)
      OR EXISTS (SELECT 1 FROM public.user_events e WHERE e.id = user_event_rsvps.event_id AND e.created_by = auth.uid())
    )
  );

CREATE POLICY "Users can update their user event RSVP"
  ON public.user_event_rsvps FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their user event RSVP"
  ON public.user_event_rsvps FOR DELETE
  USING (user_id = auth.uid());


-- =========================
-- 4) Comments
-- =========================
CREATE TABLE IF NOT EXISTS public.user_event_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.user_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_event_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view user event comments" ON public.user_event_comments;
DROP POLICY IF EXISTS "Users can add user event comments" ON public.user_event_comments;
DROP POLICY IF EXISTS "Users can update own user event comments" ON public.user_event_comments;
DROP POLICY IF EXISTS "Users can delete own user event comments" ON public.user_event_comments;

-- View comments if viewer can see the event (public OR creator OR accepted connection)
CREATE POLICY "Users can view user event comments"
  ON public.user_event_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_events e
      WHERE e.id = user_event_comments.event_id
        AND (
          e.is_public = true
          OR e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.interests i
            WHERE i.status = 'accepted'
              AND (
                (i.sender_id = e.created_by AND i.receiver_id = auth.uid())
                OR (i.sender_id = auth.uid() AND i.receiver_id = e.created_by)
              )
          )
        )
    )
  );

-- Only allow commenting if the user is "following" the event (RSVP'd or Interested),
-- and the user can see the event.
CREATE POLICY "Users can add user event comments"
  ON public.user_event_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_events e
      WHERE e.id = user_event_comments.event_id
        AND (
          e.is_public = true
          OR e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.interests i
            WHERE i.status = 'accepted'
              AND (
                (i.sender_id = e.created_by AND i.receiver_id = auth.uid())
                OR (i.sender_id = auth.uid() AND i.receiver_id = e.created_by)
              )
          )
        )
    )
    AND (
      EXISTS (SELECT 1 FROM public.user_event_rsvps r WHERE r.event_id = user_event_comments.event_id AND r.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_event_interests i
        WHERE i.event_id = user_event_comments.event_id AND i.user_id = auth.uid() AND i.status = 'interested'
      )
    )
  );

CREATE POLICY "Users can update own user event comments"
  ON public.user_event_comments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own user event comments"
  ON public.user_event_comments FOR DELETE
  USING (user_id = auth.uid());


-- =========================
-- 5) Organizer updates (one highlighted note per event)
-- =========================
CREATE TABLE IF NOT EXISTS public.user_event_updates (
  event_id UUID PRIMARY KEY REFERENCES public.user_events(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_event_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view user organizer updates" ON public.user_event_updates;
DROP POLICY IF EXISTS "Organizer can create user update" ON public.user_event_updates;
DROP POLICY IF EXISTS "Organizer can update user update" ON public.user_event_updates;
DROP POLICY IF EXISTS "Organizer can delete user update" ON public.user_event_updates;

CREATE POLICY "Users can view user organizer updates"
  ON public.user_event_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_events e
      WHERE e.id = user_event_updates.event_id
        AND (
          e.is_public = true
          OR e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.interests i
            WHERE i.status = 'accepted'
              AND (
                (i.sender_id = e.created_by AND i.receiver_id = auth.uid())
                OR (i.sender_id = auth.uid() AND i.receiver_id = e.created_by)
              )
          )
        )
    )
  );

CREATE POLICY "Organizer can create user update"
  ON public.user_event_updates FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_events e WHERE e.id = user_event_updates.event_id AND e.created_by = auth.uid())
  );

CREATE POLICY "Organizer can update user update"
  ON public.user_event_updates FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Organizer can delete user update"
  ON public.user_event_updates FOR DELETE
  USING (created_by = auth.uid());


-- =========================
-- 6) RPC: create_user_event (used by app/events/create.tsx)
-- =========================
-- New signature (includes duration). Keep a wrapper for older app versions below.
CREATE OR REPLACE FUNCTION public.create_user_event(
  p_title text,
  p_description text,
  p_event_date timestamptz,
  p_location text,
  p_is_public boolean,
  p_image_url text,
  p_city text,
  p_duration_minutes integer DEFAULT 120
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Enforce verification for public events (matches RLS intent even though this is SECURITY DEFINER).
  IF coalesce(p_is_public, false) = true AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_verified = true
  ) THEN
    RAISE EXCEPTION 'Verification required';
  END IF;

  INSERT INTO public.user_events (created_by, title, description, event_date, duration_minutes, location, is_public, image_url, city)
  VALUES (
    auth.uid(),
    nullif(trim(p_title), ''),
    nullif(trim(p_description), ''),
    p_event_date,
    coalesce(p_duration_minutes, 120),
    nullif(trim(p_location), ''),
    coalesce(p_is_public, false),
    p_image_url,
    nullif(trim(p_city), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Backwards-compatible wrapper (old signature without duration)
CREATE OR REPLACE FUNCTION public.create_user_event(
  p_title text,
  p_description text,
  p_event_date timestamptz,
  p_location text,
  p_is_public boolean,
  p_image_url text,
  p_city text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_user_event(p_title, p_description, p_event_date, p_location, p_is_public, p_image_url, p_city, 120);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_event(text, text, timestamptz, text, boolean, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_event(text, text, timestamptz, text, boolean, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_user_event(text, text, timestamptz, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_event(text, text, timestamptz, text, boolean, text, text) TO service_role;

-- ==========================================
-- Event Invites (connections -> events)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.event_invites (
  id uuid default gen_random_uuid() primary key,
  source text not null check (source in ('club', 'user')),
  event_id uuid not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique(source, event_id, receiver_id)
);

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their event invites" ON public.event_invites;
CREATE POLICY "Users can view their event invites"
  ON public.event_invites FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Event hosts can invite connections" ON public.event_invites;
CREATE POLICY "Event hosts can invite connections"
  ON public.event_invites FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND receiver_id <> auth.uid()
    AND EXISTS (
      -- Only allow inviting accepted connections
      SELECT 1
      FROM public.interests i
      WHERE i.status = 'accepted'
        AND (
          (i.sender_id = auth.uid() AND i.receiver_id = event_invites.receiver_id)
          OR (i.sender_id = event_invites.receiver_id AND i.receiver_id = auth.uid())
        )
    )
    AND (
      -- Only the host can invite (for now)
      (source = 'club' AND EXISTS (SELECT 1 FROM public.club_events e WHERE e.id = event_invites.event_id AND e.created_by = auth.uid()))
      OR
      (source = 'user' AND EXISTS (SELECT 1 FROM public.user_events e WHERE e.id = event_invites.event_id AND e.created_by = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Invite recipients can respond" ON public.event_invites;
CREATE POLICY "Invite recipients can respond"
  ON public.event_invites FOR UPDATE
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());
