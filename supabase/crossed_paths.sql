-- Crossed Paths: store people a user encountered at a specific address on a specific day.
-- Retention requirement: keep up to 7 days (app can query last 7 days; optional cleanup job later).

create table if not exists public.crossed_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  crossed_user_id uuid not null references public.profiles(id) on delete cascade,
  -- Optional redacted display label (should NOT be a full street address number).
  address_label text,
  address_key text not null,
  day_key date not null,
  seen_at timestamptz not null default now()
);

create unique index if not exists crossed_paths_unique
  on public.crossed_paths (user_id, crossed_user_id, day_key, address_key);

create index if not exists crossed_paths_user_seen_at
  on public.crossed_paths (user_id, seen_at desc);

alter table public.crossed_paths enable row level security;

drop policy if exists "Crossed paths are viewable by owner" on public.crossed_paths;
create policy "Crossed paths are viewable by owner"
  on public.crossed_paths for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own crossed paths" on public.crossed_paths;
create policy "Users can insert their own crossed paths"
  on public.crossed_paths for insert
  with check (auth.uid() = user_id);

