-- Force RLS on spatial_ref_sys
-- This script attempts to claim ownership of the table to enable RLS.
-- Run this in the Supabase Dashboard SQL Editor.

DO $$
DECLARE
    current_user_name text;
    table_owner text;
BEGIN
    SELECT current_user INTO current_user_name;
    SELECT tableowner INTO table_owner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys';
    
    RAISE NOTICE 'Current user: %', current_user_name;
    RAISE NOTICE 'Table owner: %', table_owner;

    -- Attempt to set owner to current user (usually 'postgres')
    -- This requires superuser privileges or being a member of the owning role
    BEGIN
        EXECUTE 'ALTER TABLE public.spatial_ref_sys OWNER TO ' || quote_ident(current_user_name);
        RAISE NOTICE 'Ownership transferred to %', current_user_name;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not change ownership: %. Proceeding to try RLS anyway...', SQLERRM;
    END;

    -- Enable RLS
    ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS Enabled on spatial_ref_sys';

    -- Add permissive policy so maps still work
    BEGIN
        DROP POLICY IF EXISTS "Allow public read access" ON public.spatial_ref_sys;
        CREATE POLICY "Allow public read access" ON public.spatial_ref_sys FOR SELECT TO public USING (true);
        RAISE NOTICE 'Read policy created';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create policy: %', SQLERRM;
    END;
END $$;

