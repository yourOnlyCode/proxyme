-- Club Forum Schema
-- Replaces the chat system with a forum system for better dialogue management

-- Forum Topics Table
CREATE TABLE IF NOT EXISTS club_forum_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reply_count INTEGER NOT NULL DEFAULT 0,
    last_reply_at TIMESTAMPTZ,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE
);

-- Forum Replies Table
CREATE TABLE IF NOT EXISTS club_forum_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES club_forum_topics(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_club_forum_topics_club_id ON club_forum_topics(club_id);
CREATE INDEX IF NOT EXISTS idx_club_forum_topics_created_at ON club_forum_topics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_forum_topics_pinned ON club_forum_topics(is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_forum_replies_topic_id ON club_forum_replies(topic_id);
CREATE INDEX IF NOT EXISTS idx_club_forum_replies_created_at ON club_forum_replies(created_at);

-- Function to update topic reply count and last_reply_at
CREATE OR REPLACE FUNCTION update_topic_reply_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE club_forum_topics
    SET 
        reply_count = (
            SELECT COUNT(*) 
            FROM club_forum_replies 
            WHERE topic_id = NEW.topic_id
        ),
        last_reply_at = (
            SELECT MAX(created_at) 
            FROM club_forum_replies 
            WHERE topic_id = NEW.topic_id
        )
    WHERE id = NEW.topic_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update reply stats when a reply is added
CREATE TRIGGER update_topic_reply_stats_trigger
AFTER INSERT ON club_forum_replies
FOR EACH ROW
EXECUTE FUNCTION update_topic_reply_stats();

-- Trigger to update reply stats when a reply is deleted
CREATE TRIGGER update_topic_reply_stats_delete_trigger
AFTER DELETE ON club_forum_replies
FOR EACH ROW
EXECUTE FUNCTION update_topic_reply_stats();

-- RLS Policies for club_forum_topics
ALTER TABLE club_forum_topics ENABLE ROW LEVEL SECURITY;

-- Members can view all topics in their clubs
CREATE POLICY "Members can view topics in their clubs"
ON club_forum_topics FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM club_members
        WHERE club_members.club_id = club_forum_topics.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.status = 'accepted'
    )
);

-- Members can create topics in their clubs
CREATE POLICY "Members can create topics in their clubs"
ON club_forum_topics FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM club_members
        WHERE club_members.club_id = club_forum_topics.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.status = 'accepted'
    )
    AND created_by = auth.uid()
);

-- Topic creator, admins, and owners can update their topics
CREATE POLICY "Topic creators and admins can update topics"
ON club_forum_topics FOR UPDATE
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM club_members
        WHERE club_members.club_id = club_forum_topics.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'admin')
        AND club_members.status = 'accepted'
    )
);

-- Topic creator, admins, and owners can delete topics
CREATE POLICY "Topic creators and admins can delete topics"
ON club_forum_topics FOR DELETE
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM club_members
        WHERE club_members.club_id = club_forum_topics.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'admin')
        AND club_members.status = 'accepted'
    )
);

-- RLS Policies for club_forum_replies
ALTER TABLE club_forum_replies ENABLE ROW LEVEL SECURITY;

-- Members can view replies to topics in their clubs
CREATE POLICY "Members can view replies"
ON club_forum_replies FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM club_forum_topics
        JOIN club_members ON club_members.club_id = club_forum_topics.club_id
        WHERE club_forum_topics.id = club_forum_replies.topic_id
        AND club_members.user_id = auth.uid()
        AND club_members.status = 'accepted'
    )
);

-- Members can create replies to topics in their clubs
CREATE POLICY "Members can create replies"
ON club_forum_replies FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM club_forum_topics
        JOIN club_members ON club_members.club_id = club_forum_topics.club_id
        WHERE club_forum_topics.id = club_forum_replies.topic_id
        AND club_members.user_id = auth.uid()
        AND club_members.status = 'accepted'
        AND club_forum_topics.is_locked = FALSE
    )
);

-- Reply creator, admins, and owners can update replies
CREATE POLICY "Reply creators and admins can update replies"
ON club_forum_replies FOR UPDATE
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM club_forum_topics
        JOIN club_members ON club_members.club_id = club_forum_topics.club_id
        WHERE club_forum_topics.id = club_forum_replies.topic_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'admin')
        AND club_members.status = 'accepted'
    )
);

-- Reply creator, admins, and owners can delete replies
CREATE POLICY "Reply creators and admins can delete replies"
ON club_forum_replies FOR DELETE
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM club_forum_topics
        JOIN club_members ON club_members.club_id = club_forum_topics.club_id
        WHERE club_forum_topics.id = club_forum_replies.topic_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'admin')
        AND club_members.status = 'accepted'
    )
);

-- Enable realtime for forum topics and replies
ALTER PUBLICATION supabase_realtime ADD TABLE club_forum_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE club_forum_replies;

