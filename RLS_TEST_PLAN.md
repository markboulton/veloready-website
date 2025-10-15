# RLS End-to-End Test Plan

This test plan verifies that Row Level Security (RLS) is working correctly across your entire VeloReady backend.

## 🎯 Test Objectives

1. ✅ Verify Supabase users are created during OAuth
2. ✅ Verify `user_id` is populated in database tables
3. ✅ Verify RLS policies enforce data isolation
4. ✅ Verify existing functions still work with RLS enabled
5. ✅ Verify no data leakage between users

---

## 📊 Where to Monitor

### Netlify Dashboard
- **URL**: https://app.netlify.com → Your site → **Functions** tab
- **What to watch**: Real-time function logs

### Supabase Dashboard
- **URL**: https://supabase.com → Your project
- **Authentication**: Check users created
- **Table Editor**: Verify `user_id` populated
- **Logs**: Check for RLS policy violations

---

## 🧪 Test Scenarios

### Test 1: Fresh OAuth Connection (New User)

**Objective**: Verify new users are created in Supabase Auth

**Steps**:
1. In your iOS app, go to **Settings**
2. If already connected, click **Disconnect from Strava**
3. Click **Connect to Strava**
4. Complete Strava OAuth flow
5. App should return to settings showing "Connected"

**Expected Netlify Logs** (`oauth-strava-token-exchange`):
```
[Strava Token Exchange] Received request with state: abc12345...
[Strava Token Exchange] Exchanging code for token...
[Strava Token Exchange] Token received for athlete 104662
[Strava Token Exchange] Creating/signing in Supabase user for strava-104662@veloready.app
[Strava Token Exchange] User doesn't exist, creating new user
[Strava Token Exchange] Created new user: a1b2c3d4-5678-90ab-cdef-1234567890ab
[Strava Token Exchange] Credentials stored for athlete 104662 with user_id a1b2c3d4-...
```

**Expected Supabase Dashboard**:
- **Authentication → Users**: New user appears
  - Email: `strava-104662@veloready.app`
  - Provider: Email
  - Created: Just now
  
- **Table Editor → athlete**: New row
  - `id`: 104662
  - `user_id`: a1b2c3d4-... (matches auth user)
  - `access_token`: (populated)
  - `refresh_token`: (populated)

**✅ Pass Criteria**:
- Function returns `{ ok: 1, athlete_id: "104662", user_id: "..." }`
- User created in Supabase Auth
- `user_id` populated in athlete table

---

### Test 2: Reconnect OAuth (Existing User)

**Objective**: Verify existing users are signed in (not duplicated)

**Steps**:
1. Disconnect and reconnect Strava again
2. Complete OAuth flow

**Expected Netlify Logs**:
```
[Strava Token Exchange] Token received for athlete 104662
[Strava Token Exchange] Creating/signing in Supabase user for strava-104662@veloready.app
[Strava Token Exchange] Signed in existing user: a1b2c3d4-...
[Strava Token Exchange] Credentials stored for athlete 104662 with user_id a1b2c3d4-...
```

**Expected Supabase Dashboard**:
- **Authentication → Users**: Same user (no duplicate)
- **Table Editor → athlete**: Same row updated

**✅ Pass Criteria**:
- No duplicate users created
- Same `user_id` used
- Tokens updated in athlete table

---

### Test 3: Activity Sync with RLS

**Objective**: Verify activities are stored with `user_id`

**Steps**:
1. In your app, trigger activity sync (pull to refresh on Today view)
2. Wait for activities to load

**Expected Netlify Logs** (if using background sync):
```
[Activity Sync] Fetching activities for athlete 104662
[Activity Sync] Storing activity 12345678 with user_id a1b2c3d4-...
```

**Expected Supabase Dashboard**:
- **Table Editor → activity**: Activities have `user_id` populated
  - `id`: 12345678
  - `athlete_id`: 104662
  - `user_id`: a1b2c3d4-... (matches athlete.user_id)

**✅ Pass Criteria**:
- All new activities have `user_id` populated
- `user_id` matches the athlete's `user_id`

---

### Test 4: RLS Policy Enforcement (Data Isolation)

**Objective**: Verify users can only access their own data

**Steps in Supabase SQL Editor**:

**4a. Test as authenticated user**
```sql
-- Simulate being logged in as the user
SET request.jwt.claim.sub = 'a1b2c3d4-5678-90ab-cdef-1234567890ab';

-- Should return data
SELECT * FROM public.athlete WHERE user_id = 'a1b2c3d4-5678-90ab-cdef-1234567890ab';
SELECT * FROM public.activity WHERE user_id = 'a1b2c3d4-5678-90ab-cdef-1234567890ab';
```

**Expected**: Returns rows ✅

**4b. Test as different user**
```sql
-- Simulate being a different user
SET request.jwt.claim.sub = 'different-user-id-here';

-- Should return NO data (RLS blocks it)
SELECT * FROM public.athlete WHERE user_id = 'a1b2c3d4-5678-90ab-cdef-1234567890ab';
```

**Expected**: Returns 0 rows ✅

**4c. Test unauthenticated access**
```sql
-- Reset to no user
RESET request.jwt.claim.sub;

-- Should return NO data
SELECT * FROM public.athlete;
SELECT * FROM public.activity;
```

**Expected**: Returns 0 rows ✅

**✅ Pass Criteria**:
- Authenticated users see only their own data
- Different users cannot see each other's data
- Unauthenticated queries return nothing

---

### Test 5: Existing Functions Still Work

**Objective**: Verify backend functions work with RLS enabled

**5a. Token Endpoint** (`/api/me/strava/token`)

⚠️ **Note**: This function currently hardcodes `athleteId = 104662` and doesn't use RLS yet. It will still work because it uses direct SQL queries, not Supabase client.

**Test**: Make a request to the token endpoint
```bash
curl https://veloready.app/api/me/strava/token
```

**Expected Response**:
```json
{
  "access_token": "b35aa09163b9afc641280201e44d7e722d8dfdd5"
}
```

**Expected Logs**:
```
[Strava Token] Token requested for athlete 104662
[Strava Token] Returning valid token (expires in 120min)
```

**✅ Pass Criteria**: Returns valid token

---

**5b. Streams API** (`/api/request-streams`)

**Test**: Request activity streams
```bash
curl "https://veloready.app/api/request-streams?activity_id=12345678&athlete_id=104662&keys=time,distance,watts"
```

**Expected Response**:
```json
{
  "ok": 1,
  "activity_id": "12345678",
  "streams": { ... }
}
```

**Expected Logs**:
```
[Streams API] Request for activity 12345678 by athlete 104662
[Streams API] Successfully fetched streams for activity 12345678
```

**✅ Pass Criteria**: Returns stream data

---

**5c. Status Endpoint** (`/api/me/strava/status`)

**Test**: Check connection status
```bash
curl https://veloready.app/api/me/strava/status
```

**Expected Response**:
```json
{
  "connected": true,
  "status": "ready"
}
```

**✅ Pass Criteria**: Returns connected status

---

### Test 6: Multi-User Scenario (If Possible)

**Objective**: Verify complete data isolation between users

**Steps**:
1. Create a second test Strava account (or use a friend's)
2. Connect that account via OAuth
3. Verify second user is created in Supabase
4. Check both users have separate data

**Expected Supabase Dashboard**:
- **Authentication → Users**: 2 users
  - `strava-104662@veloready.app` (User A)
  - `strava-999999@veloready.app` (User B)
  
- **Table Editor → athlete**: 2 rows
  - Row 1: `id=104662`, `user_id=a1b2c3d4-...`
  - Row 2: `id=999999`, `user_id=x9y8z7w6-...`

- **Table Editor → activity**: Activities separated by `user_id`
  - User A's activities have `user_id=a1b2c3d4-...`
  - User B's activities have `user_id=x9y8z7w6-...`

**✅ Pass Criteria**:
- Each user has unique `user_id`
- Activities are correctly linked to their owner
- No cross-contamination of data

---

## 🚨 Common Issues & Solutions

### Issue: "No user created" in logs

**Cause**: Missing environment variables

**Solution**:
1. Check Netlify env vars are set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Redeploy backend after adding vars

---

### Issue: "Failed to create user: User already registered"

**Cause**: User already exists (this is normal!)

**Solution**: Check logs show "Signed in existing user" instead

---

### Issue: "Permission denied" when querying tables

**Cause**: RLS is working! Query is blocked because `user_id` doesn't match

**Solution**: This is expected behavior. Verify:
```sql
-- Check if data has user_id
SELECT id, user_id FROM public.athlete;

-- If user_id is NULL, that's the problem
-- Either delete old data or link it manually
```

---

### Issue: Functions return 500 errors

**Cause**: Database connection or RLS policy issue

**Solution**:
1. Check Netlify function logs for detailed error
2. Check Supabase logs for RLS violations
3. Verify `DATABASE_URL` env var is correct

---

### Issue: Old data not visible

**Cause**: Old data has `user_id = NULL`, RLS blocks it

**Solution**: Delete old test data:
```sql
DELETE FROM public.activity_stream WHERE activity_id IN (
  SELECT id FROM public.activity WHERE user_id IS NULL
);
DELETE FROM public.activity WHERE user_id IS NULL;
DELETE FROM public.athlete WHERE user_id IS NULL;
```

---

## 📈 Success Metrics

After completing all tests, you should see:

### Netlify Dashboard
- ✅ OAuth function logs show user creation/sign-in
- ✅ No 500 errors in function logs
- ✅ All functions return successful responses

### Supabase Dashboard
- ✅ Users created in Authentication tab
- ✅ All tables have `user_id` populated for new data
- ✅ RLS enabled on all 5 tables (athlete, activity, activity_stream, sync_state, audit_log)
- ✅ No security warnings in Ops dashboard

### iOS App
- ✅ OAuth flow completes successfully
- ✅ Activities load correctly
- ✅ No errors in app logs

---

## 🎬 Quick Test Sequence

**5-Minute Smoke Test**:

1. ✅ Deploy backend to Netlify
2. ✅ Run SQL migration in Supabase
3. ✅ Disconnect/reconnect Strava in app
4. ✅ Check Netlify logs for "Created new user"
5. ✅ Check Supabase Auth for new user
6. ✅ Check athlete table for `user_id` populated
7. ✅ Verify no security warnings in Supabase dashboard

**Pass/Fail**: If all 7 steps succeed, RLS is working! ✅

---

## 📝 Test Checklist

Copy this checklist and mark off as you test:

```
Pre-Deployment:
[ ] SUPABASE_URL added to Netlify env vars
[ ] SUPABASE_SERVICE_ROLE_KEY added to Netlify env vars
[ ] Backend deployed to Netlify
[ ] SQL migration run in Supabase

Test 1 - Fresh OAuth:
[ ] User created in Supabase Auth
[ ] user_id populated in athlete table
[ ] Function logs show "Created new user"

Test 2 - Reconnect OAuth:
[ ] No duplicate user created
[ ] Same user_id used
[ ] Function logs show "Signed in existing user"

Test 3 - Activity Sync:
[ ] Activities have user_id populated
[ ] user_id matches athlete.user_id

Test 4 - RLS Enforcement:
[ ] Authenticated users see own data
[ ] Different users cannot see each other's data
[ ] Unauthenticated queries return nothing

Test 5 - Functions Work:
[ ] Token endpoint returns token
[ ] Streams API returns data
[ ] Status endpoint returns connected

Test 6 - Security:
[ ] No security warnings in Supabase dashboard
[ ] RLS enabled on all tables
[ ] Policies exist for all tables

Final Verification:
[ ] iOS app works end-to-end
[ ] No errors in Netlify logs
[ ] No errors in Supabase logs
```

---

**Ready to test?** Start with the 5-minute smoke test, then run the full test suite if everything passes!
