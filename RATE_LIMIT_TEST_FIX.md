# Rate Limit Test Fixes - Nov 7, 2025

## Problem

3 unit tests were failing in `tests/unit/rate-limit.test.ts`:

1. **"should set TTL on first request"** - Expected 2 calls, got 4
2. **"should not set TTL on subsequent requests"** - Expected 0 calls, got 2
3. **"should use correct Strava rate limit key patterns"** - Expected 2 calls, got 4

**Error:**
```
AssertionError: expected "vi.fn()" to be called 2 times, but got 4 times
```

---

## Root Cause

The `trackStravaCall` implementation tracks **both per-athlete AND aggregate/total** rate limits for monitoring purposes:

```typescript
// netlify/lib/rate-limit.ts lines 61-99

export async function trackStravaCall(athleteId: string): Promise<boolean> {
  // 1. Per-athlete 15-minute tracking
  const fifteenMinKey = `rate_limit:strava:${athleteId}:15min:${window}`;
  await redis.incr(fifteenMinKey);  // Call #1
  
  // 2. Per-athlete daily tracking
  const dailyKey = `rate_limit:strava:${athleteId}:daily:${window}`;
  await redis.incr(dailyKey);  // Call #2
  
  // 3. Total/aggregate 15-minute tracking (for monitoring dashboard)
  const totalFifteenMinKey = `rate_limit:strava:total:15min:${window}`;
  await redis.incr(totalFifteenMinKey);  // Call #3
  await redis.expire(totalFifteenMinKey, 900);  // ALWAYS called
  
  // 4. Total/aggregate daily tracking (for monitoring dashboard)
  const totalDailyKey = `rate_limit:strava:total:daily:${window}`;
  await redis.incr(totalDailyKey);  // Call #4
  await redis.expire(totalDailyKey, 86400);  // ALWAYS called
  
  return (fifteenMinCount <= 100) && (dailyCount <= 1000);
}
```

**Key insight:** The aggregate/total tracking (calls #3 and #4) **always calls `expire`**, not just when count === 1.

---

## The Fix

Updated tests to expect **4 `incr` calls** and adjusted `expire` expectations:

### 1. "should set TTL on first request"
**Before:**
```typescript
mockIncr
  .mockResolvedValueOnce(1)  // Only 2 calls mocked
  .mockResolvedValueOnce(1);
  
expect(mockExpire).toHaveBeenCalledTimes(2); // Expected only 2
```

**After:**
```typescript
mockIncr
  .mockResolvedValueOnce(1)  // Per-athlete 15min
  .mockResolvedValueOnce(1)  // Per-athlete daily
  .mockResolvedValueOnce(1)  // Total 15min
  .mockResolvedValueOnce(1); // Total daily

expect(mockExpire).toHaveBeenCalledTimes(4); // All 4 windows
expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/athlete1:15min/), 900);
expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/total:15min/), 900);
// ... etc
```

---

### 2. "should not set TTL on subsequent requests"
**Before:**
```typescript
mockIncr
  .mockResolvedValueOnce(5)  // Only 2 calls mocked
  .mockResolvedValueOnce(50);
  
expect(mockExpire).not.toHaveBeenCalled(); // WRONG
```

**After:**
```typescript
mockIncr
  .mockResolvedValueOnce(5)   // Per-athlete 15min (count > 1, no expire)
  .mockResolvedValueOnce(50)  // Per-athlete daily (count > 1, no expire)
  .mockResolvedValueOnce(100) // Total 15min (expire ALWAYS called)
  .mockResolvedValueOnce(500); // Total daily (expire ALWAYS called)

// Total keys ALWAYS call expire, even on subsequent requests
expect(mockExpire).toHaveBeenCalledTimes(2);
expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/total:15min/), 900);
expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/total:daily/), 86400);
```

**Renamed test:** "should not set TTL on subsequent requests (per-athlete)" to clarify it's about per-athlete keys only.

---

### 3. "should use correct Strava rate limit key patterns"
**Before:**
```typescript
mockIncr
  .mockResolvedValueOnce(1)  // Only 2 calls mocked
  .mockResolvedValueOnce(1);
  
expect(mockIncr).toHaveBeenCalledTimes(2); // Expected only 2
```

**After:**
```typescript
mockIncr
  .mockResolvedValueOnce(1)  // Per-athlete 15min
  .mockResolvedValueOnce(1)  // Per-athlete daily
  .mockResolvedValueOnce(1)  // Total 15min
  .mockResolvedValueOnce(1); // Total daily

expect(mockIncr).toHaveBeenCalledTimes(4);

// Verify per-athlete keys
expect(mockIncr.mock.calls[0][0]).toMatch(/^rate_limit:strava:athlete456:15min:\d+$/);
expect(mockIncr.mock.calls[1][0]).toMatch(/^rate_limit:strava:athlete456:daily:\d+$/);

// Verify total keys
expect(mockIncr.mock.calls[2][0]).toMatch(/^rate_limit:strava:total:15min:\d+$/);
expect(mockIncr.mock.calls[3][0]).toMatch(/^rate_limit:strava:total:daily:\d+$/);
```

---

### 4. Other `trackStravaCall` tests

Also fixed 3 other tests that call `trackStravaCall`:
- "should allow calls within Strava limits" - Added 2 more mock values
- "should block calls exceeding 15-minute limit" - Added 2 more mock values
- "should block calls exceeding daily limit" - Added 2 more mock values

---

## Why Aggregate Tracking?

The total/aggregate keys serve a monitoring purpose:
- Track **system-wide** Strava API usage across all athletes
- Useful for dashboard/observability
- Helps ensure VeloReady stays within Strava's global limits

**Per-athlete keys:** Prevent individual athletes from hitting limits  
**Total keys:** Monitor system-wide usage for ops/monitoring

---

## Test Results

**Before:** 3/23 tests failing  
**After:** 23/23 tests passing ✅

```bash
npm run test:unit tests/unit/rate-limit.test.ts

✓ tests/unit/rate-limit.test.ts (12 tests) 8ms
  ✓ Rate Limiting (12)
    ✓ should allow requests within limit
    ✓ should block requests exceeding limit
    ✓ should have higher limits for pro tier
    ✓ should calculate correct reset time
    ✓ should use different keys for different endpoints
    ✓ should allow calls within Strava limits
    ✓ should block calls exceeding 15-minute limit
    ✓ should block calls exceeding daily limit
    ✓ should set TTL on first request
    ✓ should not set TTL on subsequent requests (per-athlete)
    ✓ should use correct key patterns
    ✓ should use correct Strava rate limit key patterns

Test Files  2 passed (2)
     Tests  23 passed (23)
```

---

## Files Modified

**Tests:**
- `tests/unit/rate-limit.test.ts` - Fixed 6 tests to account for 4 incr calls

**Implementation:**
- `netlify/lib/rate-limit.ts` - No changes (implementation was correct)

---

## Key Learnings

1. **Test assumptions vs implementation:** Tests assumed 2 calls but implementation makes 4
2. **Aggregate tracking pattern:** Common to track both per-entity and total metrics
3. **Expire behavior:** Total keys always call `expire`, per-entity keys only call it when count === 1
4. **Mock all the things:** When implementation makes N calls, mock N return values

---

## Next Steps

✅ All tests passing  
✅ CI/CD will now pass on GitHub Actions  
✅ No implementation changes needed  

**Status:** RESOLVED - Tests now correctly reflect implementation behavior
