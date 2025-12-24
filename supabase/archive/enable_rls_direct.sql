-- Enable RLS on spatial_ref_sys using Service Role Context
-- Run this in Supabase SQL Editor
-- If it fails, you need to connect via psql with service_role key

-- First, check your current privileges
SELECT 
    current_user as "Current User",
    current_setting('is_superuser') as "Is Superuser",
    (SELECT usesuper FROM pg_user WHERE usename = current_user) as "Has Superuser";

-- Check table owner
SELECT 
    tableowner as "Table Owner",
    tableowner = current_user as "You Are Owner"
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys';

-- Try to enable RLS (this should work if you're superuser)
DO $$
BEGIN
    ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'SUCCESS: RLS enabled!';
    
    -- Add read policy
    DROP POLICY IF EXISTS "Allow public read access" ON public.spatial_ref_sys;
    CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);
    RAISE NOTICE 'SUCCESS: Policy created!';
    
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ERROR: Insufficient privileges. You need to connect via psql with service_role key.';
    RAISE NOTICE 'See FIND_CONNECTION_ALTERNATIVES.md for instructions.';
WHEN OTHERS THEN
    RAISE NOTICE 'ERROR: %', SQLERRM;
END $$;

