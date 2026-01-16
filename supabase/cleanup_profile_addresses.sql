-- Cleanup: remove previously stored exact street address fields from profiles.
-- We still keep precise matching server-side via `profiles.location` (geography point), not street strings.

update public.profiles
set street = null,
    street_number = null
where street is not null
   or street_number is not null;

