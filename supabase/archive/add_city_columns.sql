-- Add City and State columns for location context
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT;

