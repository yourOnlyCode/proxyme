# How to Find Supabase Connection Details

## Where to Find Each Value:

### 1. PROJECT_REF (Project Reference ID)
**Location:** Supabase Dashboard → Settings → General → Reference ID
- This is a short alphanumeric string (e.g., `abcdefghijklmnop`)
- Also visible in your project URL: `https://[PROJECT_REF].supabase.co`

### 2. SERVICE_ROLE_KEY
**Location:** Supabase Dashboard → Settings → API → service_role key
- ⚠️ **WARNING:** This key has FULL database access (bypasses RLS)
- Keep it secret! Never commit it to git or expose it publicly
- It's the **service_role** key, NOT the **anon** key
- Click "Reveal" to see the full key

### 3. REGION
**Location:** Supabase Dashboard → Settings → General → Region
- Examples: `us-east-1`, `us-west-2`, `eu-west-1`, etc.
- Also visible in your connection string in Settings → Database

## Quick Connection String Method (Easier):

Instead of manually constructing the connection string, you can:

1. Go to **Settings** → **Database**
2. Scroll to **Connection string** section
3. Select **Connection pooling** tab
4. Copy the connection string (it already has everything)
5. Replace the password part with your **service_role** key

The connection string will look like:
```
postgresql://postgres.[PROJECT_REF]:[SERVICE_ROLE_KEY]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

## Example Connection Command:

Once you have all three values:

```bash
psql "postgresql://postgres.abcdefghijklmnop:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

Or use the connection string from the dashboard and just replace the password with service_role key.

