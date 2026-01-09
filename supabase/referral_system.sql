-- Referral System & City Growth Features
-- NOTE: The project standardizes on `profiles.friend_code` (NOT `referral_code`).
-- This file was originally written with `referral_code`; it has been updated to use `friend_code`
-- to avoid duplicated concepts in the codebase.

-- 1. Add referral columns to profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'friend_code') THEN
        ALTER TABLE public.profiles ADD COLUMN friend_code text UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_count') THEN
        ALTER TABLE public.profiles ADD COLUMN referral_count int DEFAULT 0;
    END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referred_by') THEN
        ALTER TABLE public.profiles ADD COLUMN referred_by uuid REFERENCES public.profiles(id);
    END IF;
END $$;

-- 2. Function to generate random 6-digit code
CREATE OR REPLACE FUNCTION public.generate_friend_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    new_code text;
    exists_code boolean;
BEGIN
    LOOP
        -- Generate 6 digit random number
        new_code := lpad(floor(random() * 1000000)::text, 6, '0');
        
        -- Check if exists
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE friend_code = new_code) INTO exists_code;
        
        EXIT WHEN NOT exists_code;
    END LOOP;
    RETURN new_code;
END;
$$;

-- 3. Trigger to assign friend_code to new users (backup for direct inserts)
CREATE OR REPLACE FUNCTION public.ensure_friend_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.friend_code IS NULL THEN
        NEW.friend_code := public.generate_friend_code();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_friend_code ON public.profiles;
DROP TRIGGER IF EXISTS ensure_friend_code_trigger ON public.profiles;
CREATE TRIGGER ensure_friend_code_trigger
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_friend_code();

-- 4. Backfill existing users
UPDATE public.profiles SET friend_code = public.generate_friend_code() WHERE friend_code IS NULL;

-- 5. RPC to get city count
CREATE OR REPLACE FUNCTION get_city_user_count(check_city text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_count int;
BEGIN
    -- Count users where city matches (case insensitive logic optional, usually exact match from standardized input)
    SELECT count(*) INTO user_count FROM public.profiles WHERE city IS NOT NULL AND city = check_city;
    RETURN user_count;
END;
$$;

-- 6. Updated handle_new_user to process referrals from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ref_code text;
  referrer_id uuid;
  current_count int;
BEGIN
  -- Get friend code from metadata (safely)
  BEGIN
    ref_code := new.raw_user_meta_data->>'friend_code';
  EXCEPTION WHEN OTHERS THEN
    ref_code := NULL;
  END;
  
  -- Insert profile with generated friend_code for themselves
  INSERT INTO public.profiles (id, username, full_name, avatar_url, friend_code)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'username', 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    public.generate_friend_code()
  );

  -- Process referral if code exists
  IF ref_code IS NOT NULL AND ref_code <> '' THEN
      SELECT id INTO referrer_id FROM public.profiles WHERE friend_code = ref_code;
      
      IF referrer_id IS NOT NULL THEN
          -- Link user
          UPDATE public.profiles SET referred_by = referrer_id WHERE id = new.id;
          
          -- Increment count
          UPDATE public.profiles 
          SET referral_count = referral_count + 1 
          WHERE id = referrer_id
          RETURNING referral_count INTO current_count;
          
          -- Unlock verification automatically at 3 referrals
          IF current_count >= 3 THEN
              UPDATE public.profiles SET is_verified = TRUE WHERE id = referrer_id;
          END IF;
      END IF;
  END IF;

  RETURN new;
END;
$$;

