# Netlify Cache Control - Quick Reference Guide

## Problem We Solved

Netlify CDN was caching error responses even with `Cache-Control: no-cache` headers, causing users to see stale errors after backend fixes were deployed.

## Solution Architecture

```
┌─────────────────────────────────────────────────────┐
│  User Request → /api/activities                      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Netlify Edge CDN                                    │
│  ✓ Reads netlify.toml headers                       │
│  ✓ Applies CDN-Cache-Control: no-store              │
│  ✓ Result: fwd=bypass                               │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Netlify Function Execution                          │
│  ✓ Adds getNoCacheHeaders()                         │
│  ✓ Adds timestamp to response                       │
│  ✓ Returns fresh content                            │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  User receives fresh response                        │
│  ✗ No Age header                                     │
│  ✓ Unique timestamp                                  │
│  ✓ cache-status: fwd=bypass                         │
└─────────────────────────────────────────────────────┘
```

## Essential Headers (for Copy-Paste)

### In netlify.toml
```toml
[[headers]]
  for = "/api/*"
  [headers.values]
    Cache-Control = "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0"
    CDN-Cache-Control = "no-store"
    Netlify-CDN-Cache-Control = "no-store"
    Pragma = "no-cache"
    Expires = "0"
```

### In TypeScript Functions
```typescript
function getNoCacheHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'CDN-Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store',
    'Netlify-Vary': 'query',
  };
}

// Use in error responses:
return {
  statusCode: 500,
  headers: getNoCacheHeaders(),
  body: JSON.stringify({
    error: "Failed to fetch data",
    message: error.message,
    timestamp: Date.now() // CRITICAL: Cache buster
  })
};
```

## Quick Verification

```bash
# Test endpoint
curl -I https://veloready.app/api/activities

# Look for these indicators:
✓ cache-status: "Netlify Durable"; fwd=bypass
✓ cache-control: no-store
✗ Age: (should NOT be present)

# Test multiple times - timestamp should change each time
curl -s https://veloready.app/api/activities | grep timestamp
```

## When to Use Cache Purge Script

```bash
# After deploying critical fixes
cd /Users/markboulton/Dev/veloready-website
./scripts/purge-netlify-cache.sh

# Or trigger via Netlify CLI
netlify deploy --prod --build
```

## Common Issues & Solutions

### Issue: Seeing `Age: X` header on API responses
**Solution:**
1. Check netlify.toml has headers section
2. Redeploy site
3. Run purge script

### Issue: Same timestamp on multiple requests
**Solution:**
1. Verify `timestamp: Date.now()` in error responses
2. Check for upstream caching (browser, proxy)
3. Use `curl -H "Cache-Control: no-cache"` to bypass client cache

### Issue: Cache persists after deployment
**Solution:**
```bash
# Nuclear option - purge everything
./scripts/purge-netlify-cache.sh

# Or go to Netlify dashboard:
# Deploys → Trigger deploy → Clear cache and deploy site
```

## Best Practices for New Endpoints

When creating new API endpoints:

1. **Add to netlify.toml headers:**
   ```toml
   [[headers]]
     for = "/api/new-endpoint"
     [headers.values]
       Cache-Control = "no-store, no-cache, must-revalidate"
   ```

2. **Use getNoCacheHeaders() for errors:**
   ```typescript
   import { getNoCacheHeaders } from '../lib/cache-headers'; // Create this

   return {
     statusCode: 500,
     headers: getNoCacheHeaders(),
     body: JSON.stringify({ error: "...", timestamp: Date.now() })
   };
   ```

3. **Test before production:**
   ```bash
   netlify dev  # Test locally
   curl -I http://localhost:8888/api/new-endpoint
   ```

## Header Precedence

Netlify respects headers in this order (highest to lowest):

1. **netlify.toml `[[headers]]`** ← We use this
2. `Netlify-CDN-Cache-Control` header ← We use this
3. `CDN-Cache-Control` header ← We use this
4. `Cache-Control` header ← We use this
5. Netlify default rules

By using all 4, we maximize compatibility.

## Monitoring

Add to your monitoring:

```bash
# Check for unexpected caching
curl -I https://veloready.app/api/activities | \
  grep -E "(Age|cache-status)" | \
  grep -v "fwd=bypass" && \
  echo "WARNING: Cache bypass not working!" || \
  echo "OK: Cache bypass working"
```

## Emergency Rollback

If cache issues reoccur:

1. **Immediate:**
   ```bash
   ./scripts/purge-netlify-cache.sh
   ```

2. **If that fails:**
   - Go to Netlify dashboard
   - Deploys → Options → Clear cache and retry deploy

3. **Last resort:**
   ```bash
   # Revert commit
   git revert c49dedbf
   git push origin main
   ```

## Files Modified in This Fix

- `netlify.toml` - Added cache control headers
- `netlify/functions/api-activities.ts` - Added getNoCacheHeaders()
- `netlify/functions/api-streams.ts` - Added getNoCacheHeaders()
- `scripts/purge-netlify-cache.sh` - Cache purge automation

## Key Takeaways

1. **netlify.toml headers matter most** - They control CDN behavior before function execution
2. **Netlify-specific headers exist** - Use `CDN-Cache-Control` and `Netlify-CDN-Cache-Control`
3. **Cache busting is essential** - Always add unique values (timestamps) to error responses
4. **Deployment = cache refresh** - Each deploy naturally purges cache
5. **Test cache behavior** - Use `curl -I` and check for `fwd=bypass`

## More Information

Full details: See `CACHE_FIX_SUMMARY.md` in repo root
Netlify docs: https://docs.netlify.com/routing/headers/
Support: Site ID `f434092e-0965-40f9-b3ef-87f1ff0a0378`

---

**Last Updated:** 2025-11-04
**Status:** Active and verified working
