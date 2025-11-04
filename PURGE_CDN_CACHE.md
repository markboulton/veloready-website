# Purge Netlify CDN Cache - Backend 500 Errors

## Problem

Backend API is returning cached 500 errors even though the code is fixed:

```
❌ Response body: {"error":"Failed to parse URL from /pipeline"}
Age: 5-6 seconds (cached response)
cache-status: "Netlify Durable"; fwd=bypass, "Netlify Edge"; fwd=miss
```

**Root Cause:** Netlify CDN is caching the old 500 error responses from before the fix was deployed.

**Code Status:** ✅ Fixed in commits `37a9788e` and `894546ce`

---

## Solution: Purge CDN Cache

### Option 1: Netlify Dashboard (Recommended)

1. Go to https://app.netlify.com/sites/veloready/deploys
2. Click **"Trigger deploy"** dropdown
3. Select **"Clear cache and deploy site"**
4. Wait 2-3 minutes for deployment
5. Test: `curl https://api.veloready.app/api/activities?daysBack=7&limit=50`

### Option 2: Netlify CLI

```bash
# Install Netlify CLI if not already installed
npm install -g netlify-cli

# Login
netlify login

# Clear cache and redeploy
netlify deploy --prod --clear-cache
```

### Option 3: Netlify API

```bash
# Get your Netlify token from: https://app.netlify.com/user/applications
export NETLIFY_TOKEN="your_token_here"

# Trigger deploy with cache clear
curl -X POST "https://api.netlify.com/api/v1/sites/veloready/deploys" \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clear_cache": true}'
```

---

## Verification

### 1. Check Deployment Status

```bash
# Via dashboard
https://app.netlify.com/sites/veloready/deploys

# Via CLI
netlify status
```

### 2. Test API Endpoint

```bash
# Should return 200 with activities data (not 500 error)
curl -i https://api.veloready.app/api/activities?daysBack=7&limit=50 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected:**
```
HTTP/2 200
cache-status: "Netlify Durable"; fwd=miss, "Netlify Edge"; fwd=miss
Age: 0

{"activities": [...]}
```

**NOT:**
```
HTTP/2 500
Age: 5-6
{"error":"Failed to parse URL from /pipeline"}
```

### 3. Test on iOS Device

Launch app and check logs:
```
📡 [VeloReady API] Making request to: .../api/activities?daysBack=7&limit=50
📥 [VeloReady API] Response status: 200  ← Should be 200!
✅ [VeloReady API] Received 182 activities
🔍 Cardio TRIMP: 123.4  ← Should be > 0!
```

---

## Why This Happened

### The Timeline

1. **Oct 28:** Backend deployed with bug (NETLIFY_FUNCTIONS_TOKEN used for Blobs)
2. **Nov 3:** Bug caused 500 errors: "Failed to parse URL from /pipeline"
3. **Nov 4 10:00:** Fixed in commit `37a9788e` - removed bad token
4. **Nov 4 10:30:** Fixed in commit `894546ce` - use pooled DB connection
5. **Nov 4 11:00:** Pushed empty commit `987788f3` to trigger redeploy
6. **Nov 4 12:00:** **CDN still serving cached 500 errors!**

### Why CDN Caching Errors

Netlify CDN caches responses based on:
- URL
- Query parameters
- Response status (including errors!)

The 500 error responses were cached with:
```
Cache-Control: no-cache  ← Doesn't prevent CDN caching!
Age: 5-6  ← Cached for 5-6 seconds
```

**Solution:** Must explicitly clear cache, not just redeploy.

---

## Prevention

### 1. Add Cache-Control Headers for Errors

```typescript
// In error responses
return new Response(JSON.stringify({ error: "..." }), {
  status: 500,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',  // ← Stronger
    'Pragma': 'no-cache',
    'Expires': '0'
  }
});
```

### 2. Use Netlify's Cache Tags

```typescript
// Add cache tags to responses
headers: {
  'Netlify-Cache-Tag': 'api,activities',
  'Cache-Control': 'max-age=3600'
}

// Then purge specific tags via API
curl -X POST "https://api.netlify.com/api/v1/purge" \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  -d '{"cache_tags": ["api"]}'
```

### 3. Monitor Deployment Status

```bash
# Check if deployment succeeded
netlify status

# View recent deploys
netlify deploys:list
```

---

## Related Issues

### Backend Fixes (Already Deployed)

1. **URL Parsing Error** (commit `37a9788e`)
   - Removed `NETLIFY_FUNCTIONS_TOKEN` from Blobs initialization
   - Use `NETLIFY_BLOBS_TOKEN` or `NETLIFY_TOKEN` instead

2. **Authentication Error** (commit `894546ce`)
   - Changed `auth.ts` to use `db-pooled` instead of `db`
   - Fixes database connection issues in serverless environment

### iOS Fixes (Commit `81f0e24`)

1. **CacheManager not calculating baselines**
   - Now uses `BaselineCalculator` to calculate HRV/RHR/Sleep baselines
   - Fixes "Calculating baseline..." showing on all rows

2. **CacheManager not using TrainingLoadCalculator**
   - Now calculates CTL/ATL/TSB from HealthKit when Intervals unavailable
   - Fixes TSB/Target TSS showing 0.0

---

## Summary

| Issue | Status | Action Required |
|-------|--------|-----------------|
| **Backend code** | ✅ Fixed | None - deployed |
| **CDN cache** | ❌ Stale | **Purge cache** |
| **iOS code** | ✅ Fixed | Test on device |

**Next Step:** Purge Netlify CDN cache using Option 1 (Dashboard) above.

**After purging:** Test iOS app - all data should display correctly! 🚀
