-- Event Notifications System
-- Extends the existing notification system to handle event-related notifications
-- This includes RSVPs, event updates, event reminders, and event cancellations

-- First, ensure the notifications table exists (create if it doesn't)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'notifications_user_id_fkey'
        AND conrelid = 'public.notifications'::regclass
    ) THEN
        ALTER TABLE public.notifications 
        ADD CONSTRAINT notifications_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Enable RLS if not already enabled
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (drop first if they exist, then create)
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
    WITH CHECK (true);

-- Update the notifications table to include new event notification types
-- Drop the existing constraint and recreate with new types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
        'forum_reply', 
        'club_event', 
        'club_member', 
        'connection_request', 
        'connection_accepted', 
        'message',
        'event_rsvp',
        'event_update',
        'event_reminder',
        'event_cancelled',
        'event_rsvp_update'
    ));

-- Function to notify event creator when someone RSVPs
CREATE OR REPLACE FUNCTION notify_event_rsvp()
RETURNS TRIGGER AS $$
DECLARE
    event_record RECORD;
    rsvp_user_username TEXT;
    club_name TEXT;
BEGIN
    -- Get event details
    SELECT 
        e.id,
        e.title,
        e.club_id,
        e.created_by,
        c.name
    INTO event_record
    FROM public.club_events e
    JOIN public.clubs c ON c.id = e.club_id
    WHERE e.id = NEW.event_id;
    
    -- Get RSVP user username
    SELECT username INTO rsvp_user_username
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Don't notify if user is RSVPing to their own event
    IF event_record.created_by = NEW.user_id THEN
        RETURN NEW;
    END IF;
    
    -- Notify event creator
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        event_record.created_by,
        'event_rsvp',
        'New RSVP to Your Event',
        COALESCE(rsvp_user_username, 'Someone') || ' is ' || 
        CASE 
            WHEN NEW.status = 'going' THEN 'going'
            WHEN NEW.status = 'maybe' THEN 'maybe going'
            WHEN NEW.status = 'cant' THEN 'can''t make it'
            ELSE 'interested'
        END || ' to "' || COALESCE(event_record.title, 'your event') || '"',
        jsonb_build_object(
            'club_id', event_record.club_id,
            'event_id', event_record.id,
            'event_title', event_record.title,
            'rsvp_user_id', NEW.user_id,
            'rsvp_status', NEW.status
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for event RSVPs
DROP TRIGGER IF EXISTS trigger_notify_event_rsvp ON public.club_event_rsvps;
CREATE TRIGGER trigger_notify_event_rsvp
    AFTER INSERT ON public.club_event_rsvps
    FOR EACH ROW
    EXECUTE FUNCTION notify_event_rsvp();

-- Function to notify event creator when someone updates their RSVP
CREATE OR REPLACE FUNCTION notify_event_rsvp_update()
RETURNS TRIGGER AS $$
DECLARE
    event_record RECORD;
    rsvp_user_username TEXT;
BEGIN
    -- Only notify if status actually changed
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    
    -- Get event details
    SELECT 
        e.id,
        e.title,
        e.club_id,
        e.created_by
    INTO event_record
    FROM public.club_events e
    WHERE e.id = NEW.event_id;
    
    -- Get RSVP user username
    SELECT username INTO rsvp_user_username
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Don't notify if user is updating their own event RSVP
    IF event_record.created_by = NEW.user_id THEN
        RETURN NEW;
    END IF;
    
    -- Notify event creator
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        event_record.created_by,
        'event_rsvp_update',
        'RSVP Updated',
        COALESCE(rsvp_user_username, 'Someone') || ' updated their RSVP to "' || 
        COALESCE(event_record.title, 'your event') || '" - ' ||
        CASE 
            WHEN NEW.status = 'going' THEN 'now going'
            WHEN NEW.status = 'maybe' THEN 'maybe going'
            WHEN NEW.status = 'cant' THEN 'can''t make it'
            ELSE NEW.status
        END,
        jsonb_build_object(
            'club_id', event_record.club_id,
            'event_id', event_record.id,
            'event_title', event_record.title,
            'rsvp_user_id', NEW.user_id,
            'rsvp_status', NEW.status,
            'old_status', OLD.status
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for event RSVP updates
DROP TRIGGER IF EXISTS trigger_notify_event_rsvp_update ON public.club_event_rsvps;
CREATE TRIGGER trigger_notify_event_rsvp_update
    AFTER UPDATE OF status ON public.club_event_rsvps
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION notify_event_rsvp_update();

-- Function to notify club members when an event is updated
CREATE OR REPLACE FUNCTION notify_event_update()
RETURNS TRIGGER AS $$
DECLARE
    member_record RECORD;
    event_creator_username TEXT;
    update_details TEXT := '';
BEGIN
    -- Only notify if something meaningful changed
    IF OLD.title = NEW.title 
       AND OLD.description IS NOT DISTINCT FROM NEW.description
       AND OLD.event_date = NEW.event_date
       AND OLD.location IS NOT DISTINCT FROM NEW.location THEN
        RETURN NEW;
    END IF;
    
    -- Get event creator username
    SELECT username INTO event_creator_username
    FROM public.profiles
    WHERE id = NEW.created_by;
    
    -- Build update details message
    IF OLD.title != NEW.title THEN
        update_details := update_details || 'Title changed to "' || NEW.title || '". ';
    END IF;
    IF OLD.event_date != NEW.event_date THEN
        update_details := update_details || 'Date changed to ' || to_char(NEW.event_date, 'Mon DD, YYYY HH:MI AM') || '. ';
    END IF;
    IF OLD.location IS DISTINCT FROM NEW.location THEN
        update_details := update_details || 'Location updated. ';
    END IF;
    
    -- Notify all club members who have RSVP'd or are members (except the updater)
    FOR member_record IN
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = NEW.club_id
        AND cm.status = 'accepted'
        AND cm.user_id != NEW.created_by
        AND (
            -- Notify members who have RSVP'd
            EXISTS (
                SELECT 1 FROM public.club_event_rsvps rsvp
                WHERE rsvp.event_id = NEW.id
                AND rsvp.user_id = cm.user_id
            )
            -- Or notify all members if it's a significant change (date change)
            OR OLD.event_date != NEW.event_date
        )
    LOOP
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data
        ) VALUES (
            member_record.user_id,
            'event_update',
            'Event Updated',
            COALESCE(event_creator_username, 'A club admin') || ' updated "' || NEW.title || '". ' || update_details,
            jsonb_build_object(
                'club_id', NEW.club_id,
                'event_id', NEW.id,
                'event_title', NEW.title,
                'event_date', NEW.event_date,
                'location', NEW.location
            )
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for event updates
DROP TRIGGER IF EXISTS trigger_notify_event_update ON public.club_events;
CREATE TRIGGER trigger_notify_event_update
    AFTER UPDATE ON public.club_events
    FOR EACH ROW
    WHEN (
        OLD.title IS DISTINCT FROM NEW.title 
        OR OLD.description IS DISTINCT FROM NEW.description
        OR OLD.event_date IS DISTINCT FROM NEW.event_date
        OR OLD.location IS DISTINCT FROM NEW.location
    )
    EXECUTE FUNCTION notify_event_update();

-- Function to notify club members when an event is cancelled
CREATE OR REPLACE FUNCTION notify_event_cancelled()
RETURNS TRIGGER AS $$
DECLARE
    member_record RECORD;
    event_creator_username TEXT;
BEGIN
    -- Only notify if event is being deleted (cancelled)
    -- This trigger fires on DELETE, so we use OLD to get the event details
    
    -- Get event creator username
    SELECT username INTO event_creator_username
    FROM public.profiles
    WHERE id = OLD.created_by;
    
    -- Notify all club members who have RSVP'd
    FOR member_record IN
        SELECT DISTINCT rsvp.user_id
        FROM public.club_event_rsvps rsvp
        WHERE rsvp.event_id = OLD.id
        AND rsvp.user_id != OLD.created_by
    LOOP
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data
        ) VALUES (
            member_record.user_id,
            'event_cancelled',
            'Event Cancelled',
            COALESCE(event_creator_username, 'A club admin') || ' cancelled "' || OLD.title || '"',
            jsonb_build_object(
                'club_id', OLD.club_id,
                'event_id', OLD.id,
                'event_title', OLD.title
            )
        );
    END LOOP;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for event cancellations (deletions)
DROP TRIGGER IF EXISTS trigger_notify_event_cancelled ON public.club_events;
CREATE TRIGGER trigger_notify_event_cancelled
    AFTER DELETE ON public.club_events
    FOR EACH ROW
    EXECUTE FUNCTION notify_event_cancelled();

-- Function to create event reminder notifications
-- This can be called via a scheduled job or cron
CREATE OR REPLACE FUNCTION create_event_reminders()
RETURNS void AS $$
DECLARE
    event_record RECORD;
    reminder_time TIMESTAMPTZ;
BEGIN
    -- Find events happening in the next 24 hours that haven't had reminders sent
    -- This assumes you might want to add a 'reminder_sent' flag to events, or use a separate table
    -- For now, we'll notify all RSVP'd users for events happening in the next 24 hours
    
    FOR event_record IN
        SELECT 
            e.id,
            e.title,
            e.event_date,
            e.club_id,
            e.created_by
        FROM public.club_events e
        WHERE e.event_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
        AND e.event_date > NOW() + INTERVAL '23 hours' -- Only events in the next hour window
    LOOP
        -- Notify all users who RSVP'd "going" or "maybe"
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data
        )
        SELECT 
            rsvp.user_id,
            'event_reminder',
            'Event Reminder',
            '"' || event_record.title || '" is happening ' || 
            CASE 
                WHEN event_record.event_date < NOW() + INTERVAL '1 hour' THEN 'soon'
                ELSE 'in ' || EXTRACT(HOUR FROM (event_record.event_date - NOW()))::TEXT || ' hours'
            END,
            jsonb_build_object(
                'club_id', event_record.club_id,
                'event_id', event_record.id,
                'event_title', event_record.title,
                'event_date', event_record.event_date
            )
        FROM public.club_event_rsvps rsvp
        WHERE rsvp.event_id = event_record.id
        AND rsvp.status IN ('going', 'maybe')
        AND NOT EXISTS (
            -- Don't create duplicate reminders (check if notification already exists)
            SELECT 1 FROM public.notifications n
            WHERE n.user_id = rsvp.user_id
            AND n.type = 'event_reminder'
            AND n.data->>'event_id' = event_record.id::TEXT
            AND n.created_at > NOW() - INTERVAL '1 hour'
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for better performance on event-related queries
CREATE INDEX IF NOT EXISTS idx_notifications_event_id ON public.notifications((data->>'event_id'));
CREATE INDEX IF NOT EXISTS idx_notifications_club_id ON public.notifications((data->>'club_id'));

-- Add comment for documentation
COMMENT ON FUNCTION notify_event_rsvp() IS 'Notifies event creator when someone RSVPs to their event';
COMMENT ON FUNCTION notify_event_rsvp_update() IS 'Notifies event creator when someone updates their RSVP status';
COMMENT ON FUNCTION notify_event_update() IS 'Notifies club members when an event is updated';
COMMENT ON FUNCTION notify_event_cancelled() IS 'Notifies RSVP''d users when an event is cancelled';
COMMENT ON FUNCTION create_event_reminders() IS 'Creates reminder notifications for upcoming events (should be called via cron/scheduled job)';

