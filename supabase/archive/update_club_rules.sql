-- Update Club Rules Based on Validation Status
-- Unvalidated: create 1, join 3, admin unlimited
-- Validated: create 5, join 10

-- Drop existing functions and triggers
DROP TRIGGER IF EXISTS check_club_creation_limit_trigger ON public.clubs;
DROP TRIGGER IF EXISTS check_club_join_limit_trigger ON public.club_members;
DROP FUNCTION IF EXISTS public.check_club_creation_limit();
DROP FUNCTION IF EXISTS public.check_club_join_limit();

-- Function to check club creation limit
CREATE OR REPLACE FUNCTION public.check_club_creation_limit()
RETURNS TRIGGER AS $$
DECLARE
    is_verified BOOLEAN;
    current_count INTEGER;
    max_clubs INTEGER;
BEGIN
    -- Check if user is verified
    SELECT is_verified INTO is_verified
    FROM public.profiles
    WHERE id = NEW.owner_id;
    
    -- Set max clubs based on verification status
    IF is_verified THEN
        max_clubs := 5; -- Validated users can create 5 clubs
    ELSE
        max_clubs := 1; -- Unvalidated users can create 1 club
    END IF;
    
    -- Count current clubs owned by this user
    SELECT COUNT(*) INTO current_count
    FROM public.clubs
    WHERE owner_id = NEW.owner_id;
    
    -- Check if limit exceeded
    IF current_count >= max_clubs THEN
        RAISE EXCEPTION 'Club creation limit exceeded. % users can create up to % clubs',
            CASE WHEN is_verified THEN 'Verified' ELSE 'Unverified' END,
            max_clubs;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check club join limit
CREATE OR REPLACE FUNCTION public.check_club_join_limit()
RETURNS TRIGGER AS $$
DECLARE
    is_verified BOOLEAN;
    current_count INTEGER;
    max_joins INTEGER;
BEGIN
    -- Only check on accepted status
    IF NEW.status != 'accepted' THEN
        RETURN NEW;
    END IF;
    
    -- Check if user is verified
    SELECT is_verified INTO is_verified
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Set max joins based on verification status
    IF is_verified THEN
        max_joins := 10; -- Validated users can join 10 clubs
    ELSE
        max_joins := 3; -- Unvalidated users can join 3 clubs
    END IF;
    
    -- Count current accepted memberships (excluding admin/owner roles from other clubs)
    SELECT COUNT(*) INTO current_count
    FROM public.club_members
    WHERE user_id = NEW.user_id
    AND status = 'accepted';
    
    -- Check if limit exceeded
    IF current_count > max_joins THEN
        RAISE EXCEPTION 'Club join limit exceeded. % users can join up to % clubs',
            CASE WHEN is_verified THEN 'Verified' ELSE 'Unverified' END,
            max_joins;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate triggers
CREATE TRIGGER check_club_creation_limit_trigger
    BEFORE INSERT ON public.clubs
    FOR EACH ROW
    EXECUTE FUNCTION public.check_club_creation_limit();

CREATE TRIGGER check_club_join_limit_trigger
    BEFORE INSERT OR UPDATE ON public.club_members
    FOR EACH ROW
    EXECUTE FUNCTION public.check_club_join_limit();

