-- Apply a friend code AFTER signup (onboarding flow).
-- Safe, one-time, server-side referral linking + referral_count update.

create or replace function public.apply_friend_code(p_friend_code text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid;
  referrer_id uuid;
  current_count int;
  code text;
begin
  me := auth.uid();
  if me is null then
    raise exception 'Not authenticated';
  end if;

  code := trim(coalesce(p_friend_code, ''));
  if code = '' then
    raise exception 'Friend code is required';
  end if;

  -- Disallow applying more than once.
  if exists (select 1 from public.profiles p where p.id = me and p.referred_by is not null) then
    raise exception 'Friend code already applied';
  end if;

  select p.id into referrer_id
  from public.profiles p
  where p.friend_code = code;

  if referrer_id is null then
    raise exception 'Invalid friend code';
  end if;

  if referrer_id = me then
    raise exception 'You cannot use your own friend code';
  end if;

  -- Link user to referrer.
  update public.profiles
  set referred_by = referrer_id
  where id = me;

  -- Recalculate referrer's count from truth source (referred_by links) for correctness.
  update public.profiles
  set referral_count = (
    select count(*)
    from public.profiles ref
    where ref.referred_by = referrer_id
  )
  where id = referrer_id
  returning referral_count into current_count;

  -- Unlock verification automatically at 3 referrals
  if current_count >= 3 then
    update public.profiles set is_verified = true where id = referrer_id;
  end if;

  return json_build_object(
    'referrer_id', referrer_id,
    'referral_count', current_count
  );
end;
$$;

revoke all on function public.apply_friend_code(text) from public;
grant execute on function public.apply_friend_code(text) to authenticated;

