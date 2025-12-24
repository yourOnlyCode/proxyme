-- Club Events Schema
-- Allows owners and admins to create events for their clubs

-- Create club_events table
CREATE TABLE IF NOT EXISTS public.club_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for club_events

-- Anyone can view events for clubs they're a member of
CREATE POLICY "Members can view club events"
    ON public.club_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.club_members
            WHERE club_members.club_id = club_events.club_id
            AND club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
        )
    );

-- Only owners and admins can create events
CREATE POLICY "Owners and admins can create events"
    ON public.club_events
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.club_members
            WHERE club_members.club_id = club_events.club_id
            AND club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
            AND club_members.role IN ('owner', 'admin')
        )
        AND created_by = auth.uid()
    );

-- Only the creator (owner/admin) can update events
CREATE POLICY "Event creators can update events"
    ON public.club_events
    FOR UPDATE
    USING (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.club_members
            WHERE club_members.club_id = club_events.club_id
            AND club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
            AND club_members.role IN ('owner', 'admin')
        )
    );

-- Only the creator (owner/admin) can delete events
CREATE POLICY "Event creators can delete events"
    ON public.club_events
    FOR DELETE
    USING (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.club_members
            WHERE club_members.club_id = club_events.club_id
            AND club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
            AND club_members.role IN ('owner', 'admin')
        )
    );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_club_events_club_id ON public.club_events(club_id);
CREATE INDEX IF NOT EXISTS idx_club_events_event_date ON public.club_events(event_date);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_club_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_club_events_updated_at
    BEFORE UPDATE ON public.club_events
    FOR EACH ROW
    EXECUTE FUNCTION update_club_events_updated_at();

