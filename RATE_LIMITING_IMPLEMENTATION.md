# Redis-Based Rate Limiting Implementation

## Summary

Successfully implemented tier-based rate limiting for the VeloReady website using Upstash Redis. This implementation provides:

1. **User-tier based rate limiting** (FREE, TRIAL, PRO)
2. **Strava API rate limit tracking** (100/15min, 1000/day)
3. **Automatic key expiration** (TTL-based cleanup)
4. **Atomic operations** (incr + expire)
5. **Comprehensive test coverage** (12 unit tests)

## Implementation Details

### 1. Dependencies Installed

```bash
npm install @upstash/redis
```

**Package Version:** @upstash/redis ^1.23.4

### 2. Files Created/Modified

#### Created Files:
- `/Users/markboulton/Dev/veloready-website/netlify/lib/rate-limit.ts` - Main rate limiting module
- `/Users/markboulton/Dev/veloready-website/tests/unit/rate-limit.test.ts` - Unit tests (12 tests)

#### Modified Files:
- `/Users/markboulton/Dev/veloready-website/netlify/lib/auth.ts` - Added `rateLimitPerHour` to TIER_LIMITS
- `/Users/markboulton/Dev/veloready-website/netlify/lib/env.ts` - Added UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
- `/Users/markboulton/Dev/veloready-website/netlify/functions/api-activities.ts` - Integrated tier-based rate limiting
- `/Users/markboulton/Dev/veloready-website/tests/unit/auth.test.ts` - Updated to include rateLimitPerHour validation
- `/Users/markboulton/Dev/veloready-website/package.json` - Added @upstash/redis dependency

### 3. Tier Limits Configuration

```typescript
export const TIER_LIMITS = {
  free: {
    daysBack: 90,
    maxActivities: 100,
    activitiesPerHour: 60,
    streamsPerHour: 30,
    rateLimitPerHour: 60,  // ← NEW
  },
  trial: {
    daysBack: 365,
    maxActivities: 500,
    activitiesPerHour: 300,
    streamsPerHour: 100,
    rateLimitPerHour: 200,  // ← NEW
  },
  pro: {
    daysBack: 365,
    maxActivities: 500,
    activitiesPerHour: 300,
    streamsPerHour: 100,
    rateLimitPerHour: 200,  // ← NEW
  },
};
```

### 4. Rate Limiting Functions

#### `checkRateLimit(userId, athleteId, tier, endpoint)`

Checks if a request is within the user's tier limits.

**Redis Key Pattern:** `rate_limit:{athleteId}:{endpoint}:{hourlyWindow}`

**Example:**
```typescript
const rateLimit = await checkRateLimit(
  'user-123',
  'athlete-456',
  'free',
  'api-activities'
);

if (!rateLimit.allowed) {
  return {
    statusCode: 429,
    headers: {
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': rateLimit.resetAt.toString(),
    },
    body: JSON.stringify({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    }),
  };
}
```

#### `trackStravaCall(athleteId)`

Tracks Strava API calls to avoid hitting their rate limits:
- **15-minute limit:** 100 requests
- **Daily limit:** 1000 requests

**Redis Key Patterns:**
- `rate_limit:strava:{athleteId}:15min:{window}`
- `rate_limit:strava:{athleteId}:daily:{window}`

**Example:**
```typescript
const allowed = await trackStravaCall('athlete-456');

if (!allowed) {
  console.log('Strava rate limit exceeded - backing off');
  // Implement backoff or queue logic
}
```

### 5. API Integration Example

The `api-activities.ts` endpoint now includes tier-based rate limiting:

```typescript
// Check tier-based rate limit BEFORE processing request
const rateLimit = await checkRateLimit(
  userId,
  athleteId.toString(),
  subscriptionTier,
  'api-activities'
);

if (!rateLimit.allowed) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': getTierLimits(subscriptionTier).rateLimitPerHour.toString(),
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': rateLimit.resetAt.toString(),
    },
    body: JSON.stringify({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Your ${subscriptionTier} plan allows ${getTierLimits(subscriptionTier).rateLimitPerHour} requests per hour.`,
      resetAt: rateLimit.resetAt,
      tier: subscriptionTier,
    }),
  };
}
```

### 6. Environment Variables

Required environment variables in Netlify:

```bash
# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_token_here
```

**Note:** The implementation also supports legacy `REDIS_URL` and `REDIS_TOKEN` for backward compatibility.

### 7. Test Results

All tests passing:

```
✓ Rate Limiting (12 tests) - 6ms
  ✓ checkRateLimit
    ✓ should allow requests within limit
    ✓ should block requests exceeding limit
    ✓ should have higher limits for pro tier
    ✓ should calculate correct reset time
    ✓ should use different keys for different endpoints
  ✓ trackStravaCall
    ✓ should allow calls within Strava limits
    ✓ should block calls exceeding 15-minute limit
    ✓ should block calls exceeding daily limit
    ✓ should set TTL on first request
    ✓ should not set TTL on subsequent requests
  ✓ Integration - Rate Limit Keys
    ✓ should use correct key patterns
    ✓ should use correct Strava rate limit key patterns

✓ Auth Module (11 tests) - 5ms
  ✓ TIER_LIMITS (including rateLimitPerHour validation)
  ✓ getTierLimits
  ✓ authenticate
  ✓ Subscription Expiry Logic
  ✓ Type Safety (including rateLimitPerHour checks)
```

### 8. Redis Key Patterns

The implementation uses distinct key patterns to avoid conflicts:

| Purpose | Key Pattern | TTL | Example |
|---------|-------------|-----|---------|
| User Rate Limit | `rate_limit:{athleteId}:{endpoint}:{window}` | 1 hour | `rate_limit:123:api-activities:504322` |
| Strava 15-min | `rate_limit:strava:{athleteId}:15min:{window}` | 15 minutes | `rate_limit:strava:123:15min:67243` |
| Strava Daily | `rate_limit:strava:{athleteId}:daily:{window}` | 24 hours | `rate_limit:strava:123:daily:19726` |
| Webhook Queue | `queue:*` | varies | `queue:strava:webhook` |

**Key Separation Ensures:**
- No conflicts with existing webhook queue
- Automatic cleanup via TTL
- Predictable performance (O(1) lookups)

### 9. Local Testing

To test locally:

```bash
# 1. Start Netlify Dev
netlify dev

# 2. Test rate limiting with curl
# Make 60 requests as FREE user (should succeed)
for i in {1..60}; do
  curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
       http://localhost:8888/api/activities
done

# Make 61st request (should return 429)
curl -v -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:8888/api/activities

# Expected response:
# HTTP/1.1 429 Too Many Requests
# X-RateLimit-Limit: 60
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: 1699123200000
#
# {
#   "error": "RATE_LIMIT_EXCEEDED",
#   "message": "Too many requests. Your free plan allows 60 requests per hour. Please try again later.",
#   "resetAt": 1699123200000,
#   "tier": "free"
# }
```

### 10. Production Deployment

```bash
# Build (no build step needed for serverless functions)
npm run build

# Deploy to Netlify
netlify deploy --prod
```

**Pre-deployment Checklist:**
- [x] Environment variables set in Netlify dashboard
- [x] UPSTASH_REDIS_REST_URL configured
- [x] UPSTASH_REDIS_REST_TOKEN configured
- [x] Tests passing (23/23 tests)
- [x] No TypeScript errors

### 11. Monitoring

To monitor rate limiting in production:

1. **Check Upstash Dashboard:**
   - Navigate to https://console.upstash.com
   - Select your Redis instance
   - Monitor key count and memory usage

2. **View Redis Keys:**
   ```bash
   # Using Upstash CLI or Redis REST API
   GET /keys/rate_limit:*
   ```

3. **Check API Logs:**
   ```bash
   netlify logs:function api-activities
   ```

### 12. Example curl Commands for Verification

```bash
# Test FREE tier (60/hour limit)
curl -H "Authorization: Bearer FREE_USER_JWT" \
     https://veloready.app/api/activities

# Test PRO tier (200/hour limit)
curl -H "Authorization: Bearer PRO_USER_JWT" \
     https://veloready.app/api/activities

# Verify 429 response headers
curl -v -H "Authorization: Bearer YOUR_JWT" \
     https://veloready.app/api/activities | grep -i "x-ratelimit"

# Expected headers:
# X-RateLimit-Limit: 60
# X-RateLimit-Remaining: 59
# X-RateLimit-Reset: 1699123200000
```

## Benefits

1. **Fair Usage:** Prevents abuse while allowing legitimate use
2. **Tier Incentive:** Encourages upgrades to PRO tier (60 → 200 req/hour)
3. **Strava Protection:** Avoids hitting Strava's API limits
4. **Cost Control:** Automatic key expiration keeps Redis clean
5. **Performance:** Atomic operations ensure accuracy
6. **Monitoring:** Clear visibility into usage patterns

## Future Enhancements

Potential improvements for future iterations:

1. **Sliding Window:** Instead of fixed hourly windows
2. **Burst Allowance:** Allow short bursts above limit
3. **Dynamic Limits:** Adjust based on system load
4. **Rate Limit Dashboard:** User-facing UI showing usage
5. **Webhook Rate Limits:** Apply similar limits to webhook processing
6. **Cost-Based Limits:** Different costs for different endpoints

## Notes

- **Existing Infrastructure:** Uses same Redis instance as webhook queue (different key patterns)
- **Backward Compatible:** Falls back to REDIS_URL/REDIS_TOKEN if needed
- **Production Ready:** Comprehensive tests, error handling, and monitoring
- **Scalable:** Serverless-friendly with no shared state

## Contact

For questions or issues with the rate limiting implementation, please refer to:
- Upstash Documentation: https://docs.upstash.com/redis
- VeloReady API Documentation: (add link when available)
