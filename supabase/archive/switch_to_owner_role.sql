-- Switch to Database Owner Role and Enable RLS
-- This script identifies the actual database owner and attempts to switch to that role

DO $$
DECLARE
    current_user_name text;
    db_owner text;
    table_owner text;
    postgis_ext_owner text;
BEGIN
    -- Get current user
    SELECT current_user INTO current_user_name;
    RAISE NOTICE 'Current user (postgres): %', current_user_name;
    
    -- Find database owner
    SELECT pg_catalog.pg_get_userbyid(datdba) INTO db_owner
    FROM pg_catalog.pg_database
    WHERE datname = current_database();
    
    -- Find spatial_ref_sys table owner
    SELECT tableowner INTO table_owner 
    FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys';
    
    -- Find PostGIS extension owner
    SELECT e.extowner::regrole::text INTO postgis_ext_owner
    FROM pg_extension e
    WHERE e.extname = 'postgis';
    
    RAISE NOTICE 'Database owner: %', db_owner;
    RAISE NOTICE 'spatial_ref_sys table owner: %', table_owner;
    RAISE NOTICE 'PostGIS extension owner: %', postgis_ext_owner;
    
    -- Try to switch to database owner role
    IF db_owner IS NOT NULL AND db_owner != current_user_name THEN
        BEGIN
            EXECUTE format('SET SESSION AUTHORIZATION %I', db_owner);
            RAISE NOTICE 'SUCCESS: Switched to database owner role: %', db_owner;
            
            -- Now try to enable RLS as the owner
            ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
            RAISE NOTICE 'SUCCESS: RLS enabled on spatial_ref_sys!';
            
            -- Add read policy
            BEGIN
                DROP POLICY IF EXISTS "Allow public read access" ON public.spatial_ref_sys;
                CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);
                RAISE NOTICE 'SUCCESS: Read policy created';
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not create policy: %', SQLERRM;
            END;
            
            -- Reset authorization
            RESET SESSION AUTHORIZATION;
            
        EXCEPTION WHEN insufficient_privilege THEN
            RESET SESSION AUTHORIZATION;
            RAISE NOTICE 'Cannot SET SESSION AUTHORIZATION: %', SQLERRM;
            RAISE NOTICE 'Trying alternative: Grant membership to owner role...';
            
            -- Alternative: Grant owner role to current user
            BEGIN
                EXECUTE format('GRANT %I TO %I', db_owner, current_user_name);
                RAISE NOTICE 'Granted % to %', db_owner, current_user_name;
                
                -- Try SET ROLE instead
                EXECUTE format('SET ROLE %I', db_owner);
                RAISE NOTICE 'Set role to %', db_owner;
                
                ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
                RAISE NOTICE 'SUCCESS: RLS enabled!';
                
                -- Add policy
                DROP POLICY IF EXISTS "Allow public read access" ON public.spatial_ref_sys;
                CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);
                RAISE NOTICE 'SUCCESS: Policy created';
                
                RESET ROLE;
                
            EXCEPTION WHEN OTHERS THEN
                RESET ROLE;
                RAISE NOTICE 'Alternative approach failed: %', SQLERRM;
            END;
            
        WHEN OTHERS THEN
            RESET SESSION AUTHORIZATION;
            RAISE NOTICE 'Error: %', SQLERRM;
        END;
    END IF;
    
    -- If table owner is different, try that too
    IF table_owner IS NOT NULL AND table_owner != current_user_name AND table_owner != db_owner THEN
        BEGIN
            EXECUTE format('SET ROLE %I', table_owner);
            RAISE NOTICE 'Set role to table owner: %', table_owner;
            
            ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
            RAISE NOTICE 'SUCCESS: RLS enabled as table owner!';
            
            DROP POLICY IF EXISTS "Allow public read access" ON public.spatial_ref_sys;
            CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);
            RAISE NOTICE 'SUCCESS: Policy created';
            
            RESET ROLE;
        EXCEPTION WHEN OTHERS THEN
            RESET ROLE;
            RAISE NOTICE 'Could not use table owner role: %', SQLERRM;
        END;
    END IF;
    
    -- Show current effective role
    RAISE NOTICE 'Current effective role: %', current_setting('role');
    RAISE NOTICE 'Session authorization: %', current_setting('session_authorization');
    
END $$;

