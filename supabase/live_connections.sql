-- 1. Add privacy column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hide_connections boolean DEFAULT false;

-- 2. Update Stats RPC to use LIVE intent from profiles
CREATE OR REPLACE FUNCTION get_user_connection_stats(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total int;
  romance int;
  friendship int;
  business int;
  is_hidden boolean;
BEGIN
  -- Check privacy setting
  SELECT hide_connections INTO is_hidden FROM public.profiles WHERE id = target_user_id;

  -- Count total unique accepted connections
  SELECT count(*) INTO total 
  FROM public.interests 
  WHERE (sender_id = target_user_id OR receiver_id = target_user_id) 
  AND status = 'accepted';

  -- Count by Partner's Current Intent (Live from profiles table)
  WITH partners AS (
    SELECT 
      CASE 
        WHEN sender_id = target_user_id THEN receiver_id 
        ELSE sender_id 
      END as partner_id
    FROM public.interests
    WHERE (sender_id = target_user_id OR receiver_id = target_user_id)
    AND status = 'accepted'
  )
  SELECT 
    count(*) FILTER (WHERE p.relationship_goals @> '{"Romance"}'),
    count(*) FILTER (WHERE p.relationship_goals @> '{"Friendship"}'),
    count(*) FILTER (WHERE p.relationship_goals @> '{"Business"}')
  INTO romance, friendship, business
  FROM partners
  JOIN public.profiles p ON p.id = partners.partner_id;

  RETURN jsonb_build_object(
    'total', total,
    'romance', coalesce(romance, 0),
    'friendship', coalesce(friendship, 0),
    'business', coalesce(business, 0),
    'hidden', coalesce(is_hidden, false)
  );
END;
$$;

-- 3. List RPC for Viewing Connections (with Privacy & Filtering)
CREATE OR REPLACE FUNCTION get_user_connections_list(
  target_user_id uuid, 
  filter_intent text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  relationship_goals text[],
  bio text,
  is_verified boolean
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  is_hidden boolean;
BEGIN
  -- Check privacy
  SELECT hide_connections INTO is_hidden FROM public.profiles WHERE id = target_user_id;
  
  -- If hidden and viewer is NOT the target user, return nothing
  IF is_hidden AND auth.uid() <> target_user_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH partners AS (
    SELECT 
      CASE 
        WHEN sender_id = target_user_id THEN receiver_id 
        ELSE sender_id 
      END as partner_id
    FROM public.interests
    WHERE (sender_id = target_user_id OR receiver_id = target_user_id)
    AND status = 'accepted'
  )
  SELECT 
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.relationship_goals,
    p.bio,
    p.is_verified
  FROM partners
  JOIN public.profiles p ON p.id = partners.partner_id
  WHERE (filter_intent IS NULL OR p.relationship_goals @> ARRAY[filter_intent]::text[]);
END;
$$;
