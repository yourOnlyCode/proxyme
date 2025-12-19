-- Revert 'type' column from messages table
ALTER TABLE public.messages 
DROP COLUMN IF EXISTS type;

