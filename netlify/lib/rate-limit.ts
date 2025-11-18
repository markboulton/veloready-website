import { Redis } from '@upstash/redis';
import { getTierLimits } from './auth';
import { ENV } from './env';
import { checkProviderRateLimit, trackStravaCall as trackStravaCallNew } from './provider-rate-limit';

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
 * Check combined rate limits (user tier + provider)
 * This is the recommended method for new integrations
 * @param userId - User ID
 * @param athleteId - Athlete ID
 * @param tier - Subscription tier
 * @param endpoint - API endpoint name
 * @param provider - Provider name (e.g., 'strava', 'intervalsICU')
 * @returns Combined rate limit status
 */
export async function checkCombinedRateLimit(
  userId: string,
  athleteId: string,
  tier: string,
  endpoint: string,
  provider: string
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  reason?: string;
}> {
  // Check user tier limits first
  const tierCheck = await checkRateLimit(userId, athleteId, tier, endpoint);

  if (!tierCheck.allowed) {
    return {
      allowed: false,
      remaining: tierCheck.remaining,
      resetAt: tierCheck.resetAt,
      reason: `User tier limit exceeded (${tier})`,
    };
  }

  // Check provider-specific limits
  const providerCheck = await checkProviderRateLimit(provider, athleteId);

  if (!providerCheck.allowed) {
    // Return the most restrictive limit
    return {
      allowed: false,
      remaining: Math.min(...Object.values(providerCheck.remaining)),
      resetAt: Math.min(...Object.values(providerCheck.resetAt)),
      reason: providerCheck.reason,
    };
  }

  // Both checks pass
  return {
    allowed: true,
    remaining: tierCheck.remaining,
    resetAt: tierCheck.resetAt,
  };
}

/**
 * Track Strava API calls to avoid hitting their rate limits
 * Strava limits: 100 requests per 15 minutes, 1000 requests per day
 * @param athleteId - Athlete ID
 * @returns Whether the call is allowed
 * @deprecated Use checkProviderRateLimit('strava', athleteId) instead
 */
export async function trackStravaCall(athleteId: string): Promise<boolean> {
  // Use the new provider-aware rate limiting
  return trackStravaCallNew(athleteId);
}
