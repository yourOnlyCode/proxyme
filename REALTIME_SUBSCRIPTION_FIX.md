# Realtime Subscription Leak Fix

## The Problem

The query `realtime.list_changes` was running **400,000+ times** even with only one user. This query is part of Supabase Realtime's internal system that polls the Write-Ahead Log (WAL) to deliver real-time updates to subscribed clients.

## Root Cause

**Subscription leaks** - Realtime subscriptions were being created but not properly cleaned up, causing them to accumulate. Each subscription continuously polls the WAL, so multiple subscriptions = massive query count.

## Issues Found

### 1. **`app/clubs/[id].tsx`** - Multiple Issues:
   - ❌ **Line 98**: `supabase.removeChannel(supabase.channel(...))` - Creates a NEW channel instead of removing the existing one
   - ❌ **`subscribeToRSVPs()`**: Returns cleanup function but it's never called/stored
   - ❌ **`subscribeToForum()`**: Returns cleanup function but it's never called/stored
   - ❌ Subscriptions created in `fetchMembership()` but cleanup functions not stored

### 2. **Other Files** (Already Fixed):
   - ✅ `app/chat/[id].tsx` - Properly cleans up with `removeChannel`
   - ✅ `app/inbox.tsx` - Properly cleans up
   - ✅ `app/(tabs)/_layout.tsx` - Properly cleans up
   - ✅ `app/(tabs)/index.tsx` - Properly cleans up

## The Fix

### Changes Made:

1. **Added `useRef` to store subscription references:**
   ```typescript
   const forumSubscriptionRef = useRef<any>(null);
   const rsvpSubscriptionRef = useRef<any>(null);
   ```

2. **Fixed cleanup in `useEffect`:**
   ```typescript
   return () => {
       if (forumSubscriptionRef.current) {
           supabase.removeChannel(forumSubscriptionRef.current);
           forumSubscriptionRef.current = null;
       }
       if (rsvpSubscriptionRef.current) {
           supabase.removeChannel(rsvpSubscriptionRef.current);
           rsvpSubscriptionRef.current = null;
       }
   };
   ```

3. **Fixed `subscribeToRSVPs()` to store reference:**
   ```typescript
   const subscribeToRSVPs = () => {
       // Clean up existing subscription if any
       if (rsvpSubscriptionRef.current) {
           supabase.removeChannel(rsvpSubscriptionRef.current);
       }
       
       const sub = supabase.channel(...).subscribe();
       rsvpSubscriptionRef.current = sub; // Store reference
   };
   ```

4. **Fixed `subscribeToForum()` to store reference:**
   ```typescript
   const subscribeToForum = () => {
       // Clean up existing subscription if any
       if (forumSubscriptionRef.current) {
           supabase.removeChannel(forumSubscriptionRef.current);
       }
       
       const sub = supabase.channel(...).subscribe();
       forumSubscriptionRef.current = sub; // Store reference
   };
   ```

## Expected Result

After this fix:
- ✅ Subscriptions are properly cleaned up when component unmounts
- ✅ No subscription leaks
- ✅ Query count should drop dramatically (from 400k+ to normal levels)
- ✅ Better performance and lower database load

## Monitoring

Check Supabase Dashboard → Database → Query Performance:
- The `realtime.list_changes` query should now run at a normal rate
- Should only run when there are active realtime subscriptions
- Should stop when subscriptions are cleaned up

## Best Practices

1. **Always store subscription references** using `useRef`
2. **Always clean up** in `useEffect` return function
3. **Clean up existing subscriptions** before creating new ones
4. **Use unique channel names** to avoid conflicts

