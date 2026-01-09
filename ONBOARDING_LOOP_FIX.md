# Onboarding Loop Bug Fix

## Problem
After completing onboarding, users were getting stuck in a loop where they would be redirected back to onboarding immediately, preventing access to the main app.

## Root Cause
The routing logic in `app/_layout.tsx` had a `useEffect` that was checking onboarding status on every navigation change (whenever `segments` changed). This caused:

1. **Race Condition**: When onboarding completed and navigated to `/(tabs)`, the segments changed, triggering another check before the database update fully propagated
2. **Repeated Checks**: The effect ran on every tab navigation, not just on initial load
3. **No Cache**: No mechanism to remember that onboarding was already checked for the current session

## Solution

### 1. Fixed Routing Logic (`app/_layout.tsx`)

**Changes Made**:

#### Added Session Tracking
```typescript
const hasCheckedOnboarding = useRef(false);
const lastSessionId = useRef<string | null>(null);
```
- Tracks whether we've already checked onboarding for the current session
- Prevents redundant database queries on every navigation

#### Removed `segments` from Dependency Array
**Before**: `useEffect(..., [session, loading, segments, fontsLoaded])`
**After**: `useEffect(..., [session, loading, fontsLoaded])`

- Prevents the effect from running on every navigation
- Only runs when session changes or on initial load

#### Smart Session-Based Checking
```typescript
// Only check onboarding status once per session
if (hasCheckedOnboarding.current && lastSessionId.current === currentSessionId) {
  return; // Already checked, don't redirect again
}
```

- Once checked for a session, never check again
- Resets when user signs out and signs back in
- Prevents infinite redirect loops

### 2. Enhanced Onboarding Completion (`app/onboarding/index.tsx`)

**Changes Made**:

#### Verification Step
```typescript
// Verify the update was successful by fetching it back
const { data: verifyData, error: verifyError } = await supabase
  .from('profiles')
  .select('is_onboarded')
  .eq('id', user.id)
  .single();

if (verifyError || !verifyData?.is_onboarded) {
  throw new Error('Failed to complete onboarding. Please try again.');
}
```

- Confirms the database update succeeded before navigating
- Prevents navigation if update failed
- Shows error message if something went wrong

#### Small Delay Before Navigation
```typescript
await new Promise(resolve => setTimeout(resolve, 100));
router.replace('/(tabs)');
```

- Ensures database has fully propagated the update
- Gives time for any realtime subscriptions to update
- 100ms is imperceptible to users but prevents race conditions

## How It Works Now

### First Time User Flow
1. User signs up → Creates account
2. `_layout.tsx` checks if onboarded → `is_onboarded = false`
3. Redirects to `/onboarding`
4. Sets `hasCheckedOnboarding = true` for this session
5. User completes onboarding steps
6. `completeSetup()` updates `is_onboarded = true` in database
7. Verifies the update succeeded
8. Waits 100ms for propagation
9. Navigates to `/(tabs)`
10. **Routing check does NOT run again** (already checked for this session)
11. User stays in main app ✅

### Returning User Flow
1. User signs in
2. `_layout.tsx` checks if onboarded → `is_onboarded = true`
3. Redirects to `/(tabs)`
4. Sets `hasCheckedOnboarding = true` for this session
5. User navigates between tabs
6. **Routing check does NOT run again** (not in dependency array)
7. User stays in main app ✅

### Edge Cases Handled

#### User Completes Onboarding
- ✅ Verified database update succeeds
- ✅ Small delay ensures propagation
- ✅ No re-check after navigation
- ✅ Stays in main app

#### Database Update Fails
- ✅ Error is caught and shown to user
- ✅ Navigation is prevented
- ✅ User can try again

#### User Refreshes App After Onboarding
- ✅ New session starts
- ✅ Checks `is_onboarded = true`
- ✅ Goes directly to main app

#### User Signs Out Then Signs Back In
- ✅ Session ID changes
- ✅ Resets `hasCheckedOnboarding`
- ✅ Checks onboarding status fresh

## Files Modified

1. **`app/_layout.tsx`**
   - Added refs for session tracking
   - Removed `segments` from useEffect dependencies
   - Added logic to prevent repeated checks

2. **`app/onboarding/index.tsx`**
   - Added verification query after update
   - Added small delay before navigation
   - Better error handling

## Testing Checklist

- [ ] Create new account
- [ ] Complete onboarding (all 3 steps)
- [ ] Verify you land in main app (Proxy tab)
- [ ] Navigate between tabs (Proxy → Explore → City → Clubs → Inbox)
- [ ] Verify you stay in main app (no redirect to onboarding)
- [ ] Close and reopen app
- [ ] Verify you stay in main app (no onboarding)
- [ ] Sign out
- [ ] Sign back in
- [ ] Verify you go directly to main app (no onboarding)
- [ ] Create another new account
- [ ] Complete onboarding
- [ ] Verify it works again

## Additional Benefits

### Performance Improvement
- **Fewer database queries**: Only checks once per session instead of on every navigation
- **Faster navigation**: No delay when switching tabs
- **Reduced load**: Less strain on Supabase database

### Better UX
- **Instant navigation**: No flickering or redirect delays
- **Predictable behavior**: Users always land where expected
- **Error handling**: Clear messages if something goes wrong

## Database Column Verification

Make sure the `is_onboarded` column exists in your `profiles` table:

```sql
-- Run this in Supabase SQL Editor if not already done
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_onboarded 
ON public.profiles(is_onboarded);
```

See `supabase/add_onboarding_columns.sql` for the full migration script.

## Monitoring

If issues persist, check:
1. **Database**: Verify `is_onboarded` column exists and has correct default
2. **Profile Creation**: Ensure new users get a profile row with `is_onboarded = false`
3. **Update Query**: Check Supabase logs to verify the UPDATE query succeeds
4. **RLS Policies**: Ensure users can update their own `is_onboarded` field

## Future Improvements (Optional)

- Add analytics to track onboarding completion rate
- Add loading state during the 100ms delay
- Add retry mechanism if database update fails
- Cache onboarding status in AsyncStorage for offline support
