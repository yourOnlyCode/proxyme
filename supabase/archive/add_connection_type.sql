ALTER TABLE interests ADD COLUMN IF NOT EXISTS connection_type TEXT;

-- RPC to get stats
CREATE OR REPLACE FUNCTION get_user_connection_stats(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total int;
  romance int;
  friendship int;
  business int;
BEGIN
  -- Count total accepted connections
  SELECT count(*) INTO total 
  FROM interests 
  WHERE (sender_id = target_user_id OR receiver_id = target_user_id) 
  AND status = 'accepted';

  -- Count by type (assuming connection_type is stored)
  SELECT count(*) INTO romance 
  FROM interests 
  WHERE (sender_id = target_user_id OR receiver_id = target_user_id) 
  AND status = 'accepted' 
  AND connection_type = 'Romance';

  SELECT count(*) INTO friendship 
  FROM interests 
  WHERE (sender_id = target_user_id OR receiver_id = target_user_id) 
  AND status = 'accepted' 
  AND connection_type = 'Friendship';

  SELECT count(*) INTO business 
  FROM interests 
  WHERE (sender_id = target_user_id OR receiver_id = target_user_id) 
  AND status = 'accepted' 
  AND connection_type = 'Business';
  
  RETURN jsonb_build_object(
    'total', total,
    'romance', romance,
    'friendship', friendship,
    'business', business
  );
END;
$$;

