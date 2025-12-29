-- Club Notifications System
-- Creates notifications table and triggers for club-related events

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('forum_reply', 'club_event', 'club_member', 'connection_request', 'connection_accepted', 'message')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB, -- Additional data like club_id, event_id, topic_id, etc.
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    
    -- Indexes for performance
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
    ON public.notifications FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
    ON public.notifications FOR UPDATE
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
    ON public.notifications FOR INSERT
    WITH CHECK (true); -- Allow service role to insert

-- Function to notify topic creator when someone replies
CREATE OR REPLACE FUNCTION notify_forum_reply()
RETURNS TRIGGER AS $$
DECLARE
    topic_creator_id UUID;
    topic_title TEXT;
    club_name TEXT;
    replier_username TEXT;
BEGIN
    -- Get topic creator and details
    SELECT 
        t.created_by,
        t.title,
        c.name
    INTO 
        topic_creator_id,
        topic_title,
        club_name
    FROM public.club_forum_topics t
    JOIN public.clubs c ON c.id = t.club_id
    WHERE t.id = NEW.topic_id;
    
    -- Get replier username
    SELECT username INTO replier_username
    FROM public.profiles
    WHERE id = NEW.created_by;
    
    -- Don't notify if replying to own post
    IF topic_creator_id = NEW.created_by THEN
        RETURN NEW;
    END IF;
    
    -- Insert notification
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        topic_creator_id,
        'forum_reply',
        'New Reply to Your Post',
        COALESCE(replier_username, 'Someone') || ' replied to "' || COALESCE(topic_title, 'your post') || '" in ' || COALESCE(club_name, 'the club'),
        jsonb_build_object(
            'club_id', (SELECT club_id FROM public.club_forum_topics WHERE id = NEW.topic_id),
            'topic_id', NEW.topic_id,
            'reply_id', NEW.id,
            'replier_id', NEW.created_by
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for forum replies
DROP TRIGGER IF EXISTS trigger_notify_forum_reply ON public.club_forum_replies;
CREATE TRIGGER trigger_notify_forum_reply
    AFTER INSERT ON public.club_forum_replies
    FOR EACH ROW
    EXECUTE FUNCTION notify_forum_reply();

-- Function to notify club members when a new event is scheduled
CREATE OR REPLACE FUNCTION notify_club_event()
RETURNS TRIGGER AS $$
DECLARE
    member_record RECORD;
    event_creator_username TEXT;
BEGIN
    -- Get event creator username
    SELECT username INTO event_creator_username
    FROM public.profiles
    WHERE id = NEW.created_by;
    
    -- Notify all club members (except the creator)
    FOR member_record IN
        SELECT user_id
        FROM public.club_members
        WHERE club_id = NEW.club_id
        AND status = 'accepted'
        AND user_id != NEW.created_by
    LOOP
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data
        ) VALUES (
            member_record.user_id,
            'club_event',
            'New Club Event',
            COALESCE(event_creator_username, 'A club admin') || ' scheduled "' || NEW.title || '"',
            jsonb_build_object(
                'club_id', NEW.club_id,
                'event_id', NEW.id,
                'event_title', NEW.title,
                'event_date', NEW.event_date
            )
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new club events
DROP TRIGGER IF EXISTS trigger_notify_club_event ON public.club_events;
CREATE TRIGGER trigger_notify_club_event
    AFTER INSERT ON public.club_events
    FOR EACH ROW
    EXECUTE FUNCTION notify_club_event();

-- Function to notify club admins/owners when a new member joins
CREATE OR REPLACE FUNCTION notify_club_member()
RETURNS TRIGGER AS $$
DECLARE
    admin_record RECORD;
    new_member_username TEXT;
    club_name TEXT;
BEGIN
    -- Only notify when status changes to 'accepted'
    IF NEW.status != 'accepted' OR (OLD.status = 'accepted' AND NEW.status = 'accepted') THEN
        RETURN NEW;
    END IF;
    
    -- Get new member username
    SELECT username INTO new_member_username
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Get club name
    SELECT name INTO club_name
    FROM public.clubs
    WHERE id = NEW.club_id;
    
    -- Notify club owners and admins
    FOR admin_record IN
        SELECT user_id
        FROM public.club_members
        WHERE club_id = NEW.club_id
        AND status = 'accepted'
        AND role IN ('owner', 'admin')
        AND user_id != NEW.user_id
    LOOP
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data
        ) VALUES (
            admin_record.user_id,
            'club_member',
            'New Club Member',
            COALESCE(new_member_username, 'Someone') || ' joined ' || COALESCE(club_name, 'your club'),
            jsonb_build_object(
                'club_id', NEW.club_id,
                'member_id', NEW.user_id
            )
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new club members
DROP TRIGGER IF EXISTS trigger_notify_club_member ON public.club_members;
CREATE TRIGGER trigger_notify_club_member
    AFTER UPDATE OF status ON public.club_members
    FOR EACH ROW
    WHEN (NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted'))
    EXECUTE FUNCTION notify_club_member();

-- Also handle INSERT case (when someone joins and is immediately accepted)
CREATE OR REPLACE FUNCTION notify_club_member_insert()
RETURNS TRIGGER AS $$
DECLARE
    admin_record RECORD;
    new_member_username TEXT;
    club_name TEXT;
BEGIN
    -- Only notify if status is 'accepted' on insert
    IF NEW.status != 'accepted' THEN
        RETURN NEW;
    END IF;
    
    -- Get new member username
    SELECT username INTO new_member_username
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Get club name
    SELECT name INTO club_name
    FROM public.clubs
    WHERE id = NEW.club_id;
    
    -- Notify club owners and admins
    FOR admin_record IN
        SELECT user_id
        FROM public.club_members
        WHERE club_id = NEW.club_id
        AND status = 'accepted'
        AND role IN ('owner', 'admin')
        AND user_id != NEW.user_id
    LOOP
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data
        ) VALUES (
            admin_record.user_id,
            'club_member',
            'New Club Member',
            COALESCE(new_member_username, 'Someone') || ' joined ' || COALESCE(club_name, 'your club'),
            jsonb_build_object(
                'club_id', NEW.club_id,
                'member_id', NEW.user_id
            )
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new club members on insert
DROP TRIGGER IF EXISTS trigger_notify_club_member_insert ON public.club_members;
CREATE TRIGGER trigger_notify_club_member_insert
    AFTER INSERT ON public.club_members
    FOR EACH ROW
    WHEN (NEW.status = 'accepted')
    EXECUTE FUNCTION notify_club_member_insert();

-- Add notifications to realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

