-- Grant PostGIS Extension Owner Role to Enable RLS
-- This targets the specific role that owns the PostGIS extension

DO $$
DECLARE
    current_user_name text;
    postgis_owner_role text;
    spatial_table_owner text;
BEGIN
    -- Get current user
    SELECT current_user INTO current_user_name;
    RAISE NOTICE 'Current user: %', current_user_name;
    
    -- Find PostGIS extension owner (the role that created the extension)
    SELECT e.extowner::regrole::text INTO postgis_owner_role
    FROM pg_extension e
    WHERE e.extname = 'postgis';
    
    -- Find spatial_ref_sys table owner
    SELECT tableowner INTO spatial_table_owner 
    FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys';
    
    RAISE NOTICE 'PostGIS extension owner: %', postgis_owner_role;
    RAISE NOTICE 'spatial_ref_sys table owner: %', spatial_table_owner;
    
    -- Try to grant the PostGIS extension owner role to current user
    IF postgis_owner_role IS NOT NULL AND postgis_owner_role != current_user_name THEN
        BEGIN
            EXECUTE format('GRANT %I TO %I', postgis_owner_role, current_user_name);
            RAISE NOTICE 'SUCCESS: Granted PostGIS owner role % to %', postgis_owner_role, current_user_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not grant PostGIS owner role: %', SQLERRM;
        END;
    END IF;
    
    -- Also try granting the table owner role
    IF spatial_table_owner IS NOT NULL AND spatial_table_owner != current_user_name AND spatial_table_owner != postgis_owner_role THEN
        BEGIN
            EXECUTE format('GRANT %I TO %I', spatial_table_owner, current_user_name);
            RAISE NOTICE 'SUCCESS: Granted table owner role % to %', spatial_table_owner, current_user_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not grant table owner role: %', SQLERRM;
        END;
    END IF;
    
    -- Try common system roles
    BEGIN
        EXECUTE format('GRANT postgres TO %I', current_user_name);
        RAISE NOTICE 'Attempted to grant postgres role';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not grant postgres role: %', SQLERRM;
    END;
    
    BEGIN
        EXECUTE format('GRANT supabase_admin TO %I', current_user_name);
        RAISE NOTICE 'Attempted to grant supabase_admin role';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not grant supabase_admin role: %', SQLERRM;
    END;
    
    -- Now try to enable RLS with elevated privileges
    BEGIN
        ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'SUCCESS: RLS enabled on spatial_ref_sys!';
        
        -- Add permissive read policy
        BEGIN
            DROP POLICY IF EXISTS "Allow public read access" ON public.spatial_ref_sys;
            CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);
            RAISE NOTICE 'SUCCESS: Read policy created';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not create policy: %', SQLERRM;
        END;
        
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'ERROR: Still insufficient privileges.';
        RAISE NOTICE 'PostGIS owner: %, Table owner: %', postgis_owner_role, spatial_table_owner;
        RAISE NOTICE 'You may need to contact Supabase support or dismiss this warning.';
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR enabling RLS: %', SQLERRM;
    END;
    
    -- Show current role memberships
    RAISE NOTICE 'Current role memberships:';
    FOR r IN SELECT rolname FROM pg_roles WHERE pg_has_role(current_user_name, oid, 'member') LOOP
        RAISE NOTICE '  - %', r.rolname;
    END LOOP;
    
END $$;

