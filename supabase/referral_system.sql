-- Referral System & City Growth Features

-- 1. Add referral columns to profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_code') THEN
        ALTER TABLE public.profiles ADD COLUMN referral_code text UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_count') THEN
        ALTER TABLE public.profiles ADD COLUMN referral_count int DEFAULT 0;
    END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referred_by') THEN
        ALTER TABLE public.profiles ADD COLUMN referred_by uuid REFERENCES public.profiles(id);
    END IF;
END $$;

-- 2. Function to generate random 6-digit code
CREATE OR REPLACE FUNCTION generate_unique_referral_code()
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
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = new_code) INTO exists_code;
        
        EXIT WHEN NOT exists_code;
    END LOOP;
    RETURN new_code;
END;
$$;

-- 3. Trigger to assign referral code to new users (backup for direct inserts)
CREATE OR REPLACE FUNCTION handle_user_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := generate_unique_referral_code();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_referral_code ON public.profiles;
CREATE TRIGGER ensure_referral_code
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_user_referral_code();

-- 4. Backfill existing users
UPDATE public.profiles SET referral_code = generate_unique_referral_code() WHERE referral_code IS NULL;

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
  -- Get referral code from metadata (safely)
  BEGIN
    ref_code := new.raw_user_meta_data->>'referral_code';
  EXCEPTION WHEN OTHERS THEN
    ref_code := NULL;
  END;
  
  -- Insert profile with generated code for themselves
  INSERT INTO public.profiles (id, username, full_name, avatar_url, referral_code)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'username', 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    generate_unique_referral_code()
  );

  -- Process referral if code exists
  IF ref_code IS NOT NULL AND ref_code <> '' THEN
      SELECT id INTO referrer_id FROM public.profiles WHERE referral_code = ref_code;
      
      IF referrer_id IS NOT NULL THEN
          -- Link user
          UPDATE public.profiles SET referred_by = referrer_id WHERE id = new.id;
          
          -- Increment count
          UPDATE public.profiles 
          SET referral_count = referral_count + 1 
          WHERE id = referrer_id
          RETURNING referral_count INTO current_count;
          
          -- Unlock verification automatically at 10 referrals
          IF current_count >= 10 THEN
              UPDATE public.profiles SET is_verified = TRUE WHERE id = referrer_id;
          END IF;
      END IF;
  END IF;

  RETURN new;
END;
$$;

