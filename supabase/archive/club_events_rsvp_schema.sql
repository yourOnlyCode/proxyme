-- Add RSVP functionality to club events

-- Create club_event_rsvps table
CREATE TABLE IF NOT EXISTS public.club_event_rsvps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'cant')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

-- Enable RLS
ALTER TABLE public.club_event_rsvps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for club_event_rsvps

-- Members can view RSVPs for events in their clubs
CREATE POLICY "Members can view event RSVPs"
    ON public.club_event_rsvps
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.club_members
            JOIN public.club_events ON club_events.club_id = club_members.club_id
            WHERE club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
            AND club_events.id = club_event_rsvps.event_id
        )
    );

-- Members can create/update their own RSVPs
CREATE POLICY "Members can manage their own RSVPs"
    ON public.club_event_rsvps
    FOR ALL
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.club_members
            JOIN public.club_events ON club_events.club_id = club_members.club_id
            WHERE club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
            AND club_events.id = club_event_rsvps.event_id
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.club_members
            JOIN public.club_events ON club_events.club_id = club_members.club_id
            WHERE club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
            AND club_events.id = club_event_rsvps.event_id
        )
    );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_club_event_rsvps_event_id ON public.club_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_club_event_rsvps_user_id ON public.club_event_rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_club_event_rsvps_status ON public.club_event_rsvps(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_club_event_rsvps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_club_event_rsvps_updated_at
    BEFORE UPDATE ON public.club_event_rsvps
    FOR EACH ROW
    EXECUTE FUNCTION update_club_event_rsvps_updated_at();

-- Enable realtime for RSVPs
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_event_rsvps;

