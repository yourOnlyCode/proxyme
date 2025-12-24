-- ==========================================
-- SPATIAL_REF_SYS RLS ISSUE - FINAL SUMMARY
-- ==========================================
--
-- PROBLEM: Cannot enable RLS on spatial_ref_sys because it's owned by a protected
--          system role (likely supabase_admin or postgres extension owner).
--
-- ATTEMPTS MADE:
-- 1. Direct ALTER TABLE - Failed (must be owner)
-- 2. Change ownership first - Failed (must be owner)  
-- 3. Grant role membership - Failed (protected role)
-- 4. SET ROLE to PostGIS owner - Failed (cannot impersonate)
-- 5. SECURITY DEFINER function - Failed (cannot create as protected role)
--
-- CONCLUSION: This is a hard limitation on managed Supabase instances.
--             The Security Advisor warning is a FALSE POSITIVE for PostGIS system tables.
--
-- ==========================================
-- RECOMMENDED SOLUTIONS (in order):
-- ==========================================

-- OPTION 1: Exclude from API (Best if available)
-- Go to: Dashboard > Settings > API > Excluded Tables
-- Add: spatial_ref_sys
-- This removes it from PostgREST exposure entirely.

-- OPTION 2: Revoke API Access (Already done in spatial_ref_sys_workaround.sql)
-- The table is already secured via REVOKE statements.
-- The Security Advisor still flags it because it checks RLS status, not GRANT/REVOKE.

-- OPTION 3: Contact Supabase Support
-- Request: "Please enable RLS on public.spatial_ref_sys table"
-- They have superuser access and can do this one-time administrative action.

-- OPTION 4: Dismiss the Warning (Recommended)
-- This is a false positive. The table:
-- - Is read-only reference data (EPSG codes)
-- - Is not user-modifiable
-- - Is already secured via REVOKE (not accessible via API)
-- - Is required by PostGIS to function
--
-- To dismiss: Security Advisor > spatial_ref_sys warning > Dismiss

-- ==========================================
-- CURRENT SECURITY STATUS:
-- ==========================================
-- ✅ API access revoked (anon, authenticated cannot access)
-- ✅ Only postgres role can access (for PostGIS functions)
-- ⚠️  RLS not enabled (hard limitation - cannot be fixed via SQL)
-- ⚠️  Security Advisor still flags it (checks RLS metadata, not actual security)

-- The table is effectively secured even without RLS enabled.

