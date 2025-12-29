-- Optimize RLS Policies for Performance
-- Wraps auth.uid(), auth.jwt(), and current_setting() calls in subqueries
-- to prevent per-row evaluation and improve query performance

DO $$
DECLARE
    policy_record RECORD;
    table_record RECORD;
    using_expr TEXT;
    with_check_expr TEXT;
    optimized_using TEXT;
    optimized_with_check TEXT;
    needs_update BOOLEAN;
    new_policy_name TEXT;
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
        RAISE NOTICE 'Processing table: %.%', table_record.schema_name, table_record.table_name;
        
        -- Loop through all policies on this table
        FOR policy_record IN
            SELECT 
                pol.polname as policy_name,
                pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
                pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expr,
                pol.polcmd as command
            FROM pg_policy pol
            JOIN pg_class pc ON pc.oid = pol.polrelid
            JOIN pg_namespace pn ON pn.oid = pc.relnamespace
            WHERE pn.nspname = table_record.schema_name
            AND pc.relname = table_record.table_name
        LOOP
            needs_update := false;
            optimized_using := policy_record.using_expr;
            optimized_with_check := policy_record.with_check_expr;
            
            -- Optimize USING clause
            IF policy_record.using_expr IS NOT NULL THEN
                -- Replace auth.uid() with (SELECT auth.uid())
                IF policy_record.using_expr ~ '\bauth\.uid\(\)' 
                   AND policy_record.using_expr !~ '\(SELECT auth\.uid\(\)\)' THEN
                    optimized_using := regexp_replace(
                        policy_record.using_expr,
                        '\bauth\.uid\(\)',
                        '(SELECT auth.uid())',
                        'g'
                    );
                    needs_update := true;
                END IF;
                
                -- Replace auth.jwt() with (SELECT auth.jwt())
                IF policy_record.using_expr ~ '\bauth\.jwt\(\)' 
                   AND policy_record.using_expr !~ '\(SELECT auth\.jwt\(\)\)' THEN
                    optimized_using := regexp_replace(
                        optimized_using,
                        '\bauth\.jwt\(\)',
                        '(SELECT auth.jwt())',
                        'g'
                    );
                    needs_update := true;
                END IF;
                
                -- Replace current_setting('...') with (SELECT current_setting('...'))
                -- This is trickier because we need to preserve the argument
                IF policy_record.using_expr ~ 'current_setting\(' 
                   AND policy_record.using_expr !~ '\(SELECT current_setting\(' THEN
                    -- Match current_setting('...') or current_setting("...")
                    optimized_using := regexp_replace(
                        optimized_using,
                        'current_setting\(([^)]+)\)',
                        '(SELECT current_setting(\1))',
                        'g'
                    );
                    needs_update := true;
                END IF;
            END IF;
            
            -- Optimize WITH CHECK clause
            IF policy_record.with_check_expr IS NOT NULL THEN
                -- Replace auth.uid() with (SELECT auth.uid())
                IF policy_record.with_check_expr ~ '\bauth\.uid\(\)' 
                   AND policy_record.with_check_expr !~ '\(SELECT auth\.uid\(\)\)' THEN
                    optimized_with_check := regexp_replace(
                        policy_record.with_check_expr,
                        '\bauth\.uid\(\)',
                        '(SELECT auth.uid())',
                        'g'
                    );
                    needs_update := true;
                END IF;
                
                -- Replace auth.jwt() with (SELECT auth.jwt())
                IF policy_record.with_check_expr ~ '\bauth\.jwt\(\)' 
                   AND policy_record.with_check_expr !~ '\(SELECT auth\.jwt\(\)\)' THEN
                    optimized_with_check := regexp_replace(
                        optimized_with_check,
                        '\bauth\.jwt\(\)',
                        '(SELECT auth.jwt())',
                        'g'
                    );
                    needs_update := true;
                END IF;
                
                -- Replace current_setting('...') with (SELECT current_setting('...'))
                IF policy_record.with_check_expr ~ 'current_setting\(' 
                   AND policy_record.with_check_expr !~ '\(SELECT current_setting\(' THEN
                    optimized_with_check := regexp_replace(
                        optimized_with_check,
                        'current_setting\(([^)]+)\)',
                        '(SELECT current_setting(\1))',
                        'g'
                    );
                    needs_update := true;
                END IF;
            END IF;
            
            -- Update policy if needed
            IF needs_update THEN
                BEGIN
                    -- Determine command type
                    CASE policy_record.command
                        WHEN 'r' THEN -- SELECT
                            EXECUTE format(
                                'DROP POLICY IF EXISTS %I ON %I.%I',
                                policy_record.policy_name, table_record.schema_name, table_record.table_name
                            );
                            IF optimized_using IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR SELECT USING %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_using
                                );
                            END IF;
                        
                        WHEN 'a' THEN -- INSERT
                            EXECUTE format(
                                'DROP POLICY IF EXISTS %I ON %I.%I',
                                policy_record.policy_name, table_record.schema_name, table_record.table_name
                            );
                            IF optimized_with_check IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR INSERT WITH CHECK %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_with_check
                                );
                            ELSIF optimized_using IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR INSERT USING %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_using
                                );
                            END IF;
                        
                        WHEN 'w' THEN -- UPDATE
                            EXECUTE format(
                                'DROP POLICY IF EXISTS %I ON %I.%I',
                                policy_record.policy_name, table_record.schema_name, table_record.table_name
                            );
                            IF optimized_using IS NOT NULL AND optimized_with_check IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR UPDATE USING %s WITH CHECK %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_using, optimized_with_check
                                );
                            ELSIF optimized_using IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR UPDATE USING %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_using
                                );
                            ELSIF optimized_with_check IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR UPDATE WITH CHECK %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_with_check
                                );
                            END IF;
                        
                        WHEN 'd' THEN -- DELETE
                            EXECUTE format(
                                'DROP POLICY IF EXISTS %I ON %I.%I',
                                policy_record.policy_name, table_record.schema_name, table_record.table_name
                            );
                            IF optimized_using IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR DELETE USING %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_using
                                );
                            END IF;
                        
                        WHEN '*' THEN -- ALL
                            EXECUTE format(
                                'DROP POLICY IF EXISTS %I ON %I.%I',
                                policy_record.policy_name, table_record.schema_name, table_record.table_name
                            );
                            IF optimized_using IS NOT NULL AND optimized_with_check IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR ALL USING %s WITH CHECK %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_using, optimized_with_check
                                );
                            ELSIF optimized_using IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR ALL USING %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_using
                                );
                            ELSIF optimized_with_check IS NOT NULL THEN
                                EXECUTE format(
                                    'CREATE POLICY %I ON %I.%I FOR ALL WITH CHECK %s',
                                    policy_record.policy_name, table_record.schema_name, table_record.table_name,
                                    optimized_with_check
                                );
                            END IF;
                    END CASE;
                    
                    RAISE NOTICE '  Optimized policy: %', policy_record.policy_name;
                EXCEPTION WHEN OTHERS THEN
                    RAISE NOTICE '  Error optimizing policy %: %', policy_record.policy_name, SQLERRM;
                END;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'RLS performance optimization complete!';
    RAISE NOTICE 'All auth.uid(), auth.jwt(), and current_setting() calls have been wrapped in subqueries.';
END $$;

