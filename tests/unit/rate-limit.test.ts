import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';

// Mock @upstash/redis module with factory
vi.mock('@upstash/redis', () => {
  const mockIncr = vi.fn().mockResolvedValue(1);
  const mockExpire = vi.fn().mockResolvedValue(true);

  return {
    Redis: class MockRedis {
      incr = mockIncr;
      expire = mockExpire;
    },
    __mockIncr: mockIncr,
    __mockExpire: mockExpire,
  };
});

// Import after mocking
import { checkRateLimit, trackStravaCall } from '../../netlify/lib/rate-limit';
import * as upstashRedis from '@upstash/redis';

// Get mock functions from module
const mockIncr = (upstashRedis as any).__mockIncr;
const mockExpire = (upstashRedis as any).__mockExpire;

// Mock auth module
vi.mock('../../netlify/lib/auth', () => ({
  getTierLimits: vi.fn((tier: string) => {
    const limits = {
      free: { rateLimitPerHour: 100 },
      trial: { rateLimitPerHour: 300 },
      pro: { rateLimitPerHour: 300 },
    };
    return limits[tier as keyof typeof limits] || limits.free;
  }),
}));

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock values
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(true);
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const result = await checkRateLimit('user1', 'athlete1', 'free', 'api-activities');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('should block requests exceeding limit', async () => {
      // Mock 101st request for FREE tier (100/hour limit)
      mockIncr.mockResolvedValue(101);

      const result = await checkRateLimit('user1', 'athlete1', 'free', 'api-activities');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should have higher limits for pro tier', async () => {
      // Mock 200th request for PRO tier (300/hour limit)
      mockIncr.mockResolvedValue(200);

      const result = await checkRateLimit('user1', 'athlete1', 'pro', 'api-activities');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100); // 300 - 200 = 100
    });

    it('should calculate correct reset time', async () => {
      const now = Date.now();
      const result = await checkRateLimit('user1', 'athlete1', 'free', 'api-activities');

      // Reset should be at the next hour boundary
      const expectedWindow = Math.floor(now / 3600000);
      const expectedReset = (expectedWindow + 1) * 3600000;

      expect(result.resetAt).toBe(expectedReset);
    });

    it('should use different keys for different endpoints', async () => {
      await checkRateLimit('user1', 'athlete1', 'free', 'api-activities');
      await checkRateLimit('user1', 'athlete1', 'free', 'api-streams');

      // Should be called twice with different keys
      expect(mockIncr).toHaveBeenCalledTimes(2);
      const calls = mockIncr.mock.calls;
      expect(calls[0][0]).toContain('api-activities');
      expect(calls[1][0]).toContain('api-streams');
    });
  });

  describe('trackStravaCall', () => {
    it('should allow calls within Strava limits', async () => {
      mockIncr
        .mockResolvedValueOnce(1)   // Per-athlete 15-minute counter
        .mockResolvedValueOnce(1)   // Per-athlete daily counter
        .mockResolvedValueOnce(1)   // Total 15-minute counter
        .mockResolvedValueOnce(1);  // Total daily counter

      const allowed = await trackStravaCall('athlete1');
      expect(allowed).toBe(true);
    });

    it('should block calls exceeding 15-minute limit', async () => {
      mockIncr
        .mockResolvedValueOnce(101)  // Per-athlete 15-minute counter (exceeds 100 limit)
        .mockResolvedValueOnce(50)   // Per-athlete daily counter (within 1000 limit)
        .mockResolvedValueOnce(101)  // Total 15-minute counter
        .mockResolvedValueOnce(50);  // Total daily counter

      const allowed = await trackStravaCall('athlete1');
      expect(allowed).toBe(false);
    });

    it('should block calls exceeding daily limit', async () => {
      mockIncr
        .mockResolvedValueOnce(50)    // Per-athlete 15-minute counter (within 100 limit)
        .mockResolvedValueOnce(1001)  // Per-athlete daily counter (exceeds 1000 limit)
        .mockResolvedValueOnce(50)    // Total 15-minute counter
        .mockResolvedValueOnce(1001); // Total daily counter

      const allowed = await trackStravaCall('athlete1');
      expect(allowed).toBe(false);
    });

    it('should set TTL on first request', async () => {
      mockIncr
        .mockResolvedValueOnce(1)  // First request in 15-min window (per-athlete)
        .mockResolvedValueOnce(1)  // First request in daily window (per-athlete)
        .mockResolvedValueOnce(1)  // First request in 15-min window (total)
        .mockResolvedValueOnce(1); // First request in daily window (total)

      await trackStravaCall('athlete1');

      // Should set TTL for all 4 windows (per-athlete + total)
      expect(mockExpire).toHaveBeenCalledTimes(4);
      expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/athlete1:15min/), 900);   // Per-athlete 15 min
      expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/athlete1:daily/), 86400); // Per-athlete daily
      expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/total:15min/), 900);      // Total 15 min
      expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/total:daily/), 86400);    // Total daily
    });

    it('should not set TTL on subsequent requests (per-athlete)', async () => {
      mockIncr
        .mockResolvedValueOnce(5)   // Not first request (per-athlete 15min)
        .mockResolvedValueOnce(50)  // Not first request (per-athlete daily)
        .mockResolvedValueOnce(100) // Total 15min (always tracked)
        .mockResolvedValueOnce(500); // Total daily (always tracked)

      await trackStravaCall('athlete1');

      // Should set TTL for total keys (always called) but not per-athlete keys
      expect(mockExpire).toHaveBeenCalledTimes(2);
      expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/total:15min/), 900);
      expect(mockExpire).toHaveBeenCalledWith(expect.stringMatching(/total:daily/), 86400);
    });
  });

  describe('Integration - Rate Limit Keys', () => {
    it('should use correct key patterns', async () => {
      await checkRateLimit('user1', 'athlete123', 'free', 'api-activities');

      expect(mockIncr).toHaveBeenCalledTimes(1);
      const key = mockIncr.mock.calls[0][0];

      // Key should follow pattern: rate_limit:{athleteId}:{endpoint}:{window}
      expect(key).toMatch(/^rate_limit:athlete123:api-activities:\d+$/);
    });

    it('should use correct Strava rate limit key patterns', async () => {
      mockIncr
        .mockResolvedValueOnce(1)  // Per-athlete 15min
        .mockResolvedValueOnce(1)  // Per-athlete daily
        .mockResolvedValueOnce(1)  // Total 15min
        .mockResolvedValueOnce(1); // Total daily

      await trackStravaCall('athlete456');

      expect(mockIncr).toHaveBeenCalledTimes(4);

      const athleteFifteenMinKey = mockIncr.mock.calls[0][0];
      const athleteDailyKey = mockIncr.mock.calls[1][0];
      const totalFifteenMinKey = mockIncr.mock.calls[2][0];
      const totalDailyKey = mockIncr.mock.calls[3][0];

      // Per-athlete keys should include athlete ID
      expect(athleteFifteenMinKey).toMatch(/^rate_limit:strava:athlete456:15min:\d+$/);
      expect(athleteDailyKey).toMatch(/^rate_limit:strava:athlete456:daily:\d+$/);
      
      // Total keys should use 'total' instead of athlete ID
      expect(totalFifteenMinKey).toMatch(/^rate_limit:strava:total:15min:\d+$/);
      expect(totalDailyKey).toMatch(/^rate_limit:strava:total:daily:\d+$/);
    });
  });
});
