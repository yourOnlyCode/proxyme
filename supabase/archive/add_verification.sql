-- Add is_verified column to profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_verified') THEN
        ALTER TABLE public.profiles ADD COLUMN is_verified boolean DEFAULT false;
    END IF;
END $$;

