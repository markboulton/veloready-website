-- ============================================================================
-- VeloReady Supabase RLS Migration
-- ============================================================================
-- This migration enables Row Level Security on all tables and creates
-- policies to ensure users can only access their own data.
--
-- Run this in your Supabase SQL Editor after deploying the updated backend.
-- ============================================================================

-- Step 1: Add user_id columns to all tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.athlete 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.activity 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.sync_state 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.audit_log 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create index on user_id for better query performance
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_athlete_user_id ON public.athlete(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_id ON public.activity(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_user_id ON public.sync_state(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);

-- Step 3: Enable Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.athlete ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies (if any) to avoid conflicts
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own athlete data" ON public.athlete;
DROP POLICY IF EXISTS "Users can update own athlete data" ON public.athlete;
DROP POLICY IF EXISTS "Users can insert own athlete data" ON public.athlete;
DROP POLICY IF EXISTS "Users can delete own athlete data" ON public.athlete;

DROP POLICY IF EXISTS "Users can view own activities" ON public.activity;
DROP POLICY IF EXISTS "Users can insert own activities" ON public.activity;
DROP POLICY IF EXISTS "Users can update own activities" ON public.activity;
DROP POLICY IF EXISTS "Users can delete own activities" ON public.activity;

DROP POLICY IF EXISTS "Users can view own activity streams" ON public.activity_stream;
DROP POLICY IF EXISTS "Users can insert own activity streams" ON public.activity_stream;
DROP POLICY IF EXISTS "Users can update own activity streams" ON public.activity_stream;
DROP POLICY IF EXISTS "Users can delete own activity streams" ON public.activity_stream;

DROP POLICY IF EXISTS "Users can view own sync state" ON public.sync_state;
DROP POLICY IF EXISTS "Users can insert own sync state" ON public.sync_state;
DROP POLICY IF EXISTS "Users can update own sync state" ON public.sync_state;
DROP POLICY IF EXISTS "Users can delete own sync state" ON public.sync_state;

DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;

-- Step 5: Create RLS Policies
-- ----------------------------------------------------------------------------

-- Athlete table policies
CREATE POLICY "Users can view own athlete data"
  ON public.athlete FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own athlete data"
  ON public.athlete FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own athlete data"
  ON public.athlete FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own athlete data"
  ON public.athlete FOR DELETE
  USING (auth.uid() = user_id);

-- Activity table policies
CREATE POLICY "Users can view own activities"
  ON public.activity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activities"
  ON public.activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activities"
  ON public.activity FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own activities"
  ON public.activity FOR DELETE
  USING (auth.uid() = user_id);

-- Activity stream policies (joins through activity table)
CREATE POLICY "Users can view own activity streams"
  ON public.activity_stream FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.activity
      WHERE activity.id = activity_stream.activity_id
      AND activity.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own activity streams"
  ON public.activity_stream FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.activity
      WHERE activity.id = activity_stream.activity_id
      AND activity.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own activity streams"
  ON public.activity_stream FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.activity
      WHERE activity.id = activity_stream.activity_id
      AND activity.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own activity streams"
  ON public.activity_stream FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.activity
      WHERE activity.id = activity_stream.activity_id
      AND activity.user_id = auth.uid()
    )
  );

-- Sync state policies
CREATE POLICY "Users can view own sync state"
  ON public.sync_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync state"
  ON public.sync_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync state"
  ON public.sync_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync state"
  ON public.sync_state FOR DELETE
  USING (auth.uid() = user_id);

-- Audit log policies (read-only for users, write allowed for authenticated users)
CREATE POLICY "Users can view own audit logs"
  ON public.audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit logs"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Migration Complete!
-- ============================================================================
-- Next steps:
-- 1. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your Netlify env vars
-- 2. Deploy the updated backend
-- 3. Test OAuth flow - new users will automatically get user_id populated
-- 4. Existing data without user_id will be inaccessible (delete or manually link)
-- ============================================================================
