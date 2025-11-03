# How to Test Tier Enforcement - Quick Start Guide

## 🎯 Quick Test (No Setup Required)

### Test 1: Invalid Token (Should Return 401)
```bash
curl -X GET "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer invalid_token" \
  -i
```

**Expected Result:**
```
HTTP/2 401
{"error":"Invalid or expired token"}
```

✅ **This confirms the API is live and authentication is working.**

---

## 🔐 Testing with Real User Account

### Step 1: Get Your JWT Token

**Option A: From iOS App Debug Logs**
1. Run VeloReady app in Xcode
2. Complete Strava OAuth
3. Look for log: `[Auth] Access token: eyJhbG...`
4. Copy the token

**Option B: From Supabase Dashboard**
1. Go to Supabase project
2. Authentication → Users
3. Find your user
4. Copy the access token

### Step 2: Test FREE Tier Limits

**Test 2A: Request Within Limit (Should Succeed)**
```bash
curl -X GET "https://api.veloready.app/api/activities?daysBack=90" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Result:**
```json
{
  "activities": [...],
  "metadata": {
    "tier": "free",
    "daysBack": 90,
    "limit": 100,
    "count": 25
  }
}
```

**Test 2B: Request Exceeding Limit (Should Fail)**
```bash
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Result:**
```json
{
  "error": "TIER_LIMIT_EXCEEDED",
  "message": "Your free plan allows access to 90 days of data. Upgrade to access more history.",
  "currentTier": "free",
  "requestedDays": 365,
  "maxDaysAllowed": 90
}
```

### Step 3: Test Activity Limit

**Test 3: Request 500 Activities as FREE User (Should Cap to 100)**
```bash
curl -X GET "https://api.veloready.app/api/activities?daysBack=30&limit=500" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Result:**
```json
{
  "activities": [...],
  "metadata": {
    "tier": "free",
    "daysBack": 30,
    "limit": 100,  // <-- Capped to FREE tier limit
    "count": 25
  }
}
```

---

## 🎖️ Testing PRO Tier

### Step 4: Upgrade to PRO (Database Method)

**Connect to Supabase and run:**
```sql
-- Find your user_id first
SELECT user_id, subscription_tier, expires_at
FROM user_subscriptions
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE email LIKE '%YOUR_ATHLETE_ID%'
);

-- Upgrade to PRO with 30-day expiry
UPDATE user_subscriptions
SET 
  subscription_tier = 'pro',
  expires_at = NOW() + INTERVAL '30 days',
  updated_at = NOW()
WHERE user_id = 'YOUR_USER_ID';
```

### Step 5: Test PRO Tier Limits

**Test 5: Request 365 Days as PRO User (Should Succeed)**
```bash
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Result:**
```json
{
  "activities": [...],
  "metadata": {
    "tier": "pro",  // <-- Now PRO tier
    "daysBack": 365,  // <-- Full 365 days allowed
    "limit": 500,
    "count": 150
  }
}
```

---

## 🧪 Testing All Endpoints

### Test 6: Intervals.icu Activities
```bash
# FREE user - should fail
curl -X GET "https://api.veloready.app/api/intervals/activities?daysBack=180" \
  -H "Authorization: Bearer YOUR_FREE_JWT_TOKEN"

# PRO user - should succeed
curl -X GET "https://api.veloready.app/api/intervals/activities?daysBack=180" \
  -H "Authorization: Bearer YOUR_PRO_JWT_TOKEN"
```

### Test 7: Wellness Data
```bash
# FREE user - should fail
curl -X GET "https://api.veloready.app/api/intervals/wellness?days=120" \
  -H "Authorization: Bearer YOUR_FREE_JWT_TOKEN"

# PRO user - should succeed
curl -X GET "https://api.veloready.app/api/intervals/wellness?days=120" \
  -H "Authorization: Bearer YOUR_PRO_JWT_TOKEN"
```

### Test 8: Streams (No Tier Enforcement)
```bash
# Both FREE and PRO should succeed
curl -X GET "https://api.veloready.app/api/streams/12345678" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 📱 Testing in iOS App

### Test 9: Visual Verification in App

1. **FREE User:**
   - Open Performance tab
   - Scroll to older data (> 90 days)
   - Should see upgrade prompt or limited data

2. **PRO User:**
   - Open Performance tab
   - Scroll to older data (> 90 days)
   - Should see full historical data

3. **Check Debug Logs:**
```
✅ [API] Fetched activities: tier=free, daysBack=90
❌ [API] Tier limit exceeded: requested 365 days, max 90 days
```

---

## 🔍 Automated Testing

### Test 10: Run Unit Tests
```bash
cd /Users/markboulton/Dev/veloready-website
npm test
```

**Expected:**
- ✅ 54+ tests passing
- ✅ All tier enforcement logic tested
- ✅ No breaking changes

---

## 🎭 Testing Subscription Expiry

### Test 11: Expired PRO Subscription

**Setup:**
```sql
-- Set PRO subscription with past expiry date
UPDATE user_subscriptions
SET 
  subscription_tier = 'pro',
  expires_at = NOW() - INTERVAL '1 day'  -- Expired yesterday
WHERE user_id = 'YOUR_USER_ID';
```

**Test:**
```bash
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Result:**
```json
{
  "error": "TIER_LIMIT_EXCEEDED",
  "currentTier": "free",  // <-- Auto-downgraded from expired PRO
  "requestedDays": 365,
  "maxDaysAllowed": 90
}
```

---

## 📊 Verification Checklist

Use this checklist to verify tier enforcement is working:

- [ ] ✅ Invalid token returns 401
- [ ] ✅ FREE user can request 90 days
- [ ] ✅ FREE user cannot request 365 days (403)
- [ ] ✅ FREE user activity limit capped to 100
- [ ] ✅ PRO user can request 365 days
- [ ] ✅ PRO user can request 500 activities
- [ ] ✅ Expired PRO downgraded to FREE
- [ ] ✅ Error messages include upgrade prompts
- [ ] ✅ Response metadata includes tier info
- [ ] ✅ All endpoints enforce limits consistently
- [ ] ✅ Streams endpoint has no tier limits
- [ ] ✅ Netlify logs show tier information

---

## 🚨 Troubleshooting

### Problem: Getting 401 for all requests
**Solution:** Token expired. Get new token from app or refresh via `/auth-refresh-token`

### Problem: Getting 403 even for FREE limits
**Solution:** No subscription record. Create one:
```sql
INSERT INTO user_subscriptions (user_id, subscription_tier)
VALUES ('YOUR_USER_ID', 'free')
ON CONFLICT (user_id) DO UPDATE
SET subscription_tier = 'free';
```

### Problem: PRO user getting FREE limits
**Solution:** Check expiry date:
```sql
SELECT 
  subscription_tier,
  expires_at,
  CASE 
    WHEN expires_at IS NULL THEN 'No expiry'
    WHEN expires_at > NOW() THEN 'Active'
    ELSE 'Expired'
  END as status
FROM user_subscriptions
WHERE user_id = 'YOUR_USER_ID';
```

---

## 🎯 Quick Smoke Test (30 seconds)

Run these 3 commands to verify everything works:

```bash
# 1. Test authentication (should return 401)
curl -s "https://api.veloready.app/api/activities" \
  -H "Authorization: Bearer invalid" | jq .error

# 2. Test with valid token - within limits (should return 200)
curl -s "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .metadata.tier

# 3. Test with valid token - exceeds limits (should return 403)
curl -s "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_FREE_TOKEN" | jq .error
```

**Expected Output:**
```
"Invalid or expired token"
"free"
"TIER_LIMIT_EXCEEDED"
```

✅ **If you see these 3 responses, tier enforcement is working correctly!**

---

## 📚 Additional Resources

- **Full Testing Guide:** `TIER_ENFORCEMENT_TESTING.md`
- **Implementation Status:** `TIER_ENFORCEMENT_STATUS.md`
- **Auth Enhancement:** `SUBSCRIPTION_AUTH_ENHANCEMENT.md`
- **Tier Limits Code:** `netlify/lib/auth.ts` (TIER_LIMITS constant)
