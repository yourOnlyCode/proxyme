-- Identify Owner and Switch Role
-- First, let's see who owns what

SELECT 
    'Database Owner' as type,
    pg_catalog.pg_get_userbyid(datdba) as owner
FROM pg_catalog.pg_database
WHERE datname = current_database()

UNION ALL

SELECT 
    'spatial_ref_sys Table Owner' as type,
    tableowner::text as owner
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys'

UNION ALL

SELECT 
    'PostGIS Extension Owner' as type,
    e.extowner::regrole::text as owner
FROM pg_extension e
WHERE e.extname = 'postgis'

UNION ALL

SELECT 
    'Current User' as type,
    current_user::text as owner;

-- Now try to switch to the owner role
-- Replace 'OWNER_ROLE_NAME' with the actual owner from above

-- Option 1: SET SESSION AUTHORIZATION (requires superuser)
-- SET SESSION AUTHORIZATION 'OWNER_ROLE_NAME';

-- Option 2: SET ROLE (requires membership in that role)
-- SET ROLE 'OWNER_ROLE_NAME';

-- Option 3: Grant membership then SET ROLE
-- GRANT 'OWNER_ROLE_NAME' TO postgres;
-- SET ROLE 'OWNER_ROLE_NAME';

