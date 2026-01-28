-- Add club interests (detailed_interests) to clubs table.
-- Run this in the Supabase SQL Editor if your DB was created before this column existed.
-- Safe to re-run.

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS detailed_interests JSONB;

COMMENT ON COLUMN public.clubs.detailed_interests IS 'Category -> [tags] e.g. {"Coffee": ["Espresso","Latte"], "Food": ["Brunch"]} for discovery and matching';
