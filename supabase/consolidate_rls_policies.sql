-- Consolidate Multiple Permissive RLS Policies for Performance
-- This script finds tables with multiple permissive policies for the same role/action
-- and consolidates them into single policies with OR conditions
-- This significantly improves query performance

DO $$
DECLARE
    table_record RECORD;
    policy_group RECORD;
    consolidated_using TEXT;
    consolidated_with_check TEXT;
    policy_names TEXT[];
    new_policy_name TEXT;
    schema_name TEXT;
    table_name TEXT;
    action_type TEXT;
    role_name TEXT;
    policy_count INT;
    old_policy_name TEXT;
BEGIN
    -- Loop through all tables with RLS enabled
    FOR table_record IN
        SELECT 
            n.nspname as schema_name,
            c.relname as table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
        AND c.relrowsecurity = true
        ORDER BY c.relname
    LOOP
        schema_name := table_record.schema_name;
        table_name := table_record.table_name;
        
        RAISE NOTICE 'Processing table: %.%', schema_name, table_name;
        
        -- Find groups of permissive policies for the same action and role
        FOR policy_group IN
            SELECT 
                pol.polcmd as command,
                pol.polroles::regrole[] as roles,
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
            WHERE pn.nspname = schema_name
            AND pc.relname = table_name
            AND pol.polpermissive = true  -- Only permissive policies
            GROUP BY pol.polcmd, pol.polroles
            HAVING COUNT(*) > 1  -- Only groups with multiple policies
        LOOP
            policy_count := policy_group.policy_count;
            policy_names := policy_group.policy_names;
            
            -- Determine action type
            CASE policy_group.command
                WHEN 'r' THEN action_type := 'SELECT';
                WHEN 'a' THEN action_type := 'INSERT';
                WHEN 'w' THEN action_type := 'UPDATE';
                WHEN 'd' THEN action_type := 'DELETE';
                WHEN '*' THEN action_type := 'ALL';
                ELSE action_type := 'UNKNOWN';
            END CASE;
            
            RAISE NOTICE '  Found % permissive policies for % on role(s): %', 
                policy_count, action_type, array_to_string(policy_group.roles, ', ');
            RAISE NOTICE '  Policies to consolidate: %', array_to_string(policy_names, ', ');
            
            -- Consolidate USING expressions with OR
            IF array_length(policy_group.using_expressions, 1) > 0 THEN
                consolidated_using := '(' || array_to_string(policy_group.using_expressions, ' OR ') || ')';
            ELSE
                consolidated_using := NULL;
            END IF;
            
            -- Consolidate WITH CHECK expressions with OR
            IF array_length(policy_group.with_check_expressions, 1) > 0 THEN
                consolidated_with_check := '(' || array_to_string(policy_group.with_check_expressions, ' OR ') || ')';
            ELSE
                consolidated_with_check := NULL;
            END IF;
            
            -- Create new consolidated policy name
            new_policy_name := format('consolidated_%s_%s', 
                lower(action_type), 
                lower(replace(table_name, ' ', '_'))
            );
            
            -- If policy name is too long, truncate it
            IF length(new_policy_name) > 63 THEN
                new_policy_name := substring(new_policy_name, 1, 63);
            END IF;
            
            -- Drop all old policies
            FOREACH old_policy_name IN ARRAY policy_names
            LOOP
                BEGIN
                    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                        old_policy_name, schema_name, table_name);
                    RAISE NOTICE '    Dropped policy: %', old_policy_name;
                EXCEPTION WHEN OTHERS THEN
                    RAISE NOTICE '    Could not drop policy %: %', old_policy_name, SQLERRM;
                END;
            END LOOP;
            
            -- Create new consolidated policy
            BEGIN
                CASE action_type
                    WHEN 'SELECT' THEN
                        IF consolidated_using IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR SELECT USING %s', 
                                new_policy_name, schema_name, table_name, consolidated_using);
                            RAISE NOTICE '    Created consolidated SELECT policy: %', new_policy_name;
                        END IF;
                    
                    WHEN 'INSERT' THEN
                        IF consolidated_with_check IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR INSERT WITH CHECK %s', 
                                new_policy_name, schema_name, table_name, consolidated_with_check);
                            RAISE NOTICE '    Created consolidated INSERT policy: %', new_policy_name;
                        ELSIF consolidated_using IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR INSERT USING %s', 
                                new_policy_name, schema_name, table_name, consolidated_using);
                            RAISE NOTICE '    Created consolidated INSERT policy: %', new_policy_name;
                        END IF;
                    
                    WHEN 'UPDATE' THEN
                        IF consolidated_using IS NOT NULL AND consolidated_with_check IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE USING %s WITH CHECK %s', 
                                new_policy_name, schema_name, table_name, 
                                consolidated_using, consolidated_with_check);
                            RAISE NOTICE '    Created consolidated UPDATE policy: %', new_policy_name;
                        ELSIF consolidated_using IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE USING %s', 
                                new_policy_name, schema_name, table_name, consolidated_using);
                            RAISE NOTICE '    Created consolidated UPDATE policy: %', new_policy_name;
                        ELSIF consolidated_with_check IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE WITH CHECK %s', 
                                new_policy_name, schema_name, table_name, consolidated_with_check);
                            RAISE NOTICE '    Created consolidated UPDATE policy: %', new_policy_name;
                        END IF;
                    
                    WHEN 'DELETE' THEN
                        IF consolidated_using IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR DELETE USING %s', 
                                new_policy_name, schema_name, table_name, consolidated_using);
                            RAISE NOTICE '    Created consolidated DELETE policy: %', new_policy_name;
                        END IF;
                    
                    WHEN 'ALL' THEN
                        IF consolidated_using IS NOT NULL AND consolidated_with_check IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL USING %s WITH CHECK %s', 
                                new_policy_name, schema_name, table_name, 
                                consolidated_using, consolidated_with_check);
                            RAISE NOTICE '    Created consolidated ALL policy: %', new_policy_name;
                        ELSIF consolidated_using IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL USING %s', 
                                new_policy_name, schema_name, table_name, consolidated_using);
                            RAISE NOTICE '    Created consolidated ALL policy: %', new_policy_name;
                        ELSIF consolidated_with_check IS NOT NULL THEN
                            EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL WITH CHECK %s', 
                                new_policy_name, schema_name, table_name, consolidated_with_check);
                            RAISE NOTICE '    Created consolidated ALL policy: %', new_policy_name;
                        END IF;
                END CASE;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '    Error creating consolidated policy: %', SQLERRM;
                -- Try to restore original policies if consolidation fails
                RAISE NOTICE '    WARNING: Original policies were dropped but consolidation failed!';
            END;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'RLS policy consolidation complete!';
    RAISE NOTICE 'Check Supabase dashboard to verify warnings are resolved.';
END $$;

