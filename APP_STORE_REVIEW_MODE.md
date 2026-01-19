## App Store Review Mode (Proxyme)

Proxyme supports a hidden **Review Mode** that only activates for specific test login emails. This helps reviewers test core flows without needing real-world matches.

### Enable Review Mode

Set this environment variable in your Expo/EAS environment:

- `EXPO_PUBLIC_REVIEW_EMAILS`
  - Comma-separated list of test emails
  - Example: `review@proxyme.app,apple-review@proxyme.app`

Review Mode is enabled when the signed-in Supabase user email matches one of these.

### What Review Mode does (only for the test account)

- **Proxy tab**
  - Proxy toggle can be OFF initially (reviewer turns it ON)
  - When ON, the feed shows **3 deterministic nearby profiles** (no real location matching required)

- **Crossed Paths**
  - Shows deterministic place/day groups with people (no backend data needed)

- **City tab**
  - Shows deterministic profiles with statuses (including a “report this profile” prompt)
  - Shows a couple deterministic events owned by a test club

- **Circle tab**
  - Upcoming Events shows deterministic events

- **Verification**
  - Review account can post photo statuses and create clubs even if `is_verified` hasn’t propagated yet

### Create the review login (Supabase)

1. In Supabase Auth, create a user with one of the emails in `EXPO_PUBLIC_REVIEW_EMAILS`.
2. Ensure a `profiles` row exists (the app will auto-create one on first login).
3. Optional: set `profiles.is_verified = true` for that user so everything matches production behavior.

### Notes / safety

- Review Mode uses **client-side fixtures** only; it does not seed production tables.
- Nothing shows for normal users.

