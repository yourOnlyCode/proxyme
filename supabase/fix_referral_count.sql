-- Fix Referral Count Accuracy
-- Recalculates referral_count based on actual referred_by relationships

-- Function to recalculate referral_count for a specific user
CREATE OR REPLACE FUNCTION recalculate_referral_count(user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  actual_count int;
BEGIN
  -- Count how many users have this user's UUID in their referred_by column
  SELECT COUNT(*) INTO actual_count
  FROM public.profiles
  WHERE referred_by = user_id;
  
  -- Update the referral_count to match the actual count
  UPDATE public.profiles
  SET referral_count = actual_count
  WHERE id = user_id;
  
  RETURN actual_count;
END;
$$;

-- Function to recalculate all referral counts
CREATE OR REPLACE FUNCTION recalculate_all_referral_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update all referral_count values based on actual referred_by relationships
  UPDATE public.profiles p
  SET referral_count = (
    SELECT COUNT(*)
    FROM public.profiles ref
    WHERE ref.referred_by = p.id
  );
END;
$$;

-- RPC function to recalculate referral count for the current user (can be called from app)
CREATE OR REPLACE FUNCTION refresh_my_referral_count()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
  actual_count int;
BEGIN
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Count how many users have this user's UUID in their referred_by column
  SELECT COUNT(*) INTO actual_count
  FROM public.profiles
  WHERE referred_by = user_id;
  
  -- Update the referral_count to match the actual count
  UPDATE public.profiles
  SET referral_count = actual_count
  WHERE id = user_id;
  
  RETURN actual_count;
END;
$$;

-- Recalculate all referral counts immediately (one-time fix for existing data)
SELECT recalculate_all_referral_counts();

-- Update the handle_new_user trigger to ensure accuracy
-- The existing trigger already increments correctly, but we'll add a comment for clarity
COMMENT ON FUNCTION public.handle_new_user() IS 
'Creates profile for new user and processes referrals. referral_count is incremented when a user signs up with a referral code.';
