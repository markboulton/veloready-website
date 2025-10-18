-- ============================================================================
-- Add Intervals.icu Credentials to Athlete Table
-- ============================================================================
-- This migration adds columns to store Intervals.icu authentication data
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Add Intervals.icu credential columns
ALTER TABLE public.athlete 
ADD COLUMN IF NOT EXISTS intervals_athlete_id TEXT,
ADD COLUMN IF NOT EXISTS intervals_api_key TEXT,
ADD COLUMN IF NOT EXISTS intervals_connected_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_athlete_intervals_id ON public.athlete(intervals_athlete_id)
WHERE intervals_athlete_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.athlete.intervals_athlete_id IS 'Intervals.icu athlete ID (e.g., i12345)';
COMMENT ON COLUMN public.athlete.intervals_api_key IS 'Intervals.icu API key for authentication';
COMMENT ON COLUMN public.athlete.intervals_connected_at IS 'Timestamp when Intervals.icu was connected';

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the migration:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'athlete' 
-- AND column_name LIKE 'intervals%';
