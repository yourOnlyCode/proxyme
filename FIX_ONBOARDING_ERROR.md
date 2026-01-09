# Fix: Onboarding Error After Email Verification

## Problem
After creating an account, verifying email, and logging in, users see an error:
```
ERROR  {"code": "PGRST116", "details": "The result contains 0 rows", "hint": null, "message": "Cannot coerce the result to a single JSON object"}
```

The onboarding flow doesn't populate and the app crashes.

## Root Cause
The `profiles` table was missing two required columns:
1. `is_onboarded` - tracks whether user completed onboarding
2. `social_links` - stores user's social media links

When the app tried to query these columns, the database query failed.

## Solution

### Step 1: Update Database Schema

Run the SQL script to add the missing columns:

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy and paste the contents of `supabase/add_onboarding_columns.sql`
4. Click **Run** or press `Ctrl/Cmd + Enter`

The script will:
- Add `is_onboarded` column (defaults to `false`)
- Add `social_links` column (stores JSON)
- Set existing users' onboarding status based on their profile completion
- Create an index for faster queries

### Step 2: Verify the Changes

Check that the columns were added successfully:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('is_onboarded', 'social_links');
```

You should see both columns listed.

### Step 3: Code Changes (Already Applied)

The following files have been updated to handle this issue:

1. **`supabase/master_schema.sql`**
   - Added `is_onboarded` and `social_links` columns to the schema
   - Future deployments will include these columns automatically

2. **`app/_layout.tsx`**
   - Changed from `.single()` to `.maybeSingle()` to handle missing profiles
   - Added error handling to redirect to onboarding if profile doesn't exist

3. **`app/(tabs)/explore.tsx`**
   - Changed from `.single()` to `.maybeSingle()` to prevent crashes
   - Added redirect to onboarding if profile doesn't exist

### Step 4: Test the Fix

1. **Create a new test account:**
   - Sign up with a new email
   - Verify the email
   - Log in

2. **Expected behavior:**
   - User should be redirected to `/onboarding`
   - User completes onboarding (friend code, profile, interests)
   - After completing onboarding, `is_onboarded` is set to `true`
   - User is redirected to the main app

3. **If it still fails:**
   - Check browser/app console for errors
   - Verify the SQL script ran successfully
   - Check that the columns exist in the `profiles` table

## How Onboarding Flow Works

1. **User signs up** → `handle_new_user()` trigger creates basic profile
   - Sets: `id`, `username`, `full_name`, `avatar_url`, `friend_code`
   - `is_onboarded` defaults to `false`

2. **User verifies email** → Redirected to `https://www.proxyme.app`
   - Landing page provides deep link to open app

3. **User logs in** → `_layout.tsx` checks `is_onboarded`
   - If `false` or `null` → Redirect to `/onboarding`
   - If `true` → Allow access to `/(tabs)`

4. **User completes onboarding** → Profile is fully populated
   - Friend code applied (optional)
   - Photos uploaded
   - Intent/bio set
   - Interests selected
   - `is_onboarded` set to `true`

5. **User can access app** → Full access to all features

## Prevention

To prevent this issue in future:

1. **Always run `master_schema.sql`** when setting up a new Supabase project
2. **Test the complete user flow** from signup to onboarding to app access
3. **Use `.maybeSingle()`** instead of `.single()` for queries that might return no results
4. **Add error handling** for all database queries
5. **Set appropriate defaults** for all boolean/required columns

## Additional Notes

- The `handle_new_user()` trigger automatically creates a profile when users sign up
- The profile is minimal at first (just basic auth data)
- Onboarding flow fills in the rest (relationship_goals, detailed_interests, bio, photos)
- The `is_onboarded` flag is the gatekeeper between onboarding and main app

## Related Files

- `supabase/master_schema.sql` - Main database schema
- `supabase/add_onboarding_columns.sql` - Fix SQL script
- `app/_layout.tsx` - Auth routing logic
- `app/(tabs)/explore.tsx` - Profile display
- `app/onboarding/index.tsx` - Onboarding flow
