-- Add social_links column to profiles
-- Structure: {"instagram": "handle", "tiktok": "handle", "linkedin": "url", "facebook": "url", "x": "handle"}
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'social_links') THEN
        ALTER TABLE public.profiles ADD COLUMN social_links jsonb DEFAULT '{}'::jsonb;
    END IF;
END $$;

