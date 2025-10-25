-- ============================================================================
-- VeloReady Composite Indexes Migration
-- ============================================================================
-- This migration adds a composite index to improve query performance by 2-3x
-- for the most common query pattern: fetching activities by user and date.
--
-- Run this in your Supabase SQL Editor to apply the performance optimization.
--
-- Audit Reference: Backend Infrastructure Audit (2025-10-25)
-- Priority: HIGH
-- Estimated Impact: 2-3x query performance improvement
-- Effort: 5 minutes
--
-- Note: The audit recommended 3 indexes, but:
-- - activity_stream doesn't need one (activity_id is already the PRIMARY KEY)
-- - sync_state schema differs from audit assumptions (removed from migration)
-- ============================================================================

-- Add composite index for activity queries by user and date
-- ----------------------------------------------------------------------------
-- Benefits:
-- - 2-3x faster dashboard queries that filter by user and sort by date
-- - Improves activity list performance when showing recent activities
-- - Reduces database load for paginated activity queries
-- - Essential for multi-user performance at scale
CREATE INDEX IF NOT EXISTS idx_activity_user_date
ON public.activity(user_id, start_date DESC);

-- ============================================================================
-- Performance Verification Queries
-- ============================================================================
-- Run these queries to verify the index is being used:

-- Verify activity index usage:
-- EXPLAIN ANALYZE
-- SELECT * FROM public.activity
-- WHERE user_id = 'YOUR-UUID-HERE'
-- ORDER BY start_date DESC
-- LIMIT 20;

-- You should see "Index Scan using idx_activity_user_date" in the query plan.
-- This confirms the index is being used for optimal performance.

-- ============================================================================
-- Index Information Queries
-- ============================================================================
-- Check all indexes on activity table:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'activity'
-- ORDER BY indexname;
--
-- You should see idx_activity_user_date in the list

-- ============================================================================
-- Migration Complete!
-- ============================================================================
-- Expected Results:
-- - Dashboard load time: 2-3x faster
-- - Activity list queries: 2-3x faster
-- - Paginated activity views: Significantly improved
--
-- What was implemented:
-- - 1 composite index on activity (user_id, start_date DESC)
--
-- What was excluded (and why):
-- - activity_stream: activity_id is PRIMARY KEY (already optimally indexed)
-- - sync_state: Table schema differs from audit assumptions
--
-- Next Steps:
-- 1. Monitor query performance in Supabase dashboard
-- 2. Use EXPLAIN ANALYZE to verify index usage
-- 3. Add more indexes later if specific query patterns need optimization
-- ============================================================================
