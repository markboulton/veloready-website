# Audit Log 24-Hour Window Fix

## Problem

The ops dashboard shows **35 API calls** with "24h" label, but this number appears to be accumulating over more than 24 hours.

## Root Cause

The `audit_log` table has two issues:

### 1. Missing Default Timestamp
The `at` column likely doesn't have a `DEFAULT NOW()` constraint. When audit log entries are inserted without explicitly setting `at`, they may get:
- NULL values
- Very old timestamps
- Incorrect timestamps

**Evidence:**
```typescript
// webhooks-strava.ts line 30
await c.query(
  `insert into audit_log(kind, ref_id, note, athlete_id, user_id) values ($1,$2,$3,$4,$5)`,
  ['webhook', String(body.owner_id), `...`, body.owner_id, userId]
);
// ❌ Notice: 'at' column is NOT specified in the INSERT
```

### 2. No Cleanup Policy
The `audit_log` table has no automatic cleanup, so old records accumulate indefinitely. This causes:
- Unbounded table growth
- Slower queries over time
- Inaccurate "24h" metrics if old records have incorrect timestamps

## The Fix

### 1. Backend Query Fix (Immediate)
**File:** `netlify/functions/ops-api-stats.ts`

Changed the query to handle NULL timestamps gracefully:
```typescript
// BEFORE
where at > now() - interval '24 hours'

// AFTER  
where COALESCE(at, created_at, NOW()) > NOW() - interval '24 hours'
```

This ensures:
- If `at` is NULL, fall back to `created_at`
- If both are NULL, use `NOW()` (excludes the record from 24h window)
- Proper 24-hour rolling window calculation

### 2. Database Schema Fix (Run in Supabase)
**File:** `fix-audit-log-timestamps.sql`

Run this SQL migration in your Supabase SQL Editor:

```sql
-- 1. Add default timestamp
ALTER TABLE public.audit_log 
ALTER COLUMN at SET DEFAULT NOW();

-- 2. Backfill NULL timestamps
UPDATE public.audit_log 
SET at = COALESCE(created_at, NOW())
WHERE at IS NULL;

-- 3. Add NOT NULL constraint
ALTER TABLE public.audit_log 
ALTER COLUMN at SET NOT NULL;

-- 4. Add index for performance
CREATE INDEX IF NOT EXISTS idx_audit_log_at ON public.audit_log(at DESC);
```

### 3. Automatic Cleanup (Scheduled Function)
**File:** `netlify/functions-scheduled/cleanup-audit-logs.ts`

Created a scheduled function that runs daily at 4am UTC to delete audit logs older than 30 days:

```typescript
schedule("0 4 * * *", async () => {
  await c.query(
    `DELETE FROM audit_log 
     WHERE at < NOW() - INTERVAL '30 days'`
  );
});
```

## Deployment Steps

### Step 1: Deploy Backend Fix (Immediate)
```bash
cd /Users/markboulton/Dev/veloready-website
git add netlify/functions/ops-api-stats.ts
git commit -m "Fix: Ensure audit_log 24h window handles NULL timestamps"
git push origin main
```

This will automatically deploy via Netlify.

### Step 2: Run Database Migration
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `fix-audit-log-timestamps.sql`
3. Run the migration
4. Verify with the verification queries at the bottom of the file

### Step 3: Deploy Cleanup Function
```bash
git add netlify/functions-scheduled/cleanup-audit-logs.ts
git commit -m "Add: Scheduled cleanup for old audit logs (30d retention)"
git push origin main
```

### Step 4: Verify
1. Wait 5-10 minutes for deployment
2. Refresh the ops dashboard
3. The "24h" API call count should now accurately reflect the last 24 hours
4. Check Netlify Functions logs to see the cleanup function schedule

## Verification Queries

Run these in Supabase SQL Editor to verify the fix:

```sql
-- 1. Check that all rows have timestamps
SELECT COUNT(*) as total, COUNT(at) as with_timestamp 
FROM audit_log;
-- Expected: total = with_timestamp

-- 2. Check 24h API call count (should match dashboard)
SELECT 
  COUNT(*) FILTER (WHERE kind = 'api' AND note LIKE '%activities%') as activity_calls,
  COUNT(*) FILTER (WHERE kind = 'api' AND note LIKE '%streams%') as stream_calls,
  COUNT(*) FILTER (WHERE kind = 'api') as total_calls
FROM audit_log 
WHERE at > NOW() - INTERVAL '24 hours';

-- 3. Check oldest and newest audit log entries
SELECT 
  MIN(at) as oldest, 
  MAX(at) as newest, 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE at > NOW() - INTERVAL '24 hours') as last_24h
FROM audit_log;

-- 4. Check distribution by day
SELECT 
  DATE(at) as day,
  COUNT(*) as events,
  COUNT(*) FILTER (WHERE kind = 'api') as api_calls
FROM audit_log
WHERE at > NOW() - INTERVAL '7 days'
GROUP BY DATE(at)
ORDER BY day DESC;
```

## Expected Results

**Before Fix:**
- Dashboard shows: 35 API calls (24h)
- Actual: Accumulating over multiple days due to NULL/incorrect timestamps

**After Fix:**
- Dashboard shows: Accurate 24-hour rolling window
- Example: 5-15 API calls (24h) depending on actual usage
- Old records (>30 days) automatically cleaned up daily

## Impact

✅ **Accurate Metrics:** Dashboard now shows true 24-hour API usage  
✅ **Performance:** Index on `at` column speeds up dashboard queries  
✅ **Maintenance:** Automatic cleanup prevents unbounded table growth  
✅ **Compliance:** Better tracking for Strava API rate limit monitoring  

## Monitoring

After deployment, monitor:
1. **Dashboard Accuracy:** API call count should reset daily and stay low (5-20 calls/day typical)
2. **Netlify Logs:** Check that cleanup function runs daily at 4am UTC
3. **Table Size:** `audit_log` table should stabilize at ~30 days of data

## Rollback Plan

If issues occur:

1. **Revert backend query:**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

2. **Disable cleanup function:**
   ```bash
   # Delete the file
   rm netlify/functions-scheduled/cleanup-audit-logs.ts
   git commit -am "Disable audit log cleanup"
   git push origin main
   ```

3. **Database rollback:** (if needed)
   ```sql
   -- Remove NOT NULL constraint
   ALTER TABLE public.audit_log ALTER COLUMN at DROP NOT NULL;
   
   -- Remove default
   ALTER TABLE public.audit_log ALTER COLUMN at DROP DEFAULT;
   ```
