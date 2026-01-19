## Launch checklist (Proxyme)

This is the “ship it” list to get the app crisp, safe, and store-ready.

### App Store / Play Store submission
- **App metadata**: name, subtitle, description, keywords, categories, support email.
- **Screenshots**: phone screenshots for required device sizes (iOS/Android), plus feature highlights.
- **App preview / promo** (optional): short video.
- **Review notes**: provide a test account (adult + minor if applicable) and steps to reproduce key flows.
- **Links**: Privacy Policy URL, Terms URL (recommended), Support URL.
- **Age rating**: confirm 18+ with restricted 13–17 experience; configure store age rating questionnaire accordingly.
- **Build config**: `app.json` versioning (`version`, `ios.buildNumber`, `android.versionCode`), icons/splash, permissions strings.

### Backend finalization (Supabase)
- **Apply migrations/scripts in order** (idempotent is best):
  - `supabase/master_schema.sql`
  - `supabase/crossed_path_visits.sql`
  - `supabase/name_moderation.sql`
  - `supabase/storage_avatars.sql` (required for avatar uploads + public reads)
  - Optional (recommended if you have legacy rows): `supabase/cleanup_notifications_types.sql` then validate the constraint
- **Verify RPCs exist and run**:
  - `get_city_users`, `get_feed_users`, `get_nearby_users`
  - `get_my_crossed_paths_groups`, `get_crossed_paths_people`
  - `get_my_crossed_paths_badge_count`, `get_my_crossed_paths_badge_status`
  - `get_user_connections_list`, `get_user_connection_stats`
- **RLS sanity**: profiles, interests, notifications, messages, crossed_path_visits.
- **Storage policies**: avatars bucket read/write rules, public URL handling.
  - Ensure bucket `avatars` exists and is `public=true` (the app uses `getPublicUrl`).
- **Seed data**:
  - `blocked_terms` table: seed a first pass list (and keep it editable).
- **Retention**:
  - Crossed paths: decide cleanup (scheduled job) vs query-only retention.

### Safety & compliance readiness
- **Age gating**:
  - DOB required in onboarding
  - 13–17 accounts are friendship-only
  - Strict segmentation (13–17 never see 18+, and vice-versa) enforced server-side
- **Reporting**:
  - Report reasons + optional details
  - Underage reports should be triaged quickly (manual or automated workflow)
- **Blocking**:
  - Block hides immediately + prevents future visibility

### Release hardening
- **Error boundary**: show a safe fallback instead of crashing on unexpected errors.
- **Crash reporting** (recommended): wire Sentry (or similar) before launch.
  - Set `EXPO_PUBLIC_SENTRY_DSN` in your app environment to enable Sentry.
- **Analytics** (minimal, recommended):
  - sign-in success
  - onboarding completed
  - status posted
  - report submitted
  - crossed-paths viewed
- **Rate limiting / abuse**:
  - basic throttles on reporting and connection requests

### QA (must-pass)
- **Auth**: email sign-in, Apple sign-in, deep link callback.
- **Onboarding**: DOB gate, minors path, adult romance path.
- **Proxy**: toggle on/off, feed loads, crossed-paths history opens, badge clears after view.
- **Circle**: stories rail, notifications read clears badge, messages list works.
- **Profile modal**: swipe-down-to-close, report menu works.
- **Offline / poor network**: graceful errors + retry.

### App Store “Review Mode” (optional)

To make App Review painless, the app supports a hidden **Review Mode** that only activates for specific test login emails.

- **Enable**: set `EXPO_PUBLIC_REVIEW_EMAILS` to a comma-separated list of reviewer/test emails.
  - Example: `EXPO_PUBLIC_REVIEW_EMAILS=review@proxyme.app`
- **Behavior (only for those accounts)**:
  - **Proxy tab**: starts with Proxy toggle OFF; once turned ON, shows 3 deterministic nearby profiles (no real-world matching required).
  - **Crossed Paths**: shows deterministic place/day groups with people.
  - **City tab**: shows deterministic statuses + a couple events (includes a “report this profile” prompt status).
  - **Circle tab**: Upcoming Events shows deterministic events.
  - **Verification gates**: review account can post photo statuses and create clubs even if verification hasn’t propagated yet.

**Note**: Review Mode does not seed production data. It is client-side fixtures and only renders for the configured reviewer login(s).
