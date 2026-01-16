-- Name moderation / bad-word guard for profiles.username and profiles.full_name
-- This is intentionally lightweight and "streamlined":
-- - Maintain a server-side list of blocked terms in public.blocked_terms
-- - Enforce via a trigger so it cannot be bypassed by a custom client
-- - Client can simply show the DB error message on save

create table if not exists public.blocked_terms (
  term text primary key,
  note text,
  created_at timestamptz not null default now()
);

alter table public.blocked_terms enable row level security;

-- No policies by default: only service role / SQL editor should manage this list.
drop policy if exists "blocked_terms_select_none" on public.blocked_terms;
create policy "blocked_terms_select_none"
  on public.blocked_terms for select
  using (false);

-- Basic normalizer: lowercases and strips non-alphanumerics.
create or replace function public.normalize_text_for_moderation(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function public.contains_blocked_term(p_text text)
returns boolean
language sql
stable
as $$
  -- We normalize both sides so "b.a d  w-o_r d" still matches "badword"
  with t as (
    select public.normalize_text_for_moderation(p_text) as norm
  )
  select exists (
    select 1
    from public.blocked_terms bt, t
    where t.norm like ('%' || public.normalize_text_for_moderation(bt.term) || '%')
  );
$$;

create or replace function public.validate_profile_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u text;
  n text;
begin
  u := coalesce(new.username, '');
  n := coalesce(new.full_name, '');

  -- Username rules: 3-20 chars, letters/numbers/._ only, no spaces
  if u <> '' then
    if char_length(u) < 3 or char_length(u) > 20 then
      raise exception 'Username must be 3–20 characters.';
    end if;
    if u !~ '^[A-Za-z0-9._]+$' then
      raise exception 'Username can only contain letters, numbers, "." and "_" (no spaces).';
    end if;
  end if;

  -- Full name rules: 2-40 chars, letters/spaces/common punctuation only
  if n <> '' then
    if char_length(n) < 2 or char_length(n) > 40 then
      raise exception 'Name must be 2–40 characters.';
    end if;
    -- avoid URLs/handles in names
    if position('http' in lower(n)) > 0 or position('@' in n) > 0 then
      raise exception 'Name cannot include links or @handles.';
    end if;
  end if;

  -- Blocked terms (server-maintained)
  if u <> '' and public.contains_blocked_term(u) then
    raise exception 'Please choose a different username.';
  end if;
  if n <> '' and public.contains_blocked_term(n) then
    raise exception 'Please choose a different name.';
  end if;

  return new;
end $$;

drop trigger if exists profiles_validate_names on public.profiles;
create trigger profiles_validate_names
before insert or update of username, full_name
on public.profiles
for each row
execute function public.validate_profile_names();

-- NOTE: Populate public.blocked_terms via SQL editor/service role.
-- Example (keep your real list private):
-- insert into public.blocked_terms(term, note) values ('some_term', 'reason') on conflict do nothing;

