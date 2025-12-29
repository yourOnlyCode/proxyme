-- Diagnostic Script: Find RLS Policies with Performance Issues
-- Identifies policies that use auth.uid(), auth.jwt(), or current_setting() without subqueries
-- This script does NOT make any changes, it only reports

SELECT 
    pn.nspname as schema_name,
    pc.relname as table_name,
    pol.polname as policy_name,
    CASE pol.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
        ELSE 'UNKNOWN'
    END as action_type,
    pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
    pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expr,
    CASE 
        WHEN pg_get_expr(pol.polqual, pol.polrelid) ~ '\bauth\.uid\(\)' 
             AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(SELECT auth\.uid\(\)\)' 
        THEN 'auth.uid() in USING'
        WHEN pg_get_expr(pol.polwithcheck, pol.polrelid) ~ '\bauth\.uid\(\)' 
             AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(SELECT auth\.uid\(\)\)' 
        THEN 'auth.uid() in WITH CHECK'
        WHEN pg_get_expr(pol.polqual, pol.polrelid) ~ '\bauth\.jwt\(\)' 
             AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(SELECT auth\.jwt\(\)\)' 
        THEN 'auth.jwt() in USING'
        WHEN pg_get_expr(pol.polwithcheck, pol.polrelid) ~ '\bauth\.jwt\(\)' 
             AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(SELECT auth\.jwt\(\)\)' 
        THEN 'auth.jwt() in WITH CHECK'
        WHEN pg_get_expr(pol.polqual, pol.polrelid) ~ 'current_setting\(' 
             AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(SELECT current_setting\(' 
        THEN 'current_setting() in USING'
        WHEN pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'current_setting\(' 
             AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(SELECT current_setting\(' 
        THEN 'current_setting() in WITH CHECK'
        ELSE 'OK'
    END as issue_type
FROM pg_policy pol
JOIN pg_class pc ON pc.oid = pol.polrelid
JOIN pg_namespace pn ON pn.oid = pc.relnamespace
WHERE pn.nspname = 'public'
AND (
    (pg_get_expr(pol.polqual, pol.polrelid) ~ '\bauth\.uid\(\)' 
     AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(SELECT auth\.uid\(\)\)')
    OR (pg_get_expr(pol.polwithcheck, pol.polrelid) ~ '\bauth\.uid\(\)' 
        AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(SELECT auth\.uid\(\)\)')
    OR (pg_get_expr(pol.polqual, pol.polrelid) ~ '\bauth\.jwt\(\)' 
        AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(SELECT auth\.jwt\(\)\)')
    OR (pg_get_expr(pol.polwithcheck, pol.polrelid) ~ '\bauth\.jwt\(\)' 
        AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(SELECT auth\.jwt\(\)\)')
    OR (pg_get_expr(pol.polqual, pol.polrelid) ~ 'current_setting\(' 
        AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(SELECT current_setting\(')
    OR (pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'current_setting\(' 
        AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(SELECT current_setting\(')
)
ORDER BY pc.relname, pol.polname;

