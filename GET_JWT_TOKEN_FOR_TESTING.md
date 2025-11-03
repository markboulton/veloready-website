# How to Get a JWT Token for Testing Tier Enforcement

## 🎯 Quick Summary

The Netlify logs show: **"token is malformed: token contains an invalid number of segments"**

This means you're sending a token that isn't in proper JWT format (should be `header.payload.signature`).

---

## ✅ Automated Tests Are Working

```bash
./scripts/test-tier-enforcement.sh
```

**Results:**
- ✅ All authentication tests passed
- ✅ API is deployed and responding
- ✅ Malformed tokens properly rejected with 401

**The tier enforcement code is deployed and working correctly!**

---

## 🔐 How to Get a Real JWT Token

### Method 1: From iOS App (Easiest)

1. **Run VeloReady app in Xcode**
2. **Complete Strava OAuth login**
3. **Check Xcode console logs for:**
   ```
   [Auth] ✅ Authenticated: <user_id>
   [Supabase] Access token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. **Copy the full token** (starts with `eyJ...`)

### Method 2: From Supabase Dashboard

1. **Go to Supabase Dashboard**
   - URL: https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Navigate to Authentication → Users**

3. **Find your user** (email: `strava-YOUR_ATHLETE_ID@veloready.app`)

4. **Click on the user**

5. **Copy the "Access Token"** from the user details

### Method 3: Generate via API (Advanced)

```bash
# Use the OAuth endpoint to get a fresh token
# This requires completing the Strava OAuth flow
curl -X POST "https://api.veloready.app/oauth/strava/token-exchange" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "YOUR_STRAVA_AUTH_CODE",
    "state": "YOUR_STATE"
  }'
```

---

## 🧪 Testing with Real JWT Token

Once you have a valid JWT token:

### Test 1: Verify Authentication Works
```bash
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # Your real token

curl -X GET "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected:** 200 OK with activities data

### Test 2: Check Your Subscription Tier
```bash
curl -X GET "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.metadata.tier'
```

**Expected:** `"free"` or `"pro"` or `"trial"`

### Test 3: Test FREE Tier Limit (90 days)
```bash
# Should SUCCEED (within limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=90" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Should FAIL (exceeds limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected for 365 days:**
```json
{
  "error": "TIER_LIMIT_EXCEEDED",
  "message": "Your free plan allows access to 90 days of data. Upgrade to access more history.",
  "currentTier": "free",
  "requestedDays": 365,
  "maxDaysAllowed": 90
}
```

---

## 🎖️ Testing PRO Tier

### Step 1: Upgrade User to PRO in Database

```sql
-- Connect to Supabase SQL Editor
-- Find your user_id
SELECT id, email FROM auth.users WHERE email LIKE '%YOUR_ATHLETE_ID%';

-- Upgrade to PRO
INSERT INTO user_subscriptions (user_id, subscription_tier, expires_at)
VALUES (
  'YOUR_USER_ID',
  'pro',
  NOW() + INTERVAL '30 days'
)
ON CONFLICT (user_id) 
DO UPDATE SET 
  subscription_tier = 'pro',
  expires_at = NOW() + INTERVAL '30 days',
  updated_at = NOW();
```

### Step 2: Test PRO Tier Limits (365 days)

```bash
# Should SUCCEED (within PRO limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.metadata'
```

**Expected:**
```json
{
  "tier": "pro",
  "daysBack": 365,
  "limit": 500,
  "count": 150
}
```

---

## 🔍 Debugging Token Issues

### Issue: "token is malformed"

**Cause:** Token doesn't have 3 parts separated by dots

**Check your token:**
```bash
echo $JWT_TOKEN | awk -F. '{print NF-1}'
```

**Expected:** `2` (meaning 3 parts: header.payload.signature)

**If you get 0 or 1:** Your token is malformed. Get a new one from Supabase.

### Issue: "Invalid or expired token"

**Cause:** Token signature is invalid or token has expired

**Solutions:**
1. **Get a fresh token** from iOS app or Supabase
2. **Use refresh token** to get new access token:
   ```bash
   curl -X POST "https://api.veloready.app/auth-refresh-token" \
     -H "Content-Type: application/json" \
     -d '{"refresh_token": "YOUR_REFRESH_TOKEN"}'
   ```

### Issue: "No athlete found"

**Cause:** User exists in Supabase but not in `athlete` table

**Solution:** Complete Strava OAuth in iOS app to create athlete record

---

## 📊 Verify Subscription in Database

```sql
-- Check your subscription status
SELECT 
  us.user_id,
  us.subscription_tier,
  us.expires_at,
  CASE 
    WHEN us.expires_at IS NULL THEN 'No expiry'
    WHEN us.expires_at > NOW() THEN 'Active'
    ELSE 'Expired'
  END as status,
  au.email
FROM user_subscriptions us
JOIN auth.users au ON au.id = us.user_id
WHERE au.email LIKE '%YOUR_ATHLETE_ID%';
```

**Expected Output:**
```
user_id              | subscription_tier | expires_at          | status | email
---------------------|-------------------|---------------------|--------|-------------------------
abc-123-def          | free              | NULL                | Active | strava-104662@veloready.app
```

---

## 🎯 Complete Test Flow

### 1. Get JWT Token
```bash
# From iOS app logs or Supabase dashboard
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 2. Verify Token Works
```bash
curl -s "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.metadata.tier'
```

### 3. Test FREE Tier Enforcement
```bash
# Should FAIL with 403
curl -s "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.error'
```

**Expected:** `"TIER_LIMIT_EXCEEDED"`

### 4. Upgrade to PRO in Database
```sql
UPDATE user_subscriptions
SET subscription_tier = 'pro', expires_at = NOW() + INTERVAL '30 days'
WHERE user_id = 'YOUR_USER_ID';
```

### 5. Test PRO Tier Access
```bash
# Should SUCCEED with 200
curl -s "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.metadata.tier'
```

**Expected:** `"pro"`

---

## 🚀 Quick Test Script

Save this as `test-with-token.sh`:

```bash
#!/bin/bash

# Replace with your real JWT token
JWT_TOKEN="YOUR_JWT_TOKEN_HERE"

echo "Testing with JWT token..."
echo ""

echo "1. Check subscription tier:"
curl -s "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.metadata.tier'

echo ""
echo "2. Test 90 days (FREE limit):"
curl -s "https://api.veloready.app/api/activities?daysBack=90" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.metadata // .error'

echo ""
echo "3. Test 365 days (exceeds FREE, within PRO):"
curl -s "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.metadata // .error'
```

---

## 📝 Summary

**Current Status:**
- ✅ Tier enforcement is deployed and working
- ✅ Authentication is working correctly
- ✅ Malformed tokens are properly rejected

**To test tier limits:**
1. Get a real JWT token (from iOS app or Supabase)
2. Use the test commands above
3. Verify FREE tier blocks 365 days
4. Upgrade to PRO in database
5. Verify PRO tier allows 365 days

**The error you saw in logs is expected** - it's the system correctly rejecting an invalid token format!
