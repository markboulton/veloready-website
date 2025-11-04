import { Redis } from '@upstash/redis';
import { getTierLimits } from './auth';
import { ENV } from './env';

// Initialize Redis client using centralized ENV config
// Supports both REDIS_URL/REDIS_TOKEN and UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN
const redis = new Redis({
  url: ENV.REDIS_URL,
  token: ENV.REDIS_TOKEN,
});

/**
 * Check if a request is within rate limits for the user's tier
 * @param userId - User ID
 * @param athleteId - Athlete ID (for Strava/Intervals.icu)
 * @param tier - Subscription tier (free, trial, pro)
 * @param endpoint - API endpoint name
 * @returns Rate limit status
 */
export async function checkRateLimit(
  userId: string,
  athleteId: string,
  tier: string,
  endpoint: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  // Calculate hourly window timestamp
  const window = Math.floor(Date.now() / 3600000); // Hour in milliseconds

  // Create Redis key for this user/endpoint/window
  const key = `rate_limit:${athleteId}:${endpoint}:${window}`;

  // Increment counter atomically
  const count = await redis.incr(key);

  // Set expiry to 1 hour on first request
  if (count === 1) {
    await redis.expire(key, 3600); // 3600 seconds = 1 hour
  }

  // Get tier limits for this endpoint
  const limits = getTierLimits(tier as any);
  const maxRequests = limits.rateLimitPerHour || 60; // Default 60/hour if not specified

  // Calculate remaining requests and reset time
  const remaining = Math.max(0, maxRequests - count);
  const resetAt = (window + 1) * 3600000; // Next hour boundary

  return {
    allowed: count <= maxRequests,
    remaining,
    resetAt,
  };
}

/**
 * Track Strava API calls to avoid hitting their rate limits
 * Strava limits: 100 requests per 15 minutes, 1000 requests per day
 * @param athleteId - Athlete ID
 * @returns Whether the call is allowed
 */
export async function trackStravaCall(athleteId: string): Promise<boolean> {
  const now = Date.now();

  // Track 15-minute window (100 req limit)
  const fifteenMinWindow = Math.floor(now / 900000); // 15 min in ms
  const fifteenMinKey = `rate_limit:strava:${athleteId}:15min:${fifteenMinWindow}`;

  const fifteenMinCount = await redis.incr(fifteenMinKey);
  if (fifteenMinCount === 1) {
    await redis.expire(fifteenMinKey, 900); // 15 minutes
  }

  // Track daily window (1000 req limit)
  const dailyWindow = Math.floor(now / 86400000); // Day in ms
  const dailyKey = `rate_limit:strava:${athleteId}:daily:${dailyWindow}`;

  const dailyCount = await redis.incr(dailyKey);
  if (dailyCount === 1) {
    await redis.expire(dailyKey, 86400); // 24 hours
  }

  // Check both limits
  const fifteenMinAllowed = fifteenMinCount <= 100;
  const dailyAllowed = dailyCount <= 1000;

  console.log(`[Strava Rate Limit] athleteId=${athleteId}, 15min=${fifteenMinCount}/100, daily=${dailyCount}/1000`);

  return fifteenMinAllowed && dailyAllowed;
}
