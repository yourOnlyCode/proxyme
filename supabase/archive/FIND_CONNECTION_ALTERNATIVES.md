# Alternative Ways to Find Supabase Connection Details

## Method 1: Check Your Project URL
Your Supabase project URL contains the PROJECT_REF:
- URL format: `https://[PROJECT_REF].supabase.co`
- Example: If your URL is `https://abcdefghijklmnop.supabase.co`, then `abcdefghijklmnop` is your PROJECT_REF

## Method 2: Settings → Database → Connection Info
1. Go to **Settings** → **Database**
2. Look for sections like:
   - **Connection string** (might be under "Connection pooling" or "Direct connection")
   - **Connection info** 
   - **Database URL**
   - **Host** (this will show the region)

## Method 3: Use Supabase CLI (if installed)
```bash
supabase status
```
This will show your connection details.

## Method 4: Check Environment Variables
If you have a `.env` file or environment variables, look for:
- `SUPABASE_URL` (contains PROJECT_REF)
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (full connection string)

## Method 5: Simplest Solution - Use SQL Editor with Service Role

Actually, the **easiest way** is to use the Supabase SQL Editor, but we need to ensure you're using the service_role context.

Try this in your SQL Editor:

```sql
-- Check if you have superuser privileges
SELECT current_user, usesuper FROM pg_user WHERE usename = current_user;

-- If usesuper is true, you should be able to enable RLS directly
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
```

If that still doesn't work, the SQL Editor might be using a restricted role. In that case, you'll need to connect via psql or use the Supabase Management API.

