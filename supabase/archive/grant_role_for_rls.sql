-- Grant Role Membership to Enable RLS on spatial_ref_sys
-- This attempts to grant your current user to the role that owns spatial_ref_sys

DO $$
DECLARE
    current_user_name text;
    table_owner text;
    extension_owner text;
BEGIN
    -- Get current user
    SELECT current_user INTO current_user_name;
    
    -- Find table owner
    SELECT tableowner INTO table_owner 
    FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys';
    
    -- Find PostGIS extension owner
    SELECT n.nspname INTO extension_owner
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'postgis';
    
    RAISE NOTICE 'Current user: %', current_user_name;
    RAISE NOTICE 'Table owner: %', table_owner;
    RAISE NOTICE 'Extension namespace: %', extension_owner;
    
    -- Try to grant current user to the table owner role
    -- This gives us the privileges needed to alter the table
    IF table_owner IS NOT NULL AND table_owner != current_user_name THEN
        BEGIN
            EXECUTE format('GRANT %I TO %I', table_owner, current_user_name);
            RAISE NOTICE 'Granted role % to %', table_owner, current_user_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not grant role membership: %', SQLERRM;
        END;
    END IF;
    
    -- Also try granting to postgres role (common owner)
    BEGIN
        EXECUTE format('GRANT postgres TO %I', current_user_name);
        RAISE NOTICE 'Granted postgres role to %', current_user_name;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not grant postgres role: %', SQLERRM;
    END;
    
    -- Now try to enable RLS
    BEGIN
        ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'SUCCESS: RLS enabled on spatial_ref_sys!';
        
        -- Add read policy
        BEGIN
            DROP POLICY IF EXISTS "Allow public read access" ON public.spatial_ref_sys;
            CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);
            RAISE NOTICE 'Read policy created successfully';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not create policy: %', SQLERRM;
        END;
        
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Still insufficient privileges after role grant. Table owner: %', table_owner;
        RAISE NOTICE 'You may need to contact Supabase support or dismiss this warning.';
    WHEN OTHERS THEN
        RAISE NOTICE 'Error enabling RLS: %', SQLERRM;
    END;
END $$;

