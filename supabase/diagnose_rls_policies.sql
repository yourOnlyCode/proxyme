-- Diagnostic Script: Find Multiple Permissive RLS Policies
-- Run this first to see which policies will be consolidated
-- This script does NOT make any changes, it only reports

SELECT 
    pn.nspname as schema_name,
    pc.relname as table_name,
    CASE pol.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
        ELSE 'UNKNOWN'
    END as action_type,
    array_to_string(pol.polroles::regrole[], ', ') as roles,
    COUNT(*) as policy_count,
    array_agg(pol.polname ORDER BY pol.polname) as policy_names,
    array_agg(
        CASE 
            WHEN pg_get_expr(pol.polqual, pol.polrelid) IS NOT NULL 
            THEN pg_get_expr(pol.polqual, pol.polrelid)
            ELSE NULL
        END
    ) FILTER (WHERE pg_get_expr(pol.polqual, pol.polrelid) IS NOT NULL) as using_expressions,
    array_agg(
        CASE 
            WHEN pg_get_expr(pol.polwithcheck, pol.polrelid) IS NOT NULL 
            THEN pg_get_expr(pol.polwithcheck, pol.polrelid)
            ELSE NULL
        END
    ) FILTER (WHERE pg_get_expr(pol.polwithcheck, pol.polrelid) IS NOT NULL) as with_check_expressions
FROM pg_policy pol
JOIN pg_class pc ON pc.oid = pol.polrelid
JOIN pg_namespace pn ON pn.oid = pc.relnamespace
WHERE pn.nspname = 'public'
AND pol.polpermissive = true  -- Only permissive policies
GROUP BY pn.nspname, pc.relname, pol.polcmd, pol.polroles
HAVING COUNT(*) > 1  -- Only groups with multiple policies
ORDER BY pc.relname, pol.polcmd, policy_count DESC;

