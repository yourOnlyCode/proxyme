-- Security Fixes
-- 1. spatial_ref_sys is a PostGIS system table owned by postgres
-- We cannot enable RLS on it directly, but we can revoke public API access
-- This prevents the table from being accessible via PostgREST API
REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated;
REVOKE ALL ON TABLE public.spatial_ref_sys FROM public;

-- Note: If you want to completely exclude this table from the API,
-- you can also do this in Supabase Dashboard > Settings > API > Excluded Tables

-- 2. Extension in Public Schema Warning
-- Note: PostGIS extension does not support being moved to a different schema
-- This is a known limitation. The warning is informational and does not pose a security risk.
-- PostGIS system tables are owned by postgres and are not directly accessible via the API
-- after we revoke access (see above).

-- If you want to minimize this warning, you can:
-- 1. Keep PostGIS in public (recommended - it's safe)
-- 2. Or use a custom schema for PostGIS from the start (requires fresh install)
-- 3. The security advisor warning is informational only - PostGIS tables are protected

-- 3. Note: Leaked Password Protection is a project-level setting in Supabase dashboard
-- It cannot be enabled via SQL migration. 
-- Please go to Authentication > Security > Advanced in your Supabase dashboard to enable it.

