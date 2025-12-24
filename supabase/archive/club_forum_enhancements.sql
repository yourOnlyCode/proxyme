-- Forum Enhancements: Edit tracking, reply chaining, and support/oppose reactions

-- 1. Add edit tracking to topics
ALTER TABLE club_forum_topics 
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 2. Add edit tracking to replies
ALTER TABLE club_forum_replies 
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parent_reply_id UUID REFERENCES club_forum_replies(id) ON DELETE CASCADE;

-- 3. Create reactions table for support/oppose
CREATE TABLE IF NOT EXISTS club_forum_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES club_forum_topics(id) ON DELETE CASCADE,
    reply_id UUID REFERENCES club_forum_replies(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('support', 'oppose')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, topic_id, reply_id),
    CHECK (
        (topic_id IS NOT NULL AND reply_id IS NULL) OR 
        (topic_id IS NULL AND reply_id IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_club_forum_replies_parent ON club_forum_replies(parent_reply_id);
CREATE INDEX IF NOT EXISTS idx_club_forum_reactions_topic ON club_forum_reactions(topic_id);
CREATE INDEX IF NOT EXISTS idx_club_forum_reactions_reply ON club_forum_reactions(reply_id);
CREATE INDEX IF NOT EXISTS idx_club_forum_reactions_user ON club_forum_reactions(user_id);

-- Function to update reaction counts on topics
CREATE OR REPLACE FUNCTION update_topic_reaction_counts()
RETURNS TRIGGER AS $$
BEGIN
    -- This will be handled in the application layer
    -- But we can add triggers if needed for real-time updates
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies for reactions
ALTER TABLE club_forum_reactions ENABLE ROW LEVEL SECURITY;

-- Members can view all reactions in their clubs
CREATE POLICY "Members can view reactions"
ON club_forum_reactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM club_forum_topics
        JOIN club_members ON club_members.club_id = club_forum_topics.club_id
        WHERE (club_forum_reactions.topic_id = club_forum_topics.id OR 
               EXISTS (
                   SELECT 1 FROM club_forum_replies
                   JOIN club_forum_topics t2 ON t2.id = club_forum_replies.topic_id
                   WHERE club_forum_replies.id = club_forum_reactions.reply_id
                   AND club_members.club_id = t2.club_id
               ))
        AND club_members.user_id = auth.uid()
        AND club_members.status = 'accepted'
    )
);

-- Members can create reactions
CREATE POLICY "Members can create reactions"
ON club_forum_reactions FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND (
        EXISTS (
            SELECT 1 FROM club_forum_topics
            JOIN club_members ON club_members.club_id = club_forum_topics.club_id
            WHERE club_forum_topics.id = club_forum_reactions.topic_id
            AND club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
        )
        OR EXISTS (
            SELECT 1 FROM club_forum_replies
            JOIN club_forum_topics ON club_forum_topics.id = club_forum_replies.topic_id
            JOIN club_members ON club_members.club_id = club_forum_topics.club_id
            WHERE club_forum_replies.id = club_forum_reactions.reply_id
            AND club_members.user_id = auth.uid()
            AND club_members.status = 'accepted'
        )
    )
);

-- Members can update their own reactions
CREATE POLICY "Members can update reactions"
ON club_forum_reactions FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Members can delete their own reactions
CREATE POLICY "Members can delete reactions"
ON club_forum_reactions FOR DELETE
USING (user_id = auth.uid());

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE club_forum_reactions;

