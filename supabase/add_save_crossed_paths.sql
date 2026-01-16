-- User setting: allow disabling Crossed Paths logging entirely.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'save_crossed_paths'
  ) then
    alter table public.profiles
      add column save_crossed_paths boolean not null default true;
  end if;
end $$;

