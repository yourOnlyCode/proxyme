-- Optimize RLS Policies for Performance
-- Replace auth.uid() with (SELECT auth.uid()) to prevent per-row evaluation
-- This significantly improves query performance at scale
-- This script is idempotent and checks for table existence

-- ==========================================
-- 1. Profiles Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
        CREATE POLICY "Users can insert their own profile."
          ON public.profiles FOR INSERT
          WITH CHECK ( (SELECT auth.uid()) = id );

        DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
        CREATE POLICY "Users can update own profile."
          ON public.profiles FOR UPDATE
          USING ( (SELECT auth.uid()) = id );
    END IF;
END $$;

-- ==========================================
-- 2. Posts Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts') THEN
        DROP POLICY IF EXISTS "Users can create posts." ON public.posts;
        CREATE POLICY "Users can create posts."
          ON public.posts FOR INSERT
          WITH CHECK ( (SELECT auth.uid()) = user_id );
    END IF;
END $$;

-- ==========================================
-- 3. Interests Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interests') THEN
        DROP POLICY IF EXISTS "Sender can view own sent interests" ON public.interests;
        CREATE POLICY "Sender can view own sent interests"
          ON public.interests FOR SELECT
          USING ( (SELECT auth.uid()) = sender_id );

        DROP POLICY IF EXISTS "Receiver can view own received interests" ON public.interests;
        CREATE POLICY "Receiver can view own received interests"
          ON public.interests FOR SELECT
          USING ( (SELECT auth.uid()) = receiver_id );

        DROP POLICY IF EXISTS "Users can send interest" ON public.interests;
        CREATE POLICY "Users can send interest"
          ON public.interests FOR INSERT
          WITH CHECK ( (SELECT auth.uid()) = sender_id );

        DROP POLICY IF EXISTS "Receiver can update status" ON public.interests;
        CREATE POLICY "Receiver can update status"
          ON public.interests FOR UPDATE
          USING ( (SELECT auth.uid()) = receiver_id );
    END IF;
END $$;

-- ==========================================
-- 4. Blocked Users Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blocked_users') THEN
        DROP POLICY IF EXISTS "Users can view who they blocked" ON public.blocked_users;
        CREATE POLICY "Users can view who they blocked"
            ON public.blocked_users FOR SELECT
            USING ( (SELECT auth.uid()) = blocker_id );

        DROP POLICY IF EXISTS "Users can block others" ON public.blocked_users;
        CREATE POLICY "Users can block others"
            ON public.blocked_users FOR INSERT
            WITH CHECK ( (SELECT auth.uid()) = blocker_id );

        DROP POLICY IF EXISTS "Users can unblock" ON public.blocked_users;
        CREATE POLICY "Users can unblock"
            ON public.blocked_users FOR DELETE
            USING ( (SELECT auth.uid()) = blocker_id );
    END IF;
END $$;

-- ==========================================
-- 5. Reports Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reports') THEN
        DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
        CREATE POLICY "Users can create reports"
            ON public.reports FOR INSERT
            WITH CHECK ( (SELECT auth.uid()) = reporter_id );
    END IF;
END $$;

-- ==========================================
-- 6. Stories Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stories') THEN
        DROP POLICY IF EXISTS "Users can create stories" ON public.stories;
        CREATE POLICY "Users can create stories"
            ON public.stories FOR INSERT
            WITH CHECK ( (SELECT auth.uid()) = user_id );

        DROP POLICY IF EXISTS "Users can delete own stories" ON public.stories;
        CREATE POLICY "Users can delete own stories"
            ON public.stories FOR DELETE
            USING ( (SELECT auth.uid()) = user_id );
    END IF;
END $$;

-- ==========================================
-- 7. Clubs Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clubs') THEN
        DROP POLICY IF EXISTS "Users can create clubs" ON public.clubs;
        CREATE POLICY "Users can create clubs"
            ON public.clubs FOR INSERT
            WITH CHECK ( (SELECT auth.uid()) = owner_id );

        DROP POLICY IF EXISTS "Owners can update their clubs" ON public.clubs;
        CREATE POLICY "Owners can update their clubs"
            ON public.clubs FOR UPDATE
            USING ( (SELECT auth.uid()) = owner_id );

        DROP POLICY IF EXISTS "Owners can delete their clubs" ON public.clubs;
        CREATE POLICY "Owners can delete their clubs"
            ON public.clubs FOR DELETE
            USING ( (SELECT auth.uid()) = owner_id );
    END IF;
END $$;

-- ==========================================
-- 8. Club Members Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'club_members') THEN
        DROP POLICY IF EXISTS "Users can join/leave clubs" ON public.club_members;
        CREATE POLICY "Users can join/leave clubs"
            ON public.club_members FOR INSERT
            WITH CHECK ( 
                (SELECT auth.uid()) = user_id OR 
                EXISTS (SELECT 1 FROM public.clubs WHERE id = club_id AND owner_id = (SELECT auth.uid()))
            );

        DROP POLICY IF EXISTS "Admins/Owners can update member status" ON public.club_members;
        CREATE POLICY "Admins/Owners can update member status"
            ON public.club_members FOR UPDATE
            USING (
                (SELECT auth.uid()) = user_id OR -- Accept invite
                EXISTS (
                    SELECT 1 FROM public.club_members 
                    WHERE club_id = club_members.club_id 
                    AND user_id = (SELECT auth.uid()) 
                    AND role IN ('owner', 'admin')
                )
            );
    END IF;
END $$;

-- ==========================================
-- 9. Club Events Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'club_events') THEN
        DROP POLICY IF EXISTS "Events viewable by club members" ON public.club_events;
        CREATE POLICY "Events viewable by club members"
            ON public.club_events FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.club_members 
                    WHERE club_id = club_events.club_id 
                    AND user_id = (SELECT auth.uid()) 
                    AND status = 'accepted'
                )
            );

        DROP POLICY IF EXISTS "Admins/Owners can create events" ON public.club_events;
        CREATE POLICY "Admins/Owners can create events"
            ON public.club_events FOR INSERT
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.club_members 
                    WHERE club_id = club_events.club_id 
                    AND user_id = (SELECT auth.uid()) 
                    AND role IN ('owner', 'admin') 
                    AND status = 'accepted'
                )
            );
    END IF;
END $$;

-- ==========================================
-- 10. Club Event RSVPs Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'club_event_rsvps') THEN
        DROP POLICY IF EXISTS "Members can manage their own RSVPs" ON public.club_event_rsvps;
        CREATE POLICY "Members can manage their own RSVPs"
            ON public.club_event_rsvps FOR ALL
            USING ( user_id = (SELECT auth.uid()) );
    END IF;
END $$;

-- ==========================================
-- 11. Club Forum Topics Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'club_forum_topics') THEN
        DROP POLICY IF EXISTS "Members can view topics" ON public.club_forum_topics;
        CREATE POLICY "Members can view topics"
            ON public.club_forum_topics FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.club_members 
                    WHERE club_id = club_forum_topics.club_id 
                    AND user_id = (SELECT auth.uid()) 
                    AND status = 'accepted'
                )
            );

        DROP POLICY IF EXISTS "Members can create topics" ON public.club_forum_topics;
        CREATE POLICY "Members can create topics"
            ON public.club_forum_topics FOR INSERT
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.club_members 
                    WHERE club_id = club_forum_topics.club_id 
                    AND user_id = (SELECT auth.uid()) 
                    AND status = 'accepted'
                )
            );
    END IF;
END $$;

-- ==========================================
-- 12. Club Forum Replies Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'club_forum_replies') THEN
        DROP POLICY IF EXISTS "Members can create replies" ON public.club_forum_replies;
        CREATE POLICY "Members can create replies"
            ON public.club_forum_replies FOR INSERT
            WITH CHECK ( (SELECT auth.uid()) = created_by );
    END IF;
END $$;

-- ==========================================
-- 13. Club Forum Reactions Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'club_forum_reactions') THEN
        DROP POLICY IF EXISTS "Members can react" ON public.club_forum_reactions;
        CREATE POLICY "Members can react"
            ON public.club_forum_reactions FOR INSERT
            WITH CHECK ( (SELECT auth.uid()) = user_id );

        DROP POLICY IF EXISTS "Members can remove reaction" ON public.club_forum_reactions;
        CREATE POLICY "Members can remove reaction"
            ON public.club_forum_reactions FOR DELETE
            USING ( (SELECT auth.uid()) = user_id );
    END IF;
END $$;

-- ==========================================
-- 14. Profile Photos Table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profile_photos') THEN
        DROP POLICY IF EXISTS "Users can manage their own photos." ON public.profile_photos;
        CREATE POLICY "Users can manage their own photos."
            ON public.profile_photos FOR ALL
            USING ( user_id = (SELECT auth.uid()) );
    END IF;
END $$;

