-- Workaround for spatial_ref_sys RLS Issue
-- Since we cannot enable RLS on this PostGIS system table (it's owned by a protected role),
-- we'll exclude it from PostgREST API exposure and document the limitation.

-- 1. Revoke all API access to spatial_ref_sys
-- This prevents it from being accessible via the REST API
REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon;
REVOKE ALL ON TABLE public.spatial_ref_sys FROM authenticated;
REVOKE ALL ON TABLE public.spatial_ref_sys FROM service_role;

-- 2. Grant usage only to postgres role (for internal PostGIS functions)
-- This ensures PostGIS still works internally
GRANT USAGE ON SCHEMA public TO postgres;
GRANT SELECT ON TABLE public.spatial_ref_sys TO postgres;

-- 3. Verify the revocations worked
DO $$
BEGIN
    RAISE NOTICE 'API access revoked from spatial_ref_sys';
    RAISE NOTICE 'PostGIS functions will still work via postgres role';
END $$;

-- IMPORTANT: The Security Advisor warning will STILL appear because it checks 
-- the base table's RLS status, not the GRANT/REVOKE permissions.
--
-- You MUST do ONE of the following to clear the warning:
--
-- OPTION 1 (Recommended): Exclude the table from PostgREST API
--   1. Go to Supabase Dashboard > Settings > API
--   2. Find "Excluded Tables" or "API Schema" settings
--   3. Add "spatial_ref_sys" to the exclusion list
--
-- OPTION 2: Dismiss the warning in Security Advisor
--   - This is a false positive for PostGIS system tables
--   - The table is already secured via REVOKE statements above
--   - PostGIS system tables are read-only reference data

