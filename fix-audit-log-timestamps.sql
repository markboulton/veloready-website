-- ============================================================================
-- Fix audit_log Timestamps for Accurate 24h API Tracking
-- ============================================================================
-- This migration ensures the audit_log table has proper timestamps and
-- adds a cleanup policy to prevent unbounded growth.
-- ============================================================================

-- Step 1: Ensure 'at' column has a proper default timestamp
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_log 
ALTER COLUMN at SET DEFAULT NOW();

-- Step 2: Backfill NULL timestamps with NOW()
-- (audit_log doesn't have created_at, so we use NOW() for any NULL values)
-- ----------------------------------------------------------------------------
UPDATE public.audit_log 
SET at = NOW()
WHERE at IS NULL;

-- Step 3: Add NOT NULL constraint now that all rows have timestamps
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_log 
ALTER COLUMN at SET NOT NULL;

-- Step 4: Create index on 'at' for efficient 24h window queries
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_at ON public.audit_log(at DESC);

-- Step 5: Add a comment explaining the column
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.audit_log.at IS 'Timestamp when the audit event occurred. Used for 24h rolling window queries in ops dashboard.';

-- ============================================================================
-- Optional: Create a cleanup function to delete old audit logs
-- ============================================================================
-- This keeps the audit_log table from growing unbounded.
-- Adjust retention period as needed (currently 30 days).

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.audit_log 
  WHERE at < NOW() - INTERVAL '30 days';
  
  RAISE NOTICE 'Cleaned up audit logs older than 30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Run these after the migration to verify everything is working:

-- 1. Check that all rows have timestamps
-- SELECT COUNT(*) as total, COUNT(at) as with_timestamp FROM audit_log;

-- 2. Check 24h API call count (should match dashboard)
-- SELECT 
--   COUNT(*) FILTER (WHERE kind = 'api' AND note LIKE '%activities%') as activity_calls,
--   COUNT(*) FILTER (WHERE kind = 'api' AND note LIKE '%streams%') as stream_calls,
--   COUNT(*) FILTER (WHERE kind = 'api') as total_calls
-- FROM audit_log 
-- WHERE at > NOW() - INTERVAL '24 hours';

-- 3. Check oldest and newest audit log entries
-- SELECT MIN(at) as oldest, MAX(at) as newest, COUNT(*) as total FROM audit_log;
