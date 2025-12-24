-- Prevent duplicate interest requests between the same two users
ALTER TABLE public.interests 
ADD CONSTRAINT unique_interest_pair UNIQUE (sender_id, receiver_id);

