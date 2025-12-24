-- Security Fixes (Final Attempt)
-- Run this in the Supabase Dashboard SQL Editor for best results.

-- 1. Enable RLS on spatial_ref_sys
-- This is the specific fix requested by the Security Advisor.
-- If this fails with "must be owner", please DISMISS the warning in the dashboard.
-- You cannot change ownership of system tables on managed Supabase instances.
DO $$
BEGIN
    ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Could not enable RLS on spatial_ref_sys: Insufficient privileges. Please dismiss the warning in the dashboard.';
END $$;

-- 2. Add Read-Only Policy
-- Ensure the app can still read map data
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow public read access" ON public.spatial_ref_sys;
    CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table spatial_ref_sys does not exist.';
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Could not create policy on spatial_ref_sys: Insufficient privileges.';
END $$;

-- 3. Leaked Password Protection
-- This MUST be done manually:
-- Go to Authentication > Security > Advanced > Enable Leaked Password Protection

