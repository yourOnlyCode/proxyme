## Manual beta testing checklist (high-signal)

Use 2 accounts:
- **review@proxyme.app** (fixtures, tours, should never be visible to real users)
- **a normal test user** (real Supabase behavior + location)

### Auth + onboarding
- **Email sign-in**: create/login works, returns to app
- **OAuth sign-in**: Apple/Google works and returns to app (`auth/callback`)
- **Link provider**: Apple/Google linking works *only if Supabase manual identity linking is enabled*
- **Onboarding**:
  - DOB required, minors become friendship-only
  - Romance intent shows: gender + preference + romance age range
  - Professional intent shows: title (“what do you do?”)

### Verification + gating
- **Unverified user restrictions**:
  - Cannot post stories
  - Cannot join/create clubs
  - Cannot attend events
  - Cannot view Crossed Paths
- **Verified user**: all above unlock
- **Get Verified sheet**:
  - Close works via **X**
  - No “grabber” bar shown

### Proxy tab (real behavior)
- **Proxy OFF**:
  - Feed shows “Proxy is Off” empty state
  - No crossed-path badge increments
- **Proxy ON**:
  - Location permission prompt works
  - Feed loads (or shows “no one else is here yet”)
  - Cards open profile modal with real data (no blanks)
  - Crossed Paths icon opens screen
- **Share count**:
  - Sharing friend code increments `share_count` (best-effort)

### Crossed Paths
- **Unverified**: “Verification required” state appears + can open verification
- **Verified + Proxy ON**: shows groups/people (or empty state)
- Badge clears after viewing

### Circle tab (Inbox)
- Coach marks/tooltips show on first open for **review account** (separate storage key)
- Notifications list:
  - Tap navigates to the correct destination (club, event, requests, chat)
  - Notification read state updates

### Clubs
- **Clubs tab**:
  - “My” and “Discover” load correctly
  - Create club works (verified only)
- **Club detail**:
  - Join/request works based on privacy
  - Forum: create topic → reply → edit → delete (as allowed)
  - Events: create → edit → RSVP → attendee list
  - Invites: invite a connection, accept invite

### Review mode constraints
- review@proxyme.app:
  - Sees fixtures in Proxy/City/Crossed Paths/Circle
  - Tooltips show (review storage keys)
  - **Proxy/location is disabled** and should not publish location or become visible to real users

