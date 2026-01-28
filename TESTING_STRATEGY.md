## Testing strategy (Proxyme)

This repo currently relies on Supabase + Expo Router. To avoid “blank / detached” screens in beta, you want **three layers**:

1) **Unit tests (fast, deterministic)**  
   - Pure logic in `lib/*` (verification rules, review-mode gating, share tracking, text generators, validation).

2) **Integration “smoke” tests (still Jest, but render key components/screens with mocks)**  
   - Verify screens can render and show the right empty states without crashing.
   - Verify gating UI appears when `is_verified=false`.

3) **Device-level E2E (manual + optional automation)**  
   - Real runtime behavior: permissions, push notifications, deep links, camera, location, realtime updates.
   - This is the only way to truly validate Proxy + Clubs flows end-to-end.

### What’s set up now (automated)

- **Jest + jest-expo** is configured via `jest.config.js`.
- Global test setup/mocks live in `jest.setup.ts`.
- Initial “beta smoke” tests are in `__tests__/`:
  - `verification.test.ts`
  - `reviewMode.test.ts`
  - `referral.test.ts`
  - `sharing.test.ts`

### How to run

```bash
npm test
npm run test:watch
npm run test:coverage
```

### What to do next (recommended)

- **Add integration smoke tests for critical screens**:
  - Proxy tab (`app/(tabs)/index.tsx`) renders header + empty states with mocked location/user
  - Clubs tab list + club detail renders with fixtures
  - Crossed Paths gating renders “Verification required” for unverified
- **Add a “Supabase contract” checklist** (manual):
  - Confirm required RPCs exist and RLS policies allow expected reads/writes (see `LAUNCH_CHECKLIST.md`).
- **Add E2E flows** (optional automation):
  - Use Maestro to script “sign in → proxy on → open profile → send interest”
  - Use Maestro to script “create club → create topic → reply → create event”

