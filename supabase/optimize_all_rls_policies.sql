-- Optimize ALL RLS Policies for Performance
-- This script automatically finds and optimizes all policies that use auth.uid() or current_setting()
-- Replaces them with (SELECT auth.uid()) or (SELECT current_setting(...)) to prevent per-row evaluation

DO $$
DECLARE
    policy_record RECORD;
    table_record RECORD;
    policy_def TEXT;
    optimized_def TEXT;
    policy_name TEXT;
    table_name TEXT;
    schema_name TEXT;
BEGIN
    -- Loop through all tables with RLS enabled
    FOR table_record IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = tablename
            AND n.nspname = schemaname
            AND c.relrowsecurity = true
        )
    LOOP
        schema_name := table_record.schemaname;
        table_name := table_record.tablename;
        
        RAISE NOTICE 'Processing table: %.%', schema_name, table_name;
        
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
            WHERE pn.nspname = schema_name
            AND pc.relname = table_name
        LOOP
            policy_name := policy_record.policy_name;
            optimized_def := NULL;
            
            -- Check if USING clause needs optimization
            IF policy_record.using_expr IS NOT NULL THEN
                -- Replace auth.uid() with (SELECT auth.uid())
                optimized_def := regexp_replace(
                    policy_record.using_expr,
                    '\bauth\.uid\(\)',
                    '(SELECT auth.uid())',
                    'g'
                );
                -- Replace current_setting('...') with (SELECT current_setting('...'))
                optimized_def := regexp_replace(
                    optimized_def,
                    '\bcurrent_setting\(',
                    '(SELECT current_setting(',
                    'g'
                );
            END IF;
            
            -- Check if WITH CHECK clause needs optimization
            IF policy_record.with_check_expr IS NOT NULL THEN
                IF optimized_def IS NULL THEN
                    optimized_def := policy_record.with_check_expr;
                END IF;
                -- Replace auth.uid() with (SELECT auth.uid())
                optimized_def := regexp_replace(
                    policy_record.with_check_expr,
                    '\bauth\.uid\(\)',
                    '(SELECT auth.uid())',
                    'g'
                );
                -- Replace current_setting('...') with (SELECT current_setting('...'))
                optimized_def := regexp_replace(
                    optimized_def,
                    '\bcurrent_setting\(',
                    '(SELECT current_setting(',
                    'g'
                );
            END IF;
            
            -- Only update if the policy actually needs optimization
            IF optimized_def IS NOT NULL 
               AND (optimized_def != policy_record.using_expr 
                    OR optimized_def != policy_record.with_check_expr) THEN
                
                -- Determine command type
                CASE policy_record.command
                    WHEN 'r' THEN -- SELECT
                        EXECUTE format(
                            'DROP POLICY IF EXISTS %I ON %I.%I',
                            policy_name, schema_name, table_name
                        );
                        IF policy_record.using_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR SELECT USING (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.using_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        END IF;
                    WHEN 'a' THEN -- INSERT
                        EXECUTE format(
                            'DROP POLICY IF EXISTS %I ON %I.%I',
                            policy_name, schema_name, table_name
                        );
                        IF policy_record.with_check_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR INSERT WITH CHECK (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.with_check_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        ELSIF policy_record.using_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR INSERT USING (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.using_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        END IF;
                    WHEN 'w' THEN -- UPDATE
                        EXECUTE format(
                            'DROP POLICY IF EXISTS %I ON %I.%I',
                            policy_name, schema_name, table_name
                        );
                        IF policy_record.using_expr IS NOT NULL AND policy_record.with_check_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.using_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                ),
                                regexp_replace(
                                    policy_record.with_check_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        ELSIF policy_record.using_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR UPDATE USING (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.using_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        ELSIF policy_record.with_check_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR UPDATE WITH CHECK (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.with_check_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        END IF;
                    WHEN 'd' THEN -- DELETE
                        EXECUTE format(
                            'DROP POLICY IF EXISTS %I ON %I.%I',
                            policy_name, schema_name, table_name
                        );
                        IF policy_record.using_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR DELETE USING (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.using_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        END IF;
                    WHEN '*' THEN -- ALL
                        EXECUTE format(
                            'DROP POLICY IF EXISTS %I ON %I.%I',
                            policy_name, schema_name, table_name
                        );
                        IF policy_record.using_expr IS NOT NULL AND policy_record.with_check_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR ALL USING (%s) WITH CHECK (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.using_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                ),
                                regexp_replace(
                                    policy_record.with_check_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        ELSIF policy_record.using_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR ALL USING (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.using_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        ELSIF policy_record.with_check_expr IS NOT NULL THEN
                            EXECUTE format(
                                'CREATE POLICY %I ON %I.%I FOR ALL WITH CHECK (%s)',
                                policy_name, schema_name, table_name,
                                regexp_replace(
                                    policy_record.with_check_expr,
                                    '\bauth\.uid\(\)',
                                    '(SELECT auth.uid())',
                                    'g'
                                )
                            );
                        END IF;
                END CASE;
                
                RAISE NOTICE 'Optimized policy: %.%.%', schema_name, table_name, policy_name;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'RLS policy optimization complete!';
END $$;

