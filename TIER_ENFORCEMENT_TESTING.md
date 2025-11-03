# Tier Enforcement Testing Guide

## Overview
This guide explains how to test subscription tier enforcement across all API endpoints.

## Tier Limits Reference

| Tier  | Days Back | Max Activities | Activities/Hour | Streams/Hour |
|-------|-----------|----------------|-----------------|--------------|
| Free  | 90        | 100            | 60              | 30           |
| Trial | 365       | 500            | 300             | 100          |
| Pro   | 365       | 500            | 300             | 100          |

## Automated Testing

### Run All Tests
```bash
npm test
```

### Run Tier Enforcement Tests Only
```bash
npm test tier-enforcement
```

### Expected Results
- ✅ 54+ tests should pass
- ✅ Tier enforcement tests cover all scenarios
- ✅ No breaking changes to existing functionality

## Manual Testing with cURL

### Prerequisites
1. Valid JWT token from Supabase authentication
2. User with known subscription tier in database

### Test FREE Tier (90 days limit)

#### ✅ Should SUCCEED - Within Limit
```bash
# Request 90 days (exactly at limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=90" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -i

# Expected: 200 OK
# Response includes: "tier": "free", "daysBack": 90
```

```bash
# Request 30 days (well within limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -i

# Expected: 200 OK
```

#### ❌ Should FAIL - Exceeds Limit
```bash
# Request 365 days (exceeds free tier limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -i

# Expected: 403 Forbidden
# Response body:
{
  "error": "TIER_LIMIT_EXCEEDED",
  "message": "Your free plan allows access to 90 days of data. Upgrade to access more history.",
  "currentTier": "free",
  "requestedDays": 365,
  "maxDaysAllowed": 90
}
```

```bash
# Request 180 days (exceeds free tier limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=180" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -i

# Expected: 403 Forbidden
```

### Test PRO Tier (365 days limit)

#### ✅ Should SUCCEED - Within Limit
```bash
# Request 365 days (at limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_PRO_JWT_TOKEN" \
  -i

# Expected: 200 OK
# Response includes: "tier": "pro", "daysBack": 365
```

```bash
# Request 180 days (within limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=180" \
  -H "Authorization: Bearer YOUR_PRO_JWT_TOKEN" \
  -i

# Expected: 200 OK
```

### Test Activity Limit Enforcement

#### FREE Tier - Max 100 Activities
```bash
# Request 500 activities (exceeds free tier limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=30&limit=500" \
  -H "Authorization: Bearer YOUR_FREE_JWT_TOKEN" \
  -i

# Expected: 200 OK (capped to 100)
# Response metadata: "limit": 100
```

#### PRO Tier - Max 500 Activities
```bash
# Request 500 activities (within pro tier limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=30&limit=500" \
  -H "Authorization: Bearer YOUR_PRO_JWT_TOKEN" \
  -i

# Expected: 200 OK
# Response metadata: "limit": 500
```

## Testing All Endpoints

### 1. Strava Activities (`/api/activities`)
```bash
# FREE - Should fail
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_FREE_TOKEN"

# PRO - Should succeed
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_PRO_TOKEN"
```

### 2. Intervals.icu Activities (`/api/intervals/activities`)
```bash
# FREE - Should fail
curl -X GET "https://api.veloready.app/api/intervals/activities?daysBack=180" \
  -H "Authorization: Bearer YOUR_FREE_TOKEN"

# PRO - Should succeed
curl -X GET "https://api.veloready.app/api/intervals/activities?daysBack=180" \
  -H "Authorization: Bearer YOUR_PRO_TOKEN"
```

### 3. Wellness Data (`/api/intervals/wellness`)
```bash
# FREE - Should fail
curl -X GET "https://api.veloready.app/api/intervals/wellness?days=120" \
  -H "Authorization: Bearer YOUR_FREE_TOKEN"

# PRO - Should succeed
curl -X GET "https://api.veloready.app/api/intervals/wellness?days=120" \
  -H "Authorization: Bearer YOUR_PRO_TOKEN"
```

### 4. Streams (No tier enforcement - per-activity endpoint)
```bash
# Both FREE and PRO should succeed
curl -X GET "https://api.veloready.app/api/streams/12345" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Testing Subscription Expiry

### Setup Test User with Expired Subscription
1. Update `user_subscriptions` table in Supabase
2. Set `expires_at` to a past date
3. Keep `subscription_tier` as 'pro'

### Test Expired PRO → Downgraded to FREE
```bash
# User has expired PRO subscription
# Should be treated as FREE tier (90 days limit)
curl -X GET "https://api.veloready.app/api/activities?daysBack=365" \
  -H "Authorization: Bearer YOUR_EXPIRED_PRO_TOKEN" \
  -i

# Expected: 403 Forbidden
# Response: "currentTier": "free" (downgraded)
```

## Checking Netlify Function Logs

### View Logs in Real-Time
```bash
netlify functions:log api-activities
```

### What to Look For
```
[Auth] ✅ Authenticated user: <id>, athlete: <id>, tier: free
[API Activities] Request: athleteId=104662, tier=free, daysBack=90, limit=100
```

### Tier Enforcement Logs
```
# Successful request within limits
[API Activities] Fetched 25 activities from Strava (1 pages)

# Rejected request exceeding limits
# (No fetch log - rejected before Strava API call)
```

## iOS App Testing

### Test in VeloReady iOS App

1. **FREE User Testing:**
   - Open Performance tab
   - Try to view data older than 90 days
   - Should see upgrade prompt

2. **PRO User Testing:**
   - Open Performance tab
   - Should be able to view up to 365 days
   - No restrictions

3. **Check Debug Logs:**
```
✅ [API] Fetched activities: tier=free, daysBack=90
❌ [API] Tier limit exceeded: requested 365 days, max 90 days
```

## Database Verification

### Check User Subscription in Supabase

```sql
-- View user subscription
SELECT 
  user_id,
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

### Update Subscription Tier for Testing

```sql
-- Set to FREE tier
UPDATE user_subscriptions
SET subscription_tier = 'free'
WHERE user_id = 'YOUR_USER_ID';

-- Set to PRO tier with future expiry
UPDATE user_subscriptions
SET 
  subscription_tier = 'pro',
  expires_at = NOW() + INTERVAL '30 days'
WHERE user_id = 'YOUR_USER_ID';

-- Set to expired PRO tier
UPDATE user_subscriptions
SET 
  subscription_tier = 'pro',
  expires_at = NOW() - INTERVAL '1 day'
WHERE user_id = 'YOUR_USER_ID';
```

## Expected Behavior Summary

### ✅ Successful Requests
- Return 200 OK
- Include `metadata.tier` in response
- Include `metadata.daysBack` (capped to tier limit)
- Include `metadata.limit` (capped to tier limit)

### ❌ Rejected Requests
- Return 403 Forbidden
- Include error code: `TIER_LIMIT_EXCEEDED`
- Include upgrade message
- Include current tier and limits
- Include requested vs. allowed values

## Troubleshooting

### Issue: All requests return 401
**Cause:** Invalid or expired JWT token
**Solution:** Refresh token via `/auth-refresh-token` endpoint

### Issue: All requests return 403 even for FREE limits
**Cause:** No subscription record in database
**Solution:** Ensure `user_subscriptions` table has entry (defaults to 'free')

### Issue: PRO user getting FREE tier limits
**Cause:** Subscription expired or not properly set
**Solution:** Check `expires_at` date and `subscription_tier` value

### Issue: Tier enforcement not working
**Cause:** Old deployment without tier enforcement code
**Solution:** Redeploy with `netlify deploy --prod`

## Performance Testing

### Verify No Performance Degradation
```bash
# Time requests before and after tier enforcement
time curl -X GET "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should be similar response time (tier check is fast)
```

### Check Cache Headers
```bash
curl -X GET "https://api.veloready.app/api/activities?daysBack=30" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -i | grep -i cache

# Expected: Cache-Control: private, max-age=3600
```

## Monitoring Checklist

- [ ] All automated tests passing
- [ ] FREE user cannot exceed 90 days
- [ ] PRO user can access 365 days
- [ ] Activity limits enforced (100 vs 500)
- [ ] Expired subscriptions downgraded to FREE
- [ ] Error messages are user-friendly
- [ ] Metadata includes tier information
- [ ] Netlify logs show tier information
- [ ] No performance degradation
- [ ] Cache headers still working

## Next Steps After Testing

1. **Monitor Production Logs:** Watch for tier enforcement rejections
2. **Track Metrics:** Count 403 responses by tier
3. **User Feedback:** Monitor upgrade conversion rate
4. **Performance:** Ensure tier checks don't slow down requests
5. **Documentation:** Update API docs with tier limits
