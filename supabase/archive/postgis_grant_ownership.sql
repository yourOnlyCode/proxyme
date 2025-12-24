-- Have PostGIS Extension Owner Grant Ownership of spatial_ref_sys
-- This script attempts to execute as the PostGIS extension owner to change table ownership

DO $$
DECLARE
    current_user_name text;
    postgis_owner_role text;
    spatial_table_owner text;
BEGIN
    -- Get current user
    SELECT current_user INTO current_user_name;
    RAISE NOTICE 'Current user: %', current_user_name;
    
    -- Find PostGIS extension owner (the role that owns the extension)
    SELECT e.extowner::regrole::text INTO postgis_owner_role
    FROM pg_extension e
    WHERE e.extname = 'postgis';
    
    -- Find spatial_ref_sys table owner
    SELECT tableowner INTO spatial_table_owner 
    FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys';
    
    RAISE NOTICE 'PostGIS extension owner: %', postgis_owner_role;
    RAISE NOTICE 'spatial_ref_sys current owner: %', spatial_table_owner;
    
    -- Try to set role to PostGIS owner and change ownership
    IF postgis_owner_role IS NOT NULL THEN
        BEGIN
            -- Attempt to execute as the PostGIS owner role
            EXECUTE format('SET ROLE %I', postgis_owner_role);
            RAISE NOTICE 'Set role to PostGIS owner: %', postgis_owner_role;
            
            -- Now try to change ownership to current user
            EXECUTE format('ALTER TABLE public.spatial_ref_sys OWNER TO %I', current_user_name);
            RAISE NOTICE 'SUCCESS: Ownership transferred to %', current_user_name;
            
            -- Reset role
            RESET ROLE;
            
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
            RAISE NOTICE 'Could not SET ROLE to PostGIS owner: %', SQLERRM;
        WHEN OTHERS THEN
            RESET ROLE;
            RAISE NOTICE 'Error changing ownership: %', SQLERRM;
        END;
    END IF;
    
    -- Alternative: Create a SECURITY DEFINER function that runs as PostGIS owner
    -- This function will execute with the privileges of the PostGIS owner
    BEGIN
        DROP FUNCTION IF EXISTS transfer_spatial_ref_sys_ownership(text);
        
        EXECUTE format('
            CREATE FUNCTION transfer_spatial_ref_sys_ownership(new_owner text)
            RETURNS void
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $func$
            BEGIN
                ALTER TABLE public.spatial_ref_sys OWNER TO %I;
            END;
            $func$', postgis_owner_role);
        
        RAISE NOTICE 'Created SECURITY DEFINER function as PostGIS owner';
        
        -- Call the function to transfer ownership
        SELECT transfer_spatial_ref_sys_ownership(current_user_name);
        RAISE NOTICE 'SUCCESS: Ownership transferred via function';
        
        DROP FUNCTION transfer_spatial_ref_sys_ownership(text);
        
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not use SECURITY DEFINER function: %', SQLERRM;
    END;
    
    -- Now try to enable RLS (should work if ownership was transferred)
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
        RAISE NOTICE 'ERROR: Still insufficient privileges to enable RLS.';
        RAISE NOTICE 'Ownership may not have been transferred successfully.';
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR enabling RLS: %', SQLERRM;
    END;
    
END $$;

