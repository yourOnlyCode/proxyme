# How to Connect as Owner Account in Supabase

## Method 1: Use Connection String with Different Role

If you have access to your Supabase connection string, you can connect as a different role:

1. Go to **Settings** → **Database** → **Connection string**
2. Copy the connection string
3. Modify it to include the role:

```
postgresql://[OWNER_ROLE]:[PASSWORD]@[HOST]:[PORT]/postgres
```

However, Supabase typically doesn't give you separate credentials for owner roles.

## Method 2: Use SET SESSION AUTHORIZATION in SQL Editor

Run this first to identify the owner:

```sql
SELECT 
    'spatial_ref_sys owner' as info,
    tableowner as owner
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys';
```

Then try to switch (replace 'OWNER_NAME' with the result):

```sql
SET SESSION AUTHORIZATION 'OWNER_NAME';
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
RESET SESSION AUTHORIZATION;
```

## Method 3: Use Service Role Key (Highest Privileges)

In Supabase Dashboard:
1. Go to **Settings** → **API**
2. Copy the **service_role** key (NOT the anon key - this has superuser privileges)
3. Use this in your connection string or API calls

The service_role has the highest privileges and should be able to enable RLS.

## Method 4: Contact Supabase Support

If none of the above work, the owner role might be a protected system role that cannot be accessed directly. Contact Supabase support to enable RLS on system tables.

