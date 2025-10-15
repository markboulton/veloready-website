# Strava Webhook Debugging Guide

Complete step-by-step guide to debug why activities aren't appearing in Upstash after Strava rides.

## 🔍 System Overview

```
Strava Activity Created
    ↓
Strava sends webhook → /webhooks-strava
    ↓
Webhook logs to audit_log (PostgreSQL)
    ↓
Webhook enqueues job → Upstash Redis (q:live)
    ↓
Scheduled function runs every 5 min → drain-queues
    ↓
Drainer pops job from Redis
    ↓
Drainer fetches activity from Strava API
    ↓
Drainer stores activity in PostgreSQL
```

## 📋 Debug Checklist

### Step 1: Verify Webhook is Registered with Strava

**Check Strava webhook subscription:**

```bash
curl -X GET "https://www.strava.com/api/v3/push_subscriptions" \
  -H "Authorization: Bearer YOUR_STRAVA_ACCESS_TOKEN"
```

**Expected response:**
```json
[
  {
    "id": 12345,
    "callback_url": "https://veloready.app/.netlify/functions/webhooks-strava",
    "created_at": "2025-10-15T...",
    "updated_at": "2025-10-15T..."
  }
]
```

**❌ If empty array**: Webhook not registered
- Go to https://www.strava.com/settings/api
- Check if webhook subscription exists
- Re-register if needed

---

### Step 2: Check Webhook is Receiving Events

**Check Netlify function logs:**

1. Go to **Netlify Dashboard** → Your site → **Functions**
2. Click on **webhooks-strava**
3. Look for recent invocations

**Expected logs after creating activity:**
```
[Webhook] Received event: activity:create:12345678
```

**❌ If no logs**: Strava isn't sending webhooks
- Check webhook subscription is active
- Check callback URL is correct
- Check Strava app has correct permissions

**✅ If logs exist**: Webhook is receiving events → Continue to Step 3

---

### Step 3: Verify Webhook Logs to audit_log

**Check PostgreSQL audit_log table:**

```sql
SELECT * FROM audit_log 
WHERE kind = 'webhook' 
ORDER BY at DESC 
LIMIT 10;
```

**Expected result:**
```
| kind    | ref_id | note                    | at                  |
|---------|--------|-------------------------|---------------------|
| webhook | 104662 | activity:create:1234567 | 2025-10-15 14:30:00 |
```

**❌ If no rows**: Webhook handler is failing before logging
- Check `DATABASE_URL` env var is set in Netlify
- Check database connection is working
- Check Netlify function logs for errors

**✅ If rows exist**: Webhook is logging → Continue to Step 4

---

### Step 4: Verify Job is Enqueued to Redis

**Check Upstash Redis queue:**

Option A: Use Upstash Dashboard
1. Go to https://console.upstash.com
2. Select your Redis database
3. Click **Data Browser**
4. Search for key: `q:live`
5. Check if jobs are present

Option B: Use API
```bash
curl "https://YOUR_REDIS_URL/llen/q:live" \
  -H "Authorization: Bearer YOUR_REDIS_TOKEN"
```

**Expected response:**
```json
{"result": 5}  // Number of jobs in queue
```

**❌ If result is 0**: Jobs aren't being enqueued
- Check `REDIS_URL` env var in Netlify (should be `UPSTASH_REDIS_REST_URL`)
- Check `REDIS_TOKEN` env var in Netlify (should be `UPSTASH_REDIS_REST_TOKEN`)
- Check Netlify function logs for Redis errors

**✅ If result > 0**: Jobs are enqueued → Continue to Step 5

---

### Step 5: Check Scheduled Drainer is Running

**Check Netlify scheduled functions:**

1. Go to **Netlify Dashboard** → Your site → **Functions**
2. Look for **drain-queues** (scheduled function)
3. Check recent invocations (should run every 5 minutes)

**Expected logs:**
```
[Scheduled Drain] Starting queue drain...
[Scheduled Drain] Processing job 1: {kind: "sync-activity", athlete_id: 104662, activity_id: 12345678}
[Scheduled Drain] Fetched activity: Morning Ride
[Scheduled Drain] Stored activity 12345678
[Scheduled Drain] Completed: 1 processed, 0 errors in 1234ms
```

**❌ If no recent invocations**: Scheduled function isn't running
- Check if scheduled functions are enabled in Netlify
- Check Netlify plan supports scheduled functions
- Manually trigger drain: See Step 6

**❌ If errors in logs**: See "Common Errors" section below

**✅ If processing successfully**: Jobs are being drained → Continue to Step 6

---

### Step 6: Verify Activity is Stored in Database

**Check PostgreSQL activity table:**

```sql
SELECT id, name, start_date, athlete_id, user_id
FROM activity 
WHERE athlete_id = 104662 
ORDER BY start_date DESC 
LIMIT 10;
```

**Expected result:**
```
| id       | name         | start_date          | athlete_id | user_id                              |
|----------|--------------|---------------------|------------|--------------------------------------|
| 12345678 | Morning Ride | 2025-10-15 14:30:00 | 104662     | d888dbb2-bcd2-474d-9473-993bc3c6517f |
```

**❌ If no rows**: Activity wasn't stored
- Check drainer logs for errors
- Check athlete has valid access_token
- Check Strava API is accessible

**✅ If rows exist**: Activity is stored! → System is working

---

## 🚨 Common Errors

### Error: "No athlete or token for {athlete_id}"

**Cause**: Athlete record missing or access_token is null

**Fix**:
```sql
-- Check athlete record
SELECT id, access_token, refresh_token, expires_at, user_id 
FROM athlete 
WHERE id = 104662;

-- If user_id is null, that's the problem!
-- Re-authenticate via OAuth to populate user_id
```

---

### Error: "Strava API error: 401"

**Cause**: Access token expired

**Fix**: Token should auto-refresh, but check:
```sql
SELECT expires_at FROM athlete WHERE id = 104662;
```

If expired, manually refresh or re-authenticate.

---

### Error: "REDIS_URL is not defined"

**Cause**: Missing environment variables

**Fix**: Check Netlify env vars:
- `UPSTASH_REDIS_REST_URL` → Should be mapped to `REDIS_URL`
- `UPSTASH_REDIS_REST_TOKEN` → Should be mapped to `REDIS_TOKEN`

In Netlify, add:
```
REDIS_URL = https://your-redis.upstash.io
REDIS_TOKEN = your_token_here
```

---

### Error: "Failed to parse job.value"

**Cause**: Double-encoded JSON in Redis

**Fix**: Already handled in code, but if persists:
```typescript
// Check what's actually in Redis
const raw = await lpop(Q.LIVE);
console.log("Raw job:", raw);
```

---

### Error: RLS blocking inserts

**Cause**: New RLS policies blocking activity inserts without user_id

**Fix**: Ensure drainer includes user_id when storing activities.

**Check if this is the issue:**
```sql
-- Try inserting manually
INSERT INTO activity (id, athlete_id, user_id, name, start_date)
VALUES (99999999, 104662, 'd888dbb2-bcd2-474d-9473-993bc3c6517f', 'Test', NOW());

-- If this fails with "permission denied", RLS is blocking it
```

**Solution**: Update `upsertActivitySummary` to include user_id.

---

## 🛠️ Manual Testing

### Test 1: Manually Enqueue a Job

```bash
# Enqueue a test job
curl -X POST "https://veloready.app/.netlify/functions/ops-enqueue-test" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "sync-activity",
    "athlete_id": 104662,
    "activity_id": 12345678
  }'
```

Then check if it appears in Redis and gets processed.

---

### Test 2: Manually Drain Queue

```bash
# Trigger drain manually (if function exists)
curl -X POST "https://veloready.app/.netlify/functions/ops-drain-queue"
```

Check logs to see if jobs are processed.

---

### Test 3: Check Queue Depth

```bash
# Check how many jobs are waiting
curl "https://YOUR_REDIS_URL/llen/q:live" \
  -H "Authorization: Bearer YOUR_REDIS_TOKEN"
```

---

### Test 4: Simulate Webhook Event

```bash
# Send a fake webhook to your endpoint
curl -X POST "https://veloready.app/.netlify/functions/webhooks-strava" \
  -H "Content-Type: application/json" \
  -d '{
    "object_type": "activity",
    "aspect_type": "create",
    "owner_id": 104662,
    "object_id": 12345678
  }'
```

Check if job gets enqueued.

---

## 📊 Quick Diagnostic Script

Run this in Supabase SQL Editor to get full picture:

```sql
-- 1. Check recent webhooks received
SELECT * FROM audit_log 
WHERE kind = 'webhook' 
ORDER BY at DESC 
LIMIT 5;

-- 2. Check recent activities stored
SELECT id, name, start_date, athlete_id, user_id 
FROM activity 
WHERE athlete_id = 104662 
ORDER BY start_date DESC 
LIMIT 5;

-- 3. Check athlete has valid token
SELECT id, user_id, expires_at, 
       CASE 
         WHEN expires_at > NOW() THEN 'Valid'
         ELSE 'Expired'
       END as token_status
FROM athlete 
WHERE id = 104662;

-- 4. Check if RLS is blocking
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'activity';
```

---

## 🎯 Most Likely Issues

Based on your symptoms ("was working before"), the most likely causes are:

### 1. **RLS is now blocking activity inserts** ⚠️ MOST LIKELY

**Why**: You just enabled RLS, and the drainer might not be including `user_id`

**Check**: Look at `upsertActivitySummary` function
**Fix**: Ensure it includes `user_id` from athlete record

---

### 2. **Environment variables missing after RLS changes**

**Why**: You added `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, but might have missed Redis vars

**Check**: Netlify env vars for `REDIS_URL` and `REDIS_TOKEN`
**Fix**: Add them if missing

---

### 3. **Scheduled function not running**

**Why**: Netlify plan or configuration issue

**Check**: Netlify function logs for drain-queues
**Fix**: Manually trigger or check Netlify plan

---

## 🔧 Next Steps

1. **Check audit_log** - Are webhooks being received?
2. **Check Redis queue depth** - Are jobs being enqueued?
3. **Check drainer logs** - Is the scheduled function running?
4. **Check activity table** - Are activities being stored?

**Report back with:**
- Results from audit_log query
- Redis queue depth
- Recent drainer logs
- Any error messages

Then I can pinpoint the exact issue!
