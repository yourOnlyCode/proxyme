-- City feed algorithm upgrades:
-- - profiles.currently_into
-- - club_events.detailed_interests (event tags)
-- - get_city_users ordering: intent match -> interest match % -> currently-into match -> distance -> recency-ish

alter table public.profiles add column if not exists currently_into text;
alter table public.club_events add column if not exists detailed_interests jsonb;

create or replace function public.flatten_interest_tags(details jsonb)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(distinct t), '{}'::text[])
  from (
    select lower(trim(val)) as t
    from jsonb_each(coalesce(details, '{}'::jsonb)) e(key, value)
    cross join lateral jsonb_array_elements_text(coalesce(e.value, '[]'::jsonb)) val
    where length(trim(val)) > 0
  ) s;
$$;

create or replace function public.interest_overlap_count(a jsonb, b jsonb)
returns int
language sql
stable
as $$
  select coalesce(count(*), 0)::int
  from unnest(public.flatten_interest_tags(a)) x
  join unnest(public.flatten_interest_tags(b)) y
    on x = y;
$$;

create or replace function public.interest_match_percent(a jsonb, b jsonb)
returns float
language sql
stable
as $$
  with
    aa as (select public.flatten_interest_tags(a) as arr),
    bb as (select public.flatten_interest_tags(b) as arr),
    overlap as (
      select coalesce(count(*), 0)::float as n
      from unnest((select arr from aa)) x
      join unnest((select arr from bb)) y on x = y
    ),
    denom as (
      select greatest(coalesce(array_length((select arr from aa), 1), 0), coalesce(array_length((select arr from bb), 1), 0))::float as d
    )
  select case
    when (select d from denom) <= 0 then 0
    else round(((((select n from overlap) / (select d from denom)) * 100.0))::numeric, 2)::float
  end;
$$;

create or replace function public.currently_into_matches(a text, b text)
returns boolean
language plpgsql
stable
as $$
declare
  na text;
  nb text;
begin
  na := lower(trim(coalesce(a, '')));
  nb := lower(trim(coalesce(b, '')));

  if na = '' or nb = '' then
    return false;
  end if;

  if na = nb then
    return true;
  end if;

  if length(na) >= 4 and nb like '%' || na || '%' then
    return true;
  end if;
  if length(nb) >= 4 and na like '%' || nb || '%' then
    return true;
  end if;

  return false;
end;
$$;

-- NOTE: get_city_users is defined in master_schema.sql; keep that as the source of truth.

