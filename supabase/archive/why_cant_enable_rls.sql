-- FINAL DIAGNOSTIC: Why You Can't Enable RLS
-- Run this to see the exact ownership situation

SELECT 
    'Database Owner' as "Type",
    pg_catalog.pg_get_userbyid(datdba)::text as "Owner"
FROM pg_catalog.pg_database
WHERE datname = current_database()

UNION ALL

SELECT 
    'spatial_ref_sys Table Owner' as "Type",
    tableowner::text as "Owner"
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys'

UNION ALL

SELECT 
    'PostGIS Extension Owner' as "Type",
    e.extowner::regrole::text as "Owner"
FROM pg_extension e
WHERE e.extname = 'postgis'

UNION ALL

SELECT 
    'Your Current User' as "Type",
    current_user::text as "Owner"

UNION ALL

SELECT 
    'Are You Table Owner?' as "Type",
    CASE 
        WHEN (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys') = current_user 
        THEN 'YES - You should be able to enable RLS'
        ELSE 'NO - That is why you cannot enable RLS'
    END as "Owner";

-- THE PROBLEM:
-- Even though you are the DATABASE owner, spatial_ref_sys is owned by the 
-- PostGIS EXTENSION owner (usually a system role like supabase_admin).
-- Database owner ≠ Table owner
-- You need to be the TABLE owner to enable RLS.

