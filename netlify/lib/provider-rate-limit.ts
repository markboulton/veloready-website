import { Redis } from '@upstash/redis';
import { ENV } from './env';

// Initialize Redis client
const redis = new Redis({
  url: ENV.REDIS_URL,
  token: ENV.REDIS_TOKEN,
});

/**
 * Provider-specific rate limit configurations
 * Each external API has different rate limits that must be respected
 */
export interface ProviderRateLimitConfig {
  provider: string;
  maxRequestsPer15Min?: number;
  maxRequestsPerHour?: number;
  maxRequestsPerDay?: number;
}

/**
 * Rate limit configurations for all supported providers
 */
export const PROVIDER_RATE_LIMITS: Record<string, ProviderRateLimitConfig> = {
  strava: {
    provider: 'strava',
    maxRequestsPer15Min: 100,  // Official Strava limit
    maxRequestsPerDay: 1000,   // Official Strava limit
  },
  intervalsICU: {
    provider: 'intervalsICU',
    maxRequestsPer15Min: 100,  // Conservative estimate
    maxRequestsPerHour: 200,   // Conservative estimate
    maxRequestsPerDay: 2000,   // Conservative estimate
  },
  appleHealth: {
    provider: 'appleHealth',
    // No rate limits - local on-device API
  },
  // Future providers:
  // wahoo: {
  //   provider: 'wahoo',
  //   maxRequestsPer15Min: 60,
  //   maxRequestsPerHour: 200,
  //   maxRequestsPerDay: 1440,
  // },
  // garmin: {
  //   provider: 'garmin',
  //   maxRequestsPer15Min: 250,
  //   maxRequestsPerHour: 1000,
  //   maxRequestsPerDay: 10000,
  // },
};

/**
 * Rate limit window types
 */
export enum RateLimitWindow {
  FifteenMinute = '15min',
  Hourly = 'hour',
  Daily = 'day',
}

/**
 * Get window duration in seconds
 */
function getWindowDuration(window: RateLimitWindow): number {
  switch (window) {
    case RateLimitWindow.FifteenMinute:
      return 900; // 15 minutes
    case RateLimitWindow.Hourly:
      return 3600; // 1 hour
    case RateLimitWindow.Daily:
      return 86400; // 24 hours
  }
}

/**
 * Calculate current window ID
 */
function getCurrentWindow(window: RateLimitWindow): number {
  const now = Date.now();
  const duration = getWindowDuration(window) * 1000; // Convert to milliseconds
  return Math.floor(now / duration);
}

/**
 * Check provider-specific rate limits
 * @param provider - Provider name (e.g., 'strava', 'intervalsICU')
 * @param athleteId - Athlete ID for tracking
 * @returns Rate limit status
 */
export async function checkProviderRateLimit(
  provider: string,
  athleteId: string
): Promise<{
  allowed: boolean;
  remaining: { [key: string]: number };
  resetAt: { [key: string]: number };
  reason?: string;
}> {
  const config = PROVIDER_RATE_LIMITS[provider];

  // If no config, provider doesn't exist
  if (!config) {
    console.warn(`[ProviderRateLimit] Unknown provider: ${provider}`);
    return {
      allowed: false,
      remaining: {},
      resetAt: {},
      reason: `Unknown provider: ${provider}`,
    };
  }

  // If no rate limits configured (e.g., HealthKit), allow all requests
  if (
    !config.maxRequestsPer15Min &&
    !config.maxRequestsPerHour &&
    !config.maxRequestsPerDay
  ) {
    return {
      allowed: true,
      remaining: {},
      resetAt: {},
    };
  }

  const remaining: { [key: string]: number } = {};
  const resetAt: { [key: string]: number } = {};
  const violations: string[] = [];

  // Check 15-minute window if configured
  if (config.maxRequestsPer15Min) {
    const window = RateLimitWindow.FifteenMinute;
    const windowId = getCurrentWindow(window);
    const key = `rate_limit:${provider}:${athleteId}:${window}:${windowId}`;

    const count = await redis.incr(key);

    // Set expiry on first request
    if (count === 1) {
      await redis.expire(key, getWindowDuration(window));
    }

    remaining['15min'] = Math.max(0, config.maxRequestsPer15Min - count);
    resetAt['15min'] = (windowId + 1) * getWindowDuration(window) * 1000;

    if (count > config.maxRequestsPer15Min) {
      violations.push(`15min: ${count}/${config.maxRequestsPer15Min}`);
    }
  }

  // Check hourly window if configured
  if (config.maxRequestsPerHour) {
    const window = RateLimitWindow.Hourly;
    const windowId = getCurrentWindow(window);
    const key = `rate_limit:${provider}:${athleteId}:${window}:${windowId}`;

    const count = await redis.incr(key);

    // Set expiry on first request
    if (count === 1) {
      await redis.expire(key, getWindowDuration(window));
    }

    remaining['hour'] = Math.max(0, config.maxRequestsPerHour - count);
    resetAt['hour'] = (windowId + 1) * getWindowDuration(window) * 1000;

    if (count > config.maxRequestsPerHour) {
      violations.push(`hour: ${count}/${config.maxRequestsPerHour}`);
    }
  }

  // Check daily window if configured
  if (config.maxRequestsPerDay) {
    const window = RateLimitWindow.Daily;
    const windowId = getCurrentWindow(window);
    const key = `rate_limit:${provider}:${athleteId}:${window}:${windowId}`;

    const count = await redis.incr(key);

    // Set expiry on first request
    if (count === 1) {
      await redis.expire(key, getWindowDuration(window));
    }

    remaining['day'] = Math.max(0, config.maxRequestsPerDay - count);
    resetAt['day'] = (windowId + 1) * getWindowDuration(window) * 1000;

    if (count > config.maxRequestsPerDay) {
      violations.push(`day: ${count}/${config.maxRequestsPerDay}`);
    }
  }

  // If any window is violated, deny the request
  if (violations.length > 0) {
    const reason = `Rate limit exceeded for ${provider}: ${violations.join(', ')}`;
    console.warn(`[ProviderRateLimit] ${reason}`);

    return {
      allowed: false,
      remaining,
      resetAt,
      reason,
    };
  }

  // Track aggregate metrics for monitoring
  await trackAggregateMetrics(provider);

  console.log(
    `[ProviderRateLimit] Allowed request for ${provider} (athleteId=${athleteId}), remaining:`,
    remaining
  );

  return {
    allowed: true,
    remaining,
    resetAt,
  };
}

/**
 * Track aggregate metrics across all users for monitoring
 */
async function trackAggregateMetrics(provider: string): Promise<void> {
  const config = PROVIDER_RATE_LIMITS[provider];

  // Track 15-minute totals
  if (config.maxRequestsPer15Min) {
    const windowId = getCurrentWindow(RateLimitWindow.FifteenMinute);
    const key = `rate_limit:${provider}:total:15min:${windowId}`;
    await redis.incr(key);
    await redis.expire(key, getWindowDuration(RateLimitWindow.FifteenMinute));
  }

  // Track hourly totals
  if (config.maxRequestsPerHour) {
    const windowId = getCurrentWindow(RateLimitWindow.Hourly);
    const key = `rate_limit:${provider}:total:hour:${windowId}`;
    await redis.incr(key);
    await redis.expire(key, getWindowDuration(RateLimitWindow.Hourly));
  }

  // Track daily totals
  if (config.maxRequestsPerDay) {
    const windowId = getCurrentWindow(RateLimitWindow.Daily);
    const key = `rate_limit:${provider}:total:day:${windowId}`;
    await redis.incr(key);
    await redis.expire(key, getWindowDuration(RateLimitWindow.Daily));
  }
}

/**
 * Get current rate limit status for a provider (for monitoring)
 */
export async function getProviderRateLimitStatus(
  provider: string,
  athleteId: string
): Promise<{
  provider: string;
  current: { [key: string]: number };
  max: { [key: string]: number };
  remaining: { [key: string]: number };
}> {
  const config = PROVIDER_RATE_LIMITS[provider];

  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const current: { [key: string]: number } = {};
  const max: { [key: string]: number } = {};
  const remaining: { [key: string]: number } = {};

  // Get 15-minute status
  if (config.maxRequestsPer15Min) {
    const window = RateLimitWindow.FifteenMinute;
    const windowId = getCurrentWindow(window);
    const key = `rate_limit:${provider}:${athleteId}:${window}:${windowId}`;

    const count = (await redis.get(key)) || 0;
    current['15min'] = Number(count);
    max['15min'] = config.maxRequestsPer15Min;
    remaining['15min'] = Math.max(0, config.maxRequestsPer15Min - Number(count));
  }

  // Get hourly status
  if (config.maxRequestsPerHour) {
    const window = RateLimitWindow.Hourly;
    const windowId = getCurrentWindow(window);
    const key = `rate_limit:${provider}:${athleteId}:${window}:${windowId}`;

    const count = (await redis.get(key)) || 0;
    current['hour'] = Number(count);
    max['hour'] = config.maxRequestsPerHour;
    remaining['hour'] = Math.max(0, config.maxRequestsPerHour - Number(count));
  }

  // Get daily status
  if (config.maxRequestsPerDay) {
    const window = RateLimitWindow.Daily;
    const windowId = getCurrentWindow(window);
    const key = `rate_limit:${provider}:${athleteId}:${window}:${windowId}`;

    const count = (await redis.get(key)) || 0;
    current['day'] = Number(count);
    max['day'] = config.maxRequestsPerDay;
    remaining['day'] = Math.max(0, config.maxRequestsPerDay - Number(count));
  }

  return {
    provider,
    current,
    max,
    remaining,
  };
}

/**
 * LEGACY: Track Strava API calls (for backwards compatibility)
 * Use checkProviderRateLimit instead for new code
 */
export async function trackStravaCall(athleteId: string): Promise<boolean> {
  const result = await checkProviderRateLimit('strava', athleteId);
  return result.allowed;
}

