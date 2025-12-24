-- Optimize ALL RLS Policies Automatically
-- This script finds all policies using auth.uid() and optimizes them
-- Run this to fix all 105+ warnings at once

DO $$
DECLARE
    policy_rec RECORD;
    new_using TEXT;
    new_with_check TEXT;
    needs_update BOOLEAN;
BEGIN
    FOR policy_rec IN
        SELECT 
            n.nspname as schema_name,
            c.relname as table_name,
            p.polname as policy_name,
            CASE p.polcmd
                WHEN 'r' THEN 'SELECT'
                WHEN 'a' THEN 'INSERT'
                WHEN 'w' THEN 'UPDATE'
                WHEN 'd' THEN 'DELETE'
                WHEN '*' THEN 'ALL'
            END as command,
            pg_get_expr(p.polqual, p.polrelid) as using_expr,
            pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
        AND (
            pg_get_expr(p.polqual, p.polrelid) LIKE '%auth.uid()%'
            OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%auth.uid()%'
            OR pg_get_expr(p.polqual, p.polrelid) LIKE '%current_setting(%'
            OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%current_setting(%'
        )
    LOOP
        needs_update := false;
        new_using := policy_rec.using_expr;
        new_with_check := policy_rec.with_check_expr;
        
        -- Optimize USING clause
        IF policy_rec.using_expr IS NOT NULL THEN
            IF policy_rec.using_expr ~ '\bauth\.uid\(\)' THEN
                new_using := regexp_replace(
                    policy_rec.using_expr,
                    '\bauth\.uid\(\)',
                    '(SELECT auth.uid())',
                    'g'
                );
                needs_update := true;
            END IF;
            IF policy_rec.using_expr ~ '\bcurrent_setting\(' THEN
                new_using := regexp_replace(
                    new_using,
                    'current_setting\(',
                    '(SELECT current_setting(',
                    'g'
                );
                needs_update := true;
            END IF;
        END IF;
        
        -- Optimize WITH CHECK clause
        IF policy_rec.with_check_expr IS NOT NULL THEN
            IF policy_rec.with_check_expr ~ '\bauth\.uid\(\)' THEN
                new_with_check := regexp_replace(
                    policy_rec.with_check_expr,
                    '\bauth\.uid\(\)',
                    '(SELECT auth.uid())',
                    'g'
                );
                needs_update := true;
            END IF;
            IF policy_rec.with_check_expr ~ '\bcurrent_setting\(' THEN
                new_with_check := regexp_replace(
                    new_with_check,
                    'current_setting\(',
                    '(SELECT current_setting(',
                    'g'
                );
                needs_update := true;
            END IF;
        END IF;
        
        -- Only update if changes were made
        IF needs_update THEN
            -- Drop existing policy
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name);
            
            -- Recreate with optimized expressions
            IF policy_rec.command = 'SELECT' THEN
                IF new_using IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR SELECT USING (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_using);
                END IF;
            ELSIF policy_rec.command = 'INSERT' THEN
                IF new_with_check IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR INSERT WITH CHECK (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_with_check);
                ELSIF new_using IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR INSERT USING (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_using);
                END IF;
            ELSIF policy_rec.command = 'UPDATE' THEN
                IF new_using IS NOT NULL AND new_with_check IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_using, new_with_check);
                ELSIF new_using IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE USING (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_using);
                ELSIF new_with_check IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE WITH CHECK (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_with_check);
                END IF;
            ELSIF policy_rec.command = 'DELETE' THEN
                IF new_using IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR DELETE USING (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_using);
                END IF;
            ELSIF policy_rec.command = 'ALL' THEN
                IF new_using IS NOT NULL AND new_with_check IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL USING (%s) WITH CHECK (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_using, new_with_check);
                ELSIF new_using IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL USING (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_using);
                ELSIF new_with_check IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL WITH CHECK (%s)',
                        policy_rec.policy_name, policy_rec.schema_name, policy_rec.table_name, new_with_check);
                END IF;
            END IF;
            
            RAISE NOTICE 'Optimized: %.%.%', policy_rec.schema_name, policy_rec.table_name, policy_rec.policy_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'All RLS policies optimized!';
END $$;

