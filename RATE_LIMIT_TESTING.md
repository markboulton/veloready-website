# Rate Limiting Testing Guide

## Overview

Backend API endpoints now enforce tier-based rate limiting with proper HTTP headers:

- **Free tier**: 100 requests/hour
- **Trial tier**: 300 requests/hour
- **Pro tier**: 300 requests/hour

## Implementation Details

### Endpoints with Rate Limiting

1. **`/api/activities`** - Activity list endpoint
2. **`/api/streams/:activityId`** - Stream data endpoint

### Rate Limit Headers

All responses include:
- `X-RateLimit-Limit`: Maximum requests allowed per hour for the user's tier
- `X-RateLimit-Remaining`: Number of requests remaining in current window
- `X-RateLimit-Reset`: Timestamp (milliseconds) when the rate limit window resets

### 429 Response Format

When rate limit exceeded:
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Your free plan allows 100 requests per hour. Try again in 45 minutes.",
  "resetAt": 1699123456789,
  "tier": "free",
  "timestamp": 1699120856789
}
```

Additional header:
- `Retry-After`: Seconds until rate limit resets

## Testing with the Script

### Prerequisites

1. Valid Supabase authentication token
2. Access to production or staging environment
3. Redis instance must be configured (Upstash)

### Getting an Auth Token

#### Option 1: From Browser DevTools
1. Log into VeloReady app at https://veloready.app
2. Open DevTools → Network tab
3. Find any API request
4. Copy the `Authorization: Bearer <token>` value

#### Option 2: From Supabase Dashboard
1. Go to Supabase Authentication
2. Find your user
3. Copy the JWT token

### Running the Test

```bash
# Test activities endpoint (default)
node test-rate-limit.js /api/activities <your-token>

# Test streams endpoint
node test-rate-limit.js /api/streams/12345678 <your-token>

# Use environment variable for token
export AUTH_TOKEN=<your-token>
node test-rate-limit.js /api/activities

# Test against staging
TEST_URL=https://staging.veloready.app node test-rate-limit.js /api/activities <your-token>
```

### Expected Results

For a **free tier** user (100 req/hour):
- First ~100 requests should return `200 OK` with rate limit headers
- Subsequent requests should return `429 Too Many Requests`
- All responses should include proper rate limit headers

Example output:
```
[10/100] 6.2s elapsed | Avg: 245ms | ✅ 10 | ⛔ 0 | ❌ 0
[20/100] 12.5s elapsed | Avg: 238ms | ✅ 20 | ⛔ 0 | ❌ 0
...
[100/100] 60.1s elapsed | Avg: 256ms | ✅ 99 | ⛔ 1 | ❌ 0

⛔ RATE LIMIT HIT!
Headers: {
  "x-ratelimit-limit": "100",
  "x-ratelimit-remaining": "0",
  "x-ratelimit-reset": "1699123456789",
  "retry-after": "2700"
}
```

## Testing Tier Overrides

Developer accounts (athlete ID 104662) can override tier for testing:

```bash
# Test with free tier limits
curl -H "Authorization: Bearer <token>" \
     -H "X-Debug-Override-Tier: free" \
     https://veloready.app/api/activities

# Test with pro tier limits
curl -H "Authorization: Bearer <token>" \
     -H "X-Debug-Override-Tier: pro" \
     https://veloready.app/api/activities
```

## Manual Testing with cURL

### Basic Request
```bash
curl -i -H "Authorization: Bearer <token>" \
  https://veloready.app/api/activities
```

### Check Rate Limit Headers
```bash
# Make request and extract headers
curl -i -H "Authorization: Bearer <token>" \
  https://veloready.app/api/activities \
  2>&1 | grep -i "x-ratelimit"

# Expected output:
# x-ratelimit-limit: 100
# x-ratelimit-remaining: 99
# x-ratelimit-reset: 1699123456789
```

### Trigger Rate Limit
```bash
# Hammer endpoint rapidly
for i in {1..150}; do
  echo "Request $i:"
  curl -s -o /dev/null -w "HTTP %{http_code} | Time: %{time_total}s\n" \
    -H "Authorization: Bearer <token>" \
    https://veloready.app/api/activities
  sleep 0.1
done
```

## Monitoring

### Check Redis Keys

```bash
# Connect to Upstash Redis
redis-cli -u $REDIS_URL

# View rate limit keys
KEYS rate_limit:*

# Check specific user's rate limit
GET rate_limit:<athlete_id>:api-activities:<window>

# Example: Check athlete 104662 for current hour window
GET rate_limit:104662:api-activities:492540
```

### View Netlify Function Logs

```bash
# Tail function logs
netlify functions:log api-activities --live

# Look for rate limit messages:
# [API Activities] Request: athleteId=104662, tier=free, daysBack=30, limit=50
```

## Troubleshooting

### Rate Limits Not Working

1. **Check Redis connection**:
   - Verify `REDIS_URL` and `REDIS_TOKEN` environment variables
   - Test connection: `redis-cli -u $REDIS_URL ping` → should return `PONG`

2. **Check environment variables**:
   ```bash
   netlify env:list
   # Should show: REDIS_URL, REDIS_TOKEN (or UPSTASH_* variants)
   ```

3. **Deploy latest changes**:
   ```bash
   netlify deploy --prod
   ```

### Getting Inconsistent Results

- Rate limits are per-hour windows based on Unix timestamp
- Window resets at the top of each hour
- Redis keys expire after 1 hour (3600 seconds)
- If testing near hour boundary, results may vary

### 401 Unauthorized Errors

- Token may have expired (Supabase tokens expire after 1 hour)
- Get a fresh token from browser DevTools
- Check token format: must be `Bearer <jwt-token>`

## Code References

- Rate limit implementation: `/Users/markboulton/Dev/veloready-website/netlify/lib/rate-limit.ts`
- Activities endpoint: `/Users/markboulton/Dev/veloready-website/netlify/functions/api-activities.ts:70-96`
- Streams endpoint: `/Users/markboulton/Dev/veloready-website/netlify/functions/api-streams.ts:73-100`
- Tier configuration: `/Users/markboulton/Dev/veloready-website/netlify/lib/auth.ts:16-38`

## Next Steps

After validating rate limiting works correctly:

1. Monitor Redis memory usage in Upstash dashboard
2. Set up alerts for high rate limit hit rates
3. Consider implementing gradual backoff for clients
4. Add rate limit metrics to observability dashboard
