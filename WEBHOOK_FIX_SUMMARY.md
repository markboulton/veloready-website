# Webhook Fix Summary

## 🐛 Root Cause

After enabling RLS (Row Level Security), activities stopped being stored because the `upsertActivitySummary` function was **not including `user_id`** in INSERT statements. RLS policies blocked these inserts.

## ✅ Files Fixed

### 1. `/netlify/lib/db.ts`
**Problem**: `upsertActivitySummary` didn't include `user_id`
**Fix**: 
- Fetch `user_id` from athlete record
- Include `user_id` in INSERT and UPDATE statements
- Now RLS policies allow the insert

### 2. `/netlify/functions/webhooks-strava.ts`
**Problem**: `audit_log` inserts didn't include `user_id`
**Fix**:
- Fetch `user_id` from athlete before logging
- Include `user_id` and `athlete_id` in audit_log inserts

### 3. `/netlify/functions/me-strava-disconnect.ts`
**Problem**: `audit_log` inserts didn't include `user_id`
**Fix**:
- Fetch `user_id` from athlete before deleting
- Include `user_id` and `athlete_id` in audit_log inserts

## 🚀 Deploy & Test

### Step 1: Deploy Backend

```bash
cd /Users/markboulton/Dev/veloready-website
git add .
git commit -m "Fix: Add user_id to activity and audit_log inserts for RLS compliance"
git push origin main
```

Or deploy directly:
```bash
netlify deploy --prod
```

### Step 2: Test Webhook Flow

1. **Create a test activity** on Strava (20 second ride)
2. **Wait 5 minutes** for scheduled drainer to run
3. **Check Netlify logs** for `drain-queues` function:

**Expected logs:**
```
[Scheduled Drain] Starting queue drain...
[Scheduled Drain] Processing job 1: {kind: "sync-activity", athlete_id: 104662, activity_id: 12345678}
[Scheduled Drain] Fetched activity: Test Ride
[Scheduled Drain] Stored activity 12345678
[Scheduled Drain] Completed: 1 processed, 0 errors
```

### Step 3: Verify in Database

```sql
-- Check activity was stored with user_id
SELECT id, name, athlete_id, user_id, start_date 
FROM activity 
WHERE athlete_id = 104662 
ORDER BY start_date DESC 
LIMIT 5;
```

**Expected**: New activity appears with `user_id` populated

### Step 4: Check Upstash Queue

```bash
curl "https://YOUR_REDIS_URL/llen/q:live" \
  -H "Authorization: Bearer YOUR_REDIS_TOKEN"
```

**Expected**: Queue depth decreases as jobs are processed

## 🔍 Debugging

If activities still don't appear:

### Check 1: Webhook Received
```sql
SELECT * FROM audit_log 
WHERE kind = 'webhook' 
AND athlete_id = 104662
ORDER BY at DESC 
LIMIT 5;
```

### Check 2: Queue Has Jobs
Check Upstash dashboard or use API to see queue depth

### Check 3: Drainer Running
Check Netlify Functions → `drain-queues` for recent invocations

### Check 4: No Errors in Logs
Check both webhook and drainer logs for errors

## 📋 Complete Test Checklist

```
Pre-Deploy:
[ ] All files committed
[ ] Backend deployed to Netlify
[ ] Deployment successful

Test Webhook:
[ ] Create 20-second test ride on Strava
[ ] Wait 5 minutes
[ ] Check audit_log for webhook entry
[ ] Check Upstash queue depth
[ ] Check drain-queues logs
[ ] Check activity table for new activity
[ ] Verify user_id is populated

Verify RLS:
[ ] Activity has user_id matching athlete
[ ] No "permission denied" errors in logs
[ ] Security warnings resolved in Supabase
```

## 🎯 Success Criteria

- ✅ Webhook receives events (audit_log has entries)
- ✅ Jobs enqueued to Redis (queue depth > 0)
- ✅ Drainer processes jobs (logs show "Stored activity")
- ✅ Activities appear in database with `user_id`
- ✅ No RLS permission errors
- ✅ All 5 security warnings resolved

## 🚨 If Still Not Working

1. **Check environment variables** in Netlify:
   - `REDIS_URL` (should be Upstash URL)
   - `REDIS_TOKEN` (should be Upstash token)
   - `DATABASE_URL` (should be Supabase connection string)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Manually trigger drain**:
   ```bash
   curl -X POST "https://veloready.app/.netlify/functions/ops-drain-queue"
   ```

3. **Check Netlify function logs** for detailed errors

4. **Verify athlete has user_id**:
   ```sql
   SELECT id, user_id FROM athlete WHERE id = 104662;
   ```
   If `user_id` is NULL, re-authenticate via OAuth.

## 📚 Related Documentation

- `WEBHOOK_DEBUG_GUIDE.md` - Complete debugging steps
- `RLS_TEST_PLAN.md` - RLS testing procedures
- `SUPABASE_RLS_SETUP.md` - RLS setup guide

---

**Next**: Deploy and test with a real Strava activity!
