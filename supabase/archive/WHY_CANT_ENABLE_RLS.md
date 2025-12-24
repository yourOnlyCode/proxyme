# Why You Can't Enable RLS (Even as Database Owner)

## The Problem Explained:

**Database Owner ≠ Table Owner**

Even though you are the **database owner**, `spatial_ref_sys` is owned by the **PostGIS extension owner**, which is typically a protected system role (like `supabase_admin` or the role that installed PostGIS).

In PostgreSQL:
- **Database owner** can create/drop databases, but...
- **Table owner** is the only one who can ALTER that specific table
- `spatial_ref_sys` is owned by PostGIS extension, NOT by you

## Why This Happens:

When PostGIS extension is installed, it creates system tables owned by the role that installed it (usually a system/admin role), not your user role.

## Your Options (Final):

### Option 1: Contact Supabase Support ⭐ RECOMMENDED
**Request:** "Please enable RLS on `public.spatial_ref_sys` table. I am the database owner but cannot modify PostGIS system tables."

They have superuser access and can do this in 30 seconds.

### Option 2: Dismiss the Warning ⭐ EASIEST
This is a **false positive**. The table:
- Is read-only reference data (EPSG codes)
- Is already secured via REVOKE (not accessible via API)
- Cannot be modified by users
- Is required for PostGIS to function

**To dismiss:** Security Advisor → Find `spatial_ref_sys` warning → Click **Dismiss**

### Option 3: Exclude from API (If Available)
Go to Settings → API → Excluded Tables → Add `spatial_ref_sys`

## Bottom Line:

**You ARE the database owner, but you are NOT the table owner.** This is a PostgreSQL security feature, not a bug. The Security Advisor warning is a false positive for PostGIS system tables.

**Recommended Action:** Dismiss the warning. The table is effectively secured.

