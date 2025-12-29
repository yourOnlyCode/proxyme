-- Fix Realtime Performance by adding receiver_id to messages
-- This allows clients to filter subscriptions by receiver_id instead of listening to all messages.

-- 1. Add receiver_id column to messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES public.profiles(id);

-- 2. Create function to calculate receiver_id automatically on insert
CREATE OR REPLACE FUNCTION public.set_message_receiver_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Look up the conversation to find the other participant
  SELECT 
    CASE 
      WHEN sender_id = NEW.sender_id THEN receiver_id
      ELSE sender_id
    END
  INTO NEW.receiver_id
  FROM public.interests
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create trigger for messages
DROP TRIGGER IF EXISTS trigger_set_message_receiver_id ON public.messages;
CREATE TRIGGER trigger_set_message_receiver_id
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_receiver_id();

-- 4. Backfill existing messages
-- Calculates receiver_id for existing messages based on the conversation participants
UPDATE public.messages m
SET receiver_id = (
  SELECT 
    CASE 
      WHEN i.sender_id = m.sender_id THEN i.receiver_id
      ELSE i.sender_id
    END
  FROM public.interests i
  WHERE i.id = m.conversation_id
)
WHERE receiver_id IS NULL;

-- 5. Add Indexes for messages performance
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);

-- 6. Grant permissions for messages
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;


-- PART 2: OPTIMIZE CLUB RSVPS REALTIME
-- Add club_id to club_event_rsvps to allow filtering by club

-- 1. Add club_id column
ALTER TABLE public.club_event_rsvps
ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES public.clubs(id);

-- 2. Create function to populate club_id from event
CREATE OR REPLACE FUNCTION public.set_rsvp_club_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT club_id INTO NEW.club_id
  FROM public.club_events
  WHERE id = NEW.event_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create trigger for rsvps
DROP TRIGGER IF EXISTS trigger_set_rsvp_club_id ON public.club_event_rsvps;
CREATE TRIGGER trigger_set_rsvp_club_id
BEFORE INSERT ON public.club_event_rsvps
FOR EACH ROW
EXECUTE FUNCTION public.set_rsvp_club_id();

-- 4. Backfill existing rsvps
UPDATE public.club_event_rsvps r
SET club_id = (
  SELECT club_id FROM public.club_events e WHERE e.id = r.event_id
)
WHERE club_id IS NULL;

-- 5. Index for filtering
CREATE INDEX IF NOT EXISTS idx_club_event_rsvps_club_id ON public.club_event_rsvps(club_id);
