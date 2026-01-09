-- Add missing columns to profiles table for onboarding and social links
-- Run this SQL in your Supabase SQL Editor

-- Add is_onboarded column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT false;

-- Add social_links column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS social_links JSONB;

-- Set is_onboarded to false for all existing users who haven't completed onboarding
-- (Users with relationship_goals set are considered onboarded)
UPDATE public.profiles 
SET is_onboarded = false 
WHERE is_onboarded IS NULL 
  AND (relationship_goals IS NULL OR array_length(relationship_goals, 1) = 0);

-- Set is_onboarded to true for existing users who have completed their profile
UPDATE public.profiles 
SET is_onboarded = true 
WHERE is_onboarded IS NULL 
  AND relationship_goals IS NOT NULL 
  AND array_length(relationship_goals, 1) > 0;

-- Create index for faster queries on is_onboarded
CREATE INDEX IF NOT EXISTS idx_profiles_is_onboarded ON public.profiles(is_onboarded);

COMMENT ON COLUMN public.profiles.is_onboarded IS 'Indicates whether the user has completed the onboarding process';
COMMENT ON COLUMN public.profiles.social_links IS 'JSON object containing social media links (instagram, tiktok, facebook, linkedin, x)';
