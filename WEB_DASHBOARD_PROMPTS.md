# Proxyme Web Dashboard (Next.js) — Prompt Playbook

This repo currently ships a lightweight static `web-landing/` page for email verification + deep linking.

We plan to add a **separate Next.js web dashboard** in the future for:
- Club & event management dashboards
- Contact page
- Privacy policy page
- (Optional) admin moderation/support tools

**Decision log**
- **Dashboard domain**: `dashboard.proxyme.app`
- **Public landing**: keep `www.proxyme.app` serving the existing `web-landing/` experience for now
- **Timing**: *do not build yet*—only scaffold when the mobile app is complete/stable
- **Approach**: start simple (two apps in one repo), evolve to a real monorepo later if needed

---

## When you're ready: key constraints to tell the agent

Copy/paste this block when starting the dashboard work:

```text
We want to add a Next.js dashboard app to this repo, but keep the existing `web-landing/` static page as-is.
Target production domain: dashboard.proxyme.app (separate deploy from www.proxyme.app).
Do NOT refactor the Expo app into a monorepo yet unless absolutely necessary.
Keep npm + package-lock (no pnpm/yarn migration right now).
Use Supabase (same project) for auth + data, with strict RBAC and RLS.
```

---

## Prompt 1 — Scaffold Next.js dashboard (in-repo, separate app)

```text
Create a new Next.js app inside this repo at `apps/web-dashboard/` (or `web-dashboard/` if you strongly prefer),
with TypeScript, ESLint, and App Router. Keep it isolated with its own package.json.

Add a minimal home page and a login page. Do not touch `web-landing/`.

Also add a short README in the new app explaining local dev + environment variables.
```

---

## Prompt 2 — Domain + deploy plan (dashboard.proxyme.app)

```text
Set up deployment guidance for the Next.js dashboard at dashboard.proxyme.app (separate from www.proxyme.app).
I want a clear checklist for Vercel: project settings, env vars, custom domain, redirects if needed.
Do not change existing Vercel config for the landing unless required; propose minimal changes.
```

---

## Prompt 3 — Supabase Auth for dashboard (safe, production-ready)

```text
Implement Supabase Auth in the Next.js dashboard:
- Email/password login (magic link optional)
- Session handling on server (middleware) + client
- Protected routes under /app/*
- Logout

Use environment variables for Supabase URL + anon key. Do not hardcode secrets.
```

---

## Prompt 4 — RBAC model (admins/owners) and RLS compatibility

```text
Design a role model for the dashboard:
- Admin users can manage clubs/events globally
- Club owners/admins can manage their own clubs/events
- Regular users should not access the dashboard

Propose the minimal DB changes needed (e.g., profiles.role enum or claims) and the RLS policies.
Then implement the dashboard-side checks to enforce this.
```

---

## Prompt 5 — Dashboard pages (clubs/events management)

```text
Add dashboard pages:
- Clubs list + club detail edit (name, description, join_policy, club interests, image)
- Events list per club + event create/edit (title, date, location, is_public, image)

Prefer efficient queries (avoid N+1) and show loading states without flashing blank.
```

---

## Prompt 6 — Legal + Contact (web dashboard + public site alignment)

```text
Add Privacy Policy + Contact pages in the Next.js dashboard (or a public `/legal` area if you think it's better).
Keep copy as placeholder text with TODO markers for final content.
Also ensure the app can link to these pages from Settings.
```

---

## Prompt 7 — Shared types (optional later)

```text
Only if needed: propose a gradual path to share types/constants between Expo app and Next dashboard.
Do not migrate to a full monorepo unless it clearly saves time long-term.
```

---

## Notes / preferences
- Prefer “stale-while-revalidate” UI patterns (show last data immediately, refresh in background).
- Keep security strict: RLS-first mindset, least-privilege, no service role keys in client code.
- Keep build/deploy separation: mobile ≠ dashboard ≠ landing.

