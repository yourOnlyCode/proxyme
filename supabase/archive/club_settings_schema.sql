-- Add max_member_count column to clubs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'max_member_count') THEN
        ALTER TABLE public.clubs ADD COLUMN max_member_count integer DEFAULT NULL;
    END IF;
END $$;

-- Add constraint to ensure max_member_count is positive if set
ALTER TABLE public.clubs 
DROP CONSTRAINT IF EXISTS clubs_max_member_count_positive;

ALTER TABLE public.clubs 
ADD CONSTRAINT clubs_max_member_count_positive 
CHECK (max_member_count IS NULL OR max_member_count > 0);

