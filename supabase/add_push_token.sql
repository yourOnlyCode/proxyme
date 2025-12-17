-- Add expo_push_token column to profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'expo_push_token') THEN
        ALTER TABLE public.profiles ADD COLUMN expo_push_token text;
    END IF;
END $$;

