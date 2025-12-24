-- Alternative: Use Supabase Management API to Enable RLS
-- This doesn't require finding the connection string

-- Actually, you can't enable RLS via Management API directly.
-- But here's what you CAN do:

-- Option 1: Contact Supabase Support
-- They can enable RLS on system tables for you.

-- Option 2: Use the Supabase Dashboard SQL Editor
-- The SQL Editor should have superuser privileges.
-- Try running this:

ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);

-- Option 3: If SQL Editor doesn't work, find connection details:
-- 
-- PROJECT_REF: Look at your project URL
--   https://[PROJECT_REF].supabase.co
--
-- SERVICE_ROLE_KEY: Settings → API → service_role (click Reveal)
--
-- REGION: Check your project settings or look in any existing .env file
--
-- Then connect via:
-- psql "postgresql://postgres.[PROJECT_REF]:[SERVICE_ROLE_KEY]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

