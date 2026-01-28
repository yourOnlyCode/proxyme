-- Run this in Supabase SQL Editor if event creation still says "club_id required".
-- Does the minimal change: allow null club_id + allow users to create those events.
-- Safe to run multiple times. Run against the same Supabase project your app uses.

-- IMPORTANT:
-- If any statement fails in the SQL Editor, Supabase will roll back the whole run.
-- This script is written to avoid failures by guarding optional pieces.

-- 1) Allow events without a club
ALTER TABLE public.club_events
  ALTER COLUMN club_id DROP NOT NULL;

-- Ensure city exists (used by the create_user_event RPC + City tab filtering)
ALTER TABLE public.club_events
  ADD COLUMN IF NOT EXISTS city text;

-- Ensure RLS is enabled (policy creation assumes it)
ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;

-- 2) Let users create and view their own user-owned events
DROP POLICY IF EXISTS "Users can create user events" ON public.club_events;
CREATE POLICY "Users can create user events"
  ON public.club_events FOR INSERT
  WITH CHECK (
    club_id IS NULL
    AND created_by = auth.uid()
    AND (
      coalesce(is_public, false) = false
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_verified = true
      )
    )
  );

DROP POLICY IF EXISTS "Creators can view own events" ON public.club_events;
CREATE POLICY "Creators can view own events"
  ON public.club_events FOR SELECT
  USING (created_by = auth.uid());

-- Optional: connections-only visibility to accepted connections.
-- This is guarded so it won't break the whole run if the `interests` table/columns differ.
DO $$
BEGIN
  IF to_regclass('public.interests') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'interests' AND column_name IN ('sender_id','receiver_id','status')
       GROUP BY table_schema, table_name
       HAVING count(*) = 3
     )
  THEN
    EXECUTE 'DROP POLICY IF EXISTS "Connections can view creator connections-only user events" ON public.club_events';
    EXECUTE $pol$
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
        )
    $pol$;
  END IF;
END $$;

-- 3) RPC so the app can create user events without sending club_id (avoids client/schema quirks)
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
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.club_events (created_by, title, description, event_date, location, is_public, image_url, city)
  VALUES (
    auth.uid(),
    nullif(trim(p_title), ''),
    nullif(trim(p_description), ''),
    p_event_date,
    nullif(trim(p_location), ''),
    coalesce(p_is_public, false),
    p_image_url,
    nullif(trim(p_city), '')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_event(text, text, timestamptz, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_event(text, text, timestamptz, text, boolean, text, text) TO service_role;

-- Sanity check (should say YES after this script runs successfully)
SELECT is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'club_events' AND column_name = 'club_id';
