-- Fix missing columns for Profiles table
-- Run this script in the Supabase SQL Editor

-- 1. Ensure detailed_interests exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'detailed_interests') THEN
        ALTER TABLE public.profiles ADD COLUMN detailed_interests jsonb DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Ensure relationship_goals exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'relationship_goals') THEN
        ALTER TABLE public.profiles ADD COLUMN relationship_goals text[] DEFAULT '{}'::text[];
    END IF;
END $$;

-- 3. Re-apply the function update to be safe
CREATE OR REPLACE FUNCTION public.get_feed_users(
  lat float,
  long float,
  range_meters int default 20000
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  bio text,
  avatar_url text,
  relationship_goals text[],
  detailed_interests jsonb,
  photos jsonb,
  dist_meters float,
  shared_interests_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  my_details jsonb;
BEGIN
  -- Get current user's detailed interests
  SELECT detailed_interests INTO my_details FROM public.profiles WHERE id = auth.uid();

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.full_name,
    p.bio,
    p.avatar_url,
    p.relationship_goals,
    p.detailed_interests,
    (
        SELECT jsonb_agg(jsonb_build_object('url', pp.image_url, 'order', pp.display_order) ORDER BY pp.display_order)
        FROM public.profile_photos pp
        WHERE pp.user_id = p.id
    ) as photos,
    st_distance(
      p.location,
      st_point(long, lat)::geography
    ) as dist_meters,
    (
      -- Calculate match score
      SELECT COALESCE(SUM(
        CASE 
          WHEN (my_details ? key) THEN 
            1 + -- Category Match (+1)
            (
              -- Count Sub-Interest Matches (+5 each)
              SELECT count(*) * 5
              FROM jsonb_array_elements_text(p.detailed_interests -> key) val1
              JOIN jsonb_array_elements_text(my_details -> key) val2 ON lower(trim(val1)) = lower(trim(val2))
            )
          ELSE 0
        END
      ), 0)::int
      FROM jsonb_object_keys(p.detailed_interests) as key
    ) as shared_interests_count
  FROM
    public.profiles p
  WHERE
    p.is_proxy_active = true
    AND p.id <> auth.uid()
    AND st_dwithin(
      p.location,
      st_point(long, lat)::geography,
      range_meters
    )
  ORDER BY
    shared_interests_count DESC,
    dist_meters ASC;
END;
$$;

