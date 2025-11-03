-- =====================================================
-- VeloReady Subscription System Migration
-- =====================================================
-- Created: 2025-11-03
-- Purpose: Add subscription tier enforcement and tracking
-- Dependencies: Requires auth.users table (Supabase Auth)
-- =====================================================

-- =====================================================
-- 1. CREATE USER SUBSCRIPTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_subscriptions (
  -- Primary key and foreign key to auth.users
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Link to Strava athlete
  athlete_id INTEGER NOT NULL,
  
  -- Subscription details
  subscription_tier TEXT NOT NULL 
    CHECK (subscription_tier IN ('free', 'pro', 'trial')),
  subscription_status TEXT NOT NULL 
    CHECK (subscription_status IN ('active', 'expired', 'cancelled')),
  
  -- Expiration tracking
  expires_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  
  -- Apple transaction tracking
  transaction_id TEXT,
  product_id TEXT,
  purchase_date TIMESTAMPTZ,
  cancellation_date TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Fast lookup by athlete_id (backend uses this)
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_athlete 
  ON user_subscriptions(athlete_id);

-- Fast lookup for expired subscriptions (cleanup job)
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires 
  ON user_subscriptions(expires_at) 
  WHERE expires_at IS NOT NULL;

-- Fast lookup for trial expirations
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_trial 
  ON user_subscriptions(trial_ends_at) 
  WHERE trial_ends_at IS NOT NULL;

-- Fast lookup by status (reporting)
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status 
  ON user_subscriptions(subscription_status);

-- =====================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "users_read_own_subscription"
  ON user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own subscription (iOS app syncs)
CREATE POLICY "users_update_own_subscription"
  ON user_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can insert their own subscription (first purchase)
CREATE POLICY "users_insert_own_subscription"
  ON user_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can do anything (backend needs this)
CREATE POLICY "service_role_all_access"
  ON user_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- 4. CREATE TRIGGER FOR UPDATED_AT
-- =====================================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to user_subscriptions
DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. SEED DATA: DEFAULT ALL USERS TO FREE
-- =====================================================

-- Insert free tier for all existing users
INSERT INTO user_subscriptions (user_id, athlete_id, subscription_tier, subscription_status)
SELECT 
  id,
  COALESCE((raw_user_meta_data->>'athlete_id')::INTEGER, 0),
  'free',
  'active'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_subscriptions)
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- 6. CREATE VIEW FOR EASY QUERYING
-- =====================================================

CREATE OR REPLACE VIEW user_subscriptions_with_status AS
SELECT 
  us.*,
  au.email,
  CASE 
    WHEN us.expires_at IS NOT NULL AND us.expires_at < NOW() THEN 'expired'
    WHEN us.trial_ends_at IS NOT NULL AND us.trial_ends_at < NOW() THEN 'trial_expired'
    ELSE us.subscription_status
  END as computed_status,
  CASE
    WHEN us.expires_at IS NOT NULL THEN 
      EXTRACT(EPOCH FROM (us.expires_at - NOW())) / 86400
    WHEN us.trial_ends_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (us.trial_ends_at - NOW())) / 86400
    ELSE NULL
  END as days_until_expiry
FROM user_subscriptions us
JOIN auth.users au ON us.user_id = au.id;

-- =====================================================
-- 7. CREATE FUNCTION TO CHECK SUBSCRIPTION
-- =====================================================

CREATE OR REPLACE FUNCTION check_subscription_tier(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  is_active BOOLEAN,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN us.expires_at IS NOT NULL AND us.expires_at < NOW() THEN 'free'
      WHEN us.trial_ends_at IS NOT NULL AND us.trial_ends_at < NOW() THEN 'free'
      ELSE us.subscription_tier
    END as tier,
    CASE
      WHEN us.expires_at IS NOT NULL AND us.expires_at < NOW() THEN false
      WHEN us.trial_ends_at IS NOT NULL AND us.trial_ends_at < NOW() THEN false
      ELSE true
    END as is_active,
    COALESCE(us.expires_at, us.trial_ends_at) as expires_at
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 8. CREATE CLEANUP JOB (FOR EXPIRED SUBSCRIPTIONS)
-- =====================================================

-- Function to downgrade expired subscriptions
CREATE OR REPLACE FUNCTION cleanup_expired_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Downgrade expired pro/trial subscriptions to free
  UPDATE user_subscriptions
  SET 
    subscription_tier = 'free',
    subscription_status = 'expired',
    updated_at = NOW()
  WHERE 
    subscription_tier IN ('pro', 'trial')
    AND (
      (expires_at IS NOT NULL AND expires_at < NOW())
      OR (trial_ends_at IS NOT NULL AND trial_ends_at < NOW())
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: You'll need to set up a cron job to run this periodically
-- Example: SELECT cron.schedule('cleanup-expired-subs', '0 * * * *', 'SELECT cleanup_expired_subscriptions()');
-- This requires pg_cron extension

-- =====================================================
-- 9. CREATE AUDIT LOG (OPTIONAL)
-- =====================================================

CREATE TABLE IF NOT EXISTS subscription_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL,
  old_tier TEXT,
  new_tier TEXT NOT NULL,
  change_reason TEXT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user history
CREATE INDEX IF NOT EXISTS idx_subscription_audit_user 
  ON subscription_audit_log(user_id, created_at DESC);

-- Trigger to log subscription changes
CREATE OR REPLACE FUNCTION log_subscription_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.subscription_tier != NEW.subscription_tier) THEN
    INSERT INTO subscription_audit_log (
      user_id,
      athlete_id,
      old_tier,
      new_tier,
      change_reason,
      transaction_id
    ) VALUES (
      NEW.user_id,
      NEW.athlete_id,
      OLD.subscription_tier,
      NEW.subscription_tier,
      CASE
        WHEN NEW.subscription_tier = 'free' AND NEW.subscription_status = 'expired' THEN 'Subscription expired'
        WHEN NEW.subscription_tier = 'pro' THEN 'Upgraded to Pro'
        WHEN NEW.subscription_tier = 'trial' THEN 'Started trial'
        ELSE 'Manual change'
      END,
      NEW.transaction_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_subscription_changes ON user_subscriptions;
CREATE TRIGGER log_subscription_changes
  AFTER UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION log_subscription_change();

-- =====================================================
-- 10. GRANT PERMISSIONS
-- =====================================================

-- Allow authenticated users to read/update their own data
GRANT SELECT, UPDATE, INSERT ON user_subscriptions TO authenticated;

-- Allow service role full access (backend)
GRANT ALL ON user_subscriptions TO service_role;

-- Allow access to the view
GRANT SELECT ON user_subscriptions_with_status TO service_role;

-- Allow access to audit log
GRANT SELECT ON subscription_audit_log TO authenticated;
GRANT ALL ON subscription_audit_log TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify migration
DO $$
DECLARE
  user_count INTEGER;
  free_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  SELECT COUNT(*) INTO free_count FROM user_subscriptions WHERE subscription_tier = 'free';
  
  RAISE NOTICE '✅ Migration complete!';
  RAISE NOTICE '   Total users: %', user_count;
  RAISE NOTICE '   Free tier users: %', free_count;
  RAISE NOTICE '   Table: user_subscriptions';
  RAISE NOTICE '   Indexes: 4 created';
  RAISE NOTICE '   RLS: Enabled with 4 policies';
  RAISE NOTICE '   Triggers: 2 created';
  RAISE NOTICE '   Functions: 2 created';
  RAISE NOTICE '   Views: 1 created';
END $$;
