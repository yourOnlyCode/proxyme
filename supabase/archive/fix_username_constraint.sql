-- Drop the restrictive constraint if it exists (assuming it was created in initial schema)
-- We will replace it with a more reasonable one or just trust the client side validation for now.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS username_length;

-- Optional: Re-add with a reasonable minimum length (e.g. 2 chars) if you want enforcement
ALTER TABLE public.profiles ADD CONSTRAINT username_length CHECK (char_length(username) >= 2);

