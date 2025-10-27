# Testing Strava API Cache

## How to Test

### Step 1: Wait for deployment (2-3 minutes)
Check: https://app.netlify.com/sites/veloready/deploys

### Step 2: Clear old audit logs (optional but recommended)
Run in Supabase SQL Editor:
```sql
DELETE FROM audit_log WHERE kind = 'api' AND at < NOW() - INTERVAL '5 minutes';
```

### Step 3: Test from iOS app
1. Open VeloReady app
2. Pull to refresh on Today page
3. Wait 2 seconds
4. Pull to refresh again
5. Wait 2 seconds  
6. Pull to refresh again

### Step 4: Check Netlify Function Logs
Go to: https://app.netlify.com/sites/veloready/logs/functions

Look for:
- `[Strava Cache] MISS` - First call (fetches from Strava, logs API call)
- `[Strava Cache] HIT` - Second call (returns cached data, NO API call)
- `[Strava Cache] HIT` - Third call (returns cached data, NO API call)

### Step 5: Check audit log
Run in Supabase SQL Editor:
```sql
SELECT 
  note,
  COUNT(*) as count,
  MAX(at) as most_recent
FROM audit_log 
WHERE kind = 'api' AND at > NOW() - INTERVAL '10 minutes'
GROUP BY note
ORDER BY most_recent DESC;
```

**Expected Result:**
- `activities:list` should have count = 1 (only the first call)
- Dashboard should show 1 API call instead of 33

## What Success Looks Like

**Before (broken):**
- 33 API calls to `activities:list` in 24 hours
- Every app refresh = new API call
- Dashboard shows 35 total API calls

**After (fixed):**
- 1 API call per hour (cache expires after 1 hour)
- First refresh = API call + cache store
- Next refreshes (within 1 hour) = cache hit, no API call
- Dashboard shows 2-3 API calls per day instead of 35

## Troubleshooting

If cache is NOT working, check:
1. Netlify Blobs is enabled (should be automatic)
2. Function logs show cache MISS/HIT messages
3. No errors in function logs

If you see `[Strava Cache] ERROR`, the blob store might not be working.
