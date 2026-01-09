-- Club Invite Notifications + Membership Leave Policy + One-Club-Per-Owner
-- Run this SQL in your Supabase SQL Editor

-- 1) Expand notifications.type to include club_invite
DO $$
BEGIN
  -- If the notifications table doesn't exist yet, nothing to do here (run club_notifications.sql first).
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    RAISE NOTICE 'public.notifications does not exist yet; run supabase/club_notifications.sql first.';
    RETURN;
  END IF;

  -- Drop the auto-named CHECK constraint if it exists, then recreate with the expanded list.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;

  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (
      type IN (
        'forum_reply',
        'club_event',
        'club_member',
        'club_invite',
        'connection_request',
        'connection_accepted',
        'message'
      )
    );
END $$;

-- 2) Allow users to leave clubs (delete their own membership row)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'club_members'
      AND policyname = 'Users can leave clubs'
  ) THEN
    CREATE POLICY "Users can leave clubs"
      ON public.club_members FOR DELETE
      USING ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

-- 3) One club per owner (DB enforcement)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_owner_one_club
  ON public.clubs(owner_id);

-- 4) Notification on club invite (insert/update to invited)
CREATE OR REPLACE FUNCTION public.notify_club_invite()
RETURNS TRIGGER AS $$
DECLARE
  inviter_id uuid;
  inviter_username text;
  club_name text;
BEGIN
  -- Only notify for invited memberships
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'invited' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'invited' OR (OLD.status = 'invited' AND NEW.status = 'invited') THEN
      RETURN NEW;
    END IF;
  END IF;

  inviter_id := auth.uid();

  SELECT username INTO inviter_username
  FROM public.profiles
  WHERE id = inviter_id;

  SELECT name INTO club_name
  FROM public.clubs
  WHERE id = NEW.club_id;

  -- Notify the invited user
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.user_id,
    'club_invite',
    'Club Invitation',
    COALESCE(inviter_username, 'A club admin') || ' invited you to join ' || COALESCE(club_name, 'a club'),
    jsonb_build_object(
      'club_id', NEW.club_id,
      'inviter_id', inviter_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_club_invite_insert ON public.club_members;
CREATE TRIGGER trigger_notify_club_invite_insert
  AFTER INSERT ON public.club_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_club_invite();

DROP TRIGGER IF EXISTS trigger_notify_club_invite_update ON public.club_members;
CREATE TRIGGER trigger_notify_club_invite_update
  AFTER UPDATE OF status ON public.club_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_club_invite();

